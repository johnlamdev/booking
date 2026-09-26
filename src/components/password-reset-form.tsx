'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import type { AuthFormState } from '@/server/auth/actions'

import { Alert, Button, Field } from './ui'

type Props =
  | {
      mode: 'request'
      action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>
    }
  | {
      mode: 'update'
      action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>
    }

export function PasswordResetForm({ mode, action }: Props) {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(action, null)

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.notice && <Alert tone="notice">{state.notice}</Alert>}

      {mode === 'request' ? (
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
      ) : (
        <>
          <Field
            label="新密碼"
            name="password"
            type="password"
            required
            hint="至少 8 個字元"
            autoComplete="new-password"
            disabled={isPending}
          />
          <Field
            label="再次輸入新密碼"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            disabled={isPending}
          />
        </>
      )}

      <Button type="submit" disabled={isPending} className="mt-1">
        {isPending
          ? mode === 'request'
            ? '發送中…'
            : '更新中…'
          : mode === 'request'
            ? '發送重設連結'
            : '更新密碼'}
      </Button>

      <Link href="/login" className="text-center text-sm font-medium text-brand underline">
        返回登入
      </Link>
    </form>
  )
}
