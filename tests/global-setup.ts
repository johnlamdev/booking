import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

/**
 * 整合測試的全域準備：把測試資料庫清空並跑一次完整 migration。
 *
 * 這裡會 DROP SCHEMA，是破壞性操作，因此設有硬性防護：
 * 只允許連向本機的測試資料庫。任何指向遠端（例如 Supabase）的連線都會被拒絕。
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres-test'])

function assertSafeTestDatabase(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('TEST_DATABASE_URL 不是合法的連線字串')
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `拒絕在非本機資料庫上執行整合測試（host=${parsed.hostname}）。` +
        'TEST_DATABASE_URL 必須指向本機的 Docker Postgres。',
    )
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error('TEST_DATABASE_URL 不可與 DATABASE_URL 相同，測試會清空整個 schema。')
  }
}

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL

  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL 未設定。請先執行 `pnpm test:db:up`，並參考 .env.example 設定。',
    )
  }

  assertSafeTestDatabase(url)

  const sql = postgres(url, { max: 1, onnotice: () => {} })

  try {
    // 每次測試由乾淨 schema 開始，避免殘留資料造成偽陽性。
    //
    // 必須連 `drizzle` schema 一併清掉：migration 紀錄表放在那裡，
    // 只 drop public 的話 migrate() 會誤以為全部已套用而略過，導致資料表不存在。
    await sql`drop schema if exists public cascade`
    await sql`drop schema if exists drizzle cascade`
    await sql`create schema public`

    await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  } finally {
    await sql.end({ timeout: 5 })
  }
}
