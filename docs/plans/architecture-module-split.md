# Plan: Module Split Refactor

## Motivation

`content-google-meet.js` has grown to ~830 lines and mixes five distinct concerns in a
single flat file with nested promise closures. Each new feature (e.g. mini-window resilience)
adds more interleaved state, making the next change harder to reason about and test in
isolation.

This plan introduces a **bundler + module split** — no architectural pattern changes, just
sensible decomposition into small single-concern files.

---

## Target Structure

```
extension/
├── src/
│   ├── content-google-meet.js   ← entry point only; wires modules together
│   ├── observer/
│   │   ├── transcript-observer.js   ← attachTranscriptObserver, captionWatchdog, transcriptMutationCallback
│   │   └── chat-observer.js         ← chat observer setup, chatMessagesMutationCallback
│   ├── storage.js               ← overWriteChromeStorage, recoverLastMeeting
│   ├── ui.js                    ← showNotification, pulseStatus, updateMeetingTitle
│   └── meeting.js               ← meeting lifecycle: meetingRoutines, hasMeetingStarted/Ended, buffers
├── background.js                ← unchanged (already a single-concern file)
├── popup.js                     ← unchanged
└── meetings.js                  ← unchanged
```

Target: each module under ~150 lines.

---

## Why a Bundler

Currently the extension loads raw JS directly from `extension/`. Adding ES modules
requires either:

1. **Bundler (Vite)** — builds all `src/` files into a single `extension/content-google-meet.js`
   output. Dev loop: `npm run build` (or `npm run dev` with watch) before reloading extension.
2. **Native ES modules in content scripts** — possible via `"type": "module"` in manifest, but
   poorly supported in MV3 content scripts as of Chrome 120 and adds CSP complexity.

**Decision: Vite.** Minimal config, fast HMR-free watch build, zero runtime overhead, and
it's already common in the Chrome extension ecosystem.

---

## Implementation Steps

| # | Task | Notes |
|---|------|-------|
| 1 | Add Vite to `package.json` as a dev dependency | `npm install -D vite` |
| 2 | Create `vite.config.js` for content script build | Input: `src/content-google-meet.js` → output: `extension/content-google-meet.js`; format: `iife` (no module wrapper in content script context) |
| 3 | Create `src/` directory with the five module files | Copy-paste + reorganise from current monolith; no logic changes at this step |
| 4 | Wire entry point (`src/content-google-meet.js`) | Import and connect modules; keep the same top-level flow |
| 5 | Run `npm run build` and verify output is functionally identical to current file | Load the built extension in Chrome, join a Meet call, check transcript saves correctly |
| 6 | Update `manifest.json` content script path if needed | Should remain `content-google-meet.js` — Vite outputs there |
| 7 | Update `package.json` scripts: `build`, `dev` (watch mode) | `"build": "vite build"`, `"dev": "vite build --watch"` |
| 8 | Update `README.md` with new build instructions | One paragraph: install → build → load extension |
| 9 | Update existing Playwright tests to build first if they load the extension | Check `tests/` setup |

---

## Module Responsibilities

### `src/meeting.js`
Global meeting state, buffer variables, and the `meetingRoutines()` orchestrator.

```js
// Owns: hasMeetingStarted, hasMeetingEnded, transcript, chatMessages,
//       personNameBuffer, transcriptTextBuffer, timestampBuffer,
//       meetingTitle, meetingStartTimestamp, userName
// Exports: meetingRoutines(), pushBufferToTranscript(), insertGapMarker()
```

### `src/observer/transcript-observer.js`
All caption DOM observation logic.

```js
// Owns: attachTranscriptObserver(), captionWatchdog setup,
//       transcriptMutationCallback(), onVisibilityChange handler
// Depends on: meeting.js (buffers, flags), storage.js
```

### `src/observer/chat-observer.js`
Chat message DOM observation.

```js
// Owns: chat observer setup, chatMessagesMutationCallback(), pushUniqueChatBlock()
// Depends on: meeting.js (chatMessages), storage.js
```

### `src/storage.js`
All `chrome.storage` reads and writes.

```js
// Owns: overWriteChromeStorage(), recoverLastMeeting()
// Depends on: meeting.js (state to serialise)
```

### `src/ui.js`
All DOM injection for the extension's own UI.

```js
// Owns: showNotification(), pulseStatus(), updateMeetingTitle(), selectElements(),
//       waitForElement()
// No dependencies on other modules
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Circular imports (e.g. `meeting.js` ↔ `storage.js`) | Pass state as arguments rather than importing globals; or use a single shared-state object |
| Vite IIFE output wraps everything — Chrome extension CSP may block `eval` in some bundles | Use `build.minify: false` initially; avoid dynamic `eval`/`Function` which Vite doesn't generate by default |
| Build step forgotten before testing | Add a `pretest` script: `"pretest": "vite build"` |
| `background.js` currently uses no bundler — keep it that way | `background.js` is already clean and single-concern; don't pull it into the Vite pipeline |

---

## Definition of Done

- [ ] `npm run build` produces a working `extension/content-google-meet.js`
- [ ] Each `src/` module is under 150 lines
- [ ] No logic changes from the current implementation — pure structural refactor
- [ ] Extension loads in Chrome without errors
- [ ] Manual Meet test: transcript saves, chat saves, mini-window re-attach works
- [ ] Existing Playwright tests pass
- [ ] `README.md` updated with build step
