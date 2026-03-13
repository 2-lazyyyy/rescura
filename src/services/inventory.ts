import { supabase } from '@/lib/supabase'

export type SupplyCategory = 'medical' | 'food' | 'water' | 'shelter' | 'equipment' | 'other'

export interface OrganizationSupply {
  id: string
  organizationId: string
  itemId?: string | null
  category: SupplyCategory | string
  name: string
  quantity: number
  unit: string
  location?: string
  expiryDate?: Date
  lastUpdated: Date
  notes?: string
}

export interface SupplyInput {
  category: SupplyCategory | string
  name: string
  quantity: number
  unit: string
  location?: string
  expiryDate?: string | Date
  notes?: string
}

interface OrganizationSupplyRow {
  id: string
  organization_id: string
  item_id: string | null
  category: string | null
  name: string
  quantity: number | null
  unit: string | null
  location: string | null
  expiry_date: string | null
  notes: string | null
  last_updated: string | null
  created_at: string | null
  updated_at: string | null
}

interface SupplyTransactionInput {
  organizationId: string
  supplyId?: string | null
  itemId?: string | null
  pinId?: string | null
  changeQty: number
  direction: 'inbound' | 'outbound' | 'adjustment'
  reason?: string
  actorType?: string
  actorId?: string | null
}

function normalizeSupplyRow(row: OrganizationSupplyRow): OrganizationSupply {
  const lastUpdated = row.last_updated || row.updated_at || row.created_at || new Date().toISOString()

  return {
    id: row.id,
    organizationId: row.organization_id,
    itemId: row.item_id,
    category: row.category || 'other',
    name: row.name,
    quantity: row.quantity ?? 0,
    unit: row.unit || '',
    location: row.location || undefined,
    expiryDate: row.expiry_date ? new Date(row.expiry_date) : undefined,
    lastUpdated: new Date(lastUpdated),
    notes: row.notes || undefined,
  }
}

function toIsoDate(value?: string | Date): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

async function findItemIdByName(name: string, unit?: string): Promise<string | null> {
  if (!name) return null

  const baseQuery = supabase
    .from('items')
    .select('id, unit')
    .ilike('name', name)

  const { data: exactMatches, error: exactError } = unit
    ? await baseQuery.eq('unit', unit).limit(1)
    : await baseQuery.limit(1)

  if (!exactError && exactMatches && exactMatches.length > 0) {
    return exactMatches[0].id
  }

  if (unit) {
    const { data: looseMatches, error: looseError } = await supabase
      .from('items')
      .select('id')
      .ilike('name', name)
      .limit(1)

    if (!looseError && looseMatches && looseMatches.length > 0) {
      return looseMatches[0].id
    }
  }

  return null
}

async function logSupplyTransaction(input: SupplyTransactionInput): Promise<void> {
  if (!input.changeQty) return

  const payload = {
    organization_id: input.organizationId,
    supply_id: input.supplyId ?? null,
    item_id: input.itemId ?? null,
    pin_id: input.pinId ?? null,
    change_qty: input.changeQty,
    direction: input.direction,
    reason: input.reason ?? null,
    actor_type: input.actorType ?? 'organization',
    actor_id: input.actorId ?? null,
    created_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('organization_supply_transactions')
    .insert([payload])

  if (error) {
    console.warn('Failed to log supply transaction:', error.message)
  }
}

export async function fetchOrganizationSupplies(
  organizationId: string
): Promise<{ success: boolean; supplies?: OrganizationSupply[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('organization_supplies')
      .select('*')
      .eq('organization_id', organizationId)
      .order('last_updated', { ascending: false })

    if (error) {
      console.error('Error fetching supplies:', error)
      return { success: false, error: error.message }
    }

    const supplies = (data || []).map((row: OrganizationSupplyRow) => normalizeSupplyRow(row))
    return { success: true, supplies }
  } catch (err) {
    console.error('Error in fetchOrganizationSupplies:', err)
    return { success: false, error: 'Failed to fetch supplies' }
  }
}

export async function createOrganizationSupply(
  organizationId: string,
  input: SupplyInput,
  actor?: { actorType?: string; actorId?: string | null }
): Promise<{ success: boolean; supply?: OrganizationSupply; error?: string }> {
  try {
    const matchedItemId = await findItemIdByName(input.name, input.unit)
    const now = new Date().toISOString()

    const payload = {
      organization_id: organizationId,
      item_id: matchedItemId,
      category: input.category,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      location: input.location || null,
      expiry_date: toIsoDate(input.expiryDate),
      notes: input.notes || null,
      last_updated: now,
      created_at: now,
      updated_at: now,
    }

    const { data, error } = await supabase
      .from('organization_supplies')
      .insert([payload])
      .select('*')
      .maybeSingle()

    if (error || !data) {
      console.error('Error creating supply:', error)
      return { success: false, error: error?.message || 'Failed to create supply' }
    }

    await logSupplyTransaction({
      organizationId,
      supplyId: data.id,
      itemId: data.item_id,
      changeQty: input.quantity,
      direction: 'inbound',
      reason: 'initial_stock',
      actorType: actor?.actorType,
      actorId: actor?.actorId ?? organizationId,
    })

    return { success: true, supply: normalizeSupplyRow(data as OrganizationSupplyRow) }
  } catch (err) {
    console.error('Error in createOrganizationSupply:', err)
    return { success: false, error: 'Failed to create supply' }
  }
}

export async function updateOrganizationSupply(
  organizationId: string,
  supplyId: string,
  input: SupplyInput,
  actor?: { actorType?: string; actorId?: string | null }
): Promise<{ success: boolean; supply?: OrganizationSupply; error?: string }> {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('organization_supplies')
      .select('*')
      .eq('id', supplyId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (fetchError || !existing) {
      console.error('Error fetching supply:', fetchError)
      return { success: false, error: fetchError?.message || 'Supply not found' }
    }

    let itemId = (existing as OrganizationSupplyRow).item_id
    if (input.name && input.name !== (existing as OrganizationSupplyRow).name) {
      const matchedItemId = await findItemIdByName(input.name, input.unit)
      if (matchedItemId) {
        itemId = matchedItemId
      }
    }

    const now = new Date().toISOString()
    const updatePayload = {
      item_id: itemId,
      category: input.category,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      location: input.location || null,
      expiry_date: toIsoDate(input.expiryDate),
      notes: input.notes || null,
      last_updated: now,
      updated_at: now,
    }

    const { data, error } = await supabase
      .from('organization_supplies')
      .update(updatePayload)
      .eq('id', supplyId)
      .eq('organization_id', organizationId)
      .select('*')
      .maybeSingle()

    if (error || !data) {
      console.error('Error updating supply:', error)
      return { success: false, error: error?.message || 'Failed to update supply' }
    }

    const previousQuantity = (existing as OrganizationSupplyRow).quantity ?? 0
    const delta = input.quantity - previousQuantity

    if (delta !== 0) {
      await logSupplyTransaction({
        organizationId,
        supplyId,
        itemId,
        changeQty: delta,
        direction: delta > 0 ? 'inbound' : 'outbound',
        reason: 'manual_update',
        actorType: actor?.actorType,
        actorId: actor?.actorId ?? organizationId,
      })
    }

    return { success: true, supply: normalizeSupplyRow(data as OrganizationSupplyRow) }
  } catch (err) {
    console.error('Error in updateOrganizationSupply:', err)
    return { success: false, error: 'Failed to update supply' }
  }
}

export async function deleteOrganizationSupply(
  organizationId: string,
  supplyId: string,
  actor?: { actorType?: string; actorId?: string | null }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('organization_supplies')
      .select('*')
      .eq('id', supplyId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (fetchError || !existing) {
      console.error('Error fetching supply for delete:', fetchError)
      return { success: false, error: fetchError?.message || 'Supply not found' }
    }

    const { error } = await supabase
      .from('organization_supplies')
      .delete()
      .eq('id', supplyId)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Error deleting supply:', error)
      return { success: false, error: error.message }
    }

    const existingRow = existing as OrganizationSupplyRow
    const existingQuantity = existingRow.quantity ?? 0
    if (existingQuantity !== 0) {
      await logSupplyTransaction({
        organizationId,
        supplyId,
        itemId: existingRow.item_id,
        changeQty: -existingQuantity,
        direction: 'outbound',
        reason: 'delete_supply',
        actorType: actor?.actorType,
        actorId: actor?.actorId ?? organizationId,
      })
    }

    return { success: true }
  } catch (err) {
    console.error('Error in deleteOrganizationSupply:', err)
    return { success: false, error: 'Failed to delete supply' }
  }
}

export async function consumeOrganizationSupplies(
  organizationId: string,
  items: Array<{ itemId?: string | null; itemName: string; unit?: string; quantity: number }>,
  options?: { pinId?: string; actorType?: string; actorId?: string | null }
): Promise<{ success: boolean; warnings?: string[]; error?: string }> {
  try {
    const warnings: string[] = []

    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        continue
      }

      let remaining = item.quantity
      const seenSupplyIds = new Set<string>()
      const supplyRows: OrganizationSupplyRow[] = []

      if (item.itemId) {
        const { data, error } = await supabase
          .from('organization_supplies')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('item_id', item.itemId)
          .order('last_updated', { ascending: true })

        if (error) {
          warnings.push(`Failed to load supplies for ${item.itemName}: ${error.message}`)
        } else {
          (data || []).forEach((row: OrganizationSupplyRow) => {
            supplyRows.push(row)
            seenSupplyIds.add(row.id)
          })
        }
      }

      const { data: nameMatches, error: nameError } = await supabase
        .from('organization_supplies')
        .select('*')
        .eq('organization_id', organizationId)
        .ilike('name', item.itemName)
        .order('last_updated', { ascending: true })

      if (nameError) {
        warnings.push(`Failed to load supplies for ${item.itemName}: ${nameError.message}`)
      } else {
        (nameMatches || []).forEach((row: OrganizationSupplyRow) => {
          if (!seenSupplyIds.has(row.id)) {
            supplyRows.push(row)
            seenSupplyIds.add(row.id)
          }
        })
      }

      if (supplyRows.length === 0) {
        warnings.push(`No inventory found for ${item.itemName}`)
        continue
      }

      for (const supply of supplyRows) {
        if (remaining <= 0) break

        const availableQty = supply.quantity ?? 0
        if (availableQty <= 0) continue

        const consumedQty = Math.min(availableQty, remaining)
        const newQty = availableQty - consumedQty
        const now = new Date().toISOString()

        const { error: updateError } = await supabase
          .from('organization_supplies')
          .update({ quantity: newQty, last_updated: now, updated_at: now })
          .eq('id', supply.id)

        if (updateError) {
          warnings.push(`Failed to update supply ${supply.name}: ${updateError.message}`)
          break
        }

        await logSupplyTransaction({
          organizationId,
          supplyId: supply.id,
          itemId: supply.item_id,
          pinId: options?.pinId ?? null,
          changeQty: -consumedQty,
          direction: 'outbound',
          reason: 'pin_fulfillment',
          actorType: options?.actorType,
          actorId: options?.actorId ?? organizationId,
        })

        remaining -= consumedQty
      }

      if (remaining > 0) {
        warnings.push(`Not enough inventory for ${item.itemName} (short ${remaining})`)
      }
    }

    return { success: true, warnings: warnings.length ? warnings : undefined }
  } catch (err) {
    console.error('Error in consumeOrganizationSupplies:', err)
    return { success: false, error: 'Failed to consume supplies' }
  }
}
