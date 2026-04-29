# Interface Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize naming conventions, API interfaces, and module structure across the entire codebase so every layer follows consistent patterns.

**Architecture:** The changes are grouped into three dependency phases: (1) safe constant/error-code fixes, (2) storage and service layer renames, (3) breaking type-field renames with a storage migration. Each phase can be committed independently and TypeScript compilation (`npm run typecheck`) is the verification gate throughout.

**Tech Stack:** TypeScript, Vite (IIFE bundler), Chrome Extension Manifest V3, Playwright (E2E tests), plain JS (`extension/meetings.js`, `extension/popup.js`) with JSDoc types in `types/index.js`.

---

## File Map

| File | What changes |
|---|---|
| `src/constants.ts` | **Create** — receives constants extracted from `state.ts` |
| `src/state.ts` | Remove constants, keep only mutable `AppState` singleton; field renames in Task 8 |
| `src/types.ts` | `TranscriptBlock.text`, `ChatMessage.text`, `Meeting.*` field renames |
| `src/shared/storage-repo.ts` | Fix typo, standardize `set*` verbs, rename `StorageSync` getters, `LocalState` field renames |
| `src/shared/errors.ts` | No changes |
| `src/shared/messages.ts` | No changes |
| `src/storage.ts` → `src/state-sync.ts` | Rename file + function inside |
| `src/background/content-scripts.ts` | Fix `reRegisterContentScripts` → `reRegisterContentScript` |
| `src/background/download.ts` | Field access updates from Task 7–8 |
| `src/background/event-listeners.ts` | Updated import for `reRegisterContentScript`, `setMeetings`, `setDeferredUpdate` callers |
| `src/background/index.ts` | Updated service method calls from Task 5 |
| `src/background/lifecycle.ts` | Updated calls to `getDeferredUpdatePending`, `setDeferredUpdate` |
| `src/background/meeting-storage.ts` | Rename `processLastMeeting` → `finalizeMeeting`, `pickupLastMeetingFromStorage` → `pickupLastMeeting`; field renames |
| `src/background/webhook.ts` | `getWebhookSettings`, field renames |
| `src/services/download-service.ts` | `downloadTranscript`, field renames |
| `src/services/meeting-service.ts` | Align method names |
| `src/services/webhook-service.ts` | `postWebhook` |
| `src/content-google-meet.ts` | Use `ErrorCode` constants, updated import path for `state-sync.ts`, field renames |
| `src/meeting.ts` | Updated import + field renames |
| `src/observer/chat-observer.ts` | `ChatMessage.text` rename |
| `src/observer/transcript-observer.ts` | `AppState.textBuffer` rename |
| `types/index.js` | Update JSDoc typedefs to match new field names |
| `extension/meetings.js` | Add local `ErrorCode` object, update field accesses |

---

## Task 1: Extract constants from state.ts into constants.ts

**Goal:** `state.ts` should only export the mutable `AppState` singleton. Four constants have no business there.

**Files:**
- Create: `src/constants.ts`
- Modify: `src/state.ts`
- Modify: `src/meeting.ts` (imports `bugStatusJson`)
- Modify: `src/observer/transcript-observer.ts` (imports `bugStatusJson`, `reportErrorMessage`, `mutationConfig`)
- Modify: `src/observer/chat-observer.ts` (imports `bugStatusJson`, `reportErrorMessage`)

- [ ] **Step 1: Create src/constants.ts**

```typescript
import type { ExtensionStatusJSON, MeetingSoftware } from './types'

export const bugStatusJson: ExtensionStatusJSON = {
  status: 400,
  message: `<strong>meet-transcripts encountered a new error</strong> <br /> Please report it <a href="https://github.com/patrick204nqh/meet-transcripts/issues" target="_blank">here</a>.`,
}

export const reportErrorMessage = "There is a bug in meet-transcripts. Please report it at https://github.com/patrick204nqh/meet-transcripts/issues"

export const mutationConfig: MutationObserverInit = { childList: true, attributes: true, subtree: true, characterData: true }

export const meetingSoftware: MeetingSoftware = "Google Meet"
```

- [ ] **Step 2: Update src/state.ts — remove the four constants, keep AppState**

Replace the entire file content:

```typescript
import type { AppState, ExtensionStatusJSON } from './types'

export const state: AppState = {
  userName: "You",
  transcript: [],
  transcriptTargetBuffer: null,
  personNameBuffer: "",
  transcriptTextBuffer: "",
  timestampBuffer: "",
  chatMessages: [],
  meetingStartTimestamp: new Date().toISOString(),
  meetingTitle: document.title,
  isTranscriptDomErrorCaptured: false,
  isChatMessagesDomErrorCaptured: false,
  hasMeetingStarted: false,
  hasMeetingEnded: false,
  extensionStatusJSON: null,
}
```

- [ ] **Step 3: Update src/meeting.ts imports**

Change:
```typescript
import { state, mutationConfig, extensionStatusJSON_bug } from './state'
```
To:
```typescript
import { state } from './state'
import { mutationConfig, bugStatusJson } from './constants'
```

Replace all uses of `extensionStatusJSON_bug` in the file with `bugStatusJson`.

- [ ] **Step 4: Update src/observer/transcript-observer.ts imports**

Change:
```typescript
import { state, mutationConfig, extensionStatusJSON_bug, reportErrorMessage } from '../state'
```
To:
```typescript
import { state } from '../state'
import { mutationConfig, bugStatusJson, reportErrorMessage } from '../constants'
```

Replace all uses of `extensionStatusJSON_bug` with `bugStatusJson`.

- [ ] **Step 5: Update src/observer/chat-observer.ts imports**

Change:
```typescript
import { state, extensionStatusJSON_bug, reportErrorMessage } from '../state'
```
To:
```typescript
import { state } from '../state'
import { bugStatusJson, reportErrorMessage } from '../constants'
```

Replace all uses of `extensionStatusJSON_bug` with `bugStatusJson`.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/constants.ts src/state.ts src/meeting.ts src/observer/transcript-observer.ts src/observer/chat-observer.ts
git commit -m "refactor: extract constants from state.ts into constants.ts, rename extensionStatusJSON_bug to bugStatusJson"
```

---

## Task 2: Use ErrorCode constants everywhere

**Goal:** Eliminate hardcoded error code string literals (`"013"`, `"014"`, `"016"`) outside of `errors.ts`.

**Files:**
- Modify: `src/content-google-meet.ts`
- Modify: `extension/meetings.js`

- [ ] **Step 1: Update src/content-google-meet.ts**

Add the import at the top:
```typescript
import { ErrorCode } from './shared/errors'
```

Then change the `Promise.race` block (lines 8–19):

Before:
```typescript
Promise.race([
  recoverLastMeeting(),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject({ errorCode: "016", errorMessage: "Recovery timed out" }), 2000)
  )
])
  .catch((error: unknown) => {
    const parsedError = error as ErrorObject
    if (parsedError.errorCode !== "013" && parsedError.errorCode !== "014") {
      console.error(parsedError.errorMessage)
    }
  })
```

After:
```typescript
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
```

- [ ] **Step 2: Add local ErrorCode object to extension/meetings.js**

Add at the top of `extension/meetings.js`, after the reference directives:

```javascript
// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

const ErrorCode = {
  NO_MEETINGS: "013",
  EMPTY_TRANSCRIPT: "014",
}
```

Then update the `recover_last_meeting` response handler (around line 52):

Before:
```javascript
if (parsedError.errorCode === "013" || parsedError.errorCode === "014") {
```

After:
```javascript
if (parsedError.errorCode === ErrorCode.NO_MEETINGS || parsedError.errorCode === ErrorCode.EMPTY_TRANSCRIPT) {
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/content-google-meet.ts extension/meetings.js
git commit -m "refactor: replace hardcoded error code strings with ErrorCode constants"
```

---

## Task 3: Standardize storage-repo.ts — fix typo, write verbs, getter names

**Goal:** Three fixes in one file to keep a single targeted commit:
1. Fix `isDeferredUpdatedAvailable` key typo (extra `d`) → `isDeferredUpdateAvailable`
2. Rename write methods: `saveMeetings` → `setMeetings`, `saveSettings` → `setSettings`
3. Rename `isDeferredUpdateAvailable()` predicate → `getDeferredUpdatePending()`
4. Rename StorageSync getters: `getWebhookConfig` → `getWebhookSettings`, `getDownloadConfig` → `getAutoActionSettings`

**Files:**
- Modify: `src/shared/storage-repo.ts`
- Modify: `src/background/meeting-storage.ts` (calls `saveMeetings`, `getDownloadConfig`)
- Modify: `src/background/webhook.ts` (calls `saveMeetings`, `getWebhookConfig`)
- Modify: `src/background/lifecycle.ts` (calls `isDeferredUpdateAvailable`, `setDeferredUpdate`)
- Modify: `src/background/event-listeners.ts` (calls `saveSettings` via `StorageSync`)
- Modify: `src/services/download-service.ts` (calls `getMeetings`)

- [ ] **Step 1: Replace src/shared/storage-repo.ts entirely**

```typescript
import type { Meeting, MeetingTabId, MeetingSoftware, TranscriptBlock, ChatMessage, OperationMode, WebhookBodyType } from '../types'

export interface LocalState {
  meetingTabId: MeetingTabId
  meetingSoftware: MeetingSoftware
  meetingTitle: string
  meetingStartTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  isDeferredUpdateAvailable: boolean
  meetings: Meeting[]
}

export interface SyncSettings {
  autoPostWebhookAfterMeeting: boolean
  autoDownloadFileAfterMeeting: boolean
  operationMode: OperationMode
  webhookBodyType: WebhookBodyType
  webhookUrl: string
}

export const StorageLocal = {
  getMeetings: async (): Promise<Meeting[]> => {
    const raw = await chrome.storage.local.get(["meetings"])
    return (raw.meetings as Meeting[] | undefined) ?? []
  },

  setMeetings: (meetings: Meeting[]): Promise<void> =>
    chrome.storage.local.set({ meetings }),

  getMeetingTabId: async (): Promise<MeetingTabId> => {
    const raw = await chrome.storage.local.get(["meetingTabId"])
    return (raw.meetingTabId as MeetingTabId | undefined) ?? null
  },

  setMeetingTabId: (id: MeetingTabId): Promise<void> =>
    chrome.storage.local.set({ meetingTabId: id }),

  getCurrentMeetingData: async (): Promise<Partial<LocalState>> => {
    const raw = await chrome.storage.local.get([
      "meetingSoftware", "meetingTitle", "meetingStartTimestamp", "transcript", "chatMessages",
    ])
    return raw as Partial<LocalState>
  },

  setCurrentMeetingData: (data: Partial<Pick<LocalState, "meetingSoftware" | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages">>): Promise<void> =>
    chrome.storage.local.set(data),

  getDeferredUpdatePending: async (): Promise<boolean> => {
    const raw = await chrome.storage.local.get(["isDeferredUpdateAvailable"])
    return !!(raw.isDeferredUpdateAvailable as boolean | undefined)
  },

  setDeferredUpdate: (value: boolean): Promise<void> =>
    chrome.storage.local.set({ isDeferredUpdateAvailable: value }),
}

export const StorageSync = {
  getSettings: async (): Promise<Partial<SyncSettings>> => {
    const raw = await chrome.storage.sync.get([
      "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting",
      "operationMode", "webhookBodyType", "webhookUrl",
    ])
    return raw as Partial<SyncSettings>
  },

  setSettings: (settings: Partial<SyncSettings>): Promise<void> =>
    chrome.storage.sync.set(settings),

  getWebhookSettings: async (): Promise<{ webhookUrl?: string; webhookBodyType?: WebhookBodyType }> => {
    const raw = await chrome.storage.sync.get(["webhookUrl", "webhookBodyType"])
    return raw as { webhookUrl?: string; webhookBodyType?: WebhookBodyType }
  },

  getAutoActionSettings: async (): Promise<{ webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }> => {
    const raw = await chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"])
    return raw as { webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }
  },
}
```

- [ ] **Step 2: Update src/background/meeting-storage.ts**

Change `StorageLocal.saveMeetings(` → `StorageLocal.setMeetings(` (2 occurrences).
Change `StorageSync.getDownloadConfig()` → `StorageSync.getAutoActionSettings()`.

- [ ] **Step 3: Update src/background/webhook.ts**

Change `StorageLocal.saveMeetings(` → `StorageLocal.setMeetings(` (2 occurrences).
Change `StorageSync.getWebhookConfig()` → `StorageSync.getWebhookSettings()`.

- [ ] **Step 4: Update src/background/lifecycle.ts**

Change:
```typescript
if (await StorageLocal.isDeferredUpdateAvailable()) {
```
To:
```typescript
if (await StorageLocal.getDeferredUpdatePending()) {
```

- [ ] **Step 5: Update src/background/event-listeners.ts**

Change `StorageSync.saveSettings(` → `StorageSync.setSettings(`.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/shared/storage-repo.ts src/background/meeting-storage.ts src/background/webhook.ts src/background/lifecycle.ts src/background/event-listeners.ts
git commit -m "refactor: standardize storage-repo verbs (save→set), fix isDeferredUpdateAvailable typo, rename StorageSync getters"
```

---

## Task 4: Rename storage.ts → state-sync.ts and overWriteChromeStorage → persistStateFields

**Goal:** The file name `storage.ts` is too generic and conflicts conceptually with `storage-repo.ts`. The function name `overWriteChromeStorage` is misleading (it syncs in-memory state to storage, not an overwrite in the destructive sense).

**Files:**
- Rename: `src/storage.ts` → `src/state-sync.ts`
- Modify: `src/meeting.ts`
- Modify: `src/observer/transcript-observer.ts`
- Modify: `src/observer/chat-observer.ts`
- Modify: `src/content-google-meet.ts`

- [ ] **Step 1: Create src/state-sync.ts with renamed function**

Create `src/state-sync.ts` with this content (replacing old `src/storage.ts`):

```typescript
import type { ErrorObject } from './types'
import { state, meetingSoftware } from './state'
import { meetingSoftware as meetingSoftwareConst } from './constants'
import { pulseStatus } from './ui'
import { sendMessage } from './shared/messages'

type StorageKey = "meetingSoftware" | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages"

export function persistStateFields(keys: StorageKey[], sendEndMessage: boolean): void {
  const objectToSave: Record<string, unknown> = {}
  if (keys.includes("meetingSoftware")) objectToSave.meetingSoftware = meetingSoftwareConst
  if (keys.includes("meetingTitle")) objectToSave.meetingTitle = state.meetingTitle
  if (keys.includes("meetingStartTimestamp")) objectToSave.meetingStartTimestamp = state.meetingStartTimestamp
  if (keys.includes("transcript")) objectToSave.transcript = state.transcript
  if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages

  chrome.storage.local.set(objectToSave, () => {
    pulseStatus()
    if (sendEndMessage) {
      sendMessage({ type: "meeting_ended" }).then((response) => {
        if (!response.success && typeof response.message === "object") {
          const err = response.message as ErrorObject
          if (err.errorCode === "010") console.error(err.errorMessage)
        }
      })
    }
  })
}

export function recoverLastMeeting(): Promise<string> {
  return sendMessage({ type: "recover_last_meeting" }).then((response) => {
    if (response.success) return "Last meeting recovered successfully or recovery not needed"
    return Promise.reject(response.message)
  })
}
```

- [ ] **Step 2: Delete src/storage.ts**

```bash
rm /Users/nqhuy25/Development/sandbox/meet-transcripts/src/storage.ts
```

- [ ] **Step 3: Update src/meeting.ts import**

Change:
```typescript
import { overWriteChromeStorage } from './storage'
```
To:
```typescript
import { persistStateFields } from './state-sync'
```

Replace all calls: `overWriteChromeStorage(` → `persistStateFields(` throughout the file.

- [ ] **Step 4: Update src/observer/transcript-observer.ts import**

Change:
```typescript
import { overWriteChromeStorage } from '../storage'
```
To:
```typescript
import { persistStateFields } from '../state-sync'
```

Replace all calls: `overWriteChromeStorage(` → `persistStateFields(`.

- [ ] **Step 5: Update src/observer/chat-observer.ts import**

Change:
```typescript
import { overWriteChromeStorage } from '../storage'
```
To:
```typescript
import { persistStateFields } from '../state-sync'
```

Replace all calls: `overWriteChromeStorage(` → `persistStateFields(`.

- [ ] **Step 6: Update src/content-google-meet.ts import**

Change:
```typescript
import { overWriteChromeStorage, recoverLastMeeting } from './storage'
```
To:
```typescript
import { persistStateFields, recoverLastMeeting } from './state-sync'
```

Replace all calls: `overWriteChromeStorage(` → `persistStateFields(`.

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/state-sync.ts src/meeting.ts src/observer/transcript-observer.ts src/observer/chat-observer.ts src/content-google-meet.ts
git commit -m "refactor: rename storage.ts to state-sync.ts, overWriteChromeStorage to persistStateFields"
```

---

## Task 5: Align service method names with underlying background function names

**Goal:** Background function names and service method names must match. Callers in `background/index.ts` use service names, so those drive the final names.

New names:
- `processLastMeeting` (background) → `finalizeMeeting`
- `pickupLastMeetingFromStorage` (background) → `pickupLastMeeting`
- `MeetingService.pickupFromStorage` → `MeetingService.pickupLastMeeting`
- `WebhookService.post` → `WebhookService.postWebhook`
- `DownloadService.download` → `DownloadService.downloadTranscript`

**Files:**
- Modify: `src/background/meeting-storage.ts`
- Modify: `src/services/meeting-service.ts`
- Modify: `src/services/webhook-service.ts`
- Modify: `src/services/download-service.ts`
- Modify: `src/background/index.ts`

- [ ] **Step 1: Update src/background/meeting-storage.ts — rename functions**

Change `export async function processLastMeeting` → `export async function finalizeMeeting`.
Change `export async function pickupLastMeetingFromStorage` → `export async function pickupLastMeeting`.

Inside `finalizeMeeting`, update the call: `await pickupLastMeetingFromStorage()` → `await pickupLastMeeting()`.
Inside `recoverLastMeeting`, update the call: `await processLastMeeting()` → `await finalizeMeeting()`.

- [ ] **Step 2: Update src/services/meeting-service.ts**

```typescript
import { finalizeMeeting, recoverLastMeeting, pickupLastMeeting } from '../background/meeting-storage'

export const MeetingService = {
  finalizeMeeting: (): Promise<string> => finalizeMeeting(),
  recoverMeeting: (): Promise<string> => recoverLastMeeting(),
  pickupLastMeeting: (): Promise<string> => pickupLastMeeting(),
}
```

- [ ] **Step 3: Update src/services/webhook-service.ts**

```typescript
import { postTranscriptToWebhook } from '../background/webhook'

export const WebhookService = {
  postWebhook: (index: number): Promise<string> => postTranscriptToWebhook(index),
}
```

- [ ] **Step 4: Update src/services/download-service.ts**

Change method name `download` → `downloadTranscript`:

```typescript
export const DownloadService = {
  downloadTranscript: async (index: number): Promise<void> => downloadTranscript(index, false),
  // ... rest unchanged
}
```

- [ ] **Step 5: Update src/background/index.ts — callers**

Change `DownloadService.download(` → `DownloadService.downloadTranscript(`.
Change `WebhookService.post(` → `WebhookService.postWebhook(`.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/background/meeting-storage.ts src/services/meeting-service.ts src/services/webhook-service.ts src/services/download-service.ts src/background/index.ts
git commit -m "refactor: align service method names with background function names"
```

---

## Task 6: Fix singular/plural inconsistency in content-scripts.ts

**Goal:** `reRegisterContentScripts` (plural) actually only re-registers the single `google_meet` script. Fix the name to match the behaviour.

**Files:**
- Modify: `src/background/content-scripts.ts`
- Modify: `src/background/event-listeners.ts`

- [ ] **Step 1: Rename in src/background/content-scripts.ts**

Change:
```typescript
export function reRegisterContentScripts(): void {
```
To:
```typescript
export function reRegisterContentScript(): void {
```

- [ ] **Step 2: Update the import in src/background/event-listeners.ts**

Change:
```typescript
import { reRegisterContentScripts } from './content-scripts'
```
To:
```typescript
import { reRegisterContentScript } from './content-scripts'
```

Then change both call sites: `reRegisterContentScripts()` → `reRegisterContentScript()`.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/background/content-scripts.ts src/background/event-listeners.ts
git commit -m "refactor: rename reRegisterContentScripts to reRegisterContentScript (was only ever one script)"
```

---

## Task 7: Rename TranscriptBlock.transcriptText → text and ChatMessage.chatMessageText → text

**Goal:** Field names should not repeat their type. `transcriptText` in `TranscriptBlock` and `chatMessageText` in `ChatMessage` are both redundant prefixes.

**Files:**
- Modify: `src/types.ts`
- Modify: `types/index.js`
- Modify: `src/background/download.ts`
- Modify: `src/background/webhook.ts`
- Modify: `src/observer/chat-observer.ts`

- [ ] **Step 1: Update src/types.ts**

```typescript
export interface TranscriptBlock {
  personName: string
  timestamp: string
  text: string
}

export interface ChatMessage {
  personName: string
  timestamp: string
  text: string
}
```

- [ ] **Step 2: Update types/index.js JSDoc**

```javascript
/**
 * @typedef {Object} TranscriptBlock A chunk of transcript
 * @property {string} personName name of the person who spoke
 * @property {string} timestamp ISO timestamp of when the words were spoken
 * @property {string} text actual transcript text
 */

/**
 * @typedef {Object} ChatMessage A chat message
 * @property {string} personName name of the person who sent the message
 * @property {string} timestamp ISO timestamp of when the message was sent
 * @property {string} text actual message text
 */
```

- [ ] **Step 3: Update src/background/download.ts**

In `getTranscriptString`:
```typescript
export function getTranscriptString(transcript: TranscriptBlock[]): string {
  if (transcript.length === 0) return ""
  return transcript.map(block =>
    `${block.personName} (${new Date(block.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${block.text}\n\n`
  ).join("")
}
```

In `getChatMessagesString`:
```typescript
export function getChatMessagesString(chatMessages: ChatMessage[]): string {
  if (chatMessages.length === 0) return ""
  return chatMessages.map(msg =>
    `${msg.personName} (${new Date(msg.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${msg.text}\n\n`
  ).join("")
}
```

- [ ] **Step 4: Update src/background/webhook.ts — WebhookBody type in src/types.ts**

The `WebhookBody` advanced type still references `TranscriptBlock[]` and `ChatMessage[]` which now have `.text` — no field changes needed there since it passes through the arrays. No changes required in webhook.ts itself.

- [ ] **Step 5: Update src/observer/chat-observer.ts**

Change the `ChatMessage` construction (around line 31):
```typescript
const chatMessageBlock: ChatMessage = { personName, timestamp, text: chatMessageText }
```

- [ ] **Step 6: Update src/observer/transcript-observer.ts — insertGapMarker and pushBufferToTranscript**

In `insertGapMarker`:
```typescript
state.transcript.push({
  personName: "[meet-transcripts]",
  timestamp: new Date().toISOString(),
  text: "[Captions unavailable — tab was not in focus]",
})
```

In `pushBufferToTranscript`:
```typescript
state.transcript.push({
  personName: state.personNameBuffer === "You" ? state.userName : state.personNameBuffer,
  timestamp: state.timestampBuffer,
  text: state.transcriptTextBuffer,
})
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/types.ts types/index.js src/background/download.ts src/observer/chat-observer.ts src/observer/transcript-observer.ts
git commit -m "refactor!: rename TranscriptBlock.transcriptText to text, ChatMessage.chatMessageText to text"
```

---

## Task 8: Rename Meeting, LocalState, and AppState fields — with storage migration

**Goal:** Remove the `meeting` prefix from all fields on `Meeting`, `LocalState` (chrome.storage keys), and `AppState`. Add a backward-compatible migration so existing stored data is not silently lost.

New mapping:
| Old field | New field | Scope |
|---|---|---|
| `meetingSoftware` | `software` | `Meeting`, `LocalState`, `AppState` |
| `meetingTitle` | `title` | `Meeting`, `LocalState`, `AppState` |
| `meetingStartTimestamp` | `startTimestamp` | `Meeting`, `LocalState`, `AppState` |
| `meetingEndTimestamp` | `endTimestamp` | `Meeting` only |

`transcript`, `chatMessages`, `webhookPostStatus` keep their names.

**Files:**
- Modify: `src/types.ts`
- Modify: `src/shared/storage-repo.ts`
- Modify: `src/state.ts`
- Modify: `src/state-sync.ts`
- Modify: `src/meeting.ts`
- Modify: `src/background/meeting-storage.ts`
- Modify: `src/background/download.ts`
- Modify: `src/background/webhook.ts`
- Modify: `types/index.js`
- Modify: `extension/meetings.js`

- [ ] **Step 1: Update src/types.ts — Meeting, WebhookBody, AppState**

```typescript
export interface TranscriptBlock {
  personName: string
  timestamp: string
  text: string
}

export interface ChatMessage {
  personName: string
  timestamp: string
  text: string
}

export type MeetingSoftware = "Google Meet" | "" | undefined
export type MeetingTabId = number | "processing" | null
export type OperationMode = "auto" | "manual"
export type WebhookBodyType = "simple" | "advanced"

export interface Meeting {
  software?: MeetingSoftware
  title?: string
  startTimestamp: string
  endTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  webhookPostStatus: "new" | "failed" | "successful"
}

export type WebhookBody =
  | {
      webhookBodyType: "advanced"
      software: string
      title: string
      startTimestamp: string
      endTimestamp: string
      transcript: TranscriptBlock[]
      chatMessages: ChatMessage[]
    }
  | {
      webhookBodyType: "simple"
      software: string
      title: string
      startTimestamp: string
      endTimestamp: string
      transcript: string
      chatMessages: string
    }

export interface ExtensionStatusJSON {
  status: number
  message: string
  showBetaMessage?: boolean
}

export interface ErrorObject {
  errorCode: string
  errorMessage: string
}

export type ExtensionMessage =
  | { type: "new_meeting_started" }
  | { type: "meeting_ended" }
  | { type: "download_transcript_at_index"; index: number }
  | { type: "post_webhook_at_index"; index: number }
  | { type: "recover_last_meeting" }
  | { type: "open_popup" }

export interface ExtensionResponse {
  success: boolean
  message?: string | ErrorObject
}

export type Platform = "google_meet"

export interface AppState {
  userName: string
  transcript: TranscriptBlock[]
  transcriptTargetBuffer: Element | null
  personNameBuffer: string
  transcriptTextBuffer: string
  timestampBuffer: string
  chatMessages: ChatMessage[]
  startTimestamp: string
  title: string
  isTranscriptDomErrorCaptured: boolean
  isChatMessagesDomErrorCaptured: boolean
  hasMeetingStarted: boolean
  hasMeetingEnded: boolean
  extensionStatusJSON: ExtensionStatusJSON | null
}
```

- [ ] **Step 2: Update src/shared/storage-repo.ts — LocalState + getMeetings migration + getCurrentMeetingData**

The `getMeetings` function must migrate old-format records. The `getCurrentMeetingData` and `setCurrentMeetingData` must use new key names with backward-compat reads.

Replace `src/shared/storage-repo.ts` entirely:

```typescript
import type { Meeting, MeetingTabId, MeetingSoftware, TranscriptBlock, ChatMessage, OperationMode, WebhookBodyType } from '../types'

export interface LocalState {
  meetingTabId: MeetingTabId
  software: MeetingSoftware
  title: string
  startTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  isDeferredUpdateAvailable: boolean
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

export const StorageLocal = {
  getMeetings: async (): Promise<Meeting[]> => {
    const raw = await chrome.storage.local.get(["meetings"])
    const meetings = (raw.meetings as Record<string, unknown>[] | undefined) ?? []
    return meetings.map(migrateMeeting)
  },

  setMeetings: (meetings: Meeting[]): Promise<void> =>
    chrome.storage.local.set({ meetings }),

  getMeetingTabId: async (): Promise<MeetingTabId> => {
    const raw = await chrome.storage.local.get(["meetingTabId"])
    return (raw.meetingTabId as MeetingTabId | undefined) ?? null
  },

  setMeetingTabId: (id: MeetingTabId): Promise<void> =>
    chrome.storage.local.set({ meetingTabId: id }),

  getCurrentMeetingData: async (): Promise<Partial<LocalState>> => {
    const raw = await chrome.storage.local.get([
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
    chrome.storage.local.set(data),

  getDeferredUpdatePending: async (): Promise<boolean> => {
    const raw = await chrome.storage.local.get(["isDeferredUpdateAvailable"])
    return !!(raw.isDeferredUpdateAvailable as boolean | undefined)
  },

  setDeferredUpdate: (value: boolean): Promise<void> =>
    chrome.storage.local.set({ isDeferredUpdateAvailable: value }),
}

export const StorageSync = {
  getSettings: async (): Promise<Partial<SyncSettings>> => {
    const raw = await chrome.storage.sync.get([
      "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting",
      "operationMode", "webhookBodyType", "webhookUrl",
    ])
    return raw as Partial<SyncSettings>
  },

  setSettings: (settings: Partial<SyncSettings>): Promise<void> =>
    chrome.storage.sync.set(settings),

  getWebhookSettings: async (): Promise<{ webhookUrl?: string; webhookBodyType?: WebhookBodyType }> => {
    const raw = await chrome.storage.sync.get(["webhookUrl", "webhookBodyType"])
    return raw as { webhookUrl?: string; webhookBodyType?: WebhookBodyType }
  },

  getAutoActionSettings: async (): Promise<{ webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }> => {
    const raw = await chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"])
    return raw as { webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }
  },
}
```

- [ ] **Step 3: Update src/state.ts — rename meetingTitle and meetingStartTimestamp in AppState initializer**

```typescript
export const state: AppState = {
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
  extensionStatusJSON: null,
}
```

- [ ] **Step 4: Update src/state-sync.ts — StorageKey type and field accesses**

```typescript
type StorageKey = "software" | "title" | "startTimestamp" | "transcript" | "chatMessages"

export function persistStateFields(keys: StorageKey[], sendEndMessage: boolean): void {
  const objectToSave: Record<string, unknown> = {}
  if (keys.includes("software")) objectToSave.software = meetingSoftwareConst
  if (keys.includes("title")) objectToSave.title = state.title
  if (keys.includes("startTimestamp")) objectToSave.startTimestamp = state.startTimestamp
  if (keys.includes("transcript")) objectToSave.transcript = state.transcript
  if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages
  // ... rest unchanged
}
```

- [ ] **Step 5: Update all persistStateFields call sites in src/**

In `src/content-google-meet.ts`:
```typescript
persistStateFields(["software", "startTimestamp", "title", "transcript", "chatMessages"], false)
```

In `src/meeting.ts` — replace all key name string arguments:
- `["meetingTitle"]` → `["title"]`
- `["meetingStartTimestamp"]` → `["startTimestamp"]`

Also update field accesses:
- `state.meetingTitle` → `state.title`
- `state.meetingStartTimestamp` → `state.startTimestamp`

- [ ] **Step 6: Update src/background/meeting-storage.ts — Meeting construction**

Change the `newEntry` object in `pickupLastMeeting`:
```typescript
const newEntry: Meeting = {
  software: data.software ?? "",
  title: data.title,
  startTimestamp: data.startTimestamp!,
  endTimestamp: new Date().toISOString(),
  transcript: data.transcript ?? [],
  chatMessages: data.chatMessages ?? [],
  webhookPostStatus: "new",
}
```

Update the guard:
```typescript
if (!data.startTimestamp) {
  throw { errorCode: ErrorCode.NO_MEETINGS, errorMessage: "No meetings found. May be attend one?" }
}
```

Also update field reference in `recoverLastMeeting`:
```typescript
if (!data.startTimestamp) { ... }
if (!lastSaved || data.startTimestamp !== lastSaved.startTimestamp) { ... }
```

- [ ] **Step 7: Update src/background/download.ts — Meeting field accesses**

```typescript
let sanitisedTitle = "Meeting"
if (meeting.title) {
  sanitisedTitle = meeting.title.replaceAll(invalidFilenameRegex, "_")
}

const timestamp = new Date(meeting.startTimestamp)
const prefix = meeting.software ? `${meeting.software} transcript` : "Transcript"
```

- [ ] **Step 8: Update src/background/webhook.ts — Meeting field accesses and WebhookBody construction**

```typescript
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

- [ ] **Step 9: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors. Fix any remaining field access errors the compiler surfaces.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/shared/storage-repo.ts src/state.ts src/state-sync.ts src/meeting.ts src/background/meeting-storage.ts src/background/download.ts src/background/webhook.ts
git commit -m "refactor!: rename Meeting/LocalState/AppState fields (meetingTitle→title, meetingStartTimestamp→startTimestamp, etc.), add storage migration"
```

---

## Task 9: Update types/index.js and extension/meetings.js for breaking field renames

**Goal:** The plain JS layer uses its own JSDoc typedefs and directly reads Meeting fields from chrome.storage. These must match the new field names from Task 8.

**Files:**
- Modify: `types/index.js`
- Modify: `extension/meetings.js`

- [ ] **Step 1: Update types/index.js JSDoc typedef for Meeting**

```javascript
/**
 * @typedef {Object} Meeting
 * @property {MeetingSoftware} [software]
 * @property {string | undefined} [title] title of the meeting
 * @property {string} startTimestamp ISO timestamp of when the meeting started
 * @property {string} endTimestamp ISO timestamp of when the meeting ended
 * @property {TranscriptBlock[] | []} transcript array containing transcript blocks from the meeting
 * @property {ChatMessage[] | []} chatMessages array containing chat messages from the meeting
 * @property {"new" | "failed" | "successful"} webhookPostStatus status of the webhook post request
 */
```

Update `ResultLocal` typedef:
```javascript
/**
 * @typedef {Object} ResultLocal Local chrome storage
 * @property {ExtensionStatusJSON} extensionStatusJSON
 * @property {MeetingTabId} meetingTabId
 * @property {MeetingSoftware} software
 * @property {string} title
 * @property {string} startTimestamp
 * @property {TranscriptBlock[]} transcript
 * @property {ChatMessage[]} chatMessages
 * @property {boolean | undefined} isDeferredUpdateAvailable
 * @property {Meeting[] | undefined} meetings
 */
```

Update `IsDeferredUpdatedAvailable` typedef (rename the typedef itself):
```javascript
/**
 * @typedef {boolean} IsDeferredUpdateAvailable whether the extension has a deferred update waiting to be applied
 */
```

- [ ] **Step 2: Update extension/meetings.js — field accesses in loadMeetings()**

Change `meeting.meetingStartTimestamp` → `meeting.startTimestamp` (2 occurrences including `getDuration` call).
Change `meeting.meetingEndTimestamp` → `meeting.endTimestamp` (inside `getDuration` call).
Change `meeting.meetingSoftware` → `meeting.software`.
Change `meeting.meetingTitle || meeting.title` → `meeting.title` (the backward-compat fallback can be dropped now that migration runs on read).

The title line becomes:
```javascript
titleDiv.textContent = meeting.title || "Google Meet call"
```

- [ ] **Step 3: Update extension/meetings.js — title rename on blur**

Change:
```javascript
const updatedMeeting = /** @type {Meeting} */ {
    ...meeting,
    meetingTitle: titleDiv.innerText
}
```
To:
```javascript
const updatedMeeting = /** @type {Meeting} */ {
    ...meeting,
    title: titleDiv.innerText
}
```

- [ ] **Step 4: Update getDuration function signature and body**

```javascript
/**
 * @param {string} startTimestamp - ISO timestamp
 * @param {string} endTimestamp - ISO timestamp
 */
function getDuration(startTimestamp, endTimestamp) {
    const duration = new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}
```

Update the call site:
```javascript
const timestamp = new Date(meeting.startTimestamp).toLocaleString()
const durationString = getDuration(meeting.startTimestamp, meeting.endTimestamp)
```

- [ ] **Step 5: Run build + test**

```bash
npm run build
npm test
```
Expected: build succeeds, all Playwright tests pass.

- [ ] **Step 6: Commit**

```bash
git add types/index.js extension/meetings.js
git commit -m "refactor!: update JS layer (types/index.js, meetings.js) for renamed Meeting fields"
```

---

## Self-Review

**Spec coverage:**
- ✅ `extensionStatusJSON_bug` renamed → `bugStatusJson` (Task 1)
- ✅ ErrorCode constants used everywhere (Task 2)
- ✅ Storage key typo `isDeferredUpdatedAvailable` fixed (Task 3)
- ✅ Write verb standardized: `save` → `set` (Task 3)
- ✅ Predicate renamed: `isDeferredUpdateAvailable` → `getDeferredUpdatePending` (Task 3)
- ✅ StorageSync getters renamed: `getWebhookConfig` → `getWebhookSettings`, `getDownloadConfig` → `getAutoActionSettings` (Task 3)
- ✅ `storage.ts` → `state-sync.ts`, `overWriteChromeStorage` → `persistStateFields` (Task 4)
- ✅ Service method names aligned with background functions (Task 5)
- ✅ `reRegisterContentScripts` → `reRegisterContentScript` (Task 6)
- ✅ `TranscriptBlock.transcriptText` → `text`, `ChatMessage.chatMessageText` → `text` (Task 7)
- ✅ `Meeting.meetingTitle` → `title`, `meetingStartTimestamp` → `startTimestamp`, `meetingEndTimestamp` → `endTimestamp`, `meetingSoftware` → `software` with storage migration (Tasks 8–9)
- ✅ `LocalState` and `AppState` fields aligned (Task 8)
- ✅ `WebhookBody` fields renamed (Task 8)
- ✅ `types/index.js` JSDoc updated (Task 9)
- ✅ `extension/meetings.js` updated (Task 9)

**Placeholder scan:** No TBDs, all steps contain concrete code.

**Type consistency:** `Meeting.title`, `LocalState.title`, `AppState.title` all use the same name. `startTimestamp`/`endTimestamp` consistent across `Meeting`, `LocalState`, `AppState`, `WebhookBody`. `TranscriptBlock.text` and `ChatMessage.text` consistent across all usages.
