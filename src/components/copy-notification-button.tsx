'use client'

import { useState } from 'react'

import { Button } from './ui'

export function CopyNotificationButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" onClick={copy} className="px-3 py-2 text-xs">
        {copied ? '已複製 ✓' : '複製通知訊息'}
      </Button>
      <p className="mt-1 text-xs text-ink-subtle">複製後直接透過 WhatsApp 傳送給學生。</p>
    </div>
  )
}
