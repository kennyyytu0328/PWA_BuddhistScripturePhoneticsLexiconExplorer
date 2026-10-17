import type { z } from 'zod'
import type {
  IastFileSchema,
  LockFileSchema,
  NoIastEntrySchema,
  SutraSchema,
  SutraSegmentSchema,
  SutraTokenSchema,
  VariantSchema,
} from './schemas.ts'

// 輸入檔型別由 schemas.ts 導出，結構只維護一處
export type SutraToken = z.infer<typeof SutraTokenSchema>
export type SutraSegment = z.infer<typeof SutraSegmentSchema>
export type Variant = z.infer<typeof VariantSchema>
export type Sutra = z.infer<typeof SutraSchema>
export type IastEntry = z.infer<typeof NoIastEntrySchema> & { iast?: string }
export type IastFile = z.infer<typeof IastFileSchema>
export type LockFile = z.infer<typeof LockFileSchema>

export type DefPart = string | { g: string }

export interface DfbSense {
  usg: string | null
  def: DefPart[]
  xr: string[]
}

export interface Char {
  c: string
  py: string
  zy: string
}
