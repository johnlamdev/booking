'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { isPasswordResetEnabled, isPublicSignupEnabled } from '@/server/app-config'

import { createSupabaseServerClient } from './supabase'

export type AuthFormState = {
  error?: string
  notice?: string
  /** 保留使用者已輸入的 email，失敗時不用重打 */
  email?: string
} | null

const credentialsSchema = z.object({
  email: z.string().trim().min(1, '請輸入電郵地址').email('電郵地址格式不正確'),
  password: z.string().min(8, '密碼至少需要 8 個字元'),
})

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? '輸入內容不正確'
}

/**
 * 把 auth provider 的錯誤寫進 server log。
 *
 * 給使用者看的訊息刻意籠統（避免洩露某個 email 是否已註冊），但維運需要
 * 知道真正原因，否則無從診斷。只記錄 provider 的錯誤碼與訊息，
 * **不記錄 email、密碼或 token**（規格 §13.3）。
 */
function logAuthFailure(
  operation: 'signup' | 'request-password-reset' | 'update-password',
  error: { code?: string; status?: number; message: string },
): void {
  console.error(
    `[auth] ${operation} 失敗 code=${error.code ?? 'unknown'} status=${error.status ?? '-'} message=${error.message}`,
  )
}

const resetPasswordSchema = z.object({
  email: z.string().trim().min(1, '請輸入電郵地址').email('電郵地址格式不正確'),
})

const newPasswordSchema = z
  .object({
    password: z.string().min(8, '密碼至少需要 8 個字元'),
    confirmPassword: z.string(),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: '兩次輸入的密碼不一致',
    path: ['confirmPassword'],
  })

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
  if (!isPasswordResetEnabled()) {
    return { error: '邀請測試期間暫停自助重設密碼。請聯絡我們取得協助。', email }
  }
  const parsed = resetPasswordSchema.safeParse({ email })

  if (!parsed.success) {
    return { error: firstError(parsed.error), email }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!appUrl) {
    console.error('[auth] request-password-reset 失敗：缺少 NEXT_PUBLIC_APP_URL')
    return { error: '暫時未能發送重設電郵，請稍後再試。', email }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  })

  if (error) {
    logAuthFailure('request-password-reset', error)
    if (error.code === 'over_email_send_rate_limit') {
      return { error: '重設電郵的發送次數已達上限，請稍後再試。', email }
    }
  }

  // 無論帳號是否存在都顯示相同結果，避免洩露已註冊的電郵地址。
  return {
    notice: '如果這個電郵地址已註冊，你會收到重設密碼連結。請檢查收件匣及垃圾郵件匣。',
    email,
  }
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isPasswordResetEnabled()) {
    return { error: '邀請測試期間暫停修改密碼。請聯絡我們取得協助。' }
  }

  const parsed = newPasswordSchema.safeParse({
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  })

  if (!parsed.success) {
    return { error: firstError(parsed.error) }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: '重設連結無效或已過期，請重新申請。' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    logAuthFailure('update-password', error)
    return { error: '未能更新密碼，連結可能已過期，請重新申請。' }
  }

  await supabase.auth.signOut()
  redirect('/login?reset=success')
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
  if (!isPublicSignupEnabled()) {
    return {
      error: '約課易現正進行邀請測試，暫未開放公開註冊。已獲邀老師請使用我們提供的帳號登入。',
      email,
    }
  }
  const parsed = credentialsSchema.safeParse({
    email,
    password: String(formData.get('password') ?? ''),
  })

  if (!parsed.success) {
    return { error: firstError(parsed.error), email }
  }

  const supabase = await createSupabaseServerClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: appUrl
      ? { emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard` }
      : undefined,
  })

  if (error) {
    logAuthFailure('signup', error)

    // 這些原因與「該 email 是否已註冊」無關，可以據實告知，讓使用者知道怎麼處理
    if (error.code === 'over_email_send_rate_limit') {
      return {
        error: '確認電郵的發送次數已達上限，請稍後再試。',
        email,
      }
    }

    if (error.code === 'email_address_invalid' || error.code === 'email_address_not_authorized') {
      return {
        error:
          '此電郵地址無法接收確認信。Supabase 內建郵件服務只能寄給專案擁有者的地址；' +
          '開發階段請在 Supabase 關閉 email 確認，或設定自己的 SMTP。',
        email,
      }
    }

    if (error.code === 'weak_password') {
      return { error: '密碼強度不足，請改用更複雜的密碼。', email }
    }

    return { error: '註冊失敗，請稍後再試或改用其他電郵地址', email }
  }

  // 專案若開啟 email 確認，signUp 不會回傳 session，需先確認電郵才能登入
  if (!data.session) {
    return {
      notice: '確認電郵已寄出，請到收件匣點擊連結完成註冊，然後回來登入。',
      email,
    }
  }

  redirect('/dashboard')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
