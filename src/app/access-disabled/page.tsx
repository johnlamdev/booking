import type { Metadata } from 'next'

import { Button, Card } from '@/components/ui'
import { logoutAction } from '@/server/auth/actions'

export const metadata: Metadata = { title: '帳號暫停存取' }

export default async function AccessDisabledPage({ searchParams }: PageProps<'/access-disabled'>) {
  const params = await searchParams
  const inviteOnly = params.reason === 'invite-only'

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
      <Card className="w-full">
        <h1 className="text-xl font-semibold text-ink">{inviteOnly ? '只限獲邀測試帳號' : '帳號暫停存取'}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {inviteOnly
            ? '這個登入帳號未獲測試邀請，因此不會建立工作空間。請使用我們提供的測試帳號，或聯絡管理員。'
            : '這個帳號目前沒有可使用的工作空間。請聯絡管理員恢復權限，或先登出並改用其他帳號。'}
        </p>
        <form action={logoutAction} className="mt-5">
          <Button type="submit" variant="secondary">
            登出
          </Button>
        </form>
      </Card>
    </main>
  )
}
