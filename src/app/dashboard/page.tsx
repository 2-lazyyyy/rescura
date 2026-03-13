"use client";


import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Heart, 
  Shield, 
  Users, 
  BookOpen, 
  MapPin, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Plus,
  MessageCircle,
  Navigation,
  Lock,
  Play,
  Award,
  Settings,
  Droplets,
  Wind
} from 'lucide-react'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'
import FamilyTab from '@/components/family-tab'
import { fetchFamilyMembers } from '@/services/family'
import { supabase } from '@/lib/supabase'

import { mockSafetyModules } from "@/data/mockSafetyModules";
import Link from "next/link";
import { LiveAlerts } from "@/components/alerts/live-alerts";

interface FamilyMember {
  id: string;
  name: string;
  phone: string;
  uniqueId: string;
  lastSeen: Date;
  status: "safe" | "unknown" | "in_danger";
  location?: { lat: number; lng: number; address: string };
}

interface SafetyModule {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  point?: number;
  videoUrl?: string;
  quiz?: { question: string; options: string[]; answer: string }[];
  qna?: { question: string; answer: string }[];
}

interface AlertItem {
  id: string
  type: 'earthquake' | 'flood' | 'cyclone'
  title: string
  description: string
  timestamp: Date
  severity: 'high' | 'medium' | 'low'
  location?: string
  actionUrl?: string
  actionLabel?: string
}

// Mock data
const mockFamilyMembers: FamilyMember[] = [
  {
    id: '1',
    name: 'Mother',
    phone: '+959123456789',
    uniqueId: 'FAM-001',
    lastSeen: new Date(Date.now() - 30 * 60 * 1000),
    status: 'safe',
    location: { lat: 16.8409, lng: 96.1735, address: 'Yangon, Myanmar' }
  },
  {
    id: '2',
    name: 'Brother',
    phone: '+959987654321',
    uniqueId: 'FAM-002',
    lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: 'unknown'
  },
  {
    id: '3',
    name: 'Sister',
    phone: '+959456789123',
    uniqueId: 'FAM-003',
    lastSeen: new Date(Date.now() - 15 * 60 * 1000),
    status: 'safe',
    location: { lat: 16.8509, lng: 96.1835, address: 'Mandalay, Myanmar' }
  }
]

const mockAlerts: AlertItem[] = [
  {
    id: '1',
    type: 'earthquake',
    title: 'Earthquake Alert',
    description: 'Magnitude 4.5 detected near Yangon. Please stay alert and follow safety protocols.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    severity: 'high',
    location: 'Yangon, Myanmar',
    actionUrl: '/',
    actionLabel: 'View on Map'
  },
  {
    id: '2',
    type: 'earthquake',
    title: 'Earthquake Warning',
    description: 'Magnitude 3.2 detected in Mandalay region. Minor shaking expected.',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    severity: 'medium',
    location: 'Mandalay, Myanmar',
    actionUrl: '/',
    actionLabel: 'View on Map'
  }
]

export default function DashboardPage() {
  const { t, language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const router = useRouter()

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [safetyModules, setSafetyModules] =
    useState<SafetyModule[]>(mockSafetyModules);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchIdentifier, setSearchIdentifier] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedFound, setSelectedFound] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<any>(null);
  const [memberRelation, setMemberRelation] = useState('');
  const pathname = usePathname()
  const [completedModuleIds, setCompletedModuleIds] = useState<string[]>([])
  const [totalPointsCollected, setTotalPointsCollected] = useState(0)


  const [newMember, setNewMember] = useState({
    name: "",
    phone: "",
    uniqueId: "",
  });
  const [emergencyKitStatus, setEmergencyKitStatus] = useState(0);

  // Calculate emergency kit percentage from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('emergencyKitItems')
      if (stored) {
        try {
          const items = JSON.parse(stored)
          const totalItems = Object.keys(items).length
          const checkedItems = Object.values(items).filter(Boolean).length
          const percentage = Math.round((checkedItems / totalItems) * 100)
          setEmergencyKitStatus(percentage)
        } catch (e) {
          console.error('Failed to calculate emergency kit status:', e)
          setEmergencyKitStatus(0)
        }
      } else {
        setEmergencyKitStatus(0)
      }
    }
  }, [pathname]) // Recalculate when navigating back to dashboard

  // Load completed modules from sessionStorage (resets on page refresh)
  const loadCompletedModules = () => {
    if (typeof window !== 'undefined') {
      const completed = JSON.parse(sessionStorage.getItem('completedModules') || '[]')
      setCompletedModuleIds(completed)
      console.log('Loaded completed modules:', completed)
      
      // Update module progress based on completion
      setSafetyModules(modules => modules.map(module => 
        completed.includes(module.id)
          ? { ...module, progress: 100 }
          : module
      ))
    }
  }

  useEffect(() => {
    // Load completed modules on page load
    loadCompletedModules()
  }, [])

  // Load completed modules when navigating back from lesson
  useEffect(() => {
    if (pathname === '/dashboard') {
      loadCompletedModules()
    }
  }, [pathname])

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
    } else {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  // Redirect admin and organization users to their specific dashboards immediately
  useEffect(() => {
    if (user && !isAuthenticated) {
      // Wait for authentication to be confirmed
      return
    }
    
    if (user) {
      if (user.role === 'admin') {
        router.replace('/admin')
        return
      } else if (user.role === 'organization') {
        router.replace('/organization')
        return
      }
    }
  }, [user, router, isAuthenticated])

  // Show loading or redirect immediately if user is admin or organization
  if (user && (user.role === 'admin' || user.role === 'organization')) {
    return null // Prevent flash of wrong content
  }

  const handleAddFamilyMember = () => {
    if (!newMember.name || !newMember.phone) return

    const member: FamilyMember = {
      id: Date.now().toString(),
      name: newMember.name,
      phone: newMember.phone,
      uniqueId: 'FAM-' + Math.random().toString(36).substr(2, 3).toUpperCase(),
      lastSeen: new Date(),
      status: "unknown",
    };

    setFamilyMembers([...familyMembers, member]);
    setNewMember({ name: "", phone: "", uniqueId: "" });
    setShowAddMember(false);
  };

  const handleSendSafetyCheck = (memberId: string) => {
    // In a real app, this would send a notification
    alert(
      "Safety check sent to " +
        familyMembers.find((m) => m.id === memberId)?.name
    );
  };

  const handleMarkSafe = (memberId: string) => {
    setFamilyMembers(
      familyMembers.map((member) =>
        member.id === memberId
          ? { ...member, status: "safe", lastSeen: new Date() }
          : member
      )
    );
  };
  // model progress start
  const handleStartModule = (moduleId: string) => {
    // Navigate to the lesson page with the module ID
    router.push(`/safety/lesson/${moduleId}`)
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "safe":
        return "bg-green-100 text-green-800";
      case "in_danger":
        return "bg-red-100 text-red-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  // Load family members for current user and subscribe to changes
  useEffect(() => {
    let channel: any;
    const load = async () => {
      if (!user?.id) return;
      try {
        const links = await fetchFamilyMembers(user.id);
        const mapped = (links || []).map((l: any) => ({
          id: l.member?.id ?? l.id,
          name: l.member?.name ?? "Unknown",
          phone: l.member?.phone ?? "",
          uniqueId: l.member?.id ?? l.id,
          status: l.safety_status ?? null,
          safety_check_started_at: l.safety_check_started_at,
          safety_check_expires_at: l.safety_check_expires_at,
          lastSeen: new Date(),
          member: l.member,
          relation: l.relation,
        }));
        const seen = new Set<string>();
        const deduped = mapped.filter((m: any) => {
          const key = m.id;
          if (!key) return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setFamilyMembers(deduped);
      } catch (e) {
        console.warn("failed to load family members", e);
      }
      try {
        channel = supabase
          .channel(`family_members:${user.id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'family_members', filter: `user_id=eq.${user.id}` }, async () => {
            const links = await fetchFamilyMembers(user.id)
            const mapped = (links || []).map((l: any) => ({
              id: l.member?.id ?? l.id,
              name: l.member?.name ?? 'Unknown',
              phone: l.member?.phone ?? '',
              uniqueId: l.member?.id ?? l.id,
              status: l.safety_status ?? null,
              safety_check_started_at: l.safety_check_started_at,
              safety_check_expires_at: l.safety_check_expires_at,
              lastSeen: new Date(),
              member: l.member,
            }))
            const seen2 = new Set<string>()
            const deduped2 = mapped.filter((m: any) => {
              const key = m.id
              if (!key) return false
              if (seen2.has(key)) return false
              seen2.add(key)
              return true
            })
            setFamilyMembers(deduped2)
          })
          // Intentionally skip UPDATE subscription for safety status so UI changes only when the
          // corresponding notification arrives (keeps status + notification in sync timing)
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'family_members', filter: `user_id=eq.${user.id}` }, async () => {
            const links = await fetchFamilyMembers(user.id)
            const mapped = (links || []).map((l: any) => ({
              id: l.member?.id ?? l.id,
              name: l.member?.name ?? 'Unknown',
              phone: l.member?.phone ?? '',
              uniqueId: l.member?.id ?? l.id,
              status: l.safety_status ?? null,
              safety_check_started_at: l.safety_check_started_at,
              safety_check_expires_at: l.safety_check_expires_at,
              lastSeen: new Date(),
              member: l.member,
              relation: l.relation,
            }))
            setFamilyMembers(mapped)
          })
          .subscribe()
      } catch (e) {
        console.warn('failed to subscribe family_members', e)
      }
    }
    load()
    return () => {
      try { (channel as any)?.unsubscribe?.() } catch {}
    }
  }, [user?.id])

  const safeFamilyMembers = familyMembers.filter((m) => m.status === "safe").length;
  
  // Calculate completed modules and total points with useMemo
  const completedModulesCount = useMemo(() => {
    console.log('Calculating modules count:', completedModuleIds.length, completedModuleIds)
    return completedModuleIds.length
  }, [completedModuleIds]);
  
  useEffect(() => {
    const points = parseInt(localStorage.getItem('safetyPoints') || '0')
    setTotalPointsCollected(points)
  }, [completedModuleIds]); // Re-calculate when modules change

  // if (!isAuthenticated) {
  //   return (
  //     <div className="min-h-screen bg-gray-50 flex items-center justify-center">
  //       <Alert className="max-w-md">
  //         <AlertTriangle className="h-4 w-4" />
  //         <AlertDescription>
  //           Please login to access your dashboard.
  //         </AlertDescription>
  //       </Alert>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-360 mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}

        {/* Calm Welcome Card */}
        <div className="mt-8 mb-8">
          <div className="bg-linear-to-r from-blue-100 via-blue-50 to-gray-100 rounded-2xl shadow p-6 flex flex-col sm:flex-row items-center gap-6 border border-blue-200">
            <div className="shrink-0 w-20 h-20 rounded-full bg-blue-200/60 flex items-center justify-center shadow-md border-4 border-white">
              <Users className="w-12 h-12 text-blue-700 drop-shadow" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-900 mb-1 drop-shadow-sm">
                {t("dashboard.welcome")}, {user?.name}!
              </h1>
              <p className="text-lg text-blue-800/90 font-medium">
                Manage your <span className="font-semibold text-blue-600">family safety</span> and <span className="font-semibold text-green-700">learning progress</span>
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 md:mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Family Safe
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {safeFamilyMembers}/{familyMembers.length}
                  </p>
                </div>
                <Heart className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Modules Completed
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    {completedModulesCount}/{safetyModules.length}
                  </p>
                </div>
                <BookOpen className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Emergency Kit
                  </p>
                  <p className="text-2xl font-bold text-orange-600">
                    {emergencyKitStatus}%
                  </p>
                </div>
                <Shield className="w-8 h-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Points Collected
                  </p>
                  <p className="text-2xl font-bold text-purple-600">
                    {totalPointsCollected}
                  </p>
                </div>
                <Award className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="family" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="family" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{t("dashboard.familyMembers")}</span>
              <span className="sm:hidden">Family</span>
            </TabsTrigger>
            <TabsTrigger value="safety" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">{t("dashboard.safetyModules")}</span>
              <span className="sm:hidden">Safety</span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span className="hidden sm:inline">{t("dashboard.recentAlerts")}</span>
              <span className="sm:hidden">Alerts</span>
            </TabsTrigger>
          </TabsList>

          {/* Family Locator Tab */}
          <FamilyTab
            t={t}
            user={user}
            familyMembers={familyMembers}
            setFamilyMembers={setFamilyMembers}
            showAddMember={showAddMember}
            setShowAddMember={setShowAddMember}
            searchIdentifier={searchIdentifier}
            setSearchIdentifier={setSearchIdentifier}
            searchResults={searchResults}
            setSearchResults={setSearchResults}
            selectedFound={selectedFound}
            setSelectedFound={setSelectedFound}
            searching={searching}
            setSearching={setSearching}
            searchTimeout={searchTimeout}
            setSearchTimeout={setSearchTimeout}
            memberRelation={memberRelation}
            setMemberRelation={setMemberRelation}
          />

          {/* Safety Modules Tab */}
          <TabsContent value="safety" className="space-y-6 mt-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  {t("safety.title")}
                </CardTitle>
                <CardDescription>
                  Complete safety training modules to earn badges
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {safetyModules.map((module) => (
                    <Card key={module.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-1">{module.icon}</div>
                          <div className="flex-1">
                            <h3 className="font-medium flex items-center gap-2">
                              {module.title}
                            </h3>

                            <p className="text-sm text-gray-600 mt-1">
                              {module.description}
                            </p>

                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                              <span>{module.category}</span>
                            </div>

                            <div className="mt-3">
                              {completedModuleIds.includes(module.id) ? (
                                <Button size="sm" onClick={() => handleStartModule(module.id)} className="w-full" variant="outline">
                                  <Play className="w-3 h-3 mr-1" />
                                  Relearn
                                </Button>
                              ) : (
                                <Button size="sm" onClick={() => handleStartModule(module.id)} className="w-full">
                                  <Play className="w-3 h-3 mr-1" />
                                  {t('safety.start')}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recent Alerts Tab */}
          <TabsContent value="alerts" className="space-y-6 pb-8 mt-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  {t("dashboard.recentAlerts")}
                </CardTitle>
                <CardDescription>
                  Recent earthquake alerts and safety notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <LiveAlerts />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}