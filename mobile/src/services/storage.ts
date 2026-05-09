import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../lib/supabase'

/**
 * Uploads a pin image to Supabase Storage using expo-file-system and base64-arraybuffer.
 *
 * This is the most reliable way to upload files from React Native to Supabase Storage.
 * fetch(uri).blob() often fails on Android standalone builds.
 */
export async function uploadPinImage(uri: string, pinId: string) {
  try {
    console.log('[storage] uploadPinImage — uri:', uri, 'pinId:', pinId)

    // Detect MIME type and extension
    const lowerUri = uri.toLowerCase()
    const isPng = lowerUri.endsWith('.png')
    const contentType = isPng ? 'image/png' : 'image/jpeg'
    const ext = isPng ? 'png' : 'jpg'
    const fileName = `pins/${pinId}_${Date.now()}.${ext}`

    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    })

    if (!base64) {
      console.error('[storage] Failed to read image as base64')
      return { success: false, error: 'Could not read image file' }
    }

    // Convert base64 to ArrayBuffer using base64-arraybuffer
    const arrayBuffer = decode(base64)

    console.log('[storage] Uploading to bucket: pin-images, file:', fileName)

    const { data, error } = await supabase.storage
      .from('pin-images')
      .upload(fileName, arrayBuffer, {
        contentType,
        upsert: true,
      })

    if (error || !data) {
      console.error('[storage] Supabase storage upload error:', error?.message)
      return { success: false, error: error?.message || 'Failed to upload image' }
    }

    console.log('[storage] Upload successful:', data.path)

    const { data: publicData } = supabase.storage
      .from('pin-images')
      .getPublicUrl(fileName)

    console.log('[storage] Generated public URL:', publicData.publicUrl)

    return { 
      success: true, 
      path: data.path, 
      publicUrl: publicData.publicUrl 
    }
  } catch (err: any) {
    console.error('[storage] Unexpected upload exception:', err?.message || err)
    return { 
      success: false, 
      error: err?.message || 'An unexpected error occurred during photo upload' 
    }
  }
}

/**
 * Uploads a user profile image.
 */
export async function uploadProfileImage(uri: string, userId: string) {
  try {
    const lowerUri = uri.toLowerCase()
    const isPng = lowerUri.endsWith('.png')
    const contentType = isPng ? 'image/png' : 'image/jpeg'
    const ext = isPng ? 'png' : 'jpg'
    const fileName = `profiles/${userId}_${Date.now()}.${ext}`

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    })

    if (!base64) return { success: false, error: 'Could not read image file' }

    const arrayBuffer = decode(base64)

    const { data, error } = await supabase.storage
      .from('pin-images')
      .upload(fileName, arrayBuffer, {
        contentType,
        upsert: true,
      })

    if (error || !data) return { success: false, error: error?.message || 'Failed to upload image' }

    const { data: publicData } = supabase.storage
      .from('pin-images')
      .getPublicUrl(fileName)

    return { 
      success: true, 
      path: data.path, 
      publicUrl: publicData.publicUrl 
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Upload failed' }
  }
}