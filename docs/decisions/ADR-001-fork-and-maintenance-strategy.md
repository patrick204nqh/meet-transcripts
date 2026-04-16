# ADR-001: Internal Chrome extension for Google Meet transcript capture

**Date:** 2026-04-15
**Status:** Accepted (amended 2026-04-17)

---

## Context

This project originated as a fork of [vivek-nexus/transcriptonic](https://github.com/vivek-nexus/transcriptonic),
an open-source Chrome extension that captures Google Meet transcripts locally and optionally posts them to a webhook.

The fork was taken because the upstream extension is published as a public Chrome Web Store extension
with telemetry that phones home to the author's infrastructure. We wanted:

- **No dependency on a third-party Chrome Web Store listing** — we cannot rely on an external
  party's publishing cadence or account stability for an internal tool.
- **Control over telemetry** — the upstream extension sends anonymous analytics and error logs
  to Google Apps Script endpoints owned by the upstream author. For a security-conscious
  internal deployment we want to audit, replace, or disable those calls.
- **Ability to apply targeted patches** — UI tweaks, default setting changes, or integration
  hooks specific to our workflow.

---

## Decision (amended 2026-04-17)

**meet-transcripts is now independently maintained.** The fork relationship with
`vivek-nexus/transcriptonic` has been severed. This is our product.

The following changes were made as part of the pivot:

- Removed Zoom and Microsoft Teams support — Google Meet only.
- Removed upstream sync CI (`.github/workflows/upstream-sync.yml`).
- Removed `CUSTOMIZATIONS.md` — no longer needed without an upstream merge process.
- Removed n8n-specific integration copy — generic webhook support remains.
- Removed all upstream branding (TranscripTonic, vivek-nexus links).

The extension is still installed as an **unpacked extension** in Chrome developer mode.
We do not publish to the Chrome Web Store. Distribution is managed manually by sharing
the `extension/` directory or a packaged `.zip`.

---

## Customizations applied (from original fork)

### Telemetry removed

Upstream embeds Google Apps Script endpoints that send anonymous data to the upstream author's
infrastructure on every transcript download and on errors. All `fetch` calls have been removed.
No data leaves the browser. `logError()` in content scripts calls `console.error` locally instead.

### Upstream version check bypassed

`checkExtensionStatus()` fetched a remote JSON from `ejnana.github.io` on every page load.
If the installed version was below the upstream author's declared `minVersion`, the extension
refused to run. This check now always resolves with status 200 without making any network request.

### Extension icon sourced locally

The notification banner icon was loaded from `ejnana.github.io` — an external CDN dependency.
Changed to use `chrome.runtime.getURL("icon.png")` from the local extension bundle.

---

## Consequences

**Positive**

- No external dependency on Chrome Web Store availability or the upstream author's account
- No telemetry — no data leaves the device
- Simplified codebase — Google Meet only, no Zoom/Teams complexity
- No quarterly upstream sync burden

**Negative / trade-offs**

- Sideloaded extensions require developer mode enabled in Chrome — minor friction for non-technical users
- We are now fully responsible for keeping up with Google Meet DOM changes
- No automatic Chrome updates — must manually distribute new versions

**Risks**

- Google Meet DOM changes can silently break caption capture. Mitigation: test after Google Meet
  UI updates; the capture logic is isolated in `content-google-meet.js`.
