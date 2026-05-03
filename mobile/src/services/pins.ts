import { supabase } from '../lib/supabase'
import type { PinItemRecord, PinRecord, MobileUser } from '../types/domain'

function mapPin(row: any): PinRecord {
  return {
    id: row.id,
    type: row.type === 'damage' ? 'damaged' : 'safe',
    status: row.status,
    phone: row.phone,
    description: row.description,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    createdBy: row.createdBy,
    createdAt: row.created_at,
    image_url: row.image_url,
    user_id: row.user_id,
  }
}

export async function fetchPins(): Promise<{ success: boolean; pins: PinRecord[]; error?: string }> {
  const { data, error } = await supabase
    .from('pins')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return { success: false, pins: [], error: error.message }
  return { success: true, pins: (data || []).map(mapPin) }
}

export async function fetchItems() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('name', { ascending: true })

  if (error) return { success: false, items: [], error: error.message }
  return { success: true, items: data || [] }
}

export async function createPin(input: {
  type: 'damaged' | 'safe'
  phone?: string
  description?: string
  latitude: number
  longitude: number
  userId?: string | null
  userRole?: string | null
}) {
  let status: 'pending' | 'confirmed' = 'pending'
  if (input.userId) {
    const isVolunteer = await isUserActiveTracker(input.userId)
    const isAdmin = input.userRole === 'admin'
    const isOrg = input.userRole === 'organization'
    const isVolunteerRole = input.userRole === 'tracking_volunteer' || input.userRole === 'supply_volunteer'
    
    status = isVolunteer || isAdmin || isOrg || isVolunteerRole ? 'confirmed' : 'pending'
  }

  const { data, error } = await supabase
    .from('pins')
    .insert({
      type: input.type === 'damaged' ? 'damage' : 'shelter',
      phone: input.phone || null,
      description: input.description || null,
      latitude: input.latitude,
      longitude: input.longitude,
      user_id: input.userId || null,
      status,
    })
    .select('*')
    .maybeSingle()

  if (error || !data) return { success: false, error: error?.message || 'Failed to create pin' }
  return { success: true, pin: mapPin(data) }
}

export async function updatePinImageUrl(pinId: string, imageUrl: string) {
  const { error } = await supabase
    .from('pins')
    .update({ image_url: imageUrl })
    .eq('id', pinId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function fetchPinsWithItems() {
  const { data: pinsData, error: pinsError } = await supabase.from('pins').select('*').order('created_at', { ascending: false })
  if (pinsError) return { success: false, error: pinsError.message }

  const pinIds = (pinsData || []).map((p: any) => p.id)
  const { data: itemsData, error: itemsError } = await supabase
    .from('pin_items')
    .select('*, item:items(*)')
    .in('pin_id', pinIds)

  if (itemsError) return { success: false, error: itemsError.message }

  const grouped: Record<string, PinItemRecord[]> = {}
  for (const item of itemsData || []) {
    if (!grouped[item.pin_id]) grouped[item.pin_id] = []
    grouped[item.pin_id].push(item as PinItemRecord)
  }

  return {
    success: true,
    pins: (pinsData || []).map((pin: any) => ({ ...mapPin(pin), items: grouped[pin.id] || [] })),
  }
}

export async function fetchPinByIdWithItems(pinId: string) {
  const { data: pinData, error: pinError } = await supabase
    .from('pins')
    .select('*')
    .eq('id', pinId)
    .maybeSingle()

  if (pinError || !pinData) return { success: false, error: pinError?.message || 'Pin not found' }

  const { data: itemsData, error: itemsError } = await supabase
    .from('pin_items')
    .select('*, item:items(*)')
    .eq('pin_id', pinId)

  if (itemsError) return { success: false, error: itemsError.message }

  return {
    success: true,
    pin: {
      ...mapPin(pinData),
      items: (itemsData || []) as PinItemRecord[],
    },
  }
}

export async function createPinItems(pinId: string, items: Array<{ item_id: string; requested_qty: number; remaining_qty?: number }>) {
  const payload = items.map((item) => ({
    pin_id: pinId,
    item_id: item.item_id,
    requested_qty: item.requested_qty,
    remaining_qty: item.remaining_qty ?? item.requested_qty,
  }))

  const { error } = await supabase.from('pin_items').insert(payload)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updatePinItemQuantity(pinItemId: string, nextRemainingQty: number) {
  const safeQty = Math.max(0, Number(nextRemainingQty) || 0)
  const { error } = await supabase
    .from('pin_items')
    .update({ remaining_qty: safeQty })
    .eq('id', pinItemId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function cancelPin(pinId: string, userId: string, userRole: string | null) {
  const isTracker = await isUserActiveTracker(userId)
  const isAdmin = userRole === 'admin'
  
  if (!isTracker && !isAdmin) {
    return { success: false, error: 'Not authorized to cancel pins' }
  }

  const { error } = await supabase
    .from('pins')
    .update({ status: 'cancelled' })
    .eq('id', pinId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updatePinStatus(
  pinId: string,
  newStatus: 'pending' | 'confirmed' | 'completed',
  confirmedByMemberId?: string,
  userId?: string,
  userRole?: string | null
) {
  if (newStatus === 'confirmed') {
    if (!userId || !confirmedByMemberId) {
      return { success: false, error: 'Only trackers can confirm pins' }
    }
    const isTracker = await isUserActiveTracker(userId)
    if (!isTracker) {
      return { success: false, error: 'Only trackers can confirm pins' }
    }
  }

  if (newStatus === 'completed') {
    if (!userId) {
      return { success: false, error: 'Authentication required to complete pins' }
    }
    const isTracker = await isUserActiveTracker(userId)
    const roleAllowed = userRole === 'admin' || userRole === 'organization' || userRole === 'supply_volunteer'
    if (!isTracker && !roleAllowed) {
      return { success: false, error: 'Not authorized to complete pins' }
    }
  }

  const updateData: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'confirmed' && confirmedByMemberId) {
    updateData.confirmed_by = confirmedByMemberId
    updateData.confirmed_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('pins')
    .update(updateData)
    .eq('id', pinId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function fetchAggregatedSuppliesByRegion() {
  const { data: confirmedPins, error: pinsError } = await supabase
    .from('pins')
    .select('id, latitude, longitude, type, status')
    .eq('status', 'confirmed')

  if (pinsError) return { success: false, error: pinsError.message }

  const pinIds = (confirmedPins || []).map((pin: any) => pin.id)
  const { data: pinItems, error: pinItemsError } = await supabase
    .from('pin_items')
    .select('pin_id, requested_qty, remaining_qty, item:items(name,unit)')
    .in('pin_id', pinIds)

  if (pinItemsError) return { success: false, error: pinItemsError.message }

  const grouped: Record<string, number> = {}
  for (const pinItem of pinItems || []) {
    const item = (pinItem as any).item
    const name = item?.name || 'Unknown'
    grouped[name] = (grouped[name] || 0) + (pinItem.remaining_qty || pinItem.requested_qty || 0)
  }

  return {
    success: true,
    regions: Object.entries(grouped).map(([name, qty]) => ({ name, quantity: qty })),
  }
}

export async function isUserActiveTracker(userId: string) {
  const { data, error } = await supabase
    .from('org-member')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  return !error && !!data
}

export async function getUserOrgMember(userId: string) {
  const { data } = await supabase
    .from('org-member')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}