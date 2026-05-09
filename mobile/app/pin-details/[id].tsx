import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../../src/lib/session'
import { theme } from '../../src/theme'
import {
  cancelPin,
  createPinItems,
  fetchItems,
  fetchPinByIdWithItems,
  getUserOrgMember,
  isUserActiveTracker,
  updatePinItemQuantity,
  updatePinStatus,
} from '../../src/services/pins'
import { analyzePin } from '../../src/services/ai'
import { reverseGeocode } from '../../src/services/map'

type ItemRow = { id: string; name: string; unit?: string | null }

// ── Info row component ────────────────────────────────────────────────────
function InfoRow({ label, value, icon }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={infoStyles.row}>
      {icon && (
        <View style={infoStyles.iconWrap}>
          <Ionicons name={icon} size={16} color={theme.colors.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value}>{value}</Text>
      </View>
    </View>
  )
}
const infoStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 },
  iconWrap:{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:   { fontSize: 11, color: theme.colors.mutedForeground, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  value:   { fontSize: 15, fontWeight: '700', color: theme.colors.foreground, marginTop: 2 },
})

// ── Qty stepper ───────────────────────────────────────────────────────────
function QtyStepper({ value, onDecrement, onIncrement, disabled }: { value: number; onDecrement: () => void; onIncrement: () => void; disabled?: boolean }) {
  return (
    <View style={qtyStyles.row}>
      <TouchableOpacity style={[qtyStyles.btn, disabled && qtyStyles.btnDisabled]} onPress={onDecrement} disabled={disabled}>
        <Ionicons name="remove" size={16} color={theme.colors.foreground} />
      </TouchableOpacity>
      <Text style={qtyStyles.val}>{value}</Text>
      <TouchableOpacity style={[qtyStyles.btn, disabled && qtyStyles.btnDisabled]} onPress={onIncrement} disabled={disabled}>
        <Ionicons name="add" size={16} color={theme.colors.foreground} />
      </TouchableOpacity>
    </View>
  )
}
const qtyStyles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn:        { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
  btnDisabled:{ opacity: 0.4 },
  val:        { minWidth: 26, textAlign: 'center', color: theme.colors.foreground, fontWeight: '800', fontSize: 15 },
})

// ── Main screen ───────────────────────────────────────────────────────────
export default function PinDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useSession()
  const insets = useSafeAreaInsets()

  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [pin, setPin]               = useState<any | null>(null)
  const [availableItems, setAvailableItems] = useState<ItemRow[]>([])
  const [trackerSelectedItems, setTrackerSelectedItems] = useState<Map<string, number>>(new Map())
  const [isTracker, setIsTracker]   = useState(false)
  const [orgMemberId, setOrgMemberId] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<any | null>(null)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [address, setAddress]       = useState<string | null>(null)

  const canEditConfirmed = useMemo(
    () => !!user && user.role === 'admin',
    [user]
  )

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoadError(null)
    try {
      const [pinRes, itemsRes] = await Promise.all([fetchPinByIdWithItems(id), fetchItems()])
      if (!pinRes.success) { setPin(null); setLoadError(pinRes.error || 'Pin not found'); return }
      const pinData = pinRes.pin
      setPin(pinData)
      setAvailableItems(itemsRes.success ? (itemsRes.items || []) : [])
      
      if (user?.id) {
        const tracker = await isUserActiveTracker(user.id)
        setIsTracker(tracker)
        if (tracker) { const member = await getUserOrgMember(user.id); setOrgMemberId(member?.id || null) }
      }

      // Reverse geocode
      if (pinData!.latitude && pinData!.longitude) {
        const geoRes = await reverseGeocode(pinData!.longitude, pinData!.latitude)
        if (geoRes.success) setAddress(geoRes.address)
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load pin detail')
    } finally {
      setLoading(false)
    }
  }, [id, user?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const runSuggestion = async () => {
      const isAuthorized = isTracker || user?.role === 'admin'
      if (!isAuthorized || !pin || pin.status !== 'pending' || trackerSelectedItems.size > 0 || availableItems.length === 0) return
      const text = (pin.description || '').trim()
      if (text.length < 6) return
      setIsAnalyzing(true)
      try {
        const suggestion = await analyzePin({ description: text, allowedItems: availableItems.map((i) => i.name) })
        setAiSuggestion(suggestion)
        
        if (suggestion.isValid) {
          const mapped = new Map<string, number>()
          suggestion.items.forEach((s: any) => {
            const target = availableItems.find((i) => i.name.toLowerCase() === s.name.toLowerCase())
            if (target) mapped.set(target.id, Math.max(1, Number(s.qty) || 1))
          })
          if (mapped.size > 0) setTrackerSelectedItems(mapped)
        }
      } catch { /* keep manual mode */ } finally { setIsAnalyzing(false) }
    }
    runSuggestion()
  }, [availableItems, isTracker, user?.role, pin, trackerSelectedItems.size])

  const onConfirmWithItems = async () => {
    const isAuthorized = isTracker || user?.role === 'admin'
    if (!pin?.id || !user?.id || !isAuthorized) return
    
    // Admins might not have an orgMemberId, so we check if tracker first
    let memberId = orgMemberId
    if (!memberId && user.role === 'admin') {
      // For admins who aren't active members of any specific org in 'org-member' table, 
      // we might need a fallback or just use their user ID if the schema allows.
      // But updatePinStatus requires confirmedByMemberId.
      // Let's check if they ARE in org-member first.
      const member = await getUserOrgMember(user.id)
      memberId = member?.id || null
    }

    if (!memberId && user.role !== 'admin') {
       Alert.alert('Error', 'Organization membership required to confirm pins.')
       return
    }

    setSaving(true)
    try {
      const confirmRes = await updatePinStatus(pin.id, 'confirmed', memberId || undefined, user.id, user.role)
      if (!confirmRes.success) { Alert.alert('Unable to confirm', confirmRes.error || 'Failed to confirm pin'); return }
      if (trackerSelectedItems.size > 0) {
        const payload = Array.from(trackerSelectedItems.entries()).map(([itemId, qty]) => ({ item_id: itemId, requested_qty: qty, remaining_qty: qty }))
        const itemsRes = await createPinItems(pin.id, payload)
        if (!itemsRes.success) Alert.alert('Partial success', itemsRes.error || 'Pin confirmed but item save failed')
      }
      await load()
      setTrackerSelectedItems(new Map())
      Alert.alert('✅ Success', 'Pin confirmed successfully')
    } finally { setSaving(false) }
  }

  const onCancelPin = async () => {
    if (!pin?.id || !user?.id) return
    Alert.alert('Confirm Reject', 'Are you sure you want to reject/cancel this pin report?', [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Reject Pin',
        style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try {
            const res = await cancelPin(pin.id, user.id, user.role || null)
            if (res.success) {
              Alert.alert('Success', 'Pin report has been rejected.')
              router.back()
            } else {
              Alert.alert('Error', res.error || 'Failed to reject pin.')
            }
          } finally {
            setSaving(false)
          }
        }
      }
    ])
  }

  const onAdjustRemaining = async (pinItemId: string, currentRemaining: number, next: number) => {
    if (!pin?.id || !canEditConfirmed) return
    const targetItem = (pin.items || []).find((item: any) => item.id === pinItemId)
    const maxAllowed = Number(targetItem?.requested_qty ?? currentRemaining)
    const normalized = Math.max(0, Math.min(next, maxAllowed))
    setSaving(true)
    try {
      const res = await updatePinItemQuantity(pinItemId, normalized)
      if (!res.success) { Alert.alert('Failed', res.error || 'Unable to update item'); return }
      await load()
    } finally { setSaving(false) }
  }


  // ── Page header (safe-area-aware) ──────────────────────────────────────
  const PageHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <View style={[styles.pageHeader, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.foreground} />
      </TouchableOpacity>
      <View style={styles.pageHeaderMid}>
        <Text style={styles.pageHeaderTitle}>{title}</Text>
        {subtitle && <Text style={styles.pageHeaderSub}>{subtitle}</Text>}
      </View>
      <View style={{ width: 40 }} />
    </View>
  )

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.screen}>
        <PageHeader title="Pin Detail" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading pin details…</Text>
        </View>
      </View>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (!pin) {
    return (
      <View style={styles.screen}>
        <PageHeader title="Pin Detail" />
        <View style={styles.centered}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="warning-outline" size={40} color="#dc2626" />
          </View>
          <Text style={styles.errorTitle}>Unable to load pin</Text>
          <Text style={styles.errorSub}>{loadError || 'This pin is unavailable right now.'}</Text>
          <View style={styles.errorBtns}>
            <TouchableOpacity style={styles.secondaryButton} onPress={load}>
              <Ionicons name="refresh-outline" size={16} color={theme.colors.foreground} />
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={16} color="#fff" />
              <Text style={styles.primaryButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  const isPending   = pin.status === 'pending'
  const isConfirmed = pin.status === 'confirmed'
  const isDamaged   = pin.type === 'damaged'

  const statusColor = isPending ? '#d97706' : isConfirmed ? '#059669' : '#0ea5e9'
  const statusBg    = isPending ? '#fef3c7' : isConfirmed ? '#dcfce7' : '#e0f2fe'

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <PageHeader
        title="Pin Detail"
        subtitle={isDamaged ? '🆘 Help request' : '✅ Safe location'}
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>

        {/* ===== Hero status banner ===== */}
        <LinearGradient
          colors={isDamaged ? ['#fee2e2', '#fff5f5'] : ['#dcfce7', '#f0fdf4']}
          style={styles.heroBanner}
        >
          <View style={[styles.heroBannerIcon, { backgroundColor: isDamaged ? '#fecaca' : '#bbf7d0' }]}>
            <Ionicons name={isDamaged ? 'warning' : 'shield-checkmark'} size={28} color={isDamaged ? '#dc2626' : '#059669'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroBannerType, { color: isDamaged ? '#dc2626' : '#059669' }]}>
              {isDamaged ? 'Damage / Help request' : 'Safe location'}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>{pin.status}</Text>
            </View>
          </View>
        </LinearGradient>

        {loadError && (
          <View style={styles.inlineError}>
            <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
            <Text style={styles.inlineErrorText}>{loadError}</Text>
          </View>
        )}

        {/* ===== Pin image ===== */}
        {pin.image_url && (
          <View style={styles.imageCard}>
            <Image source={{ uri: pin.image_url }} style={styles.pinImage} resizeMode="cover" />
          </View>
        )}

        {/* ===== Pin info card ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <InfoRow label="Description" value={pin.description || 'No description'} icon="document-text-outline" />
          <InfoRow label="Contact phone" value={pin.phone || '—'} icon="call-outline" />
          <InfoRow
            label="Location"
            value={address || `${pin.latitude?.toFixed?.(5)}, ${pin.longitude?.toFixed?.(5)}`}
            icon="location-outline"
          />
          <InfoRow
            label="Uploaded At"
            value={pin.createdAt ? new Date(pin.createdAt).toLocaleString() : '—'}
            icon="time-outline"
          />
          <View style={[infoStyles.row, { borderBottomWidth: 0 }]}>
            <View style={infoStyles.iconWrap}>
              <Ionicons name="person-outline" size={16} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={infoStyles.label}>Reported by</Text>
              <Text style={infoStyles.value}>{pin.user?.name || pin.user?.email || 'Anonymous user'}</Text>
            </View>
          </View>
        </View>

        {/* ===== Pending + Authorized: confirm with items ===== */}
        {isPending && (isTracker || user?.role === 'admin') && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Manage Pending Pin</Text>

            {isAnalyzing && (
              <View style={styles.aiAnalyzingBox}>
                <ActivityIndicator size="small" color="#8b5cf6" />
                <Text style={styles.aiAnalyzingText}>AI is analyzing report details…</Text>
              </View>
            )}

            {!isAnalyzing && aiSuggestion && (
              <View style={styles.aiSuggestionBox}>
                <View style={[
                  styles.aiHeader,
                  { backgroundColor: aiSuggestion.severity >= 0.8 ? '#dc2626' : aiSuggestion.severity >= 0.5 ? '#eab308' : '#16a34a' }
                ]}>
                  <View style={styles.aiHeaderTitleRow}>
                    <Ionicons name="sparkles" size={16} color="#fff" />
                    <Text style={styles.aiHeaderText}>AI Analysis Result</Text>
                  </View>
                  <View style={styles.aiSeverityBadge}>
                    <Text style={styles.aiSeverityText}>{Math.round(aiSuggestion.severity * 100)}% Severity</Text>
                  </View>
                </View>
                
                <View style={styles.aiContent}>
                  {aiSuggestion.categories && aiSuggestion.categories.length > 0 && (
                    <View style={styles.aiCatsRow}>
                      {aiSuggestion.categories.map((cat: string, idx: number) => (
                        <View key={idx} style={styles.aiCatTag}>
                          <Text style={styles.aiCatTagText}>{cat}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  {aiSuggestion.items && aiSuggestion.items.length > 0 ? (
                    <View style={styles.aiItemsList}>
                      <Text style={styles.aiItemsTitle}>Recommended items:</Text>
                      {aiSuggestion.items.map((it: any, idx: number) => (
                        <View key={idx} style={styles.aiItemRow}>
                          <View style={styles.aiItemInfo}>
                            <View style={styles.aiItemIcon}>
                              <Ionicons name="cube-outline" size={14} color="#4f46e5" />
                            </View>
                            <Text style={styles.aiItemName}>{it.name}</Text>
                          </View>
                          <View style={styles.aiItemQty}>
                            <Text style={styles.aiItemQtyText}>× {it.qty}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.aiEmptyState}>
                      <Text style={styles.aiEmptyText}>No specific items suggested by AI</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {availableItems.map((item) => {
              const qty = trackerSelectedItems.get(item.id) || 0
              return (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.unit && <Text style={styles.itemUnit}>{item.unit}</Text>}
                  </View>
                  <QtyStepper
                    value={qty}
                    disabled={saving}
                    onDecrement={() => {
                      const next = Math.max(0, qty - 1)
                      const map = new Map(trackerSelectedItems)
                      if (next === 0) map.delete(item.id)
                      else map.set(item.id, next)
                      setTrackerSelectedItems(map)
                    }}
                    onIncrement={() => {
                      const map = new Map(trackerSelectedItems)
                      map.set(item.id, qty + 1)
                      setTrackerSelectedItems(map)
                    }}
                  />
                </View>
              )
            })}

            <View style={styles.actionContainer}>
              <TouchableOpacity
                style={[styles.confirmBtnWrap, saving && styles.disabledButton]}
                onPress={onConfirmWithItems}
                disabled={saving}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.colors.primary, '#6d28d9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmBtnGradient}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.confirmBtnText}>Confirm Report</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rejectBtn, saving && styles.disabledButton]}
                onPress={onCancelPin}
                disabled={saving}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={styles.rejectBtnText}>Reject Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ===== Pending, not a tracker ===== */}
        {isPending && !isTracker && (
          <View style={[styles.card, styles.infoCard]}>
            <Ionicons name="time-outline" size={20} color={theme.colors.mutedForeground} />
            <Text style={styles.infoCardText}>
              This pin is awaiting tracker confirmation. You can review the details above.
            </Text>
          </View>
        )}

        {/* ===== Confirmed: items progress ===== */}
        {isConfirmed && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Requested Items Progress</Text>
            {(pin.items || []).length === 0 ? (
              <Text style={styles.emptyText}>No items attached to this pin yet.</Text>
            ) : (
              (pin.items || []).map((pinItem: any) => (
                <View key={pinItem.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{pinItem.item?.name || 'Item'}</Text>
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.max(0, Math.min(100, (1 - (pinItem.remaining_qty ?? 0) / (pinItem.requested_qty || 1)) * 100))}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressLabel}>
                        {pinItem.remaining_qty ?? 0}/{pinItem.requested_qty ?? 0} left
                      </Text>
                    </View>
                  </View>
                  {canEditConfirmed && (
                    <QtyStepper
                      value={pinItem.remaining_qty ?? 0}
                      disabled={saving}
                      onDecrement={() => onAdjustRemaining(pinItem.id, pinItem.remaining_qty ?? 0, (pinItem.remaining_qty ?? 0) - 1)}
                      onIncrement={() => onAdjustRemaining(pinItem.id, pinItem.remaining_qty ?? 0, (pinItem.remaining_qty ?? 0) + 1)}
                    />
                  )}
                </View>
              ))
            )}

          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },

  // Safe-area page header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pageHeaderMid:   { flex: 1, alignItems: 'center' },
  pageHeaderTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.foreground },
  pageHeaderSub:   { fontSize: 12, color: theme.colors.mutedForeground, marginTop: 2 },

  // Scroll content
  content: { padding: 16, gap: 14 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },

  // Centered states
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { color: theme.colors.mutedForeground, marginTop: 8 },

  // Error state
  errorIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  errorTitle:    { fontSize: 20, fontWeight: '800', color: theme.colors.foreground, textAlign: 'center' },
  errorSub:      { color: theme.colors.mutedForeground, textAlign: 'center', lineHeight: 20 },
  errorBtns:     { flexDirection: 'row', gap: 12, marginTop: 8 },

  // Inline error
  inlineError:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fee2e2', borderRadius: 12, padding: 12 },
  inlineErrorText: { color: '#dc2626', fontSize: 13, fontWeight: '600', flex: 1 },

  // Hero banner
  heroBanner:     { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16 },
  heroBannerIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  heroBannerType: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  statusPill:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  statusDot:      { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },

  // Cards
  card:      { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, padding: 16, gap: 2 },
  imageCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, overflow: 'hidden', height: 240 },
  pinImage:  { width: '100%', height: '100%' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  // AI Box Styles
  aiAnalyzingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f5f3ff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#ddd6fe', borderStyle: 'dashed' },
  aiAnalyzingText: { color: '#7c3aed', fontSize: 14, fontWeight: '600' },
  
  aiSuggestionBox: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16, backgroundColor: '#fff' },
  aiHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  aiHeaderTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiHeaderText:    { color: '#fff', fontSize: 15, fontWeight: '800' },
  aiSeverityBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  aiSeverityText:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  
  aiContent:    { padding: 16, gap: 12 },
  aiCatsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aiCatTag:     { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#dbeafe' },
  aiCatTagText: { color: '#1d4ed8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  
  aiItemsList:  { gap: 8 },
  aiItemsTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.mutedForeground, marginBottom: 2 },
  aiItemRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  aiItemInfo:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiItemIcon:   { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  aiItemName:   { fontSize: 14, fontWeight: '600', color: theme.colors.foreground },
  aiItemQty:    { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  aiItemQtyText:{ fontSize: 13, fontWeight: '800', color: theme.colors.foreground },
  
  aiEmptyState: { padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#e2e8f0' },
  aiEmptyText:  { fontSize: 13, color: theme.colors.mutedForeground, fontStyle: 'italic' },

  // Info card (pending, not tracker)
  infoCard:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoCardText: { flex: 1, color: theme.colors.mutedForeground, fontSize: 14, lineHeight: 20 },

  // Items
  itemRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemName: { color: theme.colors.foreground, fontWeight: '700', fontSize: 14 },
  itemUnit: { color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 },

  // Progress bar
  progressWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 3, backgroundColor: '#059669' },
  progressLabel: { fontSize: 11, color: theme.colors.mutedForeground, fontWeight: '600', minWidth: 50 },

  // Empty
  emptyText: { color: theme.colors.mutedForeground, textAlign: 'center', paddingVertical: 12 },

  // Action Buttons Redesign
  actionContainer:  { gap: 12, marginTop: 16 },
  confirmBtnWrap:    { borderRadius: 16, overflow: 'hidden', elevation: 2, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  confirmBtnGradient:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  confirmBtnText:    { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  
  rejectBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#fee2e2', backgroundColor: '#fff' },
  rejectBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },

  disabledButton: { opacity: 0.55 },

  // Error action buttons (missing styles)
  secondaryButton:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
  secondaryButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.foreground },
  primaryButton:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, backgroundColor: theme.colors.primary },
  primaryButtonText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
})
