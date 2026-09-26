import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: '約課易',
    template: '%s｜約課易',
  },
  description: '讓學生自行查看可用時段並提交預約查詢，由老師決定是否確認。',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-Hant-HK" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-canvas text-ink">{children}</body>
    </html>
  )
}
