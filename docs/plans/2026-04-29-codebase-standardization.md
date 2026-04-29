# Codebase Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all Blocker and high-value Suggestion findings from the architecture/API/coding-standards review across two PRs.

**Architecture:** PR 1 targets self-contained coding-standard fixes (magic strings, unused params, type contracts, DRY). PR 2 targets structural concerns (lifting use-case logic into the services layer, extracting domain logic from I/O adapters). Each PR leaves the extension in a fully working, typecheck-clean state.

**Tech Stack:** TypeScript 6, Vite IIFE bundles, Chrome MV3, Playwright E2E tests

**Verification gate throughout:** `npm run typecheck` after every task; `npm test` after the final task in each PR.

---

## PR 1 — `refactor/standards-and-contract-fixes`

Seven independent tasks. All can be done in any order; each task is one commit.

---

### Task 1: Fix magic string `"010"` in `state-sync.ts`

**Files:**
- Modify: `src/content/state-sync.ts`

**Context:** `state-sync.ts` guards against a `MEETING_NOT_FOUND` error using the raw string `"010"` instead of the `ErrorCode` constant that already exists in `src/shared/errors.ts`. If the constant is ever renumbered this guard silently stops working.

- [ ] **Step 1: Add `ErrorCode` import to `state-sync.ts`**

Open `src/content/state-sync.ts`. The current import block at the top is:

```typescript
import type { ErrorObject } from '../types'
import { state } from './state'
import { meetingSoftware as meetingSoftwareConst } from './constants'
import { pulseStatus } from './ui'
import { sendMessage } from '../shared/messages'
```

Replace with:

```typescript
import type { ErrorObject } from '../types'
import { ErrorCode } from '../shared/errors'
import { state } from './state'
import { meetingSoftware as meetingSoftwareConst } from './constants'
import { pulseStatus } from './ui'
import { sendMessage } from '../shared/messages'
```

- [ ] **Step 2: Replace the magic string comparison**

Find the block inside `persistStateFields` that currently reads:

```typescript
if (!response.success && typeof response.message === "object") {
  const err = response.message as ErrorObject
  if (err.errorCode === "010") console.error(err.errorMessage)
}
```

Replace with:

```typescript
if (!response.success && typeof response.message === "object") {
  const err = response.message as ErrorObject
  if (err.errorCode === ErrorCode.MEETING_NOT_FOUND) console.error(err.errorMessage)
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/content/state-sync.ts
git commit -m "fix: replace magic error code string with ErrorCode.MEETING_NOT_FOUND"
```

---

### Task 2: Remove unused `_isWebhookEnabled` parameter

**Files:**
- Modify: `src/background/download.ts`
- Modify: `src/background/meeting-storage.ts`
- Modify: `src/services/download-service.ts`

**Context:** `downloadTranscript` has a second parameter that is never read. Two call sites pass real computed values that are silently dropped. This masks a missing implementation and misleads readers.

- [ ] **Step 1: Remove the parameter from the function signature**

In `src/background/download.ts`, change the function signature from:

```typescript
export async function downloadTranscript(index: number, _isWebhookEnabled: boolean): Promise<void> {
```

to:

```typescript
export async function downloadTranscript(index: number): Promise<void> {
```

No other changes needed inside the function body.

- [ ] **Step 2: Fix the call site in `meeting-storage.ts`**

In `src/background/meeting-storage.ts`, find:

```typescript
promises.push(downloadTranscript(lastIndex, !!(sync.webhookUrl && sync.autoPostWebhookAfterMeeting)))
```

Replace with:

```typescript
promises.push(downloadTranscript(lastIndex))
```

- [ ] **Step 3: Fix the call site in `download-service.ts`**

In `src/services/download-service.ts`, find:

```typescript
downloadTranscript: async (index: number): Promise<void> => downloadTranscript(index, false),
```

Replace with:

```typescript
downloadTranscript: async (index: number): Promise<void> => downloadTranscript(index),
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/background/download.ts src/background/meeting-storage.ts src/services/download-service.ts
git commit -m "fix: remove unused _isWebhookEnabled parameter from downloadTranscript"
```

---

### Task 3: Deduplicate `timeFormat` (DRY fix)

**Files:**
- Modify: `src/shared/formatters.ts`
- Modify: `src/background/webhook.ts`
- Modify: `src/background/download.ts`

**Context:** `timeFormat` is defined identically in three files. `formatters.ts` already owns timestamp formatting logic and is already imported by both other files, so exporting from there is free.

- [ ] **Step 1: Export `timeFormat` from `formatters.ts`**

In `src/shared/formatters.ts`, change:

```typescript
const timeFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}
```

to:

```typescript
export const timeFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}
```

- [ ] **Step 2: Remove local copy from `webhook.ts` and add to import**

In `src/background/webhook.ts`, delete the local `timeFormat` declaration:

```typescript
// DELETE these lines:
const timeFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}
```

Update the import line at the top of the file from:

```typescript
import { getTranscriptString, getChatMessagesString } from '../shared/formatters'
```

to:

```typescript
import { getTranscriptString, getChatMessagesString, timeFormat } from '../shared/formatters'
```

- [ ] **Step 3: Remove local copy from `download.ts` and add to import**

In `src/background/download.ts`, delete the local `timeFormat` declaration:

```typescript
// DELETE these lines:
const timeFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}
```

Update the import line at the top of the file from:

```typescript
import { getTranscriptString, getChatMessagesString } from '../shared/formatters'
```

to:

```typescript
import { getTranscriptString, getChatMessagesString, timeFormat } from '../shared/formatters'
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/formatters.ts src/background/webhook.ts src/background/download.ts
git commit -m "refactor: export timeFormat from formatters.ts, remove duplicate definitions"
```

---

### Task 4: Immutable array update in `webhook.ts` and `meeting-storage.ts`

**Files:**
- Modify: `src/background/webhook.ts`
- Modify: `src/background/meeting-storage.ts`

**Context:** Two places mutate array elements in place after reading from storage. An immutable update pattern makes it safe if the storage layer ever returns frozen objects and matches the style used elsewhere in the codebase.

- [ ] **Step 1: Fix the failed-status mutation in `webhook.ts`**

In `src/background/webhook.ts`, find the block that sets `"failed"`:

```typescript
meetings[index].webhookPostStatus = "failed"
await StorageLocal.setMeetings(meetings)
```

Replace with:

```typescript
const withFailed = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "failed" as const } : m)
await StorageLocal.setMeetings(withFailed)
```

- [ ] **Step 2: Fix the successful-status mutation in `webhook.ts`**

In the same file, find the block that sets `"successful"`:

```typescript
meetings[index].webhookPostStatus = "successful"
await StorageLocal.setMeetings(meetings)
```

Replace with:

```typescript
const withSuccess = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "successful" as const } : m)
await StorageLocal.setMeetings(withSuccess)
```

- [ ] **Step 3: Fix the `push`+`let` pattern in `meeting-storage.ts`**

In `src/background/meeting-storage.ts`, find inside `pickupLastMeeting`:

```typescript
let meetings = await StorageLocal.getMeetings()
meetings.push(newEntry)
if (meetings.length > 10) meetings = meetings.slice(-10)
await StorageLocal.setMeetings(meetings)
```

Replace with:

```typescript
const meetings = await StorageLocal.getMeetings()
const updated = [...meetings, newEntry].slice(-10)
await StorageLocal.setMeetings(updated)
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/background/webhook.ts src/background/meeting-storage.ts
git commit -m "refactor: use immutable array updates instead of in-place mutation"
```

---

### Task 5: Normalize `isDeferredUpdate*` naming

**Files:**
- Modify: `src/shared/storage-repo.ts`
- Modify: `src/background/lifecycle.ts`
- Modify: `src/background/event-listeners.ts`

**Context:** The same boolean concept has three different names: `isDeferredUpdateAvailable` (interface + storage key), `getDeferredUpdatePending` (getter), `setDeferredUpdate` (setter). Standardizing on `deferredUpdatePending` across all three locations makes the concept findable by search.

Note: The Chrome storage key is also renamed. Since this flag defaults to `false`, existing users will simply apply the next extension update immediately on first run after upgrade — which is the correct safe behavior.

- [ ] **Step 1: Update `storage-repo.ts` — interface, storage key, setter name**

In `src/shared/storage-repo.ts`, update the `LocalState` interface field:

```typescript
// Change:
isDeferredUpdateAvailable: boolean
// To:
deferredUpdatePending: boolean
```

Update the getter to read the new storage key:

```typescript
// Change:
getDeferredUpdatePending: async (): Promise<boolean> => {
  const raw = await chrome.storage.local.get(["isDeferredUpdateAvailable"])
  return !!(raw.isDeferredUpdateAvailable as boolean | undefined)
},
// To:
getDeferredUpdatePending: async (): Promise<boolean> => {
  const raw = await chrome.storage.local.get(["deferredUpdatePending"])
  return !!(raw.deferredUpdatePending as boolean | undefined)
},
```

Rename the setter from `setDeferredUpdate` to `setDeferredUpdatePending` and update its storage key:

```typescript
// Change:
setDeferredUpdate: (value: boolean): Promise<void> =>
  chrome.storage.local.set({ isDeferredUpdateAvailable: value }),
// To:
setDeferredUpdatePending: (value: boolean): Promise<void> =>
  chrome.storage.local.set({ deferredUpdatePending: value }),
```

- [ ] **Step 2: Update `lifecycle.ts` — two setter call sites**

In `src/background/lifecycle.ts`, find and replace both calls:

```typescript
// Change:
await StorageLocal.setDeferredUpdate(false)
// To:
await StorageLocal.setDeferredUpdatePending(false)
```

- [ ] **Step 3: Update `event-listeners.ts` — one setter call site**

In `src/background/event-listeners.ts`, find and replace:

```typescript
// Change:
StorageLocal.setDeferredUpdate(true).then(() => console.log("Deferred update flag set"))
// To:
StorageLocal.setDeferredUpdatePending(true).then(() => console.log("Deferred update flag set"))
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage-repo.ts src/background/lifecycle.ts src/background/event-listeners.ts
git commit -m "refactor: normalize deferredUpdatePending naming across storage-repo, lifecycle, and event-listeners"
```

---

### Task 6: Remove `""` from `MeetingSoftware` type

**Files:**
- Modify: `src/types.ts`
- Modify: `src/background/meeting-storage.ts`

**Context:** `MeetingSoftware = "Google Meet" | "" | undefined` has two "absent" sentinels. Empty string and `undefined` both mean "not set" but serialize differently to JSON and require double-guarding. Removing `""` makes `undefined` the single absent value.

- [ ] **Step 1: Remove `""` from the union in `types.ts`**

In `src/types.ts`, change:

```typescript
export type MeetingSoftware = "Google Meet" | "" | undefined
```

to:

```typescript
export type MeetingSoftware = "Google Meet" | undefined
```

- [ ] **Step 2: Fix the initializer in `meeting-storage.ts` that produces `""`**

In `src/background/meeting-storage.ts`, inside `pickupLastMeeting`, find:

```typescript
const newEntry: Meeting = {
  software: data.software ?? "",
  ...
}
```

Replace with:

```typescript
const newEntry: Meeting = {
  software: data.software,
  ...
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. If the compiler reports assignment errors elsewhere, trace them — every `meeting.software = ""` site should become `meeting.software = undefined`.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/background/meeting-storage.ts
git commit -m "fix: remove empty-string sentinel from MeetingSoftware, use undefined as sole absent value"
```

---

### Task 7: `ExtensionResponse` — discriminated union contract

**Files:**
- Modify: `src/types.ts`
- Modify: `src/shared/errors.ts`
- Modify: `src/background/index.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/content/state-sync.ts`

**Context:** `ExtensionResponse.message?: string | ErrorObject` collapses success data and error details into one ambiguous field. Callers must type-narrow at every use site without compiler enforcement. A discriminated union gives full type narrowing and a consistent error shape.

- [ ] **Step 1: Add `POPUP_OPEN_FAILED` to `ErrorCode`**

In `src/shared/errors.ts`, add one new entry:

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
} as const
```

- [ ] **Step 2: Replace `ExtensionResponse` in `types.ts`**

In `src/types.ts`, replace:

```typescript
export interface ExtensionResponse {
  success: boolean
  message?: string | ErrorObject
}
```

with:

```typescript
export type ExtensionResponse =
  | { success: true; data?: string }
  | { success: false; error: ErrorObject }
```

- [ ] **Step 3: Update `background/index.ts`**

The file currently has these helper constants and send calls. Replace the entire `chrome.runtime.onMessage.addListener` body and helpers with the updated version below.

Current helpers at the top of the listener:

```typescript
const ok: ExtensionResponse = { success: true }
const err = (e: ErrorObject): ExtensionResponse => ({ success: false, message: e })
const invalidIndex: ExtensionResponse = { success: false, message: { errorCode: ErrorCode.INVALID_INDEX, errorMessage: "Invalid index" } }
```

Replace with:

```typescript
const ok: ExtensionResponse = { success: true }
const err = (e: ErrorObject): ExtensionResponse => ({ success: false, error: e })
const invalidIndex: ExtensionResponse = { success: false, error: { errorCode: ErrorCode.INVALID_INDEX, errorMessage: "Invalid index" } }
```

Then find the `open_popup` handler block:

```typescript
if (msg.type === "open_popup") {
  chrome.action.openPopup()
    .then((m) => sendResponse({ success: true, message: String(m) }))
    .catch((e: unknown) => sendResponse({ success: false, message: String(e) }))
}
```

Replace with:

```typescript
if (msg.type === "open_popup") {
  chrome.action.openPopup()
    .then((m) => sendResponse({ success: true, data: String(m) }))
    .catch((e: unknown) => sendResponse({ success: false, error: { errorCode: ErrorCode.POPUP_OPEN_FAILED, errorMessage: String(e) } }))
}
```

Also update the `recover_last_meeting` handler:

```typescript
// Change:
.then((m) => sendResponse({ success: true, message: m }))
// To:
.then((m) => sendResponse({ success: true, data: m }))
```

- [ ] **Step 4: Update `shared/messages.ts`**

In `src/shared/messages.ts`, the `recoverLastMeeting` function currently accesses `response.message`. Update to use the new shape:

```typescript
export function recoverLastMeeting(): Promise<string> {
  return sendMessage({ type: "recover_last_meeting" }).then((response) => {
    if (response.success) return response.data ?? "Last meeting recovered successfully or recovery not needed"
    return Promise.reject(response.error)
  })
}
```

- [ ] **Step 5: Update `content/state-sync.ts`**

The `persistStateFields` function currently narrows `response.message` manually. The new type makes narrowing automatic. Replace:

```typescript
if (!response.success && typeof response.message === "object") {
  const err = response.message as ErrorObject
  if (err.errorCode === ErrorCode.MEETING_NOT_FOUND) console.error(err.errorMessage)
}
```

with:

```typescript
if (!response.success) {
  if (response.error.errorCode === ErrorCode.MEETING_NOT_FOUND) console.error(response.error.errorMessage)
}
```

Also verify the `ErrorCode` import added in Task 1 is still present (it will be).

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. If TypeScript reports any remaining `response.message` accesses, they are sites missed in the steps above — search for `response.message` and update each one to use `response.data` (success path) or `response.error` (failure path).

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all 40 tests pass. This is the final task of PR 1, so run the full suite here.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/shared/errors.ts src/background/index.ts src/shared/messages.ts src/content/state-sync.ts
git commit -m "refactor: replace ExtensionResponse with a discriminated union, add POPUP_OPEN_FAILED error code"
```

---

## PR 2 — `refactor/architecture-layer-cleanup`

Two sequential tasks. Task 8 must be done before Task 9 because Task 9 depends on the services layer being real after Task 8.

---

### Task 8: Lift use-case logic into `services/meeting-service.ts`

**Files:**
- Modify: `src/services/meeting-service.ts`
- Delete: `src/background/meeting-storage.ts`
- Modify: `src/background/index.ts` (remove stale import if needed)
- Modify: `src/background/event-listeners.ts` (remove stale import if needed)

**Context:** `services/meeting-service.ts` is currently a no-op pass-through that delegates to `background/meeting-storage.ts`. The real orchestration logic lives in the wrong layer. Moving it into the services file makes the application layer real and reduces the call chain depth by one.

After this task: `background/index.ts` → `MeetingService.finalizeMeeting()` (which now contains the logic directly). `background/meeting-storage.ts` is deleted.

- [ ] **Step 1: Rewrite `services/meeting-service.ts` with the full logic**

Replace the entire contents of `src/services/meeting-service.ts` with:

```typescript
import type { Meeting } from '../types'
import { ErrorCode } from '../shared/errors'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { DownloadService } from './download-service'
import { WebhookService } from './webhook-service'

export async function pickupLastMeeting(): Promise<string> {
  const data = await StorageLocal.getCurrentMeetingData()

  if (!data.startTimestamp) {
    throw { errorCode: ErrorCode.NO_MEETINGS, errorMessage: "No meetings found. May be attend one?" }
  }
  if (!data.transcript?.length && !data.chatMessages?.length) {
    throw { errorCode: ErrorCode.EMPTY_TRANSCRIPT, errorMessage: "Empty transcript and empty chatMessages" }
  }

  const newEntry: Meeting = {
    software: data.software,
    title: data.title,
    startTimestamp: data.startTimestamp,
    endTimestamp: new Date().toISOString(),
    transcript: data.transcript ?? [],
    chatMessages: data.chatMessages ?? [],
    webhookPostStatus: "new",
  }

  const meetings = await StorageLocal.getMeetings()
  const updated = [...meetings, newEntry].slice(-10)
  await StorageLocal.setMeetings(updated)
  console.log("Last meeting picked up")
  return "Last meeting picked up"
}

export async function finalizeMeeting(): Promise<string> {
  await pickupLastMeeting()

  const meetings = await StorageLocal.getMeetings()
  const sync = await StorageSync.getAutoActionSettings()
  const lastIndex = meetings.length - 1
  const promises: Promise<unknown>[] = []

  if (sync.autoDownloadFileAfterMeeting) {
    promises.push(DownloadService.downloadTranscript(lastIndex))
  }
  if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) {
    promises.push(WebhookService.postWebhook(lastIndex))
  }

  await Promise.all(promises)
  return "Meeting processing complete"
}

export async function recoverLastMeeting(): Promise<string> {
  const [meetings, data] = await Promise.all([
    StorageLocal.getMeetings(),
    StorageLocal.getCurrentMeetingData(),
  ])

  if (!data.startTimestamp) {
    throw { errorCode: ErrorCode.NO_MEETINGS, errorMessage: "No meetings found. May be attend one?" }
  }

  const lastSaved = meetings.length > 0 ? meetings[meetings.length - 1] : undefined
  if (!lastSaved || data.startTimestamp !== lastSaved.startTimestamp) {
    await finalizeMeeting()
    return "Recovered last meeting to the best possible extent"
  }
  return "No recovery needed"
}

export const MeetingService = {
  finalizeMeeting,
  recoverMeeting: recoverLastMeeting,
  pickupLastMeeting,
}
```

- [ ] **Step 2: Typecheck before deletion**

```bash
npm run typecheck
```

Expected: no errors. If TypeScript reports circular dependency issues, check that `DownloadService` and `WebhookService` do not transitively import from `meeting-service.ts` — they should not.

- [ ] **Step 3: Delete `background/meeting-storage.ts`**

```bash
git rm src/background/meeting-storage.ts
```

- [ ] **Step 4: Fix any remaining imports**

Run:

```bash
grep -r "meeting-storage" src/
```

Expected: no matches. If any file still imports from `'../background/meeting-storage'` or `'./meeting-storage'`, update those imports to point to the appropriate service function (which now lives in `src/services/meeting-service.ts`).

- [ ] **Step 5: Typecheck after deletion**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/meeting-service.ts
git commit -m "refactor: lift use-case logic into services/meeting-service.ts, delete background/meeting-storage.ts"
```

---

### Task 9: Extract domain logic from `background/download.ts` and `background/webhook.ts`

**Files:**
- Modify: `src/shared/formatters.ts`
- Modify: `src/background/download.ts`
- Modify: `src/background/webhook.ts`

**Context:** Filename sanitization and webhook body construction are pure business rules that do not require Chrome APIs. Extracting them into `shared/formatters.ts` makes them testable in isolation and removes business logic from I/O adapter files. After this task, `download.ts` and `webhook.ts` contain only I/O calls.

- [ ] **Step 1: Add `buildTranscriptFilename` to `formatters.ts`**

In `src/shared/formatters.ts`, add the following export after the existing exports. This file already imports `TranscriptBlock` and `ChatMessage`; also add `Meeting`:

Update the import at the top of `formatters.ts` from:

```typescript
import type { TranscriptBlock, ChatMessage } from '../types'
```

to:

```typescript
import type { TranscriptBlock, ChatMessage, Meeting } from '../types'
```

Then add at the bottom of the file:

```typescript
export function buildTranscriptFilename(meeting: Meeting): string {
  const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
  const sanitisedTitle = meeting.title
    ? meeting.title.replaceAll(invalidFilenameRegex, "_")
    : "Meeting"
  const timestamp = new Date(meeting.startTimestamp)
  const formattedTimestamp = timestamp.toLocaleString("default", timeFormat).replace(/[/:]/g, "-")
  const prefix = meeting.software ? `${meeting.software} transcript` : "Transcript"
  return `meet-transcripts/${prefix}-${sanitisedTitle} at ${formattedTimestamp} on.txt`
}
```

- [ ] **Step 2: Add `buildWebhookBody` to `formatters.ts`**

Also add the following import and export to `formatters.ts`. Update the import line to also bring in `WebhookBody` and `WebhookBodyType`:

```typescript
import type { TranscriptBlock, ChatMessage, Meeting, WebhookBody, WebhookBodyType } from '../types'
```

Add at the bottom of the file:

```typescript
export function buildWebhookBody(meeting: Meeting, bodyType: WebhookBodyType): WebhookBody {
  if (bodyType === "advanced") {
    return {
      webhookBodyType: "advanced",
      software: meeting.software || "",
      title: meeting.title || "",
      startTimestamp: new Date(meeting.startTimestamp).toISOString(),
      endTimestamp: new Date(meeting.endTimestamp).toISOString(),
      transcript: meeting.transcript,
      chatMessages: meeting.chatMessages,
    }
  }
  return {
    webhookBodyType: "simple",
    software: meeting.software || "",
    title: meeting.title || "",
    startTimestamp: new Date(meeting.startTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
    endTimestamp: new Date(meeting.endTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
    transcript: getTranscriptString(meeting.transcript),
    chatMessages: getChatMessagesString(meeting.chatMessages),
  }
}
```

- [ ] **Step 3: Simplify `background/download.ts` to use `buildTranscriptFilename`**

In `src/background/download.ts`, update the import line to also bring in `buildTranscriptFilename`:

```typescript
import { getTranscriptString, getChatMessagesString, timeFormat, buildTranscriptFilename } from '../shared/formatters'
```

Remove the following lines from inside `downloadTranscript` (they are now inside `buildTranscriptFilename`):

```typescript
// DELETE:
const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
let sanitisedTitle = "Meeting"
if (meeting.title) {
  sanitisedTitle = meeting.title.replaceAll(invalidFilenameRegex, "_")
}
const timestamp = new Date(meeting.startTimestamp)
const formattedTimestamp = timestamp.toLocaleString("default", timeFormat).replace(/[/:]/g, "-")
const prefix = meeting.software ? `${meeting.software} transcript` : "Transcript"
const fileName = `meet-transcripts/${prefix}-${sanitisedTitle} at ${formattedTimestamp} on.txt`
```

Replace with one line:

```typescript
const fileName = buildTranscriptFilename(meeting)
```

The `timeFormat` import can also be removed from `download.ts` since it is no longer used directly there (it is used inside `buildTranscriptFilename` in `formatters.ts`). Update the import:

```typescript
import { getTranscriptString, getChatMessagesString, buildTranscriptFilename } from '../shared/formatters'
```

- [ ] **Step 4: Simplify `background/webhook.ts` to use `buildWebhookBody`**

In `src/background/webhook.ts`, update the import to also bring in `buildWebhookBody`:

```typescript
import { getTranscriptString, getChatMessagesString, buildWebhookBody } from '../shared/formatters'
```

Note: `timeFormat` was removed from `webhook.ts` in Task 3, so that import is already gone.

Inside `postTranscriptToWebhook`, remove the manual body construction block:

```typescript
// DELETE:
const bodyType = webhookBodyType === "advanced" ? "advanced" : "simple"
const webhookData: WebhookBody = bodyType === "advanced"
  ? {
      webhookBodyType: "advanced",
      software: meeting.software || "",
      title: meeting.title || "",
      startTimestamp: new Date(meeting.startTimestamp).toISOString(),
      endTimestamp: new Date(meeting.endTimestamp).toISOString(),
      transcript: meeting.transcript,
      chatMessages: meeting.chatMessages,
    }
  : {
      webhookBodyType: "simple",
      software: meeting.software || "",
      title: meeting.title || "",
      startTimestamp: new Date(meeting.startTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
      endTimestamp: new Date(meeting.endTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
      transcript: getTranscriptString(meeting.transcript),
      chatMessages: getChatMessagesString(meeting.chatMessages),
    }
```

Replace with:

```typescript
const bodyType = webhookBodyType === "advanced" ? "advanced" : "simple"
const webhookData = buildWebhookBody(meeting, bodyType)
```

Also remove the `getTranscriptString` and `getChatMessagesString` named imports since they are no longer used directly in `webhook.ts` (they are called inside `buildWebhookBody` in `formatters.ts`). The import becomes:

```typescript
import { buildWebhookBody } from '../shared/formatters'
```

Also remove the `WebhookBody` type import from `webhook.ts` since it's no longer needed there:

```typescript
// Change:
import type { Meeting, WebhookBody } from '../types'
// To:
import type { Meeting } from '../types'
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all 40 tests pass. This is the final task of PR 2.

- [ ] **Step 7: Commit**

```bash
git add src/shared/formatters.ts src/background/download.ts src/background/webhook.ts
git commit -m "refactor: extract filename and webhook body construction into shared/formatters.ts"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Magic string `"010"` → `ErrorCode.MEETING_NOT_FOUND` — Task 1
- [x] Remove `_isWebhookEnabled` unused param — Task 2
- [x] Deduplicate `timeFormat` — Task 3
- [x] Immutable array updates — Task 4
- [x] `isDeferredUpdate*` naming normalized — Task 5
- [x] `MeetingSoftware` remove `""` sentinel — Task 6
- [x] `ExtensionResponse` discriminated union — Task 7
- [x] Services layer gets real use-case logic — Task 8
- [x] Domain logic extracted from I/O adapters — Task 9

**Remaining findings not in this plan (deferred):**
- `AppState` DOM reference in shared types (Suggestion — requires larger split of state types)
- `shared/` → `infrastructure/` folder rename (Suggestion — low impact, high churn)
- `ExtensionMessage` naming convention unification (Suggestion — breaking change to protocol)
- `webhookPostStatus` decoupled from `Meeting` domain object (Suggestion — requires storage migration)
- `logError` magic string codes `"001"–"004"` (Suggestion — can be added to `ErrorCode` independently)
- `waitForElement` no timeout (Suggestion — separate resilience task)
- `Platform` type unused (Nit — one-line delete)
- `TranscriptBlock` / `ChatMessage` structural equivalence branding (Nit)
- `StorageSync` redundant partial-read methods (Nit)
- `webhookBodyType` discriminant renamed to `type` (Nit — breaking webhook API change)
