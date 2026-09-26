import type { Metadata } from 'next'

import { WorkspacePreparation } from '@/components/workspace-preparation'
import { safeNextPath } from '@/lib/navigation'

export const metadata: Metadata = { title: '準備測試工作室' }

export default async function PreparingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const query = await searchParams
  return <WorkspacePreparation nextPath={safeNextPath(query.next)} />
}
