import { supabase } from '../lib/supabase'
import { createNotification } from './notifications'

type FamilyLink = {
  id: string
  user_id: string
  member_id: string
  relation?: string | null
}

type UserShort = {
  id: string
  name?: string | null
  phone?: string | null
}

export async function fetchFamilyMembers(userId: string) {
  // 1) fetch links
  try {
    const { data: links, error } = await supabase
      .from('family_members')
      .select('id,user_id,member_id,relation,safety_status,safety_check_started_at,safety_check_expires_at,created_at')
      .eq('user_id', userId)

    if (error) {
      // Log detailed information to help debugging schema/type mismatches
      console.error('supabase fetch family_members error', {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      })
      return []
    }

    const memberIds = links?.map((l: any) => l.member_id) ?? []
    if (memberIds.length === 0) return []

    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id,name,phone,image')
      .in('id', memberIds)

    if (uErr) {
      console.error('supabase fetch users error', {
        message: uErr.message,
        details: (uErr as any).details,
        hint: (uErr as any).hint,
        code: (uErr as any).code,
      })
      return links!.map((l: any) => ({ id: l.id, relation: l.relation, member: { id: l.member_id } }))
    }

    // Map back to links with user info
    const result = (links as any[]).map((l) => ({
      id: l.id,
      relation: l.relation,
      safety_status: l.safety_status,
      safety_check_started_at: l.safety_check_started_at,
      safety_check_expires_at: l.safety_check_expires_at,
      member: (users as any[])?.find((u) => u.id === l.member_id) ?? { id: l.member_id }
    }))

    return result
  } catch (err: any) {
    // Defensive: supabase may throw or return unusual error objects. Provide useful logs and return empty.
    console.error('unexpected error in fetchFamilyMembers', {
      message: err?.message ?? String(err),
      stack: err?.stack,
      raw: err,
    })
    return []
  }
}

export async function sendMessage(senderId: string, receiverId: string, content: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: senderId, receiver_id: receiverId, content, status: 'sent' })
    .select()

  if (error) throw error
  return data?.[0]
}

// Send a safety check notification to a family member
export async function sendSafetyCheck(fromUserId: string, toUserId: string) {
  try {
    // Delegate to API to use server-only env
    const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/family/safety/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId, toUserId })
    })
    if (!res.ok) {
      const j = await res.json().catch(() => undefined)
      return { success: false, error: j?.error || 'request_failed' }
    }
    const j = await res.json().catch(() => ({})) as any
    // normalize to seconds for downstream consumers
    const durationSeconds = typeof j?.durationSeconds === 'number'
      ? j.durationSeconds
      : (typeof j?.durationMinutes === 'number' ? (j.durationMinutes * 60) : undefined)
    return { success: true, durationSeconds }
  } catch (err: any) {
    console.error('sendSafetyCheck failed', err)
    return { success: false, error: err }
  }
}

export async function addFamilyMember(userId: string, phone: string, name?: string, relation?: string) {
  // Backwards-compatible: treat the phone arg as an identifier and try to resolve
  return addFamilyMemberByIdentifier(userId, phone, name, relation)
}

export async function addFamilyMemberByIdentifier(userId: string, identifier: string, name?: string, relation?: string) {
  try {
    const found = await findUsers(identifier)
    const u = (found && found.length > 0) ? found[0] : null
    if (!u) return { success: false, error: 'member_not_found' }
    return addFamilyMemberById(userId, u.id, relation)
  } catch (err: any) {
    console.error('unexpected error addFamilyMemberByIdentifier', err)
    return { success: false, error: err }
  }
}

export async function addFamilyMemberById(userId: string, memberId: string, relation?: string) {
  try {
    // prevent duplicate links
    const { data: existing, error: eErr } = await supabase
      .from('family_members')
      .select('id')
      .eq('user_id', userId)
      .eq('member_id', memberId)
      .limit(1)

    if (eErr) {
      console.error('error checking existing family_members', eErr)
      // continue to attempt insert; caller will see insert error if any
    }
    if (existing && existing.length > 0) {
      return { success: false, error: 'already_linked' }
    }
    const { data, error } = await supabase
      .from('family_members')
      .insert({ user_id: userId, member_id: memberId, relation })
      .select()

    if (error) {
      console.error('error inserting family_members', error)
      return { success: false, error }
    }

    return { success: true, data: data?.[0] }
  } catch (err: any) {
    console.error('unexpected error addFamilyMemberById', err)
    return { success: false, error: err }
  }
}

export async function removeFamilyMemberById(userId: string, memberId: string) {
  try {
    // Delete bidirectional links - remove from both perspectives
    // Link 1: userId -> memberId (user's perspective)
    const { error: error1 } = await supabase
      .from('family_members')
      .delete()
      .eq('user_id', userId)
      .eq('member_id', memberId)

    // Link 2: memberId -> userId (member's perspective)
    const { error: error2 } = await supabase
      .from('family_members')
      .delete()
      .eq('user_id', memberId)
      .eq('member_id', userId)

    if (error1 || error2) {
      console.error('error deleting family_members', { error1, error2 })
      return { success: false, error: error1 || error2 }
    }

    return { success: true }
  } catch (err: any) {
    console.error('unexpected error removeFamilyMemberById', err)
    return { success: false, error: err }
  }
}

// ============================================
// FAMILY REQUEST FUNCTIONS
// ============================================

export async function sendFamilyRequest(fromUserId: string, toUserId: string, relation: string) {
  try {
    // Check if already linked
    const { data: existing } = await supabase
      .from('family_members')
      .select('id')
      .eq('user_id', fromUserId)
      .eq('member_id', toUserId)
      .limit(1)

    if (existing && existing.length > 0) {
      return { success: false, error: 'already_linked' }
    }

    // Check if pending request already exists
    const { data: pendingReq } = await supabase
      .from('family_requests')
      .select('id')
      .eq('from_user_id', fromUserId)
      .eq('to_user_id', toUserId)
      .eq('status', 'pending')
      .limit(1)

    if (pendingReq && pendingReq.length > 0) {
      return { success: false, error: 'request_already_sent' }
    }

    const { data, error } = await supabase
      .from('family_requests')
      .insert({ 
        from_user_id: fromUserId, 
        to_user_id: toUserId, 
        relation,
        status: 'pending'
      })
      .select()

    if (error) {
      console.error('error creating family_request', error)
      return { success: false, error }
    }

    const request = data?.[0]

    // Create a notification for the recipient
    try {
      // fetch sender name for better message
      const { data: sender } = await supabase
        .from('users')
        .select('id,name')
        .eq('id', fromUserId)
        .single()

      await createNotification({
        userId: toUserId,
        type: 'family_request',
        title: 'Family request',
        body: `${sender?.name || 'Someone'} wants to add you as ${relation}`,
        payload: { request_id: request?.id, from_user_id: fromUserId, to_user_id: toUserId, relation, sender_name: sender?.name }
      })
    } catch (notifyErr) {
      console.warn('failed to create notification for family request', notifyErr)
    }

    return { success: true, data: request }
  } catch (err: any) {
    console.error('unexpected error sendFamilyRequest', err)
    return { success: false, error: err }
  }
}

export async function getPendingFamilyRequests(userId: string) {
  try {
    const { data: requests, error } = await supabase
      .from('family_requests')
      .select('*')
      .eq('to_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('error fetching pending family_requests', {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      })
      // Table might not exist yet - return empty array
      return []
    }

    if (!requests || requests.length === 0) return []

    // Fetch sender details
    const senderIds = requests.map((r: any) => r.from_user_id)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id,name,phone,email')
      .in('id', senderIds)

    if (usersError) {
      console.error('error fetching users for family_requests', usersError)
      // Return requests without user details
      return requests.map((r: any) => ({
        id: r.id,
        from_user_id: r.from_user_id,
        to_user_id: r.to_user_id,
        relation: r.relation,
        status: r.status,
        created_at: r.created_at,
        sender: { id: r.from_user_id, name: 'Unknown' }
      }))
    }

    // Map requests with sender info
    return requests.map((r: any) => ({
      id: r.id,
      from_user_id: r.from_user_id,
      to_user_id: r.to_user_id,
      relation: r.relation,
      status: r.status,
      created_at: r.created_at,
      sender: (users as any[])?.find((u) => u.id === r.from_user_id) ?? { id: r.from_user_id }
    }))
  } catch (err: any) {
    console.error('unexpected error getPendingFamilyRequests', err)
    return []
  }
}

// Get sent family requests (requests sent by the current user)
// Only fetch pending requests since approved ones are in family_members and rejected ones are deleted
export async function getSentFamilyRequests(userId: string) {
  try {
    const { data: requests, error } = await supabase
      .from('family_requests')
      .select('*')
      .eq('from_user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('error fetching sent family_requests', {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      })
      return []
    }

    if (!requests || requests.length === 0) return []

    // Fetch receiver details
    const receiverIds = requests.map((r: any) => r.to_user_id)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id,name,phone,email')
      .in('id', receiverIds)

    if (usersError) {
      console.error('error fetching users for sent family_requests', usersError)
      return requests.map((r: any) => ({
        id: r.id,
        from_user_id: r.from_user_id,
        to_user_id: r.to_user_id,
        relation: r.relation,
        status: r.status,
        created_at: r.created_at,
        receiver: { id: r.to_user_id, name: 'Unknown' }
      }))
    }

    // Map requests with receiver info
    return requests.map((r: any) => ({
      id: r.id,
      from_user_id: r.from_user_id,
      to_user_id: r.to_user_id,
      relation: r.relation,
      status: r.status,
      created_at: r.created_at,
      receiver: (users as any[])?.find((u) => u.id === r.to_user_id) ?? { id: r.to_user_id }
    }))
  } catch (err: any) {
    console.error('unexpected error getSentFamilyRequests', err)
    return []
  }
}

// Cancel/delete a sent family request
export async function cancelFamilyRequest(requestId: string) {
  try {
    const { error } = await supabase
      .from('family_requests')
      .delete()
      .eq('id', requestId)

    if (error) {
      console.error('error canceling family request', error)
      return { success: false, error }
    }

    return { success: true }
  } catch (err: any) {
    console.error('unexpected error cancelFamilyRequest', err)
    return { success: false, error: err }
  }
}

// ===============================
// Last Seen Location (users)
// ===============================

export type LastSeenRecord = {
  user_id: string
  lat?: number | null
  lng?: number | null
  address?: string | null
  last_seen_at?: string | null
}

export async function fetchLastSeenForUsers(userIds: string[]): Promise<Record<string, LastSeenRecord>> {
  const out: Record<string, LastSeenRecord> = {}
  try {
    if (!userIds || userIds.length === 0) return out
    const { data, error } = await supabase
      .from('user_last_seen')
      .select('user_id, lat, lng, address, last_seen_at')
      .in('user_id', userIds)
    if (error) {
      console.error('fetchLastSeenForUsers error', error)
      return out
    }
    for (const row of (data || [])) {
      out[row.user_id] = row as LastSeenRecord
    }
  } catch (err) {
    console.error('fetchLastSeenForUsers unexpected', err)
  }
  return out
}

export async function approveFamilyRequest(requestId: string) {
  try {
    // Get the request details
    const { data: request, error: fetchErr } = await supabase
      .from('family_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (fetchErr || !request) {
      console.error('error fetching request', fetchErr)
      return { success: false, error: 'request_not_found' }
    }

    // Create bidirectional family links
    const { error: link1Err } = await supabase
      .from('family_members')
      .insert({ 
        user_id: request.from_user_id, 
        member_id: request.to_user_id, 
        relation: request.relation 
      })

    const { error: link2Err } = await supabase
      .from('family_members')
      .insert({ 
        user_id: request.to_user_id, 
        member_id: request.from_user_id, 
        relation: getReciprocalRelation(request.relation)
      })

    if (link1Err || link2Err) {
      console.error('error creating family links', { link1Err, link2Err })
      return { success: false, error: link1Err || link2Err }
    }

    // Delete the request entirely (like reject does) to prevent race conditions
    // This ensures the request won't show up in pending requests list
    await supabase
      .from('family_requests')
      .delete()
      .eq('id', requestId)

    // Notify the original sender that their request was accepted
    try {
      const { data: sender } = await supabase
        .from('users')
        .select('id,name')
        .eq('id', request.to_user_id)
        .single()
      const notifyResult = await createNotification({
        userId: request.from_user_id,
        type: 'family_request_accepted',
        title: 'Family request accepted',
        body: `${sender?.name || 'They'} accepted your request`,
        payload: { request_id: requestId, from_user_id: request.from_user_id, to_user_id: request.to_user_id, relation: request.relation, accepter_name: sender?.name }
      })
      if (!notifyResult.success) {
        console.warn('failed to create notification for request accepted', notifyResult.error)
      }
    } catch (notifyErr) {
      console.error('failed to notify request accepted', notifyErr)
    }

    return { success: true }
  } catch (err: any) {
    console.error('unexpected error approveFamilyRequest', err)
    return { success: false, error: err }
  }
}

// Update safety status on response (safe or danger) and clear expiry window accordingly
export async function respondToSafetyCheck(responderId: string, requesterId: string, status: 'safe' | 'danger') {
  try {
    // Update requester perspective (they initiated) ONLY if window is active
    const nowIso = new Date().toISOString()
    const { data, error, count } = await supabase
      .from('family_members')
      .update({ safety_status: status })
      .eq('user_id', requesterId)
      .eq('member_id', responderId)
      .select()

    if (error) {
      console.error('respondToSafetyCheck error', error)
      return { success: false, error }
    }

    if (!data || data.length === 0) {
      console.warn('respondToSafetyCheck: No rows updated. Check if IDs are correct.')
      return { success: false, error: 'No link found to update' }
    }

    return { success: true }
  } catch (e) {
    console.error('respondToSafetyCheck failed', e)
    return { success: false, error: e }
  }
}

// Fetch persisted safety state for a user perspective
export async function fetchSafetyWindow(userId: string, memberId: string) {
  const { data, error } = await supabase
    .from('family_members')
    .select('safety_status,safety_check_started_at,safety_check_expires_at')
    .eq('user_id', userId)
    .eq('member_id', memberId)
    .maybeSingle()
  if (error) return null
  return data
}

export async function rejectFamilyRequest(requestId: string) {
  try {
    // Get the request details first to notify sender later
    const { data: request, error: fetchErr } = await supabase
      .from('family_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (fetchErr || !request) {
      console.error('error fetching request (reject)', fetchErr)
      return { success: false, error: 'request_not_found' }
    }

    const { error: updateErr, data: updatedData } = await supabase
      .from('family_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
      .select()

    // Only fail if there's a meaningful error (has message, code, or details)
    if (updateErr && (updateErr.message || updateErr.code || updateErr.details)) {
      console.error('error rejecting request', {
        message: updateErr.message,
        code: updateErr.code,
        details: updateErr.details,
        hint: updateErr.hint
      })
      return { success: false, error: updateErr }
    }

    // Optionally delete rejected requests
    await supabase
      .from('family_requests')
      .delete()
      .eq('id', requestId)

    // Notify the original sender that their request was rejected
    try {
      const { data: rejector } = await supabase
        .from('users')
        .select('id,name')
        .eq('id', request.to_user_id)
        .single()
      const notifyResult = await createNotification({
        userId: request.from_user_id,
        type: 'family_request_rejected',
        title: 'Family request rejected',
        body: `${rejector?.name || 'They'} declined your request`,
        payload: { request_id: requestId, from_user_id: request.from_user_id, to_user_id: request.to_user_id, relation: request.relation, rejector_name: rejector?.name }
      })
      if (!notifyResult.success) {
        console.warn('failed to create notification for request rejected', notifyResult.error)
      }
    } catch (notifyErr) {
      console.error('failed to notify request rejected', notifyErr)
    }

    return { success: true }
  } catch (err: any) {
    console.error('unexpected error rejectFamilyRequest', err)
    return { success: false, error: err }
  }
}

// Helper to get reciprocal relation
function getReciprocalRelation(relation: string): string {
  const relationMap: { [key: string]: string } = {
    'father': 'son/daughter',
    'mother': 'son/daughter',
    'son': 'father/mother',
    'daughter': 'father/mother',
    'brother': 'brother/sister',
    'sister': 'brother/sister',
    'husband': 'wife',
    'wife': 'husband',
    'grandfather': 'grandson/granddaughter',
    'grandmother': 'grandson/granddaughter',
    'uncle': 'nephew/niece',
    'aunt': 'nephew/niece',
  }

  return relationMap[relation.toLowerCase()] || 'family'
}

export async function findUsers(identifier: string) {
  try {
    if (!identifier) return []
    
    const trimmed = identifier.trim()
    
    // Try exact phone
    const phoneRes = await supabase.from('users').select('id,name,email,phone,image').eq('phone', trimmed).limit(10)
    if (phoneRes.error) {
      // log and continue
      console.warn('findUsers phone query error', phoneRes.error)
    }
    if (phoneRes.data && phoneRes.data.length) return phoneRes.data

    // Try exact email (only if it looks like an email)
    const isEmailLike = trimmed.includes('@') && trimmed.includes('.')
    if (isEmailLike) {
      const emailRes = await supabase.from('users').select('id,name,email,phone,image').eq('email', trimmed).limit(10)
      if (emailRes.error) {
        console.warn('findUsers email query error', emailRes.error)
      }
      if (emailRes.data && emailRes.data.length) return emailRes.data
    }

    // Fallback: name search (ILIKE contains)
    const nameRes = await supabase.from('users').select('id,name,email,phone,image').ilike('name', `%${trimmed}%`).limit(10)
    if (nameRes.error) {
      console.warn('findUsers name query error', nameRes.error)
    }
    return nameRes.data ?? []
  } catch (err: any) {
    console.error('unexpected error findUsers', err)
    return []
  }
}

export async function fetchUnreadCount(userId: string) {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: false })
    .eq('receiver_id', userId)
    .neq('status', 'read')

  if (error) throw error
  return count ?? 0
}

export function subscribeToIncomingMessages(userId: string, cb: (msg: any) => void) {
  const channel = supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, (payload) => {
      cb(payload.new)
    })
    .subscribe()

  return channel
}

export async function markAllAsRead(userId: string) {
  const { error } = await supabase
    .from('messages')
    .update({ status: 'read' })
    .eq('receiver_id', userId)
    .neq('status', 'read')

  if (error) throw error
  return true
}

// Conversation helpers
export async function fetchConversation(userId: string, otherId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`
    )
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export function subscribeToConversation(userId: string, otherId: string, cb: (msg: any) => void) {
  // Subscribe broadly to messages INSERTs and filter in the callback for the two participants
  const channel = supabase
    .channel(`conversation:${[userId, otherId].sort().join(':')}:${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const m = payload.new
      const isBetween = (m.sender_id === userId && m.receiver_id === otherId) || (m.sender_id === otherId && m.receiver_id === userId)
      if (isBetween) cb(m)
    })
    .subscribe()

  return channel
}

export async function markConversationAsRead(userId: string, otherId: string) {
  const { error } = await supabase
    .from('messages')
    .update({ status: 'read' })
    .eq('receiver_id', userId)
    .eq('sender_id', otherId)
    .neq('status', 'read')

  if (error) throw error
  return true
}
