import 'server-only'

import { and, eq } from 'drizzle-orm'

import { normalizeStudentEmail, normalizeStudentPhone } from '@/lib/student-identity'
import { db } from '@/server/db'
import { students } from '@/server/db/schema'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function resolveStudent(
  tx: Tx,
  input: { workspaceId: string; displayName: string; email?: string | null; phone?: string | null },
): Promise<string> {
  const email = input.email?.trim() || null
  const phone = input.phone?.trim() || null
  const normalizedEmail = normalizeStudentEmail(email)
  const normalizedPhone = normalizeStudentPhone(phone)

  const findBy = async (field: 'phone' | 'email') => {
    const column = field === 'phone' ? students.normalizedPhone : students.normalizedEmail
    const value = field === 'phone' ? normalizedPhone : normalizedEmail
    if (!value) return undefined
    const [row] = await tx
      .select({ id: students.id, normalizedEmail: students.normalizedEmail, normalizedPhone: students.normalizedPhone })
      .from(students)
      .where(and(eq(students.workspaceId, input.workspaceId), eq(column, value)))
      .limit(1)
    return row
  }

  const existing = (await findBy('phone')) ?? (await findBy('email'))
  if (existing) {
    await tx
      .update(students)
      .set({
        displayName: input.displayName,
        ...(normalizedEmail && (!existing.normalizedEmail || existing.normalizedEmail === normalizedEmail)
          ? { email, normalizedEmail }
          : {}),
        ...(normalizedPhone && (!existing.normalizedPhone || existing.normalizedPhone === normalizedPhone)
          ? { phone, normalizedPhone }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(students.id, existing.id), eq(students.workspaceId, input.workspaceId)))
    return existing.id
  }

  const [created] = await tx
    .insert(students)
    .values({ workspaceId: input.workspaceId, displayName: input.displayName, email, normalizedEmail, phone, normalizedPhone })
    .onConflictDoNothing()
    .returning({ id: students.id })
  if (created) return created.id

  const raced = (await findBy('phone')) ?? (await findBy('email'))
  if (!raced) throw new Error('建立學生資料失敗')
  return raced.id
}
