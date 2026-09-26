import { expect, test } from '@playwright/test'

const teacherEmail = process.env.E2E_TEST_TEACHER_EMAIL
const teacherPassword = process.env.E2E_TEST_TEACHER_PASSWORD
const workspaceSlug = process.env.E2E_TEST_WORKSPACE_SLUG
const hasSeededWorkspace = Boolean(teacherEmail && teacherPassword && workspaceSlug)

test.describe('完整預約生命週期', () => {
  test.skip(!hasSeededWorkspace, '需要預置老師帳號、已發佈 workspace 及未來可用時段')

  test('學生提交，老師確認後取消，學生狀態頁同步更新', async ({ page }) => {
    const studentName = `E2E Student ${Date.now()}`
    const cancellationReason = 'E2E 測試取消'

    await page.goto(`/book/${workspaceSlug}`)
    const firstTime = page.locator('section[aria-labelledby="public-times-heading"] button').first()
    await expect(firstTime).toBeVisible()
    await firstTime.click()
    await page.getByRole('link', { name: '下一步' }).click()

    await page.getByLabel('你的姓名').fill(studentName)
    await page.getByLabel('電話 / WhatsApp').fill('90000000')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: '提交預約查詢' }).click()
    await expect(page.getByRole('heading', { name: '預約查詢狀態' })).toBeVisible()
    await expect(page.getByText('等待老師確認')).toBeVisible()
    const statusUrl = page.url()

    await page.goto('/login')
    await page.getByLabel('電郵地址').fill(teacherEmail!)
    await page.getByLabel('密碼').fill(teacherPassword!)
    await page.getByRole('button', { name: '登入' }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto('/dashboard/inquiries?status=PENDING')
    const pendingCard = page.locator('li').filter({ hasText: studentName })
    await expect(pendingCard).toBeVisible()
    await pendingCard.getByRole('button', { name: '確認', exact: true }).click()
    await pendingCard.getByRole('button', { name: '確定確認' }).click()
    await expect(pendingCard.getByText('已確認。', { exact: true })).toBeVisible()

    await page.goto(statusUrl)
    await expect(page.getByText('老師已確認你的預約')).toBeVisible()

    await page.goto('/dashboard/inquiries?status=CONFIRMED')
    const confirmedCard = page.locator('li').filter({ hasText: studentName })
    await expect(confirmedCard).toBeVisible()
    await confirmedCard.getByRole('button', { name: '取消預約' }).click()
    await confirmedCard.getByLabel('取消原因').fill(cancellationReason)
    await confirmedCard.getByRole('button', { name: '確定取消預約' }).click()
    await expect(confirmedCard.getByText(/預約已取消/)).toBeVisible()

    await page.goto(statusUrl)
    await expect(page.getByText('老師已取消這次預約')).toBeVisible()
    await expect(page.getByText(cancellationReason)).toBeVisible()
  })
})
