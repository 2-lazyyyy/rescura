"use client"

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

export interface PinMarker {
  lat: number
  lng: number
  type: 'damaged' | 'safe'
  description?: string
}

export interface EventMapModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: string
  longitude?: number | null
  latitude?: number | null
  subtitle?: string
  externalUrl?: string
  pins?: PinMarker[]
}

// Expect token via NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_ACCESS_TOKEN (client-only)
const envToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN

console.log('[Mapbox token]', envToken)

export function EventMapModal({ open, onOpenChange, title, longitude, latitude, subtitle, externalUrl, pins }: EventMapModalProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const pinsMarkersRef = useRef<mapboxgl.Marker[]>([])
  const [loading, setLoading] = useState(false)

  // Initialization and Map Sync
  useEffect(() => {
    if (!open || !mapContainerRef.current || longitude == null || latitude == null || !envToken) return

    const lon = Number(longitude)
    const lat = Number(latitude)

    if (!mapRef.current) {
      setLoading(true)
      mapboxgl.accessToken = envToken
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [lon, lat],
        zoom: 14,
        attributionControl: false
      })

      mapRef.current.on('load', () => {
        setLoading(false)
        mapRef.current?.resize()
      })
    } else {
      mapRef.current.setCenter([lon, lat])
      mapRef.current.resize()
    }

    // Main subject marker
    if (markerRef.current) markerRef.current.remove()
    markerRef.current = new mapboxgl.Marker({ color: '#3b82f6' })
      .setLngLat([lon, lat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<b>${title || 'Subject'}</b><br/>${subtitle || ''}`))
      .addTo(mapRef.current)

    return () => {
      // Logic for cleanup is handled in a separate effect for 'open' changes
    }
  }, [open, longitude, latitude, title, subtitle])

  // Separate Effect for Pins Update
  useEffect(() => {
    if (!mapRef.current || !open) return

    // Clean up old pins
    pinsMarkersRef.current.forEach(m => m.remove())
    pinsMarkersRef.current = []

    // Add new pins
    if (pins && pins.length > 0) {
      pins.forEach(p => {
        const color = p.type === 'damaged' ? '#ef4444' : '#10b981'
        const marker = new mapboxgl.Marker({ color })
          .setLngLat([p.lng, p.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<b>${p.type === 'damaged' ? 'Incident' : 'Safe Zone'}</b><br/>${p.description || ''}`))
          .addTo(mapRef.current!)
        pinsMarkersRef.current.push(marker)
      })
    }
  }, [open, pins])

  // Full cleanup on modal close
  useEffect(() => {
    if (!open && mapRef.current) {
      if (markerRef.current) markerRef.current.remove()
      pinsMarkersRef.current.forEach(m => m.remove())
      mapRef.current.remove()
      mapRef.current = null
      markerRef.current = null
      pinsMarkersRef.current = []
    }
  }, [open])

  const missingToken = !envToken
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title || 'Location Map'}</DialogTitle>
        </DialogHeader>
        {subtitle && <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>}
        {missingToken ? (
          <div className="p-6 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
            Mapbox token missing. Set environment variable NEXT_PUBLIC_MAPBOX_TOKEN.
          </div>
        ) : (
          <div className="relative">
            <div ref={mapContainerRef} className="w-full h-80 rounded-md border" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-md">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {(longitude == null || latitude == null) && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-md p-6 text-sm text-gray-600">
                No coordinates available.
              </div>
            )}
          </div>
        )}
        {externalUrl && (
          <div className="mt-3 text-right">
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline text-blue-600 hover:text-blue-700"
            >
              Open original source ↗
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default EventMapModal