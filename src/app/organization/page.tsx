'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  Users, 
  Check, 
  X, 
  MapPin, 
  AlertTriangle, 
  Shield, 
  Truck,
  Handshake,
  TrendingUp,
  Clock,
  Navigation,
  MessageCircle,
  Eye,
  Upload,
  Package,
  Image as ImageIcon,
  Plus,
  UserPlus,
  Edit,
  Trash2,
  Warehouse,
  Mail,
  Phone,
  AlertCircle
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/hooks/use-language'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { fetchConfirmedPinsForDashboard, acceptHelpRequestItems, fetchAggregatedSuppliesByRegion } from '@/services/pins'
import {
  fetchOrganizationSupplies,
  createOrganizationSupply,
  updateOrganizationSupply,
  deleteOrganizationSupply,
} from '@/services/inventory'
import type { OrganizationSupply, SupplyCategory } from '@/services/inventory'
import { fetchVolunteersForOrganization, createVolunteer, updateVolunteer, deleteVolunteer } from '@/services/volunteers'
import {
  validateEmail,
  validatePhone,
  validateName,
  validateNumber,
  validateLength,
  validateEnum
} from '@/lib/validation'

interface Volunteer {
  id: string
  name: string
  email: string
  phone: string
  role: 'tracking_volunteer' | 'supply_volunteer'
  status: 'active' | 'inactive' | 'pending'
  location: string
  joinedAt: Date
  assignmentsCompleted: number
  password?: string
  assignment?: string
  org_member_id?: string
  user_id?: string
  type?: 'tracking' | 'normal'
}

interface RequiredItem {
  category: string
  unit: string
  quantity: number
}

interface AcceptedItem {
  category: string
  unit: string
  originalQuantity: number
  acceptedQuantity: number
  remainingQuantity: number
  acceptedBy: string
  acceptedAt: Date
}

interface HelpRequest {
  id: string
  title: string
  description: string
  location: string
  lat: number
  lng: number
  region?: string
  image?: string
  status: 'pending' | 'partially_accepted'
  requestedBy: string
  requestedAt: Date
  requiredItems: Array<{
    category: string
    unit: string
    quantity: number
    itemId: string
    pinItemId: string
    remainingQty: number
  }>
  acceptedItems?: AcceptedItem[]
  completedBy?: string
  completedAt?: Date
  proofImage?: string
}

interface PartnerOrg {
  id: string
  name: string
  region: string
  activeCollaborations: number
  status: 'active' | 'inactive'
  phone: string
}

type Supply = OrganizationSupply
type SupplyCategorySelection = SupplyCategory | 'custom'

interface AggregatedSupply {
  region: string
  itemName: string
  unit: string
  totalQuantityNeeded: number
  itemId: string
}

// Mock data
const mockVolunteers: Volunteer[] = [
  {
    id: '1',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+959123456789',
    role: 'tracking_volunteer',
    status: 'active',
    location: 'Yangon',
    joinedAt: new Date('2024-01-15'),
    assignmentsCompleted: 15
  },
  {
    id: '2',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+959987654321',
    role: 'supply_volunteer',
    status: 'active',
    location: 'Mandalay',
    joinedAt: new Date('2024-02-20'),
    assignmentsCompleted: 8
  },
  {
    id: '3',
    name: 'Bob Wilson',
    email: 'bob@example.com',
    phone: '+959456789123',
    role: 'tracking_volunteer',
    status: 'pending',
    location: 'Naypyidaw',
    joinedAt: new Date('2024-03-10'),
    assignmentsCompleted: 0
  }
]

// Mock data - will be replaced by database
const mockHelpRequests: HelpRequest[] = []

const mockPartnerOrgs: PartnerOrg[] = [
  {
    id: '1',
    name: 'Medical Response B',
    region: 'Mandalay',
    activeCollaborations: 3,
    status: 'active',
    phone: '+959123456789'
  },
  {
    id: '2',
    name: 'Supply Chain C',
    region: 'Naypyidaw',
    activeCollaborations: 2,
    status: 'active',
    phone: '+959987654321'
  }
]

export default function OrganizationPage() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [volunteers, setVolunteers] = useState<Volunteer[]>(mockVolunteers)
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>(mockHelpRequests)
  const [regionFilter, setRegionFilter] = useState<string>('all')
  const [partnerOrgs, setPartnerOrgs] = useState<PartnerOrg[]>(mockPartnerOrgs)
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [aggregatedSupplies, setAggregatedSupplies] = useState<AggregatedSupply[]>([])
  const [selectedRequest, setSelectedRequest] = useState<HelpRequest | null>(null)
  const [showAcceptDialog, setShowAcceptDialog] = useState(false)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [acceptQuantities, setAcceptQuantities] = useState<Record<string, number>>({})
  const [proofImage, setProofImage] = useState<File | null>(null)
  const [showRegisterVolunteer, setShowRegisterVolunteer] = useState(false)
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null)
  const [newVolunteer, setNewVolunteer] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'tracking_volunteer' as 'tracking_volunteer' | 'supply_volunteer'
  })
  const [volunteerErrors, setVolunteerErrors] = useState<Record<string, string>>({})
  const [isSavingVolunteer, setIsSavingVolunteer] = useState(false)
  const [deletingVolunteerId, setDeletingVolunteerId] = useState<string | null>(null)
  const [showAddSupply, setShowAddSupply] = useState(false)
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null)
  const [supplyForm, setSupplyForm] = useState({
    category: 'medical' as SupplyCategorySelection,
    customCategory: '',
    name: '',
    quantity: 0,
    unit: '',
    location: '',
    expiryDate: '',
    notes: ''
  })
  const [supplyErrors, setSupplyErrors] = useState<Record<string, string>>({})
  const [isSavingSupply, setIsSavingSupply] = useState(false)
  const [deletingSupplyId, setDeletingSupplyId] = useState<string | null>(null)
  const [isAcceptingRequest, setIsAcceptingRequest] = useState(false)
  const [isLoadingVolunteers, setIsLoadingVolunteers] = useState(false)

  // Redirect non-organization users
  useEffect(() => {
    if (user && user.role !== 'organization') {
      window.location.href = '/'
    }
  }, [user])

  // Load help requests from database
  useEffect(() => {
    const loadHelpRequests = async () => {
      const result = await fetchConfirmedPinsForDashboard()
      if (result.success && result.helpRequests) {
        setHelpRequests(result.helpRequests)
      } else {
        console.error('Failed to load help requests:', result.error)
      }
    }
    loadHelpRequests()
  }, [])

  // Load aggregated supplies from database
  useEffect(() => {
    const loadAggregatedSupplies = async () => {
      const result = await fetchAggregatedSuppliesByRegion()
      if (result.success && result.supplies) {
        console.log('✅ Aggregated supplies loaded:', result.supplies)
        setAggregatedSupplies(result.supplies)
      } else {
        console.error('Failed to load aggregated supplies:', result.error)
      }
    }
    loadAggregatedSupplies()
  }, [])

  // Load volunteers from database
  useEffect(() => {
    const loadVolunteers = async () => {
      if (!user?.id) return
      setIsLoadingVolunteers(true)
      const result = await fetchVolunteersForOrganization(user.id)
      if (result.success && result.volunteers) {
        // Transform volunteers to match the Volunteer interface
        const transformedVolunteers = result.volunteers.map(v => ({
          ...v,
          status: v.status as 'active' | 'inactive' | 'pending',
          role: v.type === 'tracking' ? 'tracking_volunteer' as const : 'supply_volunteer' as const,
          joinedAt: new Date(),
          assignmentsCompleted: 0,
          location: 'Organization',
          password: undefined,
          assignment: undefined
        }))
        setVolunteers(transformedVolunteers)
      } else {
        console.error('Failed to load volunteers:', result.error)
      }
      setIsLoadingVolunteers(false)
    }
    loadVolunteers()
  }, [user?.id])

  useEffect(() => {
    const loadSupplies = async () => {
      if (!user?.id) return

      const result = await fetchOrganizationSupplies(user.id)
      if (result.success && result.supplies) {
        setSupplies(result.supplies)
      } else {
        toast({
          title: '❌ Error',
          description: result.error || 'Failed to load supplies',
          variant: 'destructive',
        })
      }
    }

    loadSupplies()
  }, [user?.id, toast])

  const handleApproveVolunteer = (volunteerId: string) => {
    setVolunteers(volunteers.map(v => 
      v.id === volunteerId ? { ...v, status: 'active' } : v
    ))
  }

  const handleRejectVolunteer = (volunteerId: string) => {
    setVolunteers(volunteers.map(v => 
      v.id === volunteerId ? { ...v, status: 'inactive' } : v
    ))
  }

  const handleRegisterVolunteer = async () => {
    const errors: Record<string, string> = {}
    
    // Validate name
    const nameValidation = validateName(newVolunteer.name, 'Volunteer Name')
    if (!nameValidation.valid) {
      errors.name = nameValidation.error || 'Invalid name'
    }
    
    // Validate email
    const emailValidation = validateEmail(newVolunteer.email)
    if (!emailValidation.valid) {
      errors.email = emailValidation.error || 'Invalid email'
    }
    
    // Validate phone
    const phoneValidation = validatePhone(newVolunteer.phone)
    if (!phoneValidation.valid) {
      errors.phone = phoneValidation.error || 'Invalid phone'
    }
    
    // Validate role
    const roleValidation = validateEnum(newVolunteer.role, ['tracking_volunteer', 'supply_volunteer'], { fieldName: 'Role' })
    if (!roleValidation.valid) {
      errors.role = roleValidation.error || 'Invalid role'
    }

    if (Object.keys(errors).length > 0) {
      setVolunteerErrors(errors)
      toast({
        title: "❌ Validation Error",
        description: 'Please fix all errors before submitting',
        variant: "destructive",
      })
      return
    }

    setVolunteerErrors({})

    if (!user?.id) {
      toast({
        title: "❌ Error",
        description: 'Organization ID not found',
        variant: "destructive",
      })
      return
    }

    setIsSavingVolunteer(true)

    try {
      if (editingVolunteer) {
        // Update existing volunteer
        if (!editingVolunteer.user_id) {
          toast({
            title: "❌ Error",
            description: 'User ID not found',
            variant: "destructive",
          })
          return
        }

        const result = await updateVolunteer(editingVolunteer.user_id, {
          name: newVolunteer.name,
          email: newVolunteer.email,
          phone: newVolunteer.phone,
          password: newVolunteer.password || undefined,
          role: newVolunteer.role === 'tracking_volunteer' ? 'tracking' : 'normal'
        })

        if (result.success) {
          toast({
            title: "✅ Success",
              description: 'Volunteer updated successfully',
              variant: "success",
          })
          setVolunteers(volunteers.map(v => 
            v.id === editingVolunteer.id 
              ? { ...v, name: newVolunteer.name, email: newVolunteer.email, phone: newVolunteer.phone, role: newVolunteer.role }
              : v
          ))
          setEditingVolunteer(null)
        } else {
          toast({
            title: "❌ Error",
            description: result.error || 'Failed to update volunteer',
            variant: "destructive",
          })
        }
      } else {
        // Create new volunteer
        const result = await createVolunteer({
          name: newVolunteer.name,
          email: newVolunteer.email,
          phone: newVolunteer.phone,
          password: newVolunteer.password,
          role: newVolunteer.role === 'tracking_volunteer' ? 'tracking' : 'normal',
          organizationId: user.id
        })

        if (result.success && result.volunteer) {
          toast({
            title: "✅ Success",
              description: 'Volunteer registered successfully',
              variant: "success",
          })
          const newVol: Volunteer = {
            ...result.volunteer,
            status: 'active' as const,
            role: newVolunteer.role,
            joinedAt: new Date(),
            assignmentsCompleted: 0,
            location: 'Organization',
            password: undefined,
            assignment: undefined
          }
          setVolunteers([...volunteers, newVol])
        } else {
          toast({
            title: "❌ Error",
            description: result.error || 'Failed to register volunteer',
            variant: "destructive",
          })
        }
      }
    } finally {
      setIsSavingVolunteer(false)
    }

    setNewVolunteer({
      name: '',
      phone: '',
      email: '',
      password: '',
      role: 'tracking_volunteer'
    })
    setShowRegisterVolunteer(false)
  }

  const handleDeleteVolunteer = async (orgMemberId: string) => {
    if (!confirm('Are you sure you want to delete this volunteer?')) return

    setDeletingVolunteerId(orgMemberId)
    try {
      const result = await deleteVolunteer(orgMemberId)
      if (result.success) {
        toast({
          title: "✅ Success",
          description: 'Volunteer deleted successfully',
        })
        setVolunteers(volunteers.filter(v => v.org_member_id !== orgMemberId))
      } else {
        toast({
          title: "❌ Error",
          description: result.error || 'Failed to delete volunteer',
          variant: "destructive",
        })
      }
    } finally {
      setDeletingVolunteerId(null)
    }
  }

  const handleEditVolunteer = (volunteer: Volunteer) => {
    setEditingVolunteer(volunteer)
    setNewVolunteer({
      name: volunteer.name,
      phone: volunteer.phone,
      email: volunteer.email,
      password: '',
      role: volunteer.role
    })
    setShowRegisterVolunteer(true)
  }

  const handleAddSupply = async () => {
    const errors: Record<string, string> = {}
    
    // Validate supply name
    const nameValidation = validateLength(supplyForm.name, { min: 1, max: 100, fieldName: 'Supply Name' })
    if (!nameValidation.valid) {
      errors.name = nameValidation.error || 'Invalid supply name'
    }
    
    // Validate quantity
    const quantityValidation = validateNumber(supplyForm.quantity, { min: 0, fieldName: 'Quantity' })
    if (!quantityValidation.valid) {
      errors.quantity = quantityValidation.error || 'Invalid quantity'
    }
    
    // Validate unit
    const unitValidation = validateLength(supplyForm.unit, { min: 1, max: 50, fieldName: 'Unit' })
    if (!unitValidation.valid) {
      errors.unit = unitValidation.error || 'Invalid unit'
    }
    
    // Validate category
    if (supplyForm.category === 'custom') {
      const customValidation = validateLength(supplyForm.customCategory, { min: 1, max: 50, fieldName: 'Category' })
      if (!customValidation.valid) {
        errors.category = customValidation.error || 'Invalid category'
      }
    } else {
      const categoryValidation = validateEnum(supplyForm.category, standardSupplyCategories, { fieldName: 'Category' })
      if (!categoryValidation.valid) {
        errors.category = categoryValidation.error || 'Invalid category'
      }
    }

    if (Object.keys(errors).length > 0) {
      setSupplyErrors(errors)
      toast({
        title: "❌ Validation Error",
        description: 'Please fix all errors before submitting',
        variant: "destructive",
      })
      return
    }

    setSupplyErrors({})

    if (!user?.id) {
      toast({
        title: '❌ Error',
        description: 'Organization ID not found',
        variant: 'destructive',
      })
      return
    }

    const resolvedCategory = supplyForm.category === 'custom'
      ? supplyForm.customCategory.trim()
      : supplyForm.category

    setIsSavingSupply(true)
    let result: { success: boolean; supply?: Supply; error?: string }

    try {
      result = await createOrganizationSupply(
        user.id,
        {
          category: resolvedCategory,
          name: supplyForm.name,
          quantity: supplyForm.quantity,
          unit: supplyForm.unit,
          location: supplyForm.location || undefined,
          expiryDate: supplyForm.expiryDate || undefined,
          notes: supplyForm.notes || undefined,
        },
        { actorType: 'organization', actorId: user.id }
      )
    } finally {
      setIsSavingSupply(false)
    }

    if (!result.success || !result.supply) {
      toast({
        title: '❌ Error',
        description: result.error || 'Failed to add supply',
        variant: 'destructive',
      })
      return
    }

    setSupplies([result.supply, ...supplies])
    setSupplyForm({
      category: 'medical',
      customCategory: '',
      name: '',
      quantity: 0,
      unit: '',
      location: '',
      expiryDate: '',
      notes: ''
    })
    setShowAddSupply(false)
    toast({
      title: '✅ Success',
      description: 'Supply added successfully',
    })
  }

  const standardSupplyCategories: SupplyCategory[] = ['medical', 'food', 'water', 'shelter', 'equipment', 'other']

  const resolveCategorySelection = (category: string): { selection: SupplyCategorySelection; customCategory: string } => {
    const trimmed = category.trim()
    const normalized = trimmed.toLowerCase()

    if (standardSupplyCategories.includes(normalized as SupplyCategory)) {
      return { selection: normalized as SupplyCategory, customCategory: '' }
    }

    return { selection: 'custom', customCategory: trimmed }
  }

  const handleEditSupply = (supply: Supply) => {
    const resolvedCategory = resolveCategorySelection(supply.category)
    setEditingSupply(supply)
    setSupplyForm({
      category: resolvedCategory.selection,
      customCategory: resolvedCategory.customCategory,
      name: supply.name,
      quantity: supply.quantity,
      unit: supply.unit,
      location: supply.location || '',
      expiryDate: supply.expiryDate ? supply.expiryDate.toISOString().split('T')[0] : '',
      notes: supply.notes || ''
    })
    setShowAddSupply(true)
  }

  const handleUpdateSupply = async () => {
    const errors: Record<string, string> = {}
    
    if (!editingSupply) {
      toast({
        title: "❌ Error",
        description: 'No supply selected',
        variant: "destructive",
      })
      return
    }

    // Validate supply name
    const nameValidation = validateLength(supplyForm.name, { min: 1, max: 100, fieldName: 'Supply Name' })
    if (!nameValidation.valid) {
      errors.name = nameValidation.error || 'Invalid supply name'
    }
    
    // Validate quantity
    const quantityValidation = validateNumber(supplyForm.quantity, { min: 0, fieldName: 'Quantity' })
    if (!quantityValidation.valid) {
      errors.quantity = quantityValidation.error || 'Invalid quantity'
    }
    
    // Validate unit
    const unitValidation = validateLength(supplyForm.unit, { min: 1, max: 50, fieldName: 'Unit' })
    if (!unitValidation.valid) {
      errors.unit = unitValidation.error || 'Invalid unit'
    }
    
    // Validate category
    if (supplyForm.category === 'custom') {
      const customValidation = validateLength(supplyForm.customCategory, { min: 1, max: 50, fieldName: 'Category' })
      if (!customValidation.valid) {
        errors.category = customValidation.error || 'Invalid category'
      }
    } else {
      const categoryValidation = validateEnum(supplyForm.category, standardSupplyCategories, { fieldName: 'Category' })
      if (!categoryValidation.valid) {
        errors.category = categoryValidation.error || 'Invalid category'
      }
    }

    if (Object.keys(errors).length > 0) {
      setSupplyErrors(errors)
      toast({
        title: "❌ Validation Error",
        description: 'Please fix all errors before updating',
        variant: "destructive",
      })
      return
    }

    setSupplyErrors({})

    if (!user?.id) {
      toast({
        title: '❌ Error',
        description: 'Organization ID not found',
        variant: 'destructive',
      })
      return
    }

    const resolvedCategory = supplyForm.category === 'custom'
      ? supplyForm.customCategory.trim()
      : supplyForm.category

    setIsSavingSupply(true)
    let result: { success: boolean; supply?: Supply; error?: string }

    try {
      result = await updateOrganizationSupply(
        user.id,
        editingSupply.id,
        {
          category: resolvedCategory,
          name: supplyForm.name,
          quantity: supplyForm.quantity,
          unit: supplyForm.unit,
          location: supplyForm.location || undefined,
          expiryDate: supplyForm.expiryDate || undefined,
          notes: supplyForm.notes || undefined,
        },
        { actorType: 'organization', actorId: user.id }
      )
    } finally {
      setIsSavingSupply(false)
    }

    if (!result.success || !result.supply) {
      toast({
        title: '❌ Error',
        description: result.error || 'Failed to update supply',
        variant: 'destructive',
      })
      return
    }

    const updatedSupply = result.supply
    setSupplies(supplies.map(s => (s.id === editingSupply.id ? updatedSupply : s)))

    setEditingSupply(null)
    setSupplyForm({
      category: 'medical',
      customCategory: '',
      name: '',
      quantity: 0,
      unit: '',
      location: '',
      expiryDate: '',
      notes: ''
    })
    setShowAddSupply(false)
    toast({
      title: "✅ Success",
      description: 'Supply updated successfully',
    })
  }

  const handleDeleteSupply = async (supplyId: string) => {
    if (!confirm('Are you sure you want to delete this supply?')) return

    if (!user?.id) {
      toast({
        title: '❌ Error',
        description: 'Organization ID not found',
        variant: 'destructive',
      })
      return
    }

    setDeletingSupplyId(supplyId)
    let result: { success: boolean; error?: string }

    try {
      result = await deleteOrganizationSupply(user.id, supplyId, {
        actorType: 'organization',
        actorId: user.id,
      })
    } finally {
      setDeletingSupplyId(null)
    }

    if (!result.success) {
      toast({
        title: '❌ Error',
        description: result.error || 'Failed to delete supply',
        variant: 'destructive',
      })
      return
    }

    setSupplies(supplies.filter(s => s.id !== supplyId))
    toast({
      title: '✅ Success',
      description: 'Supply deleted successfully',
    })
  }

  const getCategoryColor = (category: SupplyCategory | string) => {
    switch (category) {
      case 'medical':
        return 'bg-red-100 text-red-800'
      case 'food':
        return 'bg-orange-100 text-orange-800'
      case 'water':
        return 'bg-blue-100 text-blue-800'
      case 'shelter':
        return 'bg-green-100 text-green-800'
      case 'equipment':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Note: Organizations accept requests directly, they don't assign volunteers
  // This function is kept for potential future use but not currently used
  // const handleAssignVolunteer = (requestId: string, volunteerId: string) => {
  //   // Implementation removed - organizations accept requests directly
  // }

  const handleViewOnMap = (request: HelpRequest) => {
    // Store the selected request in sessionStorage to highlight it on the map
    sessionStorage.setItem('highlightedPin', JSON.stringify({
      id: request.id,
      lat: request.lat,
      lng: request.lng,
      status: request.status
    }))
    router.push('/')
  }

  const handleViewRequest = (request: HelpRequest) => {
    setSelectedRequest(request)
    // Initialize accept quantities with remaining quantities
    const quantities: Record<string, number> = {}
    request.requiredItems.forEach(item => {
      const accepted = request.acceptedItems?.find(ai => ai.category === item.category)
      quantities[item.category] = accepted ? accepted.remainingQuantity : item.quantity
    })
    setAcceptQuantities(quantities)
  }

  const handleAcceptRequest = async () => {
    if (!selectedRequest || !user) return

    // Build array of items to accept based on user input
    const itemsToAccept = selectedRequest.requiredItems
      .filter(item => {
        const acceptedQty = acceptQuantities[item.pinItemId] || 0
        return acceptedQty > 0
      })
      .map(item => ({
        pinItemId: item.pinItemId,
        acceptedQuantity: acceptQuantities[item.pinItemId] || 0
      }))

    if (itemsToAccept.length === 0) {
      console.warn('No items selected to accept')
      return
    }

    // Call backend to accept items (now handles completion check automatically)
    setIsAcceptingRequest(true)
    let result: { success: boolean; completed?: boolean; error?: string }

    try {
      result = await acceptHelpRequestItems(selectedRequest.id, itemsToAccept, user.id)
    } finally {
      setIsAcceptingRequest(false)
    }
    
    if (result.success) {
      if (result.completed) {
        console.log(`✅ Pin ${selectedRequest.id} completed and deleted`)
        toast({
          title: "✅ Pin Completed",
          description: `All items accepted. Pin has been completed and deleted.`,
        })
      } else {
        console.log(`📌 Pin ${selectedRequest.id} partially accepted`)
        toast({
          title: "✅ Items Accepted",
          description: `Items accepted. Pin still has unfulfilled requests.`,
        })
      }
      
      // Refresh help requests from database
      const refreshResult = await fetchConfirmedPinsForDashboard()
      if (refreshResult.success && refreshResult.helpRequests) {
        setHelpRequests(refreshResult.helpRequests)
      }
      
      setShowAcceptDialog(false)
      setSelectedRequest(null)
      setAcceptQuantities({})
    } else {
      console.error('Failed to accept items:', result.error)
      toast({
        title: "❌ Error",
        description: result.error || 'Failed to accept items',
        variant: "destructive",
      })
    }
  }

  const handleMarkAsDone = async () => {
    if (!selectedRequest || !user) return

    // Update the pin status to completed in the database
    // The completed pins will automatically be hidden from the dashboard on next refresh
    
    setShowCompleteDialog(false)
    setSelectedRequest(null)
    setProofImage(null)
    
    // Refresh the help requests to remove completed pins
    const result = await fetchConfirmedPinsForDashboard()
    if (result.success && result.helpRequests) {
      setHelpRequests(result.helpRequests)
    }
  }

  const getRemainingQuantity = (item: HelpRequest['requiredItems'][0]): number => {
    return item.remainingQty
  }

  const hasAcceptedItems = (request: HelpRequest): boolean => {
    return (request.acceptedItems && request.acceptedItems.length > 0) || false
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'inactive': return 'bg-red-100 text-red-800'
      case 'assigned': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-gray-100 text-gray-800'
      case 'partially_accepted': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const activeVolunteers = volunteers.filter(v => v.type === 'normal').length
  const pendingVolunteers = volunteers.filter(v => v.type === 'tracking').length
  const pendingRequests = helpRequests.filter(r => r.status === 'pending' || r.status === 'partially_accepted').length
  const activeCollaborations = partnerOrgs.filter(o => o.status === 'active').length
  
  // All help requests from database are already confirmed and not completed
  const confirmedHelpRequests = helpRequests

  if (!user || user.role !== 'organization') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert className="max-w-md">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Access denied. Organization privileges required.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            {t('org.title')}
          </h1>
          <p className="text-sm sm:text-base text-gray-600">Manage volunteers and coordinate relief efforts</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-600 truncate">
                    Normal Volunteers
                  </p>
                  <p className="text-lg md:text-2xl font-bold text-green-600">
                    {activeVolunteers}
                  </p>
                </div>
                <Users className="w-6 md:w-8 h-6 md:h-8 text-green-600 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-600 truncate">
                    Tracking Volunteers
                  </p>
                  <p className="text-lg md:text-2xl font-bold text-yellow-600">
                    {pendingVolunteers}
                  </p>
                </div>
                <Clock className="w-6 md:w-8 h-6 md:h-8 text-yellow-600 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-600 truncate">
                    Help Requests
                  </p>
                  <p className="text-lg md:text-2xl font-bold text-orange-600">
                    {pendingRequests}
                  </p>
                </div>
                <AlertTriangle className="w-6 md:w-8 h-6 md:h-8 text-orange-600 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-600 truncate">
                    Partnerships
                  </p>
                  <p className="text-lg md:text-2xl font-bold text-purple-600">
                    {activeCollaborations}
                  </p>
                </div>
                <Handshake className="w-6 md:w-8 h-6 md:h-8 text-purple-600 shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Help Requests - Main Feature */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl lg:text-2xl">
              <AlertTriangle className="w-5 sm:w-6 h-5 sm:h-6 text-orange-500 shrink-0" />
              Help Requests (Confirmed Pins)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {confirmedHelpRequests.map((request) => (
                <Card key={request.id} className="p-3 sm:p-4 hover:shadow-md transition-shadow">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex-1 w-full">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                        <h3 className="font-medium text-base sm:text-lg break-all">{request.title}</h3>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status === 'partially_accepted' ? 'Partially Accepted' : request.status}
                        </Badge>
                      </div>
                      {request.description && (
                        <p className="text-sm text-gray-600 mb-3">{request.description}</p>
                      )}
                      
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4 text-xs text-gray-500 mb-3">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="break-all">{request.location}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          <span className="whitespace-nowrap">{request.requestedAt.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="whitespace-nowrap">Requested by: {request.requestedBy}</span>
                        </div>
                      </div>

                      {/* Required Items Summary */}
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg overflow-x-auto">
                        <div className="text-xs font-medium text-gray-700 mb-2">Required Items:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          {request.requiredItems.map((item, idx) => {
                            const remaining = getRemainingQuantity(item)
                            const accepted = item.quantity - remaining
                            return (
                              <div key={idx} className="text-xs min-w-0">
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3 text-gray-500 shrink-0" />
                                  <span className="font-medium truncate">{item.category}:</span>
                                </div>
                                <div className="ml-4 text-gray-600">
                                  {remaining} {item.unit} {accepted > 0 && `(${accepted} accepted)`}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-2 sm:gap-3 w-full sm:w-auto lg:w-auto items-stretch sm:items-center lg:items-stretch">
                      <Button 
                        size="default" 
                        variant="outline"
                        onClick={() => handleViewRequest(request)}
                        className="flex items-center justify-center gap-2 text-xs sm:text-sm"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="hidden sm:inline">View Details</span>
                        <span className="inline sm:hidden">Details</span>
                      </Button>
                      <Button 
                        size="default"
                        onClick={() => handleViewOnMap(request)}
                        className="flex items-center justify-center gap-2 text-xs sm:text-sm"
                      >
                        <Navigation className="w-4 h-4" />
                        <span className="hidden sm:inline">View on Map</span>
                        <span className="inline sm:hidden">Map</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
              
              {confirmedHelpRequests.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No help requests available at the moment.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Secondary Features - Tabs */}
        <Tabs defaultValue="volunteers" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 gap-1">
            <TabsTrigger value="volunteers" className="flex items-center justify-center gap-1 text-xs sm:text-sm">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{t('org.volunteerManagement')}</span>
              <span className="inline sm:hidden">Volunteers</span>
            </TabsTrigger>
            <TabsTrigger value="supplies" className="flex items-center justify-center gap-1 text-xs sm:text-sm">
              <Warehouse className="w-4 h-4" />
              <span className="hidden md:inline">Supplies</span>
              <span className="inline md:hidden">Supply</span>
            </TabsTrigger>
            {/**
             * Needed Supplies tab: hidden until future integration.
             */}
            {/*
            <TabsTrigger value="supplies-needed" className="flex items-center justify-center gap-1 text-xs sm:text-sm">
              <Package className="w-4 h-4" />
              <span className="hidden lg:inline">Needed Supplies</span>
              <span className="hidden sm:inline lg:hidden">Needed</span>
              <span className="inline sm:hidden">Needed</span>
            </TabsTrigger>
            */}
            {/**
             * Collaboration tab: hidden until future integration.
             */}
            {/*
            <TabsTrigger value="collaboration" className="flex items-center justify-center gap-1 text-xs sm:text-sm">
              <Handshake className="w-4 h-4" />
              <span className="hidden sm:inline">{t('org.collaboration')}</span>
              <span className="inline sm:hidden">Partners</span>
            </TabsTrigger>
            */}
          </TabsList>

          {/* Volunteer Management */}
          <TabsContent value="volunteers" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                  <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  {t('org.volunteerManagement')}
                </CardTitle>
                <CardDescription>
                      Register, approve, and manage volunteers
                </CardDescription>
                  </div>
                  <Dialog open={showRegisterVolunteer} onOpenChange={setShowRegisterVolunteer}>
                    <DialogTrigger asChild>
                      <Button className="w-full sm:w-auto">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Register Volunteer
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                      <DialogHeader className="pb-2">
                        <DialogTitle className="text-lg sm:text-xl">{editingVolunteer ? 'Edit Volunteer' : 'Register New Volunteer'}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="volunteer-name">Name *</Label>
                            <Input
                              id="volunteer-name"
                              value={newVolunteer.name}
                              onChange={(e) => setNewVolunteer(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Enter volunteer name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="volunteer-email">Email *</Label>
                            <Input
                              id="volunteer-email"
                              type="email"
                              value={newVolunteer.email}
                              onChange={(e) => setNewVolunteer(prev => ({ ...prev, email: e.target.value }))}
                              placeholder="volunteer@example.com"
                            />
                          </div>
                          <div>
                            <Label htmlFor="volunteer-phone">Phone Number *</Label>
                            <Input
                              id="volunteer-phone"
                              value={newVolunteer.phone}
                              onChange={(e) => setNewVolunteer(prev => ({ ...prev, phone: e.target.value }))}
                              placeholder="+959123456789"
                            />
                          </div>
                          <div>
                            <Label htmlFor="volunteer-password">Password {editingVolunteer ? '(Leave blank to keep unchanged)' : '*'}</Label>
                            <Input
                              id="volunteer-password"
                              type="password"
                              value={newVolunteer.password || ''}
                              onChange={(e) => setNewVolunteer(prev => ({ ...prev, password: e.target.value }))}
                              placeholder="Min 8 characters"
                            />
                          </div>
                          <div>
                            <Label htmlFor="volunteer-role">Role *</Label>
                            <Select 
                              value={newVolunteer.role} 
                              onValueChange={(value: 'tracking_volunteer' | 'supply_volunteer') => 
                                setNewVolunteer(prev => ({ ...prev, role: value }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="tracking_volunteer">Tracking</SelectItem>
                                <SelectItem value="supply_volunteer">Normal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                          <Button
                            onClick={handleRegisterVolunteer}
                            isLoading={isSavingVolunteer}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm"
                          >
                            {editingVolunteer ? (
                              <>
                                <Edit className="w-4 h-4 mr-2" />
                                Update Volunteer
                              </>
                            ) : (
                              <>
                                <UserPlus className="w-4 h-4 mr-2" />
                                Register Volunteer
                              </>
                            )}
                          </Button>
                          <Button 
                            variant="outline"
                            disabled={isSavingVolunteer}
                            onClick={() => {
                              setShowRegisterVolunteer(false)
                              setEditingVolunteer(null)
                              setNewVolunteer({
                                name: '',
                                phone: '',
                                email: '',
                                password: '',
                                role: 'tracking_volunteer'
                              })
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-100 border-b-2 border-blue-200 transition-colors">
                        <TableHead className="font-bold text-gray-800">Name</TableHead>
                        <TableHead className="font-bold text-gray-800">Role</TableHead>
                        <TableHead className="font-bold text-gray-800">Email</TableHead>
                        <TableHead className="font-bold text-gray-800">Phone</TableHead>
                        <TableHead className="font-bold text-gray-800 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {volunteers.map((volunteer) => (
                        <TableRow key={volunteer.id} className="hover:bg-blue-50 transition-colors border-b border-gray-200">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
                                {volunteer.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold text-gray-900">{volunteer.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={volunteer.role === 'tracking_volunteer' ? 'default' : 'secondary'} className="px-3 py-1">
                              {volunteer.role === 'tracking_volunteer' ? 'Tracking' : 'Normal'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-700 flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-400" />
                              {volunteer.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-700 flex items-center gap-2">
                              <Phone className="w-4 h-4 text-gray-400" />
                              {volunteer.phone}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-3">
                              <Button 
                                size="sm" 
                                onClick={() => handleEditVolunteer(volunteer)}
                                className="bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 transition-all hover:scale-110 shadow-md hover:shadow-lg"
                                title="Edit volunteer"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => volunteer.org_member_id && handleDeleteVolunteer(volunteer.org_member_id)}
                                isLoading={!!volunteer.org_member_id && deletingVolunteerId === volunteer.org_member_id}
                                loadingText=""
                                disabled={!!volunteer.org_member_id && deletingVolunteerId === volunteer.org_member_id}
                                className="border-red-300 text-red-600 hover:bg-red-50 rounded-full p-2 transition-all hover:scale-110"
                                title="Delete volunteer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Supply Management */}
          <TabsContent value="supplies" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
                  <div>
                <CardTitle className="flex items-center gap-2">
                      <Warehouse className="w-5 h-5 text-blue-500" />
                      Supply Management
                </CardTitle>
                <CardDescription>
                      Manage your organization's supply inventory
                </CardDescription>
                  </div>
                  <Dialog open={showAddSupply} onOpenChange={(open) => {
                    setShowAddSupply(open)
                    if (!open) {
                      setEditingSupply(null)
                      setSupplyForm({
                        category: 'medical',
                        customCategory: '',
                        name: '',
                        quantity: 0,
                        unit: '',
                        location: '',
                        expiryDate: '',
                        notes: ''
                      })
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button className="w-full sm:w-auto">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Supply
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                      <DialogHeader className="pb-2">
                        <DialogTitle className="text-lg sm:text-xl">{editingSupply ? 'Edit Supply' : 'Add New Supply'}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="supply-category">Category *</Label>
                            <Select 
                              value={supplyForm.category} 
                              onValueChange={(value: SupplyCategorySelection) => 
                                setSupplyForm(prev => ({
                                  ...prev,
                                  category: value,
                                  customCategory: value === 'custom' ? prev.customCategory : ''
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="medical">Medical</SelectItem>
                                <SelectItem value="food">Food</SelectItem>
                                <SelectItem value="water">Water</SelectItem>
                                <SelectItem value="shelter">Shelter</SelectItem>
                                <SelectItem value="equipment">Equipment</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {supplyForm.category === 'custom' && (
                            <div>
                              <Label htmlFor="supply-category-custom">Custom Category *</Label>
                              <Input
                                id="supply-category-custom"
                                value={supplyForm.customCategory}
                                onChange={(e) =>
                                  setSupplyForm(prev => ({ ...prev, customCategory: e.target.value }))
                                }
                                placeholder="Enter custom category"
                              />
                            </div>
                          )}
                          <div>
                            <Label htmlFor="supply-name">Name *</Label>
                            <Input
                              id="supply-name"
                              value={supplyForm.name}
                              onChange={(e) => setSupplyForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Enter supply name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="supply-quantity">Quantity *</Label>
                            <Input
                              id="supply-quantity"
                              type="number"
                              min="0"
                              value={supplyForm.quantity}
                              onChange={(e) => setSupplyForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <Label htmlFor="supply-unit">Unit *</Label>
                            <Input
                              id="supply-unit"
                              value={supplyForm.unit}
                              onChange={(e) => setSupplyForm(prev => ({ ...prev, unit: e.target.value }))}
                              placeholder="e.g., packs, bottles, kits"
                            />
                          </div>
                          <div>
                            <Label htmlFor="supply-location">Location</Label>
                            <Input
                              id="supply-location"
                              value={supplyForm.location}
                              onChange={(e) => setSupplyForm(prev => ({ ...prev, location: e.target.value }))}
                              placeholder="Warehouse, Storage Room, etc."
                            />
                          </div>
                          <div>
                            <Label htmlFor="supply-expiry">Expiry Date</Label>
                            <Input
                              id="supply-expiry"
                              type="date"
                              value={supplyForm.expiryDate}
                              onChange={(e) => setSupplyForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="supply-notes">Notes</Label>
                          <Textarea
                            id="supply-notes"
                            value={supplyForm.notes}
                            onChange={(e) => setSupplyForm(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Additional notes about this supply"
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-2 pt-4 border-t">
                          <Button 
                            onClick={editingSupply ? handleUpdateSupply : handleAddSupply}
                            isLoading={isSavingSupply}
                            className="flex-1"
                          >
                            <Package className="w-4 h-4 mr-2" />
                            {editingSupply ? 'Update Supply' : 'Add Supply'}
                          </Button>
                          <Button 
                            variant="outline"
                            disabled={isSavingSupply}
                            onClick={() => {
                              setShowAddSupply(false)
                              setEditingSupply(null)
                              setSupplyForm({
                                category: 'medical',
                                customCategory: '',
                                name: '',
                                quantity: 0,
                                unit: '',
                                location: '',
                                expiryDate: '',
                                notes: ''
                              })
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {supplies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No supplies found. Add your first supply to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      supplies.map((supply) => (
                        <TableRow key={supply.id}>
                          <TableCell>
                            <Badge className={getCategoryColor(supply.category)}>
                              {supply.category.charAt(0).toUpperCase() + supply.category.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{supply.name}</div>
                              {supply.notes && (
                                <div className="text-xs text-gray-500 mt-1">{supply.notes}</div>
                              )}
                          </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Package className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">{supply.quantity}</span>
                              <span className="text-sm text-gray-500">{supply.unit}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {supply.location ? (
                            <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4 text-gray-500" />
                                <span className="text-sm">{supply.location}</span>
                            </div>
                            ) : (
                              <span className="text-sm text-gray-400">Not specified</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {supply.expiryDate ? (
                              <div className="text-sm">
                                {supply.expiryDate.toLocaleDateString()}
                                {supply.expiryDate < new Date() && (
                                  <Badge variant="destructive" className="ml-2">Expired</Badge>
                            )}
                          </div>
                            ) : (
                              <span className="text-sm text-gray-400">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-gray-500">
                              {supply.lastUpdated.toLocaleDateString()}
                        </div>
                          </TableCell>
                          <TableCell>
                        <div className="flex items-center gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleEditSupply(supply)}
                              >
                                <Edit className="w-3 h-3" />
                                </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleDeleteSupply(supply.id)}
                                isLoading={deletingSupplyId === supply.id}
                                loadingText=""
                                disabled={deletingSupplyId === supply.id}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Total Needed Supplies (hidden for future integration)
          <TabsContent value="supplies-needed" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-blue-500" />
                      Total Needed Supplies
                    </CardTitle>
                    <CardDescription>
                      Aggregated supply needs from all confirmed help requests by region
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="region-filter" className="text-sm">Filter by Region:</Label>
                    <Select value={regionFilter} onValueChange={setRegionFilter}>
                      <SelectTrigger id="region-filter" className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Regions</SelectItem>
                        <SelectItem value="Yangon">Yangon</SelectItem>
                        <SelectItem value="Mandalay">Mandalay</SelectItem>
                        <SelectItem value="Sagaing">Sagaing</SelectItem>
                        <SelectItem value="NayPyiTaw">NayPyiTaw</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-100 border-b-2 border-blue-200">
                        <TableHead className="font-bold text-gray-800">Region</TableHead>
                        <TableHead className="font-bold text-gray-800">Item Name</TableHead>
                        <TableHead className="font-bold text-gray-800">Unit</TableHead>
                        <TableHead className="font-bold text-gray-800 text-right">Total Quantity Needed</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {(() => {
                      // Filter aggregated supplies by region if selected
                      const filteredSupplies = regionFilter === 'all'
                        ? aggregatedSupplies
                        : aggregatedSupplies.filter(s => s.region === regionFilter)

                      if (filteredSupplies.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                              No supplies needed{regionFilter !== 'all' ? ` in ${regionFilter}` : ''}.
                            </TableCell>
                          </TableRow>
                        )
                      }

                      // Group supplies by region
                      const suppliesByRegion: { [region: string]: AggregatedSupply[] } = {}
                      filteredSupplies.forEach(supply => {
                        if (!suppliesByRegion[supply.region]) {
                          suppliesByRegion[supply.region] = []
                        }
                        suppliesByRegion[supply.region].push(supply)
                      })

                      const rows: React.ReactElement[] = []
                      const regionNames = Object.keys(suppliesByRegion).sort()

                      regionNames.forEach((region) => {
                        const regionSupplies = suppliesByRegion[region]
                        const CATEGORY_COUNT = 6 // Fixed 6 categories

                        regionSupplies.forEach((supply, idx) => {
                          rows.push(
                            <TableRow key={`${region}-${supply.itemName}-${idx}`} className="hover:bg-blue-50 transition-colors">
                              {idx === 0 ? (
                                <TableCell rowSpan={CATEGORY_COUNT} className="font-semibold align-top border-r bg-gray-50">
                                  <div className="py-4">{region}</div>
                                </TableCell>
                              ) : null}
                              <TableCell className="font-medium text-gray-700">{supply.itemName}</TableCell>
                              <TableCell className="text-gray-600">{supply.unit}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-2">
                                  <Package className="w-4 h-4 text-blue-500" />
                                  <span className={`font-semibold text-lg ${supply.totalQuantityNeeded > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                    {supply.totalQuantityNeeded}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      })

                      return rows
                    })()}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          */}

          {/* Collaboration (hidden for future integration)
          <TabsContent value="collaboration" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Handshake className="w-5 h-5 text-purple-500" />
                  {t('org.collaboration')}
                </CardTitle>
                <CardDescription>
                  Partner with other organizations for large-scale disasters
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {partnerOrgs.map((org) => (
                    <Card key={org.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium">{org.name}</h3>
                          <Badge className={getStatusColor(org.status)}>
                            {org.status}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {org.region}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {org.activeCollaborations} active collaborations
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {org.phone}
                          </div>
                        </div>
                        <div className="mt-3">
                          <Button size="sm" className="w-full">
                            <MessageCircle className="w-3 h-3 mr-1" />
                            Send Message
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                <div className="mt-6">
                  <Alert>
                    <Handshake className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Collaboration Mode Active</strong> - You can now share resources and coordinate with partner organizations for efficient disaster response.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          */}
        </Tabs>
      </div>

      {/* Detailed Request View Dialog */}
      <Dialog open={!!selectedRequest && !showAcceptDialog && !showCompleteDialog} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Help Request Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="flex flex-col space-y-4 overflow-y-auto flex-1 pr-2">
              {/* Location */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-sm">Location</span>
                </div>
                <p className="text-gray-700 text-sm pl-6">{selectedRequest.location}</p>
              </div>

              {/* Description */}
              <div>
                <h4 className="font-medium mb-2 text-sm">Description</h4>
                <p className="text-gray-700 text-sm">{selectedRequest.description}</p>
              </div>

              {/* Required Items Table */}
              <div>
                <h4 className="font-medium mb-3 text-sm">Required Items</h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Unit</TableHead>
                        <TableHead className="text-xs">Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRequest.requiredItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm font-medium">{item.category}</TableCell>
                          <TableCell className="text-sm">{item.unit}</TableCell>
                          <TableCell className="text-sm">{item.quantity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Accept Request Button */}
              <div className="pt-2 border-t">
                <Button 
                  onClick={() => {
                    setShowAcceptDialog(true)
                  }}
                  className="w-full"
                >
                  <Check className="w-4 h-4 mr-2" />
                    Accept Request
                  </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Accept Request Dialog */}
      <Dialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="pb-2 shrink-0">
            <DialogTitle className="text-lg sm:text-xl">Accept Help Request</DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <Alert className="shrink-0">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Adjust the quantities you can provide. The remaining quantities will be updated automatically.
                </AlertDescription>
              </Alert>

              <div className="space-y-3 shrink-0">
                <h4 className="font-medium mb-3">Required Items</h4>
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                          <TableHead className="px-4 py-2">Category</TableHead>
                          <TableHead className="px-4 py-2">Unit</TableHead>
                          <TableHead className="px-4 py-2 text-center">Requested</TableHead>
                          <TableHead className="px-4 py-2 text-center">Accepted</TableHead>
                          <TableHead className="px-4 py-2 text-center">Remaining</TableHead>
                          <TableHead className="px-4 py-2">You Can Provide</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedRequest.requiredItems.map((item, idx) => {
                          const remaining = item.remainingQty
                          const requested = item.quantity
                          const accepted = requested - remaining
                          const maxQty = remaining
                          return (
                            <TableRow key={idx} className="hover:bg-gray-50">
                              <TableCell className="font-medium px-4 py-3">{item.category}</TableCell>
                              <TableCell className="px-4 py-3">{item.unit}</TableCell>
                              <TableCell className="text-center font-semibold px-4 py-3">{requested}</TableCell>
                              <TableCell className="text-center text-green-600 font-semibold px-4 py-3">{accepted}</TableCell>
                              <TableCell className="text-center text-orange-600 font-semibold px-4 py-3">{remaining}</TableCell>
                              <TableCell className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    max={maxQty}
                                    value={acceptQuantities[item.pinItemId] || 0}
                                    onChange={(e) => {
                                      const value = Math.max(0, Math.min(maxQty, parseInt(e.target.value) || 0))
                                      setAcceptQuantities(prev => ({
                                        ...prev,
                                        [item.pinItemId]: value
                                      }))
                                    }}
                                    className="w-20 text-center"
                                  />
                                  <span className="text-sm text-gray-500 whitespace-nowrap">/ {maxQty}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t shrink-0">
                <Button 
                  onClick={handleAcceptRequest}
                  className="flex-1"
                  isLoading={isAcceptingRequest}
                  disabled={isAcceptingRequest || Object.values(acceptQuantities).every(qty => qty === 0)}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Accept Request
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowAcceptDialog(false)
                    setAcceptQuantities({})
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark as Done Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Request as Done</DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Upload proof of delivery or completion to mark this request as done.
                </AlertDescription>
              </Alert>

              <div>
                <Label htmlFor="proof-image">Proof Image</Label>
                <Input
                  id="proof-image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProofImage(e.target.files?.[0] || null)}
                  className="mt-2"
                />
                {proofImage && (
                  <div className="mt-2 w-full h-32 bg-gray-100 rounded-lg overflow-hidden">
                    <img 
                      src={URL.createObjectURL(proofImage)} 
                      alt="Proof preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  onClick={handleMarkAsDone}
                  className="flex-1"
                  disabled={!proofImage}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Mark as Done
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowCompleteDialog(false)
                    setProofImage(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
