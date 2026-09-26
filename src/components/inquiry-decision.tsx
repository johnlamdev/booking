'use client'

import Link from 'next/link'
import { useActionState, useEffect, useState } from 'react'

import {
  confirmInquiryAction,
  rejectInquiryAction,
  type DecisionState,
} from '@/server/inquiries/decisions'

import { Alert, Button } from './ui'
import { WhatsAppComposer } from './whatsapp-composer'

type Props = {
  inquiryId: string
  /** 已組好的通知文字，供老師貼進 WhatsApp */
  confirmationMessage: string
  rejectionMessage: string
  hasConfirmedConflict: boolean
  studentPhone: string | null
  pendingMessage: string
  testMode?: boolean
  isClosedDay?: boolean
}

export function InquiryDecision({
  inquiryId,
  confirmationMessage,
  rejectionMessage,
  hasConfirmedConflict,
  studentPhone,
  pendingMessage,
  testMode = false,
  isClosedDay = false,
}: Props) {
  const [confirmState, confirmAction, isConfirmPending] = useActionState(
    confirmInquiryAction,
    null,
  )
  const [rejectState, rejectAction, isRejectPending] = useActionState(
    rejectInquiryAction,
    null,
  )
  const [mode, setMode] = useState<'idle' | 'confirming' | 'rejecting' | 'replying'>('idle')
  const [reason, setReason] = useState('')
  const [confirmationDraft, setConfirmationDraft] = useState(confirmationMessage)
  const [rejectionDraft, setRejectionDraft] = useState(rejectionMessage)
  const [replyDraft, setReplyDraft] = useState(pendingMessage)
  const state: DecisionState = confirmState ?? rejectState
  const isPending = isConfirmPending || isRejectPending
  const completedMessage = state?.outcome === 'REJECTED'
    ? [rejectionDraft, reason ? `原因：${reason}` : ''].filter(Boolean).join('\n')
    : confirmationDraft

  useEffect(() => {
    const storageKey = `whatsapp-handoff-${inquiryId}`
    let becameHidden = false

    function refreshAfterAppReturn() {
      if (document.visibilityState === 'hidden') {
        becameHidden = true
        return
      }
      if (becameHidden && sessionStorage.getItem(storageKey)) {
        sessionStorage.removeItem(storageKey)
        window.location.reload()
      }
    }

    function refreshAfterHistoryReturn(event: PageTransitionEvent) {
      if (event.persisted && sessionStorage.getItem(storageKey)) {
        sessionStorage.removeItem(storageKey)
        window.location.reload()
      }
    }

    document.addEventListener('visibilitychange', refreshAfterAppReturn)
    window.addEventListener('pageshow', refreshAfterHistoryReturn)
    return () => {
      document.removeEventListener('visibilitychange', refreshAfterAppReturn)
      window.removeEventListener('pageshow', refreshAfterHistoryReturn)
    }
  }, [inquiryId])

  useEffect(() => {
    if (state?.error) sessionStorage.removeItem(`whatsapp-handoff-${inquiryId}`)
  }, [inquiryId, state?.error])

  function markWhatsAppHandoff() {
    sessionStorage.setItem(`whatsapp-handoff-${inquiryId}`, '1')
  }

  if (state?.success) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success">{state.success}</Alert>

        {state.outcome === 'CONFIRMED' && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/inquiries?status=CONFIRMED"
              className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
            >
              查看已確認課堂
            </Link>
            {(state.conflictCount ?? 0) > 0 && (
              <Link
                href="/dashboard/inquiries?status=REJECTED_CONFLICT"
                className="inline-flex min-h-11 items-center rounded-xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger"
              >
                查看時段衝突查詢
              </Link>
            )}
          </div>
        )}

        {/*
            系統不會自動通知學生，所以提供符合處理結果的文字供老師傳送。
        */}
        <WhatsAppComposer phone={studentPhone} message={completedMessage} label={state.outcome === 'REJECTED' ? 'WhatsApp 建議其他時間' : 'WhatsApp 傳送確認'} defaultOpen testMode={testMode} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {state?.error && <Alert tone="error">{state.error}</Alert>}

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setMode('confirming')} disabled={isPending || hasConfirmedConflict || isClosedDay}>{isClosedDay ? '不開放，無法確認' : hasConfirmedConflict ? '已有課堂，無法確認' : '確認'}</Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => setMode('rejecting')}
            disabled={isPending}
          >
            拒絕
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('replying')} disabled={isPending}>回覆</Button>
        </div>
      )}

      {mode === 'replying' && (
        <div className="flex flex-col gap-3">
          <WhatsAppComposer phone={studentPhone} message={pendingMessage} value={replyDraft} onChange={setReplyDraft} label="WhatsApp 回覆" defaultOpen testMode={testMode} />
          <div><Button type="button" variant="secondary" onClick={() => setMode('idle')}>返回</Button></div>
        </div>
      )}

      {mode === 'confirming' && (
        <div className="flex flex-col gap-3">
          <WhatsAppComposer phone={studentPhone} message={confirmationMessage} value={confirmationDraft} onChange={setConfirmationDraft} defaultOpen showOpenButton={false} testMode={testMode} />
          <form action={confirmAction} onSubmit={markWhatsAppHandoff} className="flex flex-wrap gap-2">
            <input type="hidden" name="inquiryId" value={inquiryId} />
            <input type="hidden" name="whatsappMessage" value={confirmationDraft} />
            <Button type="submit" disabled={isPending}>{isConfirmPending ? '確認中…' : '確認課堂並開啟 WhatsApp'}</Button>
            <Button type="button" variant="secondary" onClick={() => setMode('idle')} disabled={isPending}>返回</Button>
          </form>
        </div>
      )}

      {mode === 'rejecting' && (
        <div className="flex flex-col gap-3">
          <WhatsAppComposer phone={studentPhone} message={rejectionMessage} value={rejectionDraft} onChange={setRejectionDraft} defaultOpen showOpenButton={false} testMode={testMode} />
        <form action={rejectAction} onSubmit={markWhatsAppHandoff} className="rounded-lg border border-line bg-canvas p-3">
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <input type="hidden" name="whatsappMessage" value={[rejectionDraft, reason ? `原因：${reason}` : ''].filter(Boolean).join('\n')} />
          <label htmlFor={`reason-${inquiryId}`} className="text-sm font-medium text-ink">
            拒絕原因
          </label>
          <p id={`reason-hint-${inquiryId}`} className="mt-0.5 text-xs text-ink-subtle">
            選填，會顯示給學生。
          </p>
          <textarea
            id={`reason-${inquiryId}`}
            name="rejectionReason"
            aria-describedby={`reason-hint-${inquiryId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            rows={2}
            disabled={isPending}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={isPending}
            >
              {isRejectPending ? '處理中…' : '拒絕並開啟 WhatsApp'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMode('idle')}
              disabled={isPending}
            >
              返回
            </Button>
          </div>
        </form>
        </div>
      )}
    </div>
  )
}
