# ADR-002: TypeScript + Vite IIFE build pipeline

**Date:** 2026-04-29
**Status:** Accepted

---

## Context

The extension was originally written as plain JavaScript across a handful of files copied from the upstream fork. As the codebase grew — shared utilities, a services layer, typed message contracts, storage abstractions — several problems emerged:

- **No type safety.** Shared interfaces (message types, storage shapes, error objects) were duplicated or assumed by convention. Mismatches between callers and handlers were invisible until runtime.
- **No module system.** Chrome MV3 service workers cannot use ES modules at the top level; the extension bundled everything as a single inline script. Sharing code between the background worker and the content script required duplication or copy-paste.
- **No dead-code detection.** Renaming or removing a function had no tooling support — breaking changes were silent.

A build step was needed to compile shared TypeScript modules into the two runtime artefacts Chrome requires: a service worker bundle (`background.js`) and a content script bundle (`google-meet.js`).

---

## Decision

Adopt **TypeScript** as the source language and **Vite** (with Rollup under the hood) as the bundler, outputting **IIFE** format for both bundles.

Key choices within this decision:

| Choice | Alternative considered | Reason |
|--------|----------------------|--------|
| IIFE output format | ES module format | Chrome MV3 service workers can consume ES module workers (`"type": "module"` in manifest), but content scripts injected via `chrome.scripting.executeScript` do not support ES module format. IIFE works for both without diverging configs. |
| Vite | esbuild directly, webpack, Parcel | Vite's `build.lib` mode produces clean IIFE bundles with minimal config. Rollup's tree-shaking removes dead code. esbuild alone lacks Rollup's bundling model; webpack adds configuration overhead not justified for a two-entry build. |
| `minify: false` | Minified output | The extension is sideloaded by engineers who may need to read or debug the compiled output. Readability is preferred over bundle size. |
| TypeScript strict mode | Loose mode | Strict mode catches the class of bugs (undefined access, missing discriminant narrowing) most likely to surface in async Chrome API callbacks. |

The `extension/popup.js` and `extension/meetings.js` UI pages remain plain JavaScript. They are thin UI scripts with no shared logic and do not benefit from a build step.

---

## Consequences

**Positive**

- Compile-time type checking catches interface mismatches before they reach the extension
- Shared code (`src/shared/`, `src/types.ts`) is imported once and bundled into each output — no duplication
- Vite's watch mode (`vite build --watch`) gives fast rebuild on save during development
- Rollup tree-shaking removes dead code from bundles

**Negative / trade-offs**

- A build step is now required before loading the extension; `npm run build` must be run after source changes
- The `extension/` directory contains compiled artefacts — contributors must not edit `background.js` or `google-meet.js` directly
- Two build targets (background + content) are chained in `vite.config.js` via a custom plugin; if the Vite API changes, the plugin may need updating

**Risks**

- The Vite `build.lib` API is not officially documented for multi-entry production use. Mitigation: the build is simple enough to migrate to direct Rollup or esbuild if Vite's API breaks.
