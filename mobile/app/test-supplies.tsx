import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSession } from '../src/lib/session'
import { theme } from '../src/theme'
import { fetchOrganizationSupplies } from '../src/services/organization'

export default function TestSuppliesScreen() {
  const { user } = useSession()
  const [rows, setRows] = useState<any[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!user?.organizationId) return
      const result = await fetchOrganizationSupplies(user.organizationId)
      if (result.success) setRows(result.supplies || [])
    }
    load()
  }, [user?.organizationId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((item) => `${item.name || ''} ${item.category || ''}`.toLowerCase().includes(q))
  }, [rows, query])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Test Supplies</Text>
      <Text style={styles.subtitle}>Mobile supply table parity for the web test-supplies workflow.</Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder='Search items'
        placeholderTextColor={theme.colors.mutedForeground}
        style={styles.input}
      />

      {filtered.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{item.name || 'Unnamed'}</Text>
          <Text style={styles.meta}>{item.category || 'other'} • {item.quantity || 0} {item.unit || ''}</Text>
        </View>
      ))}

      {filtered.length === 0 ? <Text style={styles.empty}>No supplies found for this account.</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.foreground },
  subtitle: { color: theme.colors.mutedForeground, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.card, color: theme.colors.foreground },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 4 },
  name: { color: theme.colors.foreground, fontWeight: '800' },
  meta: { color: theme.colors.mutedForeground },
  empty: { color: theme.colors.mutedForeground, paddingVertical: 12 },
})
