import { supabase } from '../lib/supabase'
import type { AccountType, MobileUser } from '../types/domain'

function normalizeProfile(profile: any, fallbackEmail: string, accountType?: AccountType): MobileUser {
  return {
    id: profile?.id,
    email: profile?.email ?? fallbackEmail,
    name: profile?.name ?? fallbackEmail.split('@')[0] ?? 'User',
    phone: profile?.phone ?? null,
    role: accountType === 'organization' ? 'organization' : (profile?.is_admin ? 'admin' : 'user'),
    organizationId: profile?.organization_id ?? null,
    image: profile?.image ?? null,
    accountType,
    isOrg: accountType === 'organization',
    isAdmin: profile?.is_admin === true,
  }
}

export async function signIn(email: string, password: string, accountType: AccountType): Promise<{ success: boolean; error?: string; user?: MobileUser }> {
  const table = accountType === 'organization' ? 'organizations' : 'users'
  
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .maybeSingle()

  if (error || !data) {
    return { success: false, error: 'Invalid credentials' }
  }

  return { 
    success: true, 
    user: normalizeProfile(data, email, accountType) 
  }
}

export async function signUp(input: { name: string; email: string; phone?: string; password: string; accountType: AccountType; address?: string }): Promise<{ success: boolean; error?: string; user?: MobileUser }> {
  const table = input.accountType === 'organization' ? 'organizations' : 'users'
  
  const insertData: any = {
    name: input.name,
    email: input.email,
    password: input.password,
    phone: input.phone || null,
  }

  if (input.accountType === 'organization' && input.address) {
    insertData.address = input.address
  }

  const { data, error } = await supabase
    .from(table)
    .insert(insertData)
    .select('*')
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data) {
    return { success: false, error: 'Registration failed' }
  }

  return { 
    success: true, 
    user: normalizeProfile(data, input.email, input.accountType) 
  }
}

export async function signOut() {
  // Since we are not using Supabase Auth, sign out is just clearing the session state
  return { success: true }
}

export async function getSessionUser(token?: string): Promise<{ success: boolean; user?: MobileUser }> {
  // Not used in plaintext auth since session is stored directly in AsyncStorage
  return { success: false }
}

export async function updateUserProfileImage(userId: string, imageUrl: string, isOrg: boolean) {
  const table = isOrg ? 'organizations' : 'users'
  const { error } = await supabase
    .from(table)
    .update({ image: imageUrl })
    .eq('id', userId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}