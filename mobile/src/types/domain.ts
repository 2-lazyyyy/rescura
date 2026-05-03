export type AccountType = 'user' | 'organization'
export type UserRole = 'user' | 'organization' | 'admin' | 'tracking_volunteer' | 'supply_volunteer'

export type PinType = 'damaged' | 'safe'
export type PinStatus = 'pending' | 'confirmed' | 'completed' | 'in-progress' | 'cancelled'

export interface MobileUser {
  id: string
  email: string
  name: string
  phone?: string | null
  role?: UserRole | string | null
  organizationId?: string | null
  image?: string | null
  accountType?: AccountType
  isOrg?: boolean
  isAdmin?: boolean
}

export interface PinRecord {
  id: string
  type: PinType
  status: PinStatus | string
  phone?: string | null
  description?: string | null
  latitude: number
  longitude: number
  createdBy?: string
  createdAt?: string
  image?: string | null
  image_url?: string | null
  user_id?: string | null
}

export interface PinItemRecord {
  id: string
  pin_id: string
  item_id: string
  requested_qty: number
  remaining_qty: number
  item?: { id: string; name: string; unit?: string | null; description?: string | null }
}

export interface NotificationRecord {
  id: string
  user_id?: string | null
  organization_id?: string | null
  type: string
  title?: string | null
  body?: string | null
  payload?: Record<string, unknown> | null
  read?: boolean | null
  created_at?: string | null
}

export interface FamilyMemberRecord {
  id: string
  user_id: string
  member_id: string
  relation?: string | null
  safety_status?: string | null
  safety_check_started_at?: string | null
  safety_check_expires_at?: string | null
  member?: MobileUser
}

export interface FamilyRequestRecord {
  id: string
  from_user_id: string
  to_user_id: string
  relation: string
  status: string
  created_at?: string
  sender?: MobileUser
  receiver?: MobileUser
}

export interface MessageRecord {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  status?: string | null
  created_at?: string | null
  sender?: MobileUser
  receiver?: MobileUser
}