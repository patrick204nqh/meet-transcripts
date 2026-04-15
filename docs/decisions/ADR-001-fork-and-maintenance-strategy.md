# ADR-001: Fork TranscripTonic as a self-maintained internal distribution

**Date:** 2026-04-15
**Status:** Accepted

---

## Context

[TranscripTonic](https://github.com/vivek-nexus/transcriptonic) is an open-source Chrome
extension that captures Google Meet transcripts locally and optionally posts them to a webhook.
It is actively maintained by its author but published as a public Chrome Web Store extension
with telemetry that phones home to the author's infrastructure.

Our team uses Google Meet heavily and wanted transcript capture with:

- **No dependency on a third-party Chrome Web Store listing** — we cannot rely on an external
  party's publishing cadence or account stability for an internal tool.
- **Control over telemetry** — the upstream extension sends anonymous analytics and error logs
  to Google Apps Script endpoints owned by the upstream author. For a security-conscious
  internal deployment we want to audit, replace, or disable those calls.
- **Ability to apply targeted patches** — UI tweaks, default setting changes, or integration
  hooks specific to our workflow, without waiting for upstream acceptance.
- **Predictable update cadence** — upstream ships when it ships. We want to absorb updates on
  our own schedule (quarterly review) rather than having the extension silently updated through
  the Chrome Web Store auto-update mechanism.

At the same time, we do not want to fully maintain the extension ourselves. The upstream author
does the heavy lifting of keeping up with Google Meet DOM changes. We want to track those
changes and selectively adopt them.

---

## Decision

We fork `vivek-nexus/transcriptonic` into this repository and maintain it as a
**self-hosted, sideloaded Chrome extension** distributed internally.

### Branching strategy

| Branch | Purpose |
|--------|---------|
| `main` | Our stable custom version — the authoritative branch |
| `upstream-sync` | Automated mirror of `upstream/main`, never edited directly |

### Upstream sync process

A GitHub Actions workflow runs **quarterly** (1st of Jan, Apr, Jul, Oct):

1. Force-pushes `upstream-sync` to match `upstream/main`
2. If new commits exist, opens a PR: `upstream-sync` → `main`
3. A human reviews the PR, resolves conflicts with our customizations, and merges

This gives us full visibility into every upstream change before it reaches our
deployment.

### Distribution

The extension is installed as an **unpacked extension** in Chrome developer mode.
We do not publish to the Chrome Web Store. Distribution is managed manually
(or via internal tooling) by sharing the `extension/` directory or a packaged `.zip`.

### Customizations

All changes from upstream are documented in [`CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md)
at the repo root. Every item in that file is a reminder of what to preserve during
upstream sync PR reviews.

---

## Customizations applied

The following changes were made on top of upstream as a direct result of this decision.
Each is tracked in [`CUSTOMIZATIONS.md`](../../CUSTOMIZATIONS.md).

### Telemetry removed

Upstream embeds three Google Apps Script endpoints that send anonymous data to the
upstream author's infrastructure on every transcript download and on errors:

- Analytics endpoint — POSTs extension version, webhook status, and platform per download
- Error logging endpoint — POSTs extension version, error code, and message on failures

**Decision:** Remove all three `fetch` calls entirely. No data leaves the browser.
`logError()` in all content scripts now calls `console.error` locally instead.

### Upstream version check bypassed

`checkExtensionStatus()` fetched a remote JSON from `ejnana.github.io` on every page load.
If the installed version was below the upstream author's declared `minVersion`, the extension
set its internal status to 400 and refused to run.

**Decision:** Since this fork resets the version to `1.0.0` (our own versioning line),
the remote check would immediately disable the extension. `checkExtensionStatus()` now
always resolves with status 200 without making any network request.

### Extension icon sourced locally

The notification banner icon was loaded from `ejnana.github.io` — an external dependency.
An `onerror` handler was also added so that if the icon fails to load in an orphaned
content script context (tab open before extension reload), the banner still displays
cleanly without a broken image.

**Decision:** Use `chrome.runtime.getURL("icon.png")` to load the icon from the local
extension bundle. No external image CDN dependency.

---

## Consequences

**Positive**

- No external dependency on Chrome Web Store availability or the upstream author's account
- Full audit trail of every change we apply on top of upstream
- Telemetry endpoints are under our control to replace or remove
- Quarterly review cadence matches our low-activity maintenance expectation

**Negative / trade-offs**

- Sideloaded extensions require developer mode enabled in Chrome — a minor friction for
  non-technical users
- We carry the burden of merge conflict resolution during quarterly syncs, especially if
  upstream touches the same files we customized
- No automatic Chrome updates — we must manually push new versions to users after merging
  an upstream sync

**Risks**

- If upstream significantly refactors the extension, a quarterly sync PR could be large.
  Mitigation: the diff is always scoped to `upstream-sync` → `main`, so the review surface
  is explicit and bounded.
