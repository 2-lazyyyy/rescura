export type AccountType = 'user' | 'organization'
export type UserRole = 'admin' | 'tracking_volunteer' | 'supply_volunteer' | 'organization' | 'user'
export type PinType = 'damaged' | 'safe'
export type PinStatus = 'pending' | 'confirmed' | 'completed' | 'in-progress'
export type NotificationRecipientType = 'user' | 'organization'

export interface FeatureCard {
  key: string
  title: string
  description: string
  footer?: string
}

export interface QuickActionCard {
  key: string
  title: string
  description: string
  accent?: string
}

export const quickActions: QuickActionCard[] = [
  {
    key: 'report-pin',
    title: 'Report incident',
    description: 'Create a rescue pin with map coordinates, photos, and supply hints.',
    accent: 'Map',
  },
  {
    key: 'family-check',
    title: 'Safety check',
    description: 'Send a check-in request to family members and track their response window.',
    accent: 'Family',
  },
  {
    key: 'ai-guide',
    title: 'AI guidance',
    description: 'Ask for survival, first-aid, or mental-health support in Burmese or English.',
    accent: 'AI',
  },
  {
    key: 'org-workflow',
    title: 'Org workflow',
    description: 'Confirm requests, manage inventory, and dispatch supplies from one view.',
    accent: 'Ops',
  },
]

export const featureCards: FeatureCard[] = [
  {
    key: 'realtime-alerts',
    title: 'Realtime alerts',
    description: 'Ably-backed disaster broadcasts and notification streams stay aligned across web and mobile.',
    footer: 'Single event model',
  },
  {
    key: 'shared-auth',
    title: 'Shared auth contract',
    description: 'Supabase session and profile models are reused so roles do not drift between platforms.',
    footer: 'One identity source',
  },
  {
    key: 'shared-ux',
    title: 'Web-like UI language',
    description: 'Neutral surfaces, rounded cards, and restrained typography match the existing web feel.',
    footer: 'Theme parity first',
  },
]