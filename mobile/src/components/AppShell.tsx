import { PropsWithChildren } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../theme'

export function AppShell({ children, colorScheme }: PropsWithChildren<{ colorScheme: 'light' | 'dark' }>) {
  const insets = useSafeAreaInsets()
  
  return (
    <View style={[
      styles.root, 
      colorScheme === 'dark' ? styles.dark : styles.light
    ]}>
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  light: {},
  dark: {
    backgroundColor: '#0f172a',
  },
  content: {
    flex: 1,
  },
})