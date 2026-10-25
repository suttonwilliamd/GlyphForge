# GlyphForge

[![CI](https://github.com/suttonwilliamd/GlyphForge/actions/workflows/ci.yml/badge.svg)](https://github.com/suttonwilliamd/GlyphForge/actions/workflows/ci.yml)

GlyphForge is a canvas-based text composition tool for designing stylized glyph layouts.

Current state: Phase 1 prototype focused on text-layer rendering, layout behavior, and visual validation.

## What the product does today

- Renders a text layer onto an HTML canvas
- Supports text directions:
  - Horizontal
  - Vertical Down
  - Vertical Up
- Supports multiline content in horizontal mode
- Adjustable typography and transform controls:
  - Content
  - Font family
  - Font size
  - Letter spacing (including negative values)
  - Rotation
  - Position X/Y
  - Color
- Uses deterministic glyph placement logic (`computeGlyphPlacements`) for predictable output
- Downloads the composition as a 1000 × 700 PNG with a white background (no editor handle)
- Labeled numeric X/Y controls provide a keyboard alternative to dragging

## Core architecture

- UI: React + TypeScript + Vite
- Rendering: Canvas 2D API
- Layout engine:
  - `src/lib/textLayout.ts` computes per-glyph positions
  - `src/lib/renderTextLayer.ts` draws glyph placements to canvas
- State model:
  - Document schema + typed text-layer model in `src/types/editor.ts`

## Project structure

- `src/App.tsx` — editor UI and state reducer
- `src/lib/textLayout.ts` — glyph placement logic
- `src/lib/renderTextLayer.ts` — canvas text rendering
- `src/lib/textLayout.test.ts` — layout unit tests
- `scripts/visual-snapshots.mjs` — Playwright visual snapshot runner
- `artifacts/snapshots/` — generated reference screenshots

## Run locally

Requirements: Node.js 22 (the CI target) and a modern browser.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

### Edit and export on Windows

1. Install Node.js 22, open PowerShell in this repository, then run `npm ci` and `npm run dev`.
2. Open the printed localhost URL in Edge, Chrome or Firefox. Edit Content, Font Family, Size, Spacing, Direction, Rotation, upright characters and Color.
3. Tab to **X position (px)** and **Y position (px)** and type coordinates or use arrow keys. Coordinates refer to the text anchor, not its bounding box; text can extend beyond the document. Finite values clamp to X 0–1000 / Y 0–700; empty or invalid values restore the previous position. Fractions are allowed. Dragging remains available.
4. Activate **Download PNG** with Enter/Space or a click. The button is disabled while fonts/encoding are pending; the live status reports a download request or failure. Inspect the browser's Downloads list for `glyphforge-1000x700.png`. A request is not confirmation that your browser saved it.
5. Open the file in an image viewer: verify 1000 × 700 pixels, white background, your current lettering and no circular drag handle. Export captures the state when you click, even if you continue editing while it encodes.

The shared Canvas 2D renderer draws both preview and offscreen export. Export waits for requested visible-text fonts and the browser font set to be ready. Font Family uses installed/system fonts and CSS fallback: missing fonts may silently fall back, and glyph shapes/metrics differ across Windows/Linux and browsers. PNG retains rasterized pixels, not editable text or embedded fonts. No new font download service is used.

## Build

```bash
npm run build
npm run preview
```

## CI/CD

- CI (GitHub Actions): `.github/workflows/ci.yml`
  - Runs on standard hosted Ubuntu and Windows runners with Node 22 on pushes/PRs to `main`
  - Executes: `npm ci`, `npm run lint`, `npm test`, `npm run build`, Chromium installation and `npm run test:browser`
  - The stable required check `test-build` depends on the complete Windows+Ubuntu matrix, including browser smoke. Only a successful matrix passes; failure, cancellation or skipped checks cannot pass the aggregate.
  - Uploads only demo PNGs/screenshots and `results.json` (seven-day retention), not environment or credentials. Hosted Windows Chromium evidence is not the owner's interactive Edge/native-device acceptance.
- CD (Vercel): connected to GitHub repository
  - Production auto-deploys from `main`
  - Live URL: `https://glyphforge-eosin.vercel.app`

## Test

Unit and DOM contract tests (canvas/encoding mocks verify invocation and failures, **not** genuine PNG pixels or browser downloads):

```bash
npm test
```

### Real browser PNG smoke

```bash
npm run build
# On your own machine or ephemeral CI runner, if Chromium is not installed:
npx playwright install chromium
npm run test:browser
```

The smoke script starts and closes its own loopback-only Vite preview on an available port; no separate preview server is required. It saves three downloaded PNGs, four bounded screenshots and `results.json` in `artifacts/browser-smoke/`. It checks actual PNG signatures and 1000 × 700 dimensions, equality with the current preview canvas, white opaque background, nonempty lettering and no handle color. Cases cover default vertical, rotated negative-spacing multiline, and rotated upright vertical-up. It also exercises real X/Y clamping and asserts no page errors. Browser and server cleanup run in `finally`, including on failure.

To reuse an existing Chromium executable without downloading a browser:

```bash
# POSIX shell
GLYPHFORGE_BROWSER_EXECUTABLE=/path/to/chromium npm run test:browser
```

```powershell
# PowerShell
$env:GLYPHFORGE_BROWSER_EXECUTABLE = 'C:\\path\\to\\chrome.exe'
npm run test:browser
```

A missing executable is a failed/unrun browser check, not a pass. Do not install browsers/system dependencies on restricted hosts; hand off to an authorized existing browser or hosted CI. The script does not install anything. Playwright's minimum is 1.55.1 (within major 1), addressing the <=1.55.0 browser-download TLS-verification advisory before CI browser installation. This is not a broad tooling security remediation.

Automated Chromium results, even on a real hosted Windows runner, do not establish interactive Edge, physical-device, font parity or independent visual acceptance. The narrow screenshot is evidence only, not a mobile parity claim.

### Reference screenshots

Visual snapshots (requires preview server running at `http://127.0.0.1:4173` by default):

```bash
npm run build
npm run preview
npm run test:visual
```

Optional base URL override:

```bash
GLYPHFORGE_BASE_URL=http://127.0.0.1:4173 npm run test:visual
```

## What this is not yet

This repo is not yet a full multi-layer design editor. It currently has:

- One editable text layer in the UI
- PNG export only; no SVG, project JSON or import pipeline
- No persistence/project save format
- No asset/tool ecosystem yet
- Fixed document dimensions and desktop-oriented layout; no mobile parity claim
- No persistence: reloading loses the composition

### Review gates and dependency risks

Before release, CEO must independently run the Windows/browser export steps above, including multiline horizontal, negative spacing, rotated and vertical-upright compositions, and verify the actual PNG. BobRoss must review actual before/after screenshots at wide and narrow widths; automated mocks and reference-image files are not that review.

Development dependencies include existing Vite 5/Vitest 1 tooling with known advisories. Use localhost only for development/preview; do not expose the dev server or enable an unauthenticated Vitest UI/API. Run `npm audit` to inspect the current registry findings. The PNG increment added jsdom for DOM tests; this follow-up patches the Playwright browser-download advisory only. It intentionally does not broadly upgrade React/Vite; remaining dependency remediation is separate work.

## Roadmap direction (high level)

- Multi-layer editing and layer management
- Better typography controls and text-on-path options
- Additional export workflows (SVG/project JSON)
- Stronger regression checks for rendering parity

---

If you landed here expecting a generic Vite template, that was old README content. This file now reflects the actual product in this repository.