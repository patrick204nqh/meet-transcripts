# Contributing to Meet Transcripts

Meet Transcripts is an independently maintained project. There is no upstream repository to sync with — all changes are made directly here.

---

## Development setup

1. Clone the repository
2. Install dependencies and build: `npm install && npm run build`
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the `extension/` folder
6. While iterating, run `npm run dev` to rebuild on save, then click the refresh icon at `chrome://extensions` to reload

The TypeScript source under `src/` is the canonical code; Vite compiles it into the two IIFE bundles in `extension/`. Edit `src/`, never `extension/background.js` or `extension/google-meet.js`.

---

## Project structure

```
src/                       # TypeScript source — canonical
├── types.ts               # Domain types and message contracts
├── shared/                # Pure utilities (formatters, errors, storage repo, messages)
├── services/              # Use-case orchestration (meeting, download, webhook)
├── background/            # Chrome API adapters (message-handler, event-listeners, lifecycle)
└── content/               # DOM observers (google-meet entry, observers, state-sync, ui)

extension/                 # Built artifacts and unbundled UI
├── manifest.json          # Extension manifest (MV3)
├── popup.html / popup.js  # Toolbar popup UI (plain JS, not compiled)
├── meetings.html / meetings.js  # Meeting history and webhook config (plain JS, not compiled)
├── background.js          # Compiled service worker (do not edit by hand)
├── google-meet.js         # Compiled content script (do not edit by hand)
├── icon.png               # Toolbar icon (128×128 PNG)
└── icons/                 # SVG assets and logo

docs/
├── architecture.md        # Extension internals (C4 diagrams)
├── decisions/             # Architecture Decision Records (ADRs)
└── plans/                 # Implementation plans
```

---

## Design system

The UI uses a **glassmorphism** style. Keep new UI consistent with the existing tokens:

| Token | Value | Usage |
|-------|-------|-------|
| `--brand` | `#38bdf8` | Sky blue — primary actions, links, accents |
| `--brand-dim` | `rgba(56,189,248,0.12)` | Hover backgrounds |
| `--brand-border` | `rgba(56,189,248,0.3)` | Card and input borders |
| `--glass` | `rgba(255,255,255,0.05)` | Card backgrounds |
| `--glass-border` | `rgba(255,255,255,0.1)` | Glass card borders |
| `--text` | `#f1f5f9` | Primary text |
| `--text-2` | `#94a3b8` | Secondary / muted text |

Cards use `backdrop-filter: blur(20–24px)` with a `box-shadow` for depth. Do not introduce new colour values — extend via CSS variables.

---

## Making changes

### Bug fixes and small improvements

1. Create a branch: `git checkout -b fix/short-description`
2. Make your change and test it manually in Chrome
3. Open a pull request against `main` with a clear description of what changed and why

### New features

Open an issue first to discuss the approach before writing code. Meet Transcripts is intentionally scoped to Google Meet only — features that add external dependencies or new platform support are unlikely to be accepted.

### Google Meet DOM changes

Caption capture relies on DOM selectors in `src/content/` (compiled into `extension/google-meet.js`). If Google updates their UI these selectors may break silently. When fixing a broken selector:

- Document the old and new selector in the commit message
- Note the approximate date Google rolled out the change

---

## Testing

There is no automated unit test suite for the extension itself. Manual testing is required:

- Join a real Google Meet (or use the [Meet test environment](https://meet.google.com/)) with captions enabled
- Verify transcripts are saved after the meeting ends
- Verify webhook POST fires if configured
- Check the meetings history page renders correctly
- Run Playwright integration tests if modifying `meetings.html` behaviour:

```bash
npm install
npx playwright test
```

---

## Commit style

Use plain imperative sentences. One line is usually enough:

```
fix: handle missing caption container on Meet rejoin
feat: add meeting duration to webhook payload
chore: update icon to sailboat design
```

---

## Architecture decisions

Significant decisions are recorded as ADRs in `docs/decisions/`. If your change affects how the extension fundamentally works (e.g. storage schema, new permissions, platform support), add an ADR.

---

## What we won't accept

- Upstream sync workflows or references to `vivek-nexus/transcriptonic`
- Telemetry, analytics, or any outbound network calls not explicitly triggered by the user
- Zoom or Microsoft Teams support
- Chrome Web Store publishing configuration
- New external runtime dependencies
