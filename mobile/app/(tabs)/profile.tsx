import { useEffect, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../../src/theme'
import { useSession } from '../../src/lib/session'
import { fetchOrganizationSupplies } from '../../src/services/organization'
import { getUserOrgMember } from '../../src/services/pins'
import { fetchOrganizationById } from '../../src/services/organizations'

// Types
type ShortcutItem = {
  label: string
  route: string
  icon: keyof typeof Ionicons.glyphMap
  description?: string
}

const ROLE_SHORTCUTS: Record<string, ShortcutItem[]> = {
  admin: [
    { label: 'Admin Panel',    route: '/admin',          icon: 'settings-outline',       description: 'System administration' },
    { label: 'Organizations',  route: '/organizations',  icon: 'business-outline',       description: 'Manage organizations' },
    { label: 'Volunteers',     route: '/volunteers',     icon: 'people-outline',         description: 'Volunteer network' },
  ],
  org: [
    { label: 'Org Console',    route: '/organization',   icon: 'briefcase-outline',      description: 'Your organization' },
    { label: 'Test Supplies',  route: '/test-supplies',  icon: 'cube-outline',           description: 'Supply management' },
    { label: 'Volunteers',     route: '/volunteers',     icon: 'people-outline',         description: 'Your volunteers' },
  ],
  user: [
    { label: 'Dashboard',      route: '/dashboard',      icon: 'grid-outline',           description: 'Family & safety overview' },
    { label: 'Safety Course',  route: '/safety',         icon: 'shield-checkmark-outline', description: 'Training modules' },
    { label: 'Organizations',  route: '/organizations',  icon: 'business-outline',       description: 'Find organizations' },
  ],
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={infoStyles.row}>
      {icon && (
        <View style={infoStyles.iconWrap}>
          <Ionicons name={icon} size={18} color={theme.colors.primary} />
        </View>
      )}
      <View style={infoStyles.text}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value}>{value}</Text>
      </View>
    </View>
  )
}

const infoStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 14 },
  iconWrap:{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text:    { flex: 1 },
  label:   { fontSize: 12, color: theme.colors.mutedForeground, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value:   { fontSize: 16, fontWeight: '700', color: theme.colors.foreground, marginTop: 2 },
})

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { user, logout } = useSession()
  const [supplyCount, setSupplyCount] = useState<number | null>(null)
  const [isVolunteer, setIsVolunteer] = useState(false)
  const [orgName, setOrgName] = useState<string | null>(null)

  const shortcuts = user?.role === 'admin'
    ? ROLE_SHORTCUTS.admin
    : user?.isOrg
      ? ROLE_SHORTCUTS.org
      : ROLE_SHORTCUTS.user

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return

      // If Organization
      if (user.isOrg && user.organizationId) {
        const result = await fetchOrganizationSupplies(user.organizationId)
        setSupplyCount(result.success ? result.supplies?.length ?? 0 : 0)
      }

      // Check if Volunteer
      if (!user.isOrg && user.role !== 'admin') {
        const member = await getUserOrgMember(user.id)
        if (member && member.status === 'active') {
          setIsVolunteer(true)
          if (member.organization_id) {
            const orgRes = await fetchOrganizationById(member.organization_id)
            if (orgRes.success) {
              setOrgName(orgRes.organization?.name || null)
            }
          }
        } else {
          setIsVolunteer(false)
          setOrgName(null)
        }
      }
    }
    load()
  }, [user])

  const handleLogout = async () => {
    await logout()
    router.replace('/auth')
  }

  const initials = (user?.name || 'U')
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const roleBadge = user?.role === 'admin' 
    ? 'Admin' 
    : user?.isOrg 
      ? 'Organization' 
      : isVolunteer 
        ? (orgName ? `Volunteer of ${orgName}` : 'Volunteer')
        : null

  const roleBadgeColor = user?.role === 'admin' ? '#dc2626' : user?.isOrg ? '#0ea5e9' : '#059669'
  const roleBadgeBg = user?.role === 'admin' ? '#fee2e2' : user?.isOrg ? '#e0f2fe' : '#dcfce7'

  return (
    <View style={styles.screen}>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ===== Avatar Hero ===== */}
        <LinearGradient
          colors={[theme.colors.primary + '22', theme.colors.primary + '08']}
          style={[styles.hero, { paddingTop: insets.top + 20 }]}
        >
          <View style={styles.avatarRing}>
            <LinearGradient colors={[theme.colors.primary, '#7c3aed']} style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroName}>{user?.name || 'Anonymous user'}</Text>
            <Text style={styles.heroEmail}>{user?.email || ''}</Text>
            {roleBadge && (
              <View style={[styles.rolePill, { backgroundColor: roleBadgeBg }]}>
                <Text style={[styles.rolePillText, { color: roleBadgeColor }]}>{roleBadge}</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* ===== Account Info ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account details</Text>
          <InfoRow label="Full name"     value={user?.name || '—'}            icon="person-outline" />
          <InfoRow label="Email"         value={user?.email || '—'}           icon="mail-outline" />
          <InfoRow label="Account type"  value={user?.accountType || 'user'}  icon="id-card-outline" />
          {user?.isOrg && (
            <InfoRow
              label="Org supplies"
              value={supplyCount === null ? 'Loading…' : `${supplyCount} items`}
              icon="cube-outline"
            />
          )}
        </View>

        {/* ===== Quick Actions ===== */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/alerts')}>
            <View style={[styles.actionIcon, { backgroundColor: '#ede9fe' }]}>
              <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
            </View>
            <Text style={styles.actionLabel}>Alerts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/pin')}>
            <View style={[styles.actionIcon, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="location-outline" size={22} color="#059669" />
            </View>
            <Text style={styles.actionLabel}>New Pin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(tabs)/messages')}>
            <View style={[styles.actionIcon, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="chatbubble-outline" size={22} color="#0ea5e9" />
            </View>
            <Text style={styles.actionLabel}>Family</Text>
          </TouchableOpacity>
        </View>

        {/* ===== Feature Shortcuts ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick shortcuts</Text>
          {shortcuts.map((s, i) => (
            <TouchableOpacity
              key={s.route}
              style={[styles.shortcutRow, i === shortcuts.length - 1 && styles.shortcutRowLast]}
              onPress={() => router.push(s.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: theme.colors.muted }]}>
                <Ionicons name={s.icon} size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shortcutLabel}>{s.label}</Text>
                {s.description && <Text style={styles.shortcutDesc}>{s.description}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ===== Logout ===== */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() =>
            Alert.alert('Sign out', 'Log out from this device?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: handleLogout },
            ])
          }
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <Text style={styles.logoutBtnText}>Log out</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 24, gap: 16 },

  // Hero
  hero: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 12 },
  avatarRing: { width: 96, height: 96, borderRadius: 48, padding: 3, backgroundColor: 'transparent', shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  avatar: { flex: 1, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#fff' },
  heroText:   { alignItems: 'center', gap: 4 },
  heroName:   { fontSize: 22, fontWeight: '800', color: theme.colors.foreground },
  heroEmail:  { fontSize: 14, color: theme.colors.mutedForeground },
  rolePill:   { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginTop: 4 },
  rolePillText: { fontWeight: '700', fontSize: 13 },

  // Card
  card:      { marginHorizontal: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingHorizontal: 16, overflow: 'hidden' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 16, paddingBottom: 4 },

  // Quick action buttons (icon tiles)
  actionsRow: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 10 },
  actionBtn:  { alignItems: 'center', gap: 8, flex: 1 },
  actionIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  actionLabel:{ fontSize: 13, fontWeight: '700', color: theme.colors.foreground },

  // Shortcuts
  shortcutRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, minHeight: 64 },
  shortcutRowLast: { borderBottomWidth: 0 },
  shortcutIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  shortcutLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.foreground },
  shortcutDesc:  { fontSize: 12, color: theme.colors.mutedForeground, marginTop: 2 },

  // Logout
  logoutBtn: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 20,
    paddingVertical: 16,
  },
  logoutBtnText: { color: '#dc2626', fontWeight: '800', fontSize: 16 },
})