import Dexie from 'dexie'
import type { EntityTable } from 'dexie'

export interface PrefRow {
  key: string
  value: string
}

type SutraflowDb = Dexie & { prefs: EntityTable<PrefRow, 'key'> }

export const db = new Dexie('sutraflow') as SutraflowDb
db.version(1).stores({ prefs: 'key' })

// Preferences are a convenience: when IndexedDB is unavailable the reader falls back to defaults.
export async function readPref(key: string): Promise<string | null> {
  try {
    return (await db.prefs.get(key))?.value ?? null
  } catch (error) {
    console.error('Failed to read preference:', error)
    return null
  }
}

export async function writePref(key: string, value: string): Promise<void> {
  try {
    await db.prefs.put({ key, value })
  } catch (error) {
    console.error('Failed to save preference:', error)
  }
}
