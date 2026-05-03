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

export async function fetchUSGSEarthquakes(): Promise<DisasterEvent[]> {
  try {
    const params = new URLSearchParams({
      format: 'geojson',
      orderby: 'time',
      limit: '200',
      starttime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endtime: new Date().toISOString(),
    })
    const res = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data.features)) return []
    
    return data.features.map((feature: any) => {
      const mag = feature.properties?.mag ?? null
      return {
        id: feature.id,
        source: 'usgs',
        type: 'earthquake',
        title: feature.properties?.title || `M${mag} Earthquake`,
        description: feature.properties?.place,
        magnitude: mag,
        place: feature.properties?.place,
        time: feature.properties?.time || Date.now(),
        url: feature.properties?.url,
        coordinates: feature.geometry?.coordinates || [],
        severity: severityFromMagnitude(mag),
        location: feature.properties?.place,
      } as DisasterEvent
    })
  } catch (err) {
    return []
  }
}

export async function fetchFloodAlerts(): Promise<DisasterEvent[]> {
  const sites = [
    { key: 'yangon', name: 'Myanmar — Yangon', lat: 16.7875, lon: 96.1421 },
    { key: 'mandalay', name: 'Myanmar — Mandalay (Ayeyarwady)', lat: 21.9588, lon: 96.0891 },
    { key: 'naypyidaw', name: 'Myanmar — Nay Pyi Taw (Sittoung basin)', lat: 19.7633, lon: 96.0785 },
    { key: 'bago', name: 'Myanmar — Bago', lat: 17.3367, lon: 96.4797 },
  ]
  try {
    const requests = sites.map(async (s) => {
      const res = await fetch(`https://flood-api.open-meteo.com/v1/flood?latitude=${s.lat}&longitude=${s.lon}&daily=river_discharge`)
      if (!res.ok) return null
      const data = await res.json()
      const times = data?.daily?.time
      const discharge = data?.daily?.river_discharge
      if (!times || !discharge || times.length === 0) return null
      
      const idx = times.length - 1
      const t = Date.parse(times[idx])
      const q = discharge[idx] as number
      
      let sev: 'high'|'medium'|'low' = 'low'
      if (q >= 5000) sev = 'high'
      else if (q >= 2000) sev = 'medium'
      
      if (sev === 'low') return null
      
      return {
        id: `flood-${s.key}-${t}`,
        source: 'flood',
        type: 'flood',
        title: `Flood risk — ${s.name}`,
        description: `River discharge ${q.toFixed(0)} m³/s`,
        magnitude: q,
        place: s.name,
        time: t,
        coordinates: [s.lon, s.lat],
        severity: sev,
        location: s.name,
      } as DisasterEvent
    })
    
    const results = await Promise.all(requests)
    return results.filter((e): e is DisasterEvent => !!e)
  } catch (err) {
    return []
  }
}
