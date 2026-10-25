# Changelog

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
