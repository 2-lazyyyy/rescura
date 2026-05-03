import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { theme } from '../../src/theme'
import { useSession } from '../../src/lib/session'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  subscribeToNotifications,
  NotificationRecord
} from '../../src/services/notifications'
import { supabase } from '../../src/lib/supabase'
import { useNotification } from '../../src/lib/NotificationContext'

import { 
  respondToSafetyCheck, 
  approveFamilyRequest, 
  rejectFamilyRequest 
} from '../../src/services/family'

const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; label: string }> = {
  alert:          { icon: 'warning',              color: '#dc2626', bg: '#fee2e2', label: 'Emergency' },
  pin:            { icon: 'location',             color: '#8b5cf6', bg: '#ede9fe', label: 'Map Pin' },
  safety_check:   { icon: 'shield-checkmark',     color: '#059669', bg: '#dcfce7', label: 'Safety' },
  family_request: { icon: 'people',               color: '#f59e0b', bg: '#fef3c7', label: 'Family Link' },
  system:         { icon: 'settings',             color: '#64748b', bg: '#f1f5f9', label: 'System' },
}

function getTypeMeta(type: string) {
  const t = type?.toLowerCase() || 'system'
  if (t.includes('safety')) return TYPE_META['safety_check']
  if (t.includes('family')) return TYPE_META['family_request']
  if (t.includes('pin')) return TYPE_META['pin']
  if (t.includes('alert')) return TYPE_META['alert']
  return TYPE_META[t] || TYPE_META['system']
}

export default function AlertsScreen() {
  const { user } = useSession()
  const { notifications: items, refreshNotifications: load, unreadCount } = useNotification()
  const [refreshing, setRefreshing] = useState(false)
  const [isLoading, setIsLoading]   = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  
  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id)
      await load()
    } catch (err) {
      Alert.alert('Error', 'Failed to delete notification')
    }
  }

  const handleMarkRead = async (id: string, isRead: boolean) => {
    if (isRead) return
    try {
      await markNotificationRead(id)
      await load()
    } catch (err) {
      console.warn('Mark read failed', err)
    }
  }

  const handleMarkAll = async () => {
    if (!user?.id) return
    try {
      await markAllNotificationsRead(user.id)
      await load()
    } catch (err) {
      console.warn('Mark all read failed', err)
    }
  }

  // Action Handlers
  const handleSafetyResponse = async (id: string, requesterId: string, status: 'safe' | 'danger') => {
    if (!user?.id) return
    setProcessingId(id)
    try {
      const res = await respondToSafetyCheck(user.id, requesterId, status)
      if (res.success) {
        await markNotificationRead(id)
        await load()
        Alert.alert(status === 'safe' ? '✅ Status Updated' : '⚠️ Alert Sent', status === 'safe' ? 'Your family has been notified that you are safe.' : 'An emergency alert has been sent to your family.')
      } else {
        Alert.alert('Error', 'Failed to update safety status.')
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred.')
    } finally {
      setProcessingId(null)
    }
  }

  const handleRequestResponse = async (id: string, requestId: string, accept: boolean) => {
    setProcessingId(id)
    try {
      const res = accept ? await approveFamilyRequest(requestId) : await rejectFamilyRequest(requestId)
      if (res.success) {
        await handleDelete(id)
        Alert.alert('Success', accept ? 'Family request accepted!' : 'Family request declined.')
      } else {
        Alert.alert('Error', 'Failed to process request.')
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred.')
    } finally {
      setProcessingId(null)
    }
  }

  const displayItems = activeFilter === 'unread' ? items.filter(i => !i.read) : items

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Messages"
        subtitle={`${unreadCount} unread notifications`}
        badgeCount={unreadCount}
        rightIcon={unreadCount > 0 ? 'checkmark-done-outline' : undefined}
        onRightPress={handleMarkAll}
      />

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        <TouchableOpacity 
          style={[styles.filterTab, activeFilter === 'all' && styles.filterTabActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterTab, activeFilter === 'unread' && styles.filterTabActive]}
          onPress={() => setActiveFilter('unread')}
        >
          <View style={styles.unreadFilterWrap}>
            <Text style={[styles.filterText, activeFilter === 'unread' && styles.filterTextActive]}>Unread</Text>
            {unreadCount > 0 && <View style={styles.unreadBadgeSmall}><Text style={styles.unreadBadgeText}>{unreadCount}</Text></View>}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && items.length === 0 && (
          <View style={{ marginTop: 40 }}><ActivityIndicator color={theme.colors.primary} /></View>
        )}

        {!isLoading && displayItems.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="mail-open-outline" size={40} color={theme.colors.mutedForeground} />
            </View>
            <Text style={styles.emptyTitle}>Empty Inbox</Text>
            <Text style={styles.emptySubtext}>
              {activeFilter === 'unread' ? "You've read all your messages!" : "No notifications yet."}
            </Text>
          </View>
        )}

        {displayItems.map((item) => {
          const meta = getTypeMeta(item.type)
          const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload
          const isSafety = item.type === 'safety_check'
          const isRequest = item.type === 'family_request'
          const isProcessing = processingId === item.id

          return (
            <View key={item.id} style={[styles.alertCard, !item.read && styles.alertUnread]}>
              {!item.read && <View style={[styles.unreadBar, { backgroundColor: meta.color }]} />}
              
              <View style={styles.cardContainer}>
                <TouchableOpacity 
                  style={styles.cardMain}
                  onPress={() => handleMarkRead(item.id, item.read)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.alertIconWrap, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>

                  <View style={styles.alertBody}>
                    <View style={styles.alertTopRow}>
                      <Text style={[styles.alertType, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
                      <Text style={styles.alertTime}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={[styles.alertTitle, !item.read && { fontWeight: '900' }]}>{item.title}</Text>
                    {item.body ? <Text style={styles.alertBody2} numberOfLines={2}>{item.body}</Text> : null}
                    
                    {/* Action Buttons for Safety Check */}
                    {isSafety && !item.read && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity 
                          style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                          disabled={isProcessing}
                          onPress={() => handleSafetyResponse(item.id, payload.from_user_id, 'safe')}
                        >
                          <Text style={styles.actionBtnText}>I'M SAFE</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                          disabled={isProcessing}
                          onPress={() => handleSafetyResponse(item.id, payload.from_user_id, 'danger')}
                        >
                          <Text style={styles.actionBtnText}>HELP</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Action Buttons for Family Request */}
                    {isRequest && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity 
                          style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
                          disabled={isProcessing}
                          onPress={() => handleRequestResponse(item.id, payload.request_id, true)}
                        >
                          <Text style={styles.actionBtnText}>ACCEPT</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.actionBtn, { backgroundColor: '#64748b' }]}
                          disabled={isProcessing}
                          onPress={() => handleRequestResponse(item.id, payload.request_id, false)}
                        >
                          <Text style={styles.actionBtnText}>DECLINE</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <Text style={styles.alertDate}>
                      {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>
          )
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12 },

  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterTabActive: {
    backgroundColor: theme.colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  filterTextActive: {
    color: '#fff',
  },
  unreadFilterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadBadgeSmall: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 5,
    borderRadius: 10,
    minWidth: 16,
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },

  emptyState:    { alignItems: 'center', paddingVertical: 80, gap: 14 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:    { fontSize: 20, fontWeight: '800', color: theme.colors.foreground },
  emptySubtext:  { color: theme.colors.mutedForeground, textAlign: 'center', paddingHorizontal: 40 },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  cardContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardMain: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  alertUnread: {
    borderColor: theme.colors.primary,
    backgroundColor: '#f8fafc',
  },
  unreadBar: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
  },
  alertIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertBody:    { flex: 1, gap: 4 },
  alertTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  alertType:    { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  alertTime:    { fontSize: 11, color: theme.colors.mutedForeground },
  alertTitle:   { fontSize: 15, fontWeight: '700', color: theme.colors.foreground, lineHeight: 20 },
  alertBody2:   { fontSize: 13, color: theme.colors.mutedForeground, lineHeight: 18 },
  alertDate:    { fontSize: 11, color: theme.colors.mutedForeground, marginTop: 4 },
  
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },

  deleteBtn: {
    padding: 16,
    justifyContent: 'center',
  }
})