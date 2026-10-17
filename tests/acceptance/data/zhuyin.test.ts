import { describe, expect, it } from 'vitest'
import { toZhuyin } from '../../../scripts/lib/zhuyin'

describe('[REQ-DAT-014] 注音轉換', () => {
  it('[REQ-DAT-014] bō rě -> ㄅㄛ ㄖㄜˇ', () => {
    expect(['bō', 'rě'].map(toZhuyin).join(' ')).toBe('ㄅㄛ ㄖㄜˇ')
  })
  it('[REQ-DAT-014] jiù jìng -> ㄐㄧㄡˋ ㄐㄧㄥˋ', () => {
    expect(['jiù', 'jìng'].map(toZhuyin).join(' ')).toBe('ㄐㄧㄡˋ ㄐㄧㄥˋ')
  })
  it('[REQ-DAT-014] zǐ -> ㄗˇ', () => {
    expect(toZhuyin('zǐ')).toBe('ㄗˇ')
  })
  it('[REQ-DAT-014] shì -> ㄕˋ', () => {
    expect(toZhuyin('shì')).toBe('ㄕˋ')
  })
  it('[REQ-DAT-014] yī -> ㄧ（一聲不標調號）', () => {
    expect(toZhuyin('yī')).toBe('ㄧ')
  })
})
