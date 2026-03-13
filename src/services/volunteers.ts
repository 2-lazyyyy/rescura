import { supabase } from '@/lib/supabase'

export interface Volunteer {
  id: string
  name: string
  email: string
  phone: string
  type: 'tracking' | 'normal'
  org_member_id: string
  user_id: string
  status: 'active' | 'inactive'
}

export interface CreateVolunteerInput {
  name: string
  email: string
  phone: string
  role: 'tracking' | 'normal'
  organizationId: string
  password?: string
}

export interface UpdateVolunteerInput {
  name?: string
  email?: string
  phone?: string
  password?: string
  role?: 'tracking' | 'normal'
}

/**
 * Fetch all volunteers for an organization
 * Joins user and org-member tables
 */
export async function fetchVolunteersForOrganization(
  organizationId: string
): Promise<{
  success: boolean
  volunteers?: Volunteer[]
  error?: string
}> {
  try {
    // Query to get user info and org-member info
    const { data, error } = await supabase
      .from('org-member')
      .select(
        `
        id:id,
        user_id,
        type,
        status,
        users:user_id (
          id,
          name,
          email,
          phone
        )
      `
      )
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Error fetching volunteers:', error)
      return { success: false, error: error.message }
    }

    // Transform the data to match Volunteer interface
    const volunteers: Volunteer[] = (data || []).map((item: any) => ({
      id: item.user_id,
      name: item.users?.name || '',
      email: item.users?.email || '',
      phone: item.users?.phone || '',
      type: item.type === 'tracking' ? 'tracking' : 'normal',
      org_member_id: item.id,
      user_id: item.user_id,
      status: item.status || 'active'
    }))

    return { success: true, volunteers }
  } catch (err) {
    console.error('Error in fetchVolunteersForOrganization:', err)
    return { success: false, error: 'Failed to fetch volunteers' }
  }
}

/**
 * Create a new volunteer
 * Inserts into both users and org-member tables
 */
export async function createVolunteer(
  input: CreateVolunteerInput
): Promise<{
  success: boolean
  volunteer?: Volunteer
  error?: string
}> {
  try {
    // 1. Insert into users table with default password
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        {
          name: input.name,
          email: input.email,
          phone: input.phone,
          password: input.password || '12345678' // Use provided password or default
        }
      ])
      .select()
      .maybeSingle()

    if (userError) {
      console.error('Error creating user:', userError)
      if (userError.code === '23505' || userError.message.includes('duplicate key')) {
        return { success: false, error: 'A user with this email or phone already exists.' }
      }
      return { success: false, error: userError.message }
    }

    // 2. Insert into org-member table
    const { data: orgMemberData, error: orgMemberError } = await supabase
      .from('org-member')
      .insert([
        {
          organization_id: input.organizationId,
          user_id: userData.id,
          type: input.role === 'tracking' ? 'tracking' : 'normal',
          status: 'active'
        }
      ])
      .select()
      .maybeSingle()

    if (orgMemberError) {
      console.error('Error creating org-member:', orgMemberError)
      return { success: false, error: orgMemberError.message }
    }

    const volunteer: Volunteer = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      type: input.role === 'tracking' ? 'tracking' : 'normal',
      org_member_id: orgMemberData.id,
      user_id: userData.id,
      status: 'active'
    }

    return { success: true, volunteer }
  } catch (err) {
    console.error('Error in createVolunteer:', err)
    return { success: false, error: 'Failed to create volunteer' }
  }
}

/**
 * Update a volunteer
 * Updates user table with new info
 */
export async function updateVolunteer(
  userId: string,
  input: UpdateVolunteerInput
): Promise<{
  success: boolean
  volunteer?: Volunteer
  error?: string
}> {
  try {
    // 1. Update user table
    const updateData: any = {}
    if (input.name) updateData.name = input.name
    if (input.email) updateData.email = input.email
    if (input.phone) updateData.phone = input.phone
    if (input.password) updateData.password = input.password

    const { data: userData, error: userError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .maybeSingle()

    if (userError) {
      console.error('Error updating user:', userError)
      if (userError.code === '23505' || userError.message.includes('duplicate key')) {
        return { success: false, error: 'A user with this email or phone already exists.' }
      }
      return { success: false, error: userError.message }
    }

    // 2. Update org-member table if role changed
    if (input.role) {
      const { error: orgMemberError } = await supabase
        .from('org-member')
        .update({ type: input.role === 'tracking' ? 'tracking' : 'normal' })
        .eq('user_id', userId)

      if (orgMemberError) {
        console.error('Error updating org-member:', orgMemberError)
        return { success: false, error: orgMemberError.message }
      }
    }

    const volunteer: Volunteer = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      type: input.role === 'tracking' ? 'tracking' : 'normal',
      org_member_id: userId, // placeholder, could be fetched if needed
      user_id: userId,
      status: 'active'
    }

    return { success: true, volunteer }
  } catch (err) {
    console.error('Error in updateVolunteer:', err)
    return { success: false, error: 'Failed to update volunteer' }
  }
}

/**
 * Delete a volunteer
 * Deletes from org-member table
 */
export async function deleteVolunteer(
  orgMemberId: string
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const { error } = await supabase
      .from('org-member')
      .delete()
      .eq('id', orgMemberId)

    if (error) {
      console.error('Error deleting volunteer:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Error in deleteVolunteer:', err)
    return { success: false, error: 'Failed to delete volunteer' }
  }
}
