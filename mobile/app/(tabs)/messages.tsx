import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
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
import { useSession } from '../../src/lib/session'
import {
  fetchFamilyMembers,
  fetchConversation,
  markConversationAsRead,
  sendMessage,
  sendSafetyCheck,
  subscribeToConversation,
} from '../../src/services/family'
import { supabase } from '../../src/lib/supabase'

export default function MessagesScreen() {
  const { user } = useSession()
  const insets   = useSafeAreaInsets()
  const listRef  = useRef<FlatList>(null)

  const [familyMembers, setFamilyMembers] = useState<any[]>([])
  const [selectedMember, setSelectedMember] = useState<any | null>(null)
  const [messages, setMessages]   = useState<any[]>([])
  const [draft, setDraft]         = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [sending, setSending]     = useState(false)
  const lastReadPairRef = useRef<string | null>(null)

  const loadMembers = useCallback(async () => {
    if (!user?.id) return
    const members = await fetchFamilyMembers(user.id)
    setFamilyMembers(members as any[])
    const first = Array.isArray(members[0]?.member) ? members[0]?.member?.[0] : members[0]?.member
    if (!selectedMember && first?.id) setSelectedMember(first)
  }, [user?.id, selectedMember])

  const loadMessages = useCallback(async () => {
    if (!user?.id || !selectedMember?.id) { setMessages([]); return }
    setLoadingThread(true)
    const thread = await fetchConversation(user.id, selectedMember.id)
    setMessages(thread)
    await markConversationAsRead(user.id, selectedMember.id)
    lastReadPairRef.current = `${user.id}:${selectedMember.id}`
    setLoadingThread(false)
  }, [user?.id, selectedMember?.id])

  useEffect(() => { loadMembers() }, [loadMembers])
  useEffect(() => { loadMessages() }, [loadMessages])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages])

  useEffect(() => {
    if (!user?.id || !selectedMember?.id) return undefined
    const channel = subscribeToConversation(user.id, selectedMember.id, (incoming) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev
        return [...prev, incoming]
      })
      if (incoming.receiver_id === user.id && incoming.sender_id === selectedMember.id) {
        void markConversationAsRead(user.id, selectedMember.id)
        lastReadPairRef.current = `${user.id}:${selectedMember.id}`
      }
    })
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, selectedMember?.id])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadMembers()
    await loadMessages()
    setRefreshing(false)
  }

  const onSend = async () => {
    if (!user?.id || !selectedMember?.id || !draft.trim()) return
    setSending(true)
    const result = await sendMessage(user.id, selectedMember.id, draft.trim())
    setSending(false)
    if (!result.success) { Alert.alert('Send failed', result.error || 'Unable to send message'); return }
    setDraft('')
    await loadMessages()
  }

  const onSafetyCheck = async () => {
    if (!user?.id || !selectedMember?.id) return
    const result = await sendSafetyCheck(user.id, selectedMember.id)
    if (!result.success) { Alert.alert('Safety check failed', 'Unable to send safety check'); return }
    Alert.alert('✅ Safety check sent', `${selectedMember.name} has been notified.`)
  }

  const renderMessage = ({ item: msg }: { item: any }) => {
    const isMe = msg.sender_id === user?.id
    return (
      <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {msg.content}
          </Text>
        </View>
        {msg.created_at && (
          <Text style={[styles.bubbleTime, isMe ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScreenHeader title="Family" subtitle="Stay connected with your family network" />

      {/* ===== Member picker ===== */}
      <View style={styles.memberPickerWrap}>
        <FlatList
          data={familyMembers}
          keyExtractor={(entry) => entry.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.memberRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={styles.noFamilyWrap}>
              <Ionicons name="people-outline" size={20} color={theme.colors.mutedForeground} />
              <Text style={styles.noFamilyText}>No family links yet.</Text>
            </View>
          }
          renderItem={({ item: entry }) => {
            const member = Array.isArray(entry.member) ? entry.member[0] : entry.member
            const isSelected = selectedMember?.id === member?.id
            return (
              <TouchableOpacity
                style={[styles.memberChip, isSelected && styles.memberChipActive]}
                onPress={() => setSelectedMember(member)}
              >
                <View style={[styles.memberAvatar, isSelected && styles.memberAvatarActive]}>
                  <Text style={[styles.memberAvatarText, isSelected && { color: theme.colors.primary }]}>
                    {(member?.name || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.memberName, isSelected && styles.memberNameActive]} numberOfLines={1}>
                    {member?.name || 'Member'}
                  </Text>
                  <Text style={[styles.memberRelation, isSelected && styles.memberNameActive]}>
                    {entry.relation || 'family'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      {/* ===== Thread header ===== */}
      {selectedMember && (
        <View style={styles.threadHeader}>
          <View style={styles.threadAvatar}>
            <Text style={styles.threadAvatarText}>{(selectedMember.name || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.threadName}>{selectedMember.name}</Text>
            <Text style={styles.threadStatus}>Family member</Text>
          </View>
          <TouchableOpacity
            style={styles.safetyBtn}
            onPress={onSafetyCheck}
            disabled={!selectedMember?.id}
          >
            <Ionicons name="shield-checkmark" size={18} color="#059669" />
            <Text style={styles.safetyBtnText}>Safety check</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== Message thread ===== */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.threadContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyThread}>
            {loadingThread ? (
              <>
                <Ionicons name="chatbubble-outline" size={36} color={theme.colors.mutedForeground} />
                <Text style={styles.emptyThreadText}>Loading conversation…</Text>
              </>
            ) : (
              <>
                <Ionicons name="chatbubble-outline" size={36} color={theme.colors.mutedForeground} />
                <Text style={styles.emptyThreadText}>
                  {selectedMember ? `Start chatting with ${selectedMember.name}` : 'Select a family member above'}
                </Text>
              </>
            )}
          </View>
        }
      />

      {/* ===== Sticky Composer ===== */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={selectedMember ? `Message ${selectedMember.name}…` : 'Select a family member first'}
          placeholderTextColor={theme.colors.mutedForeground}
          style={styles.input}
          multiline
          maxLength={500}
          editable={!!selectedMember}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || !selectedMember || sending) && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!draft.trim() || !selectedMember || sending}
        >
          <Ionicons name={sending ? 'hourglass-outline' : 'send'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },

  // Member picker
  memberPickerWrap: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.card },
  memberRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.background, borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, minWidth: 110 },
  memberChipActive: { borderColor: theme.colors.primary, backgroundColor: '#ede9fe' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.muted, alignItems: 'center', justifyContent: 'center' },
  memberAvatarActive: { backgroundColor: '#ddd6fe' },
  memberAvatarText: { fontSize: 15, fontWeight: '800', color: theme.colors.mutedForeground },
  memberName: { fontWeight: '800', color: theme.colors.foreground, fontSize: 13 },
  memberNameActive: { color: theme.colors.primary },
  memberRelation: { color: theme.colors.mutedForeground, fontSize: 11, marginTop: 1 },
  noFamilyWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  noFamilyText: { color: theme.colors.mutedForeground, fontSize: 14 },

  // Thread header
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.background },
  threadAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  threadAvatarText: { fontSize: 18, fontWeight: '800', color: theme.colors.primaryForeground },
  threadName: { fontSize: 16, fontWeight: '800', color: theme.colors.foreground },
  threadStatus: { fontSize: 12, color: theme.colors.mutedForeground, marginTop: 2 },
  safetyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dcfce7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  safetyBtnText: { color: '#059669', fontWeight: '700', fontSize: 13 },

  // Thread / messages
  threadContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 4, flexGrow: 1 },
  emptyThread:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 60 },
  emptyThreadText: { color: theme.colors.mutedForeground, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  // Bubbles
  bubbleWrap:     { gap: 3, marginVertical: 3 },
  bubbleWrapMe:   { alignItems: 'flex-end' },
  bubbleWrapThem: { alignItems: 'flex-start' },
  bubble:         { maxWidth: '80%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  bubbleMe:       { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
  bubbleThem:     { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderBottomLeftRadius: 4 },
  bubbleText:     { fontSize: 15, lineHeight: 20 },
  bubbleTextMe:   { color: theme.colors.primaryForeground },
  bubbleTextThem: { color: theme.colors.foreground },
  bubbleTime:     { fontSize: 11, color: theme.colors.mutedForeground },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: theme.colors.foreground,
    fontSize: 15,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  sendBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
})