import { describe, expect, it } from 'vitest'

import { loginAuthErrorMessage, validateLoginCredentials } from './login'

describe('validateLoginCredentials', () => {
  it('接受測試老師的有效帳密格式', () => {
    expect(validateLoginCredentials('teacher@example.com', 'Example-A7mP')).toBeNull()
  })

  it('拒絕空白或格式錯誤的 email', () => {
    expect(validateLoginCredentials('', 'Example-A7mP')).toBe('請輸入電郵地址')
    expect(validateLoginCredentials('teacher', 'Example-A7mP')).toBe('電郵地址格式不正確')
  })

  it('拒絕太短的密碼', () => {
    expect(validateLoginCredentials('teacher@example.com', 'short')).toBe('密碼至少需要 8 個字元')
  })
})

describe('loginAuthErrorMessage', () => {
  it('只特別提示未確認電郵，其餘錯誤保持一般化', () => {
    expect(loginAuthErrorMessage('email_not_confirmed')).toContain('尚未完成電郵確認')
    expect(loginAuthErrorMessage('invalid_credentials')).toBe('電郵地址或密碼不正確')
    expect(loginAuthErrorMessage()).toBe('電郵地址或密碼不正確')
  })
})
