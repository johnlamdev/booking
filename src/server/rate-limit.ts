import 'server-only'

import { createHash } from 'node:crypto'

import { and, eq, gte, sql } from 'drizzle-orm'
import { headers } from 'next/headers'

import { db } from '@/server/db'
import { rateLimitHits } from '@/server/db/schema'

/**
 * 公開 endpoint 的限流（規格 §8.7、§13.2）。
 *
 * 以資料表計數而非 in-memory：serverless 環境每個請求可能落在不同執行個體，
 * 記憶體計數形同虛設。也刻意不引入 Redis / Upstash，避免為 MVP 增加付費依賴。
 */

/**
 * 只存 IP 的雜湊，不存原始 IP。
 * 限流只需要「是否同一來源」，不需要知道來源是誰（規格 §13.3）。
 */
async function requestBucket(scope: string): Promise<string> {
  const headerList = await headers()
  const configuredHeader = process.env.RATE_LIMIT_IP_HEADER?.trim().toLowerCase()
  const trustedHeader =
    configuredHeader && /^[a-z0-9-]+$/.test(configuredHeader) ? configuredHeader : null

  // production 只信任部署時明確指定、且由 edge/proxy 覆寫的 header。
  // 不指定便 fail closed：所有來源共用一個 bucket，避免攻擊者自行偽造 XFF 繞過限流。
  const rawIp = trustedHeader
    ? headerList.get(trustedHeader)
    : process.env.NODE_ENV === 'production'
      ? null
      : headerList.get('x-forwarded-for') || headerList.get('x-real-ip')
  const ip = rawIp?.split(',')[0]?.trim() || 'unknown'

  return `${scope}:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }

/**
 * 檢查並記錄一次請求。
 *
 * 採固定視窗計數：實作簡單，對「阻擋自動化濫用」這個目的已足夠精確。
 */
export async function checkRateLimit(params: {
  scope: string
  limit: number
  windowSeconds: number
}): Promise<RateLimitResult> {
  const { scope, limit, windowSeconds } = params
  const bucket = await requestBucket(scope)
  const windowStart = new Date(Date.now() - windowSeconds * 1000)

  return db.transaction(async (tx) => {
    // 同一 bucket 的檢查與寫入必須排隊，否則併發請求可一起通過 count 檢查。
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${bucket}, 0))`)

    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rateLimitHits)
      .where(and(eq(rateLimitHits.bucket, bucket), gte(rateLimitHits.createdAt, windowStart)))

    if ((row?.count ?? 0) >= limit) {
      return { allowed: false, retryAfterSeconds: windowSeconds }
    }

    await tx.insert(rateLimitHits).values({ bucket })

    return { allowed: true, retryAfterSeconds: 0 }
  })
}

/**
 * 清除過期的限流紀錄。
 * 由 pg_cron 定期呼叫；不執行也只是資料表變大，不影響正確性。
 */
export async function pruneRateLimitHits(olderThanSeconds = 86_400): Promise<void> {
  await db
    .delete(rateLimitHits)
    .where(sql`${rateLimitHits.createdAt} < now() - make_interval(secs => ${olderThanSeconds})`)
}
