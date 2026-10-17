import { z } from 'zod'

// 建置輸入的結構驗證。token 與段落用 strictObject，鍵名打錯（如 pyy）即報錯；
// 其餘容器保留未列出的中繼欄位（$schemaVersion、sources…），baseText 會原樣寫進 AST。

const nonEmpty = z.string().min(1)

export const SutraTokenSchema = z.strictObject({
  t: nonEmpty,
  lex: nonEmpty.optional(),
  py: nonEmpty.optional(),
  usg: nonEmpty.optional(),
  punct: z.boolean().optional(),
})

export const SutraSegmentSchema = z.strictObject({
  id: nonEmpty,
  tokens: z.array(SutraTokenSchema).min(1),
  vernacular: z.string(),
  themes: z.array(z.string()),
  reflection: z.string(),
})

export const VariantSchema = z.strictObject({
  segment: nonEmpty,
  recitation: nonEmpty,
  cbeta: nonEmpty,
  apparatus: z.string().optional(),
})

export const SutraSchema = z.looseObject({
  id: nonEmpty,
  title: nonEmpty,
  translator: nonEmpty,
  baseText: z.looseObject({ variants: z.array(VariantSchema) }),
  review: z.looseObject({ readings: z.boolean(), editorial: z.boolean() }),
  segments: z.array(SutraSegmentSchema).min(1),
})

const iastEntryBase = {
  lex: nonEmpty,
  tokens: z.array(nonEmpty).min(1),
  segments: z.array(nonEmpty).optional(),
}

export const IastEntrySchema = z.looseObject({ ...iastEntryBase, iast: z.string() })
export const NoIastEntrySchema = z.looseObject(iastEntryBase)

export const IastFileSchema = z.looseObject({
  review: z.looseObject({ iast: z.boolean() }),
  entries: z.array(IastEntrySchema),
  noIast: z.array(NoIastEntrySchema),
})

export const LockFileSchema = z.looseObject({
  segments: z.record(z.string(), z.array(z.looseObject({ t: z.string(), py: z.string() }))),
})
