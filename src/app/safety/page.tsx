'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Shield, 
  Heart, 
  AlertTriangle, 
  Settings, 
  BookOpen, 
  Play, 
  CheckCircle, 
  Clock, 
  Lock,
  Award,
  ExternalLink
} from 'lucide-react'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'

interface SafetyModule {
  id: string
  title: string
  description: string
  category: string
  duration: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  progress: number
  isLocked: boolean
  badge?: string
  icon: React.ReactNode
  prerequisites?: string[]
}

const safetyModules: SafetyModule[] = [
  {
    id: '1',
    title: 'CPR Training',
    description: 'Learn life-saving cardiopulmonary resuscitation techniques for adults, children, and infants',
    category: 'First Aid',
    duration: '15 min',
    difficulty: 'beginner',
    progress: 0,
    isLocked: false,
    badge: 'CPR Certified',
    icon: <Heart className="w-6 h-6 text-red-500" />
  },
  {
    id: '2',
    title: 'First Aid Basics',
    description: 'Essential first aid skills for common injuries and medical emergencies',
    category: 'First Aid',
    duration: '20 min',
    difficulty: 'beginner',
    progress: 0,
    isLocked: false,
    icon: <Shield className="w-6 h-6 text-blue-500" />
  },
  {
    id: '3',
    title: 'Earthquake Safety',
    description: 'What to do before, during, and after an earthquake to stay safe',
    category: 'Emergency',
    duration: '10 min',
    difficulty: 'beginner',
    progress: 0,
    isLocked: false,
    icon: <AlertTriangle className="w-6 h-6 text-orange-500" />
  },
  {
    id: '4',
    title: 'Emergency Preparedness',
    description: 'How to prepare your family and home for disasters and emergencies',
    category: 'Preparedness',
    duration: '25 min',
    difficulty: 'intermediate',
    progress: 0,
    isLocked: false,
    icon: <Settings className="w-6 h-6 text-green-500" />
  },
  {
    id: '5',
    title: 'Fire Safety',
    description: 'Fire prevention, evacuation procedures, and fire extinguisher use',
    category: 'Emergency',
    duration: '18 min',
    difficulty: 'intermediate',
    progress: 0,
    isLocked: true,
    prerequisites: ['Earthquake Safety'],
    icon: <AlertTriangle className="w-6 h-6 text-red-500" />
  },
  {
    id: '6',
    title: 'Advanced Rescue Techniques',
    description: 'Professional rescue methods and techniques for volunteers',
    category: 'Advanced',
    duration: '45 min',
    difficulty: 'advanced',
    progress: 0,
    isLocked: true,
    prerequisites: ['First Aid Basics', 'Earthquake Safety'],
    icon: <Shield className="w-6 h-6 text-purple-500" />
  },
  {
    id: '7',
    title: 'Mental Health Support',
    description: 'Providing emotional and psychological support during and after disasters',
    category: 'Support',
    duration: '30 min',
    difficulty: 'intermediate',
    progress: 0,
    isLocked: true,
    prerequisites: ['First Aid Basics'],
    icon: <Heart className="w-6 h-6 text-pink-500" />
  },
  {
    id: '8',
    title: 'Search and Rescue Basics',
    description: 'Basic search and rescue techniques for emergency situations',
    category: 'Advanced',
    duration: '35 min',
    difficulty: 'advanced',
    progress: 0,
    isLocked: true,
    prerequisites: ['Earthquake Safety', 'First Aid Basics'],
    icon: <Shield className="w-6 h-6 text-indigo-500" />
  }
]

export default function SafetyPage() {
  const { t } = useLanguage()
  const { user, isAuthenticated } = useAuth()
  const [modules, setModules] = useState<SafetyModule[]>(safetyModules)
  const [selectedModule, setSelectedModule] = useState<SafetyModule | null>(null)
  const router = useRouter()

  const handleStartModule = (moduleId: string) => {
    const selectedModuleData = modules.find(m => m.id === moduleId)
    if (!selectedModuleData) return

    if (selectedModuleData.isLocked) {
      alert(t('safety.moduleLocked'))
      return
    }

    // Navigate to the lesson page with the module ID
    router.push(`/safety/lesson/${moduleId}`)
  }

  const handleCompleteModule = (moduleId: string) => {
    setModules(modules.map(m => 
      m.id === moduleId 
        ? { ...m, progress: 100, isLocked: false }
        : m
    ))
    
    // Unlock dependent modules
    const completedModuleData = modules.find(m => m.id === moduleId)
    if (completedModuleData) {
      setModules(modules.map(m => 
        m.prerequisites?.includes(completedModuleData.title) 
          ? { ...m, isLocked: false }
          : m
      ))
    }
    
    setSelectedModule(null)
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800'
      case 'intermediate': return 'bg-yellow-100 text-yellow-800'
      case 'advanced': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const completedModules = modules.filter(m => m.progress === 100).length
  const inProgressModules = modules.filter(m => m.progress > 0 && m.progress < 100).length
  const lockedModules = modules.filter(m => m.isLocked).length

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-[90rem] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t('safety.title')}
          </h1>
          <p className="text-gray-600">
            Access essential safety training modules to prepare for emergencies and improve your first aid skills
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{completedModules}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">In Progress</p>
                  <p className="text-2xl font-bold text-blue-600">{inProgressModules}</p>
                </div>
                <Clock className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Locked</p>
                  <p className="text-2xl font-bold text-gray-600">{lockedModules}</p>
                </div>
                <Lock className="w-8 h-8 text-gray-600" />
              </div>
            </CardContent>
          </Card>


        </div>

        <Tabs defaultValue="all" className="space-y-6">
          <TabsList>
            <TabsTrigger value="all">All Modules</TabsTrigger>
            <TabsTrigger value="first-aid">First Aid</TabsTrigger>
            <TabsTrigger value="emergency">Emergency</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modules.map((module) => (
                <Card key={module.id} className={`${module.isLocked ? 'opacity-75' : ''}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {module.icon}
                        <div>
                          <CardTitle className="text-lg">{module.title}</CardTitle>
                          {module.badge && (
                            <Badge variant="secondary" className="mt-1">
                              <Award className="w-3 h-3 mr-1" />
                              {module.badge}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {module.isLocked && <Lock className="w-5 h-5 text-gray-500" />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="mb-4">
                      {module.description}
                    </CardDescription>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge className={getDifficultyColor(module.difficulty)}>
                            {module.difficulty}
                          </Badge>
                          <span className="text-gray-500">{module.duration}</span>
                        </div>
                        <span className="text-gray-500">{module.category}</span>
                      </div>
                      
                      {module.progress > 0 && (
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span>{module.progress}%</span>
                          </div>
                          <Progress value={module.progress} className="h-2" />
                        </div>
                      )}
                      
                      {module.prerequisites && module.prerequisites.length > 0 && (
                        <div className="text-xs text-gray-500">
                          Prerequisites: {module.prerequisites.join(', ')}
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        {module.isLocked ? (
                          <Button size="sm" disabled className="flex-1">
                            <Lock className="w-3 h-3 mr-1" />
                            Locked
                          </Button>
                        ) : module.progress === 100 ? (
                          <Button size="sm" variant="outline" className="flex-1">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Completed
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => handleStartModule(module.id)} className="flex-1">
                            <Play className="w-3 h-3 mr-1" />
                            {module.progress > 0 ? 'Continue' : 'Start'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="first-aid" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {modules.filter(m => m.category === 'First Aid').map((module) => (
                <Card key={module.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      {module.icon}
                      <div className="flex-1">
                        <h3 className="font-semibold">{module.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">{module.description}</p>
                        <div className="flex items-center gap-2">
                          <Badge className={getDifficultyColor(module.difficulty)}>
                            {module.difficulty}
                          </Badge>
                          <span className="text-sm text-gray-500">{module.duration}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="emergency" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {modules.filter(m => m.category === 'Emergency').map((module) => (
                <Card key={module.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      {module.icon}
                      <div className="flex-1">
                        <h3 className="font-semibold">{module.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">{module.description}</p>
                        <div className="flex items-center gap-2">
                          <Badge className={getDifficultyColor(module.difficulty)}>
                            {module.difficulty}
                          </Badge>
                          <span className="text-sm text-gray-500">{module.duration}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {modules.filter(m => m.category === 'Advanced' || m.category === 'Support').map((module) => (
                <Card key={module.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      {module.icon}
                      <div className="flex-1">
                        <h3 className="font-semibold">{module.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">{module.description}</p>
                        <div className="flex items-center gap-2">
                          <Badge className={getDifficultyColor(module.difficulty)}>
                            {module.difficulty}
                          </Badge>
                          <span className="text-sm text-gray-500">{module.duration}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Module Content Dialog */}
        {selectedModule && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    {selectedModule.icon}
                    {selectedModule.title}
                  </h2>
                  <Button variant="ghost" onClick={() => setSelectedModule(null)}>
                    ×
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <p className="text-gray-600">{selectedModule.description}</p>
                  
                  <div className="flex items-center gap-4 text-sm">
                    <Badge className={getDifficultyColor(selectedModule.difficulty)}>
                      {selectedModule.difficulty}
                    </Badge>
                    <span>Duration: {selectedModule.duration}</span>
                    <span>Category: {selectedModule.category}</span>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-semibold mb-2">Module Content</h3>
                    <p className="text-sm text-gray-700">
                      This is a demonstration of the safety module content. In a real implementation, 
                      this would include interactive lessons, videos, quizzes, and practical exercises 
                      to help you master the skills needed for emergency situations.
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button onClick={() => handleCompleteModule(selectedModule.id)} className="flex-1">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Mark as Completed
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedModule(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}