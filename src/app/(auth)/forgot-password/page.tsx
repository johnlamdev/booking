import type { Metadata } from 'next'
import Link from 'next/link'

import { PasswordResetForm } from '@/components/password-reset-form'
import { Button } from '@/components/ui'
import { isPasswordResetEnabled } from '@/server/app-config'
import { requestPasswordResetAction } from '@/server/auth/actions'

export const metadata: Metadata = { title: '重設密碼' }

export default function ForgotPasswordPage() {
  if (!isPasswordResetEnabled()) {
    return (
      <>
        <h1 className="mb-1 text-xl font-semibold text-ink">密碼協助</h1>
        <p className="mb-5 text-sm leading-6 text-ink-muted">
          邀請測試期間暫停自助重設密碼。請聯絡我們處理，或使用獲邀時提供的帳號及密碼登入。
        </p>
        <Link href="/login"><Button className="w-full">返回登入</Button></Link>
      </>
    )
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">忘記密碼？</h1>
      <p className="mb-5 text-sm leading-6 text-ink-muted">
        輸入註冊電郵，我們會寄出安全的密碼重設連結。
      </p>
      <PasswordResetForm mode="request" action={requestPasswordResetAction} />
    </>
  )
}
