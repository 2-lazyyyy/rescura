import { supabase } from '@/lib/supabase'

export interface RegisterInput {
  name: string
  email: string
  phone?: string
  password: string
}

export interface LoginResult {
  success: boolean
  error?: string
  user?: {
    id: string
    name: string
    email: string
    phone?: string
    is_admin?: boolean
  }
}

export async function registerUser(input: RegisterInput): Promise<LoginResult> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      password: input.password,
    })
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
    user: {
      id: data.id,
      name: data.name,
      email: data.email ?? '',
      phone: data.phone ?? undefined,
      is_admin: data.is_admin ?? false,
    },
  }
}

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .maybeSingle()

  if (error) {
    // If no match, Supabase returns an error; normalize to invalid credentials
    return { success: false, error: 'Invalid credentials' }
  }

  if (!data) {
    return { success: false, error: 'Invalid credentials' }
  }

  return {
    success: true,
    user: {
      id: data.id,
      name: data.name,
      email: data.email ?? '',
      phone: data.phone ?? undefined,
      is_admin: data.is_admin ?? false,
    },
  }
}

export async function loginOrganization(email: string, password: string): Promise<LoginResult> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('email', email)
    .eq('password', password)
    .maybeSingle()

  if (error) {
    return { success: false, error: 'Invalid credentials' }
  }

  if (!data) {
    return { success: false, error: 'Invalid credentials' }
  }

  return {
    success: true,
    user: {
      id: data.id,
      name: data.name,
      email: data.email ?? '',
      phone: data.phone ?? undefined,
    },
  }
}

export interface RegisterOrganizationInput {
  name: string
  email: string
  phone: string
  password: string
  address?: string
}

export async function registerOrganization(input: RegisterOrganizationInput): Promise<LoginResult> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      address: input.address ?? null,
    })
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
    user: {
      id: data.id,
      name: data.name,
      email: data.email ?? '',
      phone: data.phone ?? undefined,
    },
  }
}


