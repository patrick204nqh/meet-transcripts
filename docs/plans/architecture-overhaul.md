# Plan: Architecture Overhaul

## Motivation

The architecture review (see conversation context) identified 9 concrete pain points across
`background.js`, the message protocol, and the storage layer. The content script module split
(PR #2) is the right foundation. This plan extends the same discipline to the entire codebase
in five sequential PRs.

---

## Current pain points summary

| # | Problem | File |
|---|---------|------|
| 1 | Monolith — 679 lines, 7 mixed concerns | `background.js` |
| 2 | 3-level callback pyramid in `processLastMeeting` | `background.js` |
| 3 | `chrome.notifications.onClicked` listener leak on every failed webhook | `background.js` |
| 4 | `chrome.storage` used as message bus AND persistent store — no transaction boundary | both |
| 5 | Stringly-typed message protocol — wrong string = silent no-op | both |
| 6 | Error codes as magic strings (`"009"`, `"014"`) | both |
| 7 | Legacy `meeting.title` compat still in prod (renamed in v3.1.0) | `background.js` |
| 8 | `background.js` outside Vite pipeline — no `import` support | `background.js` |
| 9 | JSDoc types incomplete — `ResultLocal` mega-type, redundant `TranscriptBlock[] | []` | `types/index.js` |

---

## PR roadmap

```
main
 └─ PR A: refactor/typescript-migration      ← rename src/ to .ts, add tsconfig + @types/chrome
     └─ PR B: refactor/background-modules    ← background into Vite, module split
         └─ PR C: refactor/typed-protocol    ← typed messages + storage repository
             └─ PR D: refactor/service-layer ← MeetingService, DownloadService, WebhookService
                 └─ PR E: fix/quick-wins     ← notification leak + remove legacy title compat
```

Each PR leaves main green and is independently reviewable.

---

## PR A — TypeScript migration

**Branch:** `refactor/typescript-migration`  
**Base:** `refactor/module-split` (needs `src/` to exist)

### What changes

1. Install `typescript` + `@types/chrome` as dev dependencies
2. Create `tsconfig.json` — `strict: true`, `noEmit: true` (Vite handles compilation)
3. Update `vite.config.js` entry point from `.js` to `.ts`
4. Create `src/types.ts` — TypeScript interface equivalents of `types/index.js` JSDoc typedefs
5. Rename `src/**/*.js` → `src/**/*.ts`
6. Remove `// @ts-check` and `/// <reference path>` directives from all `src/` files
7. Add `import type` statements from `src/types.ts` where JSDoc `@type` casts existed
8. Fix TypeScript strict-mode errors
9. Keep `types/index.js` + `types/chrome.d.ts` for `background.js` (not yet in Vite)

### Key type conversions

```ts
// src/types.ts
export interface TranscriptBlock { personName: string; timestamp: string; transcriptText: string }
export interface ChatMessage     { personName: string; timestamp: string; chatMessageText: string }
export interface Meeting         { ... }
export interface ExtensionStatusJSON { status: number; message: string }
export interface ErrorObject     { errorCode: string; errorMessage: string }

export type MeetingSoftware  = "Google Meet" | "" | undefined
export type OperationMode    = "auto" | "manual"
export type WebhookBodyType  = "simple" | "advanced"
export type MeetingTabId     = number | "processing" | null

// Discriminated union for message protocol (also used in PR C)
export type ExtensionMessage =
  | { type: "new_meeting_started" }
  | { type: "meeting_ended" }
  | { type: "download_transcript_at_index"; index: number }
  | { type: "post_webhook_at_index"; index: number }
  | { type: "recover_last_meeting" }
  | { type: "open_popup" }
```

### Definition of done

- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] `npm run typecheck` passes (`tsc --noEmit`)
- [ ] All 40 Playwright tests pass
- [ ] No `@ts-ignore` comments introduced (fix root causes instead)
- [ ] `types/index.js` and `types/chrome.d.ts` untouched (background.js still needs them)

---

## PR B — Background into Vite + module split

**Branch:** `refactor/background-modules`  
**Base:** PR A

### What changes

1. Add `background` entry point to `vite.config.js` (second IIFE output)
2. Rename `background.js` → `src/background/` with modules:
   - `src/background/index.ts` — message router + event listeners
   - `src/background/meeting-storage.ts` — `pickupLastMeeting`, `recoverLastMeeting`
   - `src/background/download.ts` — `downloadTranscript`, `getTranscriptString`, `getChatMessagesString`
   - `src/background/webhook.ts` — `postTranscriptToWebhook`
   - `src/background/content-scripts.ts` — `registerContentScript`, `reRegisterContentScripts`
   - `src/background/lifecycle.ts` — `clearTabIdAndApplyUpdate`, update deferral
3. Delete `extension/background.js` (Vite now outputs it)

### Definition of done

- [ ] Build outputs both `extension/content-google-meet.js` and `extension/background.js`
- [ ] All 40 tests pass
- [ ] Each background module under 120 lines

---

## PR C — Typed message protocol + storage repository

**Branch:** `refactor/typed-protocol`  
**Base:** PR B

### What changes

1. `src/shared/messages.ts` — `ExtensionMessage` discriminated union (already drafted in PR A types)
2. `src/shared/storage-repo.ts` — typed wrappers for all `chrome.storage.local/sync` calls:
   ```ts
   export const StorageLocal = {
     getMeetings: (): Promise<Meeting[]> => ...,
     saveMeetings: (meetings: Meeting[]): Promise<void> => ...,
     getMeetingTabId: (): Promise<MeetingTabId> => ...,
     setMeetingTabId: (id: MeetingTabId): Promise<void> => ...,
     getCurrentMeetingData: (): Promise<CurrentMeetingData> => ...,
     ...
   }
   export const StorageSync = {
     getSettings: (): Promise<UserSettings> => ...,
     ...
   }
   ```
3. Replace all direct `chrome.storage.local.get/set` and `chrome.storage.sync.get/set` calls
   with `StorageLocal.*` / `StorageSync.*`
4. Replace `chrome.runtime.sendMessage` calls with typed helper:
   ```ts
   sendMessage(msg: ExtensionMessage): Promise<ExtensionResponse>
   ```

### Definition of done

- [ ] Zero raw `chrome.storage` calls outside `storage-repo.ts`
- [ ] Zero bare `chrome.runtime.sendMessage` calls outside `messages.ts`
- [ ] All 40 tests pass

---

## PR D — Service layer

**Branch:** `refactor/service-layer`  
**Base:** PR C

### What changes

Reorganise the background module functions (already split in PR B) into three services with
clean single-responsibility signatures:

```ts
// MeetingService
finalizeMeeting(): Promise<void>
recoverMeeting(): Promise<void>

// DownloadService
download(meeting: Meeting): Promise<void>
formatTranscript(meeting: Meeting): string

// WebhookService
post(meeting: Meeting, url: string): Promise<void>  // no longer leaks listeners
```

`background/index.ts` becomes a thin message router that delegates to these services.

### Definition of done

- [ ] `background/index.ts` under 60 lines
- [ ] Each service under 100 lines
- [ ] All 40 tests pass

---

## PR E — Quick wins

**Branch:** `fix/quick-wins`  
**Base:** `main` (independent of A–D — can land any time)

### What changes

1. **Fix notification listener leak** in `postTranscriptToWebhook`:
   ```ts
   // Replace addListener inside function with a module-level listener
   // that checks notification ID against a Set
   ```
2. **Remove `meeting.title` legacy compat** — `meeting.title` was renamed to `meeting.meetingTitle`
   in v3.1.0; remove all `meeting.title || meeting.meetingTitle` fallbacks
3. **Error codes to enum** — `ErrorCode.BLOB_READ_FAILED` beats `"009"` everywhere

### Definition of done

- [ ] No `chrome.notifications.onClicked.addListener` calls inside functions
- [ ] No `meeting.title` references in codebase
- [ ] Error codes defined as a `const` enum in `src/shared/errors.ts`
- [ ] All 40 tests pass
