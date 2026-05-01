# Architecture Refactor: Multi-Platform, Browser-Agnostic Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor meet-transcripts into a layered, platform-agnostic architecture that can support MS Teams, Zoom, and Firefox without touching shared infrastructure.

**Architecture:** Five layers with hard ownership boundaries — Platform Adapters own all DOM knowledge; Content Core drives session lifecycle via an injected adapter; Browser Port is the only place `chrome.*` is called; Shared Kernel contains pure types/formatters. A `MeetingSession` class replaces the 190-line `meetingRoutines()` god-function, and `createSessionState()` replaces the global mutable singleton.

**Tech Stack:** TypeScript, Chrome MV3, Vite, Playwright (E2E existing), Vitest (unit — added in this plan).

---

## Build artifact convention

`extension/background.js` and `extension/platforms/google-meet.js` are Vite build outputs **intentionally committed to the repo**. This lets users clone and load the extension in Chrome immediately without running a build step — a deliberate user-experience choice.

**Rule for every task that changes source code:**
1. Run `npm run build` after all source edits are done and `npm run typecheck` is clean.
2. Include `extension/background.js` and/or `extension/platforms/google-meet.js` in the commit alongside the source changes.
3. Never commit a rebuilt artifact without the source changes that produced it in the same commit.

**Multi-platform note:** When a second platform (e.g. MS Teams) is added, the Vite config will need a multi-entry build that emits `extension/platforms/ms-teams.js`. That new artifact is also committed. Update `vite.config.ts` at that point to use `rollupOptions.input` with multiple entries — one per platform, all outputting into `extension/platforms/`.

---

## Why this is one plan, not six

All ten tasks form a single dependency chain. Tasks 1–3 are independent foundations; Tasks 4–5 are prerequisites for Task 7; Task 6 is a prerequisite for Task 8; Tasks 8–9 depend on 7 and 6. Breaking into separate plans would leave each "plan" in a non-functional state. The migration roadmap commits that ship each task are independently reviewable PRs.

---

## Dependency order

```
Task 1 (test infra)    ─┐
Task 2 (logger)         ├─ independent, do first
Task 3 (ExtensionError) ┘
Task 4 (browser port)  ─┐
Task 5 (protocol)       ├─ independent, do before task 7
                        ┘
Task 6 (platform adapter) ─── prerequisite for task 8
Task 7 (storage API)       ─── needs task 4
Task 8 (session lifecycle) ─── needs tasks 4, 6, 7
Task 9 (state scoping)     ─── needs task 8
Task 10 (services merge)   ─── independent anytime
```

---

## File map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `vitest.config.ts` | Vitest config alongside Playwright |
| Create | `tests/unit/setup.ts` | Global chrome mock injection |
| Create | `tests/unit/chrome-mock.ts` | Reusable `makeChromeMock()` factory |
| Create | `src/shared/logger.ts` | Leveled logger with `[meet-transcripts]` prefix |
| Create | `src/shared/protocol.ts` | Versioned message types, separate prod/dev messages |
| Create | `src/browser/types.ts` | `IBrowserStorage`, `IBrowserRuntime` interfaces |
| Create | `src/browser/chrome.ts` | Chrome concrete implementations |
| Create | `src/platforms/types.ts` | `IPlatformAdapter` interface |
| Create | `src/platforms/google-meet/adapter.ts` | All Google Meet DOM selectors + parsing logic |
| Create | `src/platforms/google-meet/index.ts` | New entry point (replaces `src/content/google-meet.ts`) |
| Create | `src/content/core/observer-manager.ts` | Owns transcript/chat/watchdog observer lifetimes |
| Create | `src/content/core/meeting-session.ts` | `MeetingSession` class replacing `meetingRoutines()` |
| Create | `src/shared/formatters.test.ts` | Unit tests for pure formatter functions |
| Create | `src/shared/storage-repo.test.ts` | Unit tests for migration functions |
| Create | `src/content/observer/transcript-observer.test.ts` | Unit tests for buffer logic + -250 threshold |
| Modify | `package.json` | Add vitest, happy-dom devDependencies |
| Modify | `tsconfig.json` | Add `tests/unit` to include |
| Modify | `vite.config.ts` | Update entry point to `src/platforms/google-meet/index.ts` |
| Modify | `src/types.ts` | Add `MeetingPayload` shared interface |
| Modify | `src/shared/errors.ts` | Add `ExtensionError` class, `ErrorCategory` |
| Modify | `src/shared/storage-repo.ts` | Accept `IBrowserStorage`, return `null` from `getCurrentMeeting` |
| Modify | `src/shared/messages.ts` | Accept `IBrowserRuntime`, use protocol types |
| Modify | `src/content/state.ts` | Add `createSessionState()`, `resetState()` |
| Modify | `src/content/state-sync.ts` | Accept `IBrowserStorage`, replace fire-and-forget with `StatePersister` |
| Modify | `src/content/observer/transcript-observer.ts` | Named constant for -250 threshold, use `log` |
| Modify | `src/content/observer/chat-observer.ts` | Accept `root: Element` param instead of `document.querySelector` |
| Modify | `src/background/content-script.ts` | Use `IPlatformAdapter` config type |
| Modify | `src/background/message-handler.ts` | Version gate, use `protocol.ts` types |
| Modify | `src/services/meeting.ts` | Use `IBrowserStorage`, throw `ExtensionError` |
| Modify | `src/services/download.ts` | Absorb `background/download.ts` real logic |
| Modify | `src/services/webhook.ts` | Absorb `background/webhook.ts` real logic |
| Delete | `src/content/google-meet.ts` | Replaced by `src/platforms/google-meet/index.ts` |
| Delete | `src/content/meeting-session.ts` | Replaced by `src/content/core/meeting-session.ts` |
| Delete | `src/background/download.ts` | Logic moved into `src/services/download.ts` |
| Delete | `src/background/webhook.ts` | Logic moved into `src/services/webhook.ts` |

---

## Task 0: Restructure extension/ output directory

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/background/content-script.ts`
- Move: `extension/google-meet.js` → `extension/platforms/google-meet.js`

This task has no source-logic changes. It is done first so every subsequent commit writes artifacts to the correct location.

**Why `background.js` stays at root:** There is only ever one background service worker. The `platforms/` subdirectory is for content scripts — one file per meeting platform. This mirrors `src/platforms/` in the source tree.

**Note on `popup.js` / `meetings.js`:** These are plain hand-written JavaScript (no TypeScript source, not built by Vite). They stay at `extension/` root permanently as source files.

- [ ] **Step 1: Update `vite.config.ts` — change content script output path**

Change the `entryFileNames` in the content script build from `'google-meet.js'` to `'platforms/google-meet.js'`:

```typescript
rollupOptions: {
  output: {
    entryFileNames: 'platforms/google-meet.js',  // was: 'google-meet.js'
  },
},
```

- [ ] **Step 2: Update `src/background/content-script.ts` — fix registered script path**

```typescript
const PLATFORM_CONFIGS: Record<Platform, { id: string; js: string[]; matches: string[]; excludeMatches: string[] }> = {
  google_meet: {
    id: "google-meet",
    js: ["platforms/google-meet.js"],            // was: ["google-meet.js"]
    matches: ["https://meet.google.com/*"],
    excludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"],
  },
}
```

- [ ] **Step 3: Build to create the new path**

```bash
npm run build 2>&1 | tail -5
```

Expected: `extension/platforms/google-meet.js` is created.

- [ ] **Step 4: Delete the old artifact from the flat root**

```bash
git rm extension/google-meet.js
```

- [ ] **Step 5: Reload the extension and smoke-test**

1. Open `chrome://extensions`
2. Click **Reload** on Meet Transcripts
3. Join a Meet call — verify captions are captured

Expected: extension loads cleanly, no errors in service worker or content script console.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/background/content-script.ts extension/platforms/google-meet.js
git commit -m "refactor(build): move content script artifacts into extension/platforms/ to mirror src/platforms/ structure"
```

---

## Task 1: Unit Test Infrastructure (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/setup.ts`
- Create: `tests/unit/chrome-mock.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `src/shared/formatters.test.ts` (smoke test to verify setup)

- [ ] **Step 1: Install Vitest dependencies**

```bash
cd /Users/nqhuy25/Development/sandbox/meet-transcripts
npm install --save-dev vitest @vitest/coverage-v8 happy-dom
```

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 2: Add test scripts to `package.json`**

In the `scripts` section, add after `"test:ui"`:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest",
"test:unit:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**', 'src/services/**', 'src/content/observer/**'],
    },
  },
})
```

- [ ] **Step 4: Create `tests/unit/chrome-mock.ts`**

```typescript
import { vi } from 'vitest'

export function makeChromeMock(overrides: Record<string, unknown> = {}) {
  const storage: Record<string, unknown> = { ...overrides }

  return {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.map((k) => [k, storage[k]]).filter(([, v]) => v !== undefined)
          )
        ),
        set: vi.fn(async (data: Record<string, unknown>) => Object.assign(storage, data)),
      },
      sync: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.map((k) => [k, storage[k]]).filter(([, v]) => v !== undefined)
          )
        ),
        set: vi.fn(async (data: Record<string, unknown>) => Object.assign(storage, data)),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      lastError: null,
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
    },
    downloads: {
      download: vi.fn(),
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    _storage: storage,
  }
}

export type ChromeMock = ReturnType<typeof makeChromeMock>
```

- [ ] **Step 5: Create `tests/unit/setup.ts`**

```typescript
import { beforeEach } from 'vitest'
import { makeChromeMock } from './chrome-mock'

beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = makeChromeMock()
})
```

- [ ] **Step 6: Update `tsconfig.json` to include unit tests**

Change `"include"` from `["src/**/*"]` to:

```json
"include": ["src/**/*", "tests/unit/**/*", "vitest.config.ts"]
```

- [ ] **Step 7: Write a smoke test for `buildTranscriptFilename`**

Create `src/shared/formatters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildTranscriptFilename, buildWebhookBody, getTranscriptString } from './formatters'
import type { Meeting } from '../types'

const base: Meeting = {
  software: 'Google Meet',
  title: 'Sprint Planning',
  startTimestamp: '2024-03-15T09:00:00.000Z',
  endTimestamp: '2024-03-15T10:00:00.000Z',
  transcript: [],
  chatMessages: [],
  webhookPostStatus: 'new',
}

describe('buildTranscriptFilename', () => {
  it('includes the expected path prefix and .txt suffix', () => {
    expect(buildTranscriptFilename(base)).toMatch(/^meet-transcripts\/Google Meet transcript-/)
    expect(buildTranscriptFilename(base)).toMatch(/\.txt$/)
  })

  it('replaces characters illegal in filenames', () => {
    const result = buildTranscriptFilename({ ...base, title: 'Q4: Budget / Plan? <Final>' })
    expect(result).not.toMatch(/[/:?<>]/)
    expect(result).toContain('Q4_')
  })

  it('falls back to "Meeting" when title is undefined', () => {
    expect(buildTranscriptFilename({ ...base, title: undefined })).toContain('-Meeting at ')
  })

  it('uses "Transcript" prefix when software is undefined', () => {
    expect(buildTranscriptFilename({ ...base, software: undefined })).toMatch(/^meet-transcripts\/Transcript-/)
  })
})

describe('buildWebhookBody', () => {
  const withTranscript: Meeting = {
    ...base,
    transcript: [{ personName: 'Alice', timestamp: '2024-03-15T09:01:00.000Z', text: 'Hello team' }],
  }

  it('simple body — transcript is a string', () => {
    const body = buildWebhookBody(withTranscript, 'simple')
    expect(body.webhookBodyType).toBe('simple')
    expect(typeof body.transcript).toBe('string')
    expect(body.transcript as string).toContain('Alice')
  })

  it('advanced body — transcript is an array', () => {
    const body = buildWebhookBody(withTranscript, 'advanced')
    expect(body.webhookBodyType).toBe('advanced')
    expect(Array.isArray(body.transcript)).toBe(true)
  })
})

describe('getTranscriptString', () => {
  it('returns empty string for empty transcript', () => {
    expect(getTranscriptString([])).toBe('')
  })

  it('formats each block as "Name (timestamp)\\ntext\\n\\n"', () => {
    const result = getTranscriptString([
      { personName: 'Bob', timestamp: '2024-01-01T09:00:00.000Z', text: 'Hey' },
    ])
    expect(result).toContain('Bob')
    expect(result).toContain('Hey')
  })
})
```

- [ ] **Step 8: Run the unit tests**

```bash
npm run test:unit
```

Expected: all tests pass. If `chrome` global leaks into the formatter tests, the `setup.ts` injection resolves it.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts tests/unit/setup.ts tests/unit/chrome-mock.ts src/shared/formatters.test.ts package.json tsconfig.json
git commit -m "test: add Vitest unit test infrastructure with chrome mock and formatter smoke tests"
```

---

## Task 2: Shared Logger

**Files:**
- Create: `src/shared/logger.ts`
- Modify: `src/content/observer/transcript-observer.ts` (remove console.log("Transcript captured"))
- Modify: `src/content/observer/chat-observer.ts` (remove console.log("Chat message captured"))
- Modify: `src/content/pip-capture.ts` (replace console.log)
- Modify: `src/content/meeting-session.ts` (replace all console.log)
- Modify: `src/background/event-listeners.ts` (replace console.log)
- Modify: `src/background/lifecycle.ts` (replace console.log)
- Modify: `src/background/message-handler.ts` (replace console.log(msg.type))
- Modify: `src/content/ui.ts` (replace logError console.error)

- [ ] **Step 1: Create `src/shared/logger.ts`**

```typescript
const PREFIX = "[meet-transcripts]"
const IS_DEV = typeof __DEV__ !== "undefined" && (__DEV__ as boolean)

export const log = {
  debug: (...a: unknown[]): void => { if (IS_DEV) console.debug(PREFIX, ...a) },
  info:  (...a: unknown[]): void => { console.info(PREFIX, ...a) },
  warn:  (...a: unknown[]): void => { console.warn(PREFIX, ...a) },
  error: (...a: unknown[]): void => { console.error(PREFIX, ...a) },
}
```

- [ ] **Step 2: Update `src/content/observer/transcript-observer.ts`**

Replace:
```typescript
      console.log("Transcript captured")
```
With:
```typescript
      log.debug("Transcript captured")
```

And add the import at the top:
```typescript
import { log } from '../../shared/logger'
```

Also replace:
```typescript
      console.log("No active transcript")
```
With:
```typescript
      log.debug("No active transcript")
```

- [ ] **Step 3: Update `src/content/observer/chat-observer.ts`**

Add import:
```typescript
import { log } from '../../shared/logger'
```

Replace:
```typescript
      console.log("Chat message captured")
```
With:
```typescript
      log.debug("Chat message captured")
```

- [ ] **Step 4: Update `src/content/pip-capture.ts`**

Add import:
```typescript
import { log } from '../shared/logger'
```

Replace:
```typescript
    console.log("PiP entered — attaching caption observer")
```
With:
```typescript
    log.info("PiP entered — attaching caption observer")
```

Replace:
```typescript
    console.log("PiP left — detaching caption observer")
```
With:
```typescript
    log.info("PiP left — detaching caption observer")
```

Replace:
```typescript
    console.log("Document Picture-in-Picture not supported — PiP capture disabled")
```
With:
```typescript
    log.info("Document Picture-in-Picture not supported — PiP capture disabled")
```

- [ ] **Step 5: Update `src/content/meeting-session.ts`**

Add import:
```typescript
import { log } from '../shared/logger'
```

Replace each `console.log(...)` with the appropriate level:
- `console.log("Meeting started")` → `log.info("Meeting started")`
- `console.log("Manual mode selected, leaving transcript off")` → `log.info("Manual mode selected, leaving transcript off")`
- `console.warn("setBadgeText failed:", e)` → already in message-handler; in meeting-session just update any remaining console.log calls

- [ ] **Step 6: Update `src/background/event-listeners.ts`, `src/background/lifecycle.ts`, `src/background/message-handler.ts`**

In each file, add:
```typescript
import { log } from '../shared/logger'
```

Then replace:
- `console.log("Successfully intercepted tab close")` → `log.info(...)`
- `console.log("Meet tab navigated away from call — finalizing meeting")` → `log.info(...)`
- `console.log("No active meeting, applying update immediately")` → `log.info(...)`
- `console.log("Deferred update flag set")` → `log.info(...)`
- `console.log(msg.type)` → `log.debug("message received:", msg.type)`
- `console.log("Meeting tab id saved")` → `log.info(...)`
- `console.log("Meeting tab id cleared for next meeting")` → `log.info(...)`
- `console.log("Applying deferred update")` → `log.info(...)`
- `console.error("finalizeMeeting failed on tab close:", e)` → `log.error(...)`
- `console.error("finalizeMeeting failed on navigation away:", e)` → `log.error(...)`
- `console.warn("setBadgeText failed:", e)` → `log.warn(...)`
- `console.warn("setBadgeBgColor failed:", e)` → `log.warn(...)`

- [ ] **Step 7: Update `src/content/ui.ts` — remove standalone `logError`**

`logError` is a thin wrapper around `console.error` that is superseded by `log.error`. Replace `logError` internals and update `handleContentError`:

```typescript
import { log } from '../shared/logger'

// Delete logError entirely — replace its one call site in handleContentError:
export function handleContentError(code: string, err: unknown, notify = true): void {
  log.error(`Error ${code}:`, err)
  if (notify) showNotification(bugStatusJson)
}
```

Remove the `export function logError(...)` declaration. Update any import of `logError` — search the codebase:

```bash
grep -r "logError" /Users/nqhuy25/Development/sandbox/meet-transcripts/src/
```

If nothing else imports it, delete it from `ui.ts`.

- [ ] **Step 8: Typecheck and build**

```bash
npm run typecheck && npm run build 2>&1 | tail -5
```

Expected: zero errors, builds successfully.

- [ ] **Step 9: Run unit tests**

```bash
npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 10: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/shared/logger.ts src/content/observer/transcript-observer.ts src/content/observer/chat-observer.ts src/content/pip-capture.ts src/content/meeting-session.ts src/background/event-listeners.ts src/background/lifecycle.ts src/background/message-handler.ts src/content/ui.ts extension/background.js extension/platforms/google-meet.js
git commit -m "refactor(logging): replace bare console calls with leveled logger, debug logs silenced in production"
```

---

## Task 3: ExtensionError Class and Error Hierarchy

**Files:**
- Modify: `src/shared/errors.ts`
- Modify: `src/services/meeting.ts`
- Modify: `src/background/download.ts`
- Modify: `src/background/webhook.ts`

- [ ] **Step 1: Write the failing test for `ExtensionError`**

Create `src/shared/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ExtensionError, ErrorCategory, ErrorCode } from './errors'

describe('ExtensionError', () => {
  it('is an instance of Error', () => {
    const e = new ExtensionError(ErrorCode.MEETING_NOT_FOUND, 'Meeting not found', 'MEETING')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(ExtensionError)
  })

  it('has the correct name', () => {
    const e = new ExtensionError(ErrorCode.NO_WEBHOOK_URL, 'No URL', 'NETWORK')
    expect(e.name).toBe('ExtensionError')
  })

  it('exposes code and category', () => {
    const e = new ExtensionError(ErrorCode.BLOB_READ_FAILED, 'Blob failed', 'STORAGE')
    expect(e.code).toBe(ErrorCode.BLOB_READ_FAILED)
    expect(e.category).toBe('STORAGE')
    expect(e.message).toBe('Blob failed')
  })

  it('ErrorCategory has all expected keys', () => {
    expect(ErrorCategory.STORAGE).toBe('STORAGE')
    expect(ErrorCategory.NETWORK).toBe('NETWORK')
    expect(ErrorCategory.MEETING).toBe('MEETING')
    expect(ErrorCategory.PERMISSION).toBe('PERMISSION')
    expect(ErrorCategory.UI).toBe('UI')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit 2>&1 | grep -E "FAIL|PASS|error"
```

Expected: FAIL — `ExtensionError` not yet exported from `errors.ts`.

- [ ] **Step 3: Update `src/shared/errors.ts`**

Replace the entire file content:

```typescript
export const ErrorCode = {
  BLOB_READ_FAILED: "009",
  MEETING_NOT_FOUND: "010",
  WEBHOOK_REQUEST_FAILED: "011",
  NO_WEBHOOK_URL: "012",
  NO_MEETINGS: "013",
  EMPTY_TRANSCRIPT: "014",
  INVALID_INDEX: "015",
  NO_HOST_PERMISSION: "016",
  POPUP_OPEN_FAILED: "017",
  VERSION_MISMATCH: "018",
} as const

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode]

export const ErrorCategory = {
  STORAGE: "STORAGE",
  NETWORK: "NETWORK",
  MEETING: "MEETING",
  PERMISSION: "PERMISSION",
  UI: "UI",
} as const

export type ErrorCategoryValue = typeof ErrorCategory[keyof typeof ErrorCategory]

export class ExtensionError extends Error {
  constructor(
    public readonly code: ErrorCodeValue | string,
    message: string,
    public readonly category: ErrorCategoryValue,
  ) {
    super(message)
    this.name = "ExtensionError"
    // Fix prototype chain for instanceof in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toErrorObject(): { errorCode: string; errorMessage: string } {
    return { errorCode: this.code, errorMessage: this.message }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit 2>&1 | grep -E "FAIL|PASS|✓|✗"
```

Expected: all tests pass including the new `errors.test.ts`.

- [ ] **Step 5: Update services to throw `ExtensionError` instead of plain objects**

In `src/services/meeting.ts`, replace:

```typescript
throw { errorCode: ErrorCode.NO_MEETINGS, errorMessage: "No meetings found. May be attend one?" }
```
with:
```typescript
throw new ExtensionError(ErrorCode.NO_MEETINGS, "No meetings found. May be attend one?", "MEETING")
```

And:
```typescript
throw { errorCode: ErrorCode.EMPTY_TRANSCRIPT, errorMessage: "Empty transcript and empty chatMessages" }
```
with:
```typescript
throw new ExtensionError(ErrorCode.EMPTY_TRANSCRIPT, "Empty transcript and empty chatMessages", "MEETING")
```

Add import:
```typescript
import { ExtensionError } from '../shared/errors'
```

- [ ] **Step 6: Update `src/background/download.ts`**

Replace:
```typescript
throw { errorCode: ErrorCode.MEETING_NOT_FOUND, errorMessage: "Meeting at specified index not found" }
```
with:
```typescript
throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")
```

Replace:
```typescript
reject({ errorCode: ErrorCode.BLOB_READ_FAILED, errorMessage: "Failed to read blob" })
```
with:
```typescript
reject(new ExtensionError(ErrorCode.BLOB_READ_FAILED, "Failed to read blob", "STORAGE"))
```

Add import:
```typescript
import { ExtensionError } from '../shared/errors'
```

- [ ] **Step 7: Update `src/background/webhook.ts`**

Replace all `throw { errorCode: ..., errorMessage: ... }` with `throw new ExtensionError(...)`:

```typescript
import { ExtensionError } from '../shared/errors'

// Replace:
throw { errorCode: ErrorCode.NO_WEBHOOK_URL, errorMessage: "No webhook URL configured" }
// With:
throw new ExtensionError(ErrorCode.NO_WEBHOOK_URL, "No webhook URL configured", "NETWORK")

// Replace:
throw { errorCode: ErrorCode.MEETING_NOT_FOUND, errorMessage: "Meeting at specified index not found" }
// With:
throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")

// Replace:
throw { errorCode: ErrorCode.NO_HOST_PERMISSION, errorMessage: "No host permission for webhook URL. Re-save the webhook URL to grant permission." }
// With:
throw new ExtensionError(ErrorCode.NO_HOST_PERMISSION, "No host permission for webhook URL. Re-save the webhook URL to grant permission.", "PERMISSION")

// Replace the catch:
.catch(error => { throw { errorCode: ErrorCode.WEBHOOK_REQUEST_FAILED, errorMessage: error } })
// With:
.catch((error: unknown) => { throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, String(error), "NETWORK") })

// Replace the !response.ok throw:
throw { errorCode: ErrorCode.WEBHOOK_REQUEST_FAILED, errorMessage: `HTTP ${response.status} ${response.statusText}` }
// With:
throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, `HTTP ${response.status} ${response.statusText}`, "NETWORK")
```

- [ ] **Step 8: Update `src/background/message-handler.ts` `err()` helper**

The `err` helper currently expects `ErrorObject`. Update it to handle both:

```typescript
import { ExtensionError } from '../shared/errors'

// Replace:
const err = (e: ErrorObject): ExtensionResponse => ({ success: false, error: e })

// With:
const err = (e: unknown): ExtensionResponse => {
  if (e instanceof ExtensionError) return { success: false, error: e.toErrorObject() }
  const obj = e as ErrorObject
  return { success: false, error: { errorCode: obj.errorCode ?? "000", errorMessage: obj.errorMessage ?? String(e) } }
}
```

- [ ] **Step 9: Typecheck**

```bash
npm run typecheck 2>&1 | grep "error TS"
```

Expected: zero errors.

- [ ] **Step 10: Run full test suite**

```bash
npm run test:unit && npm test 2>&1 | tail -5
```

Expected: unit tests pass, 43 E2E tests pass.

- [ ] **Step 11: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/shared/errors.ts src/shared/errors.test.ts src/services/meeting.ts src/background/download.ts src/background/webhook.ts src/background/message-handler.ts extension/background.js extension/platforms/google-meet.js
git commit -m "refactor(errors): introduce ExtensionError class with category, replace plain-object throws"
```

---

## Task 4: Browser Port (IBrowserStorage / IBrowserRuntime)

**Files:**
- Create: `src/browser/types.ts`
- Create: `src/browser/chrome.ts`
- Modify: `src/shared/storage-repo.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/content/state-sync.ts`
- Modify: `src/content/google-meet.ts` (wire concrete implementations)
- Modify: `src/background/message-handler.ts` (use IBrowserRuntime where possible — defer full wiring until Task 8)

- [ ] **Step 1: Create `src/browser/types.ts`**

```typescript
export interface IBrowserStorage {
  localGet(keys: string[]): Promise<Record<string, unknown>>
  localSet(data: Record<string, unknown>): Promise<void>
  syncGet(keys: string[]): Promise<Record<string, unknown>>
  syncSet(data: Record<string, unknown>): Promise<void>
}

export interface IBrowserRuntime {
  readonly id: string
  sendMessage(msg: unknown): Promise<unknown>
  onMessage(
    handler: (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void
  ): void
}
```

- [ ] **Step 2: Create `src/browser/chrome.ts`**

```typescript
import type { IBrowserStorage, IBrowserRuntime } from './types'

export const ChromeStorage: IBrowserStorage = {
  localGet: (keys) => chrome.storage.local.get(keys),
  localSet: (data) => chrome.storage.local.set(data),
  syncGet: (keys) => chrome.storage.sync.get(keys),
  syncSet: (data) => chrome.storage.sync.set(data),
}

export const ChromeRuntime: IBrowserRuntime = {
  get id() { return chrome.runtime.id },
  sendMessage: (msg) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (raw) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return }
        resolve(raw)
      })
    }),
  onMessage: (handler) => chrome.runtime.onMessage.addListener(handler),
}
```

- [ ] **Step 3: Update `src/shared/storage-repo.ts` to accept `IBrowserStorage`**

Replace all direct `chrome.storage.local.get` / `chrome.storage.sync.get` calls with the `IBrowserStorage` port. The public `StorageLocal` and `StorageSync` objects become factory functions:

```typescript
import type { Meeting, MeetingTabId, MeetingSoftware, TranscriptBlock, ChatMessage, OperationMode, WebhookBodyType } from '../types'
import type { IBrowserStorage } from '../browser/types'

export interface LocalState {
  meetingTabId: MeetingTabId
  software: MeetingSoftware
  title: string
  startTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  deferredUpdatePending: boolean
  meetings: Meeting[]
}

export interface SyncSettings {
  autoPostWebhookAfterMeeting: boolean
  autoDownloadFileAfterMeeting: boolean
  operationMode: OperationMode
  webhookBodyType: WebhookBodyType
  webhookUrl: string
}

function migrateTranscriptBlock(raw: Record<string, unknown>): TranscriptBlock {
  return {
    personName: raw.personName as string,
    timestamp: raw.timestamp as string,
    text: (raw.text ?? raw.transcriptText) as string ?? "",
  }
}

function migrateChatMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    personName: raw.personName as string,
    timestamp: raw.timestamp as string,
    text: (raw.text ?? raw.chatMessageText) as string ?? "",
  }
}

function migrateMeeting(raw: Record<string, unknown>): Meeting {
  return {
    software: (raw.software ?? raw.meetingSoftware) as MeetingSoftware,
    title: (raw.title ?? raw.meetingTitle) as string | undefined,
    startTimestamp: (raw.startTimestamp ?? raw.meetingStartTimestamp) as string,
    endTimestamp: (raw.endTimestamp ?? raw.meetingEndTimestamp) as string,
    transcript: ((raw.transcript ?? []) as Record<string, unknown>[]).map(migrateTranscriptBlock),
    chatMessages: ((raw.chatMessages ?? []) as Record<string, unknown>[]).map(migrateChatMessage),
    webhookPostStatus: (raw.webhookPostStatus ?? "new") as "new" | "failed" | "successful",
  }
}

export function createStorageLocal(storage: IBrowserStorage) {
  return {
    getMeetings: async (): Promise<Meeting[]> => {
      const raw = await storage.localGet(["meetings"])
      const meetings = (raw.meetings as Record<string, unknown>[] | undefined) ?? []
      return meetings.map(migrateMeeting)
    },

    setMeetings: (meetings: Meeting[]): Promise<void> =>
      storage.localSet({ meetings }),

    getMeetingTabId: async (): Promise<MeetingTabId> => {
      const raw = await storage.localGet(["meetingTabId"])
      return (raw.meetingTabId as MeetingTabId | undefined) ?? null
    },

    setMeetingTabId: (id: MeetingTabId): Promise<void> =>
      storage.localSet({ meetingTabId: id }),

    getCurrentMeetingData: async (): Promise<Partial<LocalState>> => {
      const raw = await storage.localGet([
        "software", "title", "startTimestamp", "transcript", "chatMessages",
        "meetingSoftware", "meetingTitle", "meetingStartTimestamp",
      ])
      return {
        software: (raw.software ?? raw.meetingSoftware) as MeetingSoftware | undefined,
        title: (raw.title ?? raw.meetingTitle) as string | undefined,
        startTimestamp: (raw.startTimestamp ?? raw.meetingStartTimestamp) as string | undefined,
        transcript: raw.transcript as TranscriptBlock[] | undefined,
        chatMessages: raw.chatMessages as ChatMessage[] | undefined,
      }
    },

    setCurrentMeetingData: (data: Partial<Pick<LocalState, "software" | "title" | "startTimestamp" | "transcript" | "chatMessages">>): Promise<void> =>
      storage.localSet(data as Record<string, unknown>),

    getDeferredUpdatePending: async (): Promise<boolean> => {
      const raw = await storage.localGet(["deferredUpdatePending"])
      return !!(raw.deferredUpdatePending as boolean | undefined)
    },

    setDeferredUpdatePending: (value: boolean): Promise<void> =>
      storage.localSet({ deferredUpdatePending: value }),
  }
}

export function createStorageSync(storage: IBrowserStorage) {
  return {
    getSettings: async (): Promise<Partial<SyncSettings>> => {
      const raw = await storage.syncGet([
        "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting",
        "operationMode", "webhookBodyType", "webhookUrl",
      ])
      return raw as Partial<SyncSettings>
    },

    setSettings: (settings: Partial<SyncSettings>): Promise<void> =>
      storage.syncSet(settings as Record<string, unknown>),

    getWebhookSettings: async (): Promise<{ webhookUrl?: string; webhookBodyType?: WebhookBodyType }> => {
      const raw = await storage.syncGet(["webhookUrl", "webhookBodyType"])
      return raw as { webhookUrl?: string; webhookBodyType?: WebhookBodyType }
    },

    getAutoActionSettings: async (): Promise<{ webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }> => {
      const raw = await storage.syncGet(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"])
      return raw as { webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }
    },
  }
}

// Backward-compatible singletons — wired to chrome at module level for existing callers.
// Replaced by injected instances in Task 8 (MeetingSession).
import { ChromeStorage } from '../browser/chrome'
export const StorageLocal = createStorageLocal(ChromeStorage)
export const StorageSync = createStorageSync(ChromeStorage)
```

- [ ] **Step 4: Update `src/shared/messages.ts` to accept `IBrowserRuntime`**

```typescript
import type { ExtensionMessage, ExtensionResponse } from '../types'
import type { IBrowserRuntime } from '../browser/types'
import { ChromeRuntime } from '../browser/chrome'

export function createMessenger(runtime: IBrowserRuntime) {
  return {
    sendMessage: (msg: ExtensionMessage): Promise<ExtensionResponse> =>
      runtime.sendMessage(msg).then((raw) => raw as ExtensionResponse),
  }
}

// Backward-compatible singleton for existing callers
const defaultMessenger = createMessenger(ChromeRuntime)

export function sendMessage(msg: ExtensionMessage): Promise<ExtensionResponse> {
  return defaultMessenger.sendMessage(msg)
}

export function recoverLastMeeting(): Promise<string> {
  return sendMessage({ type: "recover_last_meeting" }).then((response) => {
    if (response.success) return (response.data as string) ?? "Last meeting recovered"
    return Promise.reject(response.error)
  })
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck 2>&1 | grep "error TS"
```

Expected: zero errors.

- [ ] **Step 6: Build and test**

```bash
npm run build 2>&1 | tail -5 && npm run test:unit
```

Expected: builds cleanly, unit tests pass.

- [ ] **Step 7: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/browser/types.ts src/browser/chrome.ts src/shared/storage-repo.ts src/shared/messages.ts extension/background.js extension/platforms/google-meet.js
git commit -m "refactor(browser): introduce IBrowserStorage/IBrowserRuntime port, keep chrome singletons for backward compat"
```

---

## Task 5: Storage migration unit tests

**Files:**
- Create: `src/shared/storage-repo.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { makeChromeMock } from '../../tests/unit/chrome-mock'
import { createStorageLocal } from './storage-repo'

function makeStorageFromMock(overrides?: Record<string, unknown>) {
  const mock = makeChromeMock(overrides)
  // Wire IBrowserStorage using the mock's chrome.storage
  return {
    localGet: mock.storage.local.get,
    localSet: mock.storage.local.set,
    syncGet: mock.storage.sync.get,
    syncSet: mock.storage.sync.set,
  }
}

describe('migrateMeeting — legacy field names', () => {
  it('reads meetingTitle when title is absent', async () => {
    const storage = makeStorageFromMock({
      meetings: [{
        meetingSoftware: 'Google Meet', meetingTitle: 'Old Meeting',
        meetingStartTimestamp: '2024-01-01T08:00:00.000Z',
        meetingEndTimestamp: '2024-01-01T09:00:00.000Z',
        transcript: [], chatMessages: [], webhookPostStatus: 'new',
      }],
    })
    const repo = createStorageLocal(storage)
    const meetings = await repo.getMeetings()
    expect(meetings[0].title).toBe('Old Meeting')
    expect(meetings[0].software).toBe('Google Meet')
  })

  it('prefers new field names over legacy when both exist', async () => {
    const storage = makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', meetingSoftware: 'Stale',
        title: 'New Title', meetingTitle: 'Old Title',
        startTimestamp: '2024-02-01T08:00:00.000Z',
        meetingStartTimestamp: '2000-01-01T00:00:00.000Z',
        endTimestamp: '2024-02-01T09:00:00.000Z',
        meetingEndTimestamp: '2000-01-01T01:00:00.000Z',
        transcript: [], chatMessages: [], webhookPostStatus: 'new',
      }],
    })
    const repo = createStorageLocal(storage)
    const meetings = await repo.getMeetings()
    expect(meetings[0].title).toBe('New Title')
    expect(meetings[0].software).toBe('Google Meet')
  })
})

describe('migrateTranscriptBlock — legacy transcriptText field', () => {
  function makeMeetingWith(transcriptBlock: Record<string, unknown>) {
    return makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', title: 'T',
        startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
        transcript: [transcriptBlock], chatMessages: [], webhookPostStatus: 'new',
      }],
    })
  }

  it('reads transcriptText when text is absent', async () => {
    const repo = createStorageLocal(makeMeetingWith({ personName: 'Alice', timestamp: '2024-01-01T09:00:00.000Z', transcriptText: 'Legacy' }))
    const meetings = await repo.getMeetings()
    expect(meetings[0].transcript[0].text).toBe('Legacy')
  })

  it('falls back to empty string when neither field present', async () => {
    const repo = createStorageLocal(makeMeetingWith({ personName: 'Bob', timestamp: '2024-01-01T09:00:00.000Z' }))
    const meetings = await repo.getMeetings()
    expect(meetings[0].transcript[0].text).toBe('')
  })
})

describe('setMeetings / getMeetings round-trip', () => {
  it('stores and retrieves meetings correctly', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    const meeting = {
      software: 'Google Meet' as const, title: 'Test',
      startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
      transcript: [], chatMessages: [], webhookPostStatus: 'new' as const,
    }
    await repo.setMeetings([meeting])
    const result = await repo.getMeetings()
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test')
  })
})
```

- [ ] **Step 2: Run unit tests**

```bash
npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/shared/storage-repo.test.ts
git commit -m "test(storage): add unit tests for migration functions and round-trip storage"
```

---

## Task 6: Message Protocol Versioning

**Files:**
- Create: `src/shared/protocol.ts`
- Modify: `src/background/message-handler.ts`
- Modify: `src/content/state-sync.ts`

- [ ] **Step 1: Create `src/shared/protocol.ts`**

```typescript
import type { MeetingEndReason } from '../types'

export const PROTOCOL_VERSION = 1 as const
export const MIN_SUPPORTED_VERSION = 1 as const

type ProductionMessage =
  | { type: "new_meeting_started" }
  | { type: "meeting_ended"; reason: MeetingEndReason }
  | { type: "download_transcript_at_index"; index: number }
  | { type: "post_webhook_at_index"; index: number }
  | { type: "recover_last_meeting" }
  | { type: "open_popup" }
  | { type: "get_debug_state" }

type DevMessage =
  | { type: "simulate_tab_navigated_away"; tabId: number; url: string }

export type ExtensionMessage = (ProductionMessage | DevMessage) & { v: typeof PROTOCOL_VERSION }

export function msg<T extends ProductionMessage | DevMessage>(m: T): T & { v: typeof PROTOCOL_VERSION } {
  return { ...m, v: PROTOCOL_VERSION }
}
```

- [ ] **Step 2: Update `src/types.ts` — remove the old `ExtensionMessage` type and re-export**

In `src/types.ts`, replace the `ExtensionMessage` type definition:

```typescript
export type { ExtensionMessage } from './shared/protocol'
```

Remove the existing `ExtensionMessage` type union from `types.ts` (it is now in `protocol.ts`).

- [ ] **Step 3: Update `src/background/message-handler.ts` — add version gate**

At the top of the `onMessage` listener, after the sender ID check, add:

```typescript
import { MIN_SUPPORTED_VERSION, PROTOCOL_VERSION } from '../shared/protocol'
import { ErrorCode } from '../shared/errors'

// Inside the listener, after `if (sender.id !== chrome.runtime.id) return`:
const versionedMsg = raw as { v?: number; type?: string }
if (!versionedMsg.v || versionedMsg.v < MIN_SUPPORTED_VERSION) {
  sendResponse({
    success: false,
    error: { errorCode: ErrorCode.VERSION_MISMATCH, errorMessage: `Protocol version mismatch. Expected v${PROTOCOL_VERSION}, got v${versionedMsg.v ?? 0}. Please refresh the Meet tab.` },
  })
  return true
}
```

- [ ] **Step 4: Update `src/content/state-sync.ts` — wrap messages with `msg()`**

```typescript
import { msg } from '../shared/protocol'

// Replace:
chrome.runtime.sendMessage({ type: "meeting_ended", reason }).catch(() => {})
// With:
chrome.runtime.sendMessage(msg({ type: "meeting_ended", reason })).catch(() => {})

// Replace in persistStateAndSignalEnd:
const response = await sendMessage({ type: "meeting_ended", reason })
// With:
const response = await sendMessage(msg({ type: "meeting_ended", reason }))
```

- [ ] **Step 5: Update `src/content/meeting-session.ts` — wrap `new_meeting_started`**

```typescript
import { msg } from '../shared/protocol'

// Replace:
const message: ExtensionMessage = { type: "new_meeting_started" }
chrome.runtime.sendMessage(message, () => { })
// With:
chrome.runtime.sendMessage(msg({ type: "new_meeting_started" }), () => { })
```

- [ ] **Step 6: Typecheck and build**

```bash
npm run typecheck 2>&1 | grep "error TS" && npm run build 2>&1 | tail -5
```

Expected: zero errors, builds cleanly.

- [ ] **Step 7: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/shared/protocol.ts src/types.ts src/background/message-handler.ts src/content/state-sync.ts src/content/meeting-session.ts extension/background.js extension/platforms/google-meet.js
git commit -m "feat(protocol): add message versioning with v field, separate prod/dev message types, version gate in background"
```

---

## Task 7: Platform Adapter (IPlatformAdapter + GoogleMeetAdapter)

**Files:**
- Create: `src/platforms/types.ts`
- Create: `src/platforms/google-meet/adapter.ts`
- Modify: `src/content/observer/chat-observer.ts` (accept `root: Element` param)
- Modify: `src/content/observer/transcript-observer.ts` (named constant for -250 threshold)

- [ ] **Step 1: Create `src/platforms/types.ts`**

```typescript
import type { TranscriptBlock, ChatMessage } from '../types'

export interface TranscriptBlockDraft {
  personName: string
  text: string
}

export interface IPlatformAdapter {
  /** Human-readable name stored in Meeting.software */
  readonly name: string
  /** URL patterns for chrome.scripting.registerContentScripts */
  readonly urlMatches: string[]
  readonly urlExcludeMatches?: string[]
  /** CSS selector for the captions region element */
  readonly captionContainerSelector: string
  /** CSS selector for the current user's display name element */
  readonly userNameSelector: string

  waitForMeetingStart(): Promise<Element>
  waitForCaptionsReady(): Promise<Element>
  waitForChatContainer(): Promise<Element>
  enableCaptions(captionsElement: Element): void
  openAndCloseChat(chatElement: Element): void
  waitForTitleElement(): Promise<HTMLElement>

  /**
   * Parse a MutationRecord from the caption region.
   * Returns a draft if a complete caption block is ready, null otherwise.
   */
  parseTranscriptMutation(mutation: MutationRecord, currentUser: string): TranscriptBlockDraft | null

  /**
   * Parse the chat container for the latest unique message.
   * Receives the observed root element — must NOT call document.querySelector.
   */
  parseChatMutation(chatRoot: Element, currentUser: string): Omit<ChatMessage, 'timestamp'> | null
}
```

- [ ] **Step 2: Update `src/content/observer/transcript-observer.ts` — name the -250 constant**

Add at the top of the file, after imports:

```typescript
// Google Meet drops and restarts a speaker's transcript block after ~30 minutes.
// A sudden shrink beyond this threshold signals a restart, not normal editing.
const TRANSCRIPT_RESTART_THRESHOLD = -250
```

Replace inline:
```typescript
        if ((currentTranscriptText.length - state.transcriptTextBuffer.length) < -250) {
```
with:
```typescript
        if ((currentTranscriptText.length - state.transcriptTextBuffer.length) < TRANSCRIPT_RESTART_THRESHOLD) {
```

- [ ] **Step 3: Write transcript observer unit tests with the named constant**

Create `src/content/observer/transcript-observer.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../state', () => ({
  state: {
    userName: 'You',
    transcript: [] as import('../../types').TranscriptBlock[],
    personNameBuffer: '',
    transcriptTextBuffer: '',
    timestampBuffer: '',
    isTranscriptDomErrorCaptured: false,
    hasMeetingEnded: false,
  },
}))
vi.mock('../state-sync', () => ({ persistStateFields: vi.fn() }))
vi.mock('../ui', () => ({ handleContentError: vi.fn() }))

import { state } from '../state'
import { transcriptMutationCallback } from './transcript-observer'

function makeMutation(personName: string, text: string): MutationRecord {
  // Build minimal DOM matching transcript-observer's expected structure:
  // container > blockEl (at index 0 of 3) > [personEl, transcriptEl > textNode]
  const textNode = document.createTextNode(text)
  const personEl = document.createElement('div')
  personEl.textContent = personName
  const transcriptEl = document.createElement('div')
  transcriptEl.appendChild(textNode)
  const blockEl = document.createElement('div')
  blockEl.appendChild(personEl)
  blockEl.appendChild(transcriptEl)
  const container = document.createElement('div')
  container.appendChild(blockEl)
  container.appendChild(document.createElement('div'))
  container.appendChild(document.createElement('div'))

  return {
    type: 'characterData',
    target: textNode,
    addedNodes: [] as unknown as NodeList,
    removedNodes: [] as unknown as NodeList,
    attributeName: null, attributeNamespace: null,
    nextSibling: null, oldValue: null, previousSibling: null,
  } as MutationRecord
}

describe('transcriptMutationCallback — buffer accumulation', () => {
  beforeEach(() => {
    state.transcript = []
    state.personNameBuffer = ''
    state.transcriptTextBuffer = ''
    state.timestampBuffer = ''
  })

  it('initialises buffer on first mutation', () => {
    transcriptMutationCallback([makeMutation('Alice', 'Hello')])
    expect(state.personNameBuffer).toBe('Alice')
    expect(state.transcriptTextBuffer).toBe('Hello')
  })

  it('flushes buffer and starts new block when speaker changes', () => {
    transcriptMutationCallback([makeMutation('Alice', 'Good morning')])
    transcriptMutationCallback([makeMutation('Bob', 'Hey there')])
    expect(state.transcript).toHaveLength(1)
    expect(state.transcript[0].personName).toBe('Alice')
    expect(state.personNameBuffer).toBe('Bob')
  })

  it('does not flush when same speaker keeps talking', () => {
    transcriptMutationCallback([makeMutation('Alice', 'Short text')])
    transcriptMutationCallback([makeMutation('Alice', 'Short text, extended')])
    expect(state.transcript).toHaveLength(0)
    expect(state.transcriptTextBuffer).toBe('Short text, extended')
  })
})

describe('transcriptMutationCallback — 30-min restart threshold', () => {
  beforeEach(() => {
    state.transcript = []
    state.personNameBuffer = ''
    state.transcriptTextBuffer = ''
    state.timestampBuffer = ''
  })

  it('flushes when text shrinks by more than 250 chars', () => {
    const longText = 'A'.repeat(400)
    const restartedText = 'B'.repeat(50) // diff = 50 - 400 = -350 < -250
    transcriptMutationCallback([makeMutation('Alice', longText)])
    transcriptMutationCallback([makeMutation('Alice', restartedText)])
    expect(state.transcript).toHaveLength(1)
    expect(state.transcript[0].text).toBe(longText)
    expect(state.transcriptTextBuffer).toBe(restartedText)
  })

  it('does NOT flush when shrink is exactly -250 (threshold is strictly <)', () => {
    const longText = 'A'.repeat(400)
    const shrunkText = 'A'.repeat(150) // diff = 150 - 400 = -250, NOT < -250
    transcriptMutationCallback([makeMutation('Alice', longText)])
    transcriptMutationCallback([makeMutation('Alice', shrunkText)])
    expect(state.transcript).toHaveLength(0)
    expect(state.transcriptTextBuffer).toBe(shrunkText)
  })

  it('flushes when shrink is -251 (one over the boundary)', () => {
    const longText = 'A'.repeat(400)
    const shrunkText = 'A'.repeat(149) // diff = 149 - 400 = -251 < -250
    transcriptMutationCallback([makeMutation('Alice', longText)])
    transcriptMutationCallback([makeMutation('Alice', shrunkText)])
    expect(state.transcript).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit
```

Expected: all tests including the new threshold tests pass.

- [ ] **Step 5: Refactor `src/content/observer/chat-observer.ts` — accept `root: Element`**

The current implementation calls `document.querySelector(...)` which makes it impossible to observe a PiP window or any non-main-document root. Refactor to accept a `root: Element` parameter from the mutation callback's target:

```typescript
import type { ChatMessage } from '../../types'
import { state } from '../state'
import { log } from '../../shared/logger'
import { handleContentError } from '../ui'
import { persistStateFields } from '../state-sync'

export function pushUniqueChatBlock(chatBlock: ChatMessage): void {
  const isExisting = state.chatMessages.some(item =>
    item.personName === chatBlock.personName && item.text === chatBlock.text
  )
  if (!isExisting) {
    log.debug("Chat message captured")
    state.chatMessages.push(chatBlock)
    persistStateFields(["chatMessages"])
  }
}

// DOM: div[aria-live="polite"].Ge9Kpc  (Google Meet chat panel, verified 2025-04)
// <div jsname="xySENc" aria-live="polite" class="Ge9Kpc z38b6">
//   <div class="Ss4fHf" jsname="Ypafjf">          ← one message wrapper per message
//     <div class="QTyiie">                         ← sender + timestamp row
//       <div class="poVWob">You</div>              ← personName (absent = self)
//     </div>
//     <div class="beTDc">
//       <div class="er6Kjc">
//         <div class="ptNLrf"><div jsname="dTKtvb">
//           <div jscontroller="RrV5Ic">Hello</div>
//         </div></div>
//       </div>
//     </div>
//   </div>
// </div>
// TODO(dom): re-verify selectors after Meet UI update [2025-04]
function parseChatFromRoot(chatRoot: Element, currentUser: string): ChatMessage | null {
  if (chatRoot.children.length === 0) return null
  const chatMessageElement = chatRoot.lastChild?.firstChild?.firstChild?.lastChild as Element | null
  const personAndTimestampElement = chatMessageElement?.firstChild as Element | null
  const personName = personAndTimestampElement?.childNodes.length === 1
    ? currentUser
    : personAndTimestampElement?.firstChild?.textContent ?? null
  const chatMessageText = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild as Element | null)?.textContent ?? null
  if (!personName || !chatMessageText) return null
  return { personName, timestamp: new Date().toISOString(), text: chatMessageText }
}

export function chatMessagesMutationCallback(_mutationsList: MutationRecord[]): void {
  try {
    // DOM: div[aria-live="polite"].Ge9Kpc — the observer is attached to this element
    // Use the observed element's ownerDocument to find the chat root, not window.document,
    // so this callback works in both main-tab and PiP contexts.
    const anyTarget = _mutationsList[0]?.target
    const doc = anyTarget ? (anyTarget as Node).ownerDocument ?? document : document
    const chatRoot = doc.querySelector(`div[aria-live="polite"].Ge9Kpc`)
    if (!chatRoot) return

    const parsed = parseChatFromRoot(chatRoot, state.userName)
    if (parsed) pushUniqueChatBlock(parsed)
  } catch (err) {
    if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) {
      handleContentError("006", err)
    }
    state.isChatMessagesDomErrorCaptured = true
  }
}
```

- [ ] **Step 6: Create `src/platforms/google-meet/adapter.ts`**

```typescript
import type { IPlatformAdapter, TranscriptBlockDraft } from '../types'
import type { ChatMessage } from '../../types'
import { waitForElement, selectElements } from '../../content/ui'

// DOM: div[role="region"][tabindex="0"]  (Google Meet caption container, verified 2025-04)
// <div role="region" tabindex="0" aria-label="Captions" class="vNKgIf UDinHf" ...>
//   <div class="nMcdL bj4p3b">
//     <div class="adE6rb">
//       <div class="KcIKyf jxFHg"><span class="NWpY1d">Speaker Name</span></div>
//     </div>
//     <div class="ygicle VbkSUe">Caption text here.</div>
//   </div>
// </div>
// TODO(dom): re-verify selectors after Meet UI update [2025-04]

// Google Meet UI profile post July/Aug 2024
const MEETING_END_SELECTOR = ".google-symbols"
const MEETING_END_TEXT = "call_end"
const CAPTIONS_SELECTOR = ".google-symbols"
const CAPTIONS_TEXT = "closed_caption_off"
const CAPTION_CONTAINER_SELECTOR = 'div[role="region"][tabindex="0"]'
const USERNAME_SELECTOR = ".awLEm"
const TITLE_SELECTOR = ".u6vdEc"
const CHAT_SELECTOR = ".google-symbols"
const CHAT_TEXT = "chat"
const CHAT_LIVE_REGION = `div[aria-live="polite"].Ge9Kpc`

export const GoogleMeetAdapter: IPlatformAdapter = {
  name: "Google Meet",
  urlMatches: ["https://meet.google.com/*"],
  urlExcludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"],
  captionContainerSelector: CAPTION_CONTAINER_SELECTOR,
  userNameSelector: USERNAME_SELECTOR,

  waitForMeetingStart: () => waitForElement(MEETING_END_SELECTOR, MEETING_END_TEXT),

  waitForCaptionsReady: () => waitForElement(CAPTIONS_SELECTOR, CAPTIONS_TEXT),

  waitForChatContainer: () =>
    waitForElement(CHAT_SELECTOR, CHAT_TEXT).then(() => {
      const chatBtn = selectElements(CHAT_SELECTOR, CHAT_TEXT)[0] as HTMLElement
      chatBtn?.click()
      return waitForElement(CHAT_LIVE_REGION)
    }),

  enableCaptions: (captionsElement) => {
    (captionsElement as HTMLElement).click()
  },

  openAndCloseChat: (chatElement) => {
    (chatElement as HTMLElement).click()
  },

  waitForTitleElement: () =>
    waitForElement(TITLE_SELECTOR).then((el) => el as HTMLElement),

  parseTranscriptMutation(mutation, _currentUser): TranscriptBlockDraft | null {
    if (mutation.type !== "characterData") return null
    const mutationTargetElement = (mutation.target as Text).parentElement
    const transcriptUIBlocks = [...(mutationTargetElement?.parentElement?.parentElement?.children ?? [])]
    const isLastButSecondElement = transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement
    if (!isLastButSecondElement) return null

    const currentPersonName = (mutationTargetElement?.previousSibling as Element | null)?.textContent
    const currentTranscriptText = mutationTargetElement?.textContent
    if (!currentPersonName || !currentTranscriptText) return null

    // Dim the captured block
    Array.from(transcriptUIBlocks[transcriptUIBlocks.length - 3]?.children ?? []).forEach((item) => {
      item.setAttribute("style", "opacity:0.2")
    })

    return { personName: currentPersonName, text: currentTranscriptText }
  },

  parseChatMutation(chatRoot, currentUser): Omit<ChatMessage, 'timestamp'> | null {
    if (chatRoot.children.length === 0) return null
    const chatMessageElement = chatRoot.lastChild?.firstChild?.firstChild?.lastChild as Element | null
    const personAndTimestampElement = chatMessageElement?.firstChild as Element | null
    const personName = personAndTimestampElement?.childNodes.length === 1
      ? currentUser
      : personAndTimestampElement?.firstChild?.textContent ?? null
    const text = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild as Element | null)?.textContent ?? null
    if (!personName || !text) return null
    return { personName, text }
  },
}
```

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck 2>&1 | grep "error TS"
```

Expected: zero errors.

- [ ] **Step 8: Build and test**

```bash
npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -5
```

Expected: builds cleanly, 43 E2E tests pass.

- [ ] **Step 9: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/platforms/types.ts src/platforms/google-meet/adapter.ts src/content/observer/chat-observer.ts src/content/observer/transcript-observer.ts src/content/observer/transcript-observer.test.ts extension/background.js extension/platforms/google-meet.js
git commit -m "refactor(platform): introduce IPlatformAdapter, extract GoogleMeetAdapter, name -250 threshold constant, fix chat-observer doc coupling"
```

---

## Task 8: Session Lifecycle (MeetingSession + ObserverManager)

**Files:**
- Create: `src/content/core/observer-manager.ts`
- Create: `src/content/core/meeting-session.ts`
- Create: `src/platforms/google-meet/index.ts` (new entry point)
- Modify: `vite.config.ts`
- Modify: `src/background/content-script.ts`
- Delete: `src/content/google-meet.ts` (after new entry point is wired)
- Delete: `src/content/meeting-session.ts` (after MeetingSession class is wired)

- [ ] **Step 1: Create `src/content/core/observer-manager.ts`**

```typescript
import type { AppState } from '../../types'
import { mutationConfig } from '../constants'
import { transcriptMutationCallback, insertGapMarker } from '../observer/transcript-observer'
import { chatMessagesMutationCallback } from '../observer/chat-observer'
import { log } from '../../shared/logger'

export class ObserverManager {
  private transcriptObserver: MutationObserver | undefined
  private chatObserver: MutationObserver | undefined
  private captionWatchdog: MutationObserver | undefined
  private isReattaching = false

  constructor(private state: AppState, private captionContainerSelector: string) {}

  attachTranscript(node: Element): void {
    this.transcriptObserver = new MutationObserver(transcriptMutationCallback)
    this.transcriptObserver.observe(node, mutationConfig)
    this.state.transcriptTargetBuffer = node
  }

  attachChat(node: Element): void {
    this.chatObserver = new MutationObserver(chatMessagesMutationCallback)
    this.chatObserver.observe(node, mutationConfig)
  }

  attachWatchdog(): void {
    this.captionWatchdog = new MutationObserver(() => {
      if (this.state.hasMeetingEnded || this.isReattaching) return
      if (this.state.transcriptTargetBuffer && !this.state.transcriptTargetBuffer.isConnected) {
        const captionEl = document.querySelector(this.captionContainerSelector)
        if (!captionEl) return
        this.isReattaching = true
        this.transcriptObserver?.disconnect()
        this.attachTranscript(captionEl)
        insertGapMarker()
        this.isReattaching = false
      }
    })
    this.captionWatchdog.observe(document.body, { childList: true, subtree: true })
  }

  reattachTranscriptIfDisconnected(): void {
    if (this.state.hasMeetingEnded || !this.state.hasMeetingStarted) return
    if (document.hidden) return
    if (this.state.transcriptTargetBuffer?.isConnected || this.isReattaching) return
    const captionEl = document.querySelector(this.captionContainerSelector)
    if (!captionEl) return
    this.isReattaching = true
    this.transcriptObserver?.disconnect()
    this.attachTranscript(captionEl)
    insertGapMarker()
    this.isReattaching = false
  }

  detach(): void {
    log.info("Detaching all observers")
    this.transcriptObserver?.disconnect()
    this.chatObserver?.disconnect()
    this.captionWatchdog?.disconnect()
  }
}
```

- [ ] **Step 2: Create `src/content/core/meeting-session.ts`**

```typescript
import type { AppState, MeetingEndReason } from '../../types'
import type { IPlatformAdapter } from '../../platforms/types'
import type { IBrowserStorage } from '../../browser/types'
import { log } from '../../shared/logger'
import { showNotification, handleContentError, waitForElement } from '../ui'
import { persistStateFields, persistStateAndSignalEnd } from '../state-sync'
import { pushBufferToTranscript } from '../observer/transcript-observer'
import { detachPipObserver } from '../pip-capture'
import { ObserverManager } from './observer-manager'
import { msg } from '../../shared/protocol'

export class MeetingSession {
  private observerManager: ObserverManager
  private handlePageHide: () => void
  private handleVisibilityChange: () => void

  constructor(
    private adapter: IPlatformAdapter,
    private state: AppState,
    private _storage: IBrowserStorage,
  ) {
    this.observerManager = new ObserverManager(state, adapter.captionContainerSelector)
    this.handlePageHide = () => this.end("page_unload")
    this.handleVisibilityChange = () => this.observerManager.reattachTranscriptIfDisconnected()
  }

  async start(): Promise<void> {
    await this.adapter.waitForMeetingStart()
    log.info("Meeting started")

    chrome.runtime.sendMessage(msg({ type: "new_meeting_started" }), () => {})
    this.state.hasMeetingStarted = true
    this.state.startTimestamp = new Date().toISOString()
    persistStateFields(["startTimestamp"])

    this.captureTitle()

    document.addEventListener("visibilitychange", this.handleVisibilityChange)
    window.addEventListener("pagehide", this.handlePageHide)
    this.wireEndButton()

    await Promise.allSettled([
      this.setupTranscript(),
      this.setupChat(),
    ])
  }

  private captureTitle(): void {
    this.adapter.waitForTitleElement().then((titleEl) => {
      titleEl.setAttribute("contenteditable", "true")
      titleEl.title = "Edit meeting title for meet-transcripts"
      titleEl.style.cssText = "text-decoration: underline white; text-underline-offset: 4px;"

      const onInput = (): void => {
        this.state.title = titleEl.innerText
        persistStateFields(["title"])
      }
      titleEl.addEventListener("input", onInput)

      setTimeout(() => {
        onInput()
        if (location.pathname === `/${titleEl.innerText}`) {
          showNotification({ status: 200, message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner" })
        }
      }, 7000)
    })
  }

  private async setupTranscript(): Promise<void> {
    try {
      const captionsReady = await this.adapter.waitForCaptionsReady()
      chrome.storage.sync.get(["operationMode"], (result: { operationMode?: string }) => {
        if (result.operationMode === "manual") {
          log.info("Manual mode — leaving captions off")
        } else {
          this.adapter.enableCaptions(captionsReady)
        }
      })
      const captionNode = await waitForElement(this.adapter.captionContainerSelector)
      if (!captionNode) throw new Error("Caption container not found in DOM")
      this.observerManager.attachTranscript(captionNode)
      this.observerManager.attachWatchdog()

      chrome.storage.sync.get(["operationMode"], (result: { operationMode?: string }) => {
        if (result.operationMode === "manual") {
          showNotification({ status: 400, message: "<strong>meet-transcripts is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
        } else {
          showNotification(this.state.extensionStatusJSON)
        }
      })
    } catch (err) {
      this.state.isTranscriptDomErrorCaptured = true
      handleContentError("001", err)
    }
  }

  private async setupChat(): Promise<void> {
    try {
      const chatContainer = await this.adapter.waitForChatContainer()
      this.adapter.openAndCloseChat(chatContainer)
      const chatLiveRegion = await waitForElement(`div[aria-live="polite"].Ge9Kpc`)
      if (!chatLiveRegion) throw new Error("Chat live region not found")
      this.observerManager.attachChat(chatLiveRegion)
    } catch (err) {
      this.state.isChatMessagesDomErrorCaptured = true
      handleContentError("003", err)
    }
  }

  private wireEndButton(): void {
    try {
      const endButton = document.querySelector(`.google-symbols`)
      const endButtonEl = Array.from(document.querySelectorAll(".google-symbols"))
        .find(el => el.textContent === "call_end")
      const clickTarget = endButtonEl?.parentElement?.parentElement
      if (!clickTarget) throw new Error("Call end button not found in DOM")
      clickTarget.addEventListener("click", () => this.end("user_click"))
    } catch (err) {
      handleContentError("004", err)
    }
  }

  end(reason: MeetingEndReason): void {
    if (this.state.hasMeetingEnded) return
    this.state.hasMeetingEnded = true

    this.observerManager.detach()
    detachPipObserver()
    document.removeEventListener("visibilitychange", this.handleVisibilityChange)
    window.removeEventListener("pagehide", this.handlePageHide)

    if (this.state.personNameBuffer !== "" && this.state.transcriptTextBuffer !== "") {
      pushBufferToTranscript()
    }
    persistStateAndSignalEnd(["transcript", "chatMessages"], reason).catch(console.error)
  }
}
```

- [ ] **Step 3: Create `src/platforms/google-meet/index.ts`**

```typescript
import type { ErrorObject } from '../../types'
import { ErrorCode } from '../../shared/errors'
import { state } from '../../content/state'
import { waitForElement, showNotification } from '../../content/ui'
import { persistStateFields } from '../../content/state-sync'
import { recoverLastMeeting } from '../../shared/messages'
import { checkExtensionStatus } from '../../content/meeting-session'
import { initializePipCapture } from '../../content/pip-capture'
import { MeetingSession } from '../../content/core/meeting-session'
import { GoogleMeetAdapter } from './adapter'
import { ChromeStorage } from '../../browser/chrome'

Promise.race([
  recoverLastMeeting(),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject({ errorCode: ErrorCode.NO_HOST_PERMISSION, errorMessage: "Recovery timed out" }), 2000)
  )
])
  .catch((error: unknown) => {
    const parsedError = error as ErrorObject
    if (parsedError.errorCode !== ErrorCode.NO_MEETINGS && parsedError.errorCode !== ErrorCode.EMPTY_TRANSCRIPT) {
      console.error(parsedError.errorMessage)
    }
  })
  .finally(() => {
    persistStateFields(["software", "startTimestamp", "title", "transcript", "chatMessages"])
  })

checkExtensionStatus().finally(() => {
  if (state.extensionStatusJSON?.status === 200) {
    // Capture username before meeting starts
    waitForElement(".awLEm").then(() => {
      const captureInterval = setInterval(() => {
        if (!state.hasMeetingStarted) {
          const name = document.querySelector(".awLEm")?.textContent
          if (name) { state.userName = name; clearInterval(captureInterval) }
        } else {
          clearInterval(captureInterval)
        }
      }, 100)
    })

    const session = new MeetingSession(GoogleMeetAdapter, state, ChromeStorage)
    session.start()
    initializePipCapture()
  } else {
    showNotification(state.extensionStatusJSON)
  }
})
```

> **Note:** `checkExtensionStatus` currently lives in `src/content/meeting-session.ts`. When that file is deleted, move `checkExtensionStatus` into `src/content/ui.ts` or a small `src/content/extension-status.ts` file.

- [ ] **Step 4: Update `vite.config.ts` — point entry to the new file**

Change:
```typescript
entry: 'src/content/google-meet.ts',
```
to:
```typescript
entry: 'src/platforms/google-meet/index.ts',
```

The `entryFileNames: 'google-meet.js'` stays the same — the manifest and `PLATFORM_CONFIGS` reference the output filename, not the source path.

- [ ] **Step 5: Build to verify the new entry point compiles**

```bash
npm run build 2>&1 | tail -10
```

Expected: zero errors, `extension/platforms/google-meet.js` produced.

- [ ] **Step 6: Delete the old files**

```bash
git rm src/content/google-meet.ts
git rm src/content/meeting-session.ts
```

If `checkExtensionStatus` or `updateMeetingTitle` were used elsewhere, verify with:

```bash
grep -r "checkExtensionStatus\|updateMeetingTitle\|meetingRoutines" /Users/nqhuy25/Development/sandbox/meet-transcripts/src/
```

Expected: no remaining references.

- [ ] **Step 7: Typecheck, build, and run full test suite**

```bash
npm run typecheck && npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -5
```

Expected: zero type errors, builds cleanly, 43 E2E tests pass.

- [ ] **Step 8: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/content/core/observer-manager.ts src/content/core/meeting-session.ts src/platforms/google-meet/index.ts vite.config.ts extension/background.js extension/platforms/google-meet.js
git commit -m "refactor(content): replace meetingRoutines() with MeetingSession + ObserverManager, move entry point to platforms/"
```

---

## Task 9: State Scoping (createSessionState)

**Files:**
- Modify: `src/content/state.ts`
- Modify: `src/content/core/meeting-session.ts`
- Modify: `src/platforms/google-meet/index.ts`

- [ ] **Step 1: Add `createSessionState` and `resetState` to `src/content/state.ts`**

```typescript
import type { AppState } from '../types'

export function createSessionState(): AppState {
  return {
    userName: "You",
    transcript: [],
    transcriptTargetBuffer: null,
    personNameBuffer: "",
    transcriptTextBuffer: "",
    timestampBuffer: "",
    chatMessages: [],
    startTimestamp: new Date().toISOString(),
    title: document.title,
    isTranscriptDomErrorCaptured: false,
    isChatMessagesDomErrorCaptured: false,
    hasMeetingStarted: false,
    hasMeetingEnded: false,
    pipObserverAttached: false,
    extensionStatusJSON: null,
  }
}

// Backward-compatible singleton — replaced by createSessionState() in the entry point.
// Modules that still import `state` directly will continue to work until each is
// migrated to receive state as a parameter.
export const state: AppState = createSessionState()
```

- [ ] **Step 2: Update `src/platforms/google-meet/index.ts` to use `createSessionState()`**

Replace:
```typescript
import { state } from '../../content/state'
```
with:
```typescript
import { createSessionState } from '../../content/state'
const state = createSessionState()
```

Ensure all objects that receive `state` (MeetingSession, persistStateFields, etc.) receive the locally-created instance rather than the module singleton.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1 | grep "error TS"
```

Expected: zero errors.

- [ ] **Step 4: Build and test**

```bash
npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -5
```

Expected: builds cleanly, 43 E2E tests pass.

- [ ] **Step 5: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/content/state.ts src/platforms/google-meet/index.ts extension/platforms/google-meet.js
git commit -m "refactor(state): add createSessionState() factory, entry point owns the instance instead of using global singleton"
```

---

## Task 10: Services Consolidation

**Files:**
- Modify: `src/services/download.ts` (absorb `background/download.ts`)
- Modify: `src/services/webhook.ts` (absorb `background/webhook.ts`)
- Modify: `src/background/message-handler.ts` (import from `services/` only)
- Delete: `src/background/download.ts`
- Delete: `src/background/webhook.ts`

- [ ] **Step 1: Absorb `background/download.ts` into `src/services/download.ts`**

Replace the entire file with:

```typescript
import type { Meeting } from '../types'
import { ErrorCode } from '../shared/errors'
import { ExtensionError } from '../shared/errors'
import { StorageLocal } from '../shared/storage-repo'
import { getTranscriptString, getChatMessagesString, buildTranscriptFilename } from '../shared/formatters'

export const DownloadService = {
  downloadTranscript: async (index: number): Promise<void> => {
    const meetings = await StorageLocal.getMeetings()
    if (!meetings[index]) {
      throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")
    }
    const meeting = meetings[index]
    const fileName = buildTranscriptFilename(meeting)
    let content = getTranscriptString(meeting.transcript)
    content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
    content += getChatMessagesString(meeting.chatMessages)
    content += "\n\n---------------\n"
    content += "Transcript saved using meet-transcripts (https://github.com/patrick204nqh/meet-transcripts)"
    content += "\n---------------"

    await new Promise<void>((resolve, reject) => {
      const blob = new Blob([content], { type: "text/plain" })
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onload = (event) => {
        if (!event.target?.result) {
          reject(new ExtensionError(ErrorCode.BLOB_READ_FAILED, "Failed to read blob", "STORAGE"))
          return
        }
        const dataUrl = event.target.result as string
        chrome.downloads.download({ url: dataUrl, filename: fileName, conflictAction: "uniquify" })
          .then(() => resolve())
          .catch(() => {
            chrome.downloads.download({ url: dataUrl, filename: "meet-transcripts/Transcript.txt", conflictAction: "uniquify" })
            resolve()
          })
      }
    })
  },

  formatTranscript: (meeting: Meeting): string => getTranscriptString(meeting.transcript),

  formatChatMessages: (meeting: Meeting): string => getChatMessagesString(meeting.chatMessages),

  getMeeting: async (index: number): Promise<Meeting> => {
    const meetings = await StorageLocal.getMeetings()
    const meeting = meetings[index]
    if (!meeting) throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")
    return meeting
  },
}
```

- [ ] **Step 2: Absorb `background/webhook.ts` into `src/services/webhook.ts`**

Replace the entire file with the contents of `background/webhook.ts` (which has the real logic), wrapped in the `WebhookService` object:

```typescript
import type { Meeting } from '../types'
import { ErrorCode } from '../shared/errors'
import { ExtensionError } from '../shared/errors'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { buildWebhookBody } from '../shared/formatters'

const notificationClickTargets = new Set<string>()

function registerNotificationClickListener(): void {
  if (!chrome.notifications?.onClicked) return
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationClickTargets.has(notificationId)) {
      notificationClickTargets.delete(notificationId)
      chrome.tabs.create({ url: "meetings.html" })
    }
  })
}

chrome.permissions.contains({ permissions: ["notifications"] }, (has) => {
  if (has) registerNotificationClickListener()
})

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.permissions?.includes("notifications")) registerNotificationClickListener()
})

export const WebhookService = {
  postWebhook: async (index: number): Promise<string> => {
    const [meetings, { webhookUrl, webhookBodyType }] = await Promise.all([
      StorageLocal.getMeetings(),
      StorageSync.getWebhookSettings(),
    ])

    if (!webhookUrl) throw new ExtensionError(ErrorCode.NO_WEBHOOK_URL, "No webhook URL configured", "NETWORK")
    if (!meetings[index]) throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")

    const urlObj = new URL(webhookUrl)
    const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`
    const hasPermission = await new Promise<boolean>(res => chrome.permissions.contains({ origins: [originPattern] }, res))
    if (!hasPermission) throw new ExtensionError(ErrorCode.NO_HOST_PERMISSION, "No host permission for webhook URL. Re-save the webhook URL to grant permission.", "PERMISSION")

    const meeting: Meeting = meetings[index]
    const bodyType = webhookBodyType === "advanced" ? "advanced" : "simple"
    const webhookData = buildWebhookBody(meeting, bodyType)

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookData),
    }).catch((error: unknown) => { throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, String(error), "NETWORK") })

    if (!response.ok) {
      const withFailed = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "failed" as const } : m)
      await StorageLocal.setMeetings(withFailed)
      chrome.notifications?.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Could not post webhook!",
        message: `HTTP ${response.status} ${response.statusText}. Click to view and retry.`,
      }, (notificationId) => {
        notificationClickTargets.add(notificationId)
      })
      throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, `HTTP ${response.status} ${response.statusText}`, "NETWORK")
    }

    const withSuccess = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "successful" as const } : m)
    await StorageLocal.setMeetings(withSuccess)
    return "Webhook posted successfully"
  },
}
```

- [ ] **Step 3: Update `src/background/message-handler.ts` — remove imports from background/**

Remove:
```typescript
// (any imports of postTranscriptToWebhook or downloadTranscript from background/)
```

The message handler already imports from `services/` — verify no references to `'../background/download'` or `'../background/webhook'` remain:

```bash
grep -n "background/download\|background/webhook" /Users/nqhuy25/Development/sandbox/meet-transcripts/src/background/message-handler.ts
```

Expected: no matches (it should already import from `services/`).

- [ ] **Step 4: Delete the background layer files**

```bash
git rm src/background/download.ts src/background/webhook.ts
```

- [ ] **Step 5: Typecheck, build, full test suite**

```bash
npm run typecheck && npm run build 2>&1 | tail -5 && npm test 2>&1 | tail -5
```

Expected: zero errors, 43 E2E tests pass.

- [ ] **Step 6: Build and commit (include rebuilt artifacts)**

```bash
npm run build 2>&1 | tail -5
git add src/services/download.ts src/services/webhook.ts src/background/message-handler.ts extension/background.js extension/platforms/google-meet.js
git commit -m "refactor(services): consolidate thin background wrappers — download and webhook logic now lives in services/ only"
```

---

## Self-review checklist

**Spec coverage:**
- [x] Browser API abstraction (IBrowserStorage, IBrowserRuntime) → Tasks 4, 5
- [x] Platform adapter interface (IPlatformAdapter) → Task 7
- [x] Google Meet adapter with all DOM selectors → Task 7
- [x] Session lifecycle refactor (MeetingSession, ObserverManager) → Task 8
- [x] State scoping (createSessionState) → Task 9
- [x] Services consolidation → Task 10
- [x] Leveled logger → Task 2
- [x] ExtensionError class with categories → Task 3
- [x] Message protocol versioning → Task 6
- [x] Unit test infrastructure (Vitest + chrome mock) → Task 1
- [x] Storage migration unit tests → Task 5
- [x] Transcript observer -250 threshold unit tests → Task 7
- [x] vite.config.ts entry point updated → Task 8
- [x] Old files deleted (google-meet.ts, meeting-session.ts, background/download.ts, background/webhook.ts) → Tasks 8, 10

**Type consistency check:**
- `ObserverManager` constructor takes `(state: AppState, captionContainerSelector: string)` — used this way in `MeetingSession` (Task 8) ✓
- `MeetingSession` constructor takes `(adapter: IPlatformAdapter, state: AppState, storage: IBrowserStorage)` — wired in `index.ts` (Task 8) ✓
- `createStorageLocal(storage: IBrowserStorage)` returns the same shape as old `StorageLocal` — backward-compatible ✓
- `ExtensionError.toErrorObject()` returns `{ errorCode, errorMessage }` matching `ErrorObject` type — `err()` helper in message-handler updated to call it ✓
- `IPlatformAdapter.parseTranscriptMutation` returns `TranscriptBlockDraft | null` — used in `GoogleMeetAdapter` (Task 7) ✓
- `TRANSCRIPT_RESTART_THRESHOLD = -250` named in transcript-observer — test compares against this behavior boundary ✓

**Placeholders scan:** None found.
