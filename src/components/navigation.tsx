 'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { 
  Menu, 
  X, 
  Globe, 
  MapPin, 
  Users, 
  Shield, 
  Settings,
  LogIn,
  UserPlus,
  Heart,
  AlertTriangle,
  MessageCircle,
  Bell,
  LayoutDashboard
  ,
  Check,
  X as XIcon,
  UserCheck,
  Activity,
  Briefcase,
  User,
  ShieldCheck
} from 'lucide-react'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'
import { fetchUnreadCount, subscribeToIncomingMessages, markAllAsRead, getPendingFamilyRequests, approveFamilyRequest, rejectFamilyRequest } from '@/services/family'
import { getNotifications, subscribeToNotifications, NotificationRecord, markNotificationRead, markAllNotificationsRead, createNotification, deleteNotification, deleteAllNotifications, deleteNotificationsByRequestId } from '@/services/notifications'
import { respondToSafetyCheck } from '@/services/family'
import { supabase } from '@/lib/supabase'

const userNavigation = [
  { name: 'profile', href: '/profile', icon: Users, labelKey: 'nav.profile' },
]

const adminNavigation = [
  { name: 'admin', href: '/admin', icon: Settings, labelKey: 'nav.admin' },
]

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const { t, language, setLanguage } = useLanguage()
  const { user, logout, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [channel, setChannel] = useState<any | null>(null)
  // Local notification state
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [processingRequest, setProcessingRequest] = useState<{ id: string; action: 'accept' | 'decline' } | null>(null)
  // Track deleted notification IDs to prevent re-adding (using refs so they're accessible in closures)
  const deletedNotificationIdsRef = useRef<Set<string>>(new Set())
  const deletedRequestIdsRef = useRef<Set<string>>(new Set())
  // Also keep state versions for useEffect dependencies
  const [deletedNotificationIds, setDeletedNotificationIds] = useState<Set<string>>(new Set())
  const [deletedRequestIds, setDeletedRequestIds] = useState<Set<string>>(new Set())
  // Track accepted requests to show "You have accepted the request" message
  const [acceptedRequests, setAcceptedRequests] = useState<Map<string, any>>(new Map())

  const userLabel = user?.role ?? (user?.isAdmin ? 'admin' : user?.accountType)
  const notificationRecipientType = user?.isOrg ? 'organization' as const : 'user' as const

  // Dynamic navigation based on authentication status
  const getNavigationItems = () => {
    if (isAuthenticated) {
      // Logged in: Map and Dashboard (dashboard route depends on account type/admin)
      const dashboardHref = user?.isAdmin ? '/admin' : (user?.isOrg ? '/organization' : '/dashboard')
      return [
        { name: 'map', href: '/', icon: MapPin, labelKey: 'nav.map' },
        { name: 'dashboard', href: dashboardHref, icon: LayoutDashboard, labelKey: 'nav.dashboard' },
      ]
    } else {
      // Not logged in: Map and Recent Alerts
      return [
        { name: 'map', href: '/', icon: MapPin, labelKey: 'nav.map' },
        { name: 'alerts', href: '/alerts', icon: Bell, labelKey: 'nav.recentAlerts' },
      ]
    }
  }

  const navigation = getNavigationItems()

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  const handleLanguageToggle = () => {
    setLanguage(language === 'en' ? 'my' : 'en')
  }

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  useEffect(() => {
    let sub: any
    if (!isAuthenticated || !user?.id) {
      setUnreadCount(0)
      setPendingRequests([])
      setAcceptedRequests(new Map())
      return
    }

    const init = async () => {
      try {
        const count = await fetchUnreadCount(user.id)
        setUnreadCount(count ?? 0)
        
        // Load pending family requests (may fail if table doesn't exist yet)
        let loadedRequests: any[] = []
        try {
          loadedRequests = await getPendingFamilyRequests(user.id)
          setPendingRequests(loadedRequests || [])
        } catch (reqErr) {
          console.warn('Could not load family requests - table may not exist yet:', reqErr)
          setPendingRequests([])
        }
        
        // Subscribe to new messages
        sub = subscribeToIncomingMessages(user.id, (msg: any) => {
          setUnreadCount((c) => c + 1)
        })
        
        // Subscribe to family requests changes (may fail if table doesn't exist)
        try {
          const requestChannel = supabase
            .channel(`family_requests:${user.id}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'family_requests',
                filter: `to_user_id=eq.${user.id}`,
              },
              async (payload) => {
                console.log('New family request received', payload)
                const requests = await getPendingFamilyRequests(user.id)
                setPendingRequests(requests || [])
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'DELETE',
                schema: 'public',
                table: 'family_requests',
                filter: `to_user_id=eq.${user.id}`,
              },
              async (payload) => {
                console.log('Family request deleted', payload)
                const deletedRequestId = payload.old.id
                // Mark this request as deleted to prevent re-adding notifications for it
                setDeletedRequestIds((prev) => {
                  const newSet = new Set([...prev, deletedRequestId])
                  deletedRequestIdsRef.current = newSet
                  return newSet
                })
                // Remove from pending requests list
                setPendingRequests((prev) => prev.filter((req: any) => req.id !== deletedRequestId))
                // Also filter out family_request notifications for this request and mark them as deleted
                setNotifications((prev) => {
                  const notificationsToDelete = prev
                    .filter((n: any) => n.type === 'family_request' && n.payload?.request_id === deletedRequestId)
                    .map((n) => n.id)
                  
                  if (notificationsToDelete.length > 0) {
                    setDeletedNotificationIds((prevIds) => {
                      const newSet = new Set([...prevIds, ...notificationsToDelete])
                      deletedNotificationIdsRef.current = newSet
                      return newSet
                    })
                  }
                  
                  return prev.filter((n: any) => {
                    if (n.type === 'family_request' && n.payload?.request_id === deletedRequestId) {
                      return false
                    }
                    return true
                  })
                })
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'family_requests',
                filter: `to_user_id=eq.${user.id}`,
              },
              async (payload) => {
                console.log('Family request updated', payload)
                const updatedRequest = payload.new as any
                const oldRequest = payload.old as any
                
                // Refresh pending requests list first
                const requests = await getPendingFamilyRequests(user.id)
                const newPendingRequestIds = new Set((requests || []).map((req: any) => req.id))
                
                // If the request status changed to 'approved', move it to acceptedRequests
                if (updatedRequest.status === 'approved' && oldRequest.status === 'pending') {
                  const requestId = updatedRequest.id
                  
                  // CRITICAL: Mark this request as deleted IMMEDIATELY to prevent re-adding notifications
                  setDeletedRequestIds((prev) => {
                    const newSet = new Set([...prev, requestId])
                    deletedRequestIdsRef.current = newSet
                    console.log(`[UPDATE handler] Marked request ${requestId} as deleted in refs`)
                    return newSet
                  })
                  
                  // CRITICAL: Remove any family_request notifications for this request IMMEDIATELY
                  // This must happen BEFORE updating pendingRequests to prevent race conditions
                  setNotifications((prev) => {
                    const filtered = prev.filter((n: any) => {
                      // Remove if it's a family_request notification for this request
                      if (n.type === 'family_request' && n.payload?.request_id === requestId) {
                        console.log(`[UPDATE handler] Removing notification ${n.id} for approved request ${requestId}`)
                        // Mark notification as deleted
                        setDeletedNotificationIds((prevIds) => {
                          const newSet = new Set([...prevIds, n.id])
                          deletedNotificationIdsRef.current = newSet
                          return newSet
                        })
                        return false
                      }
                      // Remove deleted notification IDs
                      if (deletedNotificationIdsRef.current.has(n.id)) {
                        return false
                      }
                      // Filter out family_request notifications for deleted requests
                      if (n.type === 'family_request' && n.payload?.request_id && deletedRequestIdsRef.current.has(n.payload.request_id)) {
                        return false
                      }
                      return true
                    })
                    
                    // Only update if filtering changed something
                    if (filtered.length !== prev.length || filtered.some((n, i) => n.id !== prev[i]?.id)) {
                      console.log(`[UPDATE handler] Filtered notifications: ${prev.length} -> ${filtered.length}`)
                      return filtered
                    }
                    return prev
                  })
                  
                  // Check if we have this request in pendingRequests (before refresh)
                  setPendingRequests((prev) => {
                    const requestInPending = prev.find((req: any) => req.id === requestId)
                    if (requestInPending && !newPendingRequestIds.has(requestId)) {
                      // Move it to acceptedRequests only if it's not in the refreshed list
                      setAcceptedRequests((prevAccepted) => {
                        const newMap = new Map(prevAccepted)
                        // Only add if not already in acceptedRequests
                        if (!newMap.has(requestId)) {
                          newMap.set(requestId, { ...requestInPending, acceptedAt: new Date().toISOString() })
                        }
                        return newMap
                      })
                    }
                    // Return the refreshed list (which excludes the approved request)
                    return requests || []
                  })
                } else {
                  // Just refresh pending requests
                  setPendingRequests(requests || [])
                  
                  // Filter out family_request notifications that no longer have pending requests
                  const pendingRequestIds = new Set((requests || []).map((req: any) => req.id))
                  setNotifications((prev) => {
                    const filtered = prev.filter((n: any) => {
                      // Remove deleted notification IDs
                      if (deletedNotificationIdsRef.current.has(n.id)) {
                        return false
                      }
                      // Filter out family_request notifications for deleted requests
                      if (n.type === 'family_request' && n.payload?.request_id && deletedRequestIdsRef.current.has(n.payload.request_id)) {
                        return false
                      }
                      // Filter out family_request notifications that no longer have pending requests
                      if (n.type === 'family_request' && n.payload?.request_id) {
                        if (!pendingRequestIds.has(n.payload.request_id)) {
                          // Mark this request as deleted if it's no longer pending
                          const requestId = n.payload.request_id
                          setDeletedRequestIds((prevIds) => {
                            if (!prevIds.has(requestId)) {
                              const newSet = new Set([...prevIds, requestId])
                              deletedRequestIdsRef.current = newSet
                              return newSet
                            }
                            return prevIds
                          })
                          // Mark this notification as deleted
                          setDeletedNotificationIds((prevIds) => {
                            if (!prevIds.has(n.id)) {
                              const newSet = new Set([...prevIds, n.id])
                              deletedNotificationIdsRef.current = newSet
                              return newSet
                            }
                            return prevIds
                          })
                          return false
                        }
                      }
                      return true
                    })
                    // Only update if filtering changed something
                    if (filtered.length !== prev.length || filtered.some((n, i) => n.id !== prev[i]?.id)) {
                      return filtered
                    }
                    return prev
                  })
                }
              }
            )
            .subscribe()
        } catch (channelErr) {
          console.warn('Could not subscribe to family_requests channel:', channelErr)
        }
        
        // Load existing notifications
        try {
          const existing = await getNotifications(user.id, { recipientType: notificationRecipientType })
          // Filter out family_request notifications that don't have a corresponding pending request
          // Use loadedRequests instead of pendingRequests state to ensure we have the latest data
          const pendingRequestIds = new Set((loadedRequests || []).map((req: any) => req.id))
          const filteredNotifications = existing.filter((n: any) => {
            // Skip deleted notification IDs
            if (deletedNotificationIdsRef.current.has(n.id)) {
              return false
            }
            
            // CRITICAL: Filter out ALL family_request notifications from the notifications list
            // They should only appear in the Family Requests section, not in the notifications list
            if (n.type === 'family_request') {
              // Mark notification as deleted to prevent re-adding
              setDeletedNotificationIds((prev) => {
                const newSet = new Set([...prev, n.id])
                deletedNotificationIdsRef.current = newSet
                return newSet
              })
              return false
            }
            
            // Keep all other notifications
            return true
          })
          setNotifications(filteredNotifications)
          console.log(`Initial load: filtered ${existing.length} notifications to ${filteredNotifications.length}`)
          // Polling fallback to ensure UI stays in sync if realtime misses
          const pollInterval = setInterval(async () => {
            try {
              const refreshed = await getNotifications(user.id, { recipientType: notificationRecipientType })
              // Get current pending requests to filter notifications
              const currentRequests = await getPendingFamilyRequests(user.id)
              const currentPendingRequestIds = new Set((currentRequests || []).map((req: any) => req.id))
              
              // Filter notifications FIRST before merging - remove deleted and invalid ones
              const filteredRefreshed = refreshed.filter((r: any) => {
                // Skip deleted notification IDs
                if (deletedNotificationIdsRef.current.has(r.id)) {
                  return false
                }
                
                // CRITICAL: Filter out ALL family_request notifications from the notifications list
                // They should only appear in the Family Requests section, not in the notifications list
                if (r.type === 'family_request') {
                  // Mark notification as deleted to prevent re-adding
                  setDeletedNotificationIds((prev) => {
                    const newSet = new Set([...prev, r.id])
                    deletedNotificationIdsRef.current = newSet
                    return newSet
                  })
                  return false
                }
                
                return true
              })
              
              // Merge: add any new by id, keep existing read states, but filter out deleted ones
              setNotifications(prev => {
                // Start with existing notifications that are not deleted
                const validPrev = prev.filter((n: any) => {
                  // Remove deleted notification IDs
                  if (deletedNotificationIdsRef.current.has(n.id)) {
                    return false
                  }
                  // CRITICAL: Filter out ALL family_request notifications from the notifications list
                  // They should only appear in the Family Requests section, not in the notifications list
                  if (n.type === 'family_request') {
                    return false
                  }
                  return true
                })
                
                // Create a map of valid previous notifications
                const map = new Map(validPrev.map(p => [p.id, p]))
                
                // Add/update filtered refreshed notifications
                for (const r of filteredRefreshed) {
                  // Double-check it's not deleted (in case state changed)
                  if (deletedNotificationIdsRef.current.has(r.id)) {
                    continue
                  }
                  // Double-check it's not a family_request notification
                  if (r.type === 'family_request') {
                    continue
                  }
                  
                  // Update or add notification
                  if (map.has(r.id)) {
                    // Update existing, preserve read state if needed
                    const existing = map.get(r.id)!
                    map.set(r.id, { ...r, read: existing.read || r.read })
                  } else {
                    // Add new
                    map.set(r.id, r)
                  }
                }
                
                // Return sorted list
                return Array.from(map.values()).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              })
            } catch (err) {
              console.error('error in polling interval', err)
            }
          }, 10000)
          // attach for cleanup
          setChannel((c:any) => ({ ...(c||{}), pollInterval }))
        } catch (e) {
          console.warn('failed to load notifications', e)
        }

        // Subscribe to notifications realtime
        try {
          const notifChannel = subscribeToNotifications(
            user.id,
            (n) => {
              console.log(`[Real-time INSERT] Received notification ${n.id} of type ${n.type}`)
              
              // CRITICAL: Check if notification ID is deleted FIRST (before any other checks)
              if (deletedNotificationIdsRef.current.has(n.id)) {
                console.log(`[Real-time INSERT] Skipping deleted notification ${n.id}`)
                return
              }
              
              // CRITICAL: Filter out ALL family_request notifications from the notifications list
              // They should only appear in the Family Requests section, not in the notifications list
              if (n.type === 'family_request') {
                console.log(`[Real-time INSERT] Skipping family_request notification ${n.id} - should only appear in Family Requests section`)
                // Mark notification as deleted to prevent re-adding
                setDeletedNotificationIds((prev) => {
                  const newSet = new Set([...prev, n.id])
                  deletedNotificationIdsRef.current = newSet
                  return newSet
                })
                // Remove from notifications if it exists
                setNotifications((prev) => {
                  const filtered = prev.filter((notif) => notif.id !== n.id)
                  if (filtered.length !== prev.length) {
                    console.log(`[Real-time INSERT] Removed family_request notification ${n.id} from state`)
                  }
                  return filtered
                })
                return
              }
              
              // For non-family_request notifications, add directly if not deleted
              console.log(`[Real-time INSERT] Adding non-family_request notification ${n.id}`)
              setNotifications((prev) => {
                // Double-check in case state changed
                if (deletedNotificationIdsRef.current.has(n.id)) {
                  console.log(`[Real-time INSERT] Notification ${n.id} is marked as deleted, skipping`)
                  return prev
                }
                
                // Check if notification already exists to avoid duplicates
                const exists = prev.some(notif => notif.id === n.id)
                if (exists) {
                  // Update existing notification only if not deleted
                  return prev.map(notif => notif.id === n.id ? n : notif)
                }
                // Add new notification at the beginning
                return [n, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              })
            },
            {
              recipientType: notificationRecipientType,
              onDelete: (notificationId) => {
                console.log(`[Real-time DELETE] Notification ${notificationId} deleted from database`)
                // Notification deleted - remove from list and mark as deleted
                setDeletedNotificationIds((prev) => {
                  const newSet = new Set([...prev, notificationId])
                  deletedNotificationIdsRef.current = newSet
                  console.log(`[Real-time DELETE] Marked notification ${notificationId} as deleted in refs`)
                  return newSet
                })
                setNotifications((prev) => {
                  const filtered = prev.filter((n) => n.id !== notificationId)
                  if (filtered.length !== prev.length) {
                    console.log(`[Real-time DELETE] Removed notification ${notificationId} from state`)
                  }
                  return filtered
                })
              },
              onUpdate: (n) => {
                // Notification updated (e.g., marked as read) - update in list only if not deleted
                if (!deletedNotificationIdsRef.current.has(n.id)) {
                  setNotifications((prev) => prev.map(notif => notif.id === n.id ? n : notif))
                }
              }
            }
          )
          setChannel({ messages: sub, notifications: notifChannel })
        } catch (e) {
          console.warn('failed to subscribe notifications', e)
          setChannel(sub)
        }
      } catch (err: any) {
        // Improve logging for Supabase errors which can be plain objects
        console.error('failed to init message subscription', {
          message: err?.message ?? String(err),
          details: err?.details ?? (err as any)?.hint ?? null,
          raw: err
        })
      }
    }

    init()

    return () => {
      try {
        if (sub && sub.unsubscribe) sub.unsubscribe()
      } catch (e) {
        // ignore
      }
      try {
        // Also unsubscribe notifications channel if present
        const notifChannel = (channel as any)?.notifications
        if (notifChannel && typeof notifChannel.unsubscribe === 'function') {
          notifChannel.unsubscribe()
        }
      } catch (e) {
        // ignore
      }
      try {
        const pollInterval = (channel as any)?.pollInterval
        if (pollInterval) clearInterval(pollInterval)
      } catch {}
    }
  }, [isAuthenticated, user?.id])

  // Filter out family_request notifications that don't have a corresponding pending request
  // This ensures notifications stay in sync with pendingRequests
  useEffect(() => {
    if (!user?.id) {
      return
    }
    
    setNotifications((prev) => {
      let filtered = prev.filter((n: any) => {
        // Always remove deleted notification IDs (check both state and ref)
        if (deletedNotificationIds.has(n.id) || deletedNotificationIdsRef.current.has(n.id)) {
          // Ensure it's in both state and ref
          if (!deletedNotificationIdsRef.current.has(n.id)) {
            deletedNotificationIdsRef.current.add(n.id)
          }
          return false
        }
        
        // Filter out family_request notifications for deleted requests (check both state and ref)
        if (n.type === 'family_request' && n.payload?.request_id) {
          if (deletedRequestIds.has(n.payload.request_id) || deletedRequestIdsRef.current.has(n.payload.request_id)) {
            // Ensure it's in both state and ref
            if (!deletedRequestIdsRef.current.has(n.payload.request_id)) {
              deletedRequestIdsRef.current.add(n.payload.request_id)
            }
            // Also mark notification as deleted
            if (!deletedNotificationIdsRef.current.has(n.id)) {
              setDeletedNotificationIds((prevIds) => {
                const newSet = new Set([...prevIds, n.id])
                deletedNotificationIdsRef.current = newSet
                return newSet
              })
            }
            return false
          }
        }
        
        // If no pending requests, filter out all family_request notifications
        if (pendingRequests.length === 0) {
          if (n.type === 'family_request') {
            // Mark notification as deleted
            if (!deletedNotificationIdsRef.current.has(n.id)) {
              setDeletedNotificationIds((prevIds) => {
                const newSet = new Set([...prevIds, n.id])
                deletedNotificationIdsRef.current = newSet
                return newSet
              })
            }
            return false
          }
        } else {
          // Filter notifications based on current pendingRequests
          if (n.type === 'family_request' && n.payload?.request_id) {
            const pendingRequestIds = new Set(pendingRequests.map((req: any) => req.id))
            // Only keep family_request notifications if they have a corresponding pending request
            if (!pendingRequestIds.has(n.payload.request_id)) {
              // Request is no longer pending, mark as deleted
              if (!deletedRequestIdsRef.current.has(n.payload.request_id)) {
                setDeletedRequestIds((prevIds) => {
                  const newSet = new Set([...prevIds, n.payload.request_id])
                  deletedRequestIdsRef.current = newSet
                  return newSet
                })
              }
              if (!deletedNotificationIdsRef.current.has(n.id)) {
                setDeletedNotificationIds((prevIds) => {
                  const newSet = new Set([...prevIds, n.id])
                  deletedNotificationIdsRef.current = newSet
                  return newSet
                })
              }
              return false
            }
          }
        }
        
        // Keep all other notifications
        return true
      })
      
      // Only update if filtering changed something to avoid infinite loops
      if (filtered.length !== prev.length || filtered.some((n, i) => n.id !== prev[i]?.id)) {
        return filtered
      }
      return prev
    })
  }, [pendingRequests, deletedNotificationIds, deletedRequestIds, user?.id])

  // ----- Notification helpers (copied from navigation1) -----
  const handleApproveMockRequest = async (notificationId: string) => {
    // For job notifications, mark as read when approved
    try {
      await markNotificationRead(notificationId)
      setNotifications((prev) => prev.map((n) => n.id === notificationId ? { ...n, read: true } : n))
    } catch (e) {
      console.error('mark read failed', e)
    }
  }

  const handleRejectMockRequest = async (notificationId: string) => {
    // For job notifications, mark as read when rejected
    try {
      await markNotificationRead(notificationId)
      setNotifications((prev) => prev.map((n) => n.id === notificationId ? { ...n, read: true } : n))
    } catch (e) {
      console.error('mark read failed', e)
    }
  }

  const handleSafeResponse = async (notificationId: string) => {
    try {
      const n = notifications.find(x => x.id === notificationId)
      const payload: any = n?.payload || {}
      // Notify original sender that receiver is safe
      if (payload.from_user_id && user?.id) {
        // Persist safety status server-side
        await respondToSafetyCheck(user.id, payload.from_user_id, 'safe')
        await createNotification({
          userId: payload.from_user_id,
          type: 'safety_check_ok',
          title: 'Safety confirmed',
          body: `${user?.name || 'They'} confirmed they are safe`,
          payload: { responder_id: user.id, relation: payload.relation }
        })
      }
      await markNotificationRead(notificationId)
      setNotifications((prev) => prev.map((n) => n.id === notificationId ? { ...n, read: true } : n))
    } catch (e) {
      console.error('safe response failed', e)
    }
  }

  const handleNotSafeResponse = async (notificationId: string) => {
    try {
      const n = notifications.find(x => x.id === notificationId)
      const payload: any = n?.payload || {}
      if (payload.from_user_id && user?.id) {
        await respondToSafetyCheck(user.id, payload.from_user_id, 'danger')
        await createNotification({
          userId: payload.from_user_id,
          type: 'safety_check_not_ok',
          title: 'Needs help',
          body: `${user?.name || 'They'} indicated they are not safe`,
          payload: { responder_id: user.id, relation: payload.relation }
        })
      }
      await markNotificationRead(notificationId)
      setNotifications((prev) => prev.map((n) => n.id === notificationId ? { ...n, read: true } : n))
    } catch (e) {
      console.error('not safe response failed', e)
    }
  }

  const renderActionButtons = (notification: any) => {
    // Render based on buttonType when present (supports mapped NotificationRecord payloads)
    switch ((notification as any).buttonType) {
      case 'safety':
        return (
          <div className="flex gap-2 mt-3">
            <Button 
              size="sm" 
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
              onClick={() => handleSafeResponse(notification.id)}
              disabled={processingRequest?.id === notification.id}
            >
              {processingRequest?.id === notification.id ? (
                <div className="flex items-center">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  Processing...
                </div>
              ) : (
                <div className="flex items-center">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  Safe
                </div>
              )}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="border-red-200 text-red-600 hover:bg-red-50 text-xs"
              onClick={() => handleNotSafeResponse(notification.id)}
              disabled={processingRequest?.id === notification.id}
            >
              {processingRequest?.id === notification.id ? (
                <div className="flex items-center">
                  <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin mr-1" />
                  Processing...
                </div>
              ) : (
                <div className="flex items-center">
                  <XIcon className="w-3 h-3 mr-1" />
                  Not Safe
                </div>
              )}
            </Button>
          </div>
        )

      case 'job':
        return (
          <div className="flex gap-2 mt-3">
            <Button 
              size="sm" 
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
              onClick={() => handleApproveMockRequest(notification.id)}
              disabled={processingRequest?.id === notification.id}
            >
              {processingRequest?.id === notification.id ? (
                <div className="flex items-center">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  Accepting...
                </div>
              ) : (
                <div className="flex items-center">
                  <Check className="w-3 h-3 mr-1" />
                  Accept
                </div>
              )}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
              onClick={() => handleRejectMockRequest(notification.id)}
              disabled={processingRequest?.id === notification.id}
            >
              {processingRequest?.id === notification.id ? (
                <div className="flex items-center">
                  <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-1" />
                  Declining...
                </div>
              ) : (
                <div className="flex items-center">
                  <XIcon className="w-3 h-3 mr-1" />
                  Decline
                </div>
              )}
            </Button>
          </div>
        )

      // Removed 'family' case - family_request notifications are now only shown in the Family Requests section
      // They are filtered out from the notifications list above

      default:
        return null
    }
  }

  const handleApproveRequest = async (requestId: string) => {
    try {
      setProcessingRequest({ id: requestId, action: 'accept' })
      
      console.log(`[handleApproveRequest] Starting approval for request ${requestId}`)
      
      // Find the request to keep it for showing the accepted message
      const requestToAccept = pendingRequests.find((req: any) => req.id === requestId)
      
      // CRITICAL STEP 1: Mark this request as deleted FIRST to prevent re-adding notifications
      // This must happen BEFORE any async operations
      setDeletedRequestIds((prev) => {
        const newSet = new Set([...prev, requestId])
        deletedRequestIdsRef.current = newSet
        console.log(`[handleApproveRequest] Marked request ${requestId} as deleted in refs`)
        return newSet
      })
      
      // CRITICAL STEP 2: Find and mark ALL notification IDs to delete IMMEDIATELY
      // Check both current notifications state AND fetch from database to catch any missed ones
      let allNotificationIdsToDelete: string[] = []
      
      // First, get IDs from current notifications state
      const notificationsToDeleteFromState = notifications
        .filter((n) => n.type === 'family_request' && n.payload?.request_id === requestId)
        .map((n) => n.id)
      
      allNotificationIdsToDelete.push(...notificationsToDeleteFromState)
      
      // Also fetch from database to catch any that might not be in state
      if (user?.id) {
        try {
          const allNotificationsFromDb = await getNotifications(user.id, { recipientType: notificationRecipientType })
          const notificationsToDeleteFromDb = allNotificationsFromDb
            .filter((n: any) => n.type === 'family_request' && n.payload?.request_id === requestId)
            .map((n: any) => n.id)
          
          // Add any that weren't in state
          for (const id of notificationsToDeleteFromDb) {
            if (!allNotificationIdsToDelete.includes(id)) {
              allNotificationIdsToDelete.push(id)
            }
          }
        } catch (fetchErr) {
          console.warn('failed to fetch notifications for deletion', fetchErr)
        }
      }
      
      console.log(`[handleApproveRequest] Found ${allNotificationIdsToDelete.length} notification(s) to delete:`, allNotificationIdsToDelete)
      
      // Mark ALL found notification IDs as deleted IMMEDIATELY
      if (allNotificationIdsToDelete.length > 0) {
        setDeletedNotificationIds((prev) => {
          const newSet = new Set([...prev, ...allNotificationIdsToDelete])
          deletedNotificationIdsRef.current = newSet
          console.log(`[handleApproveRequest] Marked ${allNotificationIdsToDelete.length} notification(s) as deleted in refs`)
          return newSet
        })
      }
      
      // CRITICAL STEP 3: Remove from UI IMMEDIATELY to prevent flickering
      setNotifications((prev) => {
        const filtered = prev.filter((n) => {
          // Remove if it's a family_request notification with matching request_id
          if (n.type === 'family_request' && n.payload?.request_id === requestId) {
            return false
          }
          // Also remove if it's in the deleted IDs list
          if (allNotificationIdsToDelete.includes(n.id)) {
            return false
          }
          return true
        })
        console.log(`[handleApproveRequest] Removed notification from UI: ${prev.length} -> ${filtered.length}`)
        return filtered
      })
      
      // Remove from pendingRequests but add to acceptedRequests to show the message
      setPendingRequests((prev) => prev.filter((req: any) => req.id !== requestId))
      
      // Add to acceptedRequests to show "You have accepted the request" message
      if (requestToAccept) {
        setAcceptedRequests((prev) => {
          const newMap = new Map(prev)
          newMap.set(requestId, { ...requestToAccept, acceptedAt: new Date().toISOString() })
          return newMap
        })
      }
      
      // CRITICAL: FORCE DELETE notifications from database FIRST (before approving request)
      // This must complete and be verified before proceeding
      if (!user?.id) {
        console.error('[handleApproveRequest] No user ID, cannot delete notification')
        return
      }

      console.log(`[handleApproveRequest] FORCE DELETING notification for request ${requestId} from database...`)
      
      let deletedNotificationIds: string[] = []
      const maxDeletionAttempts = 5

      // Aggressive deletion with multiple strategies
      for (let attempt = 1; attempt <= maxDeletionAttempts; attempt++) {
        try {
          // Strategy 1: Delete by request_id
          const deleteResult = await deleteNotificationsByRequestId(user.id, requestId)

          if (deleteResult.success && deleteResult.deleted && deleteResult.deleted > 0 && deleteResult.notificationIds) {
            deletedNotificationIds = deleteResult.notificationIds
            console.log(`[handleApproveRequest] Successfully deleted ${deleteResult.deleted} notification(s):`, deletedNotificationIds)
          }

          // Strategy 2: Also fetch and delete directly by ID (backup)
          const allNotifications = await getNotifications(user.id, { recipientType: notificationRecipientType })
          const matchingNotifications = allNotifications.filter((n: any) => 
            n.type === 'family_request' && n.payload?.request_id === requestId
          )

          if (matchingNotifications.length > 0) {
            console.log(`[handleApproveRequest] Found ${matchingNotifications.length} notification(s) to delete directly (attempt ${attempt})`)
            for (const notif of matchingNotifications) {
              try {
                await deleteNotification(notif.id)
                if (!deletedNotificationIds.includes(notif.id)) {
                  deletedNotificationIds.push(notif.id)
                }
                console.log(`[handleApproveRequest] Directly deleted notification ${notif.id}`)
              } catch (delErr) {
                console.error(`[handleApproveRequest] Failed to delete notification ${notif.id}:`, delErr)
              }
            }
          }

          // Wait and verify deletion
          await new Promise(resolve => setTimeout(resolve, 300))
          const verifyNotifications = await getNotifications(user.id, { recipientType: notificationRecipientType })
          const stillExists = verifyNotifications.filter((n: any) => 
            n.type === 'family_request' && n.payload?.request_id === requestId
          )

          if (stillExists.length === 0) {
            console.log(`[handleApproveRequest] Verified: All notifications deleted after attempt ${attempt}`)
            break
          } else {
            console.warn(`[handleApproveRequest] ${stillExists.length} notification(s) still exist after attempt ${attempt}`)
          }

          // Wait before next attempt
          if (attempt < maxDeletionAttempts) {
            await new Promise(resolve => setTimeout(resolve, 400 * attempt))
          }
        } catch (err) {
          console.error(`[handleApproveRequest] Deletion attempt ${attempt} failed:`, err)
          if (attempt < maxDeletionAttempts) {
            await new Promise(resolve => setTimeout(resolve, 400 * attempt))
          }
        }
      }

      // Mark all deleted notification IDs in refs
      if (deletedNotificationIds.length > 0) {
        setDeletedNotificationIds((prev) => {
          const newSet = new Set([...prev, ...deletedNotificationIds])
          deletedNotificationIdsRef.current = newSet
          return newSet
        })
      }

      // Final aggressive check: If any notifications still exist, force delete them
      const finalCheck = await getNotifications(user.id, { recipientType: notificationRecipientType })
      const finalMatching = finalCheck.filter((n: any) => 
        n.type === 'family_request' && n.payload?.request_id === requestId
      )

      if (finalMatching.length > 0) {
        console.error(`[handleApproveRequest] CRITICAL: ${finalMatching.length} notification(s) STILL EXIST. Force deleting...`)
        for (const notif of finalMatching) {
          try {
            await deleteNotification(notif.id)
            if (!deletedNotificationIds.includes(notif.id)) {
              deletedNotificationIds.push(notif.id)
            }
            console.log(`[handleApproveRequest] Force deleted notification ${notif.id}`)
          } catch (err) {
            console.error(`[handleApproveRequest] Failed to force delete ${notif.id}:`, err)
          }
        }
        // Mark as deleted locally even if database deletion fails
        setDeletedNotificationIds((prev) => {
          const newSet = new Set([...prev, ...finalMatching.map((n: any) => n.id)])
          deletedNotificationIdsRef.current = newSet
          return newSet
        })
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // NOW approve the family request (after notifications are FORCE DELETED)
      await approveFamilyRequest(requestId)
      
      console.log(`[handleApproveRequest] Request ${requestId} approved, notification deleted from database`)
      
      console.log(`[handleApproveRequest] Request ${requestId} approved, notification should stay deleted`)
      
      // CRITICAL: Don't refresh notifications here - it will cause race conditions
      // The notification is already deleted and marked as deleted in refs
      // The real-time UPDATE event will refresh pendingRequests, but we don't want to refresh notifications
      // because it might re-add the notification if it still exists in the database
      
      // Just refresh pending requests list - request should be removed (status changed to approved)
      if (user?.id) {
        // Wait a bit to ensure request status update is processed
        await new Promise(resolve => setTimeout(resolve, 200))
        
        const requests = await getPendingFamilyRequests(user.id)
        setPendingRequests(requests || [])
        
        // Verify that notification is still marked as deleted
        console.log(`[handleApproveRequest] Verification: deletedNotificationIdsRef has ${Array.from(deletedNotificationIdsRef.current).length} IDs:`, Array.from(deletedNotificationIdsRef.current))
        console.log(`[handleApproveRequest] Verification: deletedRequestIdsRef has ${Array.from(deletedRequestIdsRef.current).length} IDs:`, Array.from(deletedRequestIdsRef.current))
        
        // DON'T refresh notifications here - it causes the notification to reappear
        // The notification is already deleted from UI and marked as deleted in refs
        // All refresh paths (polling, real-time) will filter it out based on deleted IDs and pending requests
        
        // Double-check that notification is not in state
        setNotifications((prev) => {
          const hasNotification = prev.some((n: any) => 
            n.type === 'family_request' && n.payload?.request_id === requestId
          )
          if (hasNotification) {
            console.warn(`[handleApproveRequest] WARNING: Notification for request ${requestId} still exists in state! Removing it.`)
            // Force remove any remaining notifications for this request
            const filtered = prev.filter((n: any) => {
              if (n.type === 'family_request' && n.payload?.request_id === requestId) {
                // Mark as deleted
                setDeletedNotificationIds((prevIds) => {
                  const newSet = new Set([...prevIds, n.id])
                  deletedNotificationIdsRef.current = newSet
                  return newSet
                })
                return false
              }
              return true
            })
            console.log(`[handleApproveRequest] Force removed notification: ${prev.length} -> ${filtered.length}`)
            return filtered
          }
          return prev
        })
      }
      
      // Clear the accepted request after 5 seconds (optional - you can remove this if you want it to persist)
      // setTimeout(() => {
      //   setAcceptedRequests((prev) => {
      //     const newMap = new Map(prev)
      //     newMap.delete(requestId)
      //     return newMap
      //   })
      // }, 5000)
    } catch (err) {
      console.error('approve request failed', err)
      // On error, reload both lists to restore correct state
      if (user?.id) {
        try {
          const requests = await getPendingFamilyRequests(user.id)
          setPendingRequests(requests || [])
          // Don't refresh notifications on error either - let the useEffect handle it
        } catch (refreshErr) {
          console.error('failed to refresh after error', refreshErr)
        }
      }
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    try {
      setProcessingRequest({ id: requestId, action: 'decline' })
      
      // Mark this request as deleted to prevent re-adding notifications for it
      setDeletedRequestIds((prev) => {
        const newSet = new Set([...prev, requestId])
        deletedRequestIdsRef.current = newSet
        return newSet
      })
      
      // Find and mark notification IDs to delete
      const notificationsToDelete = notifications
        .filter((n) => n.type === 'family_request' && n.payload?.request_id === requestId)
        .map((n) => n.id)
      
      if (notificationsToDelete.length > 0) {
        setDeletedNotificationIds((prev) => {
          const newSet = new Set([...prev, ...notificationsToDelete])
          deletedNotificationIdsRef.current = newSet
          return newSet
        })
      }
      
      // First, immediately remove from local state to update UI
      setNotifications((prev) => prev.filter((n) => {
        // Remove if it's a family_request notification with matching request_id
        if (n.type === 'family_request' && n.payload?.request_id === requestId) {
          return false
        }
        return true
      }))
      
      // Also remove from pendingRequests immediately
      setPendingRequests((prev) => prev.filter((req: any) => req.id !== requestId))
      
      // CRITICAL: FORCE DELETE notifications from database FIRST (before rejecting request)
      if (!user?.id) {
        console.error('[handleRejectRequest] No user ID, cannot delete notification')
        return
      }

      console.log(`[handleRejectRequest] FORCE DELETING notification for request ${requestId} from database...`)
      
      let deletedNotificationIds: string[] = []
      const maxDeletionAttempts = 5

      // Aggressive deletion with multiple strategies
      for (let attempt = 1; attempt <= maxDeletionAttempts; attempt++) {
        try {
          // Strategy 1: Delete by request_id
          const deleteResult = await deleteNotificationsByRequestId(user.id, requestId)

          if (deleteResult.success && deleteResult.deleted && deleteResult.deleted > 0 && deleteResult.notificationIds) {
            deletedNotificationIds = deleteResult.notificationIds
            console.log(`[handleRejectRequest] Successfully deleted ${deleteResult.deleted} notification(s):`, deletedNotificationIds)
          }

          // Strategy 2: Also fetch and delete directly by ID (backup)
          const allNotifications = await getNotifications(user.id, { recipientType: notificationRecipientType })
          const matchingNotifications = allNotifications.filter((n: any) => 
            n.type === 'family_request' && n.payload?.request_id === requestId
          )

          if (matchingNotifications.length > 0) {
            console.log(`[handleRejectRequest] Found ${matchingNotifications.length} notification(s) to delete directly (attempt ${attempt})`)
            for (const notif of matchingNotifications) {
              try {
                await deleteNotification(notif.id)
                if (!deletedNotificationIds.includes(notif.id)) {
                  deletedNotificationIds.push(notif.id)
                }
                console.log(`[handleRejectRequest] Directly deleted notification ${notif.id}`)
              } catch (delErr) {
                console.error(`[handleRejectRequest] Failed to delete notification ${notif.id}:`, delErr)
              }
            }
          }

          // Wait and verify deletion
          await new Promise(resolve => setTimeout(resolve, 300))
          const verifyNotifications = await getNotifications(user.id, { recipientType: notificationRecipientType })
          const stillExists = verifyNotifications.filter((n: any) => 
            n.type === 'family_request' && n.payload?.request_id === requestId
          )

          if (stillExists.length === 0) {
            console.log(`[handleRejectRequest] Verified: All notifications deleted after attempt ${attempt}`)
            break
          } else {
            console.warn(`[handleRejectRequest] ${stillExists.length} notification(s) still exist after attempt ${attempt}`)
          }

          // Wait before next attempt
          if (attempt < maxDeletionAttempts) {
            await new Promise(resolve => setTimeout(resolve, 400 * attempt))
          }
        } catch (err) {
          console.error(`[handleRejectRequest] Deletion attempt ${attempt} failed:`, err)
          if (attempt < maxDeletionAttempts) {
            await new Promise(resolve => setTimeout(resolve, 400 * attempt))
          }
        }
      }

      // Mark all deleted notification IDs in refs
      if (deletedNotificationIds.length > 0) {
        setDeletedNotificationIds((prev) => {
          const newSet = new Set([...prev, ...deletedNotificationIds])
          deletedNotificationIdsRef.current = newSet
          return newSet
        })
      }

      // Final aggressive check: If any notifications still exist, force delete them
      const finalCheck = await getNotifications(user.id, { recipientType: notificationRecipientType })
      const finalMatching = finalCheck.filter((n: any) => 
        n.type === 'family_request' && n.payload?.request_id === requestId
      )

      if (finalMatching.length > 0) {
        console.error(`[handleRejectRequest] CRITICAL: ${finalMatching.length} notification(s) STILL EXIST. Force deleting...`)
        for (const notif of finalMatching) {
          try {
            await deleteNotification(notif.id)
            if (!deletedNotificationIds.includes(notif.id)) {
              deletedNotificationIds.push(notif.id)
            }
            console.log(`[handleRejectRequest] Force deleted notification ${notif.id}`)
          } catch (err) {
            console.error(`[handleRejectRequest] Failed to force delete ${notif.id}:`, err)
          }
        }
        // Mark as deleted locally even if database deletion fails
        setDeletedNotificationIds((prev) => {
          const newSet = new Set([...prev, ...finalMatching.map((n: any) => n.id)])
          deletedNotificationIdsRef.current = newSet
          return newSet
        })
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // NOW reject the family request (after notifications are FORCE DELETED)
      await rejectFamilyRequest(requestId)
      
      console.log(`[handleRejectRequest] Request ${requestId} rejected, notification deleted from database`)
      
      // Refresh pending requests list only - don't refresh notifications to avoid race conditions
      // The real-time DELETE event and useEffect filtering will handle notification removal
      if (user?.id) {
        // Refresh pending requests list - request should be removed (deleted)
        const requests = await getPendingFamilyRequests(user.id)
        setPendingRequests(requests || [])
        // Note: We don't refresh notifications here to avoid re-adding deleted notifications
        // The useEffect will filter them out based on pendingRequests
      }
    } catch (err) {
      console.error('reject request failed', err)
      // On error, reload both lists to restore correct state
      if (user?.id) {
        try {
          const requests = await getPendingFamilyRequests(user.id)
          setPendingRequests(requests || [])
          // Don't refresh notifications on error either - let the useEffect handle it
        } catch (refreshErr) {
          console.error('failed to refresh after error', refreshErr)
        }
      }
    } finally {
      setProcessingRequest(null)
    }
  }


  return (
    <>
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
  <div className="max-w-360 mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <img 
                src="/rescura-logo.svg" 
                alt="Rescura" 
                className="h-16 w-auto"
              />
              <span className="text-xl font-bold text-gray-900">Rescura</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              )
            })}
          </div>

          {/* Right side items */}
          <div className="hidden md:flex items-center space-x-4">
            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLanguageToggle}
              className="flex items-center space-x-1"
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs">{language === 'en' ? 'EN' : 'မြန်'}</span>
            </Button>

            {/* Notifications only when authenticated */}
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="w-4 h-4" />
                    <span className="ml-1 text-xs">{t('notifications')}</span>
                    { (notifications.filter((n) => !n.read).length + pendingRequests.length) > 0 && (
                      <Badge variant="destructive" className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center text-xs">
                        {(notifications.filter((n) => !n.read).length + pendingRequests.length) > 99 ? '99+' : (notifications.filter((n) => !n.read).length + pendingRequests.length)}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-96 max-h-[480px] overflow-y-auto" align="end">
                  <div className="p-0">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg text-gray-900">Notification Center</h3>
                      {(notifications.filter((n) => !n.read).length + pendingRequests.length) > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {(notifications.filter((n) => !n.read).length + pendingRequests.length)} unread
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 h-6 hover:bg-red-50 text-red-600"
                            title="Delete all notifications"
                            onClick={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              if (!user?.id) return
                              try {
                                await deleteAllNotifications(user.id, { recipientType: notificationRecipientType })
                                setNotifications([])
                                setPendingRequests([])
                              } catch (err) {
                                console.error('delete all failed', err)
                              }
                            }}
                          >
                            <XIcon className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notifications List */}
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.filter((notification) => {
                      // Filter out deleted notification IDs
                      if (deletedNotificationIdsRef.current.has(notification.id)) {
                        return false
                      }
                      // CRITICAL: Filter out ALL family_request notifications from the notifications list
                      // They should only appear in the "Family Requests" section below
                      if (notification.type === 'family_request') {
                        return false
                      }
                      return true
                    }).map((notification) => {
                      // Map backend notification to UI shape (fallbacks for missing fields)
                      const payload = (notification.payload || {}) as any
                      const uiType = notification.type
                      // Determine icon & color by type
                      const iconMap: Record<string, any> = {
                        family_request: UserCheck,
                        family_request_accepted: Check,
                        family_request_rejected: XIcon,
                        safety_check: ShieldCheck,
                        job_offer: Briefcase,
                        family_verification: User,
                        activity_hosting: Activity,
                      }
                      const colorMap: Record<string, string> = {
                        family_request: 'text-blue-600',
                        family_request_accepted: 'text-green-600',
                        family_request_rejected: 'text-red-600',
                        safety_check: 'text-red-500',
                        job_offer: 'text-blue-500',
                        family_verification: 'text-green-500',
                        activity_hosting: 'text-blue-500',
                      }
                      const IconComponent = iconMap[uiType] || Bell
                      const colorClass = colorMap[uiType] || 'text-gray-500'
                      const title = notification.title || payload.title || uiType.replace(/_/g,' ')
                      const body = notification.body || payload.body || ''
                      const createdAt = notification.created_at ? new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                      return (
                        <div
                          key={notification.id}
                          className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-blue-50' : ''}`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 ${colorClass}`}>
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{title}</p>
                                  {body && <p className="text-sm text-gray-600 mt-1">{body}</p>}
                                  {createdAt && <p className="text-xs text-gray-400 mt-1">{createdAt}</p>}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="p-1 h-6 hover:bg-red-50 text-red-600"
                                    title="Delete notification"
                                    onClick={async (e) => {
                                      e.preventDefault(); e.stopPropagation();
                                      try {
                                        await deleteNotification(notification.id)
                                        setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
                                      } catch (err) {
                                        console.error('delete notification failed', err)
                                      }
                                    }}
                                  >
                                    <XIcon className="w-3 h-3" />
                                  </Button>
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="p-1 h-6"
                                      onClick={async (e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        try {
                                          await markNotificationRead(notification.id)
                                          setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n))
                                        } catch (err) {
                                          console.error('single mark read failed', err)
                                        }
                                      }}
                                      title="Mark as read"
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {/* Render appropriate action buttons based on notification type */}
                              {/* Keep action buttons visible and allow multiple clicks until read */}
                              {!notification.read && renderActionButtons({ ...payload, id: notification.id, type: uiType, buttonType: (payload.buttonType || uiType) })}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Family Requests Section */}
                    {(pendingRequests.length > 0 || acceptedRequests.size > 0) && (
                      <>
                        <div className="p-3 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-medium text-sm text-gray-700">Family Requests</h4>
                        </div>
                        {/* Show pending requests with Accept/Decline buttons */}
                        {pendingRequests.map((req: any) => (
                          <div
                            key={req.id}
                            className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors bg-blue-50"
                          >
                            <div className="flex items-start space-x-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
                                <UserCheck className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{req.sender?.name || 'Unknown User'}</p>
                                    <p className="text-sm text-gray-600 mt-1">Wants to add you as <span className="font-semibold text-blue-700">{req.relation}</span></p>
                                    <p className="text-xs text-gray-400 mt-1">{req.created_at ? new Date(req.created_at).toLocaleDateString() : 'Recently'}</p>
                                  </div>
                                  <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-2"></div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <Button 
                                    size="sm" 
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleApproveRequest(req.id) }}
                                    disabled={processingRequest?.id === req.id}
                                  >
                                    {processingRequest?.id === req.id && processingRequest?.action === 'accept' ? (
                                      <div className="flex items-center">
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                                        Accepting...
                                      </div>
                                    ) : (
                                      <div className="flex items-center">
                                        <Check className="w-3 h-3 mr-1" />
                                        Accept
                                      </div>
                                    )}
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRejectRequest(req.id) }}
                                    disabled={processingRequest?.id === req.id}
                                  >
                                    {processingRequest?.id === req.id && processingRequest?.action === 'decline' ? (
                                      <div className="flex items-center">
                                        <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-1" />
                                        Declining...
                                      </div>
                                    ) : (
                                      <div className="flex items-center">
                                        <XIcon className="w-3 h-3 mr-1" />
                                        Decline
                                      </div>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Show accepted requests with "You have accepted the request" message */}
                        {Array.from(acceptedRequests.values()).map((req: any) => (
                          <div
                            key={req.id}
                            className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors bg-green-50"
                          >
                            <div className="flex items-start space-x-3">
                              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-green-600">
                                <Check className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{req.sender?.name || 'Unknown User'}</p>
                                    <p className="text-sm text-gray-600 mt-1">Wants to add you as <span className="font-semibold text-blue-700">{req.relation}</span></p>
                                    <p className="text-xs text-gray-400 mt-1">{req.created_at ? new Date(req.created_at).toLocaleDateString() : 'Recently'}</p>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <p className="text-sm font-medium text-green-700">You have accepted the request</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {notifications.length === 0 && pendingRequests.length === 0 && acceptedRequests.size === 0 && (
                      <div className="text-center py-8">
                        <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500 font-medium">No notifications</p>
                        <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-3 border-t border-gray-200 bg-gray-50 flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium"
                      onClick={async () => {
                        if (!user?.id) return
                        try {
                          await markAllNotificationsRead(user.id, { recipientType: notificationRecipientType })
                          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                        } catch (err) {
                          console.error('mark all notifications read failed', err)
                        }
                      }}
                    >
                      Mark all as read
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        if (!user?.id) return
                        try {
                          await deleteAllNotifications(user.id, { recipientType: notificationRecipientType })
                          setNotifications([])
                          setPendingRequests([])
                        } catch (err) {
                          console.error('delete all notifications failed', err)
                        }
                      }}
                      title="Delete all"
                    >
                      <XIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* AI Chat Assistant */}
           

            {/* Show login/register when not authenticated, or show user menu when authenticated */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.image} alt={user?.name} />
                      <AvatarFallback>
                        {user?.name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      {user?.name && (
                        <p className="font-medium">{user.name}</p>
                      )}
                      {userLabel && (
                        <p className="w-[200px] truncate text-sm text-muted-foreground capitalize">
                          {userLabel}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  
                  {userNavigation.map((item) => {
                    const Icon = item.icon
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link href={item.href} className="flex items-center space-x-2">
                          <Icon className="w-4 h-4" />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  })}
                  
                  {(user?.isAdmin || user?.role === 'admin') && adminNavigation.map((item) => {
                    const Icon = item.icon
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link href={item.href} className="flex items-center space-x-2">
                          <Icon className="w-4 h-4" />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  })}
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogIn className="w-4 h-4 mr-2" />
                    {t('nav.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center space-x-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">
                    <LogIn className="w-4 h-4 mr-1" />
                    {t('nav.login')}
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">
                    <UserPlus className="w-4 h-4 mr-1" />
                    {t('nav.register')}
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {/* Mobile menu button and notification */}
          <div className="md:hidden flex items-center gap-2">
            {/* Mobile Notifications - only when authenticated */}
            {isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="w-5 h-5" />
                    { (notifications.filter((n) => !n.read).length + pendingRequests.length) > 0 && (
                      <Badge variant="destructive" className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center text-xs">
                        {(notifications.filter((n) => !n.read).length + pendingRequests.length) > 99 ? '99+' : (notifications.filter((n) => !n.read).length + pendingRequests.length)}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[95vw] sm:w-96 max-h-[480px] overflow-y-auto ml-[2.5vw] sm:ml-0" align="end">
                  <div className="p-0">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg text-gray-900">Notification Center</h3>
                      {(notifications.filter((n) => !n.read).length + pendingRequests.length) > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {(notifications.filter((n) => !n.read).length + pendingRequests.length)} unread
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 h-6 hover:bg-red-50 text-red-600"
                            title="Delete all notifications"
                            onClick={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              if (!user?.id) return
                              try {
                                await deleteAllNotifications(user.id, { recipientType: notificationRecipientType })
                                setNotifications([])
                                setPendingRequests([])
                              } catch (err) {
                                console.error('delete all failed', err)
                              }
                            }}
                          >
                            <XIcon className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notifications List */}
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.filter((notification) => {
                      // Filter out deleted notification IDs
                      if (deletedNotificationIdsRef.current.has(notification.id)) {
                        return false
                      }
                      // CRITICAL: Filter out ALL family_request notifications from the notifications list
                      // They should only appear in the "Family Requests" section below
                      if (notification.type === 'family_request') {
                        return false
                      }
                      return true
                    }).map((notification) => {
                      // Map backend notification to UI shape (fallbacks for missing fields)
                      const payload = (notification.payload || {}) as any
                      const uiType = notification.type
                      // Determine icon & color by type
                      const iconMap: Record<string, any> = {
                        family_request: UserCheck,
                        family_request_accepted: Check,
                        family_request_rejected: XIcon,
                        safety_check: ShieldCheck,
                        job_offer: Briefcase,
                        family_verification: User,
                        activity_hosting: Activity,
                      }
                      const colorMap: Record<string, string> = {
                        family_request: 'text-blue-600',
                        family_request_accepted: 'text-green-600',
                        family_request_rejected: 'text-red-600',
                        safety_check: 'text-red-500',
                        job_offer: 'text-blue-500',
                        family_verification: 'text-green-500',
                        activity_hosting: 'text-blue-500',
                      }
                      const IconComponent = iconMap[uiType] || Bell
                      const colorClass = colorMap[uiType] || 'text-gray-500'
                      const title = notification.title || payload.title || uiType.replace(/_/g,' ')
                      const body = notification.body || payload.body || ''
                      const createdAt = notification.created_at ? new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                      return (
                        <div
                          key={notification.id}
                          className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-blue-50' : ''}`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 ${colorClass}`}>
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{title}</p>
                                  {body && <p className="text-sm text-gray-600 mt-1">{body}</p>}
                                  {createdAt && <p className="text-xs text-gray-400 mt-1">{createdAt}</p>}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="p-1 h-6 hover:bg-red-50 text-red-600"
                                    title="Delete notification"
                                    onClick={async (e) => {
                                      e.preventDefault(); e.stopPropagation();
                                      try {
                                        await deleteNotification(notification.id)
                                        setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
                                      } catch (err) {
                                        console.error('delete notification failed', err)
                                      }
                                    }}
                                  >
                                    <XIcon className="w-3 h-3" />
                                  </Button>
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="p-1 h-6"
                                      onClick={async (e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        try {
                                          await markNotificationRead(notification.id)
                                          setNotifications((prev) => prev.map((n) => n.id === notification.id ? { ...n, read: true } : n))
                                        } catch (err) {
                                          console.error('single mark read failed', err)
                                        }
                                      }}
                                      title="Mark as read"
                                    >
                                      <Check className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {/* Render appropriate action buttons based on notification type */}
                              {/* Keep action buttons visible and allow multiple clicks until read */}
                              {!notification.read && renderActionButtons({ ...payload, id: notification.id, type: uiType, buttonType: (payload.buttonType || uiType) })}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Family Requests Section */}
                    {(pendingRequests.length > 0 || acceptedRequests.size > 0) && (
                      <>
                        <div className="p-3 bg-gray-50 border-b border-gray-200">
                          <h4 className="font-medium text-sm text-gray-700">Family Requests</h4>
                        </div>
                        {/* Show pending requests with Accept/Decline buttons */}
                        {pendingRequests.map((req: any) => (
                          <div
                            key={req.id}
                            className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors bg-blue-50"
                          >
                            <div className="flex items-start space-x-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
                                <UserCheck className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{req.sender?.name || 'Unknown User'}</p>
                                    <p className="text-sm text-gray-600 mt-1">Wants to add you as <span className="font-semibold text-blue-700">{req.relation}</span></p>
                                    <p className="text-xs text-gray-400 mt-1">{req.created_at ? new Date(req.created_at).toLocaleDateString() : 'Recently'}</p>
                                  </div>
                                  <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-2"></div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <Button 
                                    size="sm" 
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleApproveRequest(req.id) }}
                                    disabled={processingRequest?.id === req.id}
                                  >
                                    {processingRequest?.id === req.id && processingRequest?.action === 'accept' ? (
                                      <div className="flex items-center">
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                                        Accepting...
                                      </div>
                                    ) : (
                                      <div className="flex items-center">
                                        <Check className="w-3 h-3 mr-1" />
                                        Accept
                                      </div>
                                    )}
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRejectRequest(req.id) }}
                                    disabled={processingRequest?.id === req.id}
                                  >
                                    {processingRequest?.id === req.id && processingRequest?.action === 'decline' ? (
                                      <div className="flex items-center">
                                        <div className="w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-1" />
                                        Declining...
                                      </div>
                                    ) : (
                                      <div className="flex items-center">
                                        <XIcon className="w-3 h-3 mr-1" />
                                        Decline
                                      </div>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Show accepted requests with "You have accepted the request" message */}
                        {Array.from(acceptedRequests.values()).map((req: any) => (
                          <div
                            key={req.id}
                            className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors bg-green-50"
                          >
                            <div className="flex items-start space-x-3">
                              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 text-green-600">
                                <Check className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{req.sender?.name || 'Unknown User'}</p>
                                    <p className="text-sm text-gray-600 mt-1">Wants to add you as <span className="font-semibold text-blue-700">{req.relation}</span></p>
                                    <p className="text-xs text-gray-400 mt-1">{req.created_at ? new Date(req.created_at).toLocaleDateString() : 'Recently'}</p>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <p className="text-sm font-medium text-green-700">You have accepted the request</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {notifications.length === 0 && pendingRequests.length === 0 && acceptedRequests.size === 0 && (
                      <div className="text-center py-8">
                        <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500 font-medium">No notifications</p>
                        <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="p-3 border-t border-gray-200 bg-gray-50 flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium"
                      onClick={async () => {
                        if (!user?.id) return
                        try {
                          await markAllNotificationsRead(user.id, { recipientType: notificationRecipientType })
                          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                        } catch (err) {
                          console.error('mark all notifications read failed', err)
                        }
                      }}
                    >
                      Mark all as read
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-600 hover:bg-red-50"
                      onClick={async () => {
                        if (!user?.id) return
                        try {
                          await deleteAllNotifications(user.id, { recipientType: notificationRecipientType })
                          setNotifications([])
                          setPendingRequests([])
                        } catch (err) {
                          console.error('delete all notifications failed', err)
                        }
                      }}
                      title="Delete all"
                    >
                      <XIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-gray-200">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium transition-colors ${
                      isActive(item.href)
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                )
              })}
              
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-gray-200 mt-2 pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLanguageToggle}
                  className="flex items-center space-x-1"
                >
                  <Globe className="w-4 h-4" />
                  <span className="text-xs">{language === 'en' ? 'EN' : 'မြန်'}</span>
                </Button>
                
                {/* AI Chat nav item removed from mobile menu per design */}

                {/* Show login/register when not authenticated */}
                {!isAuthenticated && (
                  <>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                        <LogIn className="w-4 h-4 mr-1" />
                        <span className="text-xs">{t('nav.login')}</span>
                      </Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                        <UserPlus className="w-4 h-4 mr-1" />
                        <span className="text-xs">{t('nav.register')}</span>
                      </Link>
                    </Button>
                  </>
                )}
              </div>

              {/* Show user menu when authenticated */}
              {isAuthenticated && (
                <div className="px-3 py-2 border-t border-gray-200">
                  <div className="flex items-center space-x-3 mb-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.image} alt={user?.name} />
                      <AvatarFallback>
                        {user?.name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{userLabel}</p>
                    </div>
                  </div>
                  
                  {userNavigation.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm text-gray-700 hover:text-blue-600 hover:bg-gray-50"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    )
                  })}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full justify-start mt-2"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    {t('nav.logout')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
    </>
  )
}