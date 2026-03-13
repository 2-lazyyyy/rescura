'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  MessageCircle, 
  Send, 
  Bot, 
  User, 
  Mic, 
  MicOff, 
  Globe,
  AlertTriangle,
  Heart,
  Shield,
  MapPin,
  Phone,
  Clock,
  CheckCircle,
  ArrowLeft
} from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'
import { toastError } from '@/lib/toast'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  category?: 'safety' | 'emergency' | 'location' | 'medical' | 'general'
}

interface QuickAction {
  id: string
  label: string
  icon: React.ReactNode
  prompt: string
  category: 'safety' | 'emergency' | 'location' | 'medical' | 'general'
}

const quickActions: QuickAction[] = [
  {
    id: '1',
    label: 'Earthquake Safety',
    icon: <AlertTriangle className="w-4 h-4" />,
    prompt: 'What should I do during an earthquake?',
    category: 'safety'
  },
  {
    id: '2',
    label: 'Find Shelter',
    icon: <MapPin className="w-4 h-4" />,
    prompt: 'Where is the nearest emergency shelter?',
    category: 'location'
  },
  {
    id: '3',
    label: 'First Aid',
    icon: <Heart className="w-4 h-4" />,
    prompt: 'How do I perform basic first aid?',
    category: 'medical'
  },
  {
    id: '4',
    label: 'Emergency Contacts',
    icon: <Phone className="w-4 h-4" />,
    prompt: 'What are the emergency phone numbers?',
    category: 'emergency'
  },
  {
    id: '5',
    label: 'Emergency Kit',
    icon: <Shield className="w-4 h-4" />,
    prompt: 'What should be in my emergency kit?',
    category: 'safety'
  }
]

export default function ChatPage() {
  const { t, language } = useLanguage()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: language === 'en' 
        ? 'Hello! I\'m your AI assistant for earthquake safety and emergency response. How can I help you today? I can answer questions about earthquake safety, finding shelters, first aid, emergency contacts, and emergency preparedness.'
        : 'မင်္ဂလာပါ! ကျွန်ုပ်သည် ငလျင်လုံခြုံရေးနှင့် အရေးပေါ်တုန်းဆိုင်းမှု AI လက်ထောက်ဖြစ်ပါသည်။ ကျွန်ုပ်ကို ဘယ်လိုကူညီနိုင်ပါသလဲ?',
      timestamp: new Date(),
      category: 'general'
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const generateResponse = async (userMessage: string): Promise<string> => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          language: language,
          assistant: 'emergency'
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = 'Failed to get AI response'
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText)
            errorMessage = parsed?.message || parsed?.error || parsed?.detail || errorMessage
          } catch {
            errorMessage = errorText
          }
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()
      if (!data?.response) {
        throw new Error('Empty response from AI service')
      }
      return data.response || 'I apologize, but I encountered an error. Please try again.'
    } catch (error) {
      console.error('AI Response Error:', error)
      throw error
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsTyping(true)

    try {
      const responseText = await generateResponse(inputMessage)
      
      // Determine category based on content
      let category = 'general'
      const lowerMessage = inputMessage.toLowerCase()
      if (lowerMessage.includes('earthquake') || lowerMessage.includes('ငလျင်') || 
          lowerMessage.includes('shake') || lowerMessage.includes('tremor')) {
        category = 'safety'
      } else if (lowerMessage.includes('shelter') || lowerMessage.includes('ခိုလှုံရာ') || 
                 lowerMessage.includes('location') || lowerMessage.includes('where')) {
        category = 'location'
      } else if (lowerMessage.includes('first aid') || lowerMessage.includes('medical') || 
                 lowerMessage.includes('injury') || lowerMessage.includes('ပထမအကူအညီ') ||
                 lowerMessage.includes('ဆေးရည်းအကူအညီ')) {
        category = 'medical'
      } else if (lowerMessage.includes('emergency') || lowerMessage.includes('help') || 
                 lowerMessage.includes('danger') || lowerMessage.includes('အရေးပေါ်') ||
                 lowerMessage.includes('urgent') || lowerMessage.includes('call')) {
        category = 'emergency'
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseText,
        timestamp: new Date(),
        category: category
      }
      
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errMsg = error instanceof Error && error.message
        ? error.message
        : (language === 'my' ? 'AI အဆင်မပြေပါ။' : 'AI request failed.')
      toastError(language === 'my' ? 'AI အမှား' : 'AI error', errMsg)
      console.error('Error generating response:', error)
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: language === 'my' 
          ? 'တောင်းပြီးတောင်းအခက်အေးပါသည်။ အကယ်၍ ဆက်သွင်းပြန်လည်းမှုခြင်းမို့မဟုတ်ပါသည်။'
          : 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date(),
        category: 'general'
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  const handleQuickAction = (action: QuickAction) => {
    setInputMessage(action.prompt)
    handleSendMessage()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const toggleVoiceInput = () => {
    if (!isListening) {
      setIsListening(true)
      // Simulate voice recognition
      setTimeout(() => {
        setInputMessage('What should I do during an earthquake?')
        setIsListening(false)
      }, 2000)
    } else {
      setIsListening(false)
    }
  }

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'safety': return 'bg-blue-100 text-blue-800'
      case 'emergency': return 'bg-red-100 text-red-800'
      case 'location': return 'bg-green-100 text-green-800'
      case 'medical': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPlaceholder = () => {
    return language === 'en' 
      ? 'Ask about earthquake safety, shelters, first aid...' 
      : 'ငလျင်လုံခြုံရေးလမ်းနည်းချက်ချင်းမှု'
  }

  const getEmergencyMessage = () => {
    return language === 'en'
      ? 'For real emergencies, call 199 immediately'
      : 'အရေးပေါ်အခြေအနေများအတွက် 199 ကို ခေါ်ပါ'
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Map
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-blue-600" />
                AI Emergency Assistant
              </h1>
              <p className="text-gray-600">
                {language === 'en' 
                  ? 'Get instant help with earthquake safety, shelters, and emergency information'
                  : 'ငလျင်လုံခြုံရေးလမ်းနည်းချက်ချင်းမှု'
                }
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Quick Actions Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {quickActions.map((action) => (
                    <Button
                      key={action.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickAction(action)}
                      className="w-full justify-start"
                    >
                      {action.icon}
                      <span className="ml-2">{action.label}</span>
                    </Button>
                  ))}
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-sm mb-2">Emergency Numbers</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-red-600" />
                      <span className="font-medium">Emergency: 199</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-blue-600" />
                      <span>Disaster Management: 067-409-888</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-3">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">AI Assistant</CardTitle>
                    <p className="text-sm text-gray-600">
                      {language === 'en' ? 'Online - Powered by Z.AI' : 'အွန်လိုင်းရှိပါသည် - Z.AI မှ မောင်းဆင်'}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.reload()}
                    >
                      <Globe className="w-4 h-4 mr-1" />
                      {language === 'en' ? 'EN' : 'မြန်'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col p-0">
                {/* Messages */}
                <div className="flex-1 p-4 relative">
                  <div className="space-y-4 max-w-full h-[400px] overflow-y-auto pr-2" id="chat-messages">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            message.type === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {message.type === 'assistant' && (
                              <Bot className="w-4 h-4 mt-1 flex-shrink-0" />
                            )}
                            {message.type === 'user' && (
                              <User className="w-4 h-4 mt-1 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="text-xs opacity-70 whitespace-nowrap">
                                  {message.timestamp.toLocaleTimeString()}
                                </span>
                                {message.category && message.type === 'assistant' && (
                                  <Badge className={`text-xs ${getCategoryColor(message.category)} whitespace-nowrap`}>
                                    {message.category}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {isTyping && (
                      <div className="flex justify-start mb-4">
                        <div className="bg-gray-100 text-gray-900 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  
                  {/* Custom Scrollbar Indicator */}
                  <div className="absolute right-0 top-0 bottom-0 h-2 w-2 bg-blue-600 rounded-full opacity-75 animate-pulse"></div>
                </div>

                {/* Input */}
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleVoiceInput}
                      className={`p-2 ${isListening ? 'bg-red-100 text-red-600' : ''}`}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </Button>
                    <Input
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={getPlaceholder()}
                      className="flex-1"
                      disabled={isTyping}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isTyping}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-500 text-center">
                    {language === 'en' ? 'For real emergencies, call 199 immediately' : getEmergencyMessage()}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}