# GlyphForge

[![CI](https://github.com/suttonwilliamd/GlyphForge/actions/workflows/ci.yml/badge.svg)](https://github.com/suttonwilliamd/GlyphForge/actions/workflows/ci.yml)

GlyphForge is a canvas-based text composition tool for designing stylized glyph layouts.

Current state: a single-text-layer canvas editor with portable project JSON files and PNG artwork export, plus deterministic layout and visual validation.

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
- Downloads editable, versioned project JSON; previews a chosen file before explicitly replacing the composition
- Exports the canvas as full-resolution PNG, without the editing handle or controls

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
- `src/lib/project.ts` / `project.test.ts` — portable project format and input-boundary regression tests
- `scripts/visual-snapshots.mjs` — Playwright visual snapshot runner
- `artifacts/snapshots/` — generated reference screenshots

## Run locally

Requirements: Node.js 18+

```bash
npm ci --ignore-scripts
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

## Keep and export a composition

1. Edit content, direction, font, spacing, rotation, position and color.
2. **Save project JSON** downloads `glyphforge-project.json`. Keep this file to resume editing later; there is no automatic browser save.
3. **Choose project JSON** validates the file and previews its layer name/dimensions. The composition stays unchanged until **Open project**. **Cancel open** keeps current work. Opening replaces the current composition, so save it first if needed.
4. **Export PNG** downloads `glyphforge.png` at the document's logical pixel dimensions (normally 1000 × 700), not its CSS-scaled preview size. The image includes the document background, not the handle/sidebar.

Project envelope: `format: "glyphforge"`, `version: 1`, `document`, `layers`, `selectedLayerId`. Exactly one selected text layer is supported; unsupported versions/layer types/multiple layers are rejected rather than discarded. Files are limited to 1 MB, text to 10,000 characters, and integer document dimensions to 1–4096 pixels per axis. Coordinates must be inside the document; typography/transform values must fit the current controls, and colors are six-digit hex. Invalid files preserve the current composition. Unknown metadata is not retained.

Files stay local; nothing is uploaded. JSON references font families but **does not embed fonts**. Opening elsewhere may use fallback fonts and produce different pixels. PNG captures the current rendered canvas; text outside its bounds is clipped just as in the preview. No SVG/vector export, image assets, autosave, font packaging or format migration is provided.

### Verification — 2026-11-08 portability branch

- `npm run lint`: passed. `npm test`: **11 passed** (seven layout + four project-format cases). `npm run build`: passed after correcting a TypeScript narrowing error found by the first build.
- Built-dist hidden Chrome with a separate profile: actual JSON download → edit → choose/preview/cancel → open recovered the composition. Malformed JSON, newer versions and multi-layer files kept the canvas unchanged.
- Opened a 640 × 480 composition and downloaded a real PNG. Its decoded pixels matched the canvas exactly, including the expected background and text, with no DOM editing handle. Screenshot and PNG visually inspected; no page errors.
- Portfolio-owner evidence outside the checkout: `evidence/GlyphForge.json`, `evidence/glyphforge-browser-results.json`, `evidence/glyphforge-project.json`, `evidence/glyphforge-editor.png`, `evidence/glyphforge-artwork.png`.
- Other engines, physical phones, font portability and the open mobile-layout/touch/zoom issues are not qualified by these checks.

## What this is not yet

This repo is not yet a full multi-layer design editor. It currently has:

- One editable text layer in the UI
- Explicit project JSON save/open and PNG export, not autosave or cloud persistence
- No asset/tool ecosystem or SVG export yet

## Roadmap direction (high level)

- Multi-layer editing and layer management
- Better typography controls and text-on-path options
- SVG export and broader document/asset support
- Stronger regression checks for rendering parity

---

If you landed here expecting a generic Vite template, that was old README content. This file now reflects the actual product in this repository.