import type { Metadata } from 'next'
import Link from 'next/link'

import { PasswordResetForm } from '@/components/password-reset-form'
import { Button } from '@/components/ui'
import { isPasswordResetEnabled } from '@/server/app-config'
import { updatePasswordAction } from '@/server/auth/actions'

export const metadata: Metadata = { title: '設定新密碼' }

export default function ResetPasswordPage() {
  if (!isPasswordResetEnabled()) {
    return (
      <>
        <h1 className="mb-1 text-xl font-semibold text-ink">暫停修改密碼</h1>
        <p className="mb-5 text-sm leading-6 text-ink-muted">
          邀請測試期間由管理員協助處理密碼。如未能登入，請聯絡我們。
        </p>
        <Link href="/login"><Button className="w-full">返回登入</Button></Link>
      </>
    )
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">設定新密碼</h1>
      <p className="mb-5 text-sm leading-6 text-ink-muted">請為帳號設定至少 8 個字元的新密碼。</p>
      <PasswordResetForm mode="update" action={updatePasswordAction} />
    </>
  )
}
