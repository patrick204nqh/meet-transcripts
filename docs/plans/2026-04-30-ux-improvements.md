# UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical regressions from the protocol version gate, apply accessibility quick wins, replace native browser dialogs with inline UI, and add dynamic popup status awareness.

**Architecture:** Three independent phases. Phase 1 (bugs) must land first — it restores broken meetings.js functionality. Phases 2 and 3 are independent of each other and can be sequenced or run in parallel. All changes are to the static files in `extension/` (not compiled from TypeScript).

**Tech Stack:** Vanilla JS, plain HTML/CSS. No framework. `chrome.storage` + `chrome.runtime` for extension messaging. `PROTOCOL_VERSION = 1` defined in `src/shared/protocol.ts` — the `v` field must match this in all messages.

---

## Phase 1 — Critical Bug Fixes

### Task 1: Add protocol version field to all messages in meetings.js

The architecture refactor added a version gate to `src/background/message-handler.ts`. Any message without `v: 1` is rejected. `extension/meetings.js` was not updated — so Recover, Download, and Post Webhook all silently fail.

**Files:**
- Modify: `extension/meetings.js:38–45` (recover message)
- Modify: `extension/meetings.js:318–326` (download message)
- Modify: `extension/meetings.js:345–354` (post webhook message)

- [ ] **Step 1: Fix the recover_last_meeting message**

In `extension/meetings.js`, find the block around line 38 and change:
```js
// BEFORE
/** @type {ExtensionMessage} */
const message = {
    type: "recover_last_meeting",
}
```
To:
```js
// AFTER
/** @type {ExtensionMessage} */
const message = {
    v: 1,
    type: "recover_last_meeting",
}
```

- [ ] **Step 2: Fix the download_transcript_at_index message**

Around line 318:
```js
// BEFORE
const message = {
    type: "download_transcript_at_index",
    index: i
}
```
To:
```js
// AFTER
const message = {
    v: 1,
    type: "download_transcript_at_index",
    index: i
}
```

- [ ] **Step 3: Fix the post_webhook_at_index message**

Around line 345:
```js
// BEFORE
const message = {
    type: "post_webhook_at_index",
    index: i
}
```
To:
```js
// AFTER
const message = {
    v: 1,
    type: "post_webhook_at_index",
    index: i
}
```

- [ ] **Step 4: Manual verify**

Load the extension in Chrome (`chrome://extensions` → Load unpacked → `extension/`). Open meetings.html. Confirm:
- "Recover last meeting" shows a result (not a blank failure)
- Download button downloads the transcript file
- Webhook post button (if URL configured) shows "Posted successfully" or a webhook error

- [ ] **Step 5: Commit**

```bash
git add extension/meetings.js
git commit -m "fix(meetings): add protocol version field to all background messages"
```

---

## Phase 2 — Accessibility & CSS Polish

These tasks are independent — each can be committed separately.

### Task 2: HTML language attribute and landmark structure

**Files:**
- Modify: `extension/popup.html:1` — add `lang="en"`
- Modify: `extension/meetings.html:506` — wrap content in `<main>`, add section `aria-labelledby`

- [ ] **Step 1: Add lang to popup.html**

```html
<!-- BEFORE -->
<html>

<!-- AFTER -->
<html lang="en">
```

- [ ] **Step 2: Add landmark structure to meetings.html**

Find line 506 where content begins:
```html
<!-- BEFORE -->
<body>
  <div style="margin: 0 auto; max-width: 1440px;">
      <h1>Meet Transcripts</h1>
      <section id="last-10-meetings">
          ...
          <h2>Last 10 meetings</h2>
          ...
      </section>
      <section id="webhooks">
          <h2 ...>Webhooks</h2>
          ...
      </section>
  </div>
```

```html
<!-- AFTER -->
<body>
  <main style="margin: 0 auto; max-width: 1440px;">
      <h1>Meet Transcripts</h1>
      <section id="last-10-meetings" aria-labelledby="meetings-heading">
          <div class="section-header">
              <h2 id="meetings-heading">Last 10 meetings</h2>
              ...
          </div>
          ...
      </section>
      <section id="webhooks" aria-labelledby="webhooks-heading">
          <h2 id="webhooks-heading" style="margin-bottom: 0.25rem;">Webhooks</h2>
          ...
      </section>
  </main>
```

The `<h2>` inside the section-header div already exists — just add `id="meetings-heading"` to it, and add `aria-labelledby="meetings-heading"` to the section.

- [ ] **Step 3: Commit**

```bash
git add extension/popup.html extension/meetings.html
git commit -m "fix(a11y): add lang attribute and landmark structure"
```

---

### Task 3: Fix --text-3 color contrast

`--text-3: #475569` (slate-600) on `#0f172a` (slate-900) gives ~2.4:1 contrast — fails WCAG AA (4.5:1). Used for `.footnote`, `.footer-version`, and `.footer-sep`.

**Files:**
- Modify: `extension/popup.html:15` — change `--text-3` value
- Modify: `extension/meetings.html:13` — change `--text-3` value

- [ ] **Step 1: Update --text-3 in popup.html**

```css
/* BEFORE */
--text-3:        #475569;

/* AFTER — #7b8ea5 gives ~4.6:1 on #0f172a */
--text-3:        #7b8ea5;
```

- [ ] **Step 2: Update --text-3 in meetings.html**

Same change in the `:root` block at the top of meetings.html:
```css
/* BEFORE */
--text-3:        #475569;

/* AFTER */
--text-3:        #7b8ea5;
```

- [ ] **Step 3: Visual check**

Open popup.html and meetings.html in Chrome. Confirm:
- Footer version, separator, and footnote text are visibly readable but still lighter than `--text-2`
- The visual hierarchy (text → text-2 → text-3) is still distinguishable

- [ ] **Step 4: Commit**

```bash
git add extension/popup.html extension/meetings.html
git commit -m "fix(a11y): increase --text-3 contrast to meet WCAG AA 4.5:1"
```

---

### Task 4: ARIA labels for dynamically created buttons

The webhook post button in `meetings.js` is missing an `aria-label`. The contenteditable title div is missing `role` and `aria-label`.

**Files:**
- Modify: `extension/meetings.js` — add aria-label to webhookPostButton and titleDiv

- [ ] **Step 1: Fix webhookPostButton aria-label**

After the line that sets `webhookPostButton.title`:
```js
// BEFORE
webhookPostButton.title = meeting.webhookPostStatus === "new" ? "Post webhook" : "Repost webhook"

// AFTER — add aria-label to mirror the title
webhookPostButton.title = meeting.webhookPostStatus === "new" ? "Post webhook" : "Repost webhook"
webhookPostButton.setAttribute("aria-label", webhookPostButton.title)
```

- [ ] **Step 2: Fix contenteditable title div**

After the line that sets `titleDiv.title = "Rename"`:
```js
// BEFORE
titleDiv.title = "Rename"

// AFTER
titleDiv.title = "Rename"
titleDiv.setAttribute("role", "textbox")
titleDiv.setAttribute("aria-label", `Rename meeting title: ${meeting.title || "Google Meet call"}`)
```

- [ ] **Step 3: Commit**

```bash
git add extension/meetings.js
git commit -m "fix(a11y): add aria-labels to webhook post button and contenteditable title"
```

---

### Task 5: Respect prefers-reduced-motion

The status dot pulse animation in popup.html ignores `prefers-reduced-motion`. Users who have set this OS preference (e.g. for vestibular disorders) will see the pulsing animation.

**Files:**
- Modify: `extension/popup.html` — add media query after `@keyframes pulse`

- [ ] **Step 1: Add media query**

After the existing `@keyframes pulse` block (around line 126):
```css
/* ADD after @keyframes pulse { ... } */
@media (prefers-reduced-motion: reduce) {
  .status-dot {
    animation: none;
    opacity: 1;
    box-shadow: 0 0 8px var(--brand), 0 0 16px rgba(56, 189, 248, 0.4);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/popup.html
git commit -m "fix(a11y): disable pulse animation when prefers-reduced-motion is set"
```

---

## Phase 3 — UX Improvements

### Task 6: Replace native alert/confirm with inline toast notifications

All 12 `alert()` calls and 1 `confirm()` call in `meetings.js` use browser-native dialogs that block the page, look out of brand, and reveal internal error language ("Fine! No webhooks for you!").

Replace with:
- `showToast(message, type)` — dismisses automatically after 4s
- `showConfirm(message, onConfirm)` — inline confirm UI in the toast container

**Files:**
- Modify: `extension/meetings.html` — add `#toast-container` div and CSS
- Modify: `extension/meetings.js` — add `showToast` and `showConfirm` helpers; replace all alert/confirm calls

- [ ] **Step 1: Add toast container and CSS to meetings.html**

Before the closing `</body>` tag (before `<script src="meetings.js">`), add:
```html
<div id="toast-container" role="region" aria-live="polite" aria-label="Notifications"></div>
```

In the `<style>` block, add at the end (before `</style>`):
```css
/* ── Toasts ── */
#toast-container {
    position: fixed;
    top: 1.25rem;
    right: 1.25rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
}

.toast {
    padding: 0.75rem 1rem;
    border-radius: var(--r);
    font-size: 0.875rem;
    font-weight: 500;
    max-width: 320px;
    pointer-events: auto;
    animation: toast-in 0.2s ease;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

@keyframes toast-in {
    from { opacity: 0; transform: translateX(0.75rem); }
    to   { opacity: 1; transform: none; }
}

.toast-success {
    background: var(--success-bg);
    color: var(--success);
    border: 1px solid rgba(52, 211, 153, 0.3);
}

.toast-error {
    background: var(--error-bg);
    color: var(--error);
    border: 1px solid rgba(248, 113, 113, 0.3);
}

.toast-info {
    background: var(--brand-dim);
    color: var(--brand);
    border: 1px solid var(--brand-border);
}

.toast-confirm {
    background: var(--glass);
    color: var(--text);
    border: 1px solid var(--glass-border);
}

.toast-confirm-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.625rem;
}

.toast-confirm-actions button {
    padding: 0.3rem 0.75rem;
    border-radius: var(--r-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
}

.toast-confirm-yes {
    background: var(--error);
    color: #0d0d1a;
}

.toast-confirm-no {
    background: var(--glass);
    color: var(--text-2);
    border: 1px solid var(--glass-border) !important;
}
```

- [ ] **Step 2: Add showToast and showConfirm helpers to meetings.js**

At the top of `meetings.js` (after the `let isMeetingsTableExpanded = false` line), add:
```js
/**
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container')
    if (!container) return
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    toast.textContent = message
    container.appendChild(toast)
    setTimeout(() => toast.remove(), duration)
}

/**
 * @param {string} message
 * @param {() => void} onConfirm
 */
function showConfirm(message, onConfirm) {
    const container = document.getElementById('toast-container')
    if (!container) return
    const toast = document.createElement('div')
    toast.className = 'toast toast-confirm'
    const msg = document.createElement('p')
    msg.style.margin = '0'
    msg.textContent = message
    const actions = document.createElement('div')
    actions.className = 'toast-confirm-actions'
    const yes = document.createElement('button')
    yes.className = 'toast-confirm-yes'
    yes.textContent = 'Delete'
    const no = document.createElement('button')
    no.className = 'toast-confirm-no'
    no.textContent = 'Cancel'
    actions.appendChild(yes)
    actions.appendChild(no)
    toast.appendChild(msg)
    toast.appendChild(actions)
    container.appendChild(toast)
    yes.addEventListener('click', () => { onConfirm(); toast.remove() })
    no.addEventListener('click', () => toast.remove())
}
```

- [ ] **Step 3: Replace all alert() and confirm() calls**

Replace each `alert()` / `confirm()` with the helpers. Exact replacements:

**Recover — success, no meetings (line ~49–52):**
```js
// BEFORE
if (response.message === "No recovery needed") {
    alert("No unprocessed meetings found.")
} else {
    alert("Last meeting recovered successfully!")
}

// AFTER
if (response.message === "No recovery needed") {
    showToast("No unprocessed meetings found.", 'info')
} else {
    showToast("Last meeting recovered successfully!", 'success')
}
```

**Recover — error cases (line ~58–62):**
```js
// BEFORE
if (parsedError.errorCode === ErrorCode.NO_MEETINGS || parsedError.errorCode === ErrorCode.EMPTY_TRANSCRIPT) {
    alert("No unprocessed meetings found.")
} else {
    alert("Could not recover last meeting.")
    console.error(parsedError.errorMessage)
}

// AFTER
if (parsedError.errorCode === ErrorCode.NO_MEETINGS || parsedError.errorCode === ErrorCode.EMPTY_TRANSCRIPT) {
    showToast("No unprocessed meetings found.", 'info')
} else {
    showToast("Could not recover last meeting.", 'error')
    console.error(parsedError.errorMessage)
}
```

**Save webhook URL — empty URL (line ~110):**
```js
// BEFORE
alert("Webhook URL saved!")

// AFTER
showToast("Webhook URL cleared.", 'success')
```

**Save webhook URL — valid URL (line ~120):**
```js
// BEFORE
alert("Webhook URL saved!")

// AFTER
showToast("Webhook URL saved.", 'success')
```

**Save webhook URL — permission denied (line ~123):**
```js
// BEFORE
alert("Permission required to use webhooks. You can try again anytime.")

// AFTER
showToast("Permission required. Click Save again to retry.", 'error')
```

**Download — error (line ~327):**
```js
// BEFORE
alert("Could not download transcript")

// AFTER
showToast("Could not download transcript.", 'error')
```

**Webhook post — success (line ~355):**
```js
// BEFORE
alert("Posted successfully!")

// AFTER
showToast("Posted successfully!", 'success')
```

**Webhook post — permission denied (line ~365):**
```js
// BEFORE
alert("Fine! No webhooks for you!")

// AFTER
showToast("Webhook permission required. Configure your URL again to retry.", 'error')
```

**Webhook post — no URL (line ~370):**
```js
// BEFORE
alert("Please provide a webhook URL")

// AFTER
showToast("Please configure a webhook URL first.", 'info')
```

**Delete confirm (line ~377):**
```js
// BEFORE
if (confirm("Delete this meeting?")) {
    meetings.splice(i, 1)
    chrome.storage.local.set({ meetings: meetings }, function () {
        console.log("Meeting deleted")
    })
}

// AFTER
showConfirm(`Delete "${meeting.title || "Google Meet call"}"?`, () => {
    meetings.splice(i, 1)
    chrome.storage.local.set({ meetings: meetings }, function () {
        loadMeetings()
    })
})
```

Note: the delete handler now calls `loadMeetings()` explicitly since the storage `onChanged` listener rebuilds the table, but removing the confirm() means the function returns immediately. The `chrome.storage.onChanged` listener on line ~31 will fire and call `loadMeetings()` automatically — so the explicit call is optional but makes intent clear.

- [ ] **Step 4: Manual verify**

Open meetings.html in the extension. Confirm:
- Recover button shows a blue info/green success toast (not a browser dialog)
- Webhook save shows a green "saved" toast
- Delete button opens an inline confirm toast with "Delete" / "Cancel" buttons — browser confirm dialog does NOT appear
- Toasts dismiss after 4 seconds
- No `alert()` dialogs appear anywhere

- [ ] **Step 5: Commit**

```bash
git add extension/meetings.html extension/meetings.js
git commit -m "feat(ux): replace native alert/confirm with inline toast notifications"
```

---

### Task 7: Dynamic popup status

The popup always shows a pulsing "Active on Google Meet" dot regardless of the active tab. Fix it to show two honest states: on Meet, or not.

**Files:**
- Modify: `extension/popup.html` — add idle state CSS class
- Modify: `extension/popup.js` — query active tab URL and update status

- [ ] **Step 1: Add idle state CSS to popup.html**

In the `<style>` block, after the `.status-dot` and `@keyframes pulse` rules, add:
```css
.status-dot.idle {
  background: var(--text-3);
  box-shadow: none;
  animation: none;
}

.status-bar.idle {
  color: var(--text-2);
}
```

- [ ] **Step 2: Update popup.js to check active tab**

In `popup.js`, replace `window.onload = function () {` block. Add a tab check at the top of the load handler:

```js
window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  const statusDot = document.querySelector(".status-dot")
  const statusBar = document.querySelector(".status-bar")
  const statusLabel = statusBar ? statusBar.querySelector("span:last-child") : null

  if (versionElement) {
    versionElement.innerHTML = `v${chrome.runtime.getManifest().version}`
  }

  // Check if active tab is a Google Meet session
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0]
    const isOnMeet = tab && tab.url && tab.url.startsWith("https://meet.google.com/")
    if (!isOnMeet) {
      if (statusDot) statusDot.classList.add("idle")
      if (statusBar) statusBar.classList.add("idle")
      if (statusLabel) statusLabel.textContent = "Open a Google Meet to start"
    }
  })

  chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
    if (autoModeRadio instanceof HTMLInputElement && manualModeRadio instanceof HTMLInputElement) {
      if (resultSync.operationMode === "manual") {
        manualModeRadio.checked = true
      } else {
        autoModeRadio.checked = true
      }

      autoModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "auto" }, function () { })
      })
      manualModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "manual" }, function () { })
      })
    }
  })
}
```

- [ ] **Step 3: Update the status text span in popup.html**

The status bar text is currently a bare text node. Wrap it in a `<span>` so JS can target it:
```html
<!-- BEFORE -->
<div class="status-bar">
  <span class="status-dot"></span>Active on Google Meet
</div>

<!-- AFTER -->
<div class="status-bar">
  <span class="status-dot"></span><span>Active on Google Meet</span>
</div>
```

- [ ] **Step 4: Manual verify**

1. Open the extension popup while on a non-Meet tab → dot is gray/dim, text says "Open a Google Meet to start"
2. Open the extension popup while on `meet.google.com/*` → dot pulses blue, text says "Active on Google Meet"

- [ ] **Step 5: Commit**

```bash
git add extension/popup.html extension/popup.js
git commit -m "feat(popup): show real status based on active tab URL"
```

---

## Self-Review

**Spec coverage check:**

| Finding | Task |
|---------|------|
| CLICK-PATH-001: recover_last_meeting missing v | Task 1 ✓ |
| CLICK-PATH-002: download missing v | Task 1 ✓ |
| CLICK-PATH-003: post webhook missing v, silent fail | Task 1 ✓ |
| CLICK-PATH-004: clear URL doesn't clear autoPost | Not included — separate behaviour decision needed; document as a known issue |
| CLICK-PATH-005: post button loses icon during loading | Not included — low priority visual nit; deferred |
| CLICK-PATH-006: delete no meeting name in confirm | Task 6 ✓ (showConfirm includes title) |
| A11Y-001: missing lang | Task 2 ✓ |
| A11Y-002: --text-3 contrast | Task 3 ✓ |
| A11Y-003: webhook post button no aria-label | Task 4 ✓ |
| A11Y-004: contenteditable title no role/label | Task 4 ✓ |
| A11Y-005: no landmark structure in meetings.html | Task 2 ✓ |
| A11Y-006: pulse animation ignores prefers-reduced-motion | Task 5 ✓ |
| UX: native alert/confirm | Task 6 ✓ |
| UX: static popup status dot | Task 7 ✓ |
| UX: --text-3 dedup across files | Task 3 covers both files ✓ |

**Known deferred items (not in this plan):**
- CLICK-PATH-004: Clearing webhook URL should also set `autoPostWebhookAfterMeeting: false`
- Dynamic popup: "recording" state (requires content script writing `hasMeetingStarted` to storage)
- Manual mode toggle button in popup
- Migrate meetings.js table to `<template>` element
- Extract shared CSS tokens to a single file
- Webhook card "connected" state in popup

These are tracked as future work — no task defined here so they are explicit gaps, not accidentally omitted steps.

**Placeholder scan:** No TBD, TODO, or "similar to" references. All code is complete.

**Type consistency:** `showToast` and `showConfirm` are defined before `DOMContentLoaded` — available at call time. `v: 1` matches `PROTOCOL_VERSION = 1` in `src/shared/protocol.ts`.
