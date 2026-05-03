import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { theme } from '../src/theme'
import { useSession } from '../src/lib/session'
import { fetchOrganizationSupplies } from '../src/services/organization'
import { fetchVolunteersForOrganization } from '../src/services/volunteers'

export default function OrganizationScreen() {
  const { user } = useSession()
  const [supplyRows, setSupplyRows] = useState<any[]>([])
  const [volunteers, setVolunteers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!user?.organizationId) {
        setLoading(false)
        return
      }

      const [suppliesRes, volunteersRes] = await Promise.all([
        fetchOrganizationSupplies(user.organizationId),
        fetchVolunteersForOrganization(user.organizationId),
      ])

      if (suppliesRes.success) setSupplyRows(suppliesRes.supplies || [])
      if (volunteersRes.success) setVolunteers(volunteersRes.volunteers || [])
      setLoading(false)
    }
    load()
  }, [user?.organizationId])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Organization Console</Text>
      <Text style={styles.subtitle}>Mobile organization dashboard with volunteer and supply snapshots.</Text>

      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Supplies</Text>
          <Text style={styles.statValue}>{supplyRows.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Volunteers</Text>
          <Text style={styles.statValue}>{volunteers.length}</Text>
        </View>
      </View>

      <Text style={styles.section}>Recent Supplies</Text>
      {supplyRows.slice(0, 8).map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{item.name || item.category || 'Supply'}</Text>
          <Text style={styles.meta}>Qty: {item.quantity || 0} {item.unit || ''}</Text>
        </View>
      ))}

      <Text style={styles.section}>Volunteers</Text>
      {volunteers.slice(0, 8).map((item) => (
        <View key={item.org_member_id || item.id} style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{item.role} • {item.status}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.foreground },
  subtitle: { color: theme.colors.mutedForeground, lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14 },
  statLabel: { color: theme.colors.mutedForeground, fontSize: 12, textTransform: 'uppercase' },
  statValue: { color: theme.colors.foreground, fontSize: 24, fontWeight: '800' },
  section: { color: theme.colors.foreground, fontSize: 16, fontWeight: '800', marginTop: 6 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 4 },
  name: { color: theme.colors.foreground, fontWeight: '800' },
  meta: { color: theme.colors.mutedForeground },
})
