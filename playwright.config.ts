import { defineConfig, devices } from '@playwright/test'

const port = 3_100
const baseURL = `http://127.0.0.1:${port}`
const fullFlowEnabled = Boolean(
  process.env.E2E_TEST_TEACHER_EMAIL &&
    process.env.E2E_TEST_TEACHER_PASSWORD &&
    process.env.E2E_TEST_WORKSPACE_SLUG,
)
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)

if (!fullFlowEnabled) {
  // 公開頁 smoke tests 不應因本機 Supabase 連線狀態而變得不穩定。
  webServerEnv.NEXT_PUBLIC_SUPABASE_URL = ''
  webServerEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // 直接使用已安裝的 binary，避免本機全域 pnpm 版本影響 E2E runner。
    command: `./node_modules/.bin/next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: webServerEnv,
  },
})
