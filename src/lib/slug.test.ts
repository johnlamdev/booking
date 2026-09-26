import { describe, expect, it } from 'vitest'

import {
  generateRandomSlug,
  normalizeSlug,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  validateSlug,
} from './slug'

describe('normalizeSlug', () => {
  it('轉為小寫', () => {
    expect(normalizeSlug('AmyPilates')).toBe('amypilates')
  })

  it('去除前後空白', () => {
    expect(normalizeSlug('  amy-pilates  ')).toBe('amy-pilates')
  })

  it('大小寫不同的輸入正規化後相同（達成 case-insensitive 唯一）', () => {
    expect(normalizeSlug('Amy-Pilates')).toBe(normalizeSlug('amy-PILATES'))
  })
})

describe('validateSlug', () => {
  it('接受合法 slug', () => {
    expect(validateSlug('amy-pilates')).toBeNull()
    expect(validateSlug('teacher123')).toBeNull()
    expect(validateSlug('a-b-c')).toBeNull()
  })

  it('驗證前先正規化，故大寫輸入視為合法', () => {
    expect(validateSlug('AmyPilates')).toBeNull()
  })

  it('拒絕空字串與空白', () => {
    expect(validateSlug('')).toBe('EMPTY')
    expect(validateSlug('   ')).toBe('EMPTY')
  })

  it('拒絕過短與過長', () => {
    expect(validateSlug('ab')).toBe('TOO_SHORT')
    expect(validateSlug('a'.repeat(SLUG_MAX_LENGTH + 1))).toBe('TOO_LONG')
    expect(validateSlug('a'.repeat(SLUG_MAX_LENGTH))).toBeNull()
  })

  it('拒絕非法字元', () => {
    expect(validateSlug('amy pilates')).toBe('INVALID_CHARS')
    expect(validateSlug('amy_pilates')).toBe('INVALID_CHARS')
    expect(validateSlug('amy.pilates')).toBe('INVALID_CHARS')
    expect(validateSlug('艾美老師')).toBe('INVALID_CHARS')
  })

  it('含非法字元的系統路由由字元規則擋下（不需列入保留字）', () => {
    expect(validateSlug('_next')).toBe('INVALID_CHARS')
  })

  it('長度不足時先回報長度問題', () => {
    // 長度與字元皆不合格時，長度訊息對使用者更直接
    expect(validateSlug('艾美')).toBe('TOO_SHORT')
  })

  it('拒絕以連字號開頭或結尾', () => {
    expect(validateSlug('-amy')).toBe('EDGE_HYPHEN')
    expect(validateSlug('amy-')).toBe('EDGE_HYPHEN')
  })

  it('拒絕所有保留字', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(validateSlug(reserved), `保留字 ${reserved} 應被拒絕`).toBe('RESERVED')
    }
  })

  it('保留字的大寫形式同樣被拒絕', () => {
    expect(validateSlug('DASHBOARD')).toBe('RESERVED')
    expect(validateSlug('Book')).toBe('RESERVED')
  })

  it('包含保留字但不完全相同者可通過', () => {
    expect(validateSlug('booking-amy')).toBeNull()
    expect(validateSlug('my-dashboard')).toBeNull()
  })
})

describe('generateRandomSlug', () => {
  it('產生的 slug 永遠合法', () => {
    for (let i = 0; i < 200; i++) {
      expect(validateSlug(generateRandomSlug())).toBeNull()
    }
  })

  it('永遠不會撞到保留字', () => {
    for (let i = 0; i < 200; i++) {
      expect(RESERVED_SLUGS.has(generateRandomSlug())).toBe(false)
    }
  })

  it('不含易混淆字元 0 o 1 l i', () => {
    for (let i = 0; i < 200; i++) {
      const suffix = generateRandomSlug().slice(2)
      expect(suffix).not.toMatch(/[01loi]/)
    }
  })

  it('具備足夠隨機性（100 次產生不應大量重複）', () => {
    const generated = new Set(Array.from({ length: 100 }, generateRandomSlug))
    expect(generated.size).toBeGreaterThan(95)
  })
})
