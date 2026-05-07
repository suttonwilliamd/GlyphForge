import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.GLYPHFORGE_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = path.resolve(process.cwd(), 'artifacts', 'snapshots')

const cases = [
  {
    name: 'horizontal-default',
    content: 'HELLO WORLD',
    direction: 'Horizontal',
    letterSpacing: 2,
    rotation: 0,
    fontSize: 56,
  },
  {
    name: 'vertical-down-tight',
    content: 'HELLO',
    direction: 'Vertical Down',
    letterSpacing: 0,
    rotation: 0,
    fontSize: 64,
  },
  {
    name: 'vertical-up-spaced',
    content: 'WORLD',
    direction: 'Vertical Up',
    letterSpacing: 10,
    rotation: 0,
    fontSize: 60,
  },
  {
    name: 'angled-45deg',
    content: 'ANGLE',
    direction: 'Horizontal',
    letterSpacing: 6,
    rotation: 45,
    fontSize: 54,
  },
  {
    name: 'negative-spacing',
    content: 'STACKED',
    direction: 'Horizontal',
    letterSpacing: -6,
    rotation: -20,
    fontSize: 68,
  },
  {
    name: 'multiline',
    content: 'HELLO\nWORLD',
    direction: 'Horizontal',
    letterSpacing: 2,
    rotation: 0,
    fontSize: 48,
  },
]

async function setRangeByLabel(page, labelText, value) {
  const input = page.locator(`label:has-text("${labelText}") input[type=range]`).first()
  await input.evaluate((el, next) => {
    el.value = String(next)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

async function run() {
  await mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

  for (const c of cases) {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    await page.getByLabel('Content').fill(c.content)
    await page.getByLabel('Direction').selectOption({ label: c.direction })

    await setRangeByLabel(page, 'Letter Spacing', c.letterSpacing)
    await setRangeByLabel(page, 'Rotation', c.rotation)
    await setRangeByLabel(page, 'Font Size', c.fontSize)

    const canvas = page.locator('canvas.editor-canvas')
    await canvas.screenshot({ path: path.join(outputDir, `${c.name}.png`) })
  }

  await browser.close()
  console.log(`Saved ${cases.length} snapshots to ${outputDir}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
