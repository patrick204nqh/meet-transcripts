# meet-transcripts

Google Meet transcript capture for internal use. Records live captions locally in the browser and saves them as `.txt` files at the end of each meeting.

Not published to the Chrome Web Store. Installed as a sideloaded extension.

---

## What it does

meet-transcripts runs in the background during Google Meet calls. It reads the live captions and assembles a transcript locally in the browser. At the end of each meeting:

- Downloads the transcript as a `.txt` file
- Optionally POSTs it to a configured webhook (Google Docs, Notion, or any HTTP endpoint)

All processing stays in the browser. Nothing leaves the device unless you explicitly configure a webhook.

---

## Installation (unpacked extension)

This extension is installed in Chrome as an unpacked extension. It requires **developer mode** enabled.

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `extension/` folder from this repository
6. The extension icon will appear in your Chrome toolbar

To update to a newer version: pull the latest `main`, then click the refresh icon on the extension card at `chrome://extensions`.

---

## Usage

The extension has two modes:

- **Auto mode** — records transcripts for every meeting automatically
- **Manual mode** — you toggle it on/off by clicking the CC (captions) icon inside Google Meet

At the end of a meeting the transcript is downloaded as a `.txt` file. Open the extension popup to view the last 10 meetings or configure a webhook.

---

## Webhook integration

You can pipe transcripts to any tool that accepts a webhook POST. Configure the webhook URL in the extension's "Set up webhooks" page.

---

## Docs

- [Architecture](docs/architecture.md) — extension internals
- [ADR-001](docs/decisions/ADR-001-fork-and-maintenance-strategy.md) — product history and decisions

---

## License

MIT. See [LICENSE](LICENSE).
