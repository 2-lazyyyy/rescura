import React, { createContext, useContext, useEffect, useState, useCallback, PropsWithChildren } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import Constants, { AppOwnership } from 'expo-constants'
import { fetchUSGSEarthquakes, fetchFloodAlerts, DisasterEvent } from '../services/alerts'
import * as Location from 'expo-location'
import * as Localization from 'expo-localization'

type AlertContextType = {
  liveAlerts: DisasterEvent[]
  currentActiveAlert: DisasterEvent | null
  showActiveAlertModal: boolean
  setShowActiveAlertModal: (show: boolean) => void
  userCountry: string | null
  refreshAlerts: () => Promise<void>
  localNotiEnabled: boolean
  globalNotiEnabled: boolean
  toggleNotification: (type: 'local' | 'global') => Promise<void>
}

const AlertContext = createContext<AlertContextType | undefined>(undefined)

import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'

const BACKGROUND_FETCH_TASK = 'background-disaster-alerts'

// 1. Define the task outside the component
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const [eqs, floods] = await Promise.all([fetchUSGSEarthquakes(), fetchFloodAlerts()])
    const masterAlerts = [...eqs, ...floods]
      .filter(a => a.type === 'earthquake' || a.type === 'flood')
      .sort((a, b) => b.time - a.time)

    if (masterAlerts.length > 0) {
      const latestAlert = masterAlerts[0]
      const lastSeenId = await AsyncStorage.getItem('lastSeen_absolute_latest')

      if (lastSeenId !== latestAlert.id) {
        // New alert found in background!
        const userCountry = await AsyncStorage.getItem('user_detected_country')
        const localEnabled = (await AsyncStorage.getItem('localNotiEnabled')) === 'true'
        const globalEnabled = (await AsyncStorage.getItem('globalNotiEnabled')) === 'true'

        const isLocal = userCountry && (
          latestAlert.place?.toLowerCase().includes(userCountry.toLowerCase()) || 
          latestAlert.location?.toLowerCase().includes(userCountry.toLowerCase()) ||
          (userCountry.toLowerCase() === 'myanmar' && latestAlert.place?.toLowerCase().includes('burma'))
        )

        if ((isLocal && localEnabled) || (!isLocal && globalEnabled)) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${latestAlert.type.toUpperCase()} ALERT: ${latestAlert.title}`,
              body: latestAlert.description || latestAlert.place,
              data: { alertId: latestAlert.id },
              sound: true,
              priority: 'high',
            },
            trigger: null,
          })
          // Update last seen so we don't notify again
          await AsyncStorage.setItem('lastSeen_absolute_latest', latestAlert.id)
        }
      }
    }
    return BackgroundFetch.BackgroundFetchResult.NewData
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

export function AlertProvider({ children }: PropsWithChildren) {
  const [liveAlerts, setLiveAlerts] = useState<DisasterEvent[]>([])
  const [currentActiveAlert, setCurrentActiveAlert] = useState<DisasterEvent | null>(null)
  const [showActiveAlertModal, setShowActiveAlertModal] = useState(false)
  const [userCountry, setUserCountry] = useState<string | null>(null)
  const [localNotiEnabled, setLocalNotiEnabled] = useState(false)
  const [globalNotiEnabled, setGlobalNotiEnabled] = useState(false)

  const loadSettings = useCallback(async () => {
    const local = await AsyncStorage.getItem('localNotiEnabled')
    const global = await AsyncStorage.getItem('globalNotiEnabled')
    const country = await AsyncStorage.getItem('user_detected_country')
    setLocalNotiEnabled(local === 'true')
    setGlobalNotiEnabled(global === 'true')
    setUserCountry(country)
  }, [])

  const detectLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return

      let loc = await Location.getLastKnownPositionAsync({})
      if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })

      if (loc) {
        const { latitude: lat, longitude: lon } = loc.coords
        const isInMyanmar = lat > 9.2 && lat < 28.5 && lon > 92.2 && lon < 101.4

        let country = ''
        if (isInMyanmar) {
          country = 'Myanmar'
        } else {
          try {
            const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon })
            if (geo && geo.length > 0) {
              country = geo[0].country || ''
            }
          } catch (err) {
            const locales = Localization.getLocales()
            if (locales && locales.length > 0) {
              const region = locales[0].regionCode
              if (region === 'MM') country = 'Myanmar'
              else if (region === 'US') country = 'United States'
              else country = region || ''
            }
          }
        }
        if (country) {
          setUserCountry(country)
          await AsyncStorage.setItem('user_detected_country', country)
        }
      }
    } catch (e) {
      // ignore
    }
  }, [])

  const registerBackgroundFetch = async () => {
    try {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15 * 60, // 15 minutes (minimum allowed by iOS/Android)
        stopOnTerminate: false,
        startOnBoot: true,
      })
    } catch (err) {
      console.warn("Background fetch registration failed", err)
    }
  }

  const refreshAlerts = useCallback(async () => {
    try {
      const [eqs, floods] = await Promise.all([fetchUSGSEarthquakes(), fetchFloodAlerts()])
      const masterAlerts = [...eqs, ...floods]
        .filter(a => a.type === 'earthquake' || a.type === 'flood')
        .sort((a, b) => b.time - a.time)

      setLiveAlerts(masterAlerts)

      if (masterAlerts.length > 0) {
        const latestAlert = masterAlerts[0]
        const lastSeenId = await AsyncStorage.getItem('lastSeen_absolute_latest')

        const isLocal = userCountry && (
          latestAlert.place?.toLowerCase().includes(userCountry.toLowerCase()) || 
          latestAlert.location?.toLowerCase().includes(userCountry.toLowerCase()) ||
          (userCountry.toLowerCase() === 'myanmar' && latestAlert.place?.toLowerCase().includes('burma'))
        )

        if (lastSeenId !== latestAlert.id) {
          await AsyncStorage.setItem('lastSeen_absolute_latest', latestAlert.id)

          const localEnabled = (await AsyncStorage.getItem('localNotiEnabled')) === 'true'
          const globalEnabled = (await AsyncStorage.getItem('globalNotiEnabled')) === 'true'

          if ((isLocal && localEnabled) || (!isLocal && globalEnabled)) {
            setCurrentActiveAlert(latestAlert)
            setShowActiveAlertModal(true)

            // System Notification (always helpful)
            await Notifications.scheduleNotificationAsync({
              content: {
                title: `${latestAlert.type.toUpperCase()} ALERT: ${latestAlert.title}`,
                body: latestAlert.description || latestAlert.place,
                data: { alertId: latestAlert.id },
                sound: true,
                priority: 'high',
              },
              trigger: null,
            })
          }
        }
      }
    } catch (e) {
      console.warn('Failed to refresh alerts in provider', e)
    }
  }, [userCountry])

  const toggleNotification = async (type: 'local' | 'global') => {
    const isLocal = type === 'local'
    const currentState = isLocal ? localNotiEnabled : globalNotiEnabled
    const newState = !currentState

    if (newState) {
      const { status } = await Notifications.requestPermissionsAsync()
      if (status !== 'granted') return
    }

    if (isLocal) setLocalNotiEnabled(newState)
    else setGlobalNotiEnabled(newState)

    await AsyncStorage.setItem(`${type}NotiEnabled`, newState.toString())
  }

  useEffect(() => {
    loadSettings()
    detectLocation()
    registerBackgroundFetch()
  }, [loadSettings, detectLocation])

  useEffect(() => {
    refreshAlerts()
    const interval = setInterval(refreshAlerts, 60000) // Poll every 60 seconds
    return () => clearInterval(interval)
  }, [refreshAlerts])

  return (
    <AlertContext.Provider value={{
      liveAlerts,
      currentActiveAlert,
      showActiveAlertModal,
      setShowActiveAlertModal,
      userCountry,
      refreshAlerts,
      localNotiEnabled,
      globalNotiEnabled,
      toggleNotification
    }}>
      {children}
    </AlertContext.Provider>
  )
}

export function useAlerts() {
  const context = useContext(AlertContext)
  if (!context) throw new Error('useAlerts must be used within AlertProvider')
  return context
}
