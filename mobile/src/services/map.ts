export async function fetchMapboxRoute(
  startLon: number,
  startLat: number,
  endLon: number,
  endLat: number
) {
  // Use EXPO_PUBLIC_MAPBOX_TOKEN. Fallback to a placeholder if not set, 
  // but it should be set in .env
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
  
  if (!token) {
    throw new Error('Mapbox token is not configured (EXPO_PUBLIC_MAPBOX_TOKEN)')
  }

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startLon},${startLat};${endLon},${endLat}?geometries=geojson&overview=full&access_token=${token}`

  try {
    const response = await fetch(url)
    const json = await response.json()

    if (json.routes && json.routes.length > 0) {
      const route = json.routes[0]
      // Mapbox returns GeoJSON LineString coordinates as [longitude, latitude]
      // React Native Maps Polyline expects { latitude, longitude }
      const coordinates = route.geometry.coordinates.map((coord: number[]) => ({
        latitude: coord[1],
        longitude: coord[0],
      }))

      return {
        success: true,
        coordinates,
        distance: route.distance, // in meters
        duration: route.duration, // in seconds
      }
    }
    return { success: false, error: 'No route found' }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch route' }
  }
}

export async function reverseGeocode(lon: number, lat: number) {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
  if (!token) return { success: false, error: 'Token missing' }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&limit=1`
  try {
    const response = await fetch(url)
    const json = await response.json()
    if (json.features && json.features.length > 0) {
      return { success: true, address: json.features[0].place_name }
    }
    return { success: false, error: 'No address found' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
