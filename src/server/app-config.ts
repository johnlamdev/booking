import 'server-only'

import { normalizeWhatsAppNumber } from '@/lib/whatsapp'

/** 公開註冊預設關閉；日後正式開放時必須明確設定為 true。 */
export function isPublicSignupEnabled(): boolean {
  return process.env.PUBLIC_SIGNUP_ENABLED === 'true'
}

/** 邀請測試期由管理員處理密碼，忘記／重設密碼預設關閉。 */
export function isPasswordResetEnabled(): boolean {
  return process.env.PASSWORD_RESET_ENABLED === 'true'
}

/** 邀請測試期內，由管理員建立的全新帳號會取得版本化體驗資料。 */
export function isInviteTestingMode(): boolean {
  return process.env.INVITE_TESTING_MODE !== 'false'
}

/** 測試 workspace 的 WhatsApp 一律送往此號碼，不使用畫面上的示範學生號碼。 */
export function getTestWhatsAppOverride(): string | null {
  const number = normalizeWhatsAppNumber(process.env.TEST_WHATSAPP_OVERRIDE_NUMBER)
  return number || null
}
