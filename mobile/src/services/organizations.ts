import { supabase } from '../lib/supabase'

export type OrganizationRecord = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  region?: string | null
  status?: string | null
  funding?: string | null
  created_at?: string | null
}

export async function fetchOrganizations() {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return { success: false, organizations: [], error: error.message }
  return { success: true, organizations: (data || []) as OrganizationRecord[] }
}

export async function fetchOrganizationById(id: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return { success: false, error: error?.message || 'Organization not found' }
  return { success: true, organization: data as OrganizationRecord }
}
