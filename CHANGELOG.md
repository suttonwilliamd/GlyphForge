# Changelog

## Unreleased — PNG export and keyboard positioning

- Add a native Download PNG button with duplicate-encoding protection and accessible pending/error/download-request status.
- Export click-time document pixels at 1000 × 700 with background and visible text through the shared Canvas 2D renderer; exclude the DOM drag handle, wait for fonts, handle null/failed encoding and defer object-URL cleanup.
- Add labeled, finite/clamped X/Y inputs and keep the drag handle aligned on the scaled document.
- Add export/DOM regression tests and Node 22 CI on standard Windows and Ubuntu runners.
- Document Windows browser editing/export and system-font, fixed-layout, single-layer and no-persistence limitations. Real browser export and independent screenshot acceptance remain release gates.
