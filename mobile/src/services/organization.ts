import { supabase } from '../lib/supabase'

export async function fetchOrganizationSupplies(organizationId: string) {
  const { data, error } = await supabase
    .from('organization_supplies')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_updated', { ascending: false })

  if (error) return { success: false, error: error.message, supplies: [] }
  return { success: true, supplies: data || [] }
}