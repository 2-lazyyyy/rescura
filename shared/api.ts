import type { AccountType } from './contracts'

export interface ApiClientConfig {
  baseUrl?: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload extends LoginPayload {
  name: string
  phone?: string
  accountType: AccountType
  address?: string
}

function resolveBaseUrl(baseUrl?: string) {
  return (baseUrl || process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '')
}

async function requestJson<T>(path: string, body?: unknown, config?: ApiClientConfig): Promise<T> {
  const baseUrl = resolveBaseUrl(config?.baseUrl)
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = await response.json().catch(() => null)
  if (!response.ok) {
    const message = json?.error || json?.message || 'Request failed'
    throw new Error(message)
  }

  return json as T
}

export const mobileApi = {
  auth: {
    login: (payload: LoginPayload, config?: ApiClientConfig) => requestJson('/api/auth/login', payload, config),
    register: (payload: RegisterPayload, config?: ApiClientConfig) => requestJson('/api/auth/register', payload, config),
    session: (token: string, config?: ApiClientConfig) => {
      const baseUrl = resolveBaseUrl(config?.baseUrl)
      return fetch(`${baseUrl}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (response) => {
        const json = await response.json().catch(() => null)
        if (!response.ok) throw new Error(json?.error || 'Session request failed')
        return json
      })
    },
  },
}