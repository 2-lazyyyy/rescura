import { useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { theme } from '../../../src/theme'
import { safetyLessons } from '../../../src/data/safety-lessons'

const COMPLETED_KEY = 'completedSafetyLessons'
const POINTS_KEY = 'safetyPoints'

export default function SafetyLessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const lesson = useMemo(() => safetyLessons.find((entry) => entry.id === id), [id])
  const [stepIndex, setStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)

  if (!lesson) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Lesson not found</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/safety')}>
          <Text style={styles.secondaryButtonText}>Back to Safety</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const current = lesson.steps[stepIndex]
  const progress = Math.round(((stepIndex + 1) / lesson.steps.length) * 100)
  const isLast = stepIndex === lesson.steps.length - 1

  const completeLesson = async () => {
    setSaving(true)
    try {
      const completedRaw = await AsyncStorage.getItem(COMPLETED_KEY)
      const completed = completedRaw ? (JSON.parse(completedRaw) as string[]) : []
      const alreadyCompleted = completed.includes(lesson.id)

      if (!alreadyCompleted) {
        const nextCompleted = [...completed, lesson.id]
        await AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify(nextCompleted))

        const pointsRaw = await AsyncStorage.getItem(POINTS_KEY)
        const currentPoints = Number(pointsRaw || '0')
        const nextPoints = currentPoints + lesson.rewardPoints
        await AsyncStorage.setItem(POINTS_KEY, String(nextPoints))

        Alert.alert('Lesson Completed', `You earned +${lesson.rewardPoints} points.`)
      } else {
        Alert.alert('Lesson Reviewed', 'You already earned points for this lesson.')
      }

      router.replace('/safety')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{lesson.title}</Text>
      <Text style={styles.subtitle}>{lesson.category} • {lesson.duration}</Text>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>Step {stepIndex + 1} / {lesson.steps.length} • {progress}%</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.stepTitle}>{current.title}</Text>
        <Text style={styles.stepBody}>{current.content}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.secondaryButton, stepIndex === 0 && styles.disabledButton]}
          disabled={stepIndex === 0 || saving}
          onPress={() => setStepIndex((prev) => Math.max(0, prev - 1))}
        >
          <Text style={styles.secondaryButtonText}>Previous</Text>
        </TouchableOpacity>

        {!isLast ? (
          <TouchableOpacity
            style={styles.primaryButton}
            disabled={saving}
            onPress={() => setStepIndex((prev) => Math.min(lesson.steps.length - 1, prev + 1))}
          >
            <Text style={styles.primaryButtonText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryButton} disabled={saving} onPress={completeLesson}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Complete Lesson'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 30 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.background, padding: 16 },
  title: { color: theme.colors.foreground, fontWeight: '800', fontSize: 24 },
  subtitle: { color: theme.colors.mutedForeground },
  progressWrap: { gap: 8 },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: theme.colors.muted, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 999, backgroundColor: theme.colors.primary },
  progressText: { color: theme.colors.mutedForeground, fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 14, gap: 8 },
  stepTitle: { color: theme.colors.foreground, fontWeight: '800', fontSize: 18 },
  stepBody: { color: theme.colors.foreground, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primaryButton: { flex: 1, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center', paddingVertical: 13 },
  primaryButtonText: { color: theme.colors.primaryForeground, fontWeight: '800' },
  secondaryButton: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, alignItems: 'center', paddingVertical: 13 },
  secondaryButtonText: { color: theme.colors.foreground, fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
})
