import { supabase } from '@/lib/supabase'
import { createNotification } from '@/services/notifications'
import { consumeOrganizationSupplies } from '@/services/inventory'

const GEOCODE_CACHE_TTL_MS = 1000 * 60 * 30
const GEOCODE_RATE_LIMIT_COOLDOWN_MS = 1000 * 60
const geocodeCache = new Map<string, { address: string; timestamp: number }>()
const geocodeInFlight = new Map<string, Promise<{ success: boolean; address?: string; error?: string }>>()
let geocodeRateLimitedUntil = 0

function getGeocodeCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`
}

function getCachedGeocode(cacheKey: string): string | null {
  const cached = geocodeCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.timestamp > GEOCODE_CACHE_TTL_MS) {
    geocodeCache.delete(cacheKey)
    return null
  }
  return cached.address
}

export interface Pin {
  id: string
  type: 'damaged' | 'safe'
  status: 'pending' | 'confirmed' | 'completed'
  phone: string
  description: string
  lat: number
  lng: number
  createdBy: string
  createdAt: Date
  image?: string
  assignedTo?: string
  user_id?: string
  image_url?: string
}

export interface Item {
  id: string
  name: string
  unit: string
  category: string
}

export interface PinItem {
  id: string
  pin_id: string
  item_id: string
  requested_qty: number
  remaining_qty: number
  item?: Item
}

export interface CreatePinInput {
  type: 'damaged' | 'safe'
  status: 'pending' | 'confirmed' | 'completed'
  phone: string
  description: string
  lat: number
  lng: number
  createdBy: string
  image?: string
  assignedTo?: string
  user_id: string | null
}

/**
 * Check if a user is an active tracker (from org-member table)
 */
export async function isUserActiveTracker(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('org-member')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      // No tracker record found - this is expected for regular users
      return false
    }

    return !!data
  } catch (err) {
    console.error('Error checking if user is tracker:', err)
    return false
  }
}

/**
 * Check if a user is an organization account
 */
export async function isUserOrganization(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      // No organization record found
      return false
    }

    return !!data
  } catch (err) {
    console.error('Error checking if user is organization:', err)
    return false
  }
}

/**
 * Create a new pin in the database
 * 
 * Status determination logic:
 * - Unauthorized user → status: pending, createdBy: "Anonymous User"
 * - Tracker user (from org-member) → status: confirmed
 * - Organization user → status: confirmed
 * - Other authorized users → status: pending
 */
export async function createPin(
  pin: CreatePinInput,
  imageFile?: File,
  userRole?: string
): Promise<{ success: boolean; pin?: Pin; error?: string }> {
  try {
    let imageUrl: string | null = null

    // Upload image if provided (optional feature)
    if (imageFile) {
      try {
        const fileName = `pins/${Date.now()}_${imageFile.name}`
        console.log('🔍 Image upload starting:', {
          fileName,
          fileSize: imageFile.size,
          fileType: imageFile.type,
          bucket: 'pin-images'
        })
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('pin-images')
          .upload(fileName, imageFile)

        console.log('📤 Upload response:', { uploadData, uploadError })

        if (uploadError) {
          console.error('❌ Image upload failed:', uploadError)
          // Continue without image - this is not a critical failure
        } else if (uploadData) {
          console.log('✅ File uploaded to:', uploadData.path)
          
          // Get public URL after successful upload
          const { data: urlData } = supabase.storage
            .from('pin-images')
            .getPublicUrl(fileName)
          
          console.log('🔗 Public URL response:', urlData)
          
          if (urlData && urlData.publicUrl) {
            imageUrl = urlData.publicUrl
            console.log('✨ Image URL ready:', imageUrl)
          }
        } else {
          console.warn('⚠️ Upload returned no data and no error')
        }
      } catch (imageError) {
        console.error('❌ Image upload exception:', imageError)
        // Continue without image - pins can be created without images
      }
    }

    // Determine status based on user role and account type
    let status: 'pending' | 'confirmed' = 'pending'
    if (!pin.user_id) {
      // Unauthorized user - always pending
      status = 'pending'
    } else {
      // Check if user is a tracker (from org-member table)
      const isTracker = await isUserActiveTracker(pin.user_id)
      if (isTracker) {
        status = 'confirmed'
        console.log('✅ User is a tracker - pin status: confirmed')
      } else if (userRole === 'organization') {
        // Organization users also get confirmed status
        status = 'confirmed'
        console.log('✅ User is an organization - pin status: confirmed')
      } else {
        // Regular authorized users get pending
        status = 'pending'
        console.log('📋 User is a regular user - pin status: pending')
      }
    }

    // Convert pin type for database (damaged -> damage, safe -> shelter)
    const dbType = pin.type === 'damaged' ? 'damage' : 'shelter'

    // Insert pin into database
    // Important: Only set user_id if it's actually provided (not null)
    // This prevents foreign key constraint violations
    const pinData: any = {
      latitude: pin.lat,
      longitude: pin.lng,
      type: dbType,
      phone: pin.phone,
      description: pin.description,
      status: status,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
    }

    // Only include user_id if it exists
    if (pin.user_id) {
      pinData.user_id = pin.user_id
    }

    const { data, error } = await supabase
      .from('pins')
      .insert([pinData])
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error creating pin:', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      })
      return { success: false, error: error.message }
    }

    // Map response back to frontend Pin interface
    const createdPin: Pin = {
      id: data.id,
      type: data.type === 'damage' ? 'damaged' : 'safe',
      status: data.status,
      phone: data.phone,
      description: data.description,
      lat: parseFloat(data.latitude),
      lng: parseFloat(data.longitude),
      createdBy: pin.createdBy,
      createdAt: new Date(data.created_at),
      image: imageUrl || undefined,
      user_id: data.user_id,
      assignedTo: pin.assignedTo,
    }

    // --- Automated tracker alert fan-out ------------------------------------
    // Requirement: When any pin is reported, alert all organization members
    // designated as trackers. Current implementation treats ALL active org-member
    // entries (status='active') as trackers (same logic as isUserActiveTracker).
    // If a more specific designation is later required (e.g. type='tracker'),
    // filter can be refined without changing call sites.
    // This runs opportunistically; failures are logged but don't block pin creation.
    try {
      // Fetch active tracker members (user_ids)
      // Prefer explicit type='tracker' when available; fall back to all active
      let { data: trackerRows, error: trackersError } = await supabase
        .from('org-member')
        .select('user_id')
        .eq('status', 'active')
        .eq('type', 'tracker')

      if (trackersError) {
        console.warn('[pin_notifications] Failed to load trackers:', trackersError.message)
      } else if (trackerRows && trackerRows.length > 0) {
        const reporterUserId = createdPin.user_id
        const targetUserIds = trackerRows
          .map((r: any) => r.user_id)
          .filter((uid: string | null) => !!uid && uid !== reporterUserId)

        if (targetUserIds.length > 0) {
          const payload = {
            pin_id: createdPin.id,
            type: createdPin.type,
            status: createdPin.status,
            lat: createdPin.lat,
            lng: createdPin.lng,
            description: createdPin.description,
            phone: createdPin.phone,
          }

          const title = createdPin.type === 'damaged' ? 'Damaged Location Reported' : 'Safe Zone Reported'
          const bodyBase = createdPin.description || ''
          const body = bodyBase.length > 140 ? bodyBase.slice(0, 137) + '…' : bodyBase

          // Prepare bulk notifications insert
          const notifications = targetUserIds.map((uid: string) => ({
            user_id: uid,
            type: 'pin_reported',
            title,
            body,
            payload,
          }))

          const { error: notifError } = await supabase
            .from('notifications')
            .insert(notifications)

          if (notifError) {
            console.error('[pin_notifications] Failed to insert pin_reported notifications:', notifError)
          } else {
            console.log(`[pin_notifications] Fan-out pin_reported to ${notifications.length} tracker(s)`) }
        }
      } else {
        // Fallback: no explicit tracker type found; notify all active org-members
        const { data: activeMembers, error: fallbackError } = await supabase
          .from('org-member')
          .select('user_id')
          .eq('status', 'active')

        if (fallbackError) {
          console.warn('[pin_notifications] Fallback load active members failed:', fallbackError.message)
        } else if (activeMembers && activeMembers.length > 0) {
          const reporterUserId = createdPin.user_id
          const targetUserIds = activeMembers
            .map((r: any) => r.user_id)
            .filter((uid: string | null) => !!uid && uid !== reporterUserId)

          if (targetUserIds.length > 0) {
            const payload = {
              pin_id: createdPin.id,
              type: createdPin.type,
              status: createdPin.status,
              lat: createdPin.lat,
              lng: createdPin.lng,
              description: createdPin.description,
              phone: createdPin.phone,
            }

            const title = createdPin.type === 'damaged' ? 'Damaged Location Reported' : 'Safe Zone Reported'
            const bodyBase = createdPin.description || ''
            const body = bodyBase.length > 140 ? bodyBase.slice(0, 137) + '…' : bodyBase

            const notifications = targetUserIds.map((uid: string) => ({
              user_id: uid,
              type: 'pin_reported',
              title,
              body,
              payload,
            }))

            const { error: notifError } = await supabase
              .from('notifications')
              .insert(notifications)

            if (notifError) {
              console.error('[pin_notifications] Fallback insert failed:', notifError)
            } else {
              console.log(`[pin_notifications] Fallback fan-out to ${notifications.length} active member(s)`) }
          }
        }
      }
    } catch (fanOutErr) {
      console.error('[pin_notifications] Fan-out exception:', fanOutErr)
    }
    // -------------------------------------------------------------------------

    return { success: true, pin: createdPin }
  } catch (err) {
    console.error('Error in createPin:', err)
    return { success: false, error: 'Failed to create pin' }
  }
}

/**
 * Fetch all pins from the database with creator names
 */
export async function fetchPins(): Promise<{ success: boolean; pins?: Pin[]; error?: string }> {
  try {
    console.log('🔍 fetchPins called - attempting to fetch from pins table')
    
    // First, test the Supabase connection with a simple count query
    try {
      const { count, error: countError } = await supabase
        .from('pins')
        .select('*', { count: 'exact', head: true })

      console.log('📊 Supabase connection test - Count:', count, 'Error:', countError)
      
      if (countError) {
        console.error('❌ Connection test failed:', countError)
      } else {
        console.log('✅ Supabase connection test passed!')
      }
    } catch (connErr) {
      console.error('❌ Connection test threw error:', connErr)
    }
    
    // Now try to fetch pins with user details
    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .order('created_at', { ascending: false })

    console.log('📋 Supabase response - data:', data, 'error:', error)

    if (error) {
      // Better error handling for various error types
      const errorMessage = error instanceof Error 
        ? error.message 
        : (error as any)?.message || JSON.stringify(error) || 'Unknown error'
      
      const errorDetails = {
        message: error?.message || 'No message provided',
        code: (error as any)?.code || 'No code',
        details: (error as any)?.details || 'No details',
        hint: (error as any)?.hint || 'No hint',
        errorType: error?.constructor?.name || 'Unknown',
        fullError: JSON.stringify(error),
        errorAsString: String(error),
      }
      console.error('❌ Error fetching pins from database:', errorDetails)
      console.error('Error object keys:', Object.keys(error || {}))
      return { success: false, error: `Failed to fetch pins: ${errorMessage}` }
    }

    // If no data, return empty array
    if (!data) {
      console.log('No pins found in database (data is null/undefined)')
      return { success: true, pins: [] }
    }

    console.log(`Successfully fetched ${data.length} pins from database`)

    // Get user IDs from pins
    const userIds = [...new Set(data.map((pin: any) => pin.user_id).filter(Boolean))]
    
    // Fetch user details if needed
    let userMap: { [key: string]: { name: string } } = {}
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds)

      if (usersError) {
        console.warn('Could not fetch user details:', usersError.message || 'Unknown error')
        // Continue without user details rather than failing
      } else if (users) {
        userMap = Object.fromEntries(users.map((u: any) => [u.id, { name: u.name }]))
        console.log(`Loaded details for ${users.length} users`)
      }
    }

    const pins: Pin[] = (data || []).map((row: any) => ({
      id: row.id,
      type: row.type === 'damage' ? 'damaged' : 'safe',
      status: row.status,
      phone: row.phone,
      description: row.description,
      lat: parseFloat(row.latitude),
      lng: parseFloat(row.longitude),
      createdBy: (row.user_id && userMap[row.user_id]?.name) || 'Anonymous User',
      createdAt: new Date(row.created_at),
      image: row.image_url || undefined,
      user_id: row.user_id,
    }))

    return { success: true, pins }
  } catch (err) {
    console.error('Error in fetchPins:', err)
    return { success: false, error: 'Failed to fetch pins' }
  }
}

async function notifyPinConfirmed(pinId: string) {
  try {
    const { data: pin, error: pinError } = await supabase
      .from('pins')
      .select('id, user_id, type, description, phone, latitude, longitude, confirmed_at')
      .eq('id', pinId)
      .maybeSingle()

    if (pinError || !pin) {
      console.warn('[pin_notifications] Failed to load confirmed pin for notification', pinError)
      return
    }

    const normalizedType = pin.type === 'damage' ? 'damaged' : 'safe'
    const description = typeof pin.description === 'string' ? pin.description.trim() : ''
    const shortDescription = description.length > 140 ? `${description.slice(0, 137)}...` : description
    const payload = {
      pin_id: pin.id,
      type: normalizedType,
      status: 'confirmed',
      description: pin.description,
      phone: pin.phone,
      lat: pin.latitude,
      lng: pin.longitude,
      confirmed_at: pin.confirmed_at,
    }

    const organizationTitle = normalizedType === 'damaged'
      ? 'Confirmed Help Request'
      : 'Confirmed Safe Location'
    const organizationBody = shortDescription || 'A tracker confirmed a pin and it is ready for organization review.'

    const ownerTitle = 'Your Pin Was Confirmed'
    const ownerBody = normalizedType === 'damaged'
      ? 'Your help request was confirmed and sent to organizations.'
      : 'Your safe location report was confirmed.'

    const { data: organizations, error: organizationsError } = await supabase
      .from('organizations')
      .select('id')
      .eq('status', 'active')

    if (organizationsError) {
      console.warn('[pin_notifications] Failed to load organizations for confirmed pin', organizationsError)
    } else if (organizations?.length) {
      await Promise.allSettled(
        organizations.map((organization: { id: string }) =>
          createNotification({
            organizationId: organization.id,
            type: 'pin_confirmed',
            title: organizationTitle,
            body: organizationBody,
            payload,
          })
        )
      )
    }

    if (pin.user_id) {
      await createNotification({
        userId: pin.user_id,
        type: 'pin_confirmed_owner',
        title: ownerTitle,
        body: ownerBody,
        payload,
      })
    }
  } catch (notificationError) {
    console.error('[pin_notifications] Failed to send pin confirmed notifications', notificationError)
  }
}

/**
 * Update pin status from pending to confirmed
 * Only trackers can confirm pins (change status to 'confirmed')
 */
export async function updatePinStatus(
  pinId: string,
  newStatus: 'pending' | 'confirmed' | 'completed',
  confirmedByMemberId?: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let pinBeforeStatus: string | null = null

    // If attempting to confirm a pin, verify user is a tracker
    if (newStatus === 'confirmed') {
      const { data: existingPin, error: pinLoadError } = await supabase
        .from('pins')
        .select('status')
        .eq('id', pinId)
        .maybeSingle()

      if (pinLoadError) {
        console.error('Failed to load pin before confirm:', pinLoadError)
      } else {
        pinBeforeStatus = existingPin?.status ?? null
      }

      if (!userId || !confirmedByMemberId) {
        console.error('Authorization check failed: Missing userId or confirmedByMemberId')
        return { success: false, error: 'Only trackers can confirm pins' }
      }

      // Verify the user is an active tracker
      const isTracker = await isUserActiveTracker(userId)
      if (!isTracker) {
        console.error('Authorization failed: User is not an active tracker')
        return { success: false, error: 'Only trackers can confirm pins' }
      }
    }

    const updateData: any = {
      status: newStatus,
    }

    if (newStatus === 'confirmed' && confirmedByMemberId) {
      updateData.confirmed_by = confirmedByMemberId
      updateData.confirmed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('pins')
      .update(updateData)
      .eq('id', pinId)

    if (error) {
      console.error('Error updating pin status:', error)
      return { success: false, error: error.message }
    }

    if (newStatus === 'confirmed' && pinBeforeStatus !== 'confirmed') {
      await notifyPinConfirmed(pinId)
    }

    return { success: true }
  } catch (err) {
    console.error('Error in updatePinStatus:', err)
    return { success: false, error: 'Failed to update pin status' }
  }
}

/**
 * Get org-member record for a user (needed for confirmed_by reference)
 */
export async function getUserOrgMember(userId: string): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabase
      .from('org-member')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      return null
    }

    return data
  } catch (err) {
    console.error('Error fetching org-member:', err)
    return null
  }
}

/**
 * Delete a pin from the database
 * Only organizations can delete confirmed pins
 * 
 * NOTE: This directly deletes the pin. Prefer using checkAndHandleCompletedPin()
 * which respects the database trigger that auto-deletes pins when all pin_items are removed.
 */
export async function deletePin(
  pinId: string,
  userId?: string,
  userRole?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify authorization: only organizations can delete pins
    if (userRole !== 'organization') {
      console.error('Authorization failed: Only organizations can delete pins')
      return { success: false, error: 'Only organizations can delete pins' }
    }

    // First, delete all pin_items for this pin
    // This ensures the trigger can properly handle the cleanup
    const { error: deleteItemsError } = await supabase
      .from('pin_items')
      .delete()
      .eq('pin_id', pinId)

    if (deleteItemsError) {
      console.error('Error deleting pin_items before pin deletion:', deleteItemsError)
      return { success: false, error: deleteItemsError.message }
    }

    // Now delete the pin itself
    // The trigger should have already handled this, but do it explicitly for safety
    const { error } = await supabase
      .from('pins')
      .delete()
      .eq('id', pinId)

    if (error) {
      console.error('Error deleting pin:', error)
      return { success: false, error: error.message }
    }

    console.log('✅ Pin deleted successfully:', pinId)
    return { success: true }
  } catch (err) {
    console.error('Error in deletePin:', err)
    return { success: false, error: 'Failed to delete pin' }
  }
}

/**
 * Fetch all items from the database
 */
export async function fetchItems(): Promise<{ success: boolean; items?: Item[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching items:', error)
      return { success: false, error: error.message }
    }

    return { success: true, items: data || [] }
  } catch (err) {
    console.error('Error in fetchItems:', err)
    return { success: false, error: 'Failed to fetch items' }
  }
}

/**
 * Create pin items for a confirmed pin
 * Called when a tracker confirms a pin with specific item requests
 */
export async function createPinItems(
  pinId: string,
  items: Array<{ item_id: string; requested_qty: number }>
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!items || items.length === 0) {
      return { success: true }
    }

    // Create pin items records
    const pinItemsData = items.map((item) => ({
      pin_id: pinId,
      item_id: item.item_id,
      requested_qty: item.requested_qty,
      remaining_qty: item.requested_qty,
      created_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('pin_items')
      .insert(pinItemsData)

    if (error) {
      console.error('Error creating pin items:', error)
      return { success: false, error: error.message }
    }

    console.log('✅ Pin items created successfully:', pinId)
    return { success: true }
  } catch (err) {
    console.error('Error in createPinItems:', err)
    return { success: false, error: 'Failed to create pin items' }
  }
}

/**
 * Fetch pins with their associated items
 */
export async function fetchPinsWithItems(): Promise<{
  success: boolean
  pins?: (Pin & { pin_items?: (PinItem & { item?: Item })[] })[]
  error?: string
}> {
  try {
    console.log('🔍 fetchPinsWithItems called')
    
    // Fetch pins
    const { data: pinsData, error: pinsError } = await supabase
      .from('pins')
      .select('*')
      .order('created_at', { ascending: false })

    console.log('📋 Pins query result - data:', pinsData ? pinsData.length + ' pins' : 'null', 'error:', pinsError)

    if (pinsError) {
      console.error('❌ Error fetching pins:', pinsError)
      return { success: false, error: pinsError.message || 'Unknown error' }
    }

    if (!pinsData) {
      return { success: true, pins: [] }
    }

    // Fetch pin items with item details
    const { data: pinItemsData, error: pinItemsError } = await supabase
      .from('pin_items')
      .select('*, items(*)')

    if (pinItemsError) {
      console.warn('Could not fetch pin items:', pinItemsError.message)
    }

    // Build pin map with items
    const pinItemsMap: { [pinId: string]: (PinItem & { item?: Item })[] } = {}
    if (pinItemsData) {
      pinItemsData.forEach((pi: any) => {
        if (!pinItemsMap[pi.pin_id]) {
          pinItemsMap[pi.pin_id] = []
        }
        pinItemsMap[pi.pin_id].push({
          id: pi.id,
          pin_id: pi.pin_id,
          item_id: pi.item_id,
          requested_qty: pi.requested_qty,
          remaining_qty: pi.remaining_qty,
          item: pi.items,
        })
      })
    }

    // Get user details
    const userIds = [...new Set(pinsData.map((pin: any) => pin.user_id).filter(Boolean))]
    let userMap: { [key: string]: { name: string } } = {}
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds)

      if (usersError) {
        console.warn('Could not fetch user details:', usersError.message)
      } else if (users) {
        userMap = Object.fromEntries(users.map((u: any) => [u.id, { name: u.name }]))
      }
    }

    const pins = pinsData.map((row: any) => ({
      id: row.id,
      type: (row.type === 'damage' ? 'damaged' : 'safe') as 'damaged' | 'safe',
      status: row.status as 'pending' | 'confirmed' | 'completed',
      phone: row.phone,
      description: row.description,
      lat: parseFloat(row.latitude),
      lng: parseFloat(row.longitude),
      createdBy: (row.user_id && userMap[row.user_id]?.name) || 'Anonymous User',
      createdAt: new Date(row.created_at),
      image: row.image_url || undefined,
      user_id: row.user_id,
      pin_items: pinItemsMap[row.id] || [],
    }))

    return { success: true, pins }
  } catch (err) {
    console.error('Error in fetchPinsWithItems:', err)
    return { success: false, error: 'Failed to fetch pins with items' }
  }
}

/**
 * Update pin item quantities after delivery/fulfillment
 */
export async function updatePinItemQuantity(
  pinItemId: string,
  newRemainingQty: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('pin_items')
      .update({ remaining_qty: newRemainingQty })
      .eq('id', pinItemId)

    if (error) {
      console.error('Error updating pin item quantity:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Error in updatePinItemQuantity:', err)
    return { success: false, error: 'Failed to update pin item quantity' }
  }
}

/**
 * Get reverse geocoded address from coordinates
 * Calls the Next.js API route which uses Google Maps API
 */
export async function getReverseGeocodedAddress(
  lat: number,
  lng: number
): Promise<{ success: boolean; address?: string; error?: string }> {
  try {
    // Validate coordinates before sending
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      console.warn('Invalid coordinates for geocoding:', { lat, lng, latType: typeof lat, lngType: typeof lng })
      return { success: false, error: 'Invalid coordinates' }
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn('Coordinates out of valid range:', { lat, lng })
      return { success: false, error: 'Coordinates out of range' }
    }

    const cacheKey = getGeocodeCacheKey(lat, lng)
    const cachedAddress = getCachedGeocode(cacheKey)
    if (cachedAddress) {
      return { success: true, address: cachedAddress }
    }

    if (Date.now() < geocodeRateLimitedUntil) {
      return { success: false, error: 'Rate limited' }
    }

    const inFlight = geocodeInFlight.get(cacheKey)
    if (inFlight) {
      return await inFlight
    }

    const requestPromise = (async () => {
      try {
        const response = await fetch('/api/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng }),
        })

        let data: any
        try {
          data = await response.json()
        } catch {
          console.error('Failed to parse response as JSON. Status:', response.status, 'Coordinates:', { lat, lng })
          return { success: false, error: `HTTP ${response.status}` }
        }

        if (!response.ok) {
          if (response.status === 429) {
            geocodeRateLimitedUntil = Date.now() + GEOCODE_RATE_LIMIT_COOLDOWN_MS
            console.warn('Reverse geocoding rate-limited (429). Cooling down for 60s.', { lat, lng })
            return { success: false, error: 'Rate limited' }
          }

          console.error('Reverse geocoding error (status:', response.status, 'Coordinates:', { lat, lng }, '):', data)
          return { success: false, error: data?.error || `HTTP ${response.status}` }
        }

        const address = data.primary_address || 'Address not found'
        geocodeCache.set(cacheKey, { address, timestamp: Date.now() })
        console.log('✅ Geocoded address:', { lat, lng, address })

        return {
          success: true,
          address,
        }
      } finally {
        geocodeInFlight.delete(cacheKey)
      }
    })()

    geocodeInFlight.set(cacheKey, requestPromise)
    return await requestPromise
  } catch (err) {
    console.error('Error in getReverseGeocodedAddress:', err)
    return { success: false, error: 'Failed to fetch address' }
  }
}

/**
 * Fetch confirmed pins with full details for organization dashboard
 * 
 * Status logic:
 * - If all items have remaining_qty === requested_qty → status = "pending" (nothing fulfilled yet)
 * - If some items have remaining_qty > 0 but < requested_qty → status = "partially_accepted"
 * - If all items have remaining_qty === 0 → pin should be deleted/hidden
 */
export async function fetchConfirmedPinsForDashboard(): Promise<{
  success: boolean
  helpRequests?: Array<{
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
    acceptedItems?: Array<{
      category: string
      unit: string
      originalQuantity: number
      acceptedQuantity: number
      remainingQuantity: number
      acceptedBy: string
      acceptedAt: Date
    }>
  }>
  error?: string
}> {
  try {
    // Fetch only confirmed pins
    const { data: confirmedPins, error: pinsError } = await supabase
      .from('pins')
      .select('*')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })

    if (pinsError) {
      console.error('Error fetching confirmed pins:', pinsError)
      return { success: false, error: pinsError.message }
    }

    if (!confirmedPins || confirmedPins.length === 0) {
      return { success: true, helpRequests: [] }
    }

    // Fetch pin items with item details for these pins
    const pinIds = confirmedPins.map((p: any) => p.id)
    const { data: pinItemsData, error: pinItemsError } = await supabase
      .from('pin_items')
      .select('*, items(*)')
      .in('pin_id', pinIds)

    if (pinItemsError) {
      console.warn('Could not fetch pin items:', pinItemsError.message)
    }

    // Get user details
    const userIds = [...new Set(confirmedPins.map((p: any) => p.user_id).filter(Boolean))]
    let userMap: { [key: string]: { name: string } } = {}
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds)

      if (!usersError && users) {
        userMap = Object.fromEntries(users.map((u: any) => [u.id, { name: u.name }]))
      }
    }

    // Build pin items map
    const pinItemsMap: { [pinId: string]: any[] } = {}
    if (pinItemsData) {
      pinItemsData.forEach((pi: any) => {
        if (!pinItemsMap[pi.pin_id]) {
          pinItemsMap[pi.pin_id] = []
        }
        pinItemsMap[pi.pin_id].push(pi)
      })
    }

    // Build help requests with status calculation
    const helpRequests = confirmedPins
      .map((pin: any) => {
        const pinItems = pinItemsMap[pin.id] || []

        // Calculate status based on remaining_qty vs requested_qty
        let status: 'pending' | 'partially_accepted' = 'pending'
        const allFulfilled = pinItems.every((pi: any) => pi.remaining_qty === 0)
        const anyPartial = pinItems.some(
          (pi: any) => pi.remaining_qty > 0 && pi.remaining_qty < pi.requested_qty
        )

        if (anyPartial) {
          status = 'partially_accepted'
        } else if (allFulfilled) {
          // All items fulfilled - this pin should be excluded (completed)
          return null
        }

        // Calculate accepted items
        const acceptedItems = pinItems
          .filter((pi: any) => pi.remaining_qty < pi.requested_qty)
          .map((pi: any) => ({
            category: pi.items?.name || 'Unknown',
            unit: pi.items?.unit || '',
            originalQuantity: pi.requested_qty,
            acceptedQuantity: pi.requested_qty - pi.remaining_qty,
            remainingQuantity: pi.remaining_qty,
            acceptedBy: 'Organization',
            acceptedAt: new Date(pi.created_at),
          }))

        return {
          id: pin.id,
          title: `Emergency Response - ${pin.type === 'damage' ? 'Damage' : 'Shelter'} Report`,
          description: pin.description || '',
          location: '', // Will be geocoded
          lat: parseFloat(pin.latitude),
          lng: parseFloat(pin.longitude),
          status,
          requestedBy: (pin.user_id && userMap[pin.user_id]?.name) || pin.phone || 'Unknown',
          requestedAt: new Date(pin.created_at),
          requiredItems: pinItems.map((pi: any) => ({
            category: pi.items?.name || 'Unknown',
            unit: pi.items?.unit || '',
            quantity: pi.requested_qty,
            itemId: pi.item_id,
            pinItemId: pi.id,
            remainingQty: pi.remaining_qty,
          })),
          acceptedItems: acceptedItems.length > 0 ? acceptedItems : undefined,
        }
      })
      .filter(Boolean)

    // Geocode addresses sequentially to avoid rate limiting (skip if invalid coordinates)
    const geocodedRequests: any[] = []
    const safeRequests = helpRequests.filter((request): request is NonNullable<typeof request> => !!request)

    for (const request of safeRequests) {
      const hasValidCoords = typeof request.lat === 'number' &&
                             typeof request.lng === 'number' &&
                             !isNaN(request.lat) &&
                             !isNaN(request.lng) &&
                             request.lat >= -90 &&
                             request.lat <= 90 &&
                             request.lng >= -180 &&
                             request.lng <= 180

      let region = 'Location unknown'
      let location = 'Location unknown'

      if (hasValidCoords) {
        const geoResult = await getReverseGeocodedAddress(request.lat, request.lng)
        if (geoResult.success && geoResult.address) {
          region = geoResult.address
          location = geoResult.address
        }
      } else {
        console.warn('Skipping geocoding for invalid coordinates:', {
          lat: request.lat,
          lng: request.lng,
          pinId: request.id
        })
      }

      geocodedRequests.push({
        ...request,
        region,
        location,
      })
    }

    return { success: true, helpRequests: geocodedRequests }
  } catch (err) {
    console.error('Error in fetchConfirmedPinsForDashboard:', err)
    return { success: false, error: 'Failed to fetch confirmed pins' }
  }
}

/**
 * Accept items for a help request (pin)
 * Updates remaining_qty in pin_items table
 * 
 * Logic:
 * - User provides quantities they can fulfill
 * - remaining_qty = current_remaining_qty - accepted_quantity
 * - After updating all items, checks if pin should be deleted (all items fulfilled)
 * - If all items have remaining_qty === 0, calls deletePinIfNoItemsRemain to delete the pin
 */
export async function acceptHelpRequestItems(
  pinId: string,
  acceptedItems: Array<{
    pinItemId: string
    acceptedQuantity: number
  }>,
  organizationId?: string
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  try {
    console.log(`📝 Accepting items for pin ${pinId}`)

    let inventoryItems: Array<{
      itemId?: string | null
      itemName: string
      unit?: string
      quantity: number
    }> = []

    if (organizationId && acceptedItems.length > 0) {
      const pinItemIds = acceptedItems.map(item => item.pinItemId)
      const acceptedMap = new Map(acceptedItems.map(item => [item.pinItemId, item.acceptedQuantity]))

      const { data: itemDetails, error: detailsError } = await supabase
        .from('pin_items')
        .select(
          `
          id,
          item_id,
          items (
            name,
            unit
          )
        `
        )
        .in('id', pinItemIds)

      if (detailsError) {
        console.warn('Failed to load pin item details for inventory:', detailsError.message)
      } else if (itemDetails) {
        inventoryItems = itemDetails
          .map((row: any) => ({
            itemId: row.item_id,
            itemName: row.items?.name || 'Unknown',
            unit: row.items?.unit || '',
            quantity: acceptedMap.get(row.id) || 0,
          }))
          .filter(item => item.quantity > 0)
      }
    }

    // Update each pin_item with the accepted quantity
    for (const item of acceptedItems) {
      // First, get the current requested_qty and remaining_qty
      const { data: pinItem, error: fetchError } = await supabase
        .from('pin_items')
        .select('requested_qty, remaining_qty')
        .eq('id', item.pinItemId)
        .maybeSingle()

      if (fetchError || !pinItem) {
        console.error('Error fetching pin_item:', fetchError)
        continue
      }

      // Calculate new remaining_qty
      // Use the current remaining_qty when available (represents how many are still needed).
      // Fallback to requested_qty if remaining_qty is null/undefined (initial state).
      const currentRemaining = typeof pinItem.remaining_qty === 'number' ? pinItem.remaining_qty : pinItem.requested_qty
      const newRemainingQty = Math.max(0, currentRemaining - item.acceptedQuantity)
      const acceptedSoFar = pinItem.requested_qty - newRemainingQty

      console.log(`  ✅ Item ${item.pinItemId}: accepted=${acceptedSoFar}, remaining=${newRemainingQty}`)

      // Update the pin_item
      const { error: updateError } = await supabase
        .from('pin_items')
        .update({ remaining_qty: newRemainingQty })
        .eq('id', item.pinItemId)

      if (updateError) {
        console.error('Error updating pin_item:', updateError)
        return { success: false, error: updateError.message }
      }
    }

    console.log(`✅ All items updated for pin ${pinId}`)

    if (organizationId && inventoryItems.length > 0) {
      const inventoryResult = await consumeOrganizationSupplies(organizationId, inventoryItems, {
        pinId,
        actorType: 'organization',
        actorId: organizationId,
      })

      if (!inventoryResult.success) {
        console.warn('Inventory consumption failed:', inventoryResult.error)
      } else if (inventoryResult.warnings && inventoryResult.warnings.length > 0) {
        console.warn('Inventory consumption warnings:', inventoryResult.warnings)
      }
    }

    // Check if all items are now fulfilled (remaining_qty === 0 for all)
    const { data: pinItems, error: checkError } = await supabase
      .from('pin_items')
      .select('remaining_qty')
      .eq('pin_id', pinId)

    if (checkError) {
      console.error('Error checking pin completion:', checkError)
      return { success: true, completed: false } // Items updated, just failed to check completion
    }

    const allFulfilled = pinItems?.length > 0 && pinItems.every((pi: any) => pi.remaining_qty === 0)

    if (allFulfilled) {
      console.log(`🎉 All items fulfilled for pin ${pinId}! Deleting all pin_items...`)

      // Step 1: Delete ALL pin_items for this pin
      const { error: deleteItemsError } = await supabase
        .from('pin_items')
        .delete()
        .eq('pin_id', pinId)

      if (deleteItemsError) {
        console.error('Error deleting pin_items:', deleteItemsError)
        return { success: false, error: deleteItemsError.message }
      }

      console.log(`✅ All pin_items deleted for pin ${pinId}`)

      // Step 2: Now delete the pin since it has no items left
      const deleteResult = await deletePinIfNoItemsRemain(pinId)

      if (deleteResult.success && deleteResult.deleted) {
        console.log(`✅ Pin ${pinId} successfully deleted`)
        return { success: true, completed: true }
      } else {
        console.warn(`⚠️ Could not delete pin ${pinId}: ${deleteResult.error}`)
        return { success: true, completed: false, error: deleteResult.error }
      }
    }

    console.log(`📌 Pin ${pinId} still has unfulfilled items`)
    return { success: true, completed: false }
  } catch (err) {
    console.error('Error in acceptHelpRequestItems:', err)
    return { success: false, error: 'Failed to accept items' }
  }
}/**
 * Check if a pin is fully completed (all items have 0 remaining)
 * and optionally delete it if so
 */
export async function checkAndHandleCompletedPin(pinId: string): Promise<{
  success: boolean
  isCompleted?: boolean
  error?: string
}> {
  try {
    const { data: pinItems, error } = await supabase
      .from('pin_items')
      .select('remaining_qty')
      .eq('pin_id', pinId)

    if (error) {
      console.error('Error fetching pin_items:', error)
      return { success: false, error: error.message }
    }

    // Check if all items have 0 remaining
    const isCompleted = pinItems?.length > 0 && pinItems.every((pi: any) => pi.remaining_qty === 0)

    if (isCompleted) {
      // Delete all pin_items for this pin
      // This will trigger the database trigger to auto-delete the pin
      const { error: deleteItemsError } = await supabase
        .from('pin_items')
        .delete()
        .eq('pin_id', pinId)

      if (deleteItemsError) {
        console.error('Error deleting pin_items:', deleteItemsError)
        return { success: false, error: deleteItemsError.message }
      }

      // The trigger will automatically delete the pin when all pin_items are deleted
      // So we don't need to do anything else here
      console.log(`✅ Pin ${pinId} marked for deletion: all pin_items removed (trigger will auto-delete pin)`)
      return { success: true, isCompleted: true }
    }

    return { success: true, isCompleted: false }
  } catch (err) {
    console.error('Error in checkAndHandleCompletedPin:', err)
    return { success: false, error: 'Failed to check pin completion' }
  }
}

/**
 * Delete a pin row when its last pin_items is removed
 * Call this after deleting pin_items to check if the pin should also be deleted
 * 
 * Logic:
 * 1. Check if there are any remaining pin_items for this pin_id
 * 2. If NO pin_items remain, delete the pins row with that pin_id
 * 3. Return success status
 * 
 * NOTE: This function only deletes the PIN, not the pin_items!
 * You must delete pin_items BEFORE calling this function.
 */
export async function deletePinIfNoItemsRemain(
  pinId: string
): Promise<{ success: boolean; deleted: boolean; error?: string }> {
  try {
    console.log(`🔍 Checking if pin ${pinId} should be deleted (no items remaining)`)

    // Check if there are any remaining pin_items for this pin
    const { data: remainingItems, error: checkError } = await supabase
      .from('pin_items')
      .select('id')
      .eq('pin_id', pinId)

    if (checkError) {
      console.error(`❌ Error checking remaining pin_items for pin ${pinId}:`, checkError)
      return { success: false, deleted: false, error: checkError.message }
    }

    // If there are still pin_items, don't delete the pin
    if (remainingItems && remainingItems.length > 0) {
      console.log(`✅ Pin ${pinId} has ${remainingItems.length} remaining item(s), not deleting`)
      return { success: true, deleted: false }
    }

    // No pin_items remain, so delete the pin
    console.log(`🗑️ No pin_items remain for pin ${pinId}, deleting the pin`)

    const { error: deleteError } = await supabase
      .from('pins')
      .delete()
      .eq('id', pinId)

    if (deleteError) {
      console.error(`❌ Error deleting pin ${pinId}:`, deleteError)
      return { success: false, deleted: false, error: deleteError.message }
    }

    console.log(`✅ Successfully deleted pin ${pinId} (no items remaining)`)
    return { success: true, deleted: true }
  } catch (err) {
    console.error(`❌ Error in deletePinIfNoItemsRemain for pin ${pinId}:`, err)
    return { success: false, deleted: false, error: 'Failed to delete pin' }
  }
}

/**
 * Fetch aggregated supply needs grouped by region
 * Returns: { region, category, unit, totalQuantityNeeded }
 */
export async function fetchAggregatedSuppliesByRegion(): Promise<{
  success: boolean
  supplies?: Array<{
    region: string
    itemName: string
    unit: string
    totalQuantityNeeded: number
    itemId: string
  }>
  error?: string
}> {
  try {
    // Step 1: Fetch confirmed pins
    const { data: confirmedPins, error: pinsError } = await supabase
      .from('pins')
      .select('id, latitude, longitude')
      .eq('status', 'confirmed')

    if (pinsError || !confirmedPins || confirmedPins.length === 0) {
      console.log('📍 No confirmed pins found')
      return { success: true, supplies: [] }
    }

    // Step 2: Fetch pin_items with item details
    const confirmedPinIds = confirmedPins.map(p => p.id)
    const { data: pinItemsData, error: pinItemsError } = await supabase
      .from('pin_items')
      .select(`
        id,
        pin_id,
        item_id,
        remaining_qty,
        requested_qty,
        items (
          id,
          name,
          unit
        )
      `)
      .in('pin_id', confirmedPinIds)

    if (pinItemsError || !pinItemsData || pinItemsData.length === 0) {
      console.log('📍 No pin items found')
      return { success: true, supplies: [] }
    }

    // Step 3: Build pin coordinate map
    const pinCoordinatesMap: { [pinId: string]: { lat: number; lng: number } } = {}
    confirmedPins.forEach((pin: any) => {
      pinCoordinatesMap[pin.id] = {
        lat: parseFloat(pin.latitude),
        lng: parseFloat(pin.longitude),
      }
    })

    // Step 4: Geocode pins to regions
    const pinRegionMap: { [pinId: string]: string } = {}
    for (const pin of confirmedPins) {
      const coords = pinCoordinatesMap[pin.id]
      if (coords && !isNaN(coords.lat) && !isNaN(coords.lng) &&
          coords.lat >= -90 && coords.lat <= 90 &&
          coords.lng >= -180 && coords.lng <= 180) {
        const geoResult = await getReverseGeocodedAddress(coords.lat, coords.lng)
        pinRegionMap[pin.id] = geoResult.success && geoResult.address ? geoResult.address : 'Unknown Region'
      } else {
        pinRegionMap[pin.id] = 'Unknown Region'
      }
    }

    // Step 5: Aggregate by (region, itemName)
    const aggregatedMap: { [key: string]: { region: string; itemName: string; unit: string; itemId: string; totalQuantityNeeded: number } } = {}

    pinItemsData.forEach((pinItem: any) => {
      const pinId = pinItem.pin_id
      const region = pinRegionMap[pinId]
      if (!region) return

      const itemInfo = pinItem.items
      if (!itemInfo) return

      const itemName = itemInfo.name || 'Unknown Item'
      const unit = itemInfo.unit || 'Unknown Unit'
      const remainingQty = pinItem.remaining_qty !== null && pinItem.remaining_qty !== undefined 
        ? pinItem.remaining_qty 
        : (pinItem.requested_qty || 0)

      const key = `${region}|${itemName}`

      if (!aggregatedMap[key]) {
        aggregatedMap[key] = {
          region,
          itemName,
          unit,
          itemId: pinItem.item_id,
          totalQuantityNeeded: 0,
        }
      }

      aggregatedMap[key].totalQuantityNeeded += remainingQty
    })

    const supplies = Object.values(aggregatedMap)
    console.log(`✅ Returning ${supplies.length} supplies`)
    return { success: true, supplies }
  } catch (err) {
    console.error('Error in fetchAggregatedSuppliesByRegion:', err)
    return { success: false, error: 'Failed to fetch aggregated supplies' }
  }
}
