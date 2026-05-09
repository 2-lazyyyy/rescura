import React, { useRef, useCallback, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'

interface Pin {
  id: string
  latitude: number
  longitude: number
  type: 'damaged' | 'safe'
  description?: string
  status?: string
}

interface MapboxWebViewProps {
  pins?: Pin[]
  userLocation?: { latitude: number; longitude: number } | null
  routeCoordinates?: { latitude: number; longitude: number }[]
  center?: { latitude: number; longitude: number }
  zoom?: number
  onPinPress?: (pinId: string) => void
  onMapPress?: (coords: { latitude: number; longitude: number }) => void
  draggableMarker?: { latitude: number; longitude: number } | null
  draggableMarkerType?: 'damaged' | 'safe'
  onMarkerDragEnd?: (coords: { latitude: number; longitude: number }) => void
  onRegionChangeComplete?: (coords: { latitude: number; longitude: number; latitudeDelta?: number }) => void
  style?: any
}

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''

function buildMapHTML(props: MapboxWebViewProps): string {
  const { pins = [], userLocation, routeCoordinates = [], center, zoom = 12, draggableMarker, draggableMarkerType = 'damaged' } = props

  const defaultCenter = center
    ? [center.longitude, center.latitude]
    : userLocation
    ? [userLocation.longitude, userLocation.latitude]
    : [96.1735, 16.8409]

  const pinsJSON = JSON.stringify(pins)
  const userLocationJSON = userLocation
    ? JSON.stringify([userLocation.longitude, userLocation.latitude])
    : 'null'
  const routeJSON = JSON.stringify(routeCoordinates.map(c => [c.longitude, c.latitude]))
  const centerJSON = JSON.stringify(defaultCenter)
  const draggableMarkerJSON = draggableMarker
    ? JSON.stringify([draggableMarker.longitude, draggableMarker.latitude])
    : 'null'
  const draggableMarkerTypeStr = JSON.stringify(draggableMarkerType)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <script src='https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js'></script>
  <link href='https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css' rel='stylesheet' />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100vw; height: 100vh; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .marker-pin {
      position: relative;
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    }
    .marker-pin.damaged { background: #ef4444; }
    .marker-pin.safe { background: #22c55e; }
    .marker-status {
      position: absolute; bottom: -2px; right: -2px;
      width: 12px; height: 12px; border-radius: 50%;
      border: 1.5px solid white;
    }
    .status-pending { background: #facc15; }
    .status-confirmed { background: #4ade80; }
    .status-other { background: #60a5fa; }
    .marker-user {
      width: 18px; height: 18px; border-radius: 50%;
      background: #3b82f6; border: 3px solid white;
      box-shadow: 0 0 0 4px rgba(59,130,246,0.25);
    }
    .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display: none !important; }
    .mapboxgl-popup-content {
      border-radius: 10px; padding: 10px 14px;
      font-family: -apple-system, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      min-width: 140px;
    }
    .popup-title { font-weight: 700; font-size: 13px; color: #0f172a; }
    .popup-desc { font-size: 12px; color: #64748b; margin-top: 3px; }
    .popup-badge {
      display: inline-block; margin-top: 6px;
      font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600;
    }
    .badge-pending { background: #fef9c3; color: #854d0e; }
    .badge-confirmed { background: #dcfce7; color: #166534; }
    .badge-other { background: #dbeafe; color: #1e40af; }
  </style>
</head>
<body>
  <div id='map'></div>
  <script>
    const TOKEN = '${MAPBOX_TOKEN}';
    const PINS = ${pinsJSON};
    const CENTER = ${centerJSON};
    const USER_LOC = ${userLocationJSON};
    const ROUTE = ${routeJSON};
    const ZOOM = ${zoom};
    const DRAGGABLE_MARKER = ${draggableMarkerJSON};
    const DRAGGABLE_TYPE = ${draggableMarkerTypeStr};

    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: CENTER,
      zoom: ZOOM,
      attributionControl: false
    });

    let theDraggableMarker = null;

    map.on('load', function () {
      // Map click event
      map.on('click', function(e) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'mapClick', latitude: e.lngLat.lat, longitude: e.lngLat.lng })
        );
      });

      // Add zoom and rotation controls to the map.
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      // Region change event
      map.on('moveend', function() {
        const center = map.getCenter();
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'regionChange', latitude: center.lat, longitude: center.lng })
        );
      });
      // User location marker
      if (USER_LOC) {
        const el = document.createElement('div');
        el.className = 'marker-user';
        new mapboxgl.Marker(el).setLngLat(USER_LOC).addTo(map);
      }

      // Pin markers
      PINS.forEach(function(pin) {
        var el = document.createElement('div');

        // Outer wrapper
        var markerDiv = document.createElement('div');
        markerDiv.className = 'marker-pin ' + (pin.type === 'damaged' ? 'damaged' : 'safe');

        // SVG Icon (same as web version)
        var icon = document.createElement('div');
        if (pin.type === 'damaged') {
          icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
        } else {
          icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
        }
        markerDiv.appendChild(icon);

        // Status dot
        var statusDot = document.createElement('div');
        statusDot.className = 'marker-status ' + (
          pin.status === 'pending' ? 'status-pending' :
          pin.status === 'confirmed' ? 'status-confirmed' : 'status-other'
        );
        markerDiv.appendChild(statusDot);
        el.appendChild(markerDiv);

        // Popup
        var badgeClass = pin.status === 'pending' ? 'badge-pending' : pin.status === 'confirmed' ? 'badge-confirmed' : 'badge-other';
        var popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 20 })
          .setHTML(
            '<div class="popup-title">' + (pin.phone || 'Pin') + '</div>' +
            '<div class="popup-desc">' + (pin.description || '') + '</div>' +
            '<span class="popup-badge ' + badgeClass + '">' + (pin.status || 'unknown') + '</span>'
          );

        el.addEventListener('click', function() {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'pinClick', pinId: pin.id })
          );
        });

        new mapboxgl.Marker(el)
          .setLngLat([pin.longitude, pin.latitude])
          .setPopup(popup)
          .addTo(map);
      });

      // Draggable marker
      if (DRAGGABLE_MARKER) {
        var el = document.createElement('div');
        el.className = 'marker-pin ' + (DRAGGABLE_TYPE === 'damaged' ? 'damaged' : 'safe');
        var icon = document.createElement('div');
        if (DRAGGABLE_TYPE === 'damaged') {
          icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
        } else {
          icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
        }
        el.appendChild(icon);

        theDraggableMarker = new mapboxgl.Marker({ element: el, draggable: true })
          .setLngLat(DRAGGABLE_MARKER)
          .addTo(map);
        
        theDraggableMarker.on('dragend', function() {
          const lngLat = theDraggableMarker.getLngLat();
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'markerDragEnd', latitude: lngLat.lat, longitude: lngLat.lng })
          );
        });
      }

      // Route polyline
      if (ROUTE && ROUTE.length > 1) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: ROUTE }
          }
        });
        map.addLayer({
          id: 'route-layer',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#8b5cf6', 'line-width': 4, 'line-opacity': 0.9 }
        });
      }
    });
  </script>
</body>
</html>`
}

export default function MapboxWebView(props: MapboxWebViewProps) {
  const {
    pins = [],
    userLocation,
    routeCoordinates = [],
    center,
    zoom = 12,
    onPinPress,
    onMapPress,
    draggableMarker,
    draggableMarkerType,
    onMarkerDragEnd,
    onRegionChangeComplete,
    style,
  } = props

  const webviewRef = useRef<WebView>(null)

  // Avoid reloading webview on minor prop changes by injecting JS if possible
  useEffect(() => {
    if (webviewRef.current && draggableMarker) {
      webviewRef.current.injectJavaScript(`
        if (typeof theDraggableMarker !== 'undefined' && theDraggableMarker) {
          theDraggableMarker.setLngLat([${draggableMarker.longitude}, ${draggableMarker.latitude}]);
        }
        true;
      `);
    }
  }, [draggableMarker])

  useEffect(() => {
    if (webviewRef.current && center) {
      webviewRef.current.injectJavaScript(`
        if (typeof map !== 'undefined' && map) {
          map.flyTo({ center: [${center.longitude}, ${center.latitude}], zoom: 14, essential: true });
        }
        true;
      `);
    }
  }, [center])

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data)
        if (data.type === 'pinClick' && onPinPress) {
          onPinPress(data.pinId)
        } else if (data.type === 'mapClick' && onMapPress) {
          onMapPress({ latitude: data.latitude, longitude: data.longitude })
        } else if (data.type === 'markerDragEnd' && onMarkerDragEnd) {
          onMarkerDragEnd({ latitude: data.latitude, longitude: data.longitude })
        } else if (data.type === 'regionChange' && onRegionChangeComplete) {
          onRegionChangeComplete({ latitude: data.latitude, longitude: data.longitude })
        }
      } catch {}
    },
    [onPinPress, onMapPress, onMarkerDragEnd, onRegionChangeComplete]
  )

  const html = buildMapHTML(props)

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        source={{ html }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
})
