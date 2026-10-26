# Changelog

## Unreleased — scoped development-tool security remediation

- Pin Vite 6.4.4 and Vitest 4.1.12 on Node 22. Published Vitest 4.1.0 was tested but still reports mocker advisories GHSA-82fw-gwwq-j7x9 and GHSA-qxg6-89mg-rqv8; 4.1.12 addresses these within major 4.
- Refresh affected compatible Babel/Browserslist/baseline mapping, PostCSS/nanoid/source-map-js, js-yaml and both brace-expansion dependency paths without overrides or new direct dependencies. The Vitest migration removes the old vite-node/tinypool paths.
- Preserve React 18, React plugin 4.7.0, Playwright 1.64.1, application source, all 16 existing behavioral tests and the fail-closed Windows+Ubuntu browser gate. No test compatibility edits were needed.
- Clean local Node 22 installation, lint, 16/16 tests and build pass. Full/production audit snapshots on 2026-10-25 report zero known vulnerabilities; this is not a comprehensive safety claim. Independent review and fresh hosted browser PNG smoke/output comparison remain pending for this toolchain, with no new native Windows or visual acceptance claimed.

## Unreleased — CI gate and browser evidence follow-up

- Preserve the exact required `test-build` context with a fail-closed aggregate of real Windows+Ubuntu lint, unit, build and browser checks; protection policy and independent GitHub approval remain unchanged.
- Add portable `npm run test:browser`: self-managed loopback preview, actual PNG download/pixel checks for three compositions, real coordinate clamps, no page errors, bounded demo artifacts and finally cleanup.
- Raise Playwright's minimum to patched 1.55.1 within major 1 and refresh its lock entries before enabling Chromium download/smoke on ephemeral public CI runners. Other development advisories remain separate work.
- Document existing-browser reuse and evidence limits: hosted Windows Chromium does not replace owner interactive Edge/native-device or independent visual acceptance.

## Unreleased — PNG export and keyboard positioning

- Add a native Download PNG button with duplicate-encoding protection and accessible pending/error/download-request status.
- Export click-time document pixels at 1000 × 700 with background and visible text through the shared Canvas 2D renderer; exclude the DOM drag handle, wait for fonts, handle null/failed encoding and defer object-URL cleanup.
- Add labeled, finite/clamped X/Y inputs and keep the drag handle aligned on the scaled document.
- Add export/DOM regression tests and Node 22 CI on standard Windows and Ubuntu runners.
- Document Windows browser editing/export and system-font, fixed-layout, single-layer and no-persistence limitations. Real browser export and independent screenshot acceptance remain release gates.
