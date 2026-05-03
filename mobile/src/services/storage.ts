import { supabase } from '../lib/supabase'

export async function uploadPinImage(uri: string, pinId: string) {
  const response = await fetch(uri)
  const blob = await response.blob()
  const fileName = `pins/${pinId}_${Date.now()}.jpg`

  const { data, error } = await supabase.storage
    .from('pin-images')
    .upload(fileName, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    })

  if (error || !data) {
    return { success: false, error: error?.message || 'Failed to upload image' }
  }

  const { data: publicData } = supabase.storage.from('pin-images').getPublicUrl(fileName)
  return { success: true, path: data.path, publicUrl: publicData.publicUrl }
}