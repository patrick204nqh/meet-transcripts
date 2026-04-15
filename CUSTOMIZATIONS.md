# Customizations

This file tracks all changes made in this fork relative to the upstream repo
[vivek-nexus/transcriptonic](https://github.com/vivek-nexus/transcriptonic).

**Purpose:** When reviewing an upstream sync PR, use this file to identify
what must be preserved and what may conflict.

---

## Fork maintenance

| Item | Value |
|------|-------|
| Upstream repo | https://github.com/vivek-nexus/transcriptonic |
| Sync cadence | Quarterly (1st of Jan, Apr, Jul, Oct) via CI |
| Sync branch | `upstream-sync` → PR → `main` |

---

## Active customizations

### CI / repo tooling

| File | Change | Reason |
|------|--------|--------|
| `.github/workflows/upstream-sync.yml` | Added quarterly upstream sync workflow | Automate tracking of upstream changes |

---

## Planned / candidate customizations

The following are areas identified during the initial codebase scan as likely
targets for customization. Move items to **Active customizations** once
implemented, or delete if not needed.

### Analytics & telemetry

The extension sends anonymous data to two Google Apps Script endpoints
hardcoded in the source. Consider replacing or disabling for a private
deployment.

| File | Location | Current value |
|------|----------|---------------|
| `extension/background.js` | Lines ~493, 511 | Analytics endpoint (Google Apps Script) |
| `extension/background.js` | Lines ~508 | Error logging endpoint (Google Apps Script) |
| `extension/content-google-meet.js` | Line ~704 | Error logging endpoint (Google Apps Script) |

### Status check endpoint

On every Google Meet page load the extension fetches a status JSON to
determine the minimum required version and whether to show a beta message.

| File | Location | Current value |
|------|----------|---------------|
| `extension/content-google-meet.js` | Line ~734 | `https://ejnana.github.io/transcripto-status/status-prod-meet.json` |

### Branding & naming

| File | Location | Current value |
|------|----------|---------------|
| `extension/manifest.json` | `name` | `"TranscripTonic"` |
| `extension/manifest.json` | `description` | `"Simple Google Meet transcripts. Private and open source."` |
| `extension/background.js` | File path prefix | `TranscripTonic/` (saved transcript folder name) |
| `extension/background.js` | Transcript footer | Chrome Web Store link to upstream extension |
| `extension/popup.html` | Footer links | GitHub issues / wiki links pointing to upstream repo |
| `extension/meetings.html` | Footer links | GitHub wiki / integration guides pointing to upstream repo |

### Storage limits

| File | Location | Current value | Notes |
|------|----------|---------------|-------|
| `extension/background.js` | Line ~402 | `10` meetings retained | Increase if needed |

### Meeting retention & defaults

| Setting key | Default | File |
|-------------|---------|------|
| `operationMode` | `"auto"` | `extension/background.js` |
| `autoPostWebhookAfterMeeting` | `true` | `extension/background.js` |
| `autoDownloadFileAfterMeeting` | `true` | `extension/background.js` |

---

## Merge review checklist

When reviewing an upstream sync PR, verify that upstream changes do not
silently overwrite items in **Active customizations**.

- [ ] `.github/workflows/upstream-sync.yml` is not touched by upstream
- [ ] Any replaced analytics/telemetry endpoints (if customized) are restored
- [ ] Any replaced status check endpoint (if customized) is restored
- [ ] Branding changes (if applied) are preserved
- [ ] Extension version in `manifest.json` is updated to latest upstream value
