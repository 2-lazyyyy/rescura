import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { theme } from '../src/theme'
import { fetchOrganizations } from '../src/services/organizations'

export default function OrganizationsScreen() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const result = await fetchOrganizations()
      if (result.success) setRows(result.organizations || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Organizations</Text>
      <Text style={styles.subtitle}>Shared organization directory, filtered and summarized for mobile usage.</Text>

      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}

      {rows.map((org) => (
        <View key={org.id} style={styles.card}>
          <Text style={styles.name}>{org.name}</Text>
          <Text style={styles.meta}>{org.region || 'Unknown region'} • {org.status || 'pending'}</Text>
          <Text style={styles.meta}>{org.email || 'no-email'} • {org.phone || 'no-phone'}</Text>
        </View>
      ))}

      {!loading && rows.length === 0 ? <Text style={styles.empty}>No organizations found.</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.foreground },
  subtitle: { color: theme.colors.mutedForeground, lineHeight: 20 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 4 },
  name: { color: theme.colors.foreground, fontWeight: '800' },
  meta: { color: theme.colors.mutedForeground },
  empty: { color: theme.colors.mutedForeground, paddingVertical: 12 },
})
