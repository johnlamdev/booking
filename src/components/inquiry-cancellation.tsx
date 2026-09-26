'use client'

import { useState, useTransition } from 'react'

import { cancelInquiryAction, type DecisionState } from '@/server/inquiries/decisions'

import { Alert, Button } from './ui'
import { WhatsAppComposer } from './whatsapp-composer'

export function InquiryCancellation({
  inquiryId,
  timeLabel,
  cancellationMessage,
  studentPhone,
  testMode = false,
}: {
  inquiryId: string
  timeLabel: string
  cancellationMessage: string
  studentPhone: string | null
  testMode?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [state, setState] = useState<DecisionState>(null)
  const [isPending, startTransition] = useTransition()

  function cancel() {
    const formData = new FormData()
    formData.set('inquiryId', inquiryId)
    formData.set('cancellationReason', reason)

    startTransition(async () => {
      const result = await cancelInquiryAction(formData)
      setState(result)
    })
  }

  if (state?.success) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success">{state.success}</Alert>
        <WhatsAppComposer phone={studentPhone} message={[cancellationMessage, reason ? `原因：${reason}` : ''].filter(Boolean).join('\n')} label="WhatsApp 傳送取消通知" defaultOpen testMode={testMode} />
      </div>
    )
  }

  return (
    <div>
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {!open ? (
        <Button type="button" variant="danger" onClick={() => setOpen(true)}>
          取消預約
        </Button>
      ) : (
        <div className="rounded-xl border border-danger/20 bg-danger-soft p-3">
          <p className="text-sm text-ink">
            取消後，<strong className="font-medium">{timeLabel}</strong> 會重新開放給其他學生。
          </p>
          <label htmlFor={`cancel-reason-${inquiryId}`} className="mt-3 block text-sm font-medium text-ink">取消原因</label>
          <p id={`cancel-reason-hint-${inquiryId}`} className="mt-0.5 text-xs text-ink-subtle">選填，會顯示給學生。</p>
          <textarea
            id={`cancel-reason-${inquiryId}`}
            aria-describedby={`cancel-reason-hint-${inquiryId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            rows={2}
            disabled={isPending}
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="danger" onClick={cancel} disabled={isPending}>
              {isPending ? '處理中…' : '確定取消預約'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>返回</Button>
          </div>
        </div>
      )}
    </div>
  )
}
