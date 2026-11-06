import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const baseUrl = process.env.GLYPHFORGE_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = path.resolve('artifacts', 'mobile')
const profiles = [
  { name: 'desktop', options: { viewport: { width: 1600, height: 1000 } } },
  { name: 'iphone-13', options: devices['iPhone 13'] },
  { name: 'pixel-7', options: devices['Pixel 7'] },
]

async function position(page) {
  const text = await page.locator('#text-position').textContent()
  const [, x, y] = text.match(/X (\d+), Y (\d+)/)
  return { x: Number(x), y: Number(y) }
}

async function geometry(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas').getBoundingClientRect()
    const viewport = document.querySelector('.canvas-viewport').getBoundingClientRect()
    const handle = document.querySelector('.text-handle').getBoundingClientRect()
    return { scale: canvas.width / 1000, canvas: { x: canvas.x, y: canvas.y }, viewport: { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height }, handle: { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2, width: handle.width, height: handle.height }, scrollY }
  })
}

async function checkLayout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page overflow')
  const g = await geometry(page)
  const p = await position(page)
  assert.ok(Math.abs(g.handle.x - (g.canvas.x + p.x * g.scale)) < 1, 'handle X aligns with logical origin')
  assert.ok(Math.abs(g.handle.y - (g.canvas.y + p.y * g.scale)) < 1, 'handle Y aligns with logical origin')
  assert.ok(g.handle.width >= 44 && g.handle.height >= 44, 'handle target is at least 44px at any zoom')
  const badControls = await page.locator('button, input, select, textarea, summary').evaluateAll((elements) => elements.filter((el) => el.getClientRects().length && (el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44)).map((el) => el.outerHTML))
  assert.deepEqual(badControls, [], 'visible controls meet 44px minimum')
  assert.equal(await page.locator('input, select, textarea').evaluateAll((els) => els.every((el) => el.labels.length > 0)), true, 'every form control has a label')
}

async function drag(page, session, from, delta, touch, cancel = false) {
  if (touch) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
    for (let step = 1; step <= 6; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + delta.x * step / 6, y: from.y + delta.y * step / 6, id: 1 }] })
    }
    await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
  } else {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 6 })
    await page.mouse.up()
  }
}

const browser = await chromium.launch({ headless: true })
try {
  await mkdir(outputDir, { recursive: true })
  for (const profile of profiles) {
    const context = await browser.newContext(profile.options)
    const page = await context.newPage()
    const session = await context.newCDPSession(page)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle' })
      const touch = Boolean(profile.options.isMobile)
      const activate = async (locator) => touch ? locator.tap() : locator.click()
      const viewport = page.locator('.canvas-viewport')
      const handle = page.getByRole('button', { name: 'Move text', exact: true })
      const fit = page.getByRole('button', { name: 'Fit to view', exact: true })
      await checkLayout(page)
      if (touch) {
        assert.equal(await page.locator('details').getAttribute('open'), null, 'phone controls start collapsed')
        await activate(page.locator('summary'))
      }
      await page.getByLabel('Content').fill('PHONE\nEDIT')
      const originalPixels = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
      for (const direction of ['horizontal', 'vertical_up', 'vertical_down']) {
        await page.getByLabel('Direction').selectOption(direction)
        assert.equal(await page.getByLabel('Direction').inputValue(), direction)
      }
      await page.getByLabel('Font Size:', { exact: false }).focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await page.getByLabel('Font Size:', { exact: false }).inputValue(), '57')
      const rotation = page.getByLabel('Rotation:', { exact: false })
      await rotation.focus()
      await page.keyboard.press('Home')
      for (let i = 0; i < 45; i++) await page.keyboard.press('ArrowRight')
      assert.equal(await rotation.inputValue(), '-135')
      await page.getByLabel('Keep characters upright').check()
      assert.notEqual(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), originalPixels, 'text edits reach the real renderer')
      if (touch) await activate(page.locator('summary'))
      await fit.scrollIntoViewIfNeeded()
      await activate(fit)
      await checkLayout(page)
      const documentPixels = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
      const beforeFit = await viewport.screenshot({ path: path.join(outputDir, `${profile.name}-fit.png`) })
      for (let i = 0; i < 12; i++) await activate(page.getByRole('button', { name: 'Zoom in', exact: true }))
      assert.equal(await page.getByRole('button', { name: 'Zoom in', exact: true }).isDisabled(), true, 'zoom is bounded at 4x fit')
      for (let i = 0; i < 8; i++) await activate(page.getByRole('button', { name: 'Zoom out', exact: true }))
      await activate(page.getByRole('button', { name: 'Pan view', exact: true }))
      let g = await geometry(page)
      await drag(page, session, { x: g.viewport.x + g.viewport.width * 0.7, y: g.viewport.y + g.viewport.height * 0.7 }, { x: 36, y: 16 }, touch)
      const panned = await geometry(page)
      assert.ok(Math.abs(panned.canvas.x - g.canvas.x) > 10, 'real pan input moves viewport')
      assert.deepEqual(await position(page), { x: 140, y: 130 }, 'pan does not move text')
      assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), documentPixels, 'zoom/pan preserve renderer pixels')
      // Keyboard activation also avoids Chromium's synthetic-click suppression
      // immediately following a CDP touch scroll gesture.
      await fit.focus()
      await page.keyboard.press('Enter')
      await page.getByRole('button', { name: 'Pan view', exact: true }).focus()
      await page.keyboard.press('Enter')
      assert.deepEqual(await viewport.screenshot({ path: path.join(outputDir, `${profile.name}-refit.png`) }), beforeFit, 'fit restores identical viewport pixels')
      // Grab off-centre: moving the finger must not snap the text origin to it.
      g = await geometry(page)
      const beforeDrag = await position(page)
      await drag(page, session, { x: g.handle.x + 8, y: g.handle.y + 4 }, { x: 28, y: 20 }, touch)
      let moved = await position(page)
      assert.ok(Math.abs(moved.x - beforeDrag.x - 28 / g.scale) <= 1, 'drag X maps through fit scale without jumping')
      assert.ok(Math.abs(moved.y - beforeDrag.y - 20 / g.scale) <= 1, 'drag Y maps through fit scale without jumping')
      assert.equal((await geometry(page)).scrollY, g.scrollY, 'handle drag does not scroll the page')
      await handle.focus()
      await page.keyboard.press('Shift+ArrowRight')
      assert.equal((await position(page)).x, moved.x + 10, 'keyboard movement uses document pixels')
      assert.equal(await handle.evaluate((el) => getComputedStyle(el).outlineStyle), 'solid', 'keyboard focus is visible')
      await checkLayout(page)
      await activate(page.getByRole('button', { name: 'Zoom in', exact: true }))
      await activate(page.getByRole('button', { name: 'Zoom in', exact: true }))
      await activate(page.getByRole('button', { name: 'Pan view', exact: true }))
      await viewport.focus()
      const beforeKeyPan = await geometry(page)
      await page.keyboard.press('ArrowLeft')
      assert.ok((await geometry(page)).canvas.x > beforeKeyPan.canvas.x, 'keyboard pan moves view')
      await activate(page.getByRole('button', { name: 'Pan view', exact: true }))
      g = await geometry(page)
      const beforeZoomDrag = await position(page)
      await drag(page, session, g.handle, { x: 14, y: 10 }, touch)
      moved = await position(page)
      assert.ok(Math.abs(moved.x - beforeZoomDrag.x - 14 / g.scale) <= 1, 'zoomed and panned drag maps X correctly')
      assert.ok(Math.abs(moved.y - beforeZoomDrag.y - 10 / g.scale) <= 1, 'zoomed and panned drag maps Y correctly')
      await checkLayout(page)
      await activate(fit)
      if (touch) {
        // Cancellation must release drag state and permit the next gesture.
        g = await geometry(page)
        await drag(page, session, g.handle, { x: 5, y: 5 }, true, true)
        assert.equal(await handle.evaluate((el) => el.classList.contains('dragging')), false)
        await page.setViewportSize({ width: 844, height: 390 })
        await fit.scrollIntoViewIfNeeded()
        await activate(fit)
        await checkLayout(page)
        const beforeResizeDrag = await position(page)
        g = await geometry(page)
        await drag(page, session, g.handle, { x: 12, y: 8 }, true)
        moved = await position(page)
        assert.ok(Math.abs(moved.x - beforeResizeDrag.x - 12 / g.scale) <= 1, 'landscape drag uses resized transform')
        await page.screenshot({ path: path.join(outputDir, `${profile.name}-landscape.png`), fullPage: true })
        await page.setViewportSize(profile.options.viewport)
        await activate(fit)
        await activate(page.locator('summary'))
        await page.getByLabel('Color', { exact: true }).scrollIntoViewIfNeeded()
        assert.ok(await page.evaluate(() => scrollY > 0), 'normal page navigation reaches lower controls')
        await activate(page.locator('summary'))
        await fit.scrollIntoViewIfNeeded()
      }
      await page.screenshot({ path: path.join(outputDir, `${profile.name}-edited.png`), fullPage: true })
      assert.deepEqual(errors, [], 'no browser runtime errors')
      console.log(`PASS ${profile.name}: layout, labels/targets, text/direction/rotation, zoom/pan/fit pixel comparison, drag, keyboard${touch ? ', touch cancellation, landscape, normal scrolling' : ''}`)
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
