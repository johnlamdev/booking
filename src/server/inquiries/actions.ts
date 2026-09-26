'use server'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { STUDENT_NOTE_MAX_LENGTH } from '@/server/db/schema'
import { generateStatusToken, hashStatusToken } from '@/lib/token'
import { db } from '@/server/db'
import { bookingInquiries, inquiryStatusEvents, services } from '@/server/db/schema'
import { getPublishedProfile, isSlotBookable } from '@/server/public/queries'
import { checkRateLimit } from '@/server/rate-limit'
import { resolveStudent } from '@/server/students/resolve'

export type InquiryFormState = {
  error?: string
  fieldErrors?: Partial<Record<'studentName' | 'studentPhone', string>>
  /** 成功時回傳明文 token，導向狀態頁用。之後無法再取得。 */
  statusToken?: string
} | null

const RATE_LIMIT = { scope: 'inquiry-submit', limit: 5, windowSeconds: 600 }

const inquirySchema = z
  .object({
    studentName: z.string().trim().min(1, '請輸入你的姓名').max(80, '姓名不可超過 80 個字元'),
    studentPhone: z.string().trim().min(1, '請輸入 WhatsApp 號碼').max(40, 'WhatsApp 號碼不可超過 40 個字元').refine((value) => {
      const digits = value.replace(/\D/g, '')
      return digits.length >= 8 && digits.length <= 15
    }, '請輸入有效的 WhatsApp 號碼（連國家／地區號碼）'),
    studentNote: z
      .string()
      .trim()
      .max(STUDENT_NOTE_MAX_LENGTH, `備註不可超過 ${STUDENT_NOTE_MAX_LENGTH} 個字元`),
  })

/**
 * 提交預約查詢。
 *
 * 公開 endpoint，任何人可呼叫，因此：
 * - 一切輸入以 server 驗證為準（規格 §8.7）
 * - 有限流與 honeypot（規格 §8.7、§13.2）
 * - **不信任表單傳來的 workspace / instructor / 時間**，一律由 slug 與服務反查後
 *   重新推導驗證（規格 §11.4、§11.6）
 */
export async function submitInquiryAction(
  _prev: InquiryFormState,
  formData: FormData,
): Promise<InquiryFormState> {
  // honeypot：真人看不到這個欄位，填了就是自動化程式
  if (String(formData.get('website') ?? '') !== '') {
    // 回報成功但不建立資料，避免程式據此調整策略
    return { statusToken: undefined, error: undefined }
  }

  const limit = await checkRateLimit(RATE_LIMIT)
  if (!limit.allowed) {
    return { error: '短時間內提交次數過多，請稍後再試。' }
  }

  const slug = String(formData.get('slug') ?? '')
  const serviceId = String(formData.get('serviceId') ?? '')
  const startIso = String(formData.get('startAt') ?? '')
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '')

  if (!slug || !serviceId || !startIso || !idempotencyKey) {
    return { error: '提交資料不完整，請重新選擇時間。' }
  }

  const parsed = inquirySchema.safeParse({
    studentName: String(formData.get('studentName') ?? ''),
    studentPhone: String(formData.get('studentPhone') ?? ''),
    studentNote: String(formData.get('studentNote') ?? ''),
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path[0]
    if (path === 'studentName' || path === 'studentPhone') {
      return { fieldErrors: { [path]: issue?.message ?? '輸入內容不正確' } }
    }
    return { error: issue?.message ?? '輸入內容不正確' }
  }

  // 由 slug 反查，不接受表單傳入的 workspace 識別碼
  const profile = await getPublishedProfile(slug)
  if (!profile) return { error: '找不到這個預約頁，可能已停止開放。' }

  const [service] = await db
    .select({ id: services.id, durationMinutes: services.durationMinutes })
    .from(services)
    .where(
      and(
        eq(services.id, serviceId),
        eq(services.workspaceId, profile.workspaceId),
        eq(services.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!service) return { error: '這項課堂已停止開放，請選擇其他課堂。' }

  const startAt = new Date(startIso)
  if (Number.isNaN(startAt.getTime())) return { error: '時間格式不正確，請重新選擇。' }

  // 重新推導確認該時間仍可預約：可能在學生填表期間被其他人約走
  const bookable = await isSlotBookable({
    profile,
    durationMinutes: service.durationMinutes,
    startAt,
  })

  if (!bookable) {
    return { error: '這個時間已經不能預約了，請返回重新選擇。' }
  }

  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000)
  const token = generateStatusToken()

  try {
    const [created] = await db.transaction(async (tx) => {
      const studentId = await resolveStudent(tx, {
        workspaceId: profile.workspaceId,
        displayName: parsed.data.studentName,
        phone: parsed.data.studentPhone,
      })
      const rows = await tx
        .insert(bookingInquiries)
        .values({
          workspaceId: profile.workspaceId,
          instructorId: profile.instructorId,
          serviceId: service.id,
          studentId,
          startAt,
          endAt,
          studentName: parsed.data.studentName,
          studentEmail: null,
          studentPhone: parsed.data.studentPhone || null,
          studentNote: parsed.data.studentNote || null,
          status: 'PENDING',
          privacyConsentAt: new Date(),
          statusTokenHash: hashStatusToken(token),
          idempotencyKey,
        })
        .returning({ id: bookingInquiries.id })

      if (rows[0]) {
        await tx.insert(inquiryStatusEvents).values({
          bookingInquiryId: rows[0].id,
          fromStatus: null,
          toStatus: 'PENDING',
          actorType: 'STUDENT',
        })
      }

      return rows
    })

    if (!created) return { error: '提交失敗，請稍後再試。' }
  } catch (error) {
    // 重複點擊：unique(instructor_id, start_at, idempotency_key) 擋下第二次
    const code = (error as { code?: string; cause?: { code?: string } }).code ??
      (error as { cause?: { code?: string } }).cause?.code

    if (code === '23505') {
      return {
        error:
          '這筆查詢已經送出了。如果沒有看到確認畫面，請檢查你的提交紀錄或直接聯絡老師。',
      }
    }

    // 不把 Drizzle 錯誤拋回公開頁：開發 overlay 可能連 query params 一併顯示，
    // 當中包含學生聯絡資料。Server log 只保留錯誤碼，不記錄 query、params 或表單內容。
    console.error(`[inquiry-submit] database failure code=${code ?? 'unknown'}`)
    return { error: '暫時未能提交查詢，請稍後再試。你的資料尚未送出。' }
  }

  return { statusToken: token }
}
