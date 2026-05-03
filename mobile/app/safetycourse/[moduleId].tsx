import { useMemo, useState, useEffect } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { theme } from '../../src/theme'
import { safetyModules } from '../../src/data/safety-modules'
import { safetyLessons } from '../../src/data/safety-lessons'

export default function SafetyCourseDetailScreen() {
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>()
  const [isCompleted, setIsCompleted] = useState(false)
  const [saving, setSaving] = useState(false)

  const module = useMemo(() => safetyModules.find((item) => item.id === moduleId), [moduleId])
  const lesson = useMemo(() => safetyLessons.find((item) => item.moduleId === moduleId), [moduleId])

  useEffect(() => {
    const checkCompletion = async () => {
      const stored = await AsyncStorage.getItem('completedModules')
      if (stored) {
        const list = JSON.parse(stored) as string[]
        if (list.includes(moduleId)) setIsCompleted(true)
      }
    }
    checkCompletion()
  }, [moduleId])

  const handleComplete = async () => {
    setSaving(true)
    try {
      const stored = await AsyncStorage.getItem('completedModules')
      let list: string[] = stored ? JSON.parse(stored) : []
      if (!list.includes(moduleId)) {
        list.push(moduleId)
        await AsyncStorage.setItem('completedModules', JSON.stringify(list))
        setIsCompleted(true)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  if (!module) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Module not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerCategory}>{module.category.toUpperCase()}</Text>
          <Text style={styles.headerTitle}>{module.title}</Text>
          <View style={styles.headerMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.metaText}>{lesson?.duration || '15 min'}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Ionicons name="book-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.metaText}>{lesson?.steps.length || 0} Lessons</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Description Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.description}>{module.description}</Text>
        </View>

        {/* Guided Lessons Section */}
        {lesson && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Guided Lessons</Text>
            <View style={styles.stepsContainer}>
              {lesson.steps.map((step, idx) => (
                <View key={step.id} style={styles.stepCard}>
                  <View style={styles.stepNumberWrap}>
                    <Text style={styles.stepNumber}>{idx + 1}</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepText}>{step.content}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Video Training Section */}
        {module.videoUrl && (
          <TouchableOpacity 
            style={styles.videoCard} 
            onPress={() => Linking.openURL(module.videoUrl as string)}
          >
            <View style={styles.videoIconWrap}>
              <Ionicons name="play" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.videoTextWrap}>
              <Text style={styles.videoTitle}>Video Training</Text>
              <Text style={styles.videoSub}>Watch a detailed demonstration</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>
        )}

        {/* Footer Action */}
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.completeBtn, isCompleted && styles.completeBtnDisabled]}
            onPress={handleComplete}
            disabled={isCompleted || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={isCompleted ? "checkmark-circle" : "checkmark"} size={20} color="#fff" />
                <Text style={styles.completeBtnText}>
                  {isCompleted ? 'Module Completed' : 'Mark as Complete'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  header: {
    backgroundColor: theme.colors.primary,
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  headerContent: { gap: 8 },
  headerCategory: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  metaDivider: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  content: { padding: 24, gap: 32, paddingBottom: 100 },
  section: { gap: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  description: { fontSize: 16, color: '#64748b', lineHeight: 24 },
  stepsContainer: { gap: 16 },
  stepCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  stepNumberWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stepContent: { flex: 1, gap: 4 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  stepText: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  videoIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTextWrap: { flex: 1, gap: 2 },
  videoTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  videoSub: { fontSize: 13, color: '#64748b' },
  footer: { marginTop: 8 },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 18,
    borderRadius: 20,
    gap: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  completeBtnDisabled: {
    backgroundColor: '#059669',
    shadowOpacity: 0,
    elevation: 0,
  },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  backBtnText: { fontWeight: '700', color: '#64748b' },
  title: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
})
