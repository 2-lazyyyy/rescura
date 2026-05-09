"use client"

import { useEffect, useRef, useState } from 'react'
import Ably from 'ably'
import { AlertTriangle, Droplets, Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface IncomingAlert {
  id?: string
  type: string // 'earthquake' | 'flood'
  title?: string
  description?: string
  magnitude?: number // mag or discharge
  place?: string
  time?: number
  severity?: 'high' | 'medium' | 'low'
  coordinates?: number[]
}

function deriveSeverity(data: IncomingAlert): 'high' | 'medium' | 'low' {
  if (data.severity) return data.severity
  if (data.type === 'earthquake') {
    const m = data.magnitude ?? 0
    if (m >= 6) return 'high'
    if (m >= 4) return 'medium'
    return 'low'
  }
  if (data.type === 'flood') {
    const q = data.magnitude ?? 0
    if (q >= 5000) return 'high'
    if (q >= 2000) return 'medium'
    return 'low'
  }
  return 'low'
}

function formatTime(ts?: number) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleString() } catch { return '' }
}

export function DisasterToasts() {
  const ablyRef = useRef<Ably.Realtime | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [curr, setCurr] = useState<IncomingAlert | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const STORAGE_KEY = 'ly_seen_alert_ids_v1'
  const MUTE_KEY = 'ly_disaster_alerts_muted'
  const MAX_ENTRIES = 500
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MUTE_KEY)
      setIsMuted(saved === null ? true : saved === 'true')
    } catch {}

    const handleMuteChange = (e: any) => {
      setIsMuted(e.detail?.muted === true)
    }

    window.addEventListener('disaster-mute-change', handleMuteChange)
    return () => window.removeEventListener('disaster-mute-change', handleMuteChange)
  }, [])

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const obj = JSON.parse(raw) as Record<string, number>
      const now = Date.now()
      const entries = Object.entries(obj).filter(([, ts]) => now - ts < MAX_AGE_MS)
      entries.sort((a, b) => b[1] - a[1])
      const trimmed = entries.slice(0, MAX_ENTRIES)
      seenRef.current = new Set(trimmed.map(([id]) => id))
      if (trimmed.length !== entries.length) {
        const out: Record<string, number> = {}
        for (const [id, ts] of trimmed) out[id] = ts
        localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
      }
    } catch {}
  }

  function persistAdd(id: string) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const now = Date.now()
      let obj: Record<string, number> = {}
      if (raw) obj = JSON.parse(raw)
      obj[id] = now
      const entries = Object.entries(obj)
      entries.sort((a, b) => b[1] - a[1])
      const trimmed = entries.slice(0, MAX_ENTRIES)
      const out: Record<string, number> = {}
      for (const [k, v] of trimmed) out[k] = v
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
    } catch {}
  }

  useEffect(() => {
    let cancelled = false
    loadPersisted()
    async function init() {
      try {
        await fetch('/api/ably-token')
        if (cancelled) return
        const ably = new Ably.Realtime({ authUrl: '/api/ably-token', authMethod: 'GET' })
        ablyRef.current = ably
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
        const handler = (msg: Ably.Types.Message) => {
          const data: IncomingAlert = msg.data || {}
          const id = data.id || msg.id || Math.random().toString(36).slice(2)
          if (seenRef.current.has(id)) return
          seenRef.current.add(id)
          persistAdd(id)
          if (!data.type) return
          const t = normalizeTime((data as any).time)
          
          // Only show popup if not muted
          if (localStorage.getItem(MUTE_KEY) === 'false') {
            setCurr({ ...data, time: t, severity: deriveSeverity(data) })
            setOpen(true)
          }
        }
        channel.subscribe('earthquake', handler)
        channel.subscribe('flood', handler)
      } catch (e) {
        console.error('[DisasterAlertModal] init error', e)
      }
    }
    init()
    return () => { cancelled = true; try { ablyRef.current?.close() } catch {} }
  }, [])

  // Helper to handle a new event locally and optionally broadcast
  async function handleIncoming(ev: IncomingAlert) {
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
    const id = ev.id || Math.random().toString(36).slice(2)
    if (seenRef.current.has(id)) return
    seenRef.current.add(id)
    persistAdd(id)
    const t = normalizeTime(ev.time)
    const enriched: IncomingAlert = { ...ev, id, time: t, severity: deriveSeverity({ ...ev, time: t }) }
    
    // Only show popup if not muted
    if (localStorage.getItem(MUTE_KEY) === 'false') {
      setCurr(enriched)
      setOpen(true)
    }
    try {
      await fetch('/api/broadcast-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: enriched.id,
          type: enriched.type,
          title: enriched.title,
          description: enriched.description || enriched.place,
          magnitude: enriched.magnitude,
          place: enriched.place,
          time: enriched.time || Date.now(),
          url: undefined,
          coordinates: ev.coordinates,
          severity: enriched.severity,
          location: enriched.place,
          source: enriched.type,
        })
      })
    } catch {}
  }

  // Periodic USGS polling so alerts work across all routes (no dedicated page needed)
  useEffect(() => {
    const controller = new AbortController()
    async function pollUSGS() {
      try {
        const params = new URLSearchParams({
          format: 'geojson',
          orderby: 'time',
          limit: '100',
          starttime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // last 2 hours
          endtime: new Date().toISOString(),
        })
        const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`, { signal: controller.signal })
        if (!res.ok) return
        const data = await res.json()
        if (!Array.isArray(data.features)) return
        for (const feature of data.features) {
          const id = feature.id
          if (!id || seenRef.current.has(id)) continue
          const mag = feature.properties?.mag ?? null
          const payload: IncomingAlert = {
            id,
            type: 'earthquake',
            title: feature.properties?.title || (mag != null ? `M${mag} Earthquake` : 'Earthquake'),
            description: feature.properties?.place,
            magnitude: mag ?? undefined,
            place: feature.properties?.place,
            time: feature.properties?.time || Date.now(),
            coordinates: feature.geometry?.coordinates || [],
          }
          await handleIncoming(payload)
        }
      } catch {}
    }
    pollUSGS()
    const interval = setInterval(pollUSGS, 60_000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [])

  // Periodic Flood polling using Open-Meteo Flood API
  useEffect(() => {
    const controller = new AbortController()
    const sites = [
      { key: 'yangon', name: 'Myanmar — Yangon', lat: 16.7875, lon: 96.1421 },
      { key: 'mandalay', name: 'Myanmar — Mandalay (Ayeyarwady)', lat: 21.9588, lon: 96.0891 },
      { key: 'naypyidaw', name: 'Myanmar — Nay Pyi Taw (Sittoung basin)', lat: 19.7633, lon: 96.0785 },
      { key: 'bago', name: 'Myanmar — Bago', lat: 17.3367, lon: 96.4797 },
    ]
    function sevFromQ(q: number | null | undefined): 'high' | 'medium' | 'low' {
      if (q == null) return 'low'
      if (q >= 5000) return 'high'
      if (q >= 2000) return 'medium'
      return 'low'
    }
    async function pollFloods() {
      try {
        const reqs = sites.map(async (s) => {
          const url = new URL('https://flood-api.open-meteo.com/v1/flood')
          url.searchParams.set('latitude', String(s.lat))
          url.searchParams.set('longitude', String(s.lon))
          url.searchParams.set('daily', 'river_discharge')
          const res = await fetch(url.toString(), { signal: controller.signal })
          if (!res.ok) return null
          const data = await res.json()
          const times: string[] | undefined = data?.daily?.time
          const discharge: number[] | undefined = data?.daily?.river_discharge
          if (!times || !discharge || times.length === 0) return null
          const idx = times.length - 1
          const t = Date.parse(times[idx])
          const q = discharge[idx] as number
          const sev = sevFromQ(q)
          if (sev === 'low') return null
          const id = `flood-${s.key}-${t}`
          if (seenRef.current.has(id)) return null
          const payload: IncomingAlert = {
            id,
            type: 'flood',
            title: `Flood risk — ${s.name}`,
            description: `River discharge ${Math.round(q)} m³/s`,
            magnitude: q,
            place: s.name,
            time: t,
            coordinates: [s.lon, s.lat],
            severity: sev,
          }
          await handleIncoming(payload)
          return null
        })
        await Promise.all(reqs)
      } catch {}
    }
    pollFloods()
    const interval = setInterval(pollFloods, 30 * 60 * 1000)
    return () => { controller.abort(); clearInterval(interval) }
  }, [])

  const sev = curr?.severity || 'low'
  const isEq = curr?.type === 'earthquake'
  const icon = isEq ? <AlertTriangle className="w-16 h-16" /> : <Droplets className="w-16 h-16" />
  const iconColor = sev === 'high' ? 'text-red-600' : sev === 'medium' ? 'text-amber-500' : 'text-blue-600'
  const headerBg = sev === 'high' ? 'bg-red-50' : sev === 'medium' ? 'bg-amber-50' : 'bg-blue-50'
  const magnitudeFragment = curr?.magnitude != null
    ? isEq
      ? `M${curr.magnitude?.toFixed(1)}`
      : `Q${Math.round(curr.magnitude!)} m³/s`
    : ''

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <div className={`-mt-4 -mx-6 px-6 pt-6 pb-4 ${headerBg} border-b`}> 
          <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${headerBg}`}>
            <div className={iconColor}>{icon}</div>
          </div>
        </div>
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-semibold">
            {isEq ? 'Earthquake Alert' : 'Flood Alert'} {magnitudeFragment && `• ${magnitudeFragment}`}
          </DialogTitle>
        </DialogHeader>
        <div className="text-center space-y-2">
          {curr?.title && <div className="font-medium">{curr.title}</div>}
          <div className="text-sm text-muted-foreground">
            {curr?.description || curr?.place}
          </div>
          {curr?.time && (
            <div className="text-xs text-gray-500 flex items-center gap-1 justify-center">
              <Clock className="w-3 h-3" /> {formatTime(curr.time)}
            </div>
          )}
        </div>
        <div className="flex justify-center pt-2">
          <button
            className="inline-flex items-center justify-center rounded-md bg-black text-white px-4 py-2 text-sm"
            onClick={() => setOpen(false)}
          >
            Dismiss
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DisasterToasts

