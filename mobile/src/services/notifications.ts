import { supabase } from '../lib/supabase'

export type NotificationRecord = {
  id: string
  user_id?: string | null
  organization_id?: string | null
  type: string
  title?: string | null
  body?: string | null
  payload?: any
  read: boolean
  created_at: string
}

export type NotificationRecipientType = 'user' | 'organization'

type NotificationQueryOptions = {
  recipientType?: NotificationRecipientType
}

const ORGANIZATION_RECIPIENT_TYPE = 'organization'

const sortNotifications = (notifications: NotificationRecord[]) =>
  notifications
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

const dedupeNotifications = (notifications: NotificationRecord[]) =>
  sortNotifications(
    Array.from(new Map(notifications.map((notification) => [notification.id, notification])).values())
  )

async function fetchNotificationsByColumn(column: 'user_id' | 'organization_id', recipientId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq(column, recipientId)
    .order('created_at', { ascending: false })

  return {
    data: (data ?? []) as NotificationRecord[],
    error,
  }
}

function parsePayload(payload: any) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  return payload && typeof payload === 'object' ? payload : null
}

function buildOrganizationPayload(payload: any, organizationId: string) {
  const basePayload = parsePayload(payload) ?? {}

  return {
    ...basePayload,
    organization_id: organizationId,
    recipient_type: ORGANIZATION_RECIPIENT_TYPE,
  }
}

function matchesOrganizationNotification(notification: Partial<NotificationRecord> | null | undefined, organizationId: string) {
  if (!notification) return false
  if (notification.organization_id === organizationId) return true

  const payload = parsePayload(notification.payload)
  return payload?.recipient_type === ORGANIZATION_RECIPIENT_TYPE && payload?.organization_id === organizationId
}

function logNotificationError(context: string, error: any) {
  console.error(context, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    raw: error,
  })
}

async function fetchOrganizationPayloadNotifications(recipientId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .contains('payload', {
      organization_id: recipientId,
      recipient_type: ORGANIZATION_RECIPIENT_TYPE,
    })
    .order('created_at', { ascending: false })

  return {
    data: (data ?? []) as NotificationRecord[],
    error,
  }
}

export async function createNotification(params: {
  userId?: string
  organizationId?: string
  type: string
  title?: string
  body?: string
  payload?: any
}) {
  const { userId, organizationId, type, title, body, payload } = params

  if (!userId && !organizationId) {
    return { success: false, error: new Error('Missing notification recipient') }
  }

  let data: any[] | null = null
  let error: any = null

  if (organizationId) {
    const organizationPayload = buildOrganizationPayload(payload, organizationId)

    const fallbackInsert = await supabase
      .from('notifications')
      .insert({ user_id: null, type, title, body, payload: organizationPayload })
      .select()

    data = fallbackInsert.data
    error = fallbackInsert.error
  } else {
    const userInsert = await supabase
      .from('notifications')
      .insert({ user_id: userId, type, title, body, payload })
      .select()

    data = userInsert.data
    error = userInsert.error
  }

  if (error) {
    logNotificationError('createNotification error', error)
    return { success: false, error }
  }
  return { success: true, data: data?.[0] as NotificationRecord }
}

export async function getNotifications(recipientId: string, options?: NotificationQueryOptions) {
  const { data: userData, error: userError } = await fetchNotificationsByColumn('user_id', recipientId)
  
  if (userError) {
    console.error('getNotifications user_id error', userError)
  }

  const allNotifications = userData || []

  if (options?.recipientType === 'organization') {
    const fallbackResult = await fetchOrganizationPayloadNotifications(recipientId)
    if (!fallbackResult.error && fallbackResult.data) {
      allNotifications.push(...fallbackResult.data)
    }
  }

  return dedupeNotifications(allNotifications)
}

export function subscribeToNotifications(
  recipientId: string,
  cb: (n: NotificationRecord) => void,
  options?: {
    channelId?: string
    recipientType?: NotificationRecipientType
    onDelete?: (id: string) => void
    onUpdate?: (n: NotificationRecord) => void
  }
) {
  // Use unique channel name to avoid collisions when multiple components subscribe
  const uniqueSuffix = (() => {
    try {
      // @ts-ignore
      if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
        // @ts-ignore
        return (crypto as any).randomUUID()
      }
    } catch {}
    return Math.random().toString(36).slice(2)
  })()
  const channelName = options?.channelId ?? `notifications:${recipientId}:${uniqueSuffix}`
  const channels: any[] = []

  // ALWAYS subscribe to user_id notifications
  channels.push(
    supabase
      .channel(`${channelName}:user_id`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${recipientId}`
      }, (payload) => {
        cb(payload.new as NotificationRecord)
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${recipientId}`
      }, (payload) => {
        if (options?.onDelete) {
          options.onDelete(payload.old.id)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${recipientId}`
      }, (payload) => {
        if (options?.onUpdate) {
          options.onUpdate(payload.new as NotificationRecord)
        }
      })
      .subscribe()
  )

  // IF organization, ALSO subscribe to organization notifications
  if (options?.recipientType === 'organization') {
    channels.push(
      supabase
        .channel(`${channelName}:organization`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        }, (payload) => {
          const notification = payload.new as NotificationRecord
          if (matchesOrganizationNotification(notification, recipientId)) {
            cb(notification)
          }
        })
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
        }, (payload) => {
          const notification = payload.old as NotificationRecord
          if (options?.onDelete && matchesOrganizationNotification(notification, recipientId)) {
            options.onDelete(notification.id)
          }
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
        }, (payload) => {
          const notification = payload.new as NotificationRecord
          if (options?.onUpdate && matchesOrganizationNotification(notification, recipientId)) {
            options.onUpdate(notification)
          }
        })
        .subscribe()
    )
  }

  return {
    unsubscribe: () => {
      channels.forEach((channel) => {
        try {
          ;(channel as any)?.unsubscribe?.()
        } catch {}
      })
    }
  }
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
  if (error) throw error
  return true
}

export async function markAllNotificationsRead(recipientId: string, options?: NotificationQueryOptions) {
  if (options?.recipientType === 'organization') {
    const notifications = await getNotifications(recipientId, options)
    const ids = notifications.filter((notification) => !notification.read).map((notification) => notification.id)

    if (ids.length === 0) {
      return true
    }

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', ids)

    if (error) throw error
    return true
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', recipientId)
    .eq('read', false)
  if (error) throw error
  return true
}

export async function deleteNotification(id: string) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
  if (error) throw error
  return true
}

export async function deleteAllNotifications(recipientId: string, options?: NotificationQueryOptions) {
  if (options?.recipientType === 'organization') {
    const notifications = await getNotifications(recipientId, options)
    const ids = notifications.map((notification) => notification.id)

    if (ids.length === 0) {
      return true
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', ids)

    if (error) throw error
    return true
  }

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', recipientId)
  if (error) throw error
  return true
}

// Delete notifications by request_id (for family requests)
export async function deleteNotificationsByRequestId(userId: string, requestId: string) {
  try {
    // First, try to fetch all family_request notifications for this user
    // Filter in JavaScript since JSONB queries can be complex
    const { data: allNotifications, error: fetchError } = await supabase
      .from('notifications')
      .select('id, payload')
      .eq('user_id', userId)
      .eq('type', 'family_request')

    if (fetchError) {
      console.error('failed to find notifications by request_id', fetchError)
      return { success: false, error: fetchError }
    }

    if (!allNotifications || allNotifications.length === 0) {
      // No notifications found - this is okay
      return { success: true, deleted: 0, notificationIds: [] }
    }

    // Filter notifications that match the request_id
    const matchingNotifications = allNotifications.filter((n: any) => {
      try {
        const payload = typeof n.payload === 'string' ? JSON.parse(n.payload) : n.payload
        return payload?.request_id === requestId
      } catch {
        return false
      }
    })

    if (matchingNotifications.length === 0) {
      // No matching notifications found
      return { success: true, deleted: 0, notificationIds: [] }
    }

    // Delete all matching notifications
    const notificationIds = matchingNotifications.map((n: any) => n.id)
    
    console.log(`[deleteNotificationsByRequestId] Attempting to delete ${notificationIds.length} notification(s) for request ${requestId}:`, notificationIds)
    
    const { error: deleteError, data: deletedData } = await supabase
      .from('notifications')
      .delete()
      .in('id', notificationIds)
      .select()

    if (deleteError) {
      console.error(`[deleteNotificationsByRequestId] Failed to delete notifications for request ${requestId}:`, deleteError)
      return { success: false, error: deleteError, notificationIds: [] }
    }

    console.log(`[deleteNotificationsByRequestId] Deleted ${deletedData?.length || 0} notification(s) from database for request ${requestId}`)

    // Wait a bit for database to process deletion
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify deletion by checking if notifications still exist
    const { data: verifyNotifications, error: verifyError } = await supabase
      .from('notifications')
      .select('id')
      .in('id', notificationIds)

    if (verifyError) {
      console.warn(`[deleteNotificationsByRequestId] Failed to verify deletion for request ${requestId}:`, verifyError)
    } else if (verifyNotifications && verifyNotifications.length > 0) {
      console.warn(`[deleteNotificationsByRequestId] Some notifications were not deleted for request ${requestId}:`, verifyNotifications.map((n: any) => n.id).join(', '))
      // Try to delete again
      const remainingIds = verifyNotifications.map((n: any) => n.id)
      const { error: retryError } = await supabase
        .from('notifications')
        .delete()
        .in('id', remainingIds)
      
      if (retryError) {
        console.error(`[deleteNotificationsByRequestId] Failed to delete remaining notifications on retry for request ${requestId}:`, retryError)
        return { success: false, error: retryError, notificationIds: notificationIds.filter(id => !remainingIds.includes(id)) }
      } else {
        console.log(`[deleteNotificationsByRequestId] Successfully deleted ${remainingIds.length} remaining notification(s) on retry for request ${requestId}`)
      }
    } else {
      console.log(`[deleteNotificationsByRequestId] Verified: All ${notificationIds.length} notification(s) deleted for request ${requestId}`)
    }

    console.log(`[deleteNotificationsByRequestId] Successfully deleted ${notificationIds.length} notification(s) for request ${requestId}`)
    return { success: true, deleted: notificationIds.length, notificationIds: notificationIds }
  } catch (err: any) {
    console.error('unexpected error deleteNotificationsByRequestId', err)
    return { success: false, error: err, deleted: 0, notificationIds: [] }
  }
}

export async function fetchUnreadCount(userId: string, options?: { isOrg?: boolean }) {
  const { count: userCount, error: userError } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
    .neq('type', 'alert') // Disaster alerts don't count for the inbox badge

  if (userError) throw userError
  let totalCount = userCount ?? 0

  if (options?.isOrg) {
    const { count: orgCount, error: orgError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .contains('payload', { organization_id: userId, recipient_type: 'organization' })
      .eq('read', false)
      .neq('type', 'alert')

    if (!orgError && orgCount) {
      totalCount += orgCount
    }
  }

  return totalCount
}
