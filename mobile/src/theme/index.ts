import { sharedTheme } from '../../../shared/theme'

export const theme = {
  colors: sharedTheme.colors,
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
} as const

export type AppTheme = typeof theme