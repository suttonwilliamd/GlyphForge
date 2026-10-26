import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'

// A built demo only; no external host, fixed port, credentials or browser install.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'artifacts', 'browser-smoke')
const results = []
const pageErrors = []
let browser
let server
let failure
await mkdir(output, { recursive: true })
try {
  server = await preview({
    root, configFile: false,
    preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
  })
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GLYPHFORGE_BROWSER_EXECUTABLE || undefined,
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort())
  async function open() {
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Download PNG', exact: true }).waitFor()
    await page.evaluate(() => document.fonts.ready)
  }
  async function range(label, delta) {
    const control = page.getByLabel(label)
    const before = Number(await control.inputValue())
    await control.focus()
    for (let i = 0; i < Math.abs(delta); i++) {
      await control.press(delta > 0 ? 'ArrowRight' : 'ArrowLeft')
    }
    assert.equal(Number(await control.inputValue()), before + delta)
  }
  async function download(name) {
    const pending = page.waitForEvent('download', { timeout: 10000 })
    await page.getByRole('button', { name: 'Download PNG', exact: true }).click()
    const download = await pending
    assert.equal(download.suggestedFilename(), 'glyphforge-1000x700.png')
    const filename = path.join(output, `${name}.png`)
    await download.saveAs(filename)
    assert.equal(await download.failure(), null)
    const bytes = await readFile(filename)
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(bytes.subarray(12, 16).toString(), 'IHDR')
    assert.equal(bytes.readUInt32BE(16), 1000)
    assert.equal(bytes.readUInt32BE(20), 700)
    const canvas = page.locator('canvas.editor-canvas')
    const previewPng = await canvas.evaluate(c => c.toDataURL('image/png'))
    assert.ok(bytes.equals(Buffer.from(previewPng.split(',')[1], 'base64')),
      'actual downloaded PNG must equal the current preview canvas')
    const pixels = await canvas.evaluate(c => {
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let ink = 0, white = 0, transparent = 0, handleBlue = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) ink++
        else white++
        if (data[i + 3] !== 255) transparent++
        if (data[i] === 37 && data[i + 1] === 99 && data[i + 2] === 235) handleBlue++
      }
      return { corner: Array.from(data.slice(0, 4)), ink, white, transparent, handleBlue }
    })
    assert.deepEqual(pixels.corner, [255, 255, 255, 255])
    assert.ok(pixels.white > 600000, 'white background')
    assert.ok(pixels.ink > 100, 'nonempty rendered text')
    assert.equal(pixels.transparent, 0)
    assert.equal(pixels.handleBlue, 0, 'no editor handle color in export')
    await page.screenshot({ path: path.join(output, `${name}-screen.png`) })
    results.push({ case: name, bytes: bytes.length, width: 1000, height: 700,
      sha256: createHash('sha256').update(bytes).digest('hex'), pixelEqualToPreview: true, ...pixels })
  }
  await open()
  const x = page.getByLabel('X position (px)')
  const y = page.getByLabel('Y position (px)')
  for (const [control, below, above, maximum] of [[x, '-10', '1200', '1000'], [y, '-10', '900', '700']]) {
    await control.fill(below)
    assert.equal(await control.inputValue(), '0')
    await control.fill(above)
    assert.equal(await control.inputValue(), maximum)
  }
  // Restore the untouched default composition after exercising real DOM clamps.
  await open()
  await download('default-vertical')
  await page.setViewportSize({ width: 768, height: 900 })
  await page.screenshot({ path: path.join(output, 'narrow-768-screen.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await open()
  await page.getByLabel('Content').fill('HELLO\nPNG')
  await page.getByLabel('Direction').selectOption('horizontal')
  await range(/Letter Spacing:/, -8)
  await range(/Rotation:/, 45)
  await x.fill('300')
  await y.fill('200')
  await download('multiline-negative-spacing-rotated')
  await open()
  await page.getByLabel('Content').fill('UPRIGHT')
  await page.getByLabel('Direction').selectOption('vertical_up')
  await page.getByLabel('Keep characters upright').check()
  await range(/Rotation:/, 45)
  await x.fill('300')
  await y.fill('500')
  await download('vertical-up-upright-rotated')
  assert.equal(new Set(results.map(result => result.sha256)).size, 3)
  assert.deepEqual(pageErrors, [])
} catch (error) {
  failure = error
} finally {
  try {
    if (browser) await browser.close()
  } finally {
    if (server) {
      server.httpServer.closeAllConnections?.()
      await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
    }
    await writeFile(path.join(output, 'results.json'), JSON.stringify({
      passed: !failure, platform: process.platform, browser: 'Chromium',
      evidenceLimit: 'Automated browser smoke; not owner interactive Edge/native-device acceptance',
      results, pageErrors, failure: failure ? String(failure) : null,
    }, null, 2) + '\n')
  }
}
if (failure) throw failure
console.log(`Browser PNG smoke passed: ${results.length} cases; evidence in ${output}`)
