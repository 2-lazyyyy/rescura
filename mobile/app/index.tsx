import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSession } from '../src/lib/session'
import { theme } from '../src/theme'

export default function IndexScreen() {
  const { isHydrating, user } = useSession()

  useEffect(() => {
    if (isHydrating) return
    if (user) {
      router.replace('/(tabs)')
    } else {
      router.replace('/auth')
    }
  }, [isHydrating, user])

  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
})