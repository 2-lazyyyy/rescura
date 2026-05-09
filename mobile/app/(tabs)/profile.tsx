import { useEffect, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
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
import { checkModelExists, downloadModel, deleteModel } from '../../src/services/offlineAi'
import * as Updates from 'expo-updates'
import * as ImagePicker from 'expo-image-picker'
import { uploadProfileImage } from '../../src/services/storage'
import { updateUserProfileImage } from '../../src/services/auth'
import AsyncStorage from '@react-native-async-storage/async-storage'

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
    { label: 'Organizations',  route: 'https://rescura.vercel.app/login',  icon: 'business-outline',       description: 'Find organizations' },
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
  const { user, logout, refreshSession } = useSession()
  const [supplyCount, setSupplyCount] = useState<number | null>(null)
  const [isVolunteer, setIsVolunteer] = useState(false)
  const [orgName, setOrgName] = useState<string | null>(null)

  // Offline AI States
  const [modelExists, setModelExists] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  // OTA Updates State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

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
    checkModelExists().then(setModelExists)
  }, [user])

  const handleDownloadModel = async () => {
    Alert.alert(
      "Download Offline AI",
      "This will download a ~350MB AI model to your device for emergency assistance without internet. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Download", 
          onPress: async () => {
            setIsDownloading(true);
            setDownloadProgress(0);
            const success = await downloadModel((progress) => setDownloadProgress(progress));
            setIsDownloading(false);
            if (success) {
              setModelExists(true);
              Alert.alert("Success", "Offline AI model downloaded successfully.");
            } else {
              Alert.alert("Error", "Failed to download the model.");
            }
          }
        }
      ]
    )
  }

  const handleDeleteModel = async () => {
    Alert.alert(
      "Remove Offline AI",
      "Are you sure you want to delete the offline AI model? This will free up ~350MB of storage.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteModel();
            setModelExists(false);
            Alert.alert("Deleted", "Offline AI model removed.");
          }
        }
      ]
    )
  }

  const handleCheckUpdate = async () => {
    try {
      setIsCheckingUpdate(true)
      const update = await Updates.checkForUpdateAsync()
      
      if (update.isAvailable) {
        Alert.alert(
          "Update Available",
          "A new version of the app is available. Would you like to download and install it now?",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Update Now", 
              onPress: async () => {
                try {
                  await Updates.fetchUpdateAsync();
                  Alert.alert("Success", "Update downloaded! The app will now restart.", [
                    { text: "OK", onPress: () => Updates.reloadAsync() }
                  ]);
                } catch (e) {
                  Alert.alert("Error", "Failed to download update.");
                }
              }
            }
          ]
        )
      } else {
        Alert.alert("Up to Date", "You are already running the latest version of the app.");
      }
    } catch (error) {
      Alert.alert("Error", "Could not check for updates. Make sure you are connected to the internet.");
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    router.replace('/auth')
  }

  const handlePickImage = async () => {
    if (!user) return
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera roll permissions to upload a profile picture.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    })

    if (!result.canceled && result.assets[0]) {
      setIsUploading(true)
      try {
        const uploadRes = await uploadProfileImage(result.assets[0].uri, user.id)
        if (uploadRes.success && uploadRes.publicUrl) {
          const dbRes = await updateUserProfileImage(user.id, uploadRes.publicUrl, user.isOrg || false)
          if (dbRes.success) {
            // Update local session
            const updatedUser = { ...user, image: uploadRes.publicUrl }
            await AsyncStorage.setItem('linyone_mobile_user', JSON.stringify(updatedUser))
            Alert.alert('Success', 'Profile picture updated!')
            await refreshSession()
          } else {
            Alert.alert('Error', dbRes.error || 'Failed to update profile')
          }
        } else {
          Alert.alert('Error', uploadRes.error || 'Failed to upload image')
        }
      } catch (err) {
        Alert.alert('Error', 'An unexpected error occurred')
      } finally {
        setIsUploading(false)
      }
    }
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
          <TouchableOpacity 
            style={styles.avatarRing} 
            onPress={handlePickImage}
            disabled={isUploading}
          >
            <LinearGradient colors={[theme.colors.primary, '#7c3aed']} style={styles.avatar}>
              {isUploading ? (
                <ActivityIndicator color="#fff" />
              ) : user?.image ? (
                <View style={{ width: '100%', height: '100%', borderRadius: 45, overflow: 'hidden' }}>
                  <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
                    <Image 
                      source={{ uri: user.image }} 
                      style={{ width: '100%', height: '100%' }} 
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </LinearGradient>
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
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

        {/* ===== App Settings ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>App Settings</Text>
          <TouchableOpacity
            style={[styles.shortcutRow, styles.shortcutRowLast]}
            onPress={handleCheckUpdate}
            activeOpacity={0.7}
            disabled={isCheckingUpdate}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: '#f3e8ff' }]}>
              {isCheckingUpdate ? (
                <ActivityIndicator size="small" color="#9333ea" />
              ) : (
                <Ionicons name="cloud-download-outline" size={20} color="#9333ea" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shortcutLabel}>Check for Updates</Text>
              <Text style={styles.shortcutDesc}>Get the latest OTA features</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* ===== Offline AI Manager ===== */}
        <View style={[styles.card, { borderColor: modelExists ? '#10b981' : theme.colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 4 }}>
            <Text style={[styles.cardTitle, { paddingTop: 0, paddingBottom: 0, fontSize: 13, fontWeight: '700', color: theme.colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Offline AI System</Text>
            {modelExists && <Ionicons name="checkmark-circle" size={20} color="#10b981" />}
          </View>
          
          <View style={{ paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, color: theme.colors.foreground, marginBottom: 12 }}>
              {modelExists 
                ? "The emergency AI model is downloaded and ready to assist you without an internet connection." 
                : "Download the offline AI model (~350MB) to get emergency assistance even when you lose internet access."}
            </Text>
            
            {isDownloading ? (
              <View style={{ backgroundColor: '#f1f5f9', padding: 12, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.primary, marginBottom: 6 }}>
                  Downloading... {Math.round(downloadProgress * 100)}%
                </Text>
                <View style={{ width: '100%', height: 6, backgroundColor: '#cbd5e1', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${downloadProgress * 100}%`, height: '100%', backgroundColor: theme.colors.primary }} />
                </View>
              </View>
            ) : modelExists ? (
              <TouchableOpacity 
                style={{ backgroundColor: '#fee2e2', paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                onPress={handleDeleteModel}
              >
                <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 }}>Remove Model (Free Storage)</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={{ backgroundColor: theme.colors.primary, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                onPress={handleDownloadModel}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Download Offline AI</Text>
              </TouchableOpacity>
            )}
          </View>
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
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  }
})