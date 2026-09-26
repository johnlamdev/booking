import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL 未設定，請參考 .env.example')
}

/** 本機測試資料庫（Docker Postgres）不提供 TLS，只有遠端連線才要求 SSL。 */
function requiresSsl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return !['localhost', '127.0.0.1', '::1', 'postgres-test'].includes(hostname)
  } catch {
    return true
  }
}

/**
 * Supabase transaction pooler（port 6543）不支援 prepared statements，
 * 故必須設 prepare: false。見 docs/DESIGN.md §3.4。
 *
 * dev 環境下 Next.js 的 hot reload 會重複執行模組，用 global 快取避免連線數暴增。
 */
const globalForDb = globalThis as unknown as {
  __bookingSql?: ReturnType<typeof postgres>
}

const client =
  globalForDb.__bookingSql ??
  postgres(connectionString, {
    prepare: false,
    ssl: requiresSsl(connectionString) ? 'require' : false,
    max: 10,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__bookingSql = client
}

export const db = drizzle(client, { schema })
export { schema }
export type Db = typeof db
