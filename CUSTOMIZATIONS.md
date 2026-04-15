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

### Branding

| File | Change | Reason |
|------|--------|--------|
| `extension/manifest.json` | `name` → `meet-transcripts` | Internal identity |
| `extension/manifest.json` | `version` reset to `1.0.0` | Own versioning line from fork point |
| `extension/manifest.json` | `description` → internal build copy | Not published to Chrome Web Store |
| `extension/background.js:456,501` | Download folder renamed `meet-transcripts/` | Remove upstream folder name |
| `extension/background.js:466` | Transcript footer → points to this repo | Remove upstream Chrome Store link |

---

## Merge review checklist

When reviewing an upstream sync PR, verify that upstream changes do not
silently overwrite items in **Active customizations**.

- [ ] `.github/workflows/upstream-sync.yml` is not touched by upstream
- [ ] Any replaced analytics/telemetry endpoints (if customized) are restored
- [ ] Any replaced status check endpoint (if customized) is restored
- [ ] Branding changes (if applied) are preserved
- [ ] Extension version in `manifest.json` is updated to latest upstream value
