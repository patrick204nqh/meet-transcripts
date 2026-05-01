# ADR-005: SPA consolidation — single app.html with hash routing

**Date:** 2026-05-01
**Status:** Accepted — amends ADR-003 (UI pages now TypeScript, not plain JS)

---

## Context

The extension originally had two separate full-page UIs: `meetings.html` (meeting history + webhook config) and `settings.html` (capture mode, automation, webhook form). Opening either from the popup opened a new browser tab. Navigating between the two opened a second tab. Users ended up with multiple `chrome-extension://` tabs accumulating in their browser.

Separately, ADR-003 noted a layering gap: the UI pages remained plain JavaScript outside the TypeScript build pipeline, accessing `chrome.storage` and `chrome.runtime` directly without type safety. Adding them to the Vite build was deferred at the time as "requiring additional Vite entries."

---

## Decision

Consolidate `meetings.html` and `settings.html` into a single `app.html` with two tab panels switched by hash routing (`#meetings`, `#settings`). The popup's two navigation links are replaced with a single "Open Meetings" button that focuses an already-open `app.html` tab or creates one.

The merged page logic (`src/pages/app/index.ts`) is compiled by Vite to `extension/app.js`. The popup logic (`src/pages/popup/index.ts`) is also compiled by Vite. Both are now TypeScript — this supersedes the ADR-003 consequence that stated UI pages would remain plain JS.

Key implementation choices:

| Choice | Reason |
|--------|--------|
| Hash routing (`#meetings`, `#settings`) | No framework, no router library; `hashchange` event is native and sufficient for two views |
| Single Vite entry (`app`) replaces `meetings` + `settings` | One bundle, one cache, shared utilities (`showToast`, `showConfirm`, `requestWebhookPermission`) deduplicated |
| CSS extracted to `shared.css` + `app.css` + `popup.css` | Eliminates the CSS duplication that had accumulated between the two old pages |
| Popup focuses existing tab via `chrome.tabs.query` | Avoids creating duplicate `app.html` tabs on repeated popup opens |

---

## Alternatives Considered

### Alternative 1: Keep separate pages, fix the multi-tab problem with `chrome.tabs.query`
- **Pros**: No structural change; each page stays independent
- **Cons**: Two separate bundles, continued CSS duplication, no shared utilities — the root cause (two separate pages) remains
- **Why not**: Treats the symptom, not the cause

### Alternative 2: Adopt a frontend framework (React, Vue, Preact)
- **Pros**: Routing, state management, and component sharing are solved problems
- **Cons**: Adds a dependency and build complexity to a ~500-line UI; the extension will never grow to a scale where a framework pays for itself
- **Why not**: Overengineered for two views with no shared reactive state

---

## Consequences

### Positive
- Navigating between Meetings and Settings never opens a new tab — it switches panels in-page
- `showToast`, `showConfirm`, and `requestWebhookPermission` are defined once in `app/index.ts`
- UI pages are now TypeScript — type errors in storage reads and message sends are caught at compile time
- CSS custom properties are defined once in `shared.css` — no more drift between the two pages

### Negative
- Hash routing state is lost on hard reload (navigating to `app.html` without a hash lands on Meetings by default — acceptable)
- The popup and app page share the same capture-mode toggle; they stay in sync via `chrome.storage.sync` rather than direct state, which means a short propagation delay is possible

### Risks
- The `chrome.tabs.query({ url: appUrl })` focus logic in the popup requires the `tabs` permission — this was already in the manifest for the active-tab status feature (ADR-002 era). If the permission is removed, the button silently falls back to always creating a new tab.
