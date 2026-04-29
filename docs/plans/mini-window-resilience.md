# Plan: Mini Window / Tab-Switch Resilience

## Problem

When a user switches away from the Google Meet tab, Meet transitions its UI into a compact
"mini player" mode. In doing so, it **removes the live caption DOM tree** — specifically the
`div[role="region"][tabindex="0"]` container that `transcriptObserver` is attached to.

The current architecture attaches `transcriptObserver` once at meeting start and never
re-attaches. When Meet tears down and then re-renders the caption container (i.e., the user
switches back), the observer is attached to a detached, dead node. **All captions during that
window are silently lost.**

The same applies to the chat container (`div[aria-live="polite"].Ge9Kpc`), though Meet is
less aggressive about removing it.

---

## Root Cause

`meetingRoutines()` calls `waitForElement()` exactly once, then calls `.observe()` on the
returned node. There is no code to:

- Detect when the observed node is removed from the DOM
- Re-attach the observer when the node is re-added
- Log or mark a gap in the transcript when captions were unavailable

---

## Proposed Solution

Three targeted additions to `content-google-meet.js`, all scoped inside the
`waitForElement(meetingEndIconData...)` `.then()` closure so they share the existing
`hasMeetingEnded` and `transcript` state:

### 1. Extract `attachTranscriptObserver(node)`

Pull the observer creation and `.observe()` call into a named function. This allows both the
initial attach and any re-attach to share identical setup logic without duplication.

```js
function attachTranscriptObserver(targetNode) {
  transcriptObserver = new MutationObserver(transcriptMutationCallback)
  transcriptObserver.observe(targetNode, mutationConfig)
}
```

### 2. Caption container watchdog

After `transcriptObserver` is first attached, start a secondary observer on a stable ancestor
(the nearest element that Meet does NOT remove during mini mode — to be confirmed by manual
test, likely `document.body` or the top-level meeting container). It watches for the caption
container being re-added, then re-attaches the transcript observer.

```js
const captionSelector = `div[role="region"][tabindex="0"]`

const captionWatchdog = new MutationObserver(() => {
  if (hasMeetingEnded) return
  const captionEl = document.querySelector(captionSelector)
  if (captionEl && !captionEl.isConnected) return  // still detached
  if (captionEl && transcriptObserver) {
    // node re-appeared — re-attach
    transcriptObserver.disconnect()
    attachTranscriptObserver(captionEl)
    insertGapMarker()  // see §3
  }
})

captionWatchdog.observe(document.body, { childList: true, subtree: true })
```

Disconnect `captionWatchdog` alongside the other observers on meeting end.

### 3. Gap marker in transcript

When the observer re-attaches after a gap, push a synthetic block that makes the gap explicit
in the saved transcript rather than silently missing:

```js
function insertGapMarker() {
  transcript.push({
    personName: "[meet-transcripts]",
    timestamp: new Date().toISOString(),
    transcriptText: "[Captions unavailable — tab was not in focus]"
  })
  overWriteChromeStorage(["transcript"], false)
}
```

### 4. `visibilitychange` listener (secondary guard)

On tab-restore, check whether the caption node is present and whether `transcriptObserver`
still has a live target. If not, trigger `waitForElement` + re-attach as a fallback path for
cases where the watchdog may have missed a mutation.

```js
document.addEventListener("visibilitychange", () => {
  if (hasMeetingEnded || !hasMeetingStarted) return
  if (!document.hidden) {
    const captionEl = document.querySelector(captionSelector)
    if (captionEl && /* observer target is detached */ !transcriptTargetBuffer?.isConnected) {
      transcriptObserver?.disconnect()
      attachTranscriptObserver(captionEl)
      insertGapMarker()
    }
  }
})
```

---

## Implementation Steps

| # | Task | File | Notes |
|---|------|------|-------|
| 1 | Refactor transcript observer init into `attachTranscriptObserver(node)` | `content-google-meet.js` | No behaviour change, pure refactor |
| 2 | Add `captionWatchdog` after initial attach | `content-google-meet.js` | Disconnect on meeting end |
| 3 | Add `insertGapMarker()` helper | `content-google-meet.js` | Sentinel speaker name `[meet-transcripts]` |
| 4 | Add `visibilitychange` listener | `content-google-meet.js` | After `hasMeetingStarted = true` |
| 5 | Update `hasMeetingEnded` teardown to also disconnect `captionWatchdog` | `content-google-meet.js` | Prevent watchdog firing after call ends |
| 6 | Manual test: switch tabs during active Meet, verify re-attach and gap marker | — | Must test before PR |
| 7 | Write Playwright test: simulate tab visibility change, assert gap marker in transcript | `tests/` | Can be done after manual verification |

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| `document.body` watchdog fires constantly (high-mutation Meet DOM) | Medium | Guard with `document.querySelector(captionSelector)` check before acting; only act when node connectivity changes |
| Watchdog fires during normal Meet DOM updates (not mini mode), causing spurious re-attaches | Low | `transcriptTargetBuffer?.isConnected` check ensures we only re-attach when the node is truly detached |
| Gap marker format breaks downstream webhook consumers | Low | Sentinel speaker name `[meet-transcripts]` is distinctive; document in README |
| Meet changes the selector for the caption container | Existing risk | No change to existing selector — this plan adds no new selectors |
| Double gap markers if both watchdog and visibilitychange fire simultaneously | Low | Debounce with a `isReattaching` boolean flag, cleared after attach |

---

## Out of Scope

- PiP (Picture-in-Picture) via the browser's native PiP API — Meet's mini player is a Meet
  UI construct, not the Web PiP API. Native PiP would require a different detection path.
- Chat observer resilience — the chat container appears more stable; address in a follow-up
  if confirmed broken.
- Background tab audio capture — not feasible in a content script context.

---

## Definition of Done

- [ ] Switching tabs during an active meeting and switching back produces a gap marker in
      the transcript, followed by resumed captions
- [ ] No duplicate gap markers when both watchdog and visibilitychange fire
- [ ] Meeting end teardown disconnects all three observers cleanly
- [ ] Existing Playwright tests continue to pass
- [ ] Manual test documented in PR description
