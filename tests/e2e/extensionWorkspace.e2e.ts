import { expect, test, type Page } from '@playwright/test'

async function openApp(page: Page) {
  await page.route('https://fontsapi.zeoseven.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.route('https://cdn.jsdelivr.net/npm/@lobehub/webfont-harmony-sans-sc@1.0.0/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.goto('/app')
  await expect(page.locator('[data-app-header]')).toBeVisible()
}

test('拓展工作区支持导航、浏览器后退和返回原应用', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await openApp(page)
  await page.getByRole('button', { name: '打开拓展工作区', exact: true }).click()

  await expect(page).toHaveURL(/\/app\/extensions$/)
  await expect(page.locator('[data-extension-workspace]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tools', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Skills', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/extensions\/skills$/)
  await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/app\/extensions$/)
  await expect(page.getByRole('heading', { name: 'Tools', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '返回原应用', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.locator('[data-app-header]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(errors).toEqual([])
})
