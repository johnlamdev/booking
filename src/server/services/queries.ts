import 'server-only'

import { and, asc, eq } from 'drizzle-orm'

import { db } from '@/server/db'
import { services } from '@/server/db/schema'

export type ServiceListItem = {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  status: 'ACTIVE' | 'INACTIVE'
  sortOrder: number
}

/** 列出 workspace 的所有服務（含已停用），供後台管理使用。 */
export async function listServices(workspaceId: string): Promise<ServiceListItem[]> {
  return db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      durationMinutes: services.durationMinutes,
      status: services.status,
      sortOrder: services.sortOrder,
    })
    .from(services)
    .where(eq(services.workspaceId, workspaceId))
    .orderBy(asc(services.sortOrder), asc(services.createdAt))
}

/** 只列出可用於開放時段的服務。 */
export async function listActiveServices(workspaceId: string): Promise<ServiceListItem[]> {
  const rows = await listServices(workspaceId)
  return rows.filter((s) => s.status === 'ACTIVE')
}

/**
 * 取單一服務，並確認它屬於指定 workspace。
 *
 * workspaceId 一律來自登入身分反查的結果，不可由 client 傳入（規格 §11.4）。
 * 查無或不屬於該 workspace 皆回傳 null，呼叫端不應區分兩者。
 */
export async function getServiceInWorkspace(
  workspaceId: string,
  serviceId: string,
): Promise<ServiceListItem | null> {
  const [row] = await db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      durationMinutes: services.durationMinutes,
      status: services.status,
      sortOrder: services.sortOrder,
    })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.workspaceId, workspaceId)))
    .limit(1)

  return row ?? null
}
