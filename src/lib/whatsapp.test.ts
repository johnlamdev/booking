import { describe, expect, it } from 'vitest'

import { buildWhatsAppUrl, normalizeWhatsAppNumber } from './whatsapp'

describe('WhatsApp Click-to-Chat', () => {
  it('移除國際號碼中的符號及空格', () => {
    expect(normalizeWhatsAppNumber('+852 9123-4567')).toBe('85291234567')
  })

  it('把中文及換行安全地加入預填訊息', () => {
    expect(buildWhatsAppUrl('+852 9123 4567', 'John 你好，\n已確認。')).toBe(
      `https://wa.me/85291234567?text=${encodeURIComponent('John 你好，\n已確認。')}`,
    )
  })

  it('缺少號碼或訊息時不建立連結', () => {
    expect(buildWhatsAppUrl('', '你好')).toBeNull()
    expect(buildWhatsAppUrl('+852 9123 4567', '  ')).toBeNull()
  })
})
