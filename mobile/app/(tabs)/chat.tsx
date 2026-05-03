import { useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { theme } from '../../src/theme'
import { askAssistant } from '../../src/services/ai'

type AssistantKind = 'emergency' | 'mental'
type ChatLanguage = 'en' | 'my' | 'th' | 'vi' | 'id' | 'ms'
type ChatRow = { role: 'assistant' | 'user'; content: string; id: string; time: string }

type SegmentOption<T extends string> = { value: T; label: string; icon: keyof typeof Ionicons.glyphMap }

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={segStyles.wrap}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <TouchableOpacity
            key={opt.value}
            style={[segStyles.btn, active && segStyles.btnActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={opt.icon}
              size={16}
              color={active ? theme.colors.primaryForeground : theme.colors.mutedForeground}
            />
            <Text style={[segStyles.label, active && segStyles.labelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const segStyles = StyleSheet.create({
  wrap:       { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, padding: 4, gap: 4 },
  btn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  btnActive:  { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  label:      { fontSize: 13, fontWeight: '700', color: theme.colors.mutedForeground },
  labelActive:{ color: theme.colors.primaryForeground },
})

const ASSISTANT_OPTS: SegmentOption<AssistantKind>[] = [
  { value: 'emergency', label: 'Emergency',     icon: 'flash-outline' },
  { value: 'mental',    label: 'Mental Health',  icon: 'heart-outline' },
]

const ASEAN_LANGS: { value: ChatLanguage; label: string; flag: string }[] = [
  { value: 'en', label: 'English',    flag: '🇺🇸' },
  { value: 'my', label: 'မြန်မာ',      flag: '🇲🇲' },
  { value: 'th', label: 'ไทย',        flag: '🇹🇭' },
  { value: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { value: 'id', label: 'Bahasa ID',  flag: '🇮🇩' },
  { value: 'ms', label: 'Bahasa MY',  flag: '🇲🇾' },
]

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList>(null)

  const [assistant, setAssistant] = useState<AssistantKind>('emergency')
  const [language, setLanguage]   = useState<ChatLanguage>('en')
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [message, setMessage]     = useState('')
  const [messages, setMessages]   = useState<ChatRow[]>([
    { id: 'welcome', role: 'assistant', content: 'Ask for emergency guidance, first aid, or calming support.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  ])
  const [isSending, setIsSending] = useState(false)

  const send = async () => {
    if (!message.trim()) return
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMessage = message.trim()
    const userRow: ChatRow = { id: `u-${Date.now()}`, role: 'user', content: userMessage, time: now }
    setMessages((prev) => [...prev, userRow])
    setMessage('')
    setIsSending(true)

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)

    try {
      const result = await askAssistant(userMessage, language as any, assistant)
      const aiRow: ChatRow = { id: `a-${Date.now()}`, role: 'assistant', content: result.response, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      setMessages((prev) => [...prev, aiRow])
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
    } catch (error) {
      Alert.alert('AI error', error instanceof Error ? error.message : 'Unable to reach the assistant')
    } finally {
      setIsSending(false)
    }
  }

  const renderBubble = ({ item }: { item: ChatRow }) => {
    const isUser = item.role === 'user'
    return (
      <View style={[bubbleStyles.wrap, isUser ? bubbleStyles.wrapUser : bubbleStyles.wrapAI]}>
        {!isUser && (
          <View style={bubbleStyles.avatar}>
            <Ionicons name="shield-checkmark" size={12} color="#fff" />
          </View>
        )}
        <View style={isUser ? bubbleStyles.bubbleColUser : bubbleStyles.bubbleColAI}>
          <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.bubbleUser : bubbleStyles.bubbleAI]}>
            <Text style={[bubbleStyles.text, isUser ? bubbleStyles.textUser : bubbleStyles.textAI]}>
              {item.content}
            </Text>
          </View>
          <Text style={[bubbleStyles.time, isUser ? bubbleStyles.timeUser : bubbleStyles.timeAI]}>{item.time}</Text>
        </View>
      </View>
    )
  }

  const subtitleText = assistant === 'emergency' ? 'Emergency & First Aid' : 'Mental Health Support'

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ===== Safe-area-aware header ===== */}
      <ScreenHeader title="AI Assistant" subtitle={subtitleText} />

      {/* ===== Controls ===== */}
      <View style={styles.topBar}>
        <View style={styles.assistantTabs}>
          <SegmentControl options={ASSISTANT_OPTS} value={assistant} onChange={setAssistant} />
        </View>
        
        <View style={styles.langSelectorWrap}>
          <TouchableOpacity 
            style={styles.langBtn} 
            onPress={() => setShowLangMenu(!showLangMenu)}
            activeOpacity={0.7}
          >
            <Ionicons name="globe-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.langBtnText}>{ASEAN_LANGS.find(l => l.value === language)?.flag}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== Language Selection Overlay (Simplified) ===== */}
      {showLangMenu && (
        <View style={styles.langMenu}>
          {ASEAN_LANGS.map((l) => (
            <TouchableOpacity 
              key={l.value} 
              style={[styles.langMenuItem, language === l.value && styles.langMenuItemActive]}
              onPress={() => { setLanguage(l.value); setShowLangMenu(false); }}
            >
              <Text style={styles.langMenuFlag}>{l.flag}</Text>
              <Text style={[styles.langMenuLabel, language === l.value && styles.langMenuLabelActive]}>{l.label}</Text>
              {language === l.value && <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ===== Message thread ===== */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderBubble}
        contentContainerStyle={styles.thread}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {/* ===== Composer ===== */}
      <View style={[styles.composer, { paddingBottom: 20 }]}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={assistant === 'emergency' ? 'Describe the emergency…' : 'Share how you feel…'}
          placeholderTextColor={theme.colors.mutedForeground}
          style={styles.input}
          multiline
          maxLength={600}
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!message.trim() || isSending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!message.trim() || isSending}
        >
          <Ionicons
            name={isSending ? 'hourglass-outline' : 'send'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const bubbleStyles = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginVertical: 6, paddingHorizontal: 16 },
  wrapUser:   { justifyContent: 'flex-end' },
  wrapAI:     { justifyContent: 'flex-start' },
  avatar:     { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 },
  bubbleColUser: { alignItems: 'flex-end', flexShrink: 1, marginLeft: 48 },
  bubbleColAI:   { alignItems: 'flex-start', flexShrink: 1, marginRight: 48 },
  bubble:     { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  bubbleUser: { backgroundColor: theme.colors.primary, borderTopRightRadius: 4, alignSelf: 'flex-end' },
  bubbleAI:   { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderTopLeftRadius: 4, alignSelf: 'flex-start' },
  text:       { fontSize: 15, lineHeight: 22 },
  textUser:   { color: '#fff', fontWeight: '500' },
  textAI:     { color: '#1e293b' },
  time:       { fontSize: 10, marginTop: 4, color: theme.colors.mutedForeground, fontWeight: '600' },
  timeUser:   { marginRight: 4 },
  timeAI:     { marginLeft: 4 },
})

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },

  // Controls bar (below header)
  controls: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },

  // Thread
  thread: { paddingVertical: 16, gap: 4, flexGrow: 1 },

  // Controls bar redesigned
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 },
  assistantTabs: { flex: 1 },
  langSelectorWrap: { width: 54, height: 44, borderRadius: 12, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  langBtn: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  langBtnText: { fontSize: 10 },

  // Language Menu
  langMenu: { position: 'absolute', top: 120, right: 16, backgroundColor: '#fff', borderRadius: 16, padding: 8, zIndex: 100, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', width: 160 },
  langMenuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderRadius: 10 },
  langMenuItemActive: { backgroundColor: '#f0f9ff' },
  langMenuFlag: { fontSize: 18 },
  langMenuLabel: { flex: 1, fontSize: 14, color: '#475569', fontWeight: '500' },
  langMenuLabelActive: { color: theme.colors.primary, fontWeight: '700' },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#1e293b',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
})