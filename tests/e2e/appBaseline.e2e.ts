import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'

const API_URL = 'https://e2e.invalid/v1'
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const AGENT_TEXT = 'E2E Agent 回复'

function responseJson(text: string) {
  return {
    id: 'resp-e2e',
    output: [{
      id: 'msg-e2e',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text }],
    }],
  }
}

function responseStream() {
  const output = responseJson(AGENT_TEXT).output
  return [
    'data: {"type":"response.created","response":{"id":"resp-e2e","output":[]}}',
    '',
    'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg-e2e","type":"message","role":"assistant","status":"in_progress","content":[]}}',
    '',
    'data: {"type":"response.output_text.delta","item_id":"msg-e2e","output_index":0,"delta":"E2E "}',
    '',
    'data: {"type":"response.output_text.delta","item_id":"msg-e2e","output_index":0,"delta":"Agent "}',
    '',
    'data: {"type":"response.output_text.delta","item_id":"msg-e2e","output_index":0,"delta":"回复"}',
    '',
    `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: output[0] })}`,
    '',
    `data: ${JSON.stringify({ type: 'response.completed', response: responseJson(AGENT_TEXT) })}`,
    '',
    'data: [DONE]',
    '',
  ].join('\n')
}

async function fulfillTitle(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(responseJson('<title>E2E 基线</title>')),
  })
}

function isTitleRequest(route: Route) {
  const body = route.request().postDataJSON() as { max_output_tokens?: number }
  return body.max_output_tokens === 32
}

async function openConfiguredApp(page: Page, apiMode: 'images' | 'responses') {
  const profile = {
    id: 'e2e-profile',
    name: 'E2E Profile',
    provider: 'openai',
    baseUrl: API_URL,
    apiKey: 'e2e-key',
    model: apiMode === 'images' ? 'gpt-image-e2e' : 'gpt-agent-e2e',
    timeout: 30,
    apiMode,
    codexCli: false,
    apiProxy: false,
    streamImages: apiMode === 'responses',
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
  await page.goto('/app')
  await expect(page.locator('[data-input-bar]')).toBeVisible()
  await expect(getEditor(page)).toBeVisible()
  await expect(page.getByRole('button', { name: '生成图像' })).toBeVisible()
}

function getEditor(page: Page) {
  return page.locator('[contenteditable][aria-label="描述你想生成的图片，可输入 @ 来指定参考图..."]')
}

function trackPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

async function expectComposerInsideViewport(page: Page) {
  const box = await page.locator('[data-input-bar]').boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1)
}

async function saveArtifact(name: string, data: string | Buffer) {
  const dir = resolve('output/playwright/baselines')
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, name), data)
}

test('桌面与移动端空状态基线截图无横向溢出', async ({ page }, testInfo) => {
  const errors = trackPageErrors(page)
  await openConfiguredApp(page, 'responses')
  await page.evaluate(async () => { await document.fonts.ready })
  await expectComposerInsideViewport(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await saveArtifact(
    `${testInfo.project.name}-gallery.png`,
    await page.screenshot({ animations: 'disabled', caret: 'hide' }),
  )

  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await expect(page.locator('[data-agent-workspace]')).toBeVisible()
  await expectComposerInsideViewport(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await saveArtifact(
    `${testInfo.project.name}-agent.png`,
    await page.screenshot({ animations: 'disabled', caret: 'hide' }),
  )
  expect(errors).toEqual([])
})

test('画廊提交会创建任务并显示 mock 图片', async ({ page }, testInfo) => {
  const errors = trackPageErrors(page)
  const requests: Array<Record<string, unknown>> = []
  await page.route(`${API_URL}/**`, async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ created: 1, data: [{ b64_json: PNG_BASE64 }] }),
    })
  })
  await openConfiguredApp(page, 'images')

  const prompt = '画廊基线：红色纸船'
  const editor = getEditor(page)
  await editor.fill(prompt)
  await expect(page.getByRole('button', { name: '生成图像' })).toBeEnabled()
  await page.getByRole('button', { name: '生成图像' }).click()

  await expect(page.locator('[data-home-main]').getByText(prompt, { exact: true })).toBeVisible()
  const image = page.locator('[data-home-main] .saveable-image')
  await expect(image).toBeVisible()
  expect(await image.evaluate((el) => {
    const img = el as HTMLImageElement
    return img.complete && img.naturalWidth > 0
  })).toBe(true)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ model: 'gpt-image-e2e', prompt })
  await expectComposerInsideViewport(page)

  await testInfo.attach('gallery-result', { body: await page.screenshot(), contentType: 'image/png' })
  expect(errors).toEqual([])
})

test('普通 Agent 文本消息完成同一输入框闭环', async ({ page }, testInfo) => {
  const errors = trackPageErrors(page)
  const requests: Array<Record<string, unknown>> = []
  let titleRequests = 0
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __wp0AgentWrites?: number
      __wp0AgentPendingWrites?: number
    }
    target.__wp0AgentWrites = 0
    target.__wp0AgentPendingWrites = 0
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (storeNames, mode, options) {
      const names = typeof storeNames === 'string' ? [storeNames] : storeNames
      const tx = options
        ? original.call(this, storeNames, mode, options)
        : original.call(this, storeNames, mode)
      if (mode === 'readwrite' && names.includes('agentConversations')) {
        target.__wp0AgentWrites = (target.__wp0AgentWrites ?? 0) + 1
        target.__wp0AgentPendingWrites = (target.__wp0AgentPendingWrites ?? 0) + 1
        const settle = () => {
          target.__wp0AgentPendingWrites = Math.max(0, (target.__wp0AgentPendingWrites ?? 1) - 1)
        }
        tx.addEventListener('complete', settle, { once: true })
        tx.addEventListener('abort', settle, { once: true })
      }
      return tx
    }
  })
  await page.route(`${API_URL}/**`, async (route) => {
    if (isTitleRequest(route)) {
      titleRequests += 1
      await fulfillTitle(route)
      return
    }
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: responseStream(),
    })
  })
  await openConfiguredApp(page, 'responses')

  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await expect(page.locator('[data-agent-workspace]')).toBeVisible()
  await page.evaluate(() => {
    (window as typeof window & { __wp0AgentWrites?: number }).__wp0AgentWrites = 0
  })
  const prompt = '请只回复基线文本'
  const editor = getEditor(page)
  await editor.fill(prompt)
  await expect(page.getByRole('button', { name: '生成图像' })).toBeEnabled()
  await page.getByRole('button', { name: '生成图像' }).click()

  const workspace = page.locator('[data-agent-workspace]')
  await expect(workspace.getByText(prompt, { exact: true })).toBeVisible()
  await expect(workspace.getByText(AGENT_TEXT, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'E2E 基线', exact: true })).toBeVisible()
  expect(titleRequests).toBe(1)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ model: 'gpt-agent-e2e', stream: true })
  expect(requests[0].tools).toBeInstanceOf(Array)
  expect(JSON.stringify(requests[0].input)).toContain(prompt)
  await expectComposerInsideViewport(page)

  let metrics = { writes: -1, pending: -1 }
  let stableReads = 0
  for (let i = 0; i < 20 && stableReads < 3; i += 1) {
    const next = await page.evaluate(() => {
      const target = window as typeof window & {
        __wp0AgentWrites?: number
        __wp0AgentPendingWrites?: number
      }
      return {
        writes: target.__wp0AgentWrites ?? 0,
        pending: target.__wp0AgentPendingWrites ?? 0,
      }
    })
    stableReads = next.pending === 0 && next.writes === metrics.writes ? stableReads + 1 : 0
    metrics = next
    await page.waitForTimeout(100)
  }
  await saveArtifact(
    `${testInfo.project.name}-agent-metrics.json`,
    JSON.stringify({ streamedDeltas: 3, agentConversationReadwriteTransactions: metrics.writes }, null, 2),
  )
  expect(metrics.pending).toBe(0)
  expect(metrics.writes).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('停止按钮会中止当前 Agent 请求并保留停止消息', async ({ page }) => {
  const errors = trackPageErrors(page)
  let requestAborted = false
  let markStarted = () => {}
  let release = () => {}
  const started = new Promise<void>((resolve) => { markStarted = resolve })
  const held = new Promise<void>((resolve) => { release = resolve })
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(API_URL)) requestAborted = true
  })
  await page.route(`${API_URL}/**`, async (route) => {
    if (isTitleRequest(route)) {
      await fulfillTitle(route)
      return
    }
    markStarted()
    await held
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: responseStream(),
    }).catch(() => {})
  })
  await openConfiguredApp(page, 'responses')

  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await expect(page.locator('[data-agent-workspace]')).toBeVisible()
  const editor = getEditor(page)
  await editor.fill('停止请求基线')
  await expect(page.getByRole('button', { name: '生成图像' })).toBeEnabled()
  await page.getByRole('button', { name: '生成图像' }).click()
  await started
  await page.getByRole('button', { name: '停止生成' }).click()
  release()

  await expect(page.locator('[data-agent-workspace]').getByText('已停止生成。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '生成图像' })).toBeDisabled()
  await expect.poll(() => requestAborted).toBe(true)
  expect(errors).toEqual([])
})

test('附件可以通过 @ 菜单写入稳定 mention 胶囊', async ({ page }) => {
  const errors = trackPageErrors(page)
  await page.goto('/app')
  await expect(page.locator('[data-input-bar]')).toBeVisible()

  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  })
  await expect(page.locator('[data-input-image-index="0"]')).toBeVisible()

  const editor = getEditor(page)
  await editor.fill('@')
  await expect(page.getByText('选择图片引用', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '@图1' }).click()

  await expect(editor.locator('.mention-tag')).toHaveText('@图1')
  expect(errors).toEqual([])
})
