'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'

import { normalizeSlug, SLUG_ERROR_MESSAGES, validateSlug } from '@/lib/slug'
import { db } from '@/server/db'
import { instructorProfiles, workspaces } from '@/server/db/schema'

import { requireWorkspaceContext } from './context'

export type ProfileFormState = {
  error?: string
  fieldErrors?: Partial<Record<'displayName' | 'slug' | 'timezone', string>>
  success?: boolean
} | null

/** 以 Intl 驗證 IANA timezone，不維護自己的清單，也絕不接受 UTC+8 這類固定偏移。 */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1, '請輸入顯示名稱').max(80, '顯示名稱不可超過 80 個字元'),
  slug: z.string(),
  timezone: z.string().refine(isValidTimeZone, '時區不正確'),
  bio: z.string().trim().max(500, '簡介不可超過 500 個字元').optional(),
  contactEmail: z
    .union([z.string().trim().email('聯絡電郵格式不正確'), z.literal('')])
    .optional(),
  contactPhone: z.string().trim().max(40, '聯絡電話不可超過 40 個字元').optional(),
})

/** 空字串一律存成 null，避免資料庫出現「有欄位但無內容」的模糊狀態。 */
function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  // 授權：由登入身分反查 workspace，不接受表單傳入的任何 workspace 識別碼
  const ctx = await requireWorkspaceContext()

  const parsed = profileSchema.safeParse({
    displayName: String(formData.get('displayName') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    timezone: String(formData.get('timezone') ?? ''),
    bio: String(formData.get('bio') ?? ''),
    contactEmail: String(formData.get('contactEmail') ?? ''),
    contactPhone: String(formData.get('contactPhone') ?? ''),
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0]
    if (field === 'displayName' || field === 'slug' || field === 'timezone') {
      return { fieldErrors: { [field]: issue?.message ?? '輸入內容不正確' } }
    }
    return { error: issue?.message ?? '輸入內容不正確' }
  }

  const slug = normalizeSlug(parsed.data.slug)
  const slugError = validateSlug(slug)
  if (slugError) {
    return { fieldErrors: { slug: SLUG_ERROR_MESSAGES[slugError] } }
  }

  // 先查一次給出友善訊息；真正的唯一性仍由 unique constraint 保證（見下方 catch）
  const [taken] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.slug, slug), ne(workspaces.id, ctx.workspaceId)))
    .limit(1)

  if (taken) {
    return { fieldErrors: { slug: '此公開頁網址已被使用，請改用其他名稱' } }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(workspaces)
        .set({
          name: parsed.data.displayName,
          slug,
          timezone: parsed.data.timezone,
        })
        .where(eq(workspaces.id, ctx.workspaceId))

      await tx
        .update(instructorProfiles)
        .set({
          displayName: parsed.data.displayName,
          bio: emptyToNull(parsed.data.bio),
          contactEmail: emptyToNull(parsed.data.contactEmail),
          contactPhone: emptyToNull(parsed.data.contactPhone),
        })
        // 同時以 workspaceId 限定，確保只會改到自己 workspace 的資料
        .where(
          and(
            eq(instructorProfiles.id, ctx.instructorProfileId),
            eq(instructorProfiles.workspaceId, ctx.workspaceId),
          ),
        )
    })
  } catch (error) {
    // 併發情況下仍可能撞上 unique constraint，轉為使用者看得懂的訊息
    if (error instanceof Error && error.message.includes('workspaces_slug_unique')) {
      return { fieldErrors: { slug: '此公開頁網址已被使用，請改用其他名稱' } }
    }
    throw error
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings/profile')

  return { success: true }
}
