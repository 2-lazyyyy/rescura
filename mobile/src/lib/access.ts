import type { SessionUser } from './session'

const AUTH_ROUTES = new Set(['/auth', '/', '/(tabs)/index', '/(tabs)/profile', '/pin'])
const ADMIN_ROUTES = new Set(['/admin'])
const ORG_ROUTES = new Set(['/organization', '/test-supplies'])
const OPS_ROUTES = new Set(['/organizations', '/volunteers'])

function normalizeRoute(pathname: string): string {
  if (!pathname || pathname === '/index' || pathname === '/(tabs)') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

export function isPublicRoute(pathname: string): boolean {
  const route = normalizeRoute(pathname)
  return AUTH_ROUTES.has(route) || route === '/(tabs)/index' || route === '/(tabs)/profile' || route === '/pin'
}

export function hasAdminAccess(user: SessionUser | null): boolean {
  return !!user && (user.role === 'admin' || user.isAdmin === true)
}

export function hasOrgAccess(user: SessionUser | null): boolean {
  return !!user && (user.role === 'organization' || user.isOrg === true || user.role === 'admin')
}

export function canAutoConfirmPins(user: SessionUser | null): boolean {
  if (!user) return false
  return (
    user.role === 'admin'
    || user.role === 'organization'
    || user.role === 'tracking_volunteer'
    || user.isAdmin === true
    || user.isOrg === true
  )
}

export function isRouteAllowed(pathname: string, user: SessionUser | null): boolean {
  const route = normalizeRoute(pathname)

  if (isPublicRoute(route)) return true
  if (!user) return false

  if (ADMIN_ROUTES.has(route)) return hasAdminAccess(user)
  if (ORG_ROUTES.has(route)) return hasOrgAccess(user)
  if (OPS_ROUTES.has(route)) return hasOrgAccess(user)

  return true
}
