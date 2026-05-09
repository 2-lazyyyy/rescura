"use client"

import { useEffect, useRef, useState } from 'react'
import Ably from 'ably'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Droplets, Wind, MapPin, Clock, Navigation, Globe, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EventMapModal from './event-map-modal'

// Unified disaster event type
export interface DisasterEvent {
  id: string
  source: 'usgs' | 'flood' | 'cyclone'
  type: 'earthquake' | 'flood' | 'cyclone'
  title: string
  description?: string
  magnitude?: number | null
  place?: string
  time: number // epoch ms
  url?: string
  coordinates?: number[] // [lon, lat, depth?]
  severity: 'high' | 'medium' | 'low'
  location?: string
}

function severityFromMagnitude(mag: number | null | undefined): 'high' | 'medium' | 'low' {
  if (mag == null) return 'low'
  if (mag >= 6) return 'high'
  if (mag >= 4) return 'medium'
  return 'low'
}

function formatTimeAgo(time: number) {
  const now = Date.now()
  // Guard against bad timestamps (seconds or strings handled elsewhere)
  const diffMs = Math.max(0, now - time)
  if (diffMs < 1000) return 'just now'
  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (seconds && parts.length === 0) parts.push(`${seconds}s`) // show seconds only when <1m
  return `${parts.join(' ')} ago`
}

function getSeverityBadge(sev: string) {
  switch (sev) {
    case 'high': return 'bg-red-100 text-red-800 border-red-200'
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'low': return 'bg-blue-100 text-blue-800 border-blue-200'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

function IconFor(type: string) {
  switch (type) {
    case 'earthquake': return <AlertTriangle className="w-5 h-5 text-orange-500" />
    case 'flood': return <Droplets className="w-5 h-5 text-blue-500" />
    case 'cyclone': return <Wind className="w-5 h-5 text-purple-500" />
    default: return <AlertTriangle className="w-5 h-5" />
  }
}

/**
 * LiveAlerts component subscribes to Ably channel (earthquakes) and also
 * performs a periodic USGS fetch as a fallback / completeness enrichment.
 */
export function LiveAlerts({ className }: { className?: string }) {
  const [events, setEvents] = useState<DisasterEvent[]>([])
  const ablyRef = useRef<Ably.Realtime | null>(null)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle')
  const [selectedForMap, setSelectedForMap] = useState<DisasterEvent | null>(null)
  const [region, setRegion] = useState<'global' | 'myanmar'>(() => {
    if (typeof window === 'undefined') return 'global'
    try {
      return (localStorage.getItem('alerts_region') as 'global' | 'myanmar') || 'global'
    } catch { return 'global' }
  })
  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ly_disaster_alerts_muted')
      setIsMuted(saved === null ? true : saved === 'true')
    } catch {}

    const handleMuteChange = (e: any) => {
      setIsMuted(e.detail?.muted === true)
    }
    window.addEventListener('disaster-mute-change', handleMuteChange)
    return () => window.removeEventListener('disaster-mute-change', handleMuteChange)
  }, [])

  const toggleMute = () => {
    try {
      const newVal = !isMuted
      setIsMuted(newVal)
      localStorage.setItem('ly_disaster_alerts_muted', String(newVal))
      window.dispatchEvent(new CustomEvent('disaster-mute-change', { detail: { muted: newVal } }))
    } catch {}
  }

  useEffect(() => {
    try { localStorage.setItem('alerts_region', region) } catch {}
  }, [region])

  function normalizeTime(input: any): number {
    try {
      if (typeof input === 'string') {
        const parsed = Date.parse(input)
        if (!Number.isNaN(parsed)) return parsed
      }
      if (typeof input === 'number') {
        // If value looks like seconds, convert to ms
        if (input < 1e12) return input * 1000
        return input
      }
    } catch {}
    return Date.now()
  }

  async function sendTestEqAlert() {
    try {
      const mag = Number((Math.random() * 2 + 4).toFixed(1)) // 4.0 - 6.0
      const now = Date.now()
      const unique = Math.random().toString(36).slice(2, 8)
      const ev: DisasterEvent = {
        id: `test-eq-${now}-${unique}`,
        source: 'usgs',
        type: 'earthquake',
        title: `M${mag} Test Earthquake`,
        description: 'Simulated test event for broadcast',
        magnitude: mag,
        place: 'Yangon, Myanmar (Test)',
        time: now,
        url: 'https://earthquake.usgs.gov/',
        coordinates: [96.1421, 16.7875],
        severity: severityFromMagnitude(mag),
        location: 'Yangon, MM (Test)',
      }
      // Mark as seen locally to prevent Ably duplication race
      seenIdsRef.current.add(ev.id)
      // Broadcast to all connected users via server -> Ably
      fetch('/api/broadcast-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ev.id,
          type: ev.type,
          title: ev.title,
          description: ev.description,
          magnitude: ev.magnitude,
          place: ev.place,
          time: ev.time,
          url: ev.url,
          coordinates: ev.coordinates,
          severity: ev.severity,
          location: ev.location,
          source: 'test'
        })
      }).catch(()=>{})
      // Also insert locally for immediate visibility
      setEvents((prev) => [ev, ...prev].sort((a, b) => b.time - a.time).slice(0, 200))
    } catch {}
  }

  // Subscribe to Ably earthquakes
  useEffect(() => {
    let cancelled = false
    async function initAbly() {
      try {
        setStatus('connecting')
        // Obtain token request from API route
        const tokenRes = await fetch('/api/ably-token')
        if (!tokenRes.ok) throw new Error('Token request failed')
        const tokenRequest = await tokenRes.json()
        if (cancelled) return
        const ably = new Ably.Realtime({ authUrl: '/api/ably-token', authMethod: 'GET' })
        ablyRef.current = ably
        ably.connection.on('connected', () => setStatus('live'))
        ably.connection.on('failed', () => setStatus('error'))
        const channel = ably.channels.get(process.env.NEXT_PUBLIC_ABLY_CHANNEL || 'earthquakes-myanmar')
        const normalizeTime = (input: any): number => {
          try {
            if (typeof input === 'string') {
              const parsed = Date.parse(input)
              if (!Number.isNaN(parsed)) return parsed
            }
            if (typeof input === 'number') {
              return input < 1e12 ? input * 1000 : input
            }
          } catch {}
          return Date.now()
        }
        channel.subscribe('earthquake', (msg) => {
          try {
            const payload: any = msg.data || {}
            const id: string = payload.id || msg.id || Math.random().toString(36).slice(2)
            if (seenIdsRef.current.has(id)) return
            seenIdsRef.current.add(id)
            const t = normalizeTime(payload.time)
            const ev: DisasterEvent = {
              id,
              source: 'usgs',
              type: 'earthquake',
              title: payload.title || `M${payload.magnitude} Earthquake`,
              description: payload.place,
              magnitude: payload.magnitude,
              place: payload.place,
              time: t,
              url: payload.url,
              coordinates: payload.coordinates,
              severity: severityFromMagnitude(payload.magnitude),
              location: payload.place,
            }
            setEvents((prev) => [ev, ...prev].sort((a, b) => b.time - a.time).slice(0, 200))
          } catch (err) {
            // swallow parse errors
          }
        })
        channel.subscribe('flood', (msg) => {
          try {
            const payload: any = msg.data || {}
            const id: string = payload.id || msg.id || Math.random().toString(36).slice(2)
            if (seenIdsRef.current.has(id)) return
            seenIdsRef.current.add(id)
            const t = normalizeTime(payload.time)
            const ev: DisasterEvent = {
              id,
              source: 'flood',
              type: 'flood',
              title: payload.title || `Flood alert — ${payload.place || 'Unknown'}`,
              description: payload.description,
              magnitude: payload.magnitude,
              place: payload.place,
              time: t,
              url: payload.url,
              coordinates: payload.coordinates,
              severity: payload.severity || 'medium',
              location: payload.location || payload.place,
            }
            setEvents((prev) => [ev, ...prev].sort((a, b) => b.time - a.time).slice(0, 200))
          } catch (err) {
            // ignore
          }
        })
      } catch (err) {
        console.error('[LiveAlerts] Ably init error', err)
        setStatus('error')
      }
    }
    initAbly()
    return () => { cancelled = true; try { ablyRef.current?.close() } catch {} }
  }, [])

  // Periodic enrichment via direct USGS fetch (covers missed events)
  useEffect(() => {
    const controller = new AbortController()
    async function pollUSGS() {
      try {
        // Global (no lat/lon bounding box). Limit window & number to keep payload reasonable.
        const params = new URLSearchParams({
          format: 'geojson',
          orderby: 'time',
          limit: '200', // global feed can be larger; cap at 200 recent events
          starttime: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // last 6 hours
          endtime: new Date().toISOString(),
        })
        const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`, { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json()
        if (!Array.isArray(data.features)) return
        for (const feature of data.features) {
          const id = feature.id
          if (!id || seenIdsRef.current.has(id)) continue
          seenIdsRef.current.add(id)
          const mag = feature.properties?.mag ?? null
          const t = normalizeTime(feature.properties?.time)
          const ev: DisasterEvent = {
            id,
            source: 'usgs',
            type: 'earthquake',
            title: feature.properties?.title || `M${mag} Earthquake`,
            description: feature.properties?.place,
            magnitude: mag,
            place: feature.properties?.place,
            time: t,
            url: feature.properties?.url,
            coordinates: feature.geometry?.coordinates || [],
            severity: severityFromMagnitude(mag),
            location: feature.properties?.place,
          }
          // Broadcast to all connected clients via server -> Ably
          try {
            fetch('/api/broadcast-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: ev.id,
                type: ev.type,
                title: ev.title,
                description: ev.description,
                magnitude: ev.magnitude,
                place: ev.place,
                time: ev.time,
                url: ev.url,
                coordinates: ev.coordinates,
                severity: ev.severity,
                location: ev.location,
                source: 'usgs'
              })
            }).catch(()=>{})
          } catch {}
          setEvents((prev) => [ev, ...prev].sort((a, b) => b.time - a.time).slice(0, 200))
        }
      } catch (err) {
        // ignore fetch errors
      }
    }
    pollUSGS()
    const interval = setInterval(pollUSGS, 60_000) // every minute
    return () => { controller.abort(); clearInterval(interval) }
  }, [])

  // Flood polling via Open-Meteo Flood API (river discharge). Creates flood events
  useEffect(() => {
    const controller = new AbortController()
    const sites = [
      // Myanmar-focused sites first
      { key: 'yangon', name: 'Myanmar — Yangon', lat: 16.7875, lon: 96.1421 },
      { key: 'mandalay', name: 'Myanmar — Mandalay (Ayeyarwady)', lat: 21.9588, lon: 96.0891 },
      { key: 'naypyidaw', name: 'Myanmar — Nay Pyi Taw (Sittoung basin)', lat: 19.7633, lon: 96.0785 },
      { key: 'bago', name: 'Myanmar — Bago', lat: 17.3367, lon: 96.4797 },
      // Global rivers (keep a few representative)
      { key: 'amazon-manaus', name: 'Amazon — Manaus, BR', lat: -3.119, lon: -60.0217 },
      { key: 'ganges-kolkata', name: 'Ganges — Kolkata, IN', lat: 22.5726, lon: 88.3639 },
      { key: 'yangtze-wuhan', name: 'Yangtze — Wuhan, CN', lat: 30.5928, lon: 114.3055 },
      { key: 'mekong-phnompenh', name: 'Mekong — Phnom Penh, KH', lat: 11.5564, lon: 104.9282 },
      { key: 'mississippi-neworleans', name: 'Mississippi — New Orleans, US', lat: 29.9511, lon: -90.0715 },
      { key: 'nile-cairo', name: 'Nile — Cairo, EG', lat: 30.0444, lon: 31.2357 },
    ]

    function severityFromDischarge(q: number | null | undefined): 'high' | 'medium' | 'low' {
      if (q == null) return 'low'
      if (q >= 5000) return 'high'
      if (q >= 2000) return 'medium'
      return 'low'
    }

    async function pollFloods() {
      try {
        const requests = sites.map(async (s) => {
          const url = new URL('https://flood-api.open-meteo.com/v1/flood')
          url.searchParams.set('latitude', String(s.lat))
          url.searchParams.set('longitude', String(s.lon))
          // Flood API is daily-only. Minimal working parameters.
          url.searchParams.set('daily', 'river_discharge')
          const reqUrl = url.toString()
          const res = await fetch(reqUrl, { signal: controller.signal })
          if (!res.ok) {
            console.warn(
              '[LiveAlerts] Flood API non-OK',
              res.status,
              await res.text().catch(() => '')
            )
            return null
          }
          const data = await res.json()
          const times: string[] | undefined = data?.daily?.time
          const discharge: number[] | undefined = data?.daily?.river_discharge
          if (!times || !discharge || times.length === 0) return null
          // Use the latest timestamp
          const idx = times.length - 1
          const tISO = times[idx]
          const t = Date.parse(tISO)
          const q = discharge[idx] as number
          const sev = severityFromDischarge(q)
          if (sev === 'low') return null // only surface medium/high for alerts
          const id = `flood-${s.key}-${t}`
          if (seenIdsRef.current.has(id)) return null
          seenIdsRef.current.add(id)
          const ev: DisasterEvent = {
            id,
            source: 'flood',
            type: 'flood',
            title: `Flood risk — ${s.name}`,
            description: `River discharge ${q.toFixed(0)} m³/s at ${new Date(t).toUTCString()}`,
            magnitude: q,
            place: s.name,
            time: t,
            url: undefined,
            coordinates: [s.lon, s.lat],
            severity: sev,
            location: s.name,
          }
          try {
            // Broadcast to server so ALL users get a toast via Ably
            fetch('/api/broadcast-alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: ev.id,
                type: ev.type,
                title: ev.title,
                description: ev.description,
                magnitude: ev.magnitude,
                place: ev.place,
                time: ev.time,
                url: ev.url,
                coordinates: ev.coordinates,
                severity: ev.severity,
                location: ev.location,
                source: 'flood'
              })
            }).catch(()=>{})
          } catch {}
          return ev
        })
        const results = await Promise.all(requests)
        const newEvents = results.filter((e): e is DisasterEvent => !!e)
        if (newEvents.length) {
          setEvents((prev) => [...newEvents, ...prev].sort((a, b) => b.time - a.time).slice(0, 200))
        }
      } catch (err) {
        // ignore errors
      }
    }

    pollFloods()
    const interval = setInterval(pollFloods, 30 * 60 * 1000) // every 30 minutes
    return () => { controller.abort(); clearInterval(interval) }
  }, [])

  const earthquakes = events.filter(e => e.type === 'earthquake').sort((a,b)=> b.time - a.time)
  const floods = events.filter(e => e.type === 'flood').sort((a,b)=> b.time - a.time)

  function isInMyanmar(e: DisasterEvent): boolean {
    try {
      if (e.coordinates && e.coordinates.length >= 2) {
        const lon = Number(e.coordinates[0])
        const lat = Number(e.coordinates[1])
        // Myanmar approx bounding box
        const inBox = lat >= 9.5 && lat <= 28.6 && lon >= 92.2 && lon <= 101.2
        if (inBox) return true
      }
      const text = `${e.location || ''} ${e.place || ''}`.toLowerCase()
      if (!text) return false
      const keywords = ['myanmar', 'yangon', 'mandalay', 'nay pyi taw', 'naypyidaw', 'bago', 'sagaing', 'ayeyarwady', 'mon', 'shan', 'kachin', 'kayin', 'magway', 'tanintharyi', 'rakhine']
      return keywords.some(k => text.includes(k))
    } catch { return false }
  }

  const earthquakesFiltered = region === 'global' ? earthquakes : earthquakes.filter(isInMyanmar)
  const floodsFiltered = region === 'global' ? floods : floods.filter(isInMyanmar)
  const lastTen = earthquakesFiltered.slice(0,10)
  const floodsLastTen = floodsFiltered.slice(0,10)

  const eqHigh = lastTen.filter(e => e.severity === 'high').length
  const eqMedium = lastTen.filter(e => e.severity === 'medium').length
  const eqLow = lastTen.filter(e => e.severity === 'low').length
  const floodHigh = floodsLastTen.filter(e => e.severity === 'high').length
  const floodMedium = floodsLastTen.filter(e => e.severity === 'medium').length
  const floodLow = floodsLastTen.filter(e => e.severity === 'low').length

  const highCount = eqHigh + floodHigh
  const mediumCount = eqMedium + floodMedium
  const lowCount = eqLow + floodLow

  return (
    <div className={className}>
      {/* Header with Region Filter and Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${status === 'live' ? 'bg-green-500 animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
              <span className="text-sm font-medium text-gray-700">
                {status === 'live' ? 'Live Updates' : status === 'error' ? 'Connection Error' : 'Connecting...'}
              </span>
            </div>
            <div className="h-4 w-px bg-gray-300 hidden sm:block" />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-sm font-medium text-gray-600">Region:</span>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shadow-sm w-full sm:w-auto">
                <button
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 sm:gap-2 transition-colors ${region==='global' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setRegion('global')}
                  title="Show global alerts"
                >
                  <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Global</span><span className="xs:hidden">All</span>
                </button>
                <button
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 sm:gap-2 border-l border-gray-300 transition-colors ${region==='myanmar' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => setRegion('myanmar')}
                  title="Show Myanmar alerts"
                >
                  <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Myanmar
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 hidden xs:inline">Notifications:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMute}
              className={`flex items-center gap-2 transition-all duration-200 ${isMuted ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-amber-50 text-amber-600 border-amber-200 shadow-sm'}`}
              title={isMuted ? "Turn on disaster notifications" : "Turn off disaster notifications"}
            >
              {isMuted ? (
                <>
                  <BellOff className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Off</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider">On</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Risk Summary Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="border-l-4 border-l-red-600 shadow-md hover:shadow-lg transition-shadow bg-linear-to-br from-red-50 to-white">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-red-900">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                High Risk
              </CardTitle>
              <div className="text-3xl font-black text-red-700">{highCount}</div>
            </div>
            <CardDescription className="text-xs mt-1">Critical alerts requiring immediate attention</CardDescription>
          </CardHeader>
        </Card>
        
        <Card className="border-l-4 border-l-yellow-600 shadow-md hover:shadow-lg transition-shadow bg-linear-to-br from-yellow-50 to-white">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-yellow-900">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                </div>
                Medium Risk
              </CardTitle>
              <div className="text-3xl font-black text-yellow-700">{mediumCount}</div>
            </div>
            <CardDescription className="text-xs mt-1">Moderate alerts to monitor closely</CardDescription>
          </CardHeader>
        </Card>
        
        <Card className="border-l-4 border-l-blue-600 shadow-md hover:shadow-lg transition-shadow bg-linear-to-br from-blue-50 to-white">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-blue-900">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-blue-600" />
                </div>
                Low Risk
              </CardTitle>
              <div className="text-3xl font-black text-blue-700">{lowCount}</div>
            </div>
            <CardDescription className="text-xs mt-1">Minor events for awareness</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Alert Lists: Professional Emergency Display */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Earthquakes */}
        <Card className="shadow-lg border-0 overflow-hidden">
          <div className="bg-linear-to-r from-orange-400 to-orange-300 p-4">
            <CardTitle className="flex items-center gap-3 text-lg text-white font-bold">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <div>Earthquake Alerts</div>
                <div className="text-xs font-normal text-orange-100 mt-0.5">
                  {lastTen.length === 0 ? 'No recent activity' : `${lastTen.length} recent event${lastTen.length !== 1 ? 's' : ''}`}
                </div>
              </div>
            </CardTitle>
          </div>
          <CardContent className="p-4">
            <div className="h-112 overflow-y-auto pr-2 space-y-3">
              {lastTen.length === 0 ? (
                <div className="flex h-full items-center justify-center text-gray-400 text-sm py-8">
                  <div className="text-center">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>No earthquakes detected</p>
                  </div>
                </div>
              ) : (
                lastTen.map(ev => (
                  <div key={ev.id} className={`group bg-white border-l-4 rounded-lg shadow-sm hover:shadow-md transition-all p-4 ${
                    ev.severity === 'high' ? 'border-l-red-600 hover:border-l-red-700' : 
                    ev.severity === 'medium' ? 'border-l-yellow-500 hover:border-l-yellow-600' : 
                    'border-l-blue-500 hover:border-l-blue-600'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-2">
                          <div className={`mt-0.5 p-1.5 rounded-md ${
                            ev.severity === 'high' ? 'bg-red-100' : 
                            ev.severity === 'medium' ? 'bg-yellow-100' : 
                            'bg-blue-100'
                          }`}>
                            <AlertTriangle className={`w-4 h-4 ${
                              ev.severity === 'high' ? 'text-red-600' : 
                              ev.severity === 'medium' ? 'text-yellow-600' : 
                              'text-blue-600'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm text-gray-900 mb-1" title={ev.title}>{ev.title}</h4>
                            <Badge className={`${getSeverityBadge(ev.severity)} text-xs font-semibold uppercase tracking-wide`}>{ev.severity}</Badge>
                          </div>
                        </div>
                        {ev.description && (
                          <p className="text-xs text-gray-600 mb-3 leading-relaxed">{ev.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTimeAgo(ev.time)}</span>
                          </div>
                          {ev.magnitude != null && (
                            <div className="flex items-center gap-1.5 font-bold text-orange-700">
                              <span>M{(ev.magnitude as number).toFixed(1)}</span>
                            </div>
                          )}
                          {ev.location && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[120px]" title={ev.location}>{ev.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {(ev.coordinates && ev.coordinates.length >= 2) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 shadow-sm hover:shadow transition-shadow"
                          onClick={() => setSelectedForMap(ev)}
                          title="View location map"
                        >
                          <Navigation className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Floods */}
        <Card className="shadow-lg border-0 overflow-hidden">
          <div className="bg-linear-to-r from-blue-400 to-blue-300 p-4">
            <CardTitle className="flex items-center gap-3 text-lg text-white font-bold">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Droplets className="w-6 h-6 text-white" />
              </div>
              <div>
                <div>Flood Alerts</div>
                <div className="text-xs font-normal text-blue-100 mt-0.5">
                  {floodsLastTen.length === 0 ? 'No recent activity' : `${floodsLastTen.length} recent event${floodsLastTen.length !== 1 ? 's' : ''}`}
                </div>
              </div>
            </CardTitle>
          </div>
          <CardContent className="p-4">
            <div className="h-112 overflow-y-auto pr-2 space-y-3">
              {floodsLastTen.length === 0 ? (
                <div className="flex h-full items-center justify-center text-gray-400 text-sm py-8">
                  <div className="text-center">
                    <Droplets className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>No flood alerts detected</p>
                  </div>
                </div>
              ) : (
                floodsLastTen.map(ev => (
                  <div key={ev.id} className={`group bg-white border-l-4 rounded-lg shadow-sm hover:shadow-md transition-all p-4 ${
                    ev.severity === 'high' ? 'border-l-red-600 hover:border-l-red-700' : 
                    ev.severity === 'medium' ? 'border-l-yellow-500 hover:border-l-yellow-600' : 
                    'border-l-blue-500 hover:border-l-blue-600'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-2">
                          <div className={`mt-0.5 p-1.5 rounded-md ${
                            ev.severity === 'high' ? 'bg-red-100' : 
                            ev.severity === 'medium' ? 'bg-yellow-100' : 
                            'bg-blue-100'
                          }`}>
                            <Droplets className={`w-4 h-4 ${
                              ev.severity === 'high' ? 'text-red-600' : 
                              ev.severity === 'medium' ? 'text-yellow-600' : 
                              'text-blue-600'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm text-gray-900 mb-1" title={ev.title}>{ev.title}</h4>
                            <Badge className={`${getSeverityBadge(ev.severity)} text-xs font-semibold uppercase tracking-wide`}>{ev.severity}</Badge>
                          </div>
                        </div>
                        {ev.description && (
                          <p className="text-xs text-gray-600 mb-3 leading-relaxed">{ev.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTimeAgo(ev.time)}</span>
                          </div>
                          {ev.magnitude != null && (
                            <div className="flex items-center gap-1.5 font-bold text-blue-700">
                              <span>Q{Math.round(ev.magnitude)} m³/s</span>
                            </div>
                          )}
                          {ev.location && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[120px]" title={ev.location}>{ev.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {(ev.coordinates && ev.coordinates.length >= 2) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 shadow-sm hover:shadow transition-shadow"
                          onClick={() => setSelectedForMap(ev)}
                          title="View location map"
                        >
                          <Navigation className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <EventMapModal
        open={!!selectedForMap}
        onOpenChange={(o) => { if (!o) setSelectedForMap(null) }}
        title={selectedForMap?.title}
        subtitle={selectedForMap?.location}
        longitude={selectedForMap?.coordinates?.[0] ?? null}
        latitude={selectedForMap?.coordinates?.[1] ?? null}
        externalUrl={selectedForMap?.url}
      />
    </div>
  )
}
