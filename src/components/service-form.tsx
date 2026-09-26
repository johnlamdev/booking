'use client'

import { useActionState } from 'react'

import {
  createServiceAction,
  updateServiceAction,
  type ServiceFormState,
} from '@/server/services/actions'

import { Alert, Button, Field, Textarea } from './ui'

type Props = {
  /** 傳入既有服務代表編輯模式，否則為新增 */
  service?: {
    id: string
    name: string
    description: string | null
    durationMinutes: number
  }
  onDone?: () => void
}

export function ServiceForm({ service }: Props) {
  const isEdit = Boolean(service)
  const [state, formAction, isPending] = useActionState<ServiceFormState, FormData>(
    isEdit ? updateServiceAction : createServiceAction,
    null,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {service && <input type="hidden" name="serviceId" value={service.id} />}

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{isEdit ? '服務已更新。' : '服務已建立。'}</Alert>}

      <Field
        label="服務名稱"
        name="name"
        id={`name-${service?.id ?? 'new'}`}
        required
        maxLength={80}
        defaultValue={service?.name}
        disabled={isPending}
        error={state?.fieldErrors?.name}
        placeholder="例如：60 分鐘私人課"
      />

      <div className="rounded-xl bg-brand-soft px-3 py-2.5 text-sm text-brand-strong">
        第一版每節課堂固定為 60 分鐘，並於整點開始。
      </div>

      <Textarea
        label="說明"
        name="description"
        id={`description-${service?.id ?? 'new'}`}
        rows={3}
        maxLength={500}
        defaultValue={service?.description ?? ''}
        disabled={isPending}
        hint="選填，會顯示在公開頁"
      />

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? '儲存中…' : isEdit ? '儲存變更' : '建立服務'}
        </Button>
      </div>
    </form>
  )
}
