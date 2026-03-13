'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useLanguage } from '@/hooks/use-language'
import { fetchFamilyMembers, fetchConversation, sendMessage, subscribeToConversation, markConversationAsRead } from '@/services/family'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Users, MessageCircle, Send } from 'lucide-react'

export default function MessagesPage() {
  const { user, isAuthenticated } = useAuth()
  const { t } = useLanguage()
  const [members, setMembers] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const subRef = useRef<any>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!isAuthenticated || !user?.id) return
      try {
        const links = await fetchFamilyMembers(user.id)
        if (!mounted) return
        const mapped = (links || []).map((l: any) => ({
          id: l.member?.id ?? l.id,
          name: l.member?.name ?? 'Unknown',
          phone: l.member?.phone ?? ''
        }))
        setMembers(mapped)
        if (mapped.length > 0 && !selected) setSelected(mapped[0])
      } catch (err) {
        console.error('failed to load family', err)
      }
    }
    load()
    return () => { mounted = false }
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    // load conversation when selected changes
    let mounted = true
    if (!selected || !user?.id) return
    const loadConv = async () => {
      setLoading(true)
      try {
        const msgs = await fetchConversation(user.id, selected.id)
        if (!mounted) return
        setMessages(msgs || [])
        // mark read for messages where I'm the receiver
        await markConversationAsRead(user.id, selected.id)
      } catch (err) {
        console.error('failed to load conversation', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadConv()

    // subscribe
    if (subRef.current && subRef.current.unsubscribe) {
      try { subRef.current.unsubscribe() } catch {}
      subRef.current = null
    }
    subRef.current = subscribeToConversation(user.id, selected.id, (m: any) => {
      setMessages((prev) => [...prev, m])
    })

    return () => {
      mounted = false
      try { if (subRef.current && subRef.current.unsubscribe) subRef.current.unsubscribe() } catch {}
    }
  }, [selected?.id, user?.id])

  useEffect(() => {
    // scroll to bottom on message change
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!text.trim() || !user?.id || !selected) return
    setIsSending(true)
    try {
      const res = await sendMessage(user.id, selected.id, text.trim())
      // optimistic append
      setMessages((m) => [...m, res])
      setText('')
    } catch (err) {
      console.error('send failed', err)
    } finally {
      setIsSending(false)
    }
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center">Please login to view messages</div>
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-[90rem] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="w-4 h-4" />{t('messages.title') || 'Family'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${selected?.id === m.id ? 'bg-blue-50' : 'hover:bg-gray-100'}`} onClick={() => setSelected(m)}>
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{(m.name || 'U').charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.phone}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="flex flex-col h-[70vh]">
            <CardHeader>
              <CardTitle>{selected?.name ?? 'Select a family member'}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-4">
              <div className="space-y-3">
                {loading && <div className="text-sm text-gray-500">Loading...</div>}
                {messages.map((m: any, idx: number) => (
                  <div key={m.id ?? idx} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] p-2 rounded ${m.sender_id === user?.id ? 'bg-blue-600 text-white' : 'bg-white border'}`}>
                      <div className="text-sm">{m.content}</div>
                      <div className="text-xs text-gray-400 mt-1">{new Date(m.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            </CardContent>

            <div className="p-4 border-t bg-white">
              <div className="flex gap-2">
                <Input placeholder={t('messages.typeSomething') || 'Type a message...'} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }} />
                <Button
                  onClick={handleSend}
                  isLoading={isSending}
                  loadingText=""
                  disabled={isSending || !text.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
