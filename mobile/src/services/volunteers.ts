import { supabase } from '../lib/supabase'

export type VolunteerRole = 'tracking' | 'normal'

export type VolunteerRecord = {
  id: string
  name: string
  email: string
  phone?: string | null
  role: VolunteerRole
  status: 'active' | 'inactive' | 'pending'
  organization_id?: string
  org_member_id?: string
}

export async function fetchVolunteersForOrganization(organizationId: string) {
  const { data, error } = await supabase
    .from('org-member')
    .select('id,user_id,organization_id,type,status, user:users!org-member_user_id_fkey(id,name,email,phone)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) return { success: false, volunteers: [], error: error.message }

  const volunteers: VolunteerRecord[] = (data || []).map((row: any) => {
    const user = Array.isArray(row.user) ? row.user[0] : row.user
    return {
      id: user?.id || row.user_id,
      name: user?.name || 'Volunteer',
      email: user?.email || '',
      phone: user?.phone || null,
      role: row.type === 'tracking' ? 'tracking' : 'normal',
      status: row.status || 'active',
      organization_id: row.organization_id,
      org_member_id: row.id,
    }
  })

  return { success: true, volunteers }
}

export async function fetchAllVolunteers() {
  const { data, error } = await supabase
    .from('org-member')
    .select('id,user_id,organization_id,type,status, user:users!org-member_user_id_fkey(id,name,email,phone)')
    .order('created_at', { ascending: false })

  if (error) return { success: false, volunteers: [], error: error.message }

  const volunteers: VolunteerRecord[] = (data || []).map((row: any) => {
    const user = Array.isArray(row.user) ? row.user[0] : row.user
    return {
      id: user?.id || row.user_id,
      name: user?.name || 'Volunteer',
      email: user?.email || '',
      phone: user?.phone || null,
      role: row.type === 'tracking' ? 'tracking' : 'normal',
      status: row.status || 'active',
      organization_id: row.organization_id,
      org_member_id: row.id,
    }
  })

  return { success: true, volunteers }
}
