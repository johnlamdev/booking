import { expect, test } from '@playwright/test'

test('首頁清楚表達查詢不等於預約', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /少一點來回問時間/ })).toBeVisible()
  await expect(page.getByText(/學生毋須註冊/).first()).toBeVisible()
  await expect(page.getByRole('link', { name: '獲邀老師登入' })).toHaveAttribute('href', '/login')
  await expect(page.getByRole('link', { name: '免費建立預約頁' })).toHaveCount(0)
})

test('登入頁只顯示獲邀老師所需操作', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: '登入' })).toBeVisible()
  await expect(page.getByLabel('電郵地址')).toBeVisible()
  await expect(page.getByLabel('密碼')).toBeVisible()
  await expect(page.getByRole('button', { name: '登入' })).toBeVisible()
  await expect(page.getByText('目前只限獲邀老師登入')).toBeVisible()
  await expect(page.getByRole('link', { name: '忘記密碼？' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '註冊' })).toHaveCount(0)
})

test('直接開啟已關閉帳號功能會得到清楚指引', async ({ page }) => {
  await page.goto('/signup')

  await expect(page.getByRole('heading', { name: '邀請測試進行中' })).toBeVisible()
  await expect(page.getByText(/暫未開放公開註冊/)).toBeVisible()
  await expect(page.getByRole('link', { name: '前往登入' })).toHaveAttribute('href', '/login')

  await page.goto('/forgot-password')

  await expect(page.getByRole('heading', { name: '密碼協助' })).toBeVisible()
  await expect(page.getByText(/暫停自助重設密碼/)).toBeVisible()
  await expect(page.getByRole('link', { name: '返回登入' })).toHaveAttribute('href', '/login')
})
