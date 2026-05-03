import React, { createContext, useContext, useEffect, useState, useCallback, PropsWithChildren } from 'react'
import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'
import { useSession } from './session'
import { getNotifications, NotificationRecord, subscribeToNotifications, fetchUnreadCount as fetchNotiCount } from '../services/notifications'
import { fetchUnreadCount as fetchMsgCount, subscribeToIncomingMessages } from '../services/family'

type NotificationContextType = {
  notifications: NotificationRecord[]
  unreadCount: number
  refreshNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: PropsWithChildren) {
  const { user } = useSession()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshNotifications = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await getNotifications(user.id, { recipientType: user.isOrg ? 'organization' : 'user' })
      // Filter out disaster alerts from the inbox list
      const filtered = data.filter(n => n.type !== 'alert')
      setNotifications(filtered)
      
      const [notiCount, msgCount] = await Promise.all([
        fetchNotiCount(user.id),
        fetchMsgCount(user.id)
      ])
      setUnreadCount(notiCount + msgCount)
    } catch (err) {
      console.warn('Failed to refresh notifications in context', err)
    }
  }, [user?.id, user?.isOrg])

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  useEffect(() => {
    if (!user?.id) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    refreshNotifications()

    // Subscribe to NOTIFICATIONS table
    const notiSub = subscribeToNotifications(user.id, (payload) => {
      if (payload.type === 'alert') return // Ignore disaster alerts here

      setNotifications(prev => {
        if (prev.some(n => n.id === payload.id)) return prev
        return [payload, ...prev]
      })
      setUnreadCount(prev => prev + 1)

      // Show in-app notification if needed
      void Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title || 'New Notification',
          body: payload.body || 'You have a new update.',
          data: payload,
          sound: true,
        },
        trigger: null,
      })
    }, {
      recipientType: user.isOrg ? 'organization' : 'user',
      onDelete: (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
        refreshNotifications()
      },
      onUpdate: (updated) => {
        setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n))
        refreshNotifications()
      }
    })

    // Subscribe to MESSAGES table
    const msgSub = subscribeToIncomingMessages(user.id, (msg) => {
      setUnreadCount(prev => prev + 1)
      
      // Show in-app notification
      void Notifications.scheduleNotificationAsync({
        content: {
          title: 'New Message',
          body: msg.content || 'You received a new message.',
          data: { type: 'chat', sender_id: msg.sender_id },
          sound: true,
        },
        trigger: null,
      })
    })

    return () => {
      notiSub.unsubscribe()
      supabase.removeChannel(msgSub)
    }
  }, [user?.id, user?.isOrg, refreshNotifications])

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      refreshNotifications,
      markAsRead
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotification must be used within NotificationProvider')
  return context
}
