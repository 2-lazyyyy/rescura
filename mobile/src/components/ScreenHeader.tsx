import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { theme } from '../theme'

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  badgeCount?: number
  rightIcon?: keyof typeof Ionicons.glyphMap
  onRightPress?: () => void
  rightLabel?: string
}

export function ScreenHeader({
  title,
  subtitle,
  badgeCount,
  rightIcon,
  onRightPress,
  rightLabel,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.left}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {badgeCount !== undefined && badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
            </View>
          )}
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {(rightIcon || rightLabel) && (
        <TouchableOpacity
          onPress={onRightPress}
          style={styles.rightBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {rightIcon && <Ionicons name={rightIcon} size={22} color={theme.colors.primary} />}
          {rightLabel && <Text style={styles.rightLabel}>{rightLabel}</Text>}
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  left: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: theme.colors.mutedForeground,
    lineHeight: 18,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: theme.colors.primaryForeground,
    fontSize: 11,
    fontWeight: '800',
  },
  rightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  rightLabel: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
})
