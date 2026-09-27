import 'server-only'

import { normalizeWhatsAppNumber } from '@/lib/whatsapp'

/** 公開 Beta 預設開放；部署者仍可明確關閉。 */
export function isPublicSignupEnabled(): boolean {
  return !isInviteTestingMode() && process.env.PUBLIC_SIGNUP_ENABLED !== 'false'
}

/** 公開 Beta 預設容許自助重設密碼。 */
export function isPasswordResetEnabled(): boolean {
  return process.env.PASSWORD_RESET_ENABLED !== 'false'
}

/** 可選的私有邀請模式；不決定一般帳號是否取得測試資料。 */
export function isInviteTestingMode(): boolean {
  return process.env.INVITE_TESTING_MODE === 'true'
}

/** 測試 workspace 的 WhatsApp 一律送往此號碼，不使用畫面上的示範學生號碼。 */
export function getTestWhatsAppOverride(): string | null {
  const number = normalizeWhatsAppNumber(process.env.TEST_WHATSAPP_OVERRIDE_NUMBER)
  return number || null
}
