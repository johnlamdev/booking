export function validateLoginCredentials(email: string, password: string): string | null {
  if (!email) return '請輸入電郵地址'
  if (!/^\S+@\S+\.\S+$/.test(email)) return '電郵地址格式不正確'
  if (password.length < 8) return '密碼至少需要 8 個字元'
  return null
}

/** 不分辨帳號不存在與密碼錯誤，避免透露已註冊 email。 */
export function loginAuthErrorMessage(code?: string): string {
  return code === 'email_not_confirmed'
    ? '此帳號尚未完成電郵確認，請先到收件匣點擊確認連結。'
    : '電郵地址或密碼不正確'
}
