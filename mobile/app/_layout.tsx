import { Stack, router, usePathname } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, View, useColorScheme, LogBox } from 'react-native'

// Force ignore Expo Go limitations and deprecations at the root level
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications', 
  '`expo-notifications` functionality is not fully supported',
  '`Background Fetch` functionality is not available in Expo Go',
  'expo-background-fetch: This library is deprecated',
  'remote notifications) functionality provided by expo-notifications was removed from Expo Go'
]);
import { useEffect } from 'react'
import { AppShell } from '../src/components/AppShell'
import { SessionProvider, useSession } from '../src/lib/session'
import { isPublicRoute, isRouteAllowed } from '../src/lib/access'
import { theme } from '../src/theme'

function GuardedNavigator() {
  const colorScheme = useColorScheme()
  const pathname = usePathname()
  const { user, isHydrating } = useSession()

  useEffect(() => {
    if (isHydrating) return

    const publicRoute = isPublicRoute(pathname)
    if (!user && !publicRoute) {
      router.replace('/auth')
      return
    }

    if (user && !isRouteAllowed(pathname, user)) {
      router.replace('/(tabs)/profile')
    }
  }, [isHydrating, pathname, user])

  if (isHydrating) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <AppShell colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="pin" />
      </Stack>
    </AppShell>
  )
}


import { AlertProvider } from '../src/lib/AlertContext'
import { NotificationProvider } from '../src/lib/NotificationContext'
import { GlobalAlertModal } from '../src/components/GlobalAlertModal'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NotificationProvider>
          <AlertProvider>
            <GuardedNavigator />
            <GlobalAlertModal />
          </AlertProvider>
        </NotificationProvider>
      </SessionProvider>
    </SafeAreaProvider>
  )
}