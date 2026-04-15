# TranscripTonic (internal fork)

A self-maintained fork of [vivek-nexus/transcriptonic](https://github.com/vivek-nexus/transcriptonic) —
a Chrome extension that captures Google Meet transcripts locally and optionally posts them to a webhook.

This fork exists for internal use. It is not published to the Chrome Web Store.
See [ADR-001](docs/adr/ADR-001-fork-and-maintenance-strategy.md) for the full rationale.

---

## Why a fork?

The upstream extension is well-built and actively maintained, but ships as a public Chrome Web Store
listing with telemetry tied to the upstream author's infrastructure. We wanted:

- **No Chrome Web Store dependency** — control over when and how the extension is distributed
- **Audit of telemetry** — ability to review, replace, or remove analytics and error-logging endpoints
- **Targeted customizations** — apply changes specific to our workflow without waiting for upstream acceptance
- **Predictable update cadence** — absorb upstream changes on a quarterly schedule rather than through
  silent Chrome auto-updates

We still benefit from all the upstream author's work maintaining compatibility with Google Meet's
ever-changing DOM. We just take those updates on our own terms.

---

## What it does

TranscripTonic runs in the background during Google Meet calls. It reads the live captions and
assembles a transcript locally in the browser. At the end of each meeting:

- Downloads the transcript as a `.txt` file
- Optionally POSTs it to a configured webhook (n8n, Google Docs, or any HTTP endpoint)

All processing stays in the browser. Nothing leaves the device unless you explicitly configure
a webhook.

Zoom and Teams are supported in beta — see the upstream
[wiki](https://github.com/vivek-nexus/transcriptonic/wiki/Zoom-and-Teams-beta-testing) for details.

---

## Installation (unpacked extension)

This fork is installed in Chrome as an unpacked extension. It requires **developer mode** enabled.

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `extension/` folder from this repository
6. The TranscripTonic icon will appear in your Chrome toolbar

To update to a newer version: pull the latest `main`, then click the refresh icon on the extension card
at `chrome://extensions`.

---

## Usage

The extension has two modes:

- **Auto mode** — records transcripts for every meeting automatically
- **Manual mode** — you toggle it on/off by clicking the CC (captions) icon inside Google Meet

At the end of a meeting the transcript is downloaded as a `.txt` file. Open the extension popup
to view the last 10 meetings or configure a webhook.

---

## Webhook integration

You can pipe transcripts to any tool that accepts a webhook POST. Configure the webhook URL in the
extension's "Set up webhooks" page. Refer to the upstream wiki for integration guides:

- [Google Docs integration](https://github.com/vivek-nexus/transcriptonic/wiki/Google-Docs-integration-guide)
- [n8n integration](https://github.com/vivek-nexus/transcriptonic/wiki/n8n-integration-guide)

---

## Fork maintenance

Upstream changes are reviewed and merged on a **quarterly basis**.

| Branch | Purpose |
|--------|---------|
| `main` | Our stable version — install from here |
| `upstream-sync` | Automated mirror of upstream `main`, never edited directly |

A GitHub Actions workflow runs on the 1st of January, April, July, and October. If upstream has
new commits it opens a PR from `upstream-sync` into `main` for manual review. The reviewer checks
for conflicts with our customizations (documented in [`CUSTOMIZATIONS.md`](CUSTOMIZATIONS.md))
before merging.

To trigger a sync manually: go to **Actions → Sync upstream → Run workflow**.

---

## Docs

- [Architecture](docs/architecture.md) — extension internals and fork maintenance flow
- [ADR-001](docs/adr/ADR-001-fork-and-maintenance-strategy.md) — decision record for this fork
- [CUSTOMIZATIONS.md](CUSTOMIZATIONS.md) — all changes made relative to upstream

---

## License

MIT — same as upstream. See [LICENSE](LICENSE).
