import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { signIn, signOut, signUp } from '../services/auth'
import type { AccountType, UserRole } from '../types/domain'

export type SessionUser = {
  id: string
  email: string
  name: string
  phone?: string | null
  role?: UserRole
  organizationId?: string | null
  accountType?: AccountType
  isAdmin?: boolean
  isOrg?: boolean
}

type SessionState = {
  user: SessionUser | null
  isHydrating: boolean
  login: (email: string, password: string, accountType: AccountType) => Promise<{ success: boolean; error?: string }>
  register: (input: { name: string; email: string; phone?: string; password: string; accountType: AccountType; address?: string }) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
}

const LOCAL_USER_KEY = 'linyone_mobile_user'

const SessionContext = createContext<SessionState | undefined>(undefined)

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isHydrating, setIsHydrating] = useState(true)

  useEffect(() => {
    let mounted = true

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(LOCAL_USER_KEY)
        if (raw && mounted) {
          const parsed = JSON.parse(raw) as SessionUser
          setUser(parsed)
        }
      } catch (err) {
        console.error('Failed to restore auth from AsyncStorage', err)
      } finally {
        if (mounted) setIsHydrating(false)
      }
    }

    hydrate()

    return () => {
      mounted = false
    }
  }, [])

  const login = async (email: string, password: string, accountType: AccountType) => {
    try {
      const result = await signIn(email, password, accountType)
      if (!result.success || !result.user) return { success: false, error: result.error || 'Login failed' }
      
      setUser(result.user as SessionUser)
      await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(result.user))
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' }
    }
  }

  const register = async (input: { name: string; email: string; phone?: string; password: string; accountType: AccountType; address?: string }) => {
    try {
      const result = await signUp(input)
      if (!result.success || !result.user) return { success: false, error: result.error || 'Registration failed' }
      
      setUser(result.user as SessionUser)
      await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(result.user))
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Registration failed' }
    }
  }

  const logout = async () => {
    await signOut()
    setUser(null)
    await AsyncStorage.removeItem(LOCAL_USER_KEY)
  }

  const value = useMemo<SessionState>(() => ({
    user,
    isHydrating,
    login,
    register,
    logout,
  }), [user, isHydrating])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return context
}