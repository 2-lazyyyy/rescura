import { PropsWithChildren } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

type CardProps = PropsWithChildren<{
  title: string
  description: string
  accent?: string
  footer?: string
}>

export function Card({ title, description, accent, footer }: CardProps) {
  return (
    <View style={styles.card}>
      {accent ? <Text style={styles.accent}>{accent}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 8,
    minWidth: '48%',
    flexGrow: 1,
  },
  accent: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    color: theme.colors.foreground,
    fontWeight: '800',
    fontSize: 16,
  },
  description: {
    color: theme.colors.mutedForeground,
    lineHeight: 20,
  },
  footer: {
    color: theme.colors.primary,
    fontWeight: '700',
    marginTop: 4,
  },
})