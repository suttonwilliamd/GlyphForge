import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const baseUrl = process.env.GLYPHFORGE_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = path.resolve('artifacts', 'history')
const browser = await chromium.launch({ headless: true })
await mkdir(outputDir, { recursive: true })
try {
  for (const profile of [
    { name: 'desktop', options: { viewport: { width: 1600, height: 1000 } } },
    { name: 'iphone-13', options: devices['iPhone 13'] },
  ]) {
    const context = await browser.newContext(profile.options)
    const page = await context.newPage()
    const session = await context.newCDPSession(page)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      const touch = Boolean(profile.options.isMobile)
      const activate = (locator) => touch ? locator.tap() : locator.click()
      const button = (name) => page.getByRole('button', { name, exact: true })
      const undo = button('Undo')
      const redo = button('Redo')
      const handle = button('Move text')
      const content = page.getByRole('textbox', { name: 'Content', exact: true })
      const font = page.getByLabel('Font Family', { exact: true })
      const size = page.getByLabel('Font Size:', { exact: false })
      const direction = page.getByRole('combobox', { name: 'Direction', exact: true })
      const status = page.getByRole('status', { name: 'Project file status', exact: true })
      const upload = (project, name = 'history.json') => page.getByLabel('Open project', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof project === 'string' ? project : JSON.stringify(project)) })
      const pixels = () => page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
      const save = async (suffix) => {
        const pending = page.waitForEvent('download')
        await activate(button('Save project'))
        const download = await pending
        assert.equal(await download.failure(), null)
        const target = path.join(outputDir, `${profile.name}-${suffix}.json`)
        await download.saveAs(target)
        return JSON.parse((await readFile(target)).toString())
      }
      const openControls = async () => {
        if (await page.locator('details').getAttribute('open') === null) await activate(page.locator('summary'))
      }
      const shortcut = async (key) => {
        await handle.focus()
        await page.keyboard.press(key)
      }
      const reset = async () => {
        await page.goto(baseUrl)
        await openControls()
        assert.equal(await undo.isDisabled(), true)
        assert.equal(await redo.isDisabled(), true)
      }
      const geometry = async () => {
        await handle.scrollIntoViewIfNeeded()
        return page.evaluate(() => {
          const handle = document.querySelector('.text-handle').getBoundingClientRect()
          const canvas = document.querySelector('canvas').getBoundingClientRect()
          return { x: handle.x + 22, y: handle.y + 22, scale: canvas.width / 1000 }
        })
      }
      const startDrag = async (delta, finish = true, cancel = false) => {
        const g = await geometry()
        if (touch || cancel) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x, y: g.y, id: 1 }] })
          for (let i = 1; i <= 60; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + delta.x * i / 60, y: g.y + delta.y * i / 60, id: 1 }] })
          if (finish) await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
        } else {
          await page.mouse.move(g.x, g.y)
          await page.mouse.down()
          await page.mouse.move(g.x + delta.x, g.y + delta.y, { steps: 60 })
          if (finish) await page.mouse.up()
        }
        return g
      }

      await reset()
      const original = await save('original')
      const originalPixels = await pixels()
      await content.focus()
      await page.keyboard.press('Control+End')
      await page.keyboard.type(' continuous typing over many keystrokes')
      await handle.focus()
      const typed = await save('typed')
      assert.notDeepEqual(typed, original)
      const typedPixels = await pixels()
      await shortcut('Control+z')
      assert.deepEqual(await save('text-undone'), original, 'one undo reverses the whole focused text edit')
      assert.equal(await pixels(), originalPixels, 'undo restores every canvas pixel')
      assert.equal(await undo.isDisabled(), true)
      await shortcut('Control+Shift+z')
      assert.deepEqual(await save('text-redone'), typed)
      assert.equal(await pixels(), typedPixels, 'redo restores every canvas pixel')
      await activate(undo)
      await shortcut('Control+y')
      assert.deepEqual(await save('ctrl-y'), typed)
      await shortcut('Meta+z')
      assert.deepEqual(await save('cmd-z'), original)
      await shortcut('Meta+Shift+z')
      assert.deepEqual(await save('cmd-shift-z'), typed)

      await reset()
      // A real native field edit must undo inside the field, not traverse document history.
      await direction.selectOption('horizontal')
      await content.focus()
      await page.keyboard.press('Control+End')
      await page.keyboard.type(' native textarea')
      const nativeText = await content.inputValue()
      await page.keyboard.press('Control+z')
      assert.equal(await direction.inputValue(), 'horizontal')
      assert.notEqual(await content.inputValue(), nativeText)
      await page.keyboard.press('Control+Shift+z')
      assert.equal(await content.inputValue(), nativeText)
      await font.focus()
      await page.keyboard.press('Control+End')
      await page.keyboard.type(' serif')
      const nativeFont = await font.inputValue()
      await page.keyboard.press('Control+z')
      assert.notEqual(await font.inputValue(), nativeFont)
      assert.equal(await content.inputValue(), nativeText)
      await page.keyboard.press('Control+y')
      assert.equal(await font.inputValue(), nativeFont)
      await page.evaluate(() => {
        window.nativeShortcutEvents = []
        window.addEventListener('keydown', (event) => {
          if (event.ctrlKey && event.key === 'z') window.nativeShortcutEvents.push(event.defaultPrevented)
        })
      })
      for (const field of [direction, size, page.getByLabel('Keep characters upright')]) {
        await field.focus()
        await page.keyboard.press('Control+z')
        assert.equal(await direction.inputValue(), 'horizontal', 'native field shortcuts do not traverse app history')
        assert.equal(await page.evaluate(() => window.nativeShortcutEvents.at(-1)), false, 'native undo remains unprevented; Chromium may undo an earlier input even from a select')
      }
      await page.evaluate(() => {
        const editable = document.createElement('div')
        editable.contentEditable = 'true'
        editable.id = 'native-editable-proof'
        editable.textContent = 'Native '
        document.body.append(editable)
      })
      const editable = page.locator('#native-editable-proof')
      await editable.focus()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('editable')
      await page.keyboard.press('Control+z')
      assert.equal(await editable.textContent(), 'Native ')
      assert.equal(await direction.inputValue(), 'horizontal')
      await editable.evaluate((el) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('tabindex', '0')
        el.append(svg)
      })
      await editable.locator('svg').focus()
      await page.keyboard.press('Control+z')
      assert.equal(await page.evaluate(() => window.nativeShortcutEvents.at(-1)), false, 'SVG descendants of contenteditable also retain native undo')
      await editable.evaluate((el) => el.remove())

      await reset()
      await size.focus()
      await page.keyboard.down('ArrowRight')
      for (let i = 0; i < 35; i++) await page.keyboard.down('ArrowRight')
      await page.keyboard.up('ArrowRight')
      const largeSize = await size.inputValue()
      assert.equal(largeSize, '92')
      await activate(undo)
      assert.equal(await size.inputValue(), '56')
      assert.equal(await undo.isDisabled(), true, 'continuous slider key repeat is one completed edit')
      await activate(redo)
      assert.equal(await size.inputValue(), largeSize)
      // A real pointer slider drag streams input events and completes on release.
      await size.scrollIntoViewIfNeeded()
      const rangeBox = await size.boundingBox()
      await page.mouse.move(rangeBox.x + rangeBox.width * 0.5, rangeBox.y + rangeBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(rangeBox.x + rangeBox.width * 0.85, rangeBox.y + rangeBox.height / 2, { steps: 50 })
      await page.mouse.up()
      const pointerSize = await size.inputValue()
      assert.notEqual(pointerSize, largeSize)
      await activate(undo)
      assert.equal(await size.inputValue(), largeSize, 'one undo reverses long native range drag')
      await activate(redo)
      assert.equal(await size.inputValue(), pointerSize)

      await reset()
      await startDrag({ x: 70, y: 40 })
      const dragged = await save('dragged')
      assert.ok(dragged.layers[0].x > original.layers[0].x)
      await activate(undo)
      assert.deepEqual(await save('drag-undone'), original)
      assert.equal(await undo.isDisabled(), true, '60 pointer moves are one edit')
      await activate(redo)
      assert.deepEqual(await save('drag-redone'), dragged)
      await startDrag({ x: 20, y: 15 }, true, true)
      assert.equal(await handle.evaluate((el) => el.classList.contains('dragging')), false)
      const cancelled = await save('cancelled-last-position')
      assert.notDeepEqual(cancelled, dragged)
      await activate(undo)
      assert.deepEqual(await save('cancel-undone'), dragged, 'cancel completes at the last actual pointer position')
      await activate(redo)
      assert.deepEqual(await save('cancel-redone'), cancelled)

      await reset()
      const boundary = structuredClone(original)
      boundary.layers[0].x = 1000
      await upload(boundary)
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      await handle.focus()
      await page.keyboard.press('ArrowDown')
      await shortcut('Control+z')
      assert.equal(await redo.isEnabled(), true)
      for (let i = 0; i < 5; i++) await activate(button('Zoom in'))
      await activate(button('Pan view'))
      await page.locator('.canvas-viewport').focus()
      await page.keyboard.press('ArrowLeft')
      const transform = await page.locator('canvas').evaluate((el) => el.style.transform)
      await activate(page.locator('summary'))
      await activate(page.locator('summary'))
      await handle.focus()
      await page.keyboard.press('ArrowRight') // clamped no-op
      await upload(boundary) // equal composition, independent parsed object
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      await upload('{broken')
      await status.filter({ hasText: 'Current document unchanged' }).waitFor()
      assert.equal(await redo.isEnabled(), true, 'view, no-op, equal and failed imports preserve redo')
      // Import fits by design; history navigation itself must not change the current view.
      await activate(button('Zoom in'))
      const beforeHistoryView = await page.locator('canvas').evaluate((el) => el.style.transform)
      assert.notEqual(beforeHistoryView, transform)
      await activate(redo)
      assert.equal(await page.locator('canvas').evaluate((el) => el.style.transform), beforeHistoryView)
      await activate(undo)
      await openControls()
      await page.getByLabel('Keep characters upright').check()
      assert.equal(await redo.isDisabled(), true, 'real edit forks the undone branch')

      await reset()
      await content.fill('Before import')
      await handle.focus()
      const beforeImport = await save('before-import')
      const beforeImportPixels = await pixels()
      const imported = structuredClone(original)
      imported.document.background = '#cceedd'
      imported.selectedLayerId = 'other-id'
      Object.assign(imported.layers[0], {
        id: 'other-id', name: 'Imported composition', opacity: 57, x: 320.5, y: 290.25,
        rotation: 37, content: 'Imported 🌻\nEverything', fontFamily: 'Georgia, serif', fontSize: 80,
        fontWeight: 300, fontStyle: 'italic', color: '#342f69', lineHeight: 1.8,
        letterSpacing: -3, direction: 'horizontal', keepUpright: true,
      })
      await upload(imported)
      await status.filter({ hasText: 'Project loaded' }).waitFor()
      const importedPixels = await pixels()
      await activate(undo)
      assert.deepEqual(await save('import-undone'), beforeImport)
      assert.equal(await pixels(), beforeImportPixels)
      await activate(redo)
      assert.deepEqual(await save('import-redone'), imported, 'one redo restores every imported field and selected ID')
      assert.equal(await pixels(), importedPixels)
      await page.evaluate(() => {
        const read = File.prototype.text
        window.pendingReads = []
        File.prototype.text = function () {
          if (!this.name.startsWith('slow')) return read.call(this)
          return new Promise((resolve, reject) => window.pendingReads.push({ resolve: async () => resolve(await read.call(this)), reject }))
        }
      })
      await startDrag({ x: 20, y: 10 }, false)
      await upload(original, 'slow-before-undo.json')
      await page.keyboard.press('Control+z')
      assert.equal(await handle.evaluate((el) => el.classList.contains('dragging')), false)
      await page.evaluate(() => window.pendingReads.shift().resolve())
      if (touch) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 300, id: 1 }] })
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await page.mouse.move(500, 500)
        await page.mouse.up()
      }
      assert.deepEqual(await save('fenced-undo'), imported, 'old pointer and pending file completion cannot overwrite restored composition')
      await upload(original, 'slow-before-redo.json')
      await shortcut('Control+Shift+z')
      await page.evaluate(() => window.pendingReads.shift().reject(new Error('Obsolete disk error')))
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.doesNotMatch(await status.textContent(), /Obsolete disk error|Current document unchanged/)
      const redoDrag = await save('fenced-redo')
      assert.notDeepEqual(redoDrag, imported)
      assert.equal(redoDrag.layers[0].id, 'other-id')
      await activate(undo)
      assert.deepEqual(await save('fenced-undo-again'), imported)

      await reset()
      await handle.focus()
      for (let i = 0; i < 105; i++) await page.keyboard.press('ArrowRight')
      assert.equal((await save('capacity-latest')).layers[0].x, 245)
      await handle.focus()
      for (let i = 0; i < 100; i++) await page.keyboard.press('Control+z')
      assert.equal(await undo.isDisabled(), true)
      assert.equal((await save('capacity-oldest')).layers[0].x, 145, 'oldest five edits are evicted at the 100-step boundary')
      await shortcut('Control+z')
      assert.equal((await save('capacity-extra-undo')).layers[0].x, 145)
      await handle.focus()
      for (let i = 0; i < 100; i++) await page.keyboard.press('Control+y')
      assert.equal((await save('capacity-redone')).layers[0].x, 245)
      assert.equal(await redo.isDisabled(), true)
      await undo.focus()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      assert.equal(await undo.evaluate((el) => getComputedStyle(el).outlineStyle), 'solid')
      const invalidControls = await page.locator('.history-toolbar button').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44).map((el) => el.textContent))
      assert.deepEqual(invalidControls, [])
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await undo.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(outputDir, `${profile.name}-history.png`), fullPage: true })
      await page.reload()
      assert.equal(await undo.isDisabled(), true, 'reload does not persist document history')
      assert.deepEqual(await save('reload'), original)
      assert.deepEqual(errors, [])
      console.log(`PASS ${profile.name}: actual JSON equality and canvas-pixel undo/redo; Ctrl/Cmd shortcuts/native fields; grouped text/slider/60-move drag/cancel; no-op/view/failure redo preservation; whole-ID import; active pointer/pending-read/error fencing; 100-step boundary; focus/44px/no overflow; memory-only reload`)
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
