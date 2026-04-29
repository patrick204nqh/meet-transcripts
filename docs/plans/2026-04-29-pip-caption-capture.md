# PiP Caption Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Google Meet captions while the meeting is showing in a Document Picture-in-Picture window (when the user has switched to another tab).

**Architecture:** Listen for `window.documentPictureInPicture` `enter` and `leave` events in the content script. When PiP opens, attach a `MutationObserver` to the caption container *inside the PiP window's document* and pipe entries into the same `state.transcript` array. When PiP closes, disconnect the PiP observer and let the existing `captionWatchdog` re-attach the main-tab observer.

**Tech Stack:** TypeScript, Chrome MV3 content script, Document Picture-in-Picture API (Chrome 116+).

---

## Why this is a separate plan from `2026-04-29-meeting-lifecycle-resilience`

The lifecycle plan addressed *meeting end detection* across exit paths (click, tab close, navigation). The captions-during-tab-switch problem is a *different* scenario:

- The meeting is still active.
- The user has switched tabs.
- Chrome/Meet has opened a separate PiP window for the call.
- Captions are rendered in the **PiP window's document** (a separate browsing context), not in the main tab.
- Our content script lives in the main tab and cannot observe the PiP document via standard DOM APIs.

The existing `captionWatchdog` + `insertGapMarker` infrastructure (`mini-window-resilience.md`) handles the case where Meet collapses captions **inside the same tab**. It does not — and cannot — see into a separate PiP document.

---

## Discovery prerequisites (Phase 0 — MANUAL, BEFORE WRITING ANY CODE)

This plan cannot be fully specified until we know:

**1. Does Meet actually use the Document Picture-in-Picture API?**

Open a Meet call in Chrome 116+. Switch to another tab. Observe the small floating window:
- If it's a **separate OS-level window** (lives outside the Chrome window, has its own title bar) → Document PiP. ✅ This plan applies.
- If it's a **Chrome browser window in compact mode** (still inside Chrome's tab strip area, snaps to a corner) → likely Meet's older companion mode, NOT Document PiP. This plan does NOT apply — different approach needed.

**2. What's the caption DOM in the PiP document?**

Open Chrome DevTools, focus the PiP window's inspector context (DevTools dropdown shows `Top` and the PiP window separately). Inspect:
- Selector for the captions live region (likely similar to `div[role="region"][tabindex="0"]` but may differ)
- Selector for individual transcript blocks (likely `.iOzk7.uYs2ee` or `.nMcdL.bj4p3b` — confirm)
- Selector for speaker name (likely `.KcIKyf.jxFHg`)
- Selector for transcript text (likely `.bh44bd.VbkSUe`)

Capture these selectors. They may be **identical** to the main-tab selectors (Meet may share UI), or they may **differ** (Meet may render a stripped-down PiP UI).

**3. Does the PiP `Window` object expose its `document` to same-origin content scripts?**

Test in DevTools console (in main tab):

```javascript
documentPictureInPicture.window?.document
```

If it returns the document, we can attach observers. If it throws or returns null, we need a different approach (e.g., postMessage to PiP window).

**Until Phase 0 results are documented, do not start Phase 1.** Update this plan with the answers, then proceed.

---

## File map

| Action | File | What changes |
|--------|------|-------------|
| Create | `src/content/pip-capture.ts` | New module: PiP enter/leave listener, PiP-side observer attach/detach |
| Modify | `src/content/google-meet.ts` | Initialize PiP capture alongside existing `meetingRoutines` |
| Modify | `src/content/observer/transcript-observer.ts` | Refactor `transcriptMutationCallback` to accept a `Document` parameter (so it can read from either main or PiP doc) — or extract the parse logic into a doc-agnostic function |
| Modify | `src/content/state.ts` | Add `pipObserverAttached: boolean` flag to `AppState` |
| Modify | `src/types.ts` | Add `pipObserverAttached` to `AppState` |

No changes to background, services, shared, or storage layers — this is purely a content-script DOM concern.

---

## Task 1: Phase 0 discovery and plan update

**Files:**
- Modify: `docs/plans/2026-04-29-pip-caption-capture.md` (this file)

- [ ] **Step 1: Verify PiP type in Chrome**

Manually test:
1. Open `chrome://version` — confirm Chrome ≥ 116
2. Join any Meet call
3. Switch to another tab
4. Observe the floating window
5. Right-click it — if there's a "Show Picture-in-Picture" or similar OS-level menu, it's Document PiP

Document the answer here:

```
Document PiP confirmed: [Y / N]
If N, what type: [_______________]
If N: this plan does not apply, see follow-up plan: [_______________]
```

- [ ] **Step 2: Document the PiP caption DOM selectors**

With Meet PiP open and the call active:
1. Open DevTools
2. In the device toolbar / context dropdown, switch to the PiP window's context
3. In Elements panel, find the captions container
4. Record the exact selectors below

```
Caption container selector: [_______________]
Transcript block selector:  [_______________]
Speaker name selector:      [_______________]
Transcript text selector:   [_______________]

Are these identical to main-tab selectors? [Y / N]
```

- [ ] **Step 3: Verify same-origin access to PiP document**

In the main tab's DevTools console while PiP is open:

```javascript
const pipWin = documentPictureInPicture.window
console.log({
  hasWindow: !!pipWin,
  hasDocument: !!pipWin?.document,
  bodyChildren: pipWin?.document?.body?.children?.length,
})
```

Expected: `hasWindow: true, hasDocument: true, bodyChildren: > 0`. Document the result:

```
Same-origin access works: [Y / N]
If N, error message: [_______________]
```

- [ ] **Step 4: Commit Phase 0 results**

```bash
cd /Users/nqhuy25/Development/sandbox/meet-transcripts
git add docs/plans/2026-04-29-pip-caption-capture.md
git commit -m "docs(plan): record Phase 0 discovery for PiP caption capture"
```

**Gate:** If any of the three discovery items returns "N" or unexpected results, STOP and revise the plan. Do not proceed to Task 2.

---

## Task 2: Refactor `transcript-observer.ts` to be document-agnostic

**Files:**
- Modify: `src/content/observer/transcript-observer.ts`

**Why:** `transcriptMutationCallback` currently uses globals like `document.querySelectorAll(...)` implicitly via closures. To run the same parser inside the PiP document, the parser must accept a `Document` parameter (or operate on a passed-in root element).

- [ ] **Step 1: Read the current file**

```bash
cat -n /Users/nqhuy25/Development/sandbox/meet-transcripts/src/content/observer/transcript-observer.ts
```

- [ ] **Step 2: Identify all uses of `document` in `transcriptMutationCallback`**

Look for: `document.querySelector`, `document.body`, etc. The current implementation operates on `mutation.target` so it may already be document-agnostic. Confirm.

- [ ] **Step 3: If parser is already doc-agnostic, no code change — only verify**

Run typecheck and tests:
```bash
cd /Users/nqhuy25/Development/sandbox/meet-transcripts && npm run typecheck && npm test 2>&1 | tail -10
```

Expected: 43 passing, no errors.

- [ ] **Step 4: If parser uses `document` directly, extract that to a parameter**

Change signature from `transcriptMutationCallback(mutationsList)` to accept a doc context, OR refactor the document access to use `mutation.target.ownerDocument` (which gives the correct document for any mutation).

- [ ] **Step 5: Commit (only if changes were needed)**

```bash
git add src/content/observer/transcript-observer.ts
git commit -m "refactor(content): make transcriptMutationCallback document-agnostic for PiP capture"
```

---

## Task 3: Add `pipObserverAttached` to state

**Files:**
- Modify: `src/types.ts`
- Modify: `src/content/state.ts`

- [ ] **Step 1: Add field to `AppState` in `src/types.ts`**

In the `AppState` interface, add:

```typescript
  pipObserverAttached: boolean
```

Place it after `hasMeetingEnded: boolean`.

- [ ] **Step 2: Initialize in `src/content/state.ts`**

In the `state` object literal, add:

```typescript
  pipObserverAttached: false,
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/nqhuy25/Development/sandbox/meet-transcripts && npm run typecheck 2>&1 | grep "error TS"
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/content/state.ts
git commit -m "feat(state): add pipObserverAttached flag for PiP capture lifecycle"
```

---

## Task 4: Create `src/content/pip-capture.ts`

**Files:**
- Create: `src/content/pip-capture.ts`

> **Placeholder values to replace with Phase 0 results:**
> - `<<PIP_CAPTION_SELECTOR>>` — caption container selector inside PiP doc (e.g. `'div[role="region"][tabindex="0"]'`)

- [ ] **Step 1: Create the file with this content (replace placeholders with Phase 0 selectors)**

```typescript
import { state } from './state'
import { mutationConfig } from './constants'
import { transcriptMutationCallback } from './observer/transcript-observer'
import { insertGapMarker } from './observer/transcript-observer'

const PIP_CAPTION_SELECTOR = `<<PIP_CAPTION_SELECTOR>>`  // From Phase 0 discovery

let pipObserver: MutationObserver | undefined

interface DocumentPictureInPictureEvent extends Event {
  window: Window
}

interface DocumentPictureInPictureLike extends EventTarget {
  window: Window | null
}

function attachPipObserver(pipDoc: Document): void {
  if (state.pipObserverAttached) return

  // Wait for caption container in PiP doc — Meet may render asynchronously
  const findAndAttach = (): boolean => {
    const captionEl = pipDoc.querySelector(PIP_CAPTION_SELECTOR)
    if (!captionEl) return false
    pipObserver = new MutationObserver(transcriptMutationCallback)
    pipObserver.observe(captionEl, mutationConfig)
    state.pipObserverAttached = true
    state.transcriptTargetBuffer = captionEl
    insertGapMarker()  // Mark resumption from gap
    return true
  }

  if (findAndAttach()) return

  // If not yet present, observe pipDoc.body for additions
  const bootstrapObserver = new MutationObserver(() => {
    if (findAndAttach()) bootstrapObserver.disconnect()
  })
  bootstrapObserver.observe(pipDoc.body, { childList: true, subtree: true })
}

function detachPipObserver(): void {
  pipObserver?.disconnect()
  pipObserver = undefined
  state.pipObserverAttached = false
}

export function initializePipCapture(): void {
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPictureLike }).documentPictureInPicture
  if (!dpip) {
    console.log("Document Picture-in-Picture not supported — PiP capture disabled")
    return
  }

  dpip.addEventListener("enter", (event: Event) => {
    if (state.hasMeetingEnded) return
    const pipEvent = event as DocumentPictureInPictureEvent
    const pipDoc = pipEvent.window.document
    attachPipObserver(pipDoc)
  })

  dpip.addEventListener("leave", () => {
    detachPipObserver()
    insertGapMarker()  // Mark return-to-main-tab
  })
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/nqhuy25/Development/sandbox/meet-transcripts && npm run typecheck 2>&1 | grep "error TS"
```

Expected: zero errors. If `documentPictureInPicture` is not in `@types/chrome` or default DOM types, the cast `as unknown as { ... }` handles it.

- [ ] **Step 3: Commit**

```bash
git add src/content/pip-capture.ts
git commit -m "feat(content): add PiP caption capture module"
```

---

## Task 5: Wire `initializePipCapture` into `google-meet.ts`

**Files:**
- Modify: `src/content/google-meet.ts`

- [ ] **Step 1: Add import**

At the top of `src/content/google-meet.ts`, add:

```typescript
import { initializePipCapture } from './pip-capture'
```

- [ ] **Step 2: Call after `meetingRoutines(2)`**

Find this block in the file:

```typescript
  if (state.extensionStatusJSON?.status === 200) {
    // ...
    meetingRoutines(2)
  } else {
    showNotification(state.extensionStatusJSON)
  }
```

Add `initializePipCapture()` after `meetingRoutines(2)`:

```typescript
  if (state.extensionStatusJSON?.status === 200) {
    // ...
    meetingRoutines(2)
    initializePipCapture()
  } else {
    showNotification(state.extensionStatusJSON)
  }
```

- [ ] **Step 3: Run typecheck and build**

```bash
cd /Users/nqhuy25/Development/sandbox/meet-transcripts && npm run typecheck && npm run build 2>&1 | tail -5
```

Expected: zero errors, builds successfully.

- [ ] **Step 4: Commit**

```bash
git add src/content/google-meet.ts
git commit -m "feat(content): wire PiP caption capture into content script entry"
```

---

## Task 6: Update `handleMeetingEnd` to also detach PiP observer

**Files:**
- Modify: `src/content/meeting-session.ts`

- [ ] **Step 1: Find the `handleMeetingEnd` function**

It currently disconnects three observers: `transcriptObserver`, `chatMessagesObserver`, `captionWatchdog`. Add the PiP observer.

- [ ] **Step 2: Export `detachPipObserver` from `pip-capture.ts`**

In `src/content/pip-capture.ts`, change:
```typescript
function detachPipObserver(): void {
```
to:
```typescript
export function detachPipObserver(): void {
```

- [ ] **Step 3: Import and call from `handleMeetingEnd`**

In `src/content/meeting-session.ts`:

Add to imports:
```typescript
import { detachPipObserver } from './pip-capture'
```

Inside `handleMeetingEnd`, add this line after the existing observer disconnects:
```typescript
      detachPipObserver()
```

- [ ] **Step 4: Run typecheck, build, test**

```bash
cd /Users/nqhuy25/Development/sandbox/meet-transcripts && npm run typecheck && npm run build && npm test 2>&1 | tail -10
```

Expected: zero errors, 43 tests pass (no new tests required for this task — manual verification covers it).

- [ ] **Step 5: Commit**

```bash
git add src/content/meeting-session.ts src/content/pip-capture.ts
git commit -m "feat(content): detach PiP observer on meeting end"
```

---

## Task 7: Manual verification

This change has no automated test — Playwright cannot reliably trigger Document PiP. Manual smoke test is required.

- [ ] **Step 1: Reload the extension**

1. `npm run build`
2. `chrome://extensions` → reload Meet Transcripts
3. Hard refresh any open Meet tabs (Cmd+Shift+R)

- [ ] **Step 2: Test the happy path**

1. Join a Meet call with captions enabled
2. Have the other party say a few sentences (or use Meet's "test in lobby" with a test caption source)
3. Switch to another tab — verify Chrome opens the PiP window
4. Have the other party say more sentences (audible in PiP, captions visible in PiP)
5. Switch back to the Meet tab
6. Continue the call for a bit
7. End the call

- [ ] **Step 3: Verify the exported transcript**

Open the downloaded `.txt` file. Expected structure:

```
[Names and timestamps from BEFORE the tab switch]

[meet-transcripts] (timestamp)
[Captions unavailable — tab was not in focus]

[Names and timestamps from DURING the PiP window — THIS IS THE NEW BEHAVIOR]

[meet-transcripts] (timestamp)
[Captions unavailable — tab was not in focus]

[Names and timestamps from AFTER returning to the tab]
```

If the **DURING** section contains real captions captured from the PiP window — success.
If the **DURING** section is missing or empty — the PiP observer didn't attach. Debug:
- DevTools console in PiP window: any errors?
- DevTools console in main tab: did the `enter` event fire?
- Inspect the PiP DOM — does the caption selector still match?

- [ ] **Step 4: Test edge cases**

| Scenario | Expected |
|----------|---------|
| Open PiP, close PiP without ending call | Resume captures in main tab; gap markers around the PiP period |
| End call from inside PiP | Meeting finalizes via `tabs.onUpdated` (RC-3 fix from prior plan); transcript exported |
| Open PiP, end call from main tab while PiP still open | Same as click-to-end path; PiP observer disconnected by `handleMeetingEnd` |
| Chrome version < 116 | `console.log("Document Picture-in-Picture not supported — PiP capture disabled")` appears, no errors |

- [ ] **Step 5: Document results in a follow-up commit (if needed)**

If selectors or behavior need adjusting after testing, fix in `pip-capture.ts`, commit with `fix(content): adjust PiP capture for [specific issue]`.

---

## Self-review checklist

**Spec coverage:**
- [x] PiP enter event handled → Task 4
- [x] PiP leave event handled → Task 4
- [x] Caption observer attached in PiP doc → Task 4
- [x] Gap markers around PiP period → Task 4 (in `attachPipObserver` and `leave` handler)
- [x] Meeting-end teardown disconnects PiP observer → Task 6
- [x] State tracking (`pipObserverAttached`) → Task 3
- [x] Phase 0 discovery before any code → Task 1

**Placeholder scan:**
- `<<PIP_CAPTION_SELECTOR>>` in Task 4 is intentional — replaced with Phase 0 result.
- Phase 0 answer fields in Task 1 are intentional — filled in during discovery.

**Type consistency:**
- `pipObserverAttached: boolean` defined in Task 3, set in Task 4
- `detachPipObserver` function defined in Task 4, exported in Task 6, called in Task 6
- `initializePipCapture` exported from `pip-capture.ts` in Task 4, imported in Task 5

---

## Risks and known limitations

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Meet's PiP DOM differs significantly from main tab — selectors don't match | Medium | Phase 0 captures the exact selectors before Task 4. Plan revision if needed. |
| Cross-document MutationObserver doesn't fire | Low | Same-origin access verified in Phase 0. If this fails, plan is invalidated and a postMessage-based approach is needed. |
| Chrome < 116 users see no PiP capture | n/a (graceful degradation) | `if (!dpip) { console.log; return }` skips initialization cleanly. |
| PiP DOM also includes chat — scope creep | Low | Out of scope for this plan. Add a follow-up if requested. |
| Meet changes its caption DOM in PiP | Existing risk | Same as the existing main-tab selector fragility. Add to the existing CONTRIBUTING.md note about Google Meet DOM changes. |

---

## Out of scope

- **Chat messages in PiP** — Meet's PiP UI may not show chat at all. Even if it does, this plan focuses on captions only. Address in a follow-up if requested.
- **Chrome's per-element PiP** (the older `requestPictureInPicture()` for `<video>` elements) — Meet does not appear to use this; if confirmed, no change needed.
- **Firefox/Safari support** — extension is Chrome-only.
- **Recording the PiP video stream** — out of scope; this plan is about captions only.
