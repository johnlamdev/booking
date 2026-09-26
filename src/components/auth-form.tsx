'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import type { AuthFormState } from '@/server/auth/actions'

import { Alert, Button, Field } from './ui'

type Props = {
  mode: 'login' | 'signup'
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>
  nextPath?: string
  publicSignupEnabled?: boolean
  passwordResetEnabled?: boolean
}

const COPY = {
  login: {
    submit: '登入',
    pending: '登入中…',
    switchText: '還未有帳號？',
    switchHref: '/signup',
    switchLabel: '註冊',
    passwordHint: undefined,
    autoComplete: 'current-password',
  },
  signup: {
    submit: '建立帳號',
    pending: '建立中…',
    switchText: '已經有帳號？',
    switchHref: '/login',
    switchLabel: '登入',
    passwordHint: '至少 8 個字元',
    autoComplete: 'new-password',
  },
} as const

export function AuthForm({ mode, action, nextPath, publicSignupEnabled = true, passwordResetEnabled = true }: Props) {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(action, null)
  const copy = COPY[mode]

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {nextPath && <input type="hidden" name="next" value={nextPath} />}

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.notice && <Alert tone="notice">{state.notice}</Alert>}

      <Field
        label="電郵地址"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        defaultValue={state?.email}
        disabled={isPending}
      />

      <Field
        label="密碼"
        name="password"
        type="password"
        required
        hint={copy.passwordHint}
        autoComplete={copy.autoComplete}
        disabled={isPending}
      />

      {mode === 'login' && passwordResetEnabled && (
        <Link
          href="/forgot-password"
          className="-mt-2 self-end text-sm font-medium text-brand underline"
        >
          忘記密碼？
        </Link>
      )}

      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending ? copy.pending : copy.submit}
      </Button>

      {mode === 'login' && !publicSignupEnabled ? (
        <p className="text-center text-sm text-ink-muted">目前只限獲邀老師登入</p>
      ) : (
        <p className="text-center text-sm text-ink-muted">
          {copy.switchText}{' '}
          <Link href={copy.switchHref} className="font-medium text-brand underline">
            {copy.switchLabel}
          </Link>
        </p>
      )}
    </form>
  )
}
