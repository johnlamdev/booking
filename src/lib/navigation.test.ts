import { describe, expect, it } from 'vitest'

import { safeNextPath } from './navigation'

describe('safeNextPath', () => {
  it('保留正常的站內路徑、query 與 hash', () => {
    expect(safeNextPath('/dashboard/inquiries?status=PENDING#latest')).toBe(
      '/dashboard/inquiries?status=PENDING#latest',
    )
  })

  it('拒絕絕對 URL 與 protocol-relative URL', () => {
    expect(safeNextPath('https://evil.example')).toBe('/dashboard')
    expect(safeNextPath('//evil.example')).toBe('/dashboard')
  })

  it('拒絕會被瀏覽器解析成外站的反斜線變體', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard')
    expect(safeNextPath('/dashboard\\evil')).toBe('/dashboard')
  })

  it('拒絕非字串與過長輸入', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath(`/${'a'.repeat(2_048)}`)).toBe('/dashboard')
  })
})
