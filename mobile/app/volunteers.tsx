import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { theme } from '../src/theme'
import { fetchAllVolunteers } from '../src/services/volunteers'

export default function VolunteersScreen() {
  const [rows, setRows] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const result = await fetchAllVolunteers()
      if (result.success) setRows(result.volunteers || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((item) =>
      `${item.name} ${item.email} ${item.organization_id || ''}`.toLowerCase().includes(q)
    )
  }, [rows, query])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Volunteers</Text>
      <Text style={styles.subtitle}>Mobile view of response volunteers and status from organization membership data.</Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder='Search volunteers'
        placeholderTextColor={theme.colors.mutedForeground}
        style={styles.input}
      />

      {loading ? <ActivityIndicator color={theme.colors.primary} /> : null}

      {filtered.map((volunteer) => (
        <View key={`${volunteer.org_member_id}-${volunteer.id}`} style={styles.card}>
          <Text style={styles.name}>{volunteer.name}</Text>
          <Text style={styles.meta}>{volunteer.email || 'no-email'}</Text>
          <Text style={styles.meta}>Role: {volunteer.role} • Status: {volunteer.status}</Text>
        </View>
      ))}

      {!loading && filtered.length === 0 ? <Text style={styles.empty}>No volunteers found.</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.foreground },
  subtitle: { color: theme.colors.mutedForeground, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.foreground },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 4 },
  name: { color: theme.colors.foreground, fontWeight: '800' },
  meta: { color: theme.colors.mutedForeground },
  empty: { color: theme.colors.mutedForeground, paddingVertical: 12 },
})
