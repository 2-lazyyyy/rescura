import { supabase } from '../lib/supabase'

export async function fetchAdminOverview() {
  const [orgs, users, pins, notifs] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('pins').select('id,status', { count: 'exact' }).order('created_at', { ascending: false }).limit(200),
    supabase.from('notifications').select('id,read', { count: 'exact' }).order('created_at', { ascending: false }).limit(200),
  ])

  if (orgs.error || users.error || pins.error || notifs.error) {
    return {
      success: false,
      error: orgs.error?.message || users.error?.message || pins.error?.message || notifs.error?.message || 'Failed to load admin overview',
    }
  }

  const pendingPins = (pins.data || []).filter((pin: any) => pin.status === 'pending').length
  const unreadNotifications = (notifs.data || []).filter((n: any) => !n.read).length

  return {
    success: true,
    overview: {
      organizations: orgs.count || 0,
      users: users.count || 0,
      pendingPins,
      unreadNotifications,
    },
  }
}
