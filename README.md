# GlyphForge

[![CI](https://github.com/suttonwilliamd/GlyphForge/actions/workflows/ci.yml/badge.svg)](https://github.com/suttonwilliamd/GlyphForge/actions/workflows/ci.yml)

GlyphForge is a canvas-based text composition tool for designing stylized glyph layouts.

Current state: single-text-layer editor with mobile editing, portable versioned project files, PNG export and rendering/interaction regression checks.

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
- Stage-first phone layout with collapsible text controls, 44px targets and visible keyboard focus
- Fit-to-view, bounded zoom and opt-in pan without changing the 1000×700 logical document
- Downloads portable GlyphForge JSON projects, validates file imports atomically, and exports full-resolution PNG images

## Editing on a phone or keyboard

At widths up to 900px, the document comes first and **Text controls** starts collapsed. Tap its heading to edit content, direction, typography, rotation, upright characters and color; tap again to return to the stage. Wider screens retain a left control panel and right document view.

- **Fit to view** centers the entire document, including room to grab its edges. The initial view fits automatically; resizing or rotating the viewport recalculates the fit without changing text coordinates.
- **− / +** zoom between 1× and 4× the fitted size. The percentage is the actual document-to-screen scale, not the fit multiplier.
- Turn **Pan view** on to drag the document viewport, or focus the viewport and use arrow keys. Pan is bounded so the document cannot be lost. Turn it off to restore ordinary page scrolling over the stage. Scrolling outside the stage always remains available.
- Drag the blue **Move text** handle to position the layer. Its hit area stays 44×44 CSS pixels at every zoom, and grabbing off-center does not snap the text to your finger. Pointer capture keeps a deliberate drag active outside the handle; cancellation releases it.
- Tab to **Move text** and use arrow keys for one logical document pixel, or Shift+arrow for ten. Position is clamped to document edges and shown below the preview. All view controls and the collapsible section also support keyboard activation.

Zoom and pan are view-only. Canvas backing dimensions, glyph layout and renderer output remain unchanged. Reloading still resets the document unless you save a project and reopen it.

## Save, reopen and export

- **Save project** downloads `glyphforge-project.json`. Keep this file to resume editing or transfer the composition to another device.
- **Open project** uses the native file picker. The entire file is validated before replacement; malformed, unsupported or oversized files leave both the composition and view untouched and show an accessible status message. Save your current project first if you want to retain it.
- A successful import selects the single text layer, cancels any active drag/pan and obsolete file reads, turns off pan mode and fits the view. The latest file selection wins; editing while a file is being read cancels that pending replacement.
- **Export PNG** downloads `glyphforge.png`: the actual **1000×700** document background and rendered text, without blue handles, toolbar, clipping from the viewport, or pan/zoom transforms. It is a flattened image, not an editable project.

### Project format and limits

Version 1 uses exactly the root fields `format: "GlyphForge"`, `version: 1`, `document`, `layers`, and `selectedLayerId`. It preserves every current document/text-layer model property, including fractional position, background, typography, direction, rotation, upright characters, visibility and opacity. View position, zoom, disclosure state and transient gestures are intentionally excluded.

Only the existing **1000×700** document and **one unlocked text layer, selected by its ID**, are supported. Unknown fields, missing fields, unknown versions, other layer types, multiple layers and locked layers are rejected rather than silently discarded. This is not a multi-layer editor or an importer for arbitrary JSON.

Files are limited to **256,000 UTF-8 bytes**; content to **10,000 UTF-16 code units**, font-family text to 200, and layer names/IDs to 100. The content and font-family controls enforce the same lengths. All numeric fields must be finite. Positions stay within the document; font size stays 8–180px, spacing −10–60px, rotation −180–180°, opacity 0–100%, font weight 1–1000 and line-height multiplier 0.1–10. Colors use six-digit hex values; style and direction use the model's explicit supported values.

Fonts are named, **not embedded**. Another device needs the same installed font for identical rendering; otherwise browser font fallback applies. No cloud storage, localStorage autosave, embedded assets/fonts, undo history, custom document dimensions, or SVG export is included.


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
- `src/lib/viewport.ts` — fit, bounded pan/zoom, screen/document coordinate transforms
- `src/lib/project.ts` / `project.test.ts` — strict versioned codec, bounded validation and latest-file import transactions
- `src/lib/renderDocument.ts` — shared document rendering, offscreen PNG encoding and Blob downloads
- `scripts/project-files.mjs` — desktop/phone real-download, exact roundtrip, pixel-parity and import lifecycle regressions
- `src/lib/viewport.test.ts` — coordinate, resize, grab-offset and boundary regressions
- `scripts/mobile-editor.mjs` — Chromium desktop and touch-emulated phone interaction checks
- `src/lib/textLayout.test.ts` — layout unit tests
- `scripts/visual-snapshots.mjs` — Playwright visual snapshot runner
- `artifacts/snapshots/` — generated reference screenshots

## Run locally

Requirements: Node.js 18+

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
npm run preview
```

## CI/CD

- CI (GitHub Actions): `.github/workflows/ci.yml`
  - Runs on pushes/PRs to `main`
  - Executes: `npm ci`, `npm run lint`, `npm test`, `npm run build`
- CD (Vercel): connected to GitHub repository
  - Production auto-deploys from `main`
  - Live URL: `https://glyphforge-eosin.vercel.app`

- The source-only `overnight/2026-11-06-mobile-editor` branch has an exact branch-specific `git.deploymentEnabled: false` guard in `vercel.json`. It does not change production `main` behavior or Vercel project settings.
- PR CI also installs Chromium, runs `npm run test:mobile` and `npm run test:files` against a loopback production preview, and uploads `artifacts/mobile/` and `artifacts/files/` evidence even when checks fail.

## Test

Unit tests:

```bash
npm test
```

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

Mobile/desktop interaction regressions (same running preview and optional base URL override):

```bash
npx playwright install chromium
npm run test:mobile
```

The runner covers desktop 1600×1000, Chromium iPhone 13 emulation (390×844), Pixel 7 emulation, and 844×390 landscape. It checks no horizontal overflow, labels and 44px controls, content/direction/font-size/rotation edits, real CDP touch dragging/panning and cancellation, off-center grabs, keyboard focus/movement/pan, zoom bounds, renderer pixel preservation, fit screenshot equality, and access to lower controls by normal scrolling. Each profile saves screenshots under ignored `artifacts/mobile/`; fit and refit screenshots are compared byte-for-byte **within the same run**, not against cross-platform golden files. The older visual runner saves six rendering scenarios under `artifacts/snapshots/`; sliders now use actual keyboard input so React receives their changes.

### Mobile milestone validation (2026-11-06)

Addresses [#1 responsive layout](https://github.com/suttonwilliamd/GlyphForge/issues/1), [#2 touch handle](https://github.com/suttonwilliamd/GlyphForge/issues/2), [#3 stable zoom/pan](https://github.com/suttonwilliamd/GlyphForge/issues/3), [#4 mobile regressions](https://github.com/suttonwilliamd/GlyphForge/issues/4), and [#5 accessible controls](https://github.com/suttonwilliamd/GlyphForge/issues/5).

Local validation passed: 18 unit checks, ESLint, TypeScript/Vite production build, all three Chromium interaction profiles, and six existing rendering snapshots. An independently opened Chromium tab also exercised desktop and 390px phone edits/rotation/direction, zoom, pan, handle drag, fit, keyboard movement and landscape resizing, with screenshots and no horizontal overflow (390/390 and 844/844 viewport/page widths). Browser tab closed after smoke.

These are Chromium emulations, **not real iOS hardware, Safari, or Android hardware validation**. There is no pinch gesture implementation; use the zoom buttons. The label/target assertions are not a full assistive-technology accessibility audit. CI wiring is included; no remote CI run or deployment is claimed.

### Portable-file milestone validation (2026-11-06)

Run `npm run test:files` against the same running preview (and optional `GLYPHFORGE_BASE_URL`) to exercise real Chromium desktop and iPhone 13-emulated JSON/PNG downloads. It edits content, downloads and reimports project files, and compares every logical model field. For PNG it decodes the downloaded image and compares **every RGBA byte** with the original document canvas, checks 1000×700 dimensions, background and actual text pixels, and compares fitted versus zoomed/panned exports byte-for-byte.

Local proof passed: **56 unit tests** (the original 18 plus 38 codec/import checks), ESLint, TypeScript/Vite build, both portable-file profiles, all three existing mobile/desktop profiles and all six visual scenarios. Import checks cover malformed/future/multilayer preservation, delayed file-selection and edit races, stale errors, genuine captured-gesture cancellation, fit-on-import and PNG encoder failure. The always-mounted live status remains exposed even when empty. Ignored `artifacts/files/` contains downloaded JSON/PNG and fresh screenshots.

An independently opened Chromium tab also exercised desktop edit/import/zoom/pan and phone import/PNG export/failure handling. Its phone failed-import screenshot and accessibility tree show the error while the original canvas pixels remain unchanged, with page width 390/390 and no browser runtime errors. These checks are Chromium emulations, not real Safari/iOS/Android or a full screen-reader audit; browser download completion is asserted by the automated runner, not inferred from the UI's “download requested” status. No remote CI, deployment, commit or push is part of this milestone.


## What this is not yet

This repo is not yet a full multi-layer design editor. It currently has:

- One editable text layer in the UI
- No autosave/cloud persistence; projects must be explicitly downloaded and reopened
- No asset/tool ecosystem yet

## Roadmap direction (high level)

- Multi-layer editing and layer management
- Better typography controls and text-on-path options
- Additional export workflows (SVG and embedded font/asset portability)
- Stronger regression checks for rendering parity

---

If you landed here expecting a generic Vite template, that was old README content. This file now reflects the actual product in this repository.