import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const baseUrl = process.env.GLYPHFORGE_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = path.resolve('artifacts', 'files')
const browser = await chromium.launch({ headless: true })
await mkdir(outputDir, { recursive: true })
try {
  for (const profile of [
    { name: 'desktop', options: { viewport: { width: 1600, height: 1000 } } },
    { name: 'iphone-13', options: devices['iPhone 13'] },
  ]) {
    const context = await browser.newContext(profile.options)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(baseUrl)
      const status = page.getByRole('status', { name: 'Project file status', exact: true })
      const input = page.getByLabel('Open project', { exact: true })
      const activate = (locator) => profile.options.isMobile ? locator.tap() : locator.click()
      const upload = (project, name = 'edited.json') => input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof project === 'string' ? project : JSON.stringify(project)) })
      const download = async (label, suffix) => {
        const pending = page.waitForEvent('download')
        await activate(page.getByRole('button', { name: label, exact: true }))
        const file = await pending
        assert.equal(await file.failure(), null)
        const target = path.join(outputDir, `${profile.name}-${suffix}`)
        await file.saveAs(target)
        return readFile(target)
      }
      assert.equal(await status.evaluate((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0), true, 'empty live region remains exposed')
      if (profile.options.isMobile) await activate(page.locator('summary'))
      await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Portable 🌻\nGlyphForge')
      await page.getByLabel('Font Family', { exact: true }).fill('Georgia, serif')
      await page.getByRole('combobox', { name: 'Direction', exact: true }).selectOption('horizontal')
      await page.getByLabel('Keep characters upright').check()
      await page.getByRole('button', { name: 'Move text', exact: true }).focus()
      await page.keyboard.press('Shift+ArrowRight')
      const saved = JSON.parse((await download('Save project', 'original.json')).toString())
      assert.equal(saved.layers[0].content, 'Portable 🌻\nGlyphForge')
      assert.equal(saved.layers[0].x, 150)
      // Exercise all renderer-supported properties, including those without UI controls.
      saved.document.background = '#cceedd'
      Object.assign(saved.layers[0], { opacity: 83, fontStyle: 'italic', fontWeight: 700, lineHeight: 1.8, rotation: 23, letterSpacing: -2, color: '#492d7f' })
      await upload(saved)
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      const originalPixels = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
      if (profile.options.isMobile && await page.locator('details').getAttribute('open') === null) await activate(page.locator('summary'))
      await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Unsaved replacement')
      await input.setInputFiles(path.join(outputDir, `${profile.name}-original.json`))
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      assert.equal(await page.getByRole('textbox', { name: 'Content', exact: true }).inputValue(), saved.layers[0].content)
      await upload(saved)
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      const roundtrip = JSON.parse((await download('Save project', 'roundtrip.json')).toString())
      assert.deepEqual(roundtrip, saved, 'all logical document/layer fields roundtrip exactly')
      assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), originalPixels)
      const assertPng = async (buffer) => {
        const pixels = await page.evaluate(async (base64) => {
          const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
          const bitmap = await createImageBitmap(blob)
          const decoded = document.createElement('canvas')
          decoded.width = bitmap.width
          decoded.height = bitmap.height
          const ctx = decoded.getContext('2d')
          ctx.drawImage(bitmap, 0, 0)
          const actual = ctx.getImageData(0, 0, decoded.width, decoded.height).data
          const canvas = document.querySelector('canvas')
          const expected = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
          let differences = 0
          let ink = 0
          for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) differences++
          for (let i = 0; i < actual.length; i += 4) if (actual[i] !== 204 || actual[i + 1] !== 238 || actual[i + 2] !== 221) ink++
          bitmap.close()
          return { width: decoded.width, height: decoded.height, differences, ink, corner: Array.from(actual.slice(0, 4)) }
        }, buffer.toString('base64'))
        assert.deepEqual([pixels.width, pixels.height], [1000, 700])
        assert.equal(pixels.differences, 0, 'every downloaded PNG RGBA byte matches original document canvas')
        assert.deepEqual(pixels.corner, [204, 238, 221, 255], 'document background is exported')
        assert.ok(pixels.ink > 100, 'actual rendered text pixels are present')
      }
      const fitPng = await download('Export PNG', 'fit.png')
      await assertPng(fitPng)
      if (profile.options.isMobile && await page.locator('details').getAttribute('open') !== null) await activate(page.locator('summary'))
      for (let i = 0; i < 6; i++) await activate(page.getByRole('button', { name: 'Zoom in', exact: true }))
      await activate(page.getByRole('button', { name: 'Pan view', exact: true }))
      await page.locator('.canvas-viewport').focus()
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowDown')
      const pannedTransform = await page.locator('canvas').evaluate((el) => el.style.transform)
      const pannedPng = await download('Export PNG', 'panned.png')
      await assertPng(pannedPng)
      assert.deepEqual(pannedPng, fitPng, 'pan/zoom do not contaminate encoded PNG')
      for (const bad of ['{broken', { ...saved, version: 99 }, { ...saved, layers: [...saved.layers, saved.layers[0]] }]) {
        await upload(bad)
        await status.filter({ hasText: 'Current document unchanged' }).waitFor()
        assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), originalPixels, 'malformed import preserves rendered composition')
        assert.equal(await page.locator('canvas').evaluate((el) => el.style.transform), pannedTransform, 'failed import preserves view')
        assert.deepEqual(JSON.parse((await download('Save project', 'after-invalid.json')).toString()), saved)
      }
      // Delay actual File.text reads to expose selection, editing and stale-error races.
      await page.evaluate(() => {
        const read = File.prototype.text
        window.pendingReads = []
        File.prototype.text = function () {
          if (!this.name.startsWith('slow')) return read.call(this)
          return new Promise((resolve, reject) => window.pendingReads.push({ resolve: async () => resolve(await read.call(this)), reject }))
        }
      })
      const stale = structuredClone(saved)
      stale.layers[0].content = 'Must not overwrite newer file'
      await upload(stale, 'slow-old.json')
      await upload(saved, 'newest.json')
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      await page.evaluate(() => window.pendingReads.shift().resolve())
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.equal(await page.locator('textarea').inputValue(), saved.layers[0].content)
      await upload(stale, 'slow-failure.json')
      await upload(saved)
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      await page.evaluate(() => window.pendingReads.shift().reject(new Error('Stale disk failure')))
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.match(await status.textContent(), /Project loaded/)
      if (profile.options.isMobile) await activate(page.locator('summary'))
      await upload(stale, 'slow-edit.json')
      await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Newer local edit')
      await page.evaluate(() => window.pendingReads.shift().resolve())
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.equal(await page.getByRole('textbox', { name: 'Content', exact: true }).inputValue(), 'Newer local edit')
      await upload(saved)
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      assert.notEqual(await page.locator('canvas').evaluate((el) => el.style.transform), pannedTransform, 'successful import fits view')
      assert.equal(await page.getByRole('button', { name: 'Pan view', exact: true }).getAttribute('aria-pressed'), 'false')
      // Hold a genuine pointer gesture while a file is imported, then move the old pointer.
      const handle = page.getByRole('button', { name: 'Move text', exact: true })
      await handle.scrollIntoViewIfNeeded()
      const box = await handle.boundingBox()
      await page.mouse.move(box.x + 22, box.y + 22)
      await page.mouse.down()
      assert.equal(await handle.evaluate((el) => el.classList.contains('dragging')), true)
      await upload(saved)
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      assert.equal(await handle.evaluate((el) => el.classList.contains('dragging')), false)
      await page.mouse.move(box.x + 80, box.y + 80)
      await page.mouse.up()
      assert.deepEqual(JSON.parse((await download('Save project', 'after-gesture.json')).toString()), saved, 'old captured gesture cannot mutate imported document')
      await page.evaluate(() => {
        window.originalToBlob = HTMLCanvasElement.prototype.toBlob
        HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null) }
      })
      await activate(page.getByRole('button', { name: 'Export PNG', exact: true }))
      await status.filter({ hasText: 'could not encode' }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Export PNG', exact: true }).isEnabled(), true)
      await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.originalToBlob })
      await upload('{malformed')
      await status.filter({ hasText: 'Current document unchanged' }).waitFor()
      await page.screenshot({ path: path.join(outputDir, `${profile.name}-invalid-preserved.png`), fullPage: true })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      assert.deepEqual(errors, [])
      console.log(`PASS ${profile.name}: real JSON download/edit/import exact roundtrip; PNG 1000x700 full RGBA equality/background/ink; view isolation; malformed preservation; file/edit/error races; gesture cancellation; encoding failure; exposed live status`)
    } catch (error) {
      await page.screenshot({ path: path.join(outputDir, `${profile.name}-failure.png`), fullPage: true })
      throw error
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
