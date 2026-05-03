import { useState, useEffect } from 'react'
import {
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { theme } from '../src/theme'
import { useSession } from '../src/lib/session'
import { createPin, updatePinImageUrl, fetchItems, createPinItems } from '../src/services/pins'
import { uploadPinImage } from '../src/services/storage'
import { analyzePin, PinSuggestion } from '../src/services/ai'
import { reverseGeocode } from '../src/services/map'

export default function PinComposerScreen() {
  const { user } = useSession()
  const insets = useSafeAreaInsets()

  const [type, setType]               = useState<'damaged' | 'safe'>('damaged')
  const [phone, setPhone]             = useState('')
  const [description, setDescription] = useState('')
  const [latitude, setLatitude]       = useState('')
  const [longitude, setLongitude]     = useState('')
  const [address, setAddress]         = useState<string | null>(null)
  const [imageUri, setImageUri]       = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMime, setImageMime]     = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [availableItems, setAvailableItems] = useState<any[]>([])
  const [aiSuggestion, setAiSuggestion]     = useState<PinSuggestion | null>(null)
  const [selectedItems, setSelectedItems]   = useState<{ item_id: string; name: string; qty: number }[]>([])
  const [isAnalyzing, setIsAnalyzing]       = useState(false)
  const [locating, setLocating]             = useState(false)

  const [mapRegion, setMapRegion] = useState({
    latitude: 16.8661,
    longitude: 96.1951,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  })

  useEffect(() => {
    fetchItems().then((res) => { if (res.success) setAvailableItems(res.items) })
  }, [])

  // Auto-reverse geocode when coordinates change
  useEffect(() => {
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (!isNaN(lat) && !isNaN(lng) && latitude && longitude) {
      reverseGeocode(lng, lat).then((res) => {
        if (res.success) setAddress(res.address)
        else setAddress(null)
      })
    }
  }, [latitude, longitude])

  const useCurrentLocation = async () => {
    setLocating(true)
    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('Location permission required')
      setLocating(false)
      return
    }
    const current = await Location.getCurrentPositionAsync({})
    const pos = { latitude: current.coords.latitude, longitude: current.coords.longitude }
    setLatitude(String(pos.latitude))
    setLongitude(String(pos.longitude))
    setMapRegion((prev) => ({ ...prev, ...pos, latitudeDelta: 0.01, longitudeDelta: 0.01 }))
    setLocating(false)
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
      base64: true,
    })
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
      setImageBase64(result.assets[0].base64 || null)
      setImageMime(result.assets[0].mimeType || 'image/jpeg')
    }
  }

  const handleAnalyze = async () => {
    if (!imageUri) {
      Alert.alert('Photo required', 'Please add a photo first. AI vision is required for accurate analysis.')
      return
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please enter a description first so AI can analyze it.')
      return
    }
    setIsAnalyzing(true)
    try {
      const allowedNames = availableItems.map((i) => i.name)
      const suggestion = await analyzePin({
        description,
        allowedItems: allowedNames,
        imageBase64: imageBase64 || undefined,
        imageMime: imageMime || undefined,
        location: latitude && longitude ? { lat: Number(latitude), lng: Number(longitude) } : undefined,
      })
      setAiSuggestion(suggestion)

      if (suggestion.isValid) {
        const selected = suggestion.items
          .map((sItem) => {
            const dbItem = availableItems.find((i) => i.name.toLowerCase() === sItem.name.toLowerCase())
            return dbItem ? { item_id: dbItem.id, name: dbItem.name, qty: sItem.qty } : null
          })
          .filter(Boolean) as { item_id: string; name: string; qty: number }[]
        setSelectedItems(selected)
      } else {
        setSelectedItems([])
      }
    } catch (err: any) {
      Alert.alert('AI Analysis Failed', err.message || 'Could not analyze description.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const toggleItem = (dbItem: any) => {
    const exists = selectedItems.find((i) => i.item_id === dbItem.id)
    if (exists) setSelectedItems(selectedItems.filter((i) => i.item_id !== dbItem.id))
    else setSelectedItems([...selectedItems, { item_id: dbItem.id, name: dbItem.name, qty: 1 }])
  }

  const updateItemQty = (itemId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.item_id === itemId ? { ...item, qty: Math.max(1, item.qty + delta) } : item
      )
    )
  }

  const onSubmit = async () => {
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (!imageUri) {
      Alert.alert('Photo required', 'Please upload a photo of the incident.')
      return
    }
    if (Number.isNaN(lat) || Number.isNaN(lng) || !latitude || !longitude) {
      Alert.alert('Location required', 'Please set the coordinates or use your current location.')
      return
    }
    setIsSubmitting(true)
    try {
      const result = await createPin({
        type, phone, description,
        latitude: lat, longitude: lng,
        userId: user?.id || null,
        userRole: user?.role || null,
      })
      if (!result.success || !result.pin) throw new Error(result.error || 'Failed to create pin')

      if (selectedItems.length > 0) {
        await createPinItems(result.pin.id, selectedItems.map((i) => ({ item_id: i.item_id, requested_qty: i.qty })))
      }
      if (imageUri) {
        const upload = await uploadPinImage(imageUri, result.pin.id)
        if (upload.success && upload.publicUrl) await updatePinImageUrl(result.pin.id, upload.publicUrl)
      }
      Alert.alert('✅ Success', 'Your pin has been created. Rescue teams have been notified.')
      router.back()
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create pin')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isDamaged = type === 'damaged'

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.pageHeader, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.foreground} />
        </TouchableOpacity>
        <View style={styles.pageHeaderTitle}>
          <Text style={styles.pageHeaderText}>Report Incident</Text>
          <Text style={styles.pageHeaderSub}>
            {isDamaged ? '🆘 Help request' : '✅ Safe location'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Order: Pin Type -> Contact -> Description -> Photo -> Map -> Supplies -> AI Btn */}

        {/* 1. Pin Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Incident Status type</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeCard, isDamaged && styles.typeCardDanger]}
              onPress={() => setType('damaged')}
            >
              <Text style={[styles.typeLabel, isDamaged && styles.typeLabelDanger]}>Damage / Help</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeCard, !isDamaged && styles.typeCardSafe]}
              onPress={() => setType('safe')}
            >
              <Text style={[styles.typeLabel, !isDamaged && styles.typeLabelSafe]}>Safe Area</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Contact number</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="call-outline" size={18} color={theme.colors.mutedForeground} style={styles.inputIcon} />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number (optional)"
              placeholderTextColor={theme.colors.mutedForeground}
              style={styles.input}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* 3. Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Situation description</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the situation and what help is needed…"
              placeholderTextColor={theme.colors.mutedForeground}
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* 4. Photo */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photo (required)</Text>
          {imageUri ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.imageRemove} onPress={() => { setImageUri(null); setImageBase64(null); setImageMime(null); }}>
                <Ionicons name="close-circle" size={26} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageChange} onPress={pickImage}>
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={styles.imageChangeText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoPickerBtn} onPress={pickImage}>
              <Ionicons name="camera-outline" size={28} color={theme.colors.mutedForeground} />
              <Text style={styles.photoPickerText}>Tap to add a photo</Text>
              <Text style={styles.photoPickerHint}>Vision AI uses this for better triage</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 5. Map Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Incident location</Text>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={mapRegion}
              onRegionChangeComplete={setMapRegion}
              onPress={(e) => {
                const coord = e.nativeEvent.coordinate
                setLatitude(String(coord.latitude))
                setLongitude(String(coord.longitude))
              }}
            >
              {latitude && longitude && (
                <Marker
                  coordinate={{ latitude: Number(latitude), longitude: Number(longitude) }}
                  draggable
                  onDragEnd={(e) => {
                    const coord = e.nativeEvent.coordinate
                    setLatitude(String(coord.latitude))
                    setLongitude(String(coord.longitude))
                  }}
                />
              )}
            </MapView>
            <TouchableOpacity style={styles.mapLocateOverlay} onPress={useCurrentLocation}>
              <Ionicons name="locate" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          
          {/* Exact Location Display */}
          <View style={styles.addressBox}>
            <Ionicons name="location" size={16} color={theme.colors.primary} />
            <Text style={styles.addressText} numberOfLines={2}>
              {address || (latitude ? 'Determining address...' : 'Select location on map')}
            </Text>
          </View>

          {/* Coordinates (Small/Subtle) */}
          {latitude && longitude && (
            <Text style={styles.coordText}>
              Coords: {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
            </Text>
          )}
        </View>

        {/* 6. Supplies needed */}
        {availableItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Supplies needed</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {availableItems.map((item) => {
                const selected = selectedItems.find((i) => i.item_id === item.id)
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemChip, selected && styles.itemChipSelected]}
                    onPress={() => toggleItem(item)}
                  >
                    <Text style={[styles.itemChipText, selected && styles.itemChipTextSelected]}>{item.name}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {selectedItems.length > 0 && (
              <View style={styles.qtyList}>
                {selectedItems.map((item) => (
                  <View key={item.item_id} style={styles.qtyRow}>
                    <Text style={styles.qtyName}>{item.name}</Text>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateItemQty(item.item_id, -1)}>
                        <Ionicons name="remove" size={16} color={theme.colors.foreground} />
                      </TouchableOpacity>
                      <Text style={styles.qtyValue}>{item.qty}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateItemQty(item.item_id, 1)}>
                        <Ionicons name="add" size={16} color={theme.colors.foreground} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 7. AI Analysis Button + Result */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.aiBtn, isAnalyzing && styles.aiBtnDisabled]}
            onPress={handleAnalyze}
            disabled={isAnalyzing}
            activeOpacity={0.8}
          >
            {isAnalyzing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="sparkles" size={16} color="#fff" />
            }
            <Text style={styles.aiBtnText}>{isAnalyzing ? 'Analyzing…' : 'Analyze with AI'}</Text>
          </TouchableOpacity>

          {aiSuggestion && (
            <View style={[styles.aiPremiumCard, !aiSuggestion.isValid && styles.aiPremiumCardInvalid]}>
              <View style={[styles.aiCardHeader, !aiSuggestion.isValid && styles.aiCardHeaderInvalid]}>
                <View style={styles.aiHeaderTitleRow}>
                  <Ionicons 
                    name={aiSuggestion.isValid ? "sparkles" : "alert-circle"} 
                    size={16} 
                    color="#fff" 
                  />
                  <Text style={styles.aiHeaderTitle}>
                    {aiSuggestion.isValid ? "AI Analysis Result" : "Invalid Request Detected"}
                  </Text>
                </View>
                {aiSuggestion.isValid && (
                  <View style={styles.aiSeverityBadge}>
                    <Text style={styles.aiSeverityText}>{Math.round(aiSuggestion.severity * 100)}% Severity</Text>
                  </View>
                )}
              </View>

              <View style={styles.aiCardBody}>
                {aiSuggestion.reason && (
                  <Text style={[styles.aiCardReason, !aiSuggestion.isValid && styles.aiCardReasonInvalid]}>
                    {aiSuggestion.reason}
                  </Text>
                )}

                {aiSuggestion.isValid && (
                  <View style={styles.aiAutoSelectNotice}>
                    <View style={styles.aiNoticeIconWrap}>
                      <Ionicons name="checkmark-done" size={14} color="#059669" />
                    </View>
                    <Text style={styles.aiNoticeText}>Supplies have been auto-selected based on analysis.</Text>
                  </View>
                )}

                {aiSuggestion.isValid && aiSuggestion.categories && aiSuggestion.categories.length > 0 && (
                  <View style={styles.aiCatRow}>
                    {aiSuggestion.categories.map((cat: string, idx: number) => (
                      <View key={idx} style={styles.aiCatBadge}>
                        <Text style={styles.aiCatText}>{cat}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting}
        >
          <LinearGradient
            colors={isDamaged ? ['#dc2626', '#b91c1c'] : ['#059669', '#047857']}
            style={styles.submitGradient}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit pin</Text>}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  pageHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: theme.colors.background, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  pageHeaderTitle: { flex: 1, alignItems: 'center' },
  pageHeaderText:  { fontSize: 17, fontWeight: '800', color: theme.colors.foreground },
  pageHeaderSub:   { fontSize: 12, color: theme.colors.mutedForeground, marginTop: 2 },
  content: { padding: 16, gap: 16 },
  section:      { gap: 10, marginBottom: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.card, borderRadius: 16, paddingHorizontal: 14, minHeight: 52, gap: 10 },
  inputIcon: { flexShrink: 0 },
  input:     { flex: 1, fontSize: 15, color: theme.colors.foreground, paddingVertical: 10 },
  textArea:  { minHeight: 100, paddingVertical: 12 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8b5cf6', borderRadius: 14, paddingVertical: 12 },
  aiBtnDisabled: { opacity: 0.5 },
  aiBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  aiPremiumCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e7ff', marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  aiPremiumCardInvalid: { borderColor: '#fee2e2' },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#4f46e5' },
  aiCardHeaderInvalid: { backgroundColor: '#dc2626' },
  aiHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiHeaderTitle: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  aiSeverityBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  aiSeverityText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  aiCardBody: { padding: 16, gap: 12 },
  aiCardReason: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  aiCardReasonInvalid: { color: '#991b1b' },
  aiAutoSelectNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#dcfce7' },
  aiNoticeIconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  aiNoticeText: { flex: 1, fontSize: 13, color: '#065f46', fontWeight: '600' },
  aiCatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aiCatBadge: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#dbeafe' },
  aiCatText: { color: '#1d4ed8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  mapContainer: { height: 260, borderRadius: 24, overflow: 'hidden', borderWidth: 1.5, borderColor: theme.colors.border, marginBottom: 4, position: 'relative' },
  map:          { ...StyleSheet.absoluteFillObject },
  mapLocateOverlay: { position: 'absolute', bottom: 12, right: 12, backgroundColor: theme.colors.background, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  addressBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  addressText: { flex: 1, fontSize: 14, color: theme.colors.foreground, fontWeight: '600' },
  coordText:   { fontSize: 11, color: theme.colors.mutedForeground, textAlign: 'right', marginTop: -4 },
  chipsRow:             { gap: 8, paddingBottom: 4 },
  itemChip:             { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
  itemChipSelected:     { backgroundColor: '#059669', borderColor: '#059669' },
  itemChipText:         { fontSize: 13, fontWeight: '600', color: theme.colors.foreground },
  itemChipTextSelected: { color: '#fff' },
  qtyList:    { gap: 8, marginTop: 4 },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.card, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border },
  qtyName:    { fontWeight: '600', color: theme.colors.foreground, flex: 1 },
  qtyControls:{ flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  qtyValue:   { fontWeight: '800', fontSize: 16, minWidth: 24, textAlign: 'center', color: theme.colors.foreground },
  typeRow:      { flexDirection: 'row', gap: 12 },
  typeCard:     { flex: 1, backgroundColor: theme.colors.card, borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 16, padding: 14, alignItems: 'center' },
  typeCardDanger: { borderColor: '#dc2626', backgroundColor: '#fff5f5' },
  typeCardSafe:   { borderColor: '#059669', backgroundColor: '#f0fdf4' },
  typeLabel:      { fontSize: 14, fontWeight: '800', color: theme.colors.foreground },
  typeLabelDanger:{ color: '#dc2626' },
  typeLabelSafe:  { color: '#059669' },
  imagePreviewWrap:{ position: 'relative', borderRadius: 20, overflow: 'hidden' },
  imagePreview:    { width: '100%', height: 220, borderRadius: 20 },
  imageRemove:     { position: 'absolute', top: 10, right: 10 },
  imageChange:     { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  imageChangeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  photoPickerBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderColor: theme.colors.border, borderStyle: 'dashed', borderRadius: 20, paddingVertical: 32, backgroundColor: theme.colors.card },
  photoPickerText: { fontSize: 16, fontWeight: '700', color: theme.colors.mutedForeground },
  photoPickerHint: { fontSize: 12, color: theme.colors.mutedForeground },
  submitBtn:         { borderRadius: 20, overflow: 'hidden', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.55 },
  submitGradient:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  submitText:        { color: '#fff', fontWeight: '800', fontSize: 17 },
})