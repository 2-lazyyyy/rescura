import { useCallback, useEffect, useState, useRef } from 'react'
import { ActivityIndicator, Alert, LogBox, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, PanResponder, Platform, KeyboardAvoidingView, Image } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../src/lib/session'
import { theme } from '../src/theme'
import { supabase } from '../src/lib/supabase'
import * as Location from 'expo-location'
import * as Localization from 'expo-localization'
// Notifications moved to dynamic require to avoid Expo Go import-time errors
import { fetchFamilyMembers, findUsers, sendFamilyRequest, getSentFamilyRequests, cancelFamilyRequest, removeFamilyMemberById, fetchLastSeenForUsers, sendSafetyCheck } from '../src/services/family'
import { safetyModules } from '../src/data/safety-modules'
import { DisasterEvent } from '../src/services/alerts'
import { useAlerts } from '../src/lib/AlertContext'
import Constants, { AppOwnership } from 'expo-constants'
import MapboxWebView from '../src/components/MapboxWebView'

type TabValue = 'family' | 'safety' | 'alerts'

// Note: SDK 53+ removed remote notification support in Expo Go.
// Notifications are now initialized centrally in app/_layout.tsx

export default function DashboardScreen() {
  const { user } = useSession()
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<TabValue>('family')
  const [familyMembers, setFamilyMembers] = useState<any[]>([])
  const [sentRequests, setSentRequests] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [completedModules, setCompletedModules] = useState<string[]>([])
  const [totalPoints, setTotalPoints] = useState(0)
  const [emergencyKitStatus, setEmergencyKitStatus] = useState(0)
  const { 
    liveAlerts: masterAlerts, 
    userCountry, 
    refreshAlerts: triggerRefreshAlerts, 
    localNotiEnabled, 
    globalNotiEnabled, 
    toggleNotification 
  } = useAlerts()

  const [liveAlerts, setLiveAlerts] = useState<DisasterEvent[]>([])
  const [alertFilterMode, setAlertFilterMode] = useState<'local' | 'global'>('local')
  const [fetchError, setFetchError] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [relation, setRelation] = useState('')
  const [isSending, setIsSending] = useState(false)

  // New Family System States
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, any>>({})
  const [mapModalOpen, setMapModalOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<{ name: string; lat: number; lng: number; address?: string } | null>(null)
  const [sendingSafetyCheckId, setSendingSafetyCheckId] = useState<string | null>(null)
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)

  const addModalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50) {
          setShowAddModal(false)
        }
      },
    })
  ).current

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const members = await fetchFamilyMembers(user.id)
      const mapped = members.map((l: any) => ({
        id: l.member?.id ?? l.id,
        name: l.member?.name ?? 'Unknown',
        phone: l.member?.phone ?? '',
        image: l.member?.image,
        status: l.safety_status ?? 'unknown',
        safety_status: l.safety_status ?? 'unknown',
        safety_check_started_at: l.safety_check_started_at,
        safety_check_expires_at: l.safety_check_expires_at,
        lastSeen: new Date(),
      }))
      const seen = new Set<string>()
      const deduped = mapped.filter((m: any) => {
        if (!m.id) return false
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
      setFamilyMembers(deduped)

      // Fetch last seen locations
      const memberIds = deduped.map(m => m.id)
      if (memberIds.length > 0) {
        const locations = await fetchLastSeenForUsers(memberIds)
        setLastSeenMap(locations || {})
      }

      const requests = await getSentFamilyRequests(user.id)
      setSentRequests(requests || [])

      const storedModules = await AsyncStorage.getItem('completedModules')
      if (storedModules) setCompletedModules(JSON.parse(storedModules))
      const points = await AsyncStorage.getItem('safetyPoints')
      if (points) setTotalPoints(parseInt(points))
      const kit = await AsyncStorage.getItem('emergencyKitItems')
      if (kit) {
        const items = JSON.parse(kit)
        const totalItems = Object.keys(items).length
        const checkedItems = Object.values(items).filter(Boolean).length
        setEmergencyKitStatus(totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0)
      }

      // --- Location-based Alert Filtering ---
      setFetchError(masterAlerts.length === 0)

      let displayAlerts = [...masterAlerts]
      if (alertFilterMode === 'local' && userCountry) {
        const lowCountry = userCountry.toLowerCase()
        displayAlerts = masterAlerts.filter(a => {
          const place = (a.place || '').toLowerCase()
          const location = (a.location || '').toLowerCase()
          const title = (a.title || '').toLowerCase()

          return place.includes(lowCountry) ||
            location.includes(lowCountry) ||
            title.includes(lowCountry) ||
            (lowCountry === 'myanmar' && (place.includes('burma') || title.includes('burma')))
        })
      }
      setLiveAlerts(displayAlerts.slice(0, 15))
    } catch (e) {
      console.warn('Failed to load dashboard data', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user, alertFilterMode, masterAlerts, userCountry])

  useEffect(() => {
    loadData()
  }, [loadData])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )



  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`family_dashboard:${user.id}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members', filter: `user_id=eq.${user.id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_requests', filter: `from_user_id=eq.${user.id}` }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        const n = payload.new
        if (n.type === 'safety_check_ok' || n.type === 'safety_check_not_ok') {
          loadData()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, loadData])

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearching(true)
      const res = await findUsers(searchQuery)
      setSearchResults(res || [])
      setIsSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const simulateLocalAlert = async () => {
    Alert.alert('Simulate Alert', 'Triggering test alert check...')
    triggerRefreshAlerts()
  }

  const safeFamilyMembers = familyMembers.filter((m) => m.status === 'safe').length
  const completedModulesCount = completedModules.length

  const mergedMembers = [
    ...familyMembers.map(m => ({ ...m, isLinked: true })),
    ...sentRequests.map(r => ({
      id: r.to_user_id,
      name: r.receiver?.name || 'Unknown',
      phone: r.receiver?.phone || '',
      status: 'pending',
      isLinked: false,
      requestId: r.id,
      relation: r.relation
    }))
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe': return '#059669'
      case 'in_danger': return '#dc2626'
      case 'pending': return '#64748b'
      default: return '#d97706'
    }
  }

  const handleSendRequest = async () => {
    if (!user || !selectedUser || !relation) return
    setIsSending(true)
    const res = await sendFamilyRequest(user.id, selectedUser.id, relation)
    if (res.success) {
      Alert.alert('Success', 'Family request sent!')
      setShowAddModal(false)
      setSelectedUser(null)
      setSearchQuery('')
      setRelation('')
      loadData()
    } else {
      Alert.alert('Error', res.error === 'already_linked' ? 'Already in network' : res.error === 'request_already_sent' ? 'Request already sent' : 'Failed to send request')
    }
    setIsSending(false)
  }

  const handleCancelRequest = async (requestId: string) => {
    const res = await cancelFamilyRequest(requestId)
    if (res.success) loadData()
    else Alert.alert('Error', 'Failed to cancel request')
  }

  const handleUnlink = async (memberId: string) => {
    if (!user) return
    setRemovingMemberId(memberId)
    const res = await removeFamilyMemberById(user.id, memberId)
    if (res.success) loadData()
    else Alert.alert('Error', 'Failed to unlink member')
    setRemovingMemberId(null)
  }

  const [isPredictingId, setIsPredictingId] = useState<string | null>(null)

  const handlePredictLocation = async (member: any) => {
    setIsPredictingId(member.id)
    try {
      const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://rescura.vercel.app'
      const res = await fetch(`${baseUrl}/api/ai/predict-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id })
      })
      const data = await res.json()
      
      if (!res.ok || data.error) {
        Alert.alert('Prediction Failed', data.message || 'Not enough location history to predict trajectory.')
        return
      }

      setSelectedLocation({
        name: `${member.name} (Predicted)`,
        lat: data.prediction.lat,
        lng: data.prediction.lng,
        address: `AI Prediction (Confidence: ${Math.round(data.prediction.confidence * 100)}%)\nReason: ${data.prediction.reason}`
      })
      setMapModalOpen(true)
    } catch (err) {
      console.error('predict error', err)
      Alert.alert('Error', 'Failed to connect to prediction AI.')
    } finally {
      setIsPredictingId(null)
    }
  }

  const handleSendSafetyCheck = async (memberId: string) => {
    if (!user) return
    setSendingSafetyCheckId(memberId)
    try {
      const res = await sendSafetyCheck(user.id, memberId)
      if (res.success) {
        Alert.alert('Success', 'Safety check sent!')
        loadData()
      } else {
        Alert.alert('Error', 'Failed to send safety check')
      }
    } catch (err) {
      console.error(err)
      Alert.alert('Error', 'An error occurred while sending safety check')
    } finally {
      setSendingSafetyCheckId(null)
    }
  }

  const isWindowActive = (member: any) => {
    if (!member.safety_check_expires_at) return false
    return new Date(member.safety_check_expires_at).getTime() > Date.now()
  }

  const renderTabContent = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )
    }

    if (activeTab === 'family') {
      return (
        <View style={styles.tabContainer}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Family Network</Text>
              <Text style={styles.sectionSubtitle}>{familyMembers.length} active connections</Text>
            </View>
            <TouchableOpacity style={styles.addMemberBtn} onPress={() => setShowAddModal(true)}>
              <Ionicons name="person-add" size={18} color="#fff" />
              <Text style={styles.addMemberBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {mergedMembers.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={40} color={theme.colors.mutedForeground} />
              </View>
              <Text style={styles.emptyStateTitle}>Your network is empty !!!!  </Text>
              <Text style={styles.emptyStateSub}>Add family members to start tracking their safety status.</Text>
              <TouchableOpacity style={styles.emptyStateBtn} onPress={() => setShowAddModal(true)}>
                <Text style={styles.emptyStateBtnText}>Add First Member</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.memberGrid}>
              {mergedMembers.map(member => {
                const isActive = isWindowActive(member)
                const statusColor = getStatusColor(member.status)
                
                return (
                  <View key={member.id} style={styles.memberCard}>
                    <View style={styles.cardTop}>
                      <View style={styles.avatarContainer}>
                        <View style={[styles.avatarCircle, { borderColor: member.isLinked ? statusColor : '#e2e8f0' }]}>
                          <Text style={styles.avatarInitial}>{member.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        {member.isLinked && (
                          <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
                        )}
                      </View>
                      
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                        <Text style={styles.memberRelation}>{member.relation || 'Family'}</Text>
                      </View>

                      <TouchableOpacity 
                        style={styles.moreBtn} 
                        onPress={() => member.status === 'pending' ? handleCancelRequest(member.requestId) : handleUnlink(member.id)}
                      >
                        <Ionicons name={member.status === 'pending' ? "close-circle" : "ellipsis-vertical"} size={18} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>

                    {member.isLinked && (
                      <View style={styles.cardMiddle}>
                        <View style={styles.statusRow}>
                          <View style={[styles.statusTag, { backgroundColor: statusColor + '15' }]}>
                            <View style={[styles.statusPulse, { backgroundColor: statusColor }]} />
                            <Text style={[styles.statusTagText, { color: statusColor }]}>
                              {member.status === 'safe' ? 'SAFE' : member.status === 'in_danger' ? 'DANGER' : 'UNKNOWN'}
                            </Text>
                          </View>
                          {isActive && <Countdown expiresAt={member.safety_check_expires_at} />}
                        </View>

                        {lastSeenMap[member.id] && (
                          <TouchableOpacity 
                            style={styles.locationSummary}
                            onPress={() => {
                              setSelectedLocation({
                                name: member.name,
                                lat: lastSeenMap[member.id].lat,
                                lng: lastSeenMap[member.id].lng,
                                address: lastSeenMap[member.id].address
                              })
                              setMapModalOpen(true)
                            }}
                          >
                            <Ionicons name="location-sharp" size={12} color={theme.colors.primary} />
                            <Text style={styles.locationTextBrief} numberOfLines={1}>
                              {lastSeenMap[member.id].address || 'View on map'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {member.isLinked ? (
                      <View style={styles.cardActions}>
                        <TouchableOpacity 
                          style={[styles.safetyActionBtn, isActive && styles.safetyActionBtnDisabled]}
                          onPress={() => handleSendSafetyCheck(member.id)}
                          disabled={isActive || sendingSafetyCheckId === member.id}
                        >
                          {sendingSafetyCheckId === member.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <Ionicons name="shield-checkmark" size={16} color="#fff" />
                              <Text style={styles.safetyActionText}>Check Safety</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        
                        {lastSeenMap[member.id]?.lat && (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity 
                              style={[styles.mapActionBtn, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}
                              onPress={() => handlePredictLocation(member)}
                              disabled={isPredictingId === member.id}
                            >
                              {isPredictingId === member.id ? (
                                <ActivityIndicator size="small" color={theme.colors.primary} />
                              ) : (
                                <Ionicons name="sparkles" size={18} color={theme.colors.primary} />
                              )}
                            </TouchableOpacity>

                            <TouchableOpacity 
                              style={styles.mapActionBtn}
                              onPress={() => {
                                setSelectedLocation({
                                  name: member.name,
                                  lat: lastSeenMap[member.id].lat,
                                  lng: lastSeenMap[member.id].lng,
                                  address: lastSeenMap[member.id].address
                                })
                                setMapModalOpen(true)
                              }}
                            >
                              <Ionicons name="navigate" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>Waiting for acceptance...</Text>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>
      )
    }

    if (activeTab === 'safety') {
      return (
        <View style={styles.tabContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="book" size={24} color={theme.colors.primary} />
              <View>
                <Text style={styles.cardTitle}>Safety Modules</Text>
                <Text style={styles.cardDescription}>Complete training to earn badges</Text>
              </View>
            </View>
            <View style={styles.list}>
              {safetyModules.map(module => {
                const isCompleted = completedModules.includes(module.id)
                return (
                  <View key={module.id} style={[styles.listItem, isCompleted && styles.listItemCompleted]}>
                    <View style={styles.listTextWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.listTitle}>{module.title}</Text>
                        {isCompleted && (
                          <View style={styles.completedBadge}>
                            <Ionicons name="checkmark-circle" size={12} color="#059669" />
                            <Text style={styles.completedBadgeText}>COMPLETED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.listSubtitle} numberOfLines={2}>{module.description}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.smallButton, isCompleted && styles.smallButtonCompleted]}
                      onPress={() => router.push(`/safetycourse/${module.id}` as any)}
                    >
                      <Ionicons 
                        name={isCompleted ? "checkmark-circle" : "play"} 
                        size={14} 
                        color={isCompleted ? "#059669" : theme.colors.primaryForeground} 
                      />
                      <Text style={[styles.smallButtonText, isCompleted && { color: "#059669" }]}>
                        {isCompleted ? 'Review' : 'Start'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>
          </View>
        </View>
      )
    }

    if (activeTab === 'alerts') {
      return (
        <View style={styles.tabContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {alertFilterMode === 'local' && userCountry ? `Alerts in ${userCountry}` : 'Global Disaster Alerts'}
                </Text>
                <Text style={styles.cardDescription}>
                  {alertFilterMode === 'local' ? 'Nearby emergency events' : 'Real-time global monitoring'}
                </Text>
              </View>

              {/* Context-Aware Notification Toggle */}
              <TouchableOpacity
                style={[
                  styles.headerButton,
                  { backgroundColor: (alertFilterMode === 'local' ? localNotiEnabled : globalNotiEnabled) ? '#ecfdf5' : '#f1f5f9' }
                ]}
                onPress={() => toggleNotification(alertFilterMode)}
              >
                <Ionicons
                  name={(alertFilterMode === 'local' ? localNotiEnabled : globalNotiEnabled) ? "notifications" : "notifications-off-outline"}
                  size={20}
                  color={(alertFilterMode === 'local' ? localNotiEnabled : globalNotiEnabled) ? '#059669' : '#64748b'}
                />
              </TouchableOpacity>
            </View>

            {/* SEGMENTED TOGGLE */}
            <View style={styles.segmentedWrapper}>
              <TouchableOpacity
                style={[styles.segment, alertFilterMode === 'local' && styles.segmentActive]}
                onPress={() => setAlertFilterMode('local')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons
                    name={alertFilterMode === 'local' ? "location" : "location-outline"}
                    size={16}
                    color={alertFilterMode === 'local' ? theme.colors.primary : '#64748b'}
                  />
                  <Text style={[styles.segmentText, alertFilterMode === 'local' && styles.segmentTextActive]}>Local</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, alertFilterMode === 'global' && styles.segmentActive]}
                onPress={() => setAlertFilterMode('global')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons
                    name={alertFilterMode === 'global' ? "globe" : "globe-outline"}
                    size={16}
                    color={alertFilterMode === 'global' ? theme.colors.primary : '#64748b'}
                  />
                  <Text style={[styles.segmentText, alertFilterMode === 'global' && styles.segmentTextActive]}>Global</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* DEBUG BUTTON */}
            <TouchableOpacity
              style={{ backgroundColor: '#fff1f2', padding: 8, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#fecdd3', alignItems: 'center' }}
              onPress={simulateLocalAlert}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#be123c' }}>DEBUG: Simulate Local Earthquake</Text>
            </TouchableOpacity>

            {liveAlerts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name={fetchError ? "cloud-offline-outline" : "notifications-off-outline"}
                  size={32}
                  color={theme.colors.mutedForeground}
                />
                <Text style={styles.emptyText}>
                  {fetchError
                    ? "Unable to reach alerts server. Please check your internet."
                    : alertFilterMode === 'local' && userCountry
                      ? `No recent alerts found in ${userCountry}.`
                      : 'No live alerts currently.'}
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {liveAlerts.map(alert => (
                  <View key={alert.id} style={styles.listItem}>
                    <View style={styles.listTextWrap}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Ionicons name={alert.type === 'earthquake' ? 'pulse' : 'water'} size={16} color={alert.severity === 'high' ? '#dc2626' : alert.severity === 'medium' ? '#d97706' : '#2563eb'} />
                        <Text style={[styles.listTitle, { flex: 1 }]} numberOfLines={1}>{alert.title}</Text>

                        {/* LOCAL/GLOBAL LABEL */}
                        {userCountry && (alert.place?.toLowerCase().includes(userCountry.toLowerCase()) || alert.location?.toLowerCase().includes(userCountry.toLowerCase()) || (userCountry.toLowerCase() === 'myanmar' && alert.place?.toLowerCase().includes('burma'))) && (
                          <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#86efac' }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: '#15803d' }}>LOCAL</Text>
                          </View>
                        )}

                        <View style={[styles.badge, { backgroundColor: alert.severity === 'high' ? '#fee2e2' : alert.severity === 'medium' ? '#fef3c7' : '#dbeafe' }]}>
                          <Text style={[styles.badgeText, { color: alert.severity === 'high' ? '#dc2626' : alert.severity === 'medium' ? '#d97706' : '#2563eb' }]}>{alert.severity.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.listSubtitle} numberOfLines={2}>{alert.description || alert.place}</Text>
                      <Text style={[styles.listSubtitle, { fontSize: 11, marginTop: 4 }]}>{new Date(alert.time).toLocaleString()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )
    }

    return null
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData() }} />}
      >
        {/* PREMIUM DASHBOARD HEADER */}
        <View style={headerStyles.container}>
          <View style={headerStyles.topRow}>
            <TouchableOpacity 
              style={headerStyles.profileSection}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.7}
            >
              <View style={headerStyles.avatar}>
                <View style={{ width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {user?.image ? (
                    <Image 
                      source={{ uri: user.image }} 
                      style={{ width: '100%', height: '100%' }} 
                    />
                  ) : (
                    <Text style={headerStyles.avatarText}>{user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}</Text>
                  )}
                </View>
                <View style={headerStyles.activeDot} />
              </View>
              <View>
                <Text style={headerStyles.greeting}>Welcome back,</Text>
                <Text style={headerStyles.userName}>{user?.name || user?.email?.split('@')[0] || 'User'}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={headerStyles.statusBanner}>
            <View style={headerStyles.statusBadge}>
              <View style={[headerStyles.statusDot, { backgroundColor: '#10b981' }]} />
              <Text style={headerStyles.statusText}>System Active</Text>
            </View>
            {userCountry && (
              <View style={headerStyles.locationBadge}>
                <Ionicons name="location" size={14} color="#64748b" />
                <Text style={headerStyles.locationText}>{userCountry}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <View>
                <Text style={styles.statLabel}>Family Safety</Text>
                <Text style={[styles.statValue, { color: '#059669' }]}>{safeFamilyMembers}/{familyMembers.length}</Text>
              </View>
              <Ionicons name="shield-checkmark" size={28} color="#059669" />
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <View>
                <Text style={styles.statLabel}>Preparedness</Text>
                <Text style={[styles.statValue, { color: '#f59e0b' }]}>{Math.round((completedModulesCount / safetyModules.length) * 100)}%</Text>
              </View>
              <Ionicons name="medal" size={28} color="#f59e0b" />
            </View>
          </View>
        </View>

        <View style={styles.tabsWrapper}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'family' && styles.activeTab]}
            onPress={() => setActiveTab('family')}
          >
            <Ionicons name="people-outline" size={16} color={activeTab === 'family' ? theme.colors.foreground : theme.colors.mutedForeground} />
            <Text style={[styles.tabText, activeTab === 'family' && styles.activeTabText]}>Family</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'safety' && styles.activeTab]}
            onPress={() => setActiveTab('safety')}
          >
            <Ionicons name="shield-outline" size={16} color={activeTab === 'safety' ? theme.colors.foreground : theme.colors.mutedForeground} />
            <Text style={[styles.tabText, activeTab === 'safety' && styles.activeTabText]}>Safety</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'alerts' && styles.activeTab]}
            onPress={() => setActiveTab('alerts')}
          >
            <Ionicons name="warning-outline" size={16} color={activeTab === 'alerts' ? theme.colors.foreground : theme.colors.mutedForeground} />
            <Text style={[styles.tabText, activeTab === 'alerts' && styles.activeTabText]}>Alerts</Text>
          </TouchableOpacity>
        </View>

        {renderTabContent()}

      </ScrollView>

      <LocationMapModal
        visible={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        location={selectedLocation}
      />

      {/* Add Member Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
        >
          <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPressOut={() => setShowAddModal(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.modalContainer}>
              <View {...addModalPanResponder.panHandlers} style={{ paddingBottom: 10 }}>
                <View style={styles.modalHandle} />
              </View>
              
              <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Family Member</Text>
                <Text style={styles.modalSubtitle}>Search and invite to your network</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={20} color="#94a3b8" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by phone, email or name..."
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                    <Ionicons name="close-circle" size={16} color="#cbd5e1" />
                  </TouchableOpacity>
                )}
              </View>

              {isSearching && (
                <View style={styles.searchingState}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.searchingText}>Searching...</Text>
                </View>
              )}

              {searchResults.length > 0 && !selectedUser && (
                <View style={styles.searchResults}>
                  {searchResults.map((u, idx) => {
                    const isFamily = familyMembers.some(m => m.id === u.id)
                    const isSent = sentRequests.some(r => r.to_user_id === u.id)
                    
                    return (
                      <TouchableOpacity 
                        key={u.id} 
                        style={[styles.searchItem, idx === searchResults.length - 1 && { borderBottomWidth: 0 }]} 
                        onPress={() => {
                          if (!isFamily && !isSent) {
                            setSelectedUser(u)
                          }
                        }}
                        activeOpacity={isFamily || isSent ? 1 : 0.7}
                      >
                        <View style={styles.searchAvatar}>
                          <Text style={styles.searchAvatarText}>{u.name?.charAt(0) || 'U'}</Text>
                        </View>
                        <View style={styles.searchItemInfo}>
                          <Text style={styles.searchName}>{u.name}</Text>
                          <Text style={styles.searchPhone}>{u.phone || u.email}</Text>
                        </View>
                        {isFamily ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                            <Text style={{ fontSize: 12, color: '#10b981', fontWeight: '600' }}>Family</Text>
                          </View>
                        ) : isSent ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="time" size={20} color="#f59e0b" />
                            <Text style={{ fontSize: 12, color: '#f59e0b', fontWeight: '600' }}>Pending</Text>
                          </View>
                        ) : (
                          <Ionicons name="person-add-outline" size={20} color={theme.colors.primary} />
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              {selectedUser && (
                <View style={styles.selectedUserCard}>
                  <View style={styles.selectedUserHeader}>
                    <View style={styles.selectedUserAvatar}>
                      <Text style={styles.selectedUserAvatarText}>{selectedUser.name?.charAt(0) || 'U'}</Text>
                    </View>
                    <View style={styles.selectedUserInfo}>
                      <Text style={styles.selectedUserName}>{selectedUser.name}</Text>
                      <Text style={styles.selectedUserContact}>{selectedUser.phone || selectedUser.email}</Text>
                    </View>
                    <View style={styles.checkIconWrap}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  </View>

                  <View style={styles.relationInputWrap}>
                    <Text style={styles.inputLabel}>How are you related?</Text>
                    <TextInput
                      style={styles.relationInput}
                      placeholder="e.g. Mother, Son, Partner"
                      placeholderTextColor="#94a3b8"
                      value={relation}
                      onChangeText={setRelation}
                      returnKeyType="done"
                    />
                  </View>

                  <View style={styles.modalActionRow}>
                    <TouchableOpacity 
                      style={styles.modalCancelBtn} 
                      onPress={() => setSelectedUser(null)}
                    >
                      <Text style={styles.modalCancelBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.modalSubmitBtn, (!relation || isSending) && styles.modalSubmitBtnDisabled]} 
                      onPress={handleSendRequest} 
                      disabled={isSending || !relation}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="send" size={16} color="#fff" />
                          <Text style={styles.modalSubmitBtnText}>Send Request</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  centerBox: { height: 200, alignItems: 'center', justifyContent: 'center' },

  welcomeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff', 
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 16,
  },
  welcomeIconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#bfdbfe',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff'
  },
  welcomeTextWrap: { flex: 1 },
  welcomeTitle: { fontSize: 24, fontWeight: '800', color: '#1e3a8a', marginBottom: 4 },
  welcomeSubtitle: { fontSize: 14, color: '#1e40af', fontWeight: '500' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { fontSize: 13, color: theme.colors.mutedForeground, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 4 },

  tabsWrapper: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9', 
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingVertical: 12, 
    gap: 8, 
    borderRadius: 12,
  },
  activeTab: { 
    backgroundColor: '#ffffff', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, 
    shadowRadius: 4, 
    elevation: 3, 
  },
  tabText: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#64748b' 
  },
  activeTabText: { 
    color: '#1e293b' 
  },

  tabContainer: {
    paddingBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.foreground,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.mutedForeground,
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
  },
  addMemberBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  memberGrid: {
    gap: 12,
  },
  memberCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  statusDotSmall: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.foreground,
  },
  memberRelation: {
    fontSize: 12,
    color: theme.colors.mutedForeground,
    marginTop: 2,
  },
  moreBtn: {
    padding: 8,
  },

  cardMiddle: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 6,
  },
  statusPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  locationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 10,
  },
  locationTextBrief: {
    fontSize: 12,
    color: '#64748b',
    flex: 1,
  },

  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  safetyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  safetyActionBtnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.7,
  },
  safetyActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  mapActionBtn: {
    width: 44,
    height: 44,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },

  pendingBadge: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  pendingText: {
    fontSize: 12,
    color: '#b45309',
    fontWeight: '600',
    fontStyle: 'italic',
  },

  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#f1f5f9',
    borderStyle: 'dashed',
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.foreground,
  },
  emptyStateSub: {
    fontSize: 14,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 8,
    lineHeight: 20,
  },
  emptyStateBtn: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  emptyStateBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  modalBg: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  modalContainer: { 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    padding: 24, 
    paddingBottom: 40,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 24,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.foreground },
  modalSubtitle: { fontSize: 13, color: theme.colors.mutedForeground, marginTop: 4 },
  modalCloseBtn: {
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 16,
  },

  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.foreground,
    fontWeight: '500',
  },
  searchClearBtn: { padding: 4 },

  searchingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  searchingText: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },

  searchResults: { 
    maxHeight: 280, 
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 20,
  },
  searchItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  searchAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  searchAvatarText: { fontWeight: '800', color: theme.colors.primary, fontSize: 16 },
  searchItemInfo: { flex: 1 },
  searchName: { fontWeight: '700', color: theme.colors.foreground, fontSize: 15 },
  searchPhone: { fontSize: 13, color: theme.colors.mutedForeground, marginTop: 2 },

  selectedUserCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  selectedUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 20,
  },
  selectedUserAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  selectedUserAvatarText: { fontSize: 24, fontWeight: '800', color: theme.colors.primary },
  selectedUserInfo: { flex: 1 },
  selectedUserName: { fontSize: 18, fontWeight: '800', color: theme.colors.foreground },
  selectedUserContact: { fontSize: 13, color: theme.colors.mutedForeground, marginTop: 4 },
  checkIconWrap: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#10b981',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    position: 'absolute', left: 40, bottom: 18,
  },

  relationInputWrap: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    marginLeft: 4,
  },
  relationInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: theme.colors.foreground,
  },

  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 15,
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  modalSubmitBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  modalSubmitBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  segmentedWrapper: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentTextActive: {
    color: theme.colors.foreground,
  },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  lastSeenText: { fontSize: 10, color: theme.colors.mutedForeground, fontWeight: '500' },
  addressText: { fontSize: 10, color: theme.colors.mutedForeground, marginTop: 1 },
  actionButtonSmall: { paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  actionButtonSmallText: { fontSize: 12, fontWeight: '600', color: theme.colors.primaryForeground },
  countdownText: { fontSize: 12, fontWeight: '700', color: theme.colors.mutedForeground },
  iconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },

  // Shared List Styles for other tabs
  list: {
    gap: 12,
    padding: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  listItemCompleted: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bcf0da',
  },
  listTextWrap: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.foreground,
  },
  listSubtitle: {
    fontSize: 13,
    color: theme.colors.mutedForeground,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bcf0da',
  },
  completedBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  smallButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  smallButtonCompleted: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#059669',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Restored Shared Styles for Safety/Alerts tabs and modals
  card: { backgroundColor: theme.colors.card, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.foreground },
  cardDescription: { fontSize: 13, color: theme.colors.mutedForeground, marginTop: 2 },
  headerButton: { backgroundColor: theme.colors.primary, borderRadius: 8, padding: 6 },
  emptyState: { alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { color: theme.colors.mutedForeground, textAlign: 'center' },
  primaryButton: { backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8, alignItems: 'center' },
  primaryButtonText: { color: theme.colors.primaryForeground, fontWeight: '600' },
})

const headerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: '#f0fdf4',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dcfce7',
    marginBottom: 20,
    marginTop: -10,
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dcfce7',
    position: 'relative',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#15803d',
  },
  activeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 3,
    borderColor: '#f0fdf4',
  },
  greeting: {
    fontSize: 14,
    color: '#15803d',
    fontWeight: '500',
    opacity: 0.8,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#166534',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  statusBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.5,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
    opacity: 0.7,
  },
})

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  header: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  body: {
    padding: 24,
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMeta: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 16,
  },
  alertDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 20,
  },
  closeButton: {
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
})

// --- HELPER COMPONENTS ---

function StatusBadge({ status }: { status: string }) {
  const getBadgeColor = () => {
    switch (status) {
      case 'safe': return { bg: '#dcfce7', text: '#059669', icon: 'checkmark-circle' }
      case 'danger': return { bg: '#fee2e2', text: '#dc2626', icon: 'alert-circle' }
      default: return { bg: '#f1f5f9', text: '#64748b', icon: 'help-circle' }
    }
  }
  const config = getBadgeColor()
  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      <Ionicons name={config.icon as any} size={10} color={config.text} />
      <Text style={[styles.statusBadgeText, { color: config.text }]}>{status.toUpperCase()}</Text>
    </View>
  )
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('')
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = new Date(expiresAt).getTime() - Date.now()
      if (remaining <= 0) {
        setTimeLeft('Expired')
        clearInterval(timer)
      } else {
        const mm = Math.floor(remaining / 60000)
        const ss = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${mm}:${ss.toString().padStart(2, '0')}`)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
      <Ionicons name="time-outline" size={12} color={theme.colors.mutedForeground} />
      <Text style={styles.countdownText}>{timeLeft}</Text>
    </View>
  )
}

function LocationMapModal({ visible, onClose, location }: { visible: boolean, onClose: () => void, location: any }) {
  if (!location) return null
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ height: '80%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
          <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.foreground }}>{location.name}'s Last Seen</Text>
              <Text style={{ fontSize: 12, color: theme.colors.mutedForeground }} numberOfLines={1}>{location.address || 'Location data available'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Ionicons name="close" size={24} color={theme.colors.foreground} />
            </TouchableOpacity>
          </View>
          <MapboxWebView
            style={{ flex: 1 }}
            center={{ latitude: location.lat, longitude: location.lng }}
            zoom={14}
            pins={[
              {
                id: 'user-loc',
                latitude: location.lat,
                longitude: location.lng,
                type: 'safe',
                description: location.address,
                status: 'confirmed'
              }
            ]}
          />
        </View>
      </View>
    </Modal>
  )
}
