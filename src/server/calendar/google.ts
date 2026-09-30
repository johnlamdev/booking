import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { and, asc, eq, gt, gte, or } from 'drizzle-orm'

import { deleteGoogleBookingEvent, googleBookingEventId, putGoogleBookingEvent } from '@/lib/google-calendar-events'
import { db } from '@/server/db'
import { bookingInquiries, googleCalendarConnections, services } from '@/server/db/schema'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  if (!clientId || !clientSecret || !appUrl || !encryptionKey) return null
  const key = Buffer.from(encryptionKey, 'base64')
  if (key.length !== 32) return null
  return { clientId, clientSecret, appUrl, key }
}

export function isGoogleCalendarConfigured(): boolean {
  return config() !== null
}

export function googleRedirectUri(): string | null {
  const value = config()
  return value ? `${value.appUrl}/api/google-calendar/callback` : null
}

export function googleAuthorizationUrl(state: string): string | null {
  const value = config()
  if (!value) return null
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', value.clientId)
  url.searchParams.set('redirect_uri', `${value.appUrl}/api/google-calendar/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events.owned')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url.toString()
}

function encryptToken(token: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

function decryptToken(encrypted: string, key: Buffer): string {
  const bytes = Buffer.from(encrypted, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
}

async function tokenRequest(body: URLSearchParams): Promise<{ access_token?: string; refresh_token?: string }> {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`Google token request failed (${response.status})`)
  return response.json()
}

export async function connectGoogleCalendar(workspaceId: string, code: string): Promise<void> {
  const value = config()
  if (!value) throw new Error('Google Calendar 尚未設定')
  const tokens = await tokenRequest(new URLSearchParams({
    code,
    client_id: value.clientId,
    client_secret: value.clientSecret,
    redirect_uri: `${value.appUrl}/api/google-calendar/callback`,
    grant_type: 'authorization_code',
  }))
  if (!tokens.refresh_token) throw new Error('Google 沒有提供持續同步所需的授權，請重新連接。')
  await db.insert(googleCalendarConnections).values({
    workspaceId,
    refreshTokenEncrypted: encryptToken(tokens.refresh_token, value.key),
  }).onConflictDoUpdate({
    target: googleCalendarConnections.workspaceId,
    set: { refreshTokenEncrypted: encryptToken(tokens.refresh_token, value.key), lastSyncError: null },
  })
}

export async function hasGoogleCalendarConnection(workspaceId: string): Promise<boolean> {
  const [row] = await db.select({ workspaceId: googleCalendarConnections.workspaceId })
    .from(googleCalendarConnections).where(eq(googleCalendarConnections.workspaceId, workspaceId)).limit(1)
  return Boolean(row)
}

export async function getGoogleCalendarConnectionStatus(workspaceId: string): Promise<{ connected: boolean; lastSyncError: string | null }> {
  const [row] = await db.select({ lastSyncError: googleCalendarConnections.lastSyncError })
    .from(googleCalendarConnections).where(eq(googleCalendarConnections.workspaceId, workspaceId)).limit(1)
  return { connected: Boolean(row), lastSyncError: row?.lastSyncError ?? null }
}

export async function disconnectGoogleCalendar(workspaceId: string): Promise<void> {
  await db.delete(googleCalendarConnections).where(eq(googleCalendarConnections.workspaceId, workspaceId))
}

async function accessToken(encrypted: string): Promise<string> {
  const value = config()
  if (!value) throw new Error('Google Calendar 尚未設定')
  const tokens = await tokenRequest(new URLSearchParams({
    refresh_token: decryptToken(encrypted, value.key),
    client_id: value.clientId,
    client_secret: value.clientSecret,
    grant_type: 'refresh_token',
  }))
  if (!tokens.access_token) throw new Error('Google Calendar 授權已失效，請重新連接。')
  return tokens.access_token
}

/** 用固定 event ID 保證重試安全；只讀寫本應用建立的事件。 */
export async function syncGoogleCalendarBooking(bookingId: string): Promise<'not-connected' | 'synced'> {
  const bookingSelection = {
    id: bookingInquiries.id,
    workspaceId: bookingInquiries.workspaceId,
    status: bookingInquiries.status,
    startAt: bookingInquiries.startAt,
    endAt: bookingInquiries.endAt,
    serviceName: services.name,
  }
  async function readBooking() {
    const [row] = await db.select(bookingSelection).from(bookingInquiries)
      .innerJoin(services, eq(services.id, bookingInquiries.serviceId))
      .where(eq(bookingInquiries.id, bookingId)).limit(1)
    return row
  }
  const booking = await readBooking()
  if (!booking) throw new Error('找不到預約')
  const [connection] = await db.select().from(googleCalendarConnections)
    .where(eq(googleCalendarConnections.workspaceId, booking.workspaceId)).limit(1)
  if (!connection) return 'not-connected'

  let token: string
  try {
    token = await accessToken(connection.refreshTokenEncrypted)
  } catch (error) {
    await db.update(googleCalendarConnections).set({ lastSyncError: 'Google 授權已失效，請重新連接。' })
      .where(eq(googleCalendarConnections.workspaceId, booking.workspaceId))
    throw error
  }
  const eventId = googleBookingEventId(booking.id)

  try {
    let current = booking
    // 確認後隨即取消／改期時，較舊的 HTTP 請求可能最後才完成。
    // 每次寫入後重讀資料；如已變更，立即把日曆修正為最新狀態。
    for (let attempt = 0; attempt < 3; attempt++) {
      if (current.status === 'CONFIRMED') {
        await putGoogleBookingEvent({
          calendarId: connection.calendarId,
          accessToken: token,
          event: {
            id: eventId,
            summary: `約課易 · ${current.serviceName}`,
            start: { dateTime: current.startAt.toISOString() },
            end: { dateTime: current.endAt.toISOString() },
            description: `由約課易建立。課堂資料及改期請在約課易處理：${process.env.NEXT_PUBLIC_APP_URL}/dashboard/inquiries?inquiry=${current.id}`,
          },
        })
      } else {
        await deleteGoogleBookingEvent({ calendarId: connection.calendarId, accessToken: token, eventId })
      }
      const latest = await readBooking()
      if (!latest) throw new Error('同步期間找不到預約')
      if (latest.status === current.status && latest.startAt.getTime() === current.startAt.getTime() && latest.endAt.getTime() === current.endAt.getTime() && latest.serviceName === current.serviceName) {
        return 'synced'
      }
      current = latest
    }
    throw new Error('課堂於同步期間多次變動，請稍後重新同步。')
  } catch (error) {
    await db.update(googleCalendarConnections).set({ lastSyncError: error instanceof Error ? error.message.slice(0, 200) : '同步失敗' })
      .where(eq(googleCalendarConnections.workspaceId, booking.workspaceId))
    throw error
  }
}

export async function syncGoogleCalendarBookingSafely(bookingId: string): Promise<void> {
  try {
    await syncGoogleCalendarBooking(bookingId)
  } catch (error) {
    console.error('[google-calendar] booking sync failed', bookingId, error instanceof Error ? error.message : 'unknown')
  }
}

export async function syncUpcomingGoogleCalendarBookings(workspaceId: string, afterId?: string, earlierFailed = false): Promise<{ synced: number; failed: number; nextCursor: string | null }> {
  const recentCancellation = new Date(Date.now() - 90 * 86_400_000)
  const rows = await db.select({ id: bookingInquiries.id }).from(bookingInquiries).where(and(
    eq(bookingInquiries.workspaceId, workspaceId),
    or(
      and(eq(bookingInquiries.status, 'CONFIRMED'), gt(bookingInquiries.startAt, new Date())),
      and(eq(bookingInquiries.status, 'CANCELLED'), gte(bookingInquiries.cancelledAt, recentCancellation)),
    ),
    afterId ? gt(bookingInquiries.id, afterId) : undefined,
  )).orderBy(asc(bookingInquiries.id)).limit(50)
  let synced = 0
  let failed = 0
  for (let start = 0; start < rows.length; start += 5) {
    const results = await Promise.allSettled(rows.slice(start, start + 5).map((row) => syncGoogleCalendarBooking(row.id)))
    for (const result of results) {
      if (result.status === 'fulfilled') synced++
      else failed++
    }
  }
  const nextCursor = rows.length === 50 ? rows[rows.length - 1]!.id : null
  // 個別課堂的成功不能清除另一堂課的失敗。只有完整重試無失敗才消除警告。
  if (!nextCursor && failed === 0 && !earlierFailed) {
    await db.update(googleCalendarConnections).set({ lastSyncError: null })
      .where(eq(googleCalendarConnections.workspaceId, workspaceId))
  }
  return { synced, failed, nextCursor }
}
