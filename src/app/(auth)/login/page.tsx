import type { Metadata } from 'next'

import { LoginForm } from '@/components/login-form'
import { Alert } from '@/components/ui'
import { safeNextPath } from '@/lib/navigation'
import { isPasswordResetEnabled, isPublicSignupEnabled } from '@/server/app-config'

export const metadata: Metadata = { title: '登入' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Next.js 16 起 searchParams 為 async
  const params = await searchParams
  const rawNext = params.next
  const nextPath = typeof rawNext === 'string' ? safeNextPath(rawNext) : undefined
  const resetSucceeded = params.reset === 'success'
  const invalidLink = params.authError === 'invalid-link'

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">登入</h1>
      <p className="mb-5 text-sm text-ink-muted">管理你的時段與預約查詢</p>
      {resetSucceeded && <Alert tone="notice" className="mb-4">密碼已更新，請使用新密碼登入。</Alert>}
      {invalidLink && (
        <Alert tone="error" className="mb-4">
          電郵確認或重設連結無效或已過期，請重新申請。
        </Alert>
      )}
      <LoginForm
        nextPath={nextPath ?? '/dashboard'}
        publicSignupEnabled={isPublicSignupEnabled()}
        passwordResetEnabled={isPasswordResetEnabled()}
      />
    </>
  )
}
