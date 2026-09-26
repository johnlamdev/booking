import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vitest/config'

loadEnv({ path: '.env.local', quiet: true })

const testDatabaseUrl = process.env.TEST_DATABASE_URL

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    // 併發測試會刻意競爭同一批資料列，必須序列執行避免互相污染
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      // 受測程式讀的是 DATABASE_URL；在整合測試中一律指向本機測試資料庫
      DATABASE_URL: testDatabaseUrl ?? '',
      TEST_DATABASE_URL: testDatabaseUrl ?? '',
    },
  },
  resolve: {
    alias: [
      // `server-only` 在 RSC 以外會直接 throw，測試環境以空模組取代
      { find: /^server-only$/, replacement: fileURLToPath(new URL('./tests/stub-empty.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
})
