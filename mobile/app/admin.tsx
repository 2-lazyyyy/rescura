import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { theme } from '../src/theme'
import { fetchAdminOverview } from '../src/services/admin'
import { useSession } from '../src/lib/session'

export default function AdminScreen() {
  const { user } = useSession()
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState({ organizations: 0, users: 0, pendingPins: 0, unreadNotifications: 0 })

  useEffect(() => {
    const load = async () => {
      const result = await fetchAdminOverview()
      if (result.success && result.overview) setOverview(result.overview)
      setLoading(false)
    }
    load()
  }, [])

  const forbidden = user?.role !== 'admin'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Admin Panel</Text>
      <Text style={styles.subtitle}>Web admin insights adapted for mobile with platform-level counters.</Text>

      {forbidden ? <Text style={styles.warn}>You are not an admin account.</Text> : null}
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}

      <View style={styles.grid}>
        <View style={styles.card}><Text style={styles.label}>Organizations</Text><Text style={styles.value}>{overview.organizations}</Text></View>
        <View style={styles.card}><Text style={styles.label}>Users</Text><Text style={styles.value}>{overview.users}</Text></View>
        <View style={styles.card}><Text style={styles.label}>Pending Pins</Text><Text style={styles.value}>{overview.pendingPins}</Text></View>
        <View style={styles.card}><Text style={styles.label}>Unread Notifications</Text><Text style={styles.value}>{overview.unreadNotifications}</Text></View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.foreground },
  subtitle: { color: theme.colors.mutedForeground, lineHeight: 20 },
  warn: { color: theme.colors.destructive, fontWeight: '700' },
  grid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  card: { width: '48%', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14 },
  label: { color: theme.colors.mutedForeground, fontSize: 12, textTransform: 'uppercase' },
  value: { color: theme.colors.foreground, fontSize: 24, fontWeight: '800' },
})
