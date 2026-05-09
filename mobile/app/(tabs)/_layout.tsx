import { Tabs } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { theme } from '../../src/theme'
import { useNotification } from '../../src/lib/NotificationContext'

// Custom tab bar icon with optional dot badge
function TabIcon({
  name,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap
  color: string
}) {
  return (
    <View style={tabIconStyles.wrapper}>
      <Ionicons name={name} size={26} color={color} />
    </View>
  )
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
})

export default function TabsLayout() {
  // ✅ Safe area insets — gives the real bottom inset including
  //    Android gesture bar / button bar height automatically
  const insets = useSafeAreaInsets()
  const { unreadCount } = useNotification()

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9',
          height: 50 + insets.bottom,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 5,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
          letterSpacing: 0.2,
        },
        tabBarIcon: ({ color, focused }) => {
          const icons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
            index:     { active: 'map',                 inactive: 'map-outline' },
            alerts:    { active: 'chatbubbles',         inactive: 'chatbubbles-outline' },
            dashboard: { active: 'grid',                inactive: 'grid-outline' },
            chat:      { active: 'sparkles',            inactive: 'sparkles-outline' },
            profile:   { active: 'person-circle',       inactive: 'person-circle-outline' },
          }
          const iconSet = icons[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' }
          return (
            <TabIcon
              name={focused ? iconSet.active : iconSet.inactive}
              color={color}
            />
          )
        },
      })}
    >
      <Tabs.Screen name="index"     options={{ title: 'Map' }} />
      <Tabs.Screen 
        name="alerts"    
        options={{ 
          title: 'Messages',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#ef4444',
            color: '#fff',
            fontSize: 10,
            fontWeight: 'bold',
          }
        }} 
      />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="chat"      options={{ title: 'AI' }} />
      <Tabs.Screen name="profile"   options={{ title: 'Profile' }} />
      <Tabs.Screen name="messages"  options={{ href: null }} />
    </Tabs>
  )
}