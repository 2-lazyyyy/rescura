'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  MessageCircle, Send, Bot, User, Mic, MicOff,
  AlertTriangle, Heart, Shield, MapPin, Phone, Brain,
  Paperclip, X
} from 'lucide-react'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'
import { askChat } from '@/lib/chat'
import type { ChatCategory, AssistantKind } from '@/lib/chat'
import { toastError } from '@/lib/toast'
import { useSearchParams } from 'next/navigation'
import { findContactsNear, loadContacts, type EmergencyContact } from '@/lib/contacts'
import ReactMarkdown from 'react-markdown'
// note: avoid optional remark plugin to prevent missing-dependency errors in some environments
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Maximize2, Copy, ExternalLink } from 'lucide-react'

type MsgType = 'user' | 'assistant'
interface Message { id: string; type: MsgType; content: string; timestamp: Date; category?: ChatCategory }
interface QuickAction { id: string; label: string; icon: React.ReactNode; prompt: string; category: ChatCategory }

const QA_EMERGENCY: QuickAction[] = [
  { id: '1', label: 'Earthquake Safety', icon: <AlertTriangle className="w-4 h-4" />, prompt: 'What should I do during an earthquake?', category: 'safety' },
  { id: '2', label: 'Find Shelter',      icon: <MapPin className="w-4 h-4" />,         prompt: 'Where is the nearest emergency shelter?', category: 'location' },
  { id: '3', label: 'First Aid',          icon: <Heart className="w-4 h-4" />,          prompt: 'How do I perform basic first aid?', category: 'medical' },
  { id: '4', label: 'Emergency Contacts', icon: <Phone className="w-4 h-4" />,          prompt: 'What are the emergency contacts near me?', category: 'emergency' },
  { id: '5', label: 'Emergency Kit',      icon: <Shield className="w-4 h-4" />,         prompt: 'What should be in my emergency kit?', category: 'safety' },
]

const QA_MENTAL: QuickAction[] = [
  { id: 'm1', label: 'Calm Breathing',  icon: <Brain className="w-4 h-4" />, prompt: 'I’m feeling anxious. Can you guide me through a short breathing exercise?', category: 'mental' },
  { id: 'm2', label: 'Panic Help',      icon: <Heart className="w-4 h-4" />, prompt: 'I might be having a panic attack. Help me calm down.', category: 'mental' },
  { id: 'm3', label: 'Sleep After Quake', icon: <Brain className="w-4 h-4" />, prompt: 'I can’t sleep after the earthquake. Any tips to feel safe and rest?', category: 'mental' },
  { id: 'm4', label: 'Talk to Someone', icon: <Heart className="w-4 h-4" />, prompt: 'I feel lonely and scared. What should I do right now?', category: 'mental' },
]

const formatTime = (d: Date) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d)

// ——— Intent detection (EN + Burmese) ———
const EMERGENCY_CONTACTS_RE = new RegExp(
  [
    'emergency\\s*(contacts?|numbers?)',
    'emergency\\s*phone',
    'အရေးပေါ်.*(?:ဖုန်း|နံပါတ်|ဆက်သွယ်)',
    'ဆက်သွယ်ရန်.*အရေးပေါ်'
  ].join('|'),
  'i'
)

export default function AIChatAssistant({ initialOpen = false }: { initialOpen?: boolean }) {
  const { language } = useLanguage()
  const { user } = useAuth()
  const search = useSearchParams()

  const queryOpen = search?.get('chat') === '1'
  const [isOpen, setIsOpen] = useState(initialOpen || queryOpen)
  const [mode, setMode] = useState<AssistantKind>('emergency')

  const [threads, setThreads] = useState<Record<AssistantKind, Message[]>>({
    emergency: [],
    mental: []
  })

  // connection indicator
  const [online, setOnline] = useState<boolean | null>(null)
  const [lastModel, setLastModel] = useState<string | undefined>(undefined)

  // contact/location states
  const [awaitingLocation, setAwaitingLocation] = useState(false)
  const [userLocation, setUserLocation] = useState<string | null>(null)

  // attachments
  const [attached, setAttached] = useState<File[]>([])

  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMessage, setModalMessage] = useState<Message | null>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setThreads({
      emergency: [{
        id: 'init-em',
        type: 'assistant',
        content: language === 'en'
          ? "Hello! I'm here for quick earthquake & emergency help. Ask me anything."
          : 'မင်္ဂလာပါ! ငလျင်နှင့် အရေးပေါ်အတွက် အကူအညီပေးနိုင်ပါတယ်။',
        timestamp: new Date(),
        category: 'general',
      }],
      mental: [{
        id: 'init-me',
        type: 'assistant',
        content: language === 'en'
          ? "Hi, I’m here for gentle mental and emotional support. You’re not alone—how are you feeling right now?"
          : 'မင်္ဂလာပါ—စိတ်ပိုင်းဆိုင်ရာ အားပေးကူညီမှုအတွက် ဒီမှာရှိပါတယ်။ သင်တစ်ယောက်ထဲ မဟုတ်ပါ။ အခု ဘယ်လိုခံစားနေလဲ?',
        timestamp: new Date(),
        category: 'mental',
      }]
    })

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [language])

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [threads, mode, attached.length])

  const currentMessages = threads[mode]

  // RENDER: contacts list as a nice assistant bubble
  function renderContactsMessage(items: EmergencyContact[]): Message {
    const lines = items.map((c) => {
      const title = c.name ? `${c.organization} — ${c.name}` : c.organization
      const phones = c.phones.map(p => `📞 ${p}`).join(' · ')
      const where = [c.location, c.region].filter(Boolean).join(', ')
      return `• ${title}\n   ${phones}\n   📍 ${where}`
    })
    const header = language === 'en'
      ? 'Here are nearby emergency contacts:'
      : 'သင့်နေရာအနီးအရေးပေါ် ဆက်သွယ်ရန်များ —'
    return {
      id: String(Date.now() + Math.random()),
      type: 'assistant',
      content: `${header}\n\n${lines.join('\n\n')}\n\n${
        language === 'en'
          ? 'Tap a number to call. For life-threatening emergencies, dial 199 immediately.'
          : 'ဖုန်းနံပါတ်ကို နှိပ်၍ ခေါ်ဆိုနိုင်သည်။ အရေးပေါ်အန္တရာယ်ရှိပါက 199 ကို ချက်ချင်းခေါ်ပါ။'
      }`,
      timestamp: new Date(),
      category: 'emergency'
    }
  }

  // attachments: add/remove
  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length) setAttached(prev => [...prev, ...files])
    e.currentTarget.value = '' // reset for same-file reselect
  }
  const removeFile = (i: number) => setAttached(prev => prev.filter((_, idx) => idx !== i))

  // MAIN send
  const send = async (text?: string) => {
    const content = (text ?? inputMessage).trim()
    // allow sending if either message or attachments exist
    if (!content && attached.length === 0) return

    const me: Message = {
      id: String(Date.now()),
      type: 'user',
      content: content || '[sent attachment]',
      timestamp: new Date()
    }
    setThreads(prev => ({ ...prev, [mode]: [...prev[mode], me] }))
    setInputMessage('')
    setIsTyping(true)

    // 1) If we are waiting for a location, treat this message as location and answer with contacts
    if (mode === 'emergency' && awaitingLocation && content) {
      try {
        await loadContacts()
        const results = await findContactsNear(content, 8)
        setUserLocation(content)
        setAwaitingLocation(false)
        if (results.length > 0) {
          const msg = renderContactsMessage(results)
          setThreads(prev => ({ ...prev, [mode]: [...prev[mode], msg] }))
        } else {
          const noRes: Message = {
            id: String(Date.now()+1),
            type: 'assistant',
            content: language === 'en'
              ? `I couldn't find contacts for "${content}". Please try another nearby city/township.`
              : `"${content}" အတွက် ဆက်သွယ်ရန်များ မရရှိပါ။ နီးစပ်မြို့/မြို့နယ်တစ်ခုကို ထည့်သွင်းပါ။`,
            timestamp: new Date(),
            category: 'emergency'
          }
          setThreads(prev => ({ ...prev, [mode]: [...prev[mode], noRes] }))
        }
      } finally {
        setIsTyping(false)
        // do NOT clear attachments here (location flow doesn’t use them)
      }
      return
    }

    // 2) Detect intent: emergency contacts
    if (mode === 'emergency' && content && EMERGENCY_CONTACTS_RE.test(content)) {
      try {
        await loadContacts()
        if (!userLocation) {
          const askLoc: Message = {
            id: String(Date.now()+1),
            type: 'assistant',
            content: language === 'en'
              ? 'Sure — what city/township are you in? (e.g., Hlaing, Insein, Mandalay)'
              : 'ပြန်လည်ဆိုင်ရာနေရာကို ဖြေလှပေးပါ (ဥပမာ — လှိုင်၊ အင်းစိန်၊ မန္တလေး)',
            timestamp: new Date(),
            category: 'emergency'
          }
          setAwaitingLocation(true)
          setThreads(prev => ({ ...prev, [mode]: [...prev[mode], askLoc] }))
        } else {
          const results = await findContactsNear(userLocation, 8)
          if (results.length > 0) {
            const msg = renderContactsMessage(results)
            setThreads(prev => ({ ...prev, [mode]: [...prev[mode], msg] }))
          } else {
            const noRes: Message = {
              id: String(Date.now()+1),
              type: 'assistant',
              content: language === 'en'
                ? `I couldn't find contacts near "${userLocation}". Tell me another nearby township.`
                : `"${userLocation}" နီးပတ်ဝန်းကျင်တွင် မတွေ့ပါ။ နီးစပ်မြို့နယ်တစ်ခုကို ပြောပါ။`,
              timestamp: new Date(),
              category: 'emergency'
            }
            setAwaitingLocation(true)
            setThreads(prev => ({ ...prev, [mode]: [...prev[mode], noRes] }))
          }
        }
      } finally {
        setIsTyping(false)
      }
      return
    }

    // 3) Otherwise: normal LLM flow (server-side Gemini + optional files)
    try {
      const data = await askChat(me.content, language as 'en' | 'my', mode, attached)
      // clear files only after successful send to backend
      setAttached([])
      const ai: Message = {
        id: String(Date.now() + 1),
        type: 'assistant',
        content: data.response,
        timestamp: new Date(),
        category: data.category ?? (mode === 'mental' ? 'mental' : 'general'),
      }
      if (typeof data.online === 'boolean') setOnline(data.online)
      if (data.model) setLastModel(data.model)
      setThreads(prev => ({ ...prev, [mode]: [...prev[mode], ai] }))
    } catch (err) {
      const errMsg = err instanceof Error && err.message
        ? err.message
        : (language === 'my' ? 'AI အဆင်မပြေပါ။' : 'AI request failed.')
      toastError(language === 'my' ? 'AI အမှား' : 'AI error', errMsg)
      setOnline(false)
      setLastModel(undefined)
      const fallback = language === 'my'
        ? 'တောင်းပန်ပါတယ်၊ အမှားအယွင်းတစ်ခု ဖြစ်ခဲ့သည်။ ပြန်လည်ကြိုးစားပါ။'
        : 'I’m sorry, something went wrong. Please try again.'
      const ai: Message = {
        id: String(Date.now()+1),
        type: 'assistant',
        content: fallback,
        timestamp: new Date(),
        category: mode==='mental' ? 'mental' : 'general'
      }
      setThreads(prev => ({ ...prev, [mode]: [...prev[mode], ai] }))
    } finally {
      setIsTyping(false)
    }
  }

  // Speech recognition (browser) - start/stop when isListening changes
  useEffect(() => {
    if (!isListening) {
      // stop any ongoing recognition
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
        recognitionRef.current = null
      }
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      // Not supported
      console.warn('SpeechRecognition not supported in this browser')
      setIsListening(false)
      return
    }

    const rec = new SpeechRecognition()
    rec.lang = language === 'en' ? 'en-US' : 'en-US'
    rec.interimResults = true
    rec.maxAlternatives = 1

    let finalTranscript = ''

    rec.onresult = (ev: any) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; ++i) {
        const res = ev.results[i]
        if (res.isFinal) finalTranscript += res[0].transcript
        else interim += res[0].transcript
      }
      setInputMessage((prev) => (finalTranscript || interim).trim())
    }

    rec.onend = () => {
      setIsListening(false)
      if (finalTranscript.trim()) {
        // send the transcribed text automatically
        send(finalTranscript.trim())
      }
      recognitionRef.current = null
    }

    rec.onerror = (e: any) => {
      console.error('Speech recognition error', e)
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = rec
    try { rec.start() } catch (e) { console.error(e); setIsListening(false) }

    return () => {
      try { rec.stop() } catch {}
      recognitionRef.current = null
    }
  }, [isListening, language])

  const headerColor = mode === 'mental' ? 'bg-teal-600' : 'bg-blue-600'
  const buttonColor = mode === 'mental' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-blue-600 hover:bg-blue-700'

  const getCategoryColor = (c?: ChatCategory) => {
    switch (c) {
      case 'safety': return 'bg-blue-100 text-blue-800'
      case 'emergency': return 'bg-red-100 text-red-800'
      case 'location': return 'bg-green-100 text-green-800'
      case 'medical': return 'bg-purple-100 text-purple-800'
      case 'mental': return 'bg-teal-100 text-teal-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // launcher button
  if (!isOpen) {
    return (
      <div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-9999 pointer-events-auto">
        <Button onClick={() => setIsOpen(true)} className={`${buttonColor} text-white rounded-full p-4 sm:p-5 shadow-lg transform scale-150`} aria-label="Open Assistant">
          <MessageCircle className="w-7 h-7 sm:w-8 sm:h-8" />
        </Button>
      </div>
    )
  }

  const connectionDot =
    <div className="flex items-center gap-2">
      <div
        className={`w-2.5 h-2.5 rounded-full ${online === null ? 'bg-yellow-300' : online ? 'bg-green-400' : 'bg-gray-400'}`}
        title={online === null ? 'Status: unknown' : online ? `Online (${lastModel ?? 'Gemini'})` : 'Offline (server unavailable)'}
      />
      <span className="text-[11px] opacity-90">
        {online === null ? 'Checking…' : online ? 'Online' : 'Offline'}
      </span>
    </div>

  return (
    <div className="fixed bottom-0 right-0 sm:bottom-4 sm:right-4 z-9999 sm:w-96 w-full sm:h-[600px] h-[72vh] bg-white rounded-t-lg sm:rounded-lg shadow-2xl flex flex-col min-h-0">
      {/* Header */}
      <div className={`${headerColor} text-white p-4 rounded-t-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'mental' ? <Brain className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            <h3 className="font-semibold">{mode === 'mental' ? 'Mental Support' : 'AI Assistant'}</h3>
          </div>
          <div className="flex items-center gap-3">
            {connectionDot}
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-white hover:bg-white/10 p-1" aria-label="Close">×</Button>
          </div>
        </div>

        {/* Mode switch */}
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => setMode('emergency')}
            className={[
              'px-3',
              mode === 'emergency'
                ? 'bg-white text-blue-700'
                : 'bg-transparent text-white border border-white/50 hover:bg-white/10'
            ].join(' ')}
          >
            <Bot className="w-4 h-4 mr-1" />
            Assistant
          </Button>
          <Button
            size="sm"
            onClick={() => setMode('mental')}
            className={[
              'px-3',
              mode === 'mental'
                ? 'bg-white text-teal-700'
                : 'bg-transparent text-white border border-white/50 hover:bg-white/10'
            ].join(' ')}
          >
            <Brain className="w-4 h-4 mr-1" />
            Mental
          </Button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="p-3 border-b bg-gray-50">
        <div className="flex gap-2 overflow-x-auto">
          {(mode === 'mental' ? QA_MENTAL : QA_EMERGENCY).map(a => (
            <Button key={a.id} variant="outline" size="sm" onClick={() => send(a.prompt)} className="flex items-center gap-1 whitespace-nowrap text-xs">
              {a.icon}{a.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-4">
          {currentMessages.map(m => (
            <div key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-3 ${m.type === 'user'
                ? (mode === 'mental' ? 'bg-teal-600 text-white' : 'bg-blue-600 text-white')
                : 'bg-gray-100 text-gray-900'}`}>
                <div className="flex items-start gap-2">
                  {m.type === 'assistant'
                    ? (mode === 'mental' ? <Brain className="w-4 h-4 mt-1" /> : <Bot className="w-4 h-4 mt-1" />)
                    : <User className="w-4 h-4 mt-1" />}
                  <div className="flex-1">
                    <div className="text-sm whitespace-pre-wrap wrap-break-word">
                      {m.type === 'assistant' ? (
                        <div className="prose max-w-none dark:prose-invert">
                          <ReactMarkdown
                            components={{
                              code: (props: any) => {
                                const { inline, className, children, ...rest } = props
                                const match = /language-(\w+)/.exec(className || '')
                                return !inline && match ? (
                                  <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" {...rest}>
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={String(className)} {...rest}>
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >{m.content}</ReactMarkdown>

                          {/* Controls: view full / copy */}
                          <div className="mt-2 flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => { setModalMessage(m); setModalOpen(true) }}
                              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                              aria-label="View full response"
                            >
                              <Maximize2 className="w-3 h-3" /> View
                            </button>
                            <button
                              type="button"
                              onClick={async () => { await navigator.clipboard.writeText(m.content) }}
                              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                              aria-label="Copy response"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="prose max-w-none dark:prose-invert whitespace-pre-wrap wrap-break-word">{m.content}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs opacity-70">{formatTime(m.timestamp)}</span>
                      {m.category && m.type === 'assistant' && (
                        <Badge className={`text-xs ${getCategoryColor(m.category)}`}>{m.category}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Attachments preview row */}
          {attached.length > 0 && (
            <div className="px-1">
              <div className="flex flex-wrap gap-2">
                {attached.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 border rounded-md px-2 py-1 text-xs bg-gray-50">
                    <span className="max-w-40 truncate">{f.name}</span>
                    <button
                      onClick={() => removeFile(i)}
                      className="text-gray-500 hover:text-red-600"
                      aria-label="Remove file"
                      type="button"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isTyping && <div className="text-xs text-gray-500">typing…</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {/* Full-response modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl" showCloseButton={false}>
          <DialogTitle>Full assistant response</DialogTitle>
          <DialogDescription>Full formatted output from the assistant. You can copy or close.</DialogDescription>
          {/* custom larger close button */}
          <button
            onClick={() => setModalOpen(false)}
            aria-label="Close modal"
            className="absolute top-3 right-3 inline-flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 p-2"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="mt-4 max-h-[60vh] overflow-auto">
            {modalMessage ? (
              <div className="prose max-w-none dark:prose-invert">
                <ReactMarkdown>{modalMessage.content}</ReactMarkdown>
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground mb-2">Raw text (unchanged):</div>
                  <pre className="text-sm bg-gray-50 p-3 rounded overflow-auto whitespace-pre-wrap">{modalMessage.content}</pre>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="inline-flex items-center gap-2 px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={async () => { if (modalMessage) await navigator.clipboard.writeText(modalMessage.content) }}
            >
              <Copy className="w-4 h-4" /> Copy
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-1 rounded bg-blue-600 text-white" onClick={() => setModalOpen(false)}>Close</button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="p-4 border-t">
        <div className="flex gap-2 items-center">
          {/* Attach button */}
          <label className="inline-flex items-center justify-center border rounded-md px-2 h-9 cursor-pointer hover:bg-gray-50">
            <Paperclip className="w-4 h-4" />
            <input
              type="file"
              accept="image/*,.pdf,.docx,.txt"
              multiple
              className="hidden"
              onChange={onPickFiles}
            />
          </label>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsListening(v => !v)}
            className={`p-2 ${isListening ? 'bg-red-100 text-red-600' : ''}`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>

          <Input
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={
              awaitingLocation
                ? (language === 'en' ? 'Type your city/township (e.g., Hlaing)…' : 'သင့်မြို့/မြို့နယ်ကို ရိုက်ထည့်ပါ…')
                : mode === 'mental'
                  ? (language === 'en'
                      ? 'Share how you feel or attach a note/photo…'
                      : 'မည်သို့ ခံစားနေလဲ? မှတ်စု/ဓာတ်ပုံ တင်ပို့နိုင်သည်…')
                  : (language === 'en'
                      ? 'Ask about safety, shelters, first aid… You can attach photo/PDF/DOCX/TXT.'
                      : 'လုံခြုံရေး/ခိုလုံရာ… ဖိုင်/ဓာတ်ပုံ တင်နိုင်သည်။')
            }
            className="flex-1"
            disabled={isTyping}
          />
          <Button
            onClick={() => send()}
            disabled={( !inputMessage.trim() && attached.length === 0 ) || isTyping}
            className={buttonColor}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        <div className="mt-2 text-[11px] text-gray-500 text-center">
          {mode === 'mental'
            ? (language === 'en'
                ? "If you're in immediate danger or thinking about self-harm, call 199 now."
                : 'အရေးပေါ် အန္တရာယ်/ကိုယ်ပိုင်အန္တရာယ် စိုးရိမ်ပါက ယခု 199 ကို ခေါ်ပါ။')
            : (language === 'en'
                ? 'For real emergencies, call 199 immediately'
                : 'အရေးပေါ်ဖြစ်ပါက 199 ကို ချက်ချင်းခေါ်ပါ')}
        </div>
      </div>
    </div>
  )
}
