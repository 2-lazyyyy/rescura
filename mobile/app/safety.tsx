import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { theme } from '../src/theme'
import { safetyModules } from '../src/data/safety-modules'
import { safetyLessons } from '../src/data/safety-lessons'

const COMPLETED_KEY = 'completedSafetyLessons'
const POINTS_KEY = 'safetyPoints'

export default function SafetyScreen() {
  const [points, setPoints] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      const loadProgress = async () => {
        const [pointsRaw, completedRaw] = await Promise.all([
          AsyncStorage.getItem(POINTS_KEY),
          AsyncStorage.getItem(COMPLETED_KEY),
        ])
        setPoints(Number(pointsRaw || '0'))
        const completed = completedRaw ? (JSON.parse(completedRaw) as string[]) : []
        setCompletedCount(completed.length)
      }

      loadProgress()
    }, [])
  )

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Safety Modules</Text>
      <Text style={styles.subtitle}>Course modules mirror the web training structure and keep quiz/video metadata.</Text>
      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>Learning Progress</Text>
        <Text style={styles.progressText}>Completed lessons: {completedCount} / {safetyLessons.length}</Text>
        <Text style={styles.progressText}>Total safety points: {points}</Text>
      </View>

      {safetyModules.map((module) => (
        <TouchableOpacity key={module.id} style={styles.card} onPress={() => router.push(`/safetycourse/${module.id}` as any)}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{module.title}</Text>
            <Text style={styles.points}>{module.point} pts</Text>
          </View>
          <Text style={styles.category}>{module.category}</Text>
          <Text style={styles.description}>{module.description}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.foreground },
  subtitle: { color: theme.colors.mutedForeground, lineHeight: 20 },
  progressCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 4 },
  progressTitle: { color: theme.colors.foreground, fontWeight: '800' },
  progressText: { color: theme.colors.mutedForeground },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.foreground, flex: 1 },
  points: { color: theme.colors.primary, fontWeight: '700' },
  category: { color: theme.colors.mutedForeground, fontSize: 12, textTransform: 'uppercase' },
  description: { color: theme.colors.foreground, lineHeight: 20 },
})
