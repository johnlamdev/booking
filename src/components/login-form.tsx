'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'

import { loginAuthErrorMessage, validateLoginCredentials } from '@/lib/login'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

import { Alert, Button, Field } from './ui'

type Props = {
  nextPath: string
  publicSignupEnabled: boolean
  passwordResetEnabled: boolean
}

/**
 * 直接由瀏覽器登入 Supabase，避開 Server Action 的冷啟動及中轉。
 * Supabase SSR browser client 會把 session 寫入 cookie；下一頁仍由伺服器
 * 驗證已簽名 claims，不能靠客戶端狀態繞過授權。
 */
export function LoginForm({ nextPath, publicSignupEnabled, passwordResetEnabled }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')
    const validationError = validateLoginCredentials(email, password)

    if (validationError) {
      setError(validationError)
      return
    }

    setPending(true)
    setError(null)
    const startedAt = performance.now()

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      const elapsedMs = Math.round(performance.now() - startedAt)

      console.info(
        `[perf] browser auth login result=${authError ? 'error' : 'success'} total_ms=${elapsedMs}`,
      )

      if (authError) {
        setError(loginAuthErrorMessage(authError.code))
        setPending(false)
        return
      }

      window.location.replace(`/preparing?next=${encodeURIComponent(nextPath)}`)
    } catch {
      setError('暫時未能連接登入服務，請檢查網絡後再試。')
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}

      <Field
        label="電郵地址"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        disabled={pending}
      />

      <Field
        label="密碼"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        disabled={pending}
      />

      {passwordResetEnabled && (
        <Link
          href="/forgot-password"
          className="-mt-2 self-end text-sm font-medium text-brand underline"
        >
          忘記密碼？
        </Link>
      )}

      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? '登入中…' : '登入'}
      </Button>

      {publicSignupEnabled ? (
        <p className="text-center text-sm text-ink-muted">
          還未有帳號？{' '}
          <Link href="/signup" className="font-medium text-brand underline">註冊</Link>
        </p>
      ) : (
        <p className="text-center text-sm text-ink-muted">目前只限獲邀老師登入</p>
      )}
    </form>
  )
}
