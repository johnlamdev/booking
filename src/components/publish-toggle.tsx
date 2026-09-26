'use client'

import { useState, useTransition } from 'react'

import { setPublishStateAction } from '@/server/workspace/publish'

import { Alert, Button } from './ui'

type Props = {
  isPublic: boolean
  canPublish: boolean
  publicUrl: string
}

export function PublishToggle({ isPublic, canPublish, publicUrl }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)
  const [isPending, startTransition] = useTransition()

  function toggle(next: boolean) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('isPublic', String(next))
      const result = await setPublishStateAction(formData)
      setError(result?.error ?? null)
      setConfirmingUnpublish(false)
    })
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            {/* 狀態以文字表達，不單靠顏色 */}
            {isPublic ? '已發佈' : '尚未發佈'}
          </p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {isPublic ? '學生可以透過連結提交查詢。' : '目前沒有人可以看到你的預約頁。'}
          </p>
        </div>

        {isPublic ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmingUnpublish(true)}
            disabled={isPending || confirmingUnpublish}
          >
            取消發佈
          </Button>
        ) : (
          <Button type="button" onClick={() => toggle(true)} disabled={!canPublish || isPending}>
            {isPending ? '發佈中…' : '發佈'}
          </Button>
        )}
      </div>

      {/* 取消發佈會令學生無法再查看與提交，屬不可逆影響，需二次確認（規格 §13.4） */}
      {confirmingUnpublish && (
        <div className="rounded-lg border border-line bg-canvas p-3">
          <p className="text-sm text-ink">
            取消發佈後，學生將無法開啟你的預約頁，也不能提交新查詢。
            已經確認的預約不受影響。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="danger" onClick={() => toggle(false)} disabled={isPending}>
              {isPending ? '處理中…' : '確定取消發佈'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmingUnpublish(false)}
              disabled={isPending}
            >
              返回
            </Button>
          </div>
        </div>
      )}

      {isPublic && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-canvas px-3 py-2 text-xs text-ink">
            {publicUrl}
          </code>
          <Button type="button" variant="secondary" onClick={copyUrl}>
            {copied ? '已複製 ✓' : '複製連結'}
          </Button>
        </div>
      )}
    </div>
  )
}
