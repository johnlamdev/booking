'use client'

import { useState } from 'react'

import { Button } from './ui'

export function StatusLinkActions() {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopied(false)
    }
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink()
      return
    }

    try {
      await navigator.share({ title: '預約查詢狀態', url: window.location.href })
    } catch {
      // 使用者關閉分享介面時毋須顯示錯誤。
    }
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={copyLink}>
        {copied ? '已複製 ✓' : '複製狀態連結'}
      </Button>
      <Button type="button" variant="secondary" onClick={shareLink}>分享連結</Button>
    </div>
  )
}
