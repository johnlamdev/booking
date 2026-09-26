'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/server/db'
import { services } from '@/server/db/schema'
import { requireWorkspaceContext } from '@/server/workspace/context'

export type ServiceFormState = {
  error?: string
  fieldErrors?: Partial<Record<'name', string>>
  success?: boolean
} | null

const serviceSchema = z.object({
  name: z.string().trim().min(1, '請輸入服務名稱').max(80, '服務名稱不可超過 80 個字元'),
  description: z.string().trim().max(500, '說明不可超過 500 個字元').optional(),
})

function parseForm(formData: FormData) {
  return serviceSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
  })
}

function toFormState(error: z.ZodError): ServiceFormState {
  const issue = error.issues[0]
  const field = issue?.path[0]
  if (field === 'name') {
    return { fieldErrors: { [field]: issue?.message ?? '輸入內容不正確' } }
  }
  return { error: issue?.message ?? '輸入內容不正確' }
}

function revalidate() {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/services')
  revalidatePath('/dashboard/availability')
}

export async function createServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const ctx = await requireWorkspaceContext()

  const parsed = parseForm(formData)
  if (!parsed.success) return toFormState(parsed.error)

  await db.insert(services).values({
    workspaceId: ctx.workspaceId,
    instructorId: ctx.instructorProfileId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    serviceType: 'PRIVATE',
    durationMinutes: 60,
    status: 'ACTIVE',
  })

  revalidate()
  return { success: true }
}

export async function updateServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const ctx = await requireWorkspaceContext()

  const serviceId = String(formData.get('serviceId') ?? '')
  if (!serviceId) return { error: '找不到指定的服務' }

  const parsed = parseForm(formData)
  if (!parsed.success) return toFormState(parsed.error)

  // 以 workspaceId 一併限定，確保無法透過改動表單的 serviceId 改到別人的資料
  const updated = await db
    .update(services)
    .set({
      name: parsed.data.name,
      description: parsed.data.description || null,
      durationMinutes: 60,
    })
    .where(and(eq(services.id, serviceId), eq(services.workspaceId, ctx.workspaceId)))
    .returning({ id: services.id })

  if (updated.length === 0) return { error: '找不到指定的服務' }

  revalidate()
  return { success: true }
}

/**
 * 停用或重新啟用服務。
 *
 * 停用不刪除任何歷史資料，只是不再接受新的時段與查詢（規格 §8.3、§11.10）。
 * 本 MVP 不提供刪除服務。
 */
export async function setServiceStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspaceContext()

  const serviceId = String(formData.get('serviceId') ?? '')
  const nextStatus = String(formData.get('status') ?? '')

  if (!serviceId || (nextStatus !== 'ACTIVE' && nextStatus !== 'INACTIVE')) return

  await db
    .update(services)
    .set({ status: nextStatus })
    .where(and(eq(services.id, serviceId), eq(services.workspaceId, ctx.workspaceId)))

  revalidate()
}
