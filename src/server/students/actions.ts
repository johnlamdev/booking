'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { normalizeStudentPhone } from '@/lib/student-identity'
import { db } from '@/server/db'
import { students } from '@/server/db/schema'
import { requireWorkspaceContext } from '@/server/workspace/context'

export type StudentActionState = { error?: string; success?: string; studentId?: string } | null
const schema = z.object({
  studentId: z.union([z.string().uuid(), z.literal('')]),
  displayName: z.string().trim().min(1, '請輸入學生姓名').max(80, '姓名不可超過 80 個字元'),
  phone: z.string().trim().min(1, '請輸入 WhatsApp 號碼').max(40, 'WhatsApp 號碼不可超過 40 個字元').refine((value) => {
    const digits = value.replace(/\D/g, '')
    return digits.length >= 8 && digits.length <= 15
  }, '請輸入有效的 WhatsApp 號碼'),
  notes: z.string().trim().max(500, '備註不可超過 500 個字元'),
})

function read(formData: FormData) {
  return schema.safeParse({ studentId: String(formData.get('studentId') ?? ''), displayName: String(formData.get('displayName') ?? ''), phone: String(formData.get('phone') ?? ''), notes: String(formData.get('notes') ?? '') })
}

function duplicate(error: unknown) {
  return ((error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code) === '23505'
}

export async function saveStudentAction(_state: StudentActionState, formData: FormData): Promise<StudentActionState> {
  const ctx = await requireWorkspaceContext()
  const parsed = read(formData)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '輸入內容不正確' }
  const values = { displayName: parsed.data.displayName, phone: parsed.data.phone, normalizedPhone: normalizeStudentPhone(parsed.data.phone), notes: parsed.data.notes || null, updatedAt: new Date() }
  try {
    if (parsed.data.studentId) {
      const [updated] = await db.update(students).set(values).where(and(eq(students.id, parsed.data.studentId), eq(students.workspaceId, ctx.workspaceId))).returning({ id: students.id })
      if (!updated) return { error: '找不到這位學生。' }
      revalidatePath('/dashboard/students')
      return { success: '學生資料已更新。', studentId: updated.id }
    }
    const [created] = await db.insert(students).values({ workspaceId: ctx.workspaceId, ...values }).returning({ id: students.id })
    revalidatePath('/dashboard/students')
    return { success: '學生已新增。', studentId: created?.id }
  } catch (error) {
    if (duplicate(error)) return { error: '已有學生使用相同 WhatsApp 號碼，請先搜尋並查看現有學生或已封存學生。' }
    console.error('[students] save failed')
    return { error: '暫時未能儲存學生，請稍後再試。' }
  }
}

export async function setStudentArchivedAction(formData: FormData) {
  const ctx = await requireWorkspaceContext()
  const studentId = z.string().uuid().safeParse(String(formData.get('studentId') ?? ''))
  const archived = String(formData.get('archived') ?? '') === 'true'
  if (!studentId.success) return
  await db.update(students).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(and(eq(students.id, studentId.data), eq(students.workspaceId, ctx.workspaceId)))
  revalidatePath('/dashboard/students')
  revalidatePath(`/dashboard/students/${studentId.data}`)
}
