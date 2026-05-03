export const sharedTheme = {
  colors: {
    background: '#ffffff',
    foreground: '#111827',
    card: '#ffffff',
    muted: '#f3f4f6',
    mutedForeground: '#6b7280',
    primary: '#111827',
    primaryForeground: '#ffffff',
    secondary: '#f3f4f6',
    secondaryForeground: '#111827',
    popover: '#ffffff',
    popoverForeground: '#111827',
    border: '#e5e7eb',
    input: '#e5e7eb',
    ring: '#9ca3af',
    accent: '#eef2ff',
    accentForeground: '#111827',
    destructive: '#dc2626',
    chart1: '#f59e0b',
    chart2: '#0ea5e9',
    chart3: '#334155',
    chart4: '#84cc16',
    chart5: '#fb923c',
  },
} as const

export type SharedTheme = typeof sharedTheme