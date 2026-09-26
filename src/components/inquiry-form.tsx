'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef } from 'react'

import { submitInquiryAction, type InquiryFormState } from '@/server/inquiries/actions'

import { Alert, Button, Field, Textarea } from './ui'

type Props = {
  slug: string
  serviceId: string
  startIso: string
  idempotencyKey: string
}

export function InquiryForm({ slug, serviceId, startIso, idempotencyKey }: Props) {
  const [state, formAction, isPending] = useActionState<InquiryFormState, FormData>(
    submitInquiryAction,
    null,
  )
  const router = useRouter()
  const navigated = useRef(false)

  // 成功後導向狀態頁。明文 token 只在此刻拿得到，之後無法再取得。
  useEffect(() => {
    if (state?.statusToken && !navigated.current) {
      navigated.current = true
      router.replace(`/inquiry/status/${state.statusToken}`)
    }
  }, [state?.statusToken, router])

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="startAt" value={startIso} />
      {/* 同一把鑰匙重複送出只會建立一筆（規格 §8.7） */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {/*
        Honeypot：以 CSS 隱藏且排除於無障礙樹之外，真人不會填到。
        用 hidden 屬性會令部分自動化程式略過，故改用視覺隱藏。
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">請留空</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <Field
        label="你的姓名"
        name="studentName"
        required
        maxLength={80}
        autoComplete="name"
        disabled={isPending}
        error={state?.fieldErrors?.studentName}
      />

      <fieldset className="flex flex-col gap-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
        <legend className="px-1 text-sm font-medium text-ink">WhatsApp 聯絡</legend>
        <p className="text-xs text-ink-subtle">老師會透過 WhatsApp 回覆及確認約堂。</p>
        <Field
          label="WhatsApp 號碼"
          name="studentPhone"
          type="tel"
          inputMode="tel"
          required
          maxLength={40}
          autoComplete="tel"
          disabled={isPending}
          error={state?.fieldErrors?.studentPhone}
          hint="請連國家／地區號碼，例如 +852 9123 4567"
        />
      </fieldset>

      <Textarea
        label="備註"
        name="studentNote"
        rows={3}
        maxLength={500}
        disabled={isPending}
        hint="選填，最多 500 字。例如想練習的重點或身體狀況。"
      />

      <div className="rounded-xl border border-line bg-canvas px-3 py-3 text-xs leading-5 text-ink-muted">
        <p><strong className="font-semibold text-ink">收集個人資料聲明：</strong>姓名及 WhatsApp 號碼是處理預約所必須；不提供便無法提交查詢。資料只會用於處理約堂、WhatsApp 聯絡確認及保存約堂紀錄，並由老師及約課易系統處理。</p>
        <p className="mt-1">提交即表示你已閱讀以上聲明；如需查閱或更正資料，可透過 WhatsApp 聯絡老師。</p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? '提交中…' : '提交預約查詢'}
      </Button>

      <p className="text-center text-xs text-ink-subtle">
        提交後仍需老師確認，這一步並不代表預約成功。
      </p>
    </form>
  )
}
