'use client'

import { useState } from 'react'

import { buildWhatsAppUrl, normalizeWhatsAppNumber } from '@/lib/whatsapp'

import { Button } from './ui'

export function WhatsAppComposer({
  phone,
  message,
  label = 'WhatsApp 回覆',
  defaultOpen = false,
  value,
  onChange,
  showOpenButton = true,
  testMode = false,
}: {
  phone: string | null
  message: string
  label?: string
  defaultOpen?: boolean
  value?: string
  onChange?: (value: string) => void
  showOpenButton?: boolean
  testMode?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  // 草稿只在 message 未變時有效；message 一變就自動退回新範本，毋須 effect 同步。
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const internalText = draft?.base === message ? draft.text : message
  const text = value ?? internalText
  const normalizedPhone = normalizeWhatsAppNumber(phone)
  const directUrl = buildWhatsAppUrl(normalizedPhone, text)

  function updateText(next: string) {
    if (value === undefined) setDraft({ base: message, text: next })
    onChange?.(next)
  }

  function openWhatsApp() {
    const url = buildWhatsAppUrl(normalizedPhone, text)
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  if (!normalizedPhone) return <p className="text-sm font-medium text-amber-700">{testMode ? '測試 WhatsApp 收件號碼尚未設定，因此暫停傳送。' : '未有 WhatsApp 號碼，請先補上學生資料。'}</p>

  if (!open) {
    return <div>
      {testMode && <p className="mb-2 text-xs font-medium text-amber-800">測試模式：將傳送至統一測試 WhatsApp。</p>}
      <div className="flex flex-wrap items-center gap-2">
        <a href={directUrl ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!directUrl} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm ${directUrl ? 'bg-emerald-600 hover:bg-emerald-700' : 'pointer-events-none bg-zinc-300'}`}>◉ {label}</a>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>先預覽／修改</Button>
      </div>
    </div>
  }

  return (
    <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-emerald-900">WhatsApp 訊息預覽</p>
        {showOpenButton && <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-emerald-800 underline">收起</button>}
      </div>
      {testMode && <p className="mt-1 text-xs font-medium text-amber-800">測試模式：收件人是統一測試 WhatsApp，不是畫面上的示範學生號碼。</p>}
      <textarea value={text} onChange={(event) => updateText(event.target.value)} rows={6} maxLength={1000} aria-label="WhatsApp 訊息" className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm leading-6 text-ink" />
      <div className="mt-2 flex flex-wrap gap-2">
        {showOpenButton && <Button type="button" onClick={openWhatsApp} disabled={!text.trim()} className="bg-emerald-600 hover:bg-emerald-700">開啟 WhatsApp →</Button>}
        {showOpenButton && <Button type="button" variant="secondary" onClick={copy}>{copied ? '已複製 ✓' : '複製訊息'}</Button>}
      </div>
      <p className="mt-2 text-xs text-emerald-900/70">{showOpenButton ? '訊息只會預先填入；請在 WhatsApp 內檢查並按傳送。' : '訊息不會儲存在約課易；完成確認後即可直接開啟 WhatsApp。'}</p>
    </div>
  )
}
