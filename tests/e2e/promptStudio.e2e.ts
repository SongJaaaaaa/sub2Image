import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'

const API_URL = 'https://wp9-r.e2e.invalid/v1'
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

const interview = {
  phase: 'interview',
  message: '再确认构图与焦点。',
  briefPatch: [
    { field: 'goal.purpose', value: '科技品牌主视觉', status: 'answered', origin: 'source', locked: false },
    { field: 'goal.intent', value: '突出 AI 产品质感', status: 'answered', origin: 'source', locked: false },
    { field: 'subject.type', value: '抽象 AI 核心装置', status: 'answered', origin: 'source', locked: false },
    { field: 'subject.count', value: 1, status: 'answered', origin: 'source', locked: false },
    { field: 'subject.appearance', value: '液态玻璃包裹黑银金属核心', status: 'answered', origin: 'source', locked: false },
    { field: 'scene.type', value: '极简摄影棚', status: 'answered', origin: 'source', locked: false },
    { field: 'scene.environment', value: '中性灰背景', status: 'answered', origin: 'source', locked: false },
    { field: 'visual.style', value: '未来主义产品广告', status: 'answered', origin: 'source', locked: false },
    { field: 'visual.medium', value: '3D 渲染', status: 'answered', origin: 'source', locked: false },
    { field: 'text.enabled', value: false, status: 'answered', origin: 'source', locked: false },
    { field: 'logo.enabled', value: false, status: 'answered', origin: 'source', locked: false },
    { field: 'output.aspectRatio', value: '4:5', status: 'answered', origin: 'source', locked: false },
    { field: 'output.size', value: '1024x1280', status: 'answered', origin: 'source', locked: false },
  ],
  questions: [
    {
      id: 'shot',
      field: 'composition.shot',
      text: '画面采用什么景别？',
      input: 'single',
      options: [{ label: '产品近景', value: '近景' }, { label: '完整装置', value: '全景' }],
      required: true,
    },
    {
      id: 'focus',
      field: 'composition.focus',
      text: '视觉焦点放在哪里？',
      input: 'single',
      options: [{ label: '液态表面', value: '液态表面高光' }, { label: '金属核心', value: '黑银金属核心' }],
      required: true,
    },
  ],
}

const artifact = {
  domain: 'image',
  title: '液态 AI 核心主视觉',
  prompt: '以 @图1 为参考，极简中性灰摄影棚内，一枚黑银 3D 金属 AI 核心被透明液态玻璃包裹，产品近景，视觉焦点落在金属核心。',
  negativePrompt: '文字，Logo，杂乱背景',
  params: [],
  shotList: null,
}

function responseJson(output: unknown) {
  return {
    id: 'wp9-r-response',
    status: 'completed',
    output: [{
      id: 'wp9-r-message',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(output) }],
    }],
  }
}

async function openApp(page: Page) {
  const profile = {
    id: 'wp9-r-profile',
    name: 'WP9-R Profile',
    provider: 'openai',
    baseUrl: API_URL,
    apiKey: 'wp9-r-key',
    model: 'gpt-wp9-r',
    timeout: 30,
    apiMode: 'responses',
    codexCli: false,
    apiProxy: false,
    streamImages: false,
    streamPartialImages: 0,
  }
  await page.addInitScript((value) => {
    localStorage.setItem('gpt-image-playground', JSON.stringify({
      version: 3,
      state: {
        settings: {
          profiles: [value],
          activeProfileId: value.id,
          agentApiConfigMode: 'off',
          agentTextProfileId: value.id,
          agentImageProfileId: value.id,
        },
      },
    }))
  }, profile)
  await page.route('https://fontsapi.zeoseven.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.route('https://cdn.jsdelivr.net/npm/@lobehub/webfont-harmony-sans-sc@1.0.0/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.goto('/app')
  await expect(page.locator('[data-conversation-composer]')).toBeVisible()
}

async function expectSingleComposer(page: Page) {
  expect(await page.locator('[data-input-bar]').count()).toBe(0)
  expect(await page.locator('[data-prompt-studio-workspace]').count()).toBe(0)
  expect(await page.locator('[data-conversation-composer]').count()).toBeLessThanOrEqual(1)
  const dock = await page.locator('[data-conversation-composer-dock]').boundingBox()
  const viewport = page.viewportSize()
  expect(dock).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(dock!.x).toBeGreaterThanOrEqual(-1)
  expect(dock!.x + dock!.width).toBeLessThanOrEqual(viewport!.width + 1)
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(viewport!.height + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

async function screenshot(page: Page, name: string) {
  const dir = resolve('output/playwright')
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, name), animations: 'disabled' })
}

test('WP9-R 单 Composer 问答、暂停恢复、设置同步和生成回填', async ({ page }, testInfo) => {
  const errors: string[] = []
  let requests = 0
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route(`${API_URL}/**`, async (route: Route) => {
    requests += 1
    const body = route.request().postDataJSON() as { text?: { format?: { name?: string } } }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseJson(body.text?.format?.name === 'prompt_artifact_v1' ? artifact : interview)),
    })
  })
  await openApp(page)

  const editor = page.locator('[contenteditable][aria-label="图片提示词输入"]')
  await editor.fill('为 AI 产品制作液态玻璃与黑银金属主视觉')
  await page.locator('[data-new-composer-file-input]').setInputFiles({
    name: 'wp9-r-reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  })
  await page.getByRole('button', { name: '图片设置' }).click()
  const settings = page.locator('[data-composer-settings]')
  await page.getByRole('button', { name: '比例 16:9' }).click()
  await page.getByRole('button', { name: '分辨率 2K' }).click()
  await page.getByRole('button', { name: '生成数量 x2' }).click()
  await settings.click({ position: { x: 1, y: 1 } })

  await page.locator('.cc-agent-button').click()
  await expect(page.locator('.cc-agent-button')).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toBeVisible()
  await expect(page.locator('[data-prompt-agent-card]')).toHaveCount(0)
  expect(requests).toBe(0)
  await screenshot(page, `wp9-r-${testInfo.project.name}-agent-selected.png`)
  await page.getByRole('button', { name: '发送到图片提示词 Agent' }).click()
  await expect(page.locator('[data-prompt-agent-card]')).toBeVisible()
  await expect(page.getByText('画面采用什么景别？')).toBeVisible()
  await expectSingleComposer(page)
  const card = await page.locator('[data-prompt-agent-card]').boundingBox()
  expect(card!.height).toBeLessThanOrEqual(400)
  await screenshot(page, `wp9-r-${testInfo.project.name}-question.png`)

  await page.getByRole('button', { name: '产品近景' }).click()
  await expect(page.getByText('视觉焦点放在哪里？')).toBeVisible()

  await page.getByRole('button', { name: '暂停并关闭提示词 Agent' }).click()
  await expect(editor).toBeVisible()
  await page.waitForTimeout(650)
  await page.reload()
  await expect(page.locator('[contenteditable][aria-label="图片提示词输入"]')).toBeVisible()
  await page.locator('.cc-agent-button').click()
  await page.getByRole('button', { name: '发送到图片提示词 Agent' }).click()
  await expect(page.getByText('视觉焦点放在哪里？')).toBeVisible()
  await page.getByRole('button', { name: '金属核心' }).click()

  const restoredEditor = page.locator('[contenteditable][aria-label="图片提示词输入"]')
  await expect(restoredEditor).toBeVisible()
  await expect(restoredEditor).toContainText('黑银 3D 金属 AI 核心')
  await expect(page.locator('[data-conversation-attachments] img[alt="参考图1"]')).toBeVisible()
  expect(await page.locator('[data-task-id]').count()).toBe(0)
  expect(requests).toBe(2)
  await expectSingleComposer(page)
  await screenshot(page, `wp9-r-${testInfo.project.name}-result.png`)

  await page.locator('[data-conversation-composer-dock] [title="图片设置"]').click()
  await expect(page.getByRole('button', { name: '比例 16:9' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '分辨率 2K' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '生成数量 x2' })).toHaveAttribute('aria-pressed', 'true')
  await screenshot(page, `wp9-r-${testInfo.project.name}-settings.png`)
  await settings.click({ position: { x: 1, y: 1 } })

  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 844, height: 390 })
    await expectSingleComposer(page)
    await screenshot(page, 'wp9-r-landscape-result.png')
  }
  expect(errors).toEqual([])
})
