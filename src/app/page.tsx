"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MapPin, 
  Plus, 
  AlertTriangle, 
  Shield, 
  Users, 
  Building,
  Navigation,
  Upload,
  X,
  Check,
  Clock,
  Eye,
  Lock,
  Loader2,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import {
  createPin,
  fetchPins,
  updatePinStatus,
  isUserActiveTracker,
  getUserOrgMember,
  fetchItems,
  createPinItems,
  fetchPinsWithItems,
  updatePinItemQuantity,
  type Pin as SupabasePin,
  type Item,
  type PinItem 
} from "@/services/pins";
import { analyzePin } from "@/lib/ai/analyzePin";
import type { AISuggestion } from "@/lib/ai/types";

// Add Mapbox GL JS
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Set Mapbox access token from env (client-exposed)
const mapboxToken =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;

if (!mapboxToken) {
  console.warn("Mapbox token missing. Set NEXT_PUBLIC_MAPBOX_TOKEN.");
} else {
  mapboxgl.accessToken = mapboxToken;
}

interface Pin {
  id: string;
  type: "damaged" | "safe";
  status: "pending" | "confirmed" | "completed";
  phone: string;
  description: string;
  lat: number;
  lng: number;
  createdBy: string;
  createdAt: Date;
  image?: string;
  assignedTo?: string;
  user_id?: string;
  items?: {
    peopleHurt?: number;
    foodPacks?: number;
    waterBottles?: number;
    medicineBox?: number;
    clothesPacks?: number;
    blankets?: number;
  };
}

// Define User interface to match useAuth hook
interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "tracking_volunteer" | "supply_volunteer" | "user";
  accountType?: 'user' | 'organization';
}

export default function HomePage() {
  const { t, language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [pins, setPins] = useState<Pin[]>([]);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinType, setPinType] = useState<"damaged" | "safe">("damaged");
  const [pinPhone, setPinPhone] = useState("");
  const [pinDescription, setPinDescription] = useState("");
  const [pinImage, setPinImage] = useState<File | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 16.8409,
    lng: 96.1735,
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [newPinLocation, setNewPinLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [aiGateChecking, setAiGateChecking] = useState(false);
  const [isUserTracker, setIsUserTracker] = useState(false);
  const [userOrgMemberId, setUserOrgMemberId] = useState<string | null>(null);
  const [showConfirmPinDialog, setShowConfirmPinDialog] = useState(false);
  const [showPinListDialog, setShowPinListDialog] = useState(false);
  const [pinToConfirm, setPinToConfirm] = useState<Pin | null>(null);
    const [trackerSelectedItems, setTrackerSelectedItems] = useState<Map<string, number>>(new Map());
  // AI suggestion states (Add Pin dialog)
  const [aiSuggestAdd, setAiSuggestAdd] = useState<AISuggestion | null>(null);
  const [aiLoadingAdd, setAiLoadingAdd] = useState(false);
  const [aiErrorAdd, setAiErrorAdd] = useState<string | null>(null);
  // AI suggestion states (Confirm Pin dialog)
  const [aiSuggestConfirm, setAiSuggestConfirm] = useState<AISuggestion | null>(null);
  const [aiLoadingConfirm, setAiLoadingConfirm] = useState(false);
  const [aiErrorConfirm, setAiErrorConfirm] = useState<string | null>(null);
  // Cached base64 images for AI
  const [aiAddImageB64, setAiAddImageB64] = useState<string | undefined>(undefined);
  const [aiAddImageMime, setAiAddImageMime] = useState<string | undefined>(undefined);
  const [aiConfirmImageB64, setAiConfirmImageB64] = useState<string | undefined>(undefined);
  const [aiConfirmImageMime, setAiConfirmImageMime] = useState<string | undefined>(undefined);
  
  // Items from database
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
  
  const [emergencyKitItems, setEmergencyKitItems] = useState<Record<string, boolean>>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('emergencyKitItems')
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch (e) {
          console.error('Failed to parse emergency kit items:', e)
        }
      }
    }
    return {
      water: false,
      food: false,
      flashlight: false,
      firstAid: false,
      batteries: false,
      radio: false,
      whistle: false,
      dustMask: false,
      plasticSheeting: false,
      ductTape: false,
      canOpener: false,
      localMaps: false,
      cellPhone: false,
      charger: false,
      cash: false,
      importantDocuments: false,
      warmClothing: false,
      blankets: false,
      tools: false,
      sanitation: false,
    }
  });

  // Mapbox map reference
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const tempMarker = useRef<mapboxgl.Marker | null>(null);
  // Ref to avoid stale closure in map click handler
  const isSelectingLocationRef = useRef(false);
  // Route drawing refs
  const routeIds = useRef({ source: "tracker-route", layer: "tracker-route-layer" });
  const routePopup = useRef<mapboxgl.Popup | null>(null);
  
  const formatDuration = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} h ${m} m` : `${h} h`;
  };
  const [activeRoutePinId, setActiveRoutePinId] = useState<string | null>(null);

  // Heuristic: decide if an AI suggestion looks like a rescue request
  const isRescueRelated = (s: AISuggestion | null | undefined) => {
    if (!s) return false;
    const kw = [
      "injury",
      "injured",
      "collapse",
      "collapsed",
      "trapped",
      "rescue",
      "help",
      "urgent",
      "medical",
      "fire",
      "flood",
      "earthquake",
      "building",
      "damage",
      "accident",
      "bleeding",
    ];
    const hasCat = s.categories?.some((c) => kw.includes(c.toLowerCase()));
    const hasItems = (s.items?.length || 0) > 0;
    const severe = (s.severity || 0) >= 0.4;
    return !!(hasCat || hasItems || severe);
  };

  // Type-safe user role check
  const userRole = (user as User)?.role;

  // Move filteredPins declaration here, before the useEffect that uses it
  const filteredPins = pins.filter((pin) => {
    if (userRole === "supply_volunteer") {
      return pin.status === "confirmed" && pin.type === "damaged";
    }
    return true;
  });

  // Load pins and items from database on mount and when user changes
  useEffect(() => {
    const loadPinsAndUserRole = async () => {
      try {
        // Fetch pins from database
        const pinsResult = await fetchPins();
        if (pinsResult.success && pinsResult.pins) {
          setPins(pinsResult.pins);
          console.log(`Loaded ${pinsResult.pins.length} pins from database`);
        } else if (!pinsResult.success) {
          console.warn("Failed to load pins:", pinsResult.error);
          if (pinsResult.error) {
            toast({
              title: "Warning",
              description: `Could not load pins: ${pinsResult.error}`,
              variant: "destructive",
            });
          }
        }

        // Fetch items from database
        const itemsResult = await fetchItems();
        if (itemsResult.success && itemsResult.items) {
          setAvailableItems(itemsResult.items);
          console.log(`Loaded ${itemsResult.items.length} items from database`);
        }

        // Check if current user is a tracker
        if (user?.id) {
          try {
            const isTracker = await isUserActiveTracker(user.id);
            setIsUserTracker(isTracker);
            console.log(`User tracker status: ${isTracker}`);

            if (isTracker) {
              const orgMember = await getUserOrgMember(user.id);
              if (orgMember) {
                setUserOrgMemberId(orgMember.id);
                console.log(`User org-member ID: ${orgMember.id}`);
              }
            }
          } catch (err) {
            console.error("Error checking tracker status:", err);
          }
        }
      } catch (error) {
        console.error("Error loading pins and user role:", error);
      }
    };

    loadPinsAndUserRole();
  }, [user?.id, toast]);

  useEffect(() => {
    // Initialize Mapbox map
    if (!map.current && mapContainer.current) {
      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [mapCenter.lng, mapCenter.lat],
          zoom: 12,
        });

        // Add navigation control
        map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

        // Handle map load
        map.current.on("load", () => {
          setMapLoading(false);

          // Get user's current location
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const location = {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                };
                setUserLocation(location);
                setMapCenter(location);

                // Update map center
                if (map.current) {
                  map.current.flyTo({
                    center: [location.lng, location.lat],
                    zoom: 14,
                  });

                  // Add user location marker
                  userMarker.current = new mapboxgl.Marker({
                    color: "#3B82F6",
                  })
                    .setLngLat([location.lng, location.lat])
                    .addTo(map.current!);
                }
              },
              (error) => {
                console.error("Error getting location:", error);
              }
            );
          }
        });

        // Handle map click for selecting new pin location
        map.current.on("click", (e) => {
          if (isSelectingLocationRef.current) {
            const { lng, lat } = e.lngLat;
            setNewPinLocation({ lat, lng });

            // Remove previous temp marker
            if (tempMarker.current) {
              tempMarker.current.remove();
            }

            // Add temp marker
            tempMarker.current = new mapboxgl.Marker({
              color: "#9333EA",
            })
              .setLngLat([lng, lat])
              .addTo(map.current!);
          }
        });

        // Handle map error
        map.current.on("error", (e) => {
          console.error("Mapbox error:", e);
          setMapError("Failed to load map. Please try again later.");
          setMapLoading(false);
        });

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
          if (map.current) {
            map.current.resize();
          }
        });

        if (mapContainer.current) {
          resizeObserver.observe(mapContainer.current);
        }

        return () => {
          resizeObserver.disconnect();
        };
      } catch (error) {
        console.error("Error initializing map:", error);
        setMapError("Failed to initialize map. Please try again later.");
        setMapLoading(false);
      }
    }

    return () => {
      // Clean up map on unmount
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Keep ref in sync and visually indicate selection mode
  useEffect(() => {
    isSelectingLocationRef.current = isSelectingLocation;
    if (map.current) {
      const canvas = map.current.getCanvas();
      canvas.style.cursor = isSelectingLocation ? "crosshair" : "";
    }
  }, [isSelectingLocation]);

  // Helpers to manage route on the map
  const clearRoute = () => {
    if (!map.current) return;
    const { source, layer } = routeIds.current;
    if (map.current.getLayer(layer)) {
      map.current.removeLayer(layer);
    }
    if (map.current.getSource(source)) {
      map.current.removeSource(source);
    }
    if (routePopup.current) {
      routePopup.current.remove();
      routePopup.current = null;
    }
    setActiveRoutePinId(null);
  };

  const fitToLine = (coords: [number, number][]) => {
    if (!map.current || coords.length === 0) return;
    let minX = coords[0][0], minY = coords[0][1], maxX = coords[0][0], maxY = coords[0][1];
    for (const [x, y] of coords) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    map.current.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 700 });
  };

  const drawRoute = (coordinates: [number, number][]) => {
    if (!map.current) return;
    const { source, layer } = routeIds.current;
    const data = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates,
          },
          properties: {},
        },
      ],
    } as GeoJSON.FeatureCollection;

    if (map.current.getSource(source)) {
      (map.current.getSource(source) as mapboxgl.GeoJSONSource).setData(data as any);
    } else {
      map.current.addSource(source, { type: "geojson", data });
      map.current.addLayer({
        id: layer,
        type: "line",
        source,
        paint: {
          "line-color": "#2563eb",
          "line-width": 5,
          "line-opacity": 0.85,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });
    }
    fitToLine(coordinates);
  };

  const showRouteToPin = async (pin: Pin) => {
    try {
      if (!map.current) {
        toast({ title: "Map not ready", description: "Please wait for the map to load.", variant: "destructive" });
        return;
      }
      if (!userLocation) {
        toast({ title: "Location required", description: "Get your current location first.", variant: "destructive" });
        return;
      }
      clearRoute();

      const token = (mapboxgl as any).accessToken as string | undefined;
      const from = `${userLocation.lng},${userLocation.lat}`;
      const to = `${pin.lng},${pin.lat}`;

      if (token) {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from};${to}?geometries=geojson&overview=full&access_token=${token}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const coords: [number, number][] | undefined = json?.routes?.[0]?.geometry?.coordinates;
          const distanceMeters: number | undefined = json?.routes?.[0]?.distance;
          const durationSeconds: number | undefined = json?.routes?.[0]?.duration;
          if (coords && coords.length) {
            drawRoute(coords);
            setActiveRoutePinId(pin.id);
            // Place a tiny popup around the midpoint with distance and duration
            const midIdx = Math.floor(coords.length / 2);
            const mid = coords[midIdx];
            if (map.current && mid) {
              const distKm = distanceMeters ? distanceMeters / 1000 : undefined;
              const html = `
                <div style="min-width:220px;max-width:280px;padding:8px 10px;border-radius:10px;background:#ffffff;color:#0f172a;border:1px solid #e5e7eb;box-shadow:0 8px 20px rgba(0,0,0,0.12);font-size:12px;line-height:1.2;">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                    <span style="display:inline-block;width:6px;height:6px;background:#2563eb;border-radius:9999px;"></span>
                    <span style="font-weight:600;">Route Info</span>
                  </div>
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <div><strong>Distance:</strong> ${distKm !== undefined ? distKm.toFixed(2) : "-"} km</div>
                    <div><strong>ETA:</strong> ${durationSeconds !== undefined ? formatDuration(durationSeconds) : "-"}</div>
                  </div>
                </div>`;
              if (routePopup.current) {
                routePopup.current.setLngLat(mid as any).setHTML(html).addTo(map.current);
              } else {
                routePopup.current = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "260px", anchor: "bottom", offset: 12 })
                  .setLngLat(mid as any)
                  .setHTML(html)
                  .addTo(map.current);
              }
            }
            return;
          }
        }
      }
      // Fallback: draw straight line
      const fallbackCoords: [number, number][] = [
        [userLocation.lng, userLocation.lat],
        [pin.lng, pin.lat],
      ];
      drawRoute(fallbackCoords);
      setActiveRoutePinId(pin.id);
      // Compute haversine distance and an approximate duration (40km/h)
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371; // km
      const dLat = toRad(pin.lat - userLocation.lat);
      const dLon = toRad(pin.lng - userLocation.lng);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(userLocation.lat)) * Math.cos(toRad(pin.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distKm = R * c;
      const durationSeconds = (distKm / 40) * 3600; // approx driving
      const mid: [number, number] = [(userLocation.lng + pin.lng) / 2, (userLocation.lat + pin.lat) / 2];
      if (map.current) {
        const html = `
          <div style="min-width:220px;max-width:280px;padding:8px 10px;border-radius:10px;background:#ffffff;color:#0f172a;border:1px solid #e5e7eb;box-shadow:0 8px 20px rgba(0,0,0,0.12);font-size:12px;line-height:1.2;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="display:inline-block;width:6px;height:6px;background:#2563eb;border-radius:9999px;"></span>
              <span style="font-weight:600;">Route Info</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div><strong>Distance:</strong> ${distKm.toFixed(2)} km</div>
              <div><strong>ETA:</strong> ~${formatDuration(durationSeconds)}</div>
            </div>
          </div>`;
        if (routePopup.current) {
          routePopup.current.setLngLat(mid as any).setHTML(html).addTo(map.current);
        } else {
          routePopup.current = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "260px", anchor: "bottom", offset: 12 })
            .setLngLat(mid as any)
            .setHTML(html)
            .addTo(map.current);
        }
      }
    } catch (e) {
      console.warn("Failed to draw route, drawing straight line", e);
      if (userLocation) {
        const fallbackCoords: [number, number][] = [
          [userLocation.lng, userLocation.lat],
          [pin.lng, pin.lat],
        ];
        drawRoute(fallbackCoords);
        setActiveRoutePinId(pin.id);
        // Same fallback metrics
        const toRad = (d: number) => (d * Math.PI) / 180;
        const R = 6371; // km
        const dLat = toRad(pin.lat - userLocation.lat);
        const dLon = toRad(pin.lng - userLocation.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(userLocation.lat)) * Math.cos(toRad(pin.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distKm = R * c;
        const durationSeconds = (distKm / 40) * 3600; // approx driving
        const mid: [number, number] = [(userLocation.lng + pin.lng) / 2, (userLocation.lat + pin.lat) / 2];
        if (map.current) {
          const html = `
            <div style="min-width:220px;max-width:280px;padding:8px 10px;border-radius:10px;background:#ffffff;color:#0f172a;border:1px solid #e5e7eb;box-shadow:0 8px 20px rgba(0,0,0,0.12);font-size:12px;line-height:1.2;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="display:inline-block;width:6px;height:6px;background:#2563eb;border-radius:9999px;"></span>
                <span style="font-weight:600;">Route Info</span>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div><strong>Distance:</strong> ${distKm.toFixed(2)} km</div>
                <div><strong>ETA:</strong> ~${formatDuration(durationSeconds)}</div>
              </div>
            </div>`;
          if (routePopup.current) {
            routePopup.current.setLngLat(mid as any).setHTML(html).addTo(map.current);
          } else {
            routePopup.current = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "260px", anchor: "bottom", offset: 12 })
              .setLngLat(mid as any)
              .setHTML(html)
              .addTo(map.current);
          }
        }
      }
    }
  };

  // Debounced AI suggestion for Add Pin dialog based on description
  useEffect(() => {
    if (!showPinDialog) return;
    const desc = pinDescription.trim();
    if (desc.length < 8) {
      setAiSuggestAdd(null);
      setAiErrorAdd(null);
      return;
    }
    const handle = setTimeout(async () => {
      setAiLoadingAdd(true);
      setAiErrorAdd(null);
      const allowed = availableItems.map((it) => it.name);
      const s = await analyzePin({ description: desc, imageBase64: aiAddImageB64, imageMime: aiAddImageMime, allowedItems: allowed });
      if (!s) setAiErrorAdd("No suggestions");
      setAiSuggestAdd(s);
      setAiLoadingAdd(false);
      // Auto-apply for trackers only if nothing selected yet
      if (isUserTracker && s && trackerSelectedItems.size === 0) {
        applySuggestedItemsToTracker(s);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [pinDescription, showPinDialog, aiAddImageB64, aiAddImageMime, isUserTracker, trackerSelectedItems.size, availableItems]);

  // AI suggestion for Confirm Pin dialog when opened
  useEffect(() => {
    if (!showConfirmPinDialog || !pinToConfirm) return;
    const desc = pinToConfirm.description?.trim();
    if (!desc || desc.length < 4) {
      setAiSuggestConfirm(null);
      setAiErrorConfirm(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAiLoadingConfirm(true);
      setAiErrorConfirm(null);
      const allowed = availableItems.map((it) => it.name);
      const s = await analyzePin({ description: desc, imageBase64: aiConfirmImageB64, imageMime: aiConfirmImageMime, allowedItems: allowed });
      if (!cancelled) {
        if (!s) setAiErrorConfirm("No suggestions");
        setAiSuggestConfirm(s || null);
        setAiLoadingConfirm(false);
        // Auto-apply if nothing selected yet
        if (s && selectedItems.size === 0) {
          applySuggestedItemsToConfirm(s);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showConfirmPinDialog, pinToConfirm, aiConfirmImageB64, aiConfirmImageMime, selectedItems.size, availableItems]);

  // Convert Add Pin selected image to base64 for AI (once per file)
  useEffect(() => {
    if (!pinImage) {
      setAiAddImageB64(undefined);
      setAiAddImageMime(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      const b64 = comma >= 0 ? res.slice(comma + 1) : res;
      setAiAddImageB64(b64);
      setAiAddImageMime(pinImage.type || "image/jpeg");
    };
    reader.readAsDataURL(pinImage);
  }, [pinImage]);

  // Convert Confirm Pin image URL to base64 for AI when dialog opens
  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!showConfirmPinDialog || !pinToConfirm?.image) {
        setAiConfirmImageB64(undefined);
        setAiConfirmImageMime(undefined);
        return;
      }
      try {
        const resp = await fetch(pinToConfirm.image);
        const blob = await resp.blob();
        if (aborted) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (aborted) return;
          const res = reader.result as string;
          const comma = res.indexOf(",");
          const b64 = comma >= 0 ? res.slice(comma + 1) : res;
          setAiConfirmImageB64(b64);
          setAiConfirmImageMime(blob.type || "image/jpeg");
        };
        reader.readAsDataURL(blob);
      } catch {
        if (!aborted) {
          setAiConfirmImageB64(undefined);
          setAiConfirmImageMime(undefined);
        }
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [showConfirmPinDialog, pinToConfirm?.image]);

  const applySuggestedItemsToTracker = (suggest: AISuggestion | null) => {
    if (!suggest || availableItems.length === 0) return;
    const map = new Map<string, number>();
    const lowerName = (s: string) => s.toLowerCase();
    const matchId = (name: string) => {
      const ln = lowerName(name);
      // simple synonyms
      const synonyms: Record<string, string[]> = {
        "water bottles": ["water", "bottles", "water bottle"],
        "first aid": ["firstaid", "first-aid", "aid"],
        "medicine box": ["medicine", "med box", "medical"],
        blankets: ["blanket"],
      };
      const candidates = [ln, ...Object.entries(synonyms).flatMap(([k, arr]) => (k === ln ? arr : []))];
      const found = availableItems.find((it) => {
        const ain = it.name.toLowerCase();
        return candidates.some((c) => ain.includes(c));
      });
      return found?.id;
    };
    suggest.items.forEach((it) => {
      const id = matchId(it.name);
      if (id) map.set(id, (map.get(id) || 0) + Math.max(1, it.qty));
    });
    if (map.size > 0) setTrackerSelectedItems(map);
  };

  const applySuggestedItemsToConfirm = (suggest: AISuggestion | null) => {
    if (!suggest || availableItems.length === 0) return;
    const map = new Map<string, number>();
    const lowerName = (s: string) => s.toLowerCase();
    const matchId = (name: string) => {
      const ln = lowerName(name);
      const synonyms: Record<string, string[]> = {
        "water bottles": ["water", "bottles", "water bottle"],
        "first aid": ["firstaid", "first-aid", "aid"],
        "medicine box": ["medicine", "med box", "medical"],
        blankets: ["blanket"],
      };
      const candidates = [ln, ...Object.entries(synonyms).flatMap(([k, arr]) => (k === ln ? arr : []))];
      const found = availableItems.find((it) => {
        const ain = it.name.toLowerCase();
        return candidates.some((c) => ain.includes(c));
      });
      return found?.id;
    };
    suggest.items.forEach((it) => {
      const id = matchId(it.name);
      if (id) map.set(id, (map.get(id) || 0) + Math.max(1, it.qty));
    });
    if (map.size > 0) setSelectedItems(map);
  };

  // Update markers when pins change
  useEffect(() => {
    if (!map.current || mapLoading) return;

    // Remove all existing markers
    Object.values(markers.current).forEach((marker) => marker.remove());
    markers.current = {};

    // Add markers for each pin
    filteredPins.forEach((pin) => {
      // Create marker element
      const el = document.createElement("div");
      el.className = "cursor-pointer";
      el.setAttribute("data-pin-id", pin.id);

      // Create marker based on pin type
      const markerDiv = document.createElement("div");
      markerDiv.className = `w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${
        pin.type === "damaged" ? "bg-red-500" : "bg-green-500"
      }`;

      // Add icon
      const icon = document.createElement("div");
      if (pin.type === "damaged") {
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      } else {
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
      }
      markerDiv.appendChild(icon);

      // Add status indicator
      const statusDiv = document.createElement("div");
      statusDiv.className = `absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-white ${
        pin.status === "pending"
          ? "bg-yellow-400"
          : pin.status === "confirmed"
          ? "bg-green-400"
          : "bg-blue-400"
      }`;

      el.appendChild(markerDiv);
      el.appendChild(statusDiv);

      // Create popup
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
      }).setHTML(`
        <div class="p-2">
          <div class="font-semibold">${pin.phone}</div>
          <div class="text-sm text-gray-600">${pin.description}</div>
          <div class="mt-1">
            <span class="text-xs px-2 py-1 rounded-full ${
              pin.status === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : pin.status === "confirmed"
                ? "bg-green-100 text-green-800"
                : "bg-blue-100 text-blue-800"
            }">${pin.status}</span>
          </div>
        </div>
      `);

      // Create marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([pin.lng, pin.lat])
        .setPopup(popup)
        .addTo(map.current!);

      // Add click event
      el.addEventListener("click", () => {
        setSelectedPin(pin);
      });

      // Store marker reference
      markers.current[pin.id] = marker;
    });
  }, [filteredPins, mapLoading]);

  const handleGetCurrentLocation = () => {
    setIsGettingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserLocation(location);
          setMapCenter(location);

          // Update map center
          if (map.current) {
            map.current.flyTo({
              center: [location.lng, location.lat],
              zoom: 14,
            });

            // Update user marker
            if (userMarker.current) {
              userMarker.current.setLngLat([location.lng, location.lat]);
            } else {
              userMarker.current = new mapboxgl.Marker({
                color: "#3B82F6",
              })
                .setLngLat([location.lng, location.lat])
                .addTo(map.current!);
            }
          }

          setIsGettingLocation(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsGettingLocation(false);
        }
      );
    }
  };

  const handleCreatePin = async () => {
    if (!pinPhone || !pinDescription) return;
    setAiGateChecking(true);
    // For normal users reporting damaged locations, gate by AI relevance
    if (!isUserTracker && pinType === "damaged") {
      try {
        let s = aiSuggestAdd;
        if (!s) {
          const allowed = availableItems.map((it) => it.name);
          s = await analyzePin({
            description: pinDescription.trim(),
            imageBase64: aiAddImageB64,
            imageMime: aiAddImageMime,
            allowedItems: allowed,
          });
          setAiSuggestAdd(s);
        }
        if (!isRescueRelated(s)) {
          toast({
            title: "Not a rescue request",
            description:
              "Please describe an actual disaster/urgent help situation and add a relevant photo.",
            variant: "destructive",
          });
          setAiGateChecking(false);
          return;
        }
      } catch (e) {
        console.warn("AI relevance check failed; proceeding without gate.", e);
      }
    }
    // For normal users reporting safe zones, ensure it doesn't look like an emergency
    if (!isUserTracker && pinType === "safe") {
      try {
        let s = aiSuggestAdd;
        if (!s) {
          const allowed = availableItems.map((it) => it.name);
          s = await analyzePin({
            description: pinDescription.trim(),
            imageBase64: aiAddImageB64,
            imageMime: aiAddImageMime,
            allowedItems: allowed,
          });
          setAiSuggestAdd(s);
        }
        if (isRescueRelated(s)) {
          toast({
            title: "Looks like an emergency",
            description: "Please switch to Damaged Location for emergency reports.",
            variant: "destructive",
          });
          setAiGateChecking(false);
          return;
        }
      } catch (e) {
        console.warn("AI safe-zone check failed; proceeding without gate.", e);
      }
    }

    setAiGateChecking(false);
    setIsCreatingPin(true);
    try {
      // Use selected location or map center
      const location = newPinLocation || mapCenter;

      // Call Supabase service to create pin with user role for status determination
      const result = await createPin(
        {
          type: pinType,
          status: "pending", // Will be set by database based on user role
          phone: pinPhone,
          description: pinDescription,
          lat: location.lat,
          lng: location.lng,
          createdBy: user?.name || "Anonymous User",
          user_id: user?.id ?? null,
          image: undefined,
        },
        pinImage || undefined,
        (user as User)?.accountType === 'organization' ? 'organization' : user?.role
      );

      if (result.success && result.pin) {
        console.log('✅ Pin created:', result.pin.id);

        // If user is a tracker and has selected items, create pin_items
        if (isUserTracker && trackerSelectedItems.size > 0) {
          console.log('📝 Tracker creating pin items:', trackerSelectedItems);
          
          const itemsToCreate = Array.from(trackerSelectedItems.entries()).map(([itemId, quantity]) => ({
            item_id: itemId,
            requested_qty: quantity,
          }));

          const itemsResult = await createPinItems(result.pin.id, itemsToCreate);
          
          if (!itemsResult.success) {
            console.error('❌ Failed to create pin items:', itemsResult.error);
            toast({
              title: "Warning",
              description: `Pin created but items not recorded: ${itemsResult.error}`,
              variant: "destructive",
            });
          } else {
            console.log('✅ Pin items created successfully');
            toast({
              title: "Success",
              description: "Pin created with requested items",
            });
          }
          
          // Reset tracker items
          setTrackerSelectedItems(new Map());
        } else if (isUserTracker) {
          toast({
            title: "Success",
            description: "Pin created (no items selected)",
          });
        } else {
          toast({
            title: "Success",
            description: "Pin created successfully",
          });
        }

        // Add new pin to local state
        setPins([result.pin, ...pins]);

        // Reset form
        setPinPhone("");
        setPinDescription("");
        setPinImage(null);
        setShowPinDialog(false);
        setNewPinLocation(null);
        setIsSelectingLocation(false);

        // Remove temp marker
        if (tempMarker.current) {
          tempMarker.current.remove();
          tempMarker.current = null;
        }

        // Fly to new pin location
        if (map.current) {
          map.current.flyTo({
            center: [result.pin.lng, result.pin.lat],
            zoom: 14,
          });
        }

        toast({
          title: "Success",
          description: "Pin created successfully",
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create pin",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error creating pin:", error);
      toast({
        title: "Error",
        description: "Failed to create pin",
        variant: "destructive",
      });
    } finally {
      setIsCreatingPin(false);
    }
  };

  const handleConfirmPin = async (pinId: string) => {
    try {
      // Verify user is authenticated and is a tracker before attempting confirmation
      if (!user?.id) {
        toast({
          title: "Error",
          description: "You must be logged in to confirm pins",
          variant: "destructive",
        });
        return;
      }

      if (!isUserTracker) {
        toast({
          title: "Error",
          description: "Only trackers can confirm pins",
          variant: "destructive",
        });
        return;
      }

      const result = await updatePinStatus(
        pinId,
        "confirmed",
        userOrgMemberId || undefined,
        user.id
      );

      if (result.success) {
        setPins(
          pins.map((pin) =>
            pin.id === pinId ? { ...pin, status: "confirmed" } : pin
          )
        );
        toast({
          title: "Success",
          description: "Pin confirmed successfully",
          variant: "success"
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to confirm pin",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error confirming pin:", error);
      toast({
        title: "Error",
        description: "Failed to confirm pin",
        variant: "destructive",
      });
    }
  };

  const handleDenyPin = (pinId: string) => {
    setPins(pins.filter((pin) => pin.id !== pinId));
  };

  const handleMarkCompleted = async (pinId: string) => {
    try {
      // Verify user is authenticated and is a tracker
      if (!user?.id) {
        toast({
          title: "Error",
          description: "You must be logged in to update pins",
          variant: "destructive",
        });
        return;
      }

      if (!isUserTracker) {
        toast({
          title: "Error",
          description: "Only trackers can mark pins as completed",
          variant: "destructive",
        });
        return;
      }

      const result = await updatePinStatus(
        pinId,
        "completed",
        undefined,
        user.id
      );

      if (result.success) {
        setPins(
          pins.map((pin) =>
            pin.id === pinId ? { ...pin, status: "completed" } : pin
          )
        );
        toast({
          title: "Success",
          description: "Pin marked as completed",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to mark pin as completed",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error marking pin completed:", error);
      toast({
        title: "Error",
        description: "Failed to mark pin as completed",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "completed":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="w-3 h-3" />;
      case "confirmed":
        return <Check className="w-3 h-3" />;
      case "completed":
        return <Shield className="w-3 h-3" />;
      default:
        return null;
    }
  };

  // Get nearby unconfirmed pins (within 5km radius)
  const getNearbyUnconfirmedPins = () => {
    if (!userLocation) return [];
    
    return pins.filter((pin) => {
      if (pin.status !== "pending") return false;
      
      // Calculate distance using Haversine formula
      const R = 6371; // Earth's radius in km
      const dLat = ((pin.lat - userLocation.lat) * Math.PI) / 180;
      const dLon = ((pin.lng - userLocation.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((userLocation.lat * Math.PI) / 180) *
          Math.cos((pin.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      
      return distance <= 5; // 5km radius
    });
  };

  const handleConfirmPinClick = () => {
    if (!userLocation) {
      alert("Please get your current location first");
      return;
    }
    setShowPinListDialog(true);
  };

  const handleSelectPinToConfirm = (pin: Pin) => {
    setPinToConfirm(pin);
    setShowPinListDialog(false);
    setShowConfirmPinDialog(true);
    // Reset selected items
    setSelectedItems(new Map());
  };

  const handleItemToggle = (itemId: string, quantity: number) => {
    const newSelected = new Map(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.set(itemId, quantity);
    }
    setSelectedItems(newSelected);
  };

  const handleItemQuantityChange = (itemId: string, quantity: number) => {
    const newSelected = new Map(selectedItems);
    if (quantity > 0) {
      newSelected.set(itemId, quantity);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleConfirmPinWithItems = async () => {
    if (!pinToConfirm) return;

    try {
      // First, confirm the pin status
      const result = await updatePinStatus(
        pinToConfirm.id,
        "confirmed",
        userOrgMemberId || undefined,
        user?.id
      );

      if (result.success) {
        // Then, create pin items records for selected items
        if (selectedItems.size > 0) {
          const itemsToCreate = Array.from(selectedItems.entries()).map(([itemId, quantity]) => ({
            item_id: itemId,
            requested_qty: quantity,
          }));

          const itemsResult = await createPinItems(pinToConfirm.id, itemsToCreate);

          if (!itemsResult.success) {
            console.warn("Warning: Pin confirmed but items not created:", itemsResult.error);
          }
        }

        // Update local state
        setPins(
          pins.map((pin) =>
            pin.id === pinToConfirm.id
              ? { ...pin, status: "confirmed" as const }
              : pin
          )
        );

        setShowConfirmPinDialog(false);
        setPinToConfirm(null);
        setSelectedItems(new Map());

        toast({
          title: "Success",
          description: "Pin confirmed with items recorded",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to confirm pin",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error confirming pin with items:", error);
      toast({
        title: "Error",
        description: "Failed to confirm pin",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Area */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="max-w-7xl mx-auto pb-4">
              <div className={`flex flex-col sm:flex-row items-center gap-2 w-full`}>
                <Button
                  variant="outline"
                  size={isUserTracker ? "sm" : "default"}
                  onClick={handleGetCurrentLocation}
                  disabled={isGettingLocation}
                  className={`flex items-center lg:gap-2 w-full sm:flex-1 ${isUserTracker ? "" : "h-12 sm:h-10"}`}
                >
                  <Navigation className="w-5 h-5" />
                  {t("map.currentLocation")}
                </Button>
                
                {isUserTracker && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleConfirmPinClick}
                    className="flex items-center lg:gap-2 bg-green-600 text-white hover:bg-green-700 w-full sm:flex-1 h-10"
                  >
                    <Check className="w-5 h-5" />
                    Confirm Pin
                  </Button>
                )}

                <Dialog
                  open={showPinDialog}
                  onOpenChange={(open) => {
                    setShowPinDialog(open);
                    if (!open) {
                      setNewPinLocation(null);
                      setIsSelectingLocation(false);
                      if (tempMarker.current) {
                        tempMarker.current.remove();
                        tempMarker.current = null;
                      }
                    }
                  }}
                >
                  {/* Hide "Add Pin" button for organizations - they only manage pins */}
                  {(user as User)?.accountType !== 'organization' && (
                    <DialogTrigger asChild>
                      <Button
                        size={isUserTracker ? "sm" : "default"}
                        className={`flex items-center gap-2 bg-black w-full sm:flex-1 ${isUserTracker ? "h-10" : "h-12 sm:h-10"}`}
                      >
                        <Plus className="w-4 h-4" />
                        {t("map.addPin")}
                      </Button>
                    </DialogTrigger>
                  )}
                  <DialogContent className="w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto my-6 p-4 sm:p-6">
                    <DialogHeader>
                      <DialogTitle className="text-lg sm:text-xl">{t("map.title")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Select
                          value={pinType}
                          onValueChange={(value: "damaged" | "safe") =>
                            setPinType(value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="damaged">
                              {t("map.damagedLocation")}
                            </SelectItem>
                            <SelectItem value="safe">
                              {t("map.safeZone")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="pin-title" className="mb-2">
                          Phone No
                        </Label>
                        <Input
                          id="pin-title"
                          value={pinPhone}
                          onChange={(e) => setPinPhone(e.target.value)}
                          placeholder="Enter Phone..."
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="pin-description" className="mb-2">
                          {t("map.description")}
                        </Label>
                        <Textarea
                          id="pin-description"
                          value={pinDescription}
                          onChange={(e) => setPinDescription(e.target.value)}
                          placeholder="Describe the situation..."
                          rows={3}
                        />
                        {aiLoadingAdd && (
                          <div className="mt-2 text-xs text-gray-500">Analyzing description…</div>
                        )}
                        {!aiLoadingAdd && aiSuggestAdd && (
                          <div className="mt-2 border rounded-lg p-3 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium">AI Suggestions</div>
                              <div
                                className={`text-xs px-2 py-0.5 rounded ${
                                  aiSuggestAdd.severity >= 0.8
                                    ? "bg-red-100 text-red-700"
                                    : aiSuggestAdd.severity >= 0.5
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                Severity: {Math.round(aiSuggestAdd.severity * 100)}%
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 mb-2">
                              Categories: {aiSuggestAdd.categories.join(", ")}
                            </div>
                            <div className="text-xs">
                              {aiSuggestAdd.items.length > 0 ? (
                                <ul className="list-disc ml-5">
                                  {aiSuggestAdd.items.map((it, idx) => (
                                    <li key={idx}>{it.name} × {it.qty}</li>
                                  ))}
                                </ul>
                              ) : (
                                <div>No items suggested.</div>
                              )}
                            </div>
                            {/* {isUserTracker && (
                              <div className="mt-2 flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => applySuggestedItemsToTracker(aiSuggestAdd)}>
                                  Apply Suggestions
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setAiSuggestAdd(null)}>
                                  Dismiss
                                </Button>
                              </div>
                            )} */}
                          </div>
                        )}
                        {!aiLoadingAdd && aiErrorAdd && (
                          <div className="mt-2 text-xs text-gray-400">{aiErrorAdd}</div>
                        )}

                        {/* Non-tracker rescue gating notice for Damaged */}
                        {!isUserTracker && pinType === "damaged" && aiSuggestAdd && !isRescueRelated(aiSuggestAdd) && (
                          <Alert className="mt-2 border-red-300">
                            <AlertDescription className="text-xs text-red-700">
                              This report doesn't look like a disaster rescue request. Please add more relevant details or a clear photo.
                            </AlertDescription>
                          </Alert>
                        )}
                        {/* Non-tracker gating for Safe Zone when description looks like an emergency */}
                        {!isUserTracker && pinType === "safe" && aiSuggestAdd && isRescueRelated(aiSuggestAdd) && (
                          <Alert className="mt-2 border-yellow-300">
                            <AlertDescription className="text-xs text-yellow-800">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  This looks like an emergency situation. Please switch to "Damaged Location" or adjust the description/photo.
                                </div>
                                <Button size="sm" variant="outline" onClick={() => setPinType("damaged")}>
                                  Switch to Damaged
                                </Button>
                              </div>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="pin-image" className="mb-2">
                          {t("map.uploadImage")}
                        </Label>
                        <Input
                          id="pin-image"
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            setPinImage(e.target.files?.[0] || null)
                          }
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsSelectingLocation(true);
                            setShowPinDialog(false);
                          }}
                          className="flex-1"
                        >
                          <MapPin className="w-4 h-4 mr-2" />
                          {newPinLocation ? "Change Location" : "Select on Map"}
                        </Button>
                      </div>

                      {newPinLocation && (
                        <div className="text-sm text-gray-600">
                          Selected location: {newPinLocation.lat.toFixed(6)},{" "}
                          {newPinLocation.lng.toFixed(6)}
                        </div>
                      )}

                      {/* Tracker: Requested Items UI */}
                      {isUserTracker && (
                        <div className="space-y-3 border-t pt-4">
                          <Label className="text-sm font-medium">Select Requested Items</Label>
                          <div className="max-h-48 overflow-y-auto space-y-2">
                            {availableItems.length > 0 ? (
                              availableItems.map((item) => (
                                <div key={item.id} className="flex items-center gap-3 p-2 border rounded-lg">
                                  <input
                                    type="checkbox"
                                    id={`tracker-item-${item.id}`}
                                    checked={trackerSelectedItems.has(item.id)}
                                    onChange={() => {
                                      const newSelected = new Map(trackerSelectedItems);
                                      if (newSelected.has(item.id)) {
                                        newSelected.delete(item.id);
                                      } else {
                                        newSelected.set(item.id, 10);
                                      }
                                      setTrackerSelectedItems(newSelected);
                                    }}
                                    className="w-4 h-4"
                                  />
                                  <Label htmlFor={`tracker-item-${item.id}`} className="flex-1 cursor-pointer text-xs">
                                    {item.name} <span className="text-xs text-gray-500">({item.unit})</span>
                                  </Label>
                                  {trackerSelectedItems.has(item.id) && (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 w-6 p-0"
                                        onClick={() => {
                                          const qty = Math.max(0, (trackerSelectedItems.get(item.id) || 0) - 1);
                                          const newSelected = new Map(trackerSelectedItems);
                                          if (qty > 0) {
                                            newSelected.set(item.id, qty);
                                          } else {
                                            newSelected.delete(item.id);
                                          }
                                          setTrackerSelectedItems(newSelected);
                                        }}
                                        disabled={(trackerSelectedItems.get(item.id) || 0) === 0}
                                      >
                                        -
                                      </Button>
                                      <span className="w-8 text-center text-xs">{trackerSelectedItems.get(item.id) || 0}</span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 w-6 p-0"
                                        onClick={() => {
                                          const qty = (trackerSelectedItems.get(item.id) || 0) + 1;
                                          const newSelected = new Map(trackerSelectedItems);
                                          newSelected.set(item.id, qty);
                                          setTrackerSelectedItems(newSelected);
                                        }}
                                      >
                                        +
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-500 text-center py-2">No items available</p>
                            )}
                          </div>
                        </div>
                      )}
                    
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCreatePin}
                          className="flex-1"
                          disabled={
                            isCreatingPin ||
                            aiGateChecking ||
                            (!isUserTracker && pinType === "damaged" && !!aiSuggestAdd && !isRescueRelated(aiSuggestAdd)) ||
                            (!isUserTracker && pinType === "safe" && !!aiSuggestAdd && isRescueRelated(aiSuggestAdd))
                          }
                        >
                          {aiGateChecking ? (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Validating...
                            </div>
                          ) : isCreatingPin ? (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Creating...
                            </div>
                          ) : (
                            t("map.submit")
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowPinDialog(false)}
                          disabled={isCreatingPin}
                        >
                          {t("map.cancel")}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Card className="h-full min-h-[800px] py-0">
              <CardContent className="p-0 h-full relative">
                {/* Mapbox Map */}
                <div
                  ref={mapContainer}
                  className="h-full w-full rounded-lg overflow-hidden"
                />

                {/* Map Loading State */}
                {mapLoading && (
                  <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading map...</p>
                    </div>
                  </div>
                )}

                {/* Map Error State */}
                {mapError && (
                  <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
                    <div className="text-center max-w-md p-4">
                      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <p className="text-gray-600">{mapError}</p>
                      <Button
                        onClick={() => window.location.reload()}
                        className="mt-4"
                      >
                        Reload Page
                      </Button>
                    </div>
                  </div>
                )}
                    
                {/* Location Selection Indicator */}
                {isSelectingLocation && (
                  <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 z-10 max-w-xs">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-purple-600" />
                      <p className="text-sm">
                        Click on the map to select a location for your pin
                      </p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setIsSelectingLocation(false);
                          setShowPinDialog(true);
                        }}
                      >
                        Done
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNewPinLocation(null);
                          if (tempMarker.current) {
                            tempMarker.current.remove();
                            tempMarker.current = null;
                          }
                          setIsSelectingLocation(false);
                          setShowPinDialog(true);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                  
                  {/* Map Legend */}
                <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-10">
                    <h3 className="text-sm font-semibold mb-2">Legend</h3>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-4 h-4 bg-red-500 rounded-full" />
                        <span>{t("map.damagedLocation")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-4 h-4 bg-green-500 rounded-full" />
                        <span>{t("map.safeZone")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                        <span>{t("map.pending")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 bg-green-400 rounded-full" />
                        <span>{t("map.confirmed")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 bg-blue-400 rounded-full" />
                        <span>{t("map.completed")}</span>
                      </div>
                    </div>
                  </div>
              </CardContent>
            </Card>
          </div>

          {/* Side Panel */}
          <div className="space-y-6 mt-[50px] sm:mt-0">
            {/* Quick Stats */}
            <Card className="sm:mt-0 mt-[100px]">
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {pins.filter((p) => p.type === "damaged").length}
                    </div>
                    <div className="text-sm text-gray-600">Damaged Areas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {pins.filter((p) => p.type === "safe").length}
                    </div>
                    <div className="text-sm text-gray-600">Safe Zones</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Pins */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredPins.slice(0, 5).map((pin) => (
                    <div
                      key={pin.id}
                      className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        setSelectedPin(pin);
                        // Fly to pin location on map
                        if (map.current) {
                          map.current.flyTo({
                            center: [pin.lng, pin.lat],
                            zoom: 15,
                          });
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {pin.type === "damaged" ? (
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            ) : (
                              <Shield className="w-4 h-4 text-green-500" />
                            )}
                            <span className="font-medium text-sm">
                              {pin.type === "damaged" ? "Damaged Location" : "Safe Zone"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {pin.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge
                              className={`text-xs ${getStatusColor(
                                pin.status
                              )}`}
                            >
                              <div className="flex items-center gap-1">
                                {getStatusIcon(pin.status)}
                                <span>{t(`map.${pin.status}`)}</span>
                              </div>
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {pin.createdAt.toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      

                      {userRole === "supply_volunteer" &&
                        pin.status === "confirmed" &&
                        pin.type === "damaged" && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkCompleted(pin.id);
                            }}
                            className="w-full mt-2"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Mark Delivered
                          </Button>
                        )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Emergency Kit Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  Emergency Kit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
                  {[
                    { id: "water", label: "Water (1 gallon per person per day)" },
                    { id: "food", label: "Non-perishable food (3-day supply)" },
                    { id: "flashlight", label: "Flashlight" },
                    { id: "firstAid", label: "First aid supplies" },
                    { id: "batteries", label: "Extra batteries" },
                    { id: "radio", label: "Battery-powered or hand-crank radio" },
                    { id: "whistle", label: "Whistle (to signal for help)" },
                    { id: "dustMask", label: "Dust mask" },
                    { id: "plasticSheeting", label: "Plastic sheeting and duct tape" },
                    { id: "canOpener", label: "Manual can opener" },
                    { id: "localMaps", label: "Local maps" },
                    { id: "cellPhone", label: "Cell phone with charger" },
                    { id: "cash", label: "Cash or traveler's checks" },
                    { id: "importantDocuments", label: "Important documents (copies)" },
                    { id: "warmClothing", label: "Warm clothing and blankets" },
                    { id: "tools", label: "Basic tools (wrench, pliers)" },
                    { id: "sanitation", label: "Sanitation and personal hygiene items" },
                  ].map(({ id, label }) => (
                    <div key={id} className="flex items-center space-x-2">
                      <Checkbox
                        id={id}
                        checked={emergencyKitItems[id] || false}
                        onCheckedChange={(checked) => {
                          const updated = { ...emergencyKitItems, [id]: checked as boolean }
                          setEmergencyKitItems(updated)
                          // Save to localStorage
                          localStorage.setItem('emergencyKitItems', JSON.stringify(updated))
                        }}
                      />
                      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                        {label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Pin Detail Dialog */}
      {selectedPin && (
        <Dialog open={!!selectedPin} onOpenChange={() => setSelectedPin(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedPin.type === "damaged" ? (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                ) : (
                  <Shield className="w-5 h-5 text-green-500" />
                )}
                {selectedPin.phone}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => showRouteToPin(selectedPin)}
                >
                  <Navigation className="w-3 h-3 mr-1" /> Show Route
                </Button>
                {activeRoutePinId === selectedPin.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => clearRoute()}
                  >
                    Clear Route
                  </Button>
                )}
                {isUserTracker && selectedPin.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPinToConfirm(selectedPin);
                      setShowConfirmPinDialog(true);
                      setSelectedPin(null);
                    }}
                  >
                    Select
                  </Button>
                )}
              </div>
              <div>
                <Badge className={`${getStatusColor(selectedPin.status)}`}>
                  <div className="flex items-center gap-1">
                    {getStatusIcon(selectedPin.status)}
                    <span>{t(`map.${selectedPin.status}`)}</span>
                  </div>
                </Badge>
              </div>
              
              <p className="text-gray-700">{selectedPin.description}</p>
              
              {selectedPin.image && (
                <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden">
                  <img 
                    src={selectedPin.image} 
                    alt={selectedPin.phone}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              <div className="text-sm text-gray-500 space-y-1">
                <div>Reported by: {selectedPin.createdBy}</div>
                <div>Time: {selectedPin.createdAt.toLocaleString()}</div>
                {selectedPin.assignedTo && (
                  <div>Assigned to: {selectedPin.assignedTo}</div>
                )}
              </div>
              
              {/* Action buttons - REMOVED: Confirm and Deny buttons no longer needed */}
              <div className="flex gap-2">
                {/* Pins are automatically confirmed when created by trackers/organizations */}

                {userRole === "supply_volunteer" &&
                  selectedPin.status === "confirmed" &&
                  selectedPin.type === "damaged" && (
                    <Button
                      onClick={() => handleMarkCompleted(selectedPin.id)}
                      className="w-full"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Mark Delivered
                    </Button>
                  )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Pin List Dialog for Tracker Volunteers */}
      {isUserTracker && (
        <Dialog open={showPinListDialog} onOpenChange={setShowPinListDialog}>
          <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Nearby Unconfirmed Pins</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {getNearbyUnconfirmedPins().length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No unconfirmed pins found nearby. Please get your current location first.
                </p>
              ) : (
                getNearbyUnconfirmedPins().map((pin) => (
                  <Card
                    key={pin.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSelectPinToConfirm(pin)}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {pin.type === "damaged" ? (
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            ) : (
                              <Shield className="w-4 h-4 text-green-500" />
                            )}
                            <span className="font-medium">{pin.type === "damaged" ? "Damaged Location" : "Safe Zone"}</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2 break-words">{pin.description}</p>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs text-gray-500 flex-wrap">
                            <span className="whitespace-nowrap">Phone: {pin.phone}</span>
                            <span className="whitespace-nowrap">Reporter: {pin.createdBy}</span>
                            <span className="whitespace-nowrap">{pin.createdAt.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              showRouteToPin(pin);
                            }}
                            className="w-full sm:w-auto"
                          >
                            <Navigation className="w-3 h-3 mr-1" /> Route
                          </Button>
                          {activeRoutePinId === pin.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearRoute();
                              }}
                              className="w-full sm:w-auto"
                            >
                              Clear
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="w-full sm:w-auto">
                            Select
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm Pin Dialog */}
      {isUserTracker && pinToConfirm && (
        <Dialog open={showConfirmPinDialog} onOpenChange={setShowConfirmPinDialog}>
          <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 my-6">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg sm:text-xl">Confirm Pin Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Action Buttons */}
              <div className="flex gap-2 justify-end flex-wrap">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => pinToConfirm && showRouteToPin(pinToConfirm)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-xs sm:text-sm"
                >
                  <Navigation className="w-3 h-3 mr-1" /> Show Route
                </Button>
                {activeRoutePinId === pinToConfirm.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => clearRoute()}
                    className="text-xs sm:text-sm"
                  >
                    Clear Route
                  </Button>
                )}
              </div>

              {/* Pin Details Card */}
              <div className="bg-linear-to-br from-blue-50 via-white to-purple-50 rounded-xl p-5 shadow-sm border border-blue-100">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-blue-200">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-800">Report Details</h3>
                </div>

                <div className="grid gap-3 sm:gap-4">
                  {/* Phone */}
                  <div className="flex flex-col sm:flex-row items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-500 mb-1">Contact Number</div>
                      <div className="text-sm font-semibold text-gray-900">{pinToConfirm.phone}</div>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-500 mb-1">Current Status</div>
                      <Badge className={getStatusColor(pinToConfirm.status)}>
                        {pinToConfirm.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-500 mb-1">Description</div>
                      <div className="text-sm text-gray-700 leading-relaxed">{pinToConfirm.description}</div>
                    </div>
                  </div>

                  {/* Reporter */}
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-500 mb-1">Reported By</div>
                      <div className="text-sm font-medium text-gray-900">{pinToConfirm.createdBy}</div>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-500 mb-1">Report Time</div>
                      <div className="text-sm font-medium text-gray-900">{pinToConfirm.createdAt.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Photo */}
                {pinToConfirm.image && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 bg-rose-100 rounded-md flex items-center justify-center">
                        <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-xs font-medium text-gray-500">Attached Photo</span>
                    </div>
                    <div className="w-full h-40 sm:h-56 bg-gray-100 rounded-xl overflow-hidden border-2 border-gray-200 shadow-md">
                      <img
                        src={pinToConfirm.image}
                        alt="Reported photo"
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* AI Suggestions for Confirm */}
              <div className="space-y-2 border-t pt-4">
                  {aiLoadingConfirm && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI analyzing report…</span>
                    </div>
                  )}
                  {!aiLoadingConfirm && aiSuggestConfirm && (
                    <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
                      {/* Header with gradient */}
                      <div className={`p-3 sm:p-4 ${aiSuggestConfirm.severity >= 0.8 ? "bg-red-600" : aiSuggestConfirm.severity >= 0.5 ? "bg-yellow-500" : "bg-green-600"}`}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 text-white">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <span className="font-semibold text-base">AI Suggestions</span>
                          </div>
                          <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm font-medium">
                            {Math.round(aiSuggestConfirm.severity * 100)}% Severity
                          </div>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4 bg-white space-y-3">
                        {/* Categories */}
                        <div className="flex flex-wrap gap-2">
                          {aiSuggestConfirm.categories.map((cat, idx) => (
                            <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                              {cat}
                            </span>
                          ))}
                        </div>

                        {/* Suggested Items */}
                        {aiSuggestConfirm.items.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-700">Recommended Items:</div>
                            <div className="grid gap-2">
                              {aiSuggestConfirm.items.map((it, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-linear-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                      <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                      </svg>
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">{it.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-md border border-gray-300">
                                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="text-sm font-semibold text-gray-800">{it.qty}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-sm text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                            No specific items suggested
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!aiLoadingConfirm && aiErrorConfirm && (
                    <div className="text-sm text-gray-400 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      {aiErrorConfirm}
                    </div>
                  )}
                </div>

              {/* Items from Database */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Select Items Needed</Label>
                
                {availableItems.length > 0 ? (
                  availableItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <input
                        type="checkbox"
                        id={`item-${item.id}`}
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleItemToggle(item.id, 10)}
                        className="w-4 h-4"
                      />
                      <Label htmlFor={`item-${item.id}`} className="flex-1 cursor-pointer">
                        {item.name} <span className="text-xs text-gray-500">({item.unit})</span>
                      </Label>
                      
                      {selectedItems.has(item.id) && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleItemQuantityChange(item.id, Math.max(0, (selectedItems.get(item.id) || 0) - 1))}
                            disabled={(selectedItems.get(item.id) || 0) === 0}
                          >
                            -
                          </Button>
                          <span className="w-12 text-center">{selectedItems.get(item.id) || 0}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleItemQuantityChange(item.id, (selectedItems.get(item.id) || 0) + 1)}
                          >
                            +
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No items available</p>
                )}
              </div>

              {/* Confirm Button */}
              <div className="flex gap-2 pt-4 border-t">
                <Button onClick={handleConfirmPinWithItems} className="flex-1">
                  <Check className="w-4 h-4 mr-2" />
                  Confirm Pin
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowConfirmPinDialog(false);
                    setPinToConfirm(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
