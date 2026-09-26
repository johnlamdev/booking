import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthForm } from '@/components/auth-form'
import { Button } from '@/components/ui'
import { isPublicSignupEnabled } from '@/server/app-config'
import { signupAction } from '@/server/auth/actions'

export const metadata: Metadata = { title: '註冊' }

export default function SignupPage() {
  if (!isPublicSignupEnabled()) {
    return (
      <>
        <h1 className="mb-1 text-xl font-semibold text-ink">邀請測試進行中</h1>
        <p className="mb-5 text-sm leading-6 text-ink-muted">
          約課易暫未開放公開註冊。已獲邀老師請使用我們提供的測試帳號及密碼登入。
        </p>
        <Link href="/login"><Button className="w-full">前往登入</Button></Link>
      </>
    )
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-ink">建立帳號</h1>
      <p className="mb-5 text-sm text-ink-muted">幾分鐘內就可以開始收預約查詢</p>
      <AuthForm mode="signup" action={signupAction} />
    </>
  )
}
