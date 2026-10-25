// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
import { exportPng } from './lib/exportPng'
vi.mock('./lib/exportPng', () => ({ exportPng: vi.fn() }))
vi.mock('./lib/renderDocument', async (original) => ({
  ...await original<typeof import('./lib/renderDocument')>(), renderDocument: vi.fn(),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
afterEach(() => { vi.restoreAllMocks() })

it('offers a native export button, prevents duplicate encoding, announces failures and allows retry; position inputs are labeled', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  let reject!: (reason: Error) => void
  vi.mocked(exportPng).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  await act(async () => root.render(<App />))
  const button = host.querySelector('button')!
  expect(button.type).toBe('button')
  expect(button.textContent).toBe('Download PNG')
  for (const axis of ['X', 'Y']) {
    const label = Array.from(host.querySelectorAll('label')).find((label) => label.textContent?.includes(`${axis} position`))!
    expect(label.querySelector('input')?.type).toBe('number')
  }
  await act(async () => { button.click(); button.click() })
  expect(exportPng).toHaveBeenCalledOnce()
  expect(button.disabled).toBe(true)
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Preparing')
  await act(async () => reject(new Error('no blob')))
  expect(button.disabled).toBe(false)
  expect(host.querySelector('[role="status"]')?.textContent).toContain('failed')
  vi.mocked(exportPng).mockResolvedValueOnce(undefined)
  await act(async () => button.click())
  expect(host.querySelector('[role="status"]')?.textContent).toContain('download requested')

  // Exercise native input events through React, not just the clamp helper.
  const inputs = host.querySelectorAll<HTMLInputElement>('.position-controls input')
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  const change = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      setValue.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await change(inputs[0], '1200')
  expect(inputs[0].value).toBe('1000')
  await change(inputs[1], '-10')
  expect(inputs[1].value).toBe('0')
  await change(inputs[1], '12.5')
  expect(inputs[1].value).toBe('12.5')
  await change(inputs[1], '')
  expect(inputs[1].value).toBe('12.5')
  await act(async () => button.click())
  expect(vi.mocked(exportPng).mock.lastCall?.[0].layers[0]).toMatchObject({ x: 1000, y: 12.5 })
  expect(host.querySelector<HTMLElement>('.text-handle')?.style.left).toBe('100%')
  await act(async () => root.unmount())
})
