import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native'
import MapboxWebView from '../../src/components/MapboxWebView'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  fetchAggregatedSuppliesByRegion,
  fetchPinsWithItems,
  isUserActiveTracker,
  getUserOrgMember,
  updatePinStatus,
} from '../../src/services/pins'
import { useSession } from '../../src/lib/session'
import { theme } from '../../src/theme'
import { supabase } from '../../src/lib/supabase'
import { fetchMapboxRoute } from '../../src/services/map'


const { height: SCREEN_H } = Dimensions.get('window')

export default function HomeScreen() {
  const { user } = useSession()
  const insets = useSafeAreaInsets()

  // Tab bar height matches _layout.tsx: 52 + insets.bottom
  const TAB_BAR_H = 52 + insets.bottom

  // Snap points: how much of the sheet is VISIBLE above the tab bar
  const SNAP_CLOSED = 72                       // just the handle
  const SNAP_HALF = SCREEN_H * 0.45          // half screen (max)

  // Animated top = SCREEN_H - TAB_BAR_H - visibleHeight
  const snapTopClosed = SCREEN_H - TAB_BAR_H - SNAP_CLOSED
  const snapTopHalf = SCREEN_H - TAB_BAR_H - SNAP_HALF

  const [pins, setPins] = useState<any[]>([])
  const [supplies, setSupplies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isTracker, setIsTracker] = useState(false)
  const [orgMemberId, setOrgMemberId] = useState<string | null>(null)
  const [confirmingPinId, setConfirmingPinId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([])
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null)
  const [routingPinId, setRoutingPinId] = useState<string | null>(null)  // tracks which pin is routing
  const [isFilteringPending, setIsFilteringPending] = useState(false)
  const [isLegendVisible, setIsLegendVisible] = useState(true)
  const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | undefined>(undefined)
  const rotateAnim = useRef(new Animated.Value(0)).current

  // ---- Bottom Sheet animation ----
  const sheetY = useRef(new Animated.Value(snapTopHalf)).current
  const lastY = useRef(snapTopHalf)

  const snapTo = (target: number) => {
    lastY.current = target
    Animated.spring(sheetY, { toValue: target, useNativeDriver: false, tension: 60, friction: 12 }).start()
  }

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        sheetY.stopAnimation((v) => {
          lastY.current = v
          sheetY.setValue(v)
        })
      },
      onPanResponderMove: (_, g) => {
        const next = lastY.current + g.dy
        // clamp between half-open (max) and just-peek
        sheetY.setValue(Math.max(snapTopHalf, Math.min(snapTopClosed, next)))
      },
      onPanResponderRelease: (_, g) => {
        const current = lastY.current + g.dy
        const midPoint = (snapTopClosed + snapTopHalf) / 2
        if (current < midPoint) snapTo(snapTopHalf)
        else snapTo(snapTopClosed)
      },
    }),
    [snapTopHalf, snapTopClosed]
  )

  // ---- Data loading ----
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pinsResult, suppliesResult] = await Promise.all([
        fetchPinsWithItems(),
        fetchAggregatedSuppliesByRegion(),
      ])
      setPins(pinsResult.success ? (pinsResult as any).pins || [] : [])
      setSupplies(suppliesResult.success ? (suppliesResult as any).regions || [] : [])
    } catch (error) {
      Alert.alert('Load failed', error instanceof Error ? error.message : 'Unable to load map data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
      ; (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({})
          setUserLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude })
        }
      })()
  }, [load])

  useEffect(() => {
    if (!user?.id) return
      ; (async () => {
        const tracker = await isUserActiveTracker(user.id)
        setIsTracker(tracker)
        if (tracker) {
          const member = await getUserOrgMember(user.id)
          setOrgMemberId(member?.id || null)
        }
      })()
  }, [user?.id])

  useEffect(() => {
    const ch = supabase
      .channel(`home:pins:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pin_items' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const region = useMemo(() => {
    if (userLocation) return { ...userLocation, latitudeDelta: 0.25, longitudeDelta: 0.25 }
    const first = pins[0]
    if (!first) return { latitude: 16.8409, longitude: 96.1735, latitudeDelta: 0.25, longitudeDelta: 0.25 }
    return { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.25, longitudeDelta: 0.25 }
  }, [pins, userLocation])

  const handleCalculateRoute = async (pin: any) => {
    if (!userLocation) { Alert.alert('Location Required', 'Your location is needed to calculate a route.'); return }
    setRoutingPinId(pin.id)
    try {
      const res = await fetchMapboxRoute(userLocation.longitude, userLocation.latitude, pin.longitude, pin.latitude)
      if (res.success && res.coordinates) {
        setRouteCoordinates(res.coordinates)
        setRouteInfo({ distance: res.distance, duration: res.duration })
        snapTo(snapTopClosed) // collapse sheet to show map
      } else {
        Alert.alert('Route Error', res.error || 'Could not calculate route')
      }
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setRoutingPinId(null)
    }
  }

  const clearRoute = () => { setRouteCoordinates([]); setRouteInfo(null) }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    return m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
  }

  const handleQuickConfirm = async (pin: any) => {
    if (!user?.id || !orgMemberId) { Alert.alert('Not authorized', 'You must be an active tracker to confirm pins.'); return }
    Alert.alert(
      'Confirm Pin',
      `Confirm this ${pin.type === 'damaged' ? 'help request' : 'safe location'} pin?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setConfirmingPinId(pin.id)
            try {
              const res = await updatePinStatus(pin.id, 'confirmed', orgMemberId, user.id)
              if (res.success) { Alert.alert('Success', 'Pin confirmed'); await load() }
              else Alert.alert('Failed', res.error || 'Could not confirm pin')
            } finally { setConfirmingPinId(null) }
          },
        },
      ]
    )
  }

  const toggleFilter = () => {
    const toValue = isFilteringPending ? 0 : 1
    setIsFilteringPending(!isFilteringPending)
    
    Animated.spring(rotateAnim, {
      toValue,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start()
  }

  // ---- Derived ----
  const pendingPins = pins.filter((p) => p.status === 'pending')
  const pendingCount = pendingPins.length
  const displayedPins = isFilteringPending ? pendingPins : pins

  return (
    <View style={styles.screen}>
      {/* ===== FULL-SCREEN MAP ===== */}
      {loading ? (
        <View style={styles.mapLoading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <MapboxWebView
          style={styles.map}
          pins={displayedPins}
          userLocation={userLocation}
          routeCoordinates={routeCoordinates}
          center={mapCenter || region}
          zoom={12}
          onPinPress={(pinId) => router.push(`/pin-details/${pinId}` as any)}
        />
      )}

      {/* ===== FLOATING HEADER ===== */}
      <View style={[styles.floatingHeader, { top: insets.top + 12 }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.88)']}
          style={styles.floatingHeaderInner}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
            <Image source={require('../../assets/icon.png')} style={{ width: 32, height: 32, borderRadius: 8 }} />
            <Text style={styles.floatingGreeting} numberOfLines={1}>
              {user ? `Hi, ${user.name?.split(' ')[0]} 👋` : 'Rescura'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.locationBtn}
            onPress={() => {
              if (userLocation) {
                setMapCenter({
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude,
                });
              } else {
                Alert.alert('Location unavailable', 'Please enable location services.');
              }
            }}
          >
            <Ionicons name="navigate" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* ===== MAP LEGEND ===== */}
      <View style={[styles.legend, { top: insets.top + 95 }]}>
        <TouchableOpacity 
          style={styles.legendHeader} 
          onPress={() => setIsLegendVisible(!isLegendVisible)}
          activeOpacity={0.7}
        >
          <Text style={styles.legendTitle}>Legend</Text>
          <Ionicons name={isLegendVisible ? "eye" : "eye-off"} size={16} color={theme.colors.mutedForeground} />
        </TouchableOpacity>
        
        {isLegendVisible && (
          <View style={styles.legendContent}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.legendText}>Damaged Location</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.legendText}>Safe Zone</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendSmallDot, { backgroundColor: '#facc15' }]} />
              <Text style={styles.legendText}>Pending</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendSmallDot, { backgroundColor: '#4ade80' }]} />
              <Text style={styles.legendText}>Confirmed</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendSmallDot, { backgroundColor: '#60a5fa' }]} />
              <Text style={styles.legendText}>Completed</Text>
            </View>
          </View>
        )}
      </View>

      {/* ===== ROUTE INFO OVERLAY ===== */}
      {routeInfo && (
        <View style={[styles.routeOverlay, { bottom: SCREEN_H - lastY.current + 24 }]}>
          <Ionicons name="navigate-circle" size={22} color="#8b5cf6" />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.routeTime}>{formatDuration(routeInfo.duration)}</Text>
            <Text style={styles.routeDistance}>{(routeInfo.distance / 1000).toFixed(1)} km</Text>
          </View>
          <TouchableOpacity onPress={clearRoute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={22} color={theme.colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      )}

      {/* ===== FAB — Confirm Pin (Volunteers Only) ===== */}
      {isTracker && pendingCount > 0 && (
        <Animated.View
          style={[
            styles.fab,
            styles.confirmFab,
            {
              left: 20,
              bottom: sheetY.interpolate({
                inputRange: [snapTopHalf, snapTopClosed],
                outputRange: [SCREEN_H - snapTopHalf - 65, SCREEN_H - snapTopClosed - 65],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.fabInner}
            onPress={toggleFilter}
            activeOpacity={0.85}
          >
            <LinearGradient 
              colors={isFilteringPending ? ['#ef4444', '#dc2626'] : ['#059669', '#059669']} 
              style={styles.fabGradient}
            >
              <Animated.View style={{ 
                transform: [{ 
                  rotate: rotateAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '90deg']
                  })
                }] 
              }}>
                <Ionicons 
                  name={isFilteringPending ? "close" : "checkmark"} 
                  size={28} 
                  color="#fff" 
                />
              </Animated.View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ===== FAB — Report Pin ===== */}
      {/* bottom tracks sheetY so FAB always floats 16pt above the sheet */}
      <Animated.View
        style={[
          styles.fab,
          {
            bottom: sheetY.interpolate({
              inputRange: [snapTopHalf, snapTopClosed],
              outputRange: [SCREEN_H - snapTopHalf - 65, SCREEN_H - snapTopClosed - 65],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.fabInner}
          onPress={() => router.push('/pin')}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[theme.colors.primary, '#7c3aed']} style={styles.fabGradient}>
            <Ionicons name="add" size={28} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ===== ANIMATED BOTTOM SHEET ===== */}
      {/* bottom: 0 fills behind the tab bar (no gap). Tab bar renders on top. */}
      {/* Snap points account for TAB_BAR_H so the handle stays above the nav bar. */}
      <Animated.View style={[styles.sheet, { top: sheetY, bottom: 0 }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.sheetHandle}>
          <View style={styles.handleBar} />
          <Text style={styles.sheetTitle}>
            {isFilteringPending ? 'Pending Pins' : 'Recent Pins'}
          </Text>
          <TouchableOpacity
            onPress={() => {
              // If it's near the top (half-open), close it. Otherwise open to half.
              const isClosed = Math.abs(lastY.current - snapTopClosed) < 10
              snapTo(isClosed ? snapTopHalf : snapTopClosed)
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={Math.abs(lastY.current - snapTopHalf) < 10 ? 'chevron-down' : 'chevron-up'}
              size={20}
              color={theme.colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.sheetContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={theme.colors.primary} />}
          showsVerticalScrollIndicator={false}
        >


          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: '#ef4444' }]}>
              <Text style={[styles.statValue, { color: '#ef4444' }]}>{pins.length}</Text>
              <Text style={styles.statLabel}>Incidents</Text>
            </View>
            <View style={[styles.statCard, { borderColor: '#f59e0b' }]}>
              <Text style={[styles.statValue, { color: '#f59e0b' }]}>{pendingCount}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={[styles.statCard, { borderColor: '#10b981' }]}>
              <Text style={[styles.statValue, { color: '#10b981' }]}>{supplies.length}</Text>
              <Text style={styles.statLabel}>Supply Zones</Text>
            </View>
          </View>

          {/* Pin cards */}
          {displayedPins.length === 0 && !loading && (
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={40} color={theme.colors.mutedForeground} />
              <Text style={styles.emptyTitle}>
                {isFilteringPending ? 'No pending pins' : 'No pins yet'}
              </Text>
              <Text style={styles.emptySubtext}>
                {isFilteringPending ? 'All reported incidents are confirmed.' : 'Tap the + button to report a new pin.'}
              </Text>
            </View>
          )}

          {displayedPins.slice(0, 10).map((pin) => (
            <TouchableOpacity
              key={pin.id}
              style={styles.pinCard}
              onPress={() => router.push(`/pin-details/${pin.id}` as any)}
              activeOpacity={0.8}
            >
              {/* Left accent */}
              <View style={[styles.pinAccent, pin.type === 'damaged' ? styles.accentDanger : styles.accentSafe]} />

              <View style={styles.pinBody}>
                {/* Header row */}
                <View style={styles.pinHeader}>
                  <View style={styles.pinTypeRow}>
                    <Ionicons
                      name={pin.type === 'damaged' ? 'warning' : 'checkmark-circle'}
                      size={18}
                      color={pin.type === 'damaged' ? '#dc2626' : '#059669'}
                    />
                    <Text style={styles.pinTypeText}>
                      {pin.type === 'damaged' ? 'Help Request' : 'Safe Location'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, pin.status === 'confirmed' ? styles.statusConfirmed : styles.statusPending]}>
                    <Text style={styles.statusText}>{pin.status}</Text>
                  </View>
                </View>

                {/* Description */}
                <Text style={styles.pinDesc} numberOfLines={2}>
                  {pin.description || 'No description provided'}
                </Text>

                {/* Footer row */}
                <Text style={styles.pinMeta}>
                  {(pin.items || []).length} items attached
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.pinActions}>
                {isTracker && pin.status === 'pending' && (
                  <TouchableOpacity
                    style={[styles.confirmBtn, confirmingPinId === pin.id && styles.disabledBtn]}
                    onPress={() => handleQuickConfirm(pin)}
                    disabled={confirmingPinId === pin.id}
                  >
                    {confirmingPinId === pin.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="checkmark" size={18} color="#fff" />
                    }
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.routeBtn, routingPinId === pin.id && styles.disabledBtn]}
                  onPress={() => handleCalculateRoute(pin)}
                  disabled={routingPinId === pin.id}
                >
                  {routingPinId === pin.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="navigate" size={18} color="#fff" />
                  }
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  map: { ...StyleSheet.absoluteFillObject },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  // markerWrap: {
  //   alignItems: 'center',
  //   justifyContent: 'flex-start',
  //   width: 40,
  //   height: 52,
  // },
  // statusDot: {
  //   width: 10,
  //   height: 10,
  //   borderRadius: 5,
  //   position: 'absolute',
  //   bottom: 2,
  //   borderWidth: 2,
  //   borderColor: '#ffffff',
  // },

  // Floating header
  floatingHeader: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  floatingHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  floatingGreeting: { fontSize: 16, fontWeight: '800', color: theme.colors.foreground },
  locationBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 10
  },

  legend: {
    position: 'absolute', right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 12, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    zIndex: 10
  },
  legendHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  legendTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.foreground },
  legendContent: { marginTop: 6, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendSmallDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 2 },
  legendText: { fontSize: 11, color: theme.colors.mutedForeground, fontWeight: '500' },

  // Route overlay
  routeOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  routeTime: { fontSize: 15, fontWeight: '800', color: theme.colors.foreground },
  routeDistance: { fontSize: 13, color: theme.colors.mutedForeground, marginTop: 1 },

  // FAB
  fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, elevation: 12, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  fabInner: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden' },
  fabGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confirmFab: { 
    shadowColor: '#059669', 
    shadowOpacity: 0.4
  },

  // Bottom sheet (bottom is set inline to TAB_BAR_H)
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, position: 'absolute', top: 8, alignSelf: 'center', left: '50%', marginLeft: -20 },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: theme.colors.foreground, marginTop: 6 },
  sheetContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  // Chips
  chipsRow: { gap: 10, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, minWidth: 90 },
  chipLabel: { color: theme.colors.foreground, fontWeight: '700', fontSize: 13 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, fontWeight: '800', color: theme.colors.foreground },
  statLabel: { fontSize: 11, color: theme.colors.mutedForeground, fontWeight: '600', textAlign: 'center' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.foreground },
  emptySubtext: { color: theme.colors.mutedForeground, textAlign: 'center', lineHeight: 20 },

  // Pin card
  pinCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 80,
  },
  pinAccent: { width: 5 },
  accentDanger: { backgroundColor: '#dc2626' },
  accentSafe: { backgroundColor: '#059669' },
  pinBody: { flex: 1, padding: 14, gap: 6 },
  pinHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pinTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinTypeText: { fontWeight: '800', color: theme.colors.foreground, fontSize: 14 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusConfirmed: { backgroundColor: '#dcfce7' },
  statusPending: { backgroundColor: '#fef9c3' },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  pinDesc: { color: theme.colors.mutedForeground, fontSize: 13, lineHeight: 18 },
  pinMeta: { color: theme.colors.mutedForeground, fontSize: 12 },
  pinActions: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 },

  confirmBtn: {
    backgroundColor: '#059669',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBtn: {
    backgroundColor: '#8b5cf6',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  disabledBtn: { opacity: 0.45 },
})