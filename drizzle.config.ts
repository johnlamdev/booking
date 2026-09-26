import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit 不會自動讀 .env.local
loadEnv({ path: '.env.local', quiet: true })

const url = process.env.DIRECT_DATABASE_URL

if (!url) {
  throw new Error('DIRECT_DATABASE_URL 未設定，請參考 .env.example')
}

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  // 業務資料只放 public schema；auth schema 由 Supabase 管理，不納入 migration
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
})
