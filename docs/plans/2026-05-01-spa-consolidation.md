# SPA Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate `meetings.html` + `settings.html` into a single `app.html` with in-page tab switching, so navigating the extension never opens extra browser tabs.

**Architecture:** The extension popup remains a separate file (Chrome MV3 constraint). A new `app.html` hosts both the Meetings and Settings views as tab panels switched by hash routing (`#meetings`, `#settings`). The popup's two nav buttons are replaced with a single "Open" button that focuses an already-open `app.html` tab or creates one. CSS is extracted from all three pages into `shared.css` (canonical tokens + toast system) plus per-page override files.

**Tech Stack:** Chrome MV3, TypeScript, Vite (IIFE builds), Playwright (E2E tests), Vitest (unit tests), vanilla JS — no framework, no router library.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `extension/shared.css` | Canonical CSS custom properties, scrollbar, card, mode-toggle, toast system |
| Create | `extension/app.css` | Tab nav, view panels, table, badges, confirm toast, section layouts |
| Create | `extension/popup.css` | Status dot + animations, open-app button, rec vars, popup-only layout |
| Create | `extension/app.html` | Shell: brand header + tab nav + view panels + toast container |
| Create | `src/pages/app/index.ts` | Merged meetings + settings logic; shared `showToast`, `showConfirm`, `requestWebhookPermission`; hash router |
| Modify | `extension/popup.html` | Remove `.nav-row`; add `#open-app` button; swap inline `<style>` for `shared.css` + `popup.css` |
| Modify | `src/pages/popup/index.ts` | Add `#open-app` click handler using `chrome.tabs.query` + `chrome.tabs.create` |
| Modify | `vite.config.js` | Replace `meetings` + `settings` entries with single `app` entry |
| Modify | `tests/meetings.spec.js` | Update `beforeEach` URL + one nav-link selector |
| Modify | `tests/settings.spec.js` | Update `beforeEach` URL + two selectors (h1, nav-link) |
| Modify | `tests/popup.spec.js` | Update nav button selectors |
| Modify | `tests/security.spec.js` | Update `SOURCE_FILES` array + meetings page URL |
| Delete | `extension/meetings.html` | Superseded by `app.html` |
| Delete | `extension/settings.html` | Superseded by `app.html` |
| Delete | `src/pages/meetings/index.ts` | Superseded by `src/pages/app/index.ts` |
| Delete | `src/pages/settings/index.ts` | Superseded by `src/pages/app/index.ts` |

---

## Task 1: Create `extension/shared.css`

Extract the CSS that is identical (or near-identical) across `meetings.html` and `settings.html` — custom properties, scrollbar, body base, card, mode-toggle, and the entire toast system.

**Files:**
- Create: `extension/shared.css`

- [ ] **Step 1: Create the file**

```css
/* extension/shared.css — canonical shared styles loaded by popup.html and app.html */

:root {
  --brand:        #38bdf8;
  --brand-dim:    rgba(56, 189, 248, 0.12);
  --brand-border: rgba(56, 189, 248, 0.3);
  --brand-glow:   rgba(56, 189, 248, 0.4);
  --rec:          #f87171;
  --rec-dim:      rgba(248, 113, 113, 0.15);
  --rec-border:   rgba(248, 113, 113, 0.3);
  --rec-glow:     rgba(248, 113, 113, 0.4);
  --text:         #f1f5f9;
  --text-2:       #94a3b8;
  --text-3:       #64748b;
  --glass:        rgba(255, 255, 255, 0.05);
  --glass-hover:  rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.10);
  --border:       rgba(255, 255, 255, 0.08);
  --border-brand: rgba(56, 189, 248, 0.25);
  --success:      #34d399;
  --success-bg:   rgba(52, 211, 153, 0.12);
  --error:        #f87171;
  --error-bg:     rgba(248, 113, 113, 0.12);
  --warning:      #fbbf24;
  --warning-bg:   rgba(251, 191, 36, 0.12);
  --r-sm:         8px;
  --r:            12px;
  --r-lg:         16px;
}

* { box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
  background: linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  min-height: 100vh;
  font-size: 1rem;
  line-height: 1.6;
  accent-color: var(--brand);
  margin: 0;
}

p { margin: 0; }

a {
  color: var(--brand);
  font-weight: 600;
  text-underline-offset: 3px;
  text-decoration-color: var(--brand-border);
}
a:hover { text-decoration-color: var(--brand); }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.3); border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: var(--brand); }

/* ── Card ── */
.card {
  background: var(--glass);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-lg);
  padding: 1.25rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

/* ── Mode toggle ── */
.mode-toggle {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 3px;
  gap: 3px;
}

.mode-option { flex: 1; }

.mode-option label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0.4rem 0;
  border-radius: 5px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-3);
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.mode-option input[type="radio"] {
  width: 11px;
  height: 11px;
  margin: 0;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: #0d0d1a;
}

.mode-option:has(input:checked) label {
  background: var(--brand);
  color: #0d0d1a;
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.25);
}

/* ── Toast system ── */
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

@media (prefers-reduced-motion: reduce) {
  .toast { animation: none; }
}

.toast-success { background: var(--success-bg); color: var(--success); border: 1px solid rgba(52, 211, 153, 0.3); }
.toast-error   { background: var(--error-bg);   color: var(--error);   border: 1px solid rgba(248, 113, 113, 0.3); }
.toast-info    { background: var(--brand-dim);  color: var(--brand);   border: 1px solid var(--brand-border); }
```

- [ ] **Step 2: Verify the file was created**

```bash
wc -l extension/shared.css
```
Expected output: line count around 120+

---

## Task 2: Create `extension/app.css`

App-specific styles: tab navigation header, view panel transitions, table, badges, action buttons, settings form elements, confirm toast, and all section layouts.

**Files:**
- Create: `extension/app.css`

- [ ] **Step 1: Create the file**

```css
/* extension/app.css — styles for app.html only */

html { scroll-behavior: smooth; }

body {
  background:
    radial-gradient(ellipse at 20% 10%, rgba(30, 58, 138, 0.35) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(56, 189, 248, 0.10) 0%, transparent 50%),
    linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  background-attachment: fixed;
}

/* ── App header / tab nav ── */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 2rem;
  border-bottom: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.brand h1 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #bae6fd 0%, #38bdf8 55%, #0284c7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-version {
  font-size: 0.6875rem;
  color: var(--text-3);
}

.tab-nav {
  display: flex;
  gap: 3px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 3px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.35rem 0.875rem;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  user-select: none;
}

.tab-btn:hover:not(.active) {
  background: var(--glass-hover);
  color: var(--text);
}

.tab-btn.active {
  background: var(--brand);
  color: #0d0d1a;
}

/* ── View panels ── */
.view { display: none; }

.view.active {
  display: block;
  animation: view-in 0.1s ease forwards;
}

@keyframes view-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .view.active { animation: none; }
}

/* ── Main content area ── */
.view > main {
  margin: 0 auto;
  padding: 2rem 2rem 4rem;
}

#view-meetings > main { max-width: 1200px; }
#view-settings > main { max-width: 760px; }

/* ── Section / headings ── */
section { margin-bottom: 2.5rem; }

h2 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.section-desc {
  color: var(--text-3);
  font-size: 0.8125rem;
  margin-bottom: 0.875rem;
}

.sub-text {
  color: var(--text-2);
  font-size: 0.875rem;
}

hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.25rem 0;
}

/* ── Meetings: recover button ── */
#recover-last-meeting {
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--brand);
  border: 1px solid var(--brand-border);
  border-radius: var(--r-sm);
  padding: 0.3rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

#recover-last-meeting:hover {
  background: var(--brand-dim);
  border-color: var(--brand);
}

/* ── Meetings: table ── */
#meetings-table-container { overflow-x: auto; }

table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--glass-border);
  border-radius: var(--r);
  overflow: hidden;
  background: var(--glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

th, td {
  padding: 0.875rem 1.25rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

th {
  background: rgba(30, 58, 138, 0.25);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

tbody tr:last-child td { border-bottom: none; }
tbody tr { transition: background 0.1s; }
tbody tr:hover { background: var(--glass-hover); }

.meeting-title {
  border-radius: var(--r-sm);
  padding: 0.2rem 0.4rem;
  text-decoration: underline;
  text-decoration-color: var(--text-3);
  text-underline-offset: 4px;
  color: var(--text);
  outline: none;
  transition: background 0.15s;
}

.meeting-title:hover { background: var(--glass-hover); text-decoration: none; }
.meeting-title:focus { background: var(--glass-hover); text-decoration: none; outline: 1px solid var(--brand-border); }

/* ── Meetings: badges ── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 100px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.badge::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-success { color: var(--success); background: var(--success-bg); }
.status-failed  { color: var(--error);   background: var(--error-bg); }
.status-new     { color: var(--warning); background: var(--warning-bg); }

/* ── Meetings: action buttons ── */
.download-button,
.delete-button,
.post-button {
  background: transparent;
  color: var(--text-2);
  border: none;
  padding: 0.3rem;
  border-radius: var(--r-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.download-button:hover, .post-button:hover { background: var(--brand-dim); color: var(--brand); }
.delete-button:hover { background: var(--error-bg); color: var(--error); }

/* ── Meetings: show-all / fade mask ── */
#show-all {
  display: block;
  margin: 0.75rem auto 0;
  border-radius: 100px;
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--brand);
  border: 1px solid var(--brand-border);
  padding: 0.3rem 1rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

#show-all:hover { background: var(--brand-dim); border-color: var(--brand); }

.fade-mask {
  mask-image: linear-gradient(to bottom, black 0%, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 80%, transparent 100%);
  max-height: 20rem;
  overflow-y: hidden;
}

/* ── Confirm toast (meetings only) ── */
.toast-confirm { background: var(--glass); color: var(--text); border: 1px solid var(--glass-border); }

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
}

.toast-confirm-yes { background: var(--error); color: #0d0d1a; border: none; }
.toast-confirm-no  { background: var(--glass); color: var(--text-2); border: 1px solid var(--glass-border); }

/* ── Settings: card override (tighter than shared.css default) ── */
#view-settings .card {
  margin-bottom: 0;
}

/* ── Settings: checkboxes ── */
.checkbox-group {
  display: flex;
  gap: 0.625rem;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.checkbox-group:last-child { margin-bottom: 0; }

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin-top: 0.2rem;
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-group label { cursor: pointer; font-size: 0.875rem; color: var(--text-2); }

/* ── Settings: webhook form ── */
.field-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.4rem;
}

.input-group { display: flex; align-items: stretch; }

input[type="url"] {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-brand);
  border-right: none;
  border-radius: var(--r-sm) 0 0 var(--r-sm);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text);
  font-family: inherit;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

input[type="url"]:focus { border-color: var(--brand); background: rgba(30, 58, 138, 0.2); }
input[type="url"]::placeholder { color: var(--text-3); }

button#save-webhook {
  background: var(--brand);
  color: #0d0d1a;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}

button#save-webhook:disabled { opacity: 0.4; cursor: not-allowed; }
button#save-webhook:not(:disabled):hover { opacity: 0.85; }

/* ── Settings: webhook body type radios ── */
.radio-item {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.5rem;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.radio-item:not(:last-of-type) { margin-bottom: 0.25rem; }
.radio-item:hover { background: var(--glass-hover); }

input[type="radio"].body-type-radio {
  margin-top: 0.25rem;
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}

.radio-item label { cursor: pointer; font-size: 0.875rem; }
.radio-item label b { color: var(--text); }
.radio-item .sub-text { font-size: 0.8125rem; }

/* ── Settings: reference / code blocks ── */
details { margin-bottom: 0.5rem; }

summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--brand);
  padding: 0.25rem 0;
  user-select: none;
}

.code-block {
  margin: 0.75rem 0 1.25rem;
  overflow-x: auto;
  padding: 1rem;
  border-radius: var(--r-sm);
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border);
  line-height: 1.6;
  font-size: 0.8125rem;
}

.code-block pre { margin: 0; white-space: pre; }
```

- [ ] **Step 2: Verify the file was created**

```bash
wc -l extension/app.css
```
Expected: line count around 270+

---

## Task 3: Create `extension/popup.css`

Popup-specific styles: 360px layout, status dot animations, the new open-app button, footer.

**Files:**
- Create: `extension/popup.css`

- [ ] **Step 1: Create the file**

```css
/* extension/popup.css — styles for popup.html only */

body {
  width: 360px;
  min-height: unset;
  padding: 1.125rem;
  background: linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  font-size: 0.875rem;
}

/* ── Card override: tighter padding in the popup ── */
.card {
  border-radius: 14px;
  padding: 0.875rem;
  margin-bottom: 0.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.header-meta { display: flex; align-items: baseline; gap: 0.5rem; }

h1 {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #bae6fd 0%, #38bdf8 55%, #0284c7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.version { font-size: 0.6875rem; color: var(--text-3); }

.logo {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  border: 1px solid var(--brand-border);
  background: rgba(56, 189, 248, 0.08);
  flex-shrink: 0;
  padding: 3px;
}

/* ── Status card ── */
.status-row { display: flex; align-items: center; gap: 0.5rem; }

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.2s;
}

.status-dot.idle      { background: var(--text-3); }
.status-dot.ready     { background: var(--brand); box-shadow: 0 0 8px var(--brand-glow); animation: pulse-brand 2s ease-in-out infinite; }
.status-dot.recording { background: var(--rec);   box-shadow: 0 0 8px var(--rec-glow);   animation: pulse-rec   1.5s ease-in-out infinite; }

@keyframes pulse-brand {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px var(--brand-glow); }
  50%       { opacity: 0.6; box-shadow: 0 0 4px var(--brand-glow); }
}
@keyframes pulse-rec {
  0%, 100% { opacity: 1; box-shadow: 0 0 10px var(--rec-glow), 0 0 20px rgba(248,113,113,0.2); }
  50%       { opacity: 0.7; box-shadow: 0 0 5px var(--rec-glow); }
}
@media (prefers-reduced-motion: reduce) {
  .status-dot.ready, .status-dot.recording { animation: none; }
}

.status-label { font-size: 0.8125rem; font-weight: 600; transition: color 0.2s; }
.status-label.idle      { color: var(--text-3); }
.status-label.ready     { color: var(--brand); }
.status-label.recording { color: var(--rec); }

.status-meeting-row {
  margin-top: 0.5rem;
  padding: 0.4rem 0.625rem;
  background: var(--rec-dim);
  border: 1px solid var(--rec-border);
  border-radius: var(--r-sm);
  font-size: 0.8rem;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-meeting-row strong { color: var(--text); font-weight: 600; }

/* ── Card label ── */
.card-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-3);
  margin-bottom: 0.625rem;
}

/* ── Mode toggle overrides ── */
.mode-option label { font-size: 0.8125rem; }
.mode-option input[type="radio"] { width: 10px; height: 10px; accent-color: #0d0d1a; }

.mode-desc { margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--text-3); }

/* ── Open-app button ── */
#open-app {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  border-radius: var(--r-sm);
  background: var(--glass);
  border: 1px solid var(--glass-border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

#open-app:hover {
  background: var(--glass-hover);
  color: var(--text);
  border-color: rgba(255, 255, 255, 0.18);
}

/* ── Footer ── */
.footer { display: flex; justify-content: center; align-items: center; gap: 0.4rem; }

.footer a { font-size: 0.6875rem; color: var(--text-3); text-decoration: none; transition: color 0.15s; }
.footer a:hover { color: var(--text-2); }

.footer-sep { color: var(--text-3); font-size: 0.45rem; }
```

- [ ] **Step 2: Verify**

```bash
wc -l extension/popup.css
```
Expected: line count around 130+

---

## Task 4: Create `extension/app.html`

The unified page shell. Contains the brand header with tab nav, two hidden view panels (meetings content + settings content), one toast container, and a single `app.js` script reference.

**Files:**
- Create: `extension/app.html`

- [ ] **Step 1: Create the file**

```html
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meet Transcripts</title>
  <link rel="stylesheet" href="shared.css">
  <link rel="stylesheet" href="app.css">
</head>

<body>
  <header class="app-header">
    <div class="brand">
      <h1>Meet Transcripts</h1>
      <span class="brand-version" id="version"></span>
    </div>

    <nav class="tab-nav" role="tablist" aria-label="Main navigation">
      <button class="tab-btn active" role="tab" aria-selected="true"
              aria-controls="view-meetings" id="tab-meetings" data-view="meetings">
        <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor" aria-hidden="true">
          <rect x="0" y="0" width="13" height="2" rx="1"/>
          <rect x="0" y="4.5" width="13" height="2" rx="1"/>
          <rect x="0" y="9" width="13" height="2" rx="1"/>
        </svg>
        Meetings
      </button>
      <button class="tab-btn" role="tab" aria-selected="false"
              aria-controls="view-settings" id="tab-settings" data-view="settings">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
      </button>
    </nav>
  </header>

  <!-- ── Meetings view ── -->
  <div id="view-meetings" class="view active" role="tabpanel" aria-labelledby="tab-meetings">
    <main>
      <section id="last-10-meetings" aria-labelledby="meetings-heading">
        <div class="section-header">
          <div>
            <h2 id="meetings-heading">Last 10 meetings</h2>
            <p class="sub-text" style="margin-top: 0.2rem;">Only the last 10 meetings are stored. Download or post to a webhook to keep older ones.</p>
          </div>
          <button id="recover-last-meeting">Recover last meeting</button>
        </div>

        <div id="meetings-table-container" style="margin-top: 1rem;">
          <table>
            <thead>
              <tr>
                <th>Meeting title</th>
                <th>Meeting software</th>
                <th>Meeting start time and duration</th>
                <th>Webhook status</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="meetings-table">
              <!-- Populated by JavaScript -->
            </tbody>
          </table>
        </div>
        <button id="show-all" style="display: none;">Show all</button>
      </section>
    </main>
  </div>

  <!-- ── Settings view ── -->
  <div id="view-settings" class="view" role="tabpanel" aria-labelledby="tab-settings" hidden>
    <main>
      <!-- Capture mode -->
      <section aria-labelledby="mode-heading">
        <h2 id="mode-heading">Capture mode</h2>
        <p class="section-desc">Choose how transcripts are captured across all meetings.</p>
        <div class="card">
          <div class="mode-toggle">
            <div class="mode-option">
              <label for="auto-mode">
                <input type="radio" name="mode" id="auto-mode" />
                Auto
              </label>
            </div>
            <div class="mode-option">
              <label for="manual-mode">
                <input type="radio" name="mode" id="manual-mode" />
                Manual
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Automation -->
      <section aria-labelledby="automation-heading">
        <h2 id="automation-heading">Automation</h2>
        <p class="section-desc">Actions taken automatically after each meeting ends.</p>
        <div class="card">
          <div class="checkbox-group">
            <input type="checkbox" id="auto-download-file" />
            <label for="auto-download-file">Automatically download transcript as a text file after each meeting</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="auto-post-webhook" />
            <label for="auto-post-webhook">Automatically post transcript to webhook URL after each meeting</label>
          </div>
        </div>
      </section>

      <!-- Webhook -->
      <section aria-labelledby="webhooks-heading">
        <h2 id="webhooks-heading">Webhooks</h2>
        <p class="section-desc">Connect Meet Transcripts to any tool that accepts a webhook POST.</p>

        <div class="card">
          <form id="webhook-url-form">
            <label class="field-label" for="webhook-url">Webhook URL</label>
            <div class="input-group">
              <input type="url" id="webhook-url" placeholder="https://your-webhook-url.com" />
              <button id="save-webhook" type="submit">Save</button>
            </div>
            <p class="sub-text" style="margin-top: 0.4rem; font-size: 0.8125rem;">Saving will ask for browser permission to send data to this domain.</p>
          </form>

          <hr />

          <div class="radio-item">
            <input type="radio" class="body-type-radio" name="webhook-body-type" id="simple-webhook-body" />
            <label for="simple-webhook-body">
              <b>Simple webhook body</b><br />
              <span class="sub-text">Pre-formatted data, suitable for no-code integrations</span>
            </label>
          </div>
          <div class="radio-item">
            <input type="radio" class="body-type-radio" name="webhook-body-type" id="advanced-webhook-body" />
            <label for="advanced-webhook-body">
              <b>Advanced webhook body</b><br />
              <span class="sub-text">Raw data, suitable for code integrations</span>
            </label>
          </div>
        </div>
      </section>

      <!-- Payload reference -->
      <section aria-labelledby="reference-heading">
        <h2 id="reference-heading">Payload reference</h2>
        <p class="section-desc">Request body shapes sent to your webhook endpoint.</p>
        <div class="card">
          <details>
            <summary>Simple body</summary>
            <div class="code-block">
              <pre>{
  "webhookBodyType": "simple",
  "meetingSoftware": "Google Meet",
  "meetingTitle": "Team meeting",
  "meetingStartTimestamp": "01/15/2024, 10:00 AM",
  "meetingEndTimestamp": "01/15/2024, 11:00 AM",
  "transcript": "Priya (01/15/2024, 10:00 AM)\nHi everyone!\n\n...",
  "chatMessages": "Mohammed (01/15/2024, 10:05 AM)\nCan you share slides?\n\n..."
}</pre>
            </div>
          </details>
          <details>
            <summary>Advanced body</summary>
            <div class="code-block">
              <pre>{
  "webhookBodyType": "advanced",
  "meetingSoftware": "Google Meet",
  "meetingTitle": "Team meeting",
  "meetingStartTimestamp": "2024-01-15T10:00:00.000Z",
  "meetingEndTimestamp": "2024-01-15T11:00:00.000Z",
  "transcript": [
    {
      "personName": "Priya",
      "timestamp": "2024-01-15T10:00:00.000Z",
      "transcriptText": "Hi everyone!"
    }
  ],
  "chatMessages": [
    {
      "personName": "Mohammed",
      "timestamp": "2024-01-15T10:05:00.000Z",
      "chatMessageText": "Can you share the slides?"
    }
  ]
}</pre>
            </div>
          </details>
        </div>
      </section>
    </main>
  </div>

  <div id="toast-container" role="region" aria-live="polite" aria-label="Notifications"></div>
  <script src="app.js"></script>
</body>

</html>
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la extension/app.html
```
Expected: file present with size > 5KB

---

## Task 5: Create `src/pages/app/index.ts`

The merged TypeScript entry point. Contains shared utilities (`showToast`, `showConfirm`, `requestWebhookPermission`), the hash router, and the full meetings + settings initialization logic extracted verbatim from the old individual files.

**Files:**
- Create: `src/pages/app/index.ts`

- [ ] **Step 1: Create the file**

```typescript
import { PROTOCOL_VERSION } from '../../shared/protocol'
import type { Meeting, ErrorObject, OperationMode, WebhookBodyType, MeetingTabId } from '../../types'

// ── Shared utilities ──────────────────────────────────────────────────────────

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 4000): void {
  const container = document.getElementById('toast-container')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

function showConfirm(message: string, onConfirm: () => void): void {
  const container = document.getElementById('toast-container')
  if (!container) return
  container.querySelector('.toast-confirm')?.remove()
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
  actions.append(yes, no)
  toast.append(msg, actions)
  container.appendChild(toast)
  yes.addEventListener('click', () => { onConfirm(); toast.remove() })
  no.addEventListener('click', () => toast.remove())
  setTimeout(() => { if (toast.isConnected) toast.remove() }, 15000)
}

function requestWebhookPermission(url: string): Promise<void> {
  const { protocol, hostname } = new URL(url)
  return chrome.permissions.request(
    { origins: [`${protocol}//${hostname}/*`] }
  ).then((granted) => {
    if (!granted) throw new Error('Permission denied')
  })
}

// ── Hash router ───────────────────────────────────────────────────────────────

type ViewId = 'meetings' | 'settings'

function activateView(viewId: ViewId): void {
  document.querySelectorAll<HTMLElement>('.view').forEach(el => {
    el.classList.remove('active')
    el.hidden = true
  })
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    const isActive = btn.dataset['view'] === viewId
    btn.classList.toggle('active', isActive)
    btn.setAttribute('aria-selected', String(isActive))
  })
  const view = document.getElementById(`view-${viewId}`)
  if (view) {
    view.hidden = false
    view.classList.add('active')
  }
  if (location.hash !== `#${viewId}`) {
    history.replaceState(null, '', `#${viewId}`)
  }
}

function resolveInitialView(): ViewId {
  const hash = location.hash.replace('#', '')
  return hash === 'settings' ? 'settings' : 'meetings'
}

// ── Meetings logic ────────────────────────────────────────────────────────────

const NO_MEETINGS = '013'
const EMPTY_TRANSCRIPT = '014'

let isMeetingsTableExpanded = false

function getDuration(startTimestamp: string, endTimestamp: string): string {
  const ms = new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes}m`
}

function loadMeetings(): void {
  const meetingsTable = document.querySelector<HTMLTableSectionElement>('#meetings-table')
  if (!meetingsTable) return

  chrome.storage.local.get(['meetings'], (result) => {
    const meetings = (result['meetings'] as Meeting[] | undefined) ?? []
    meetingsTable.innerHTML = ''

    if (meetings.length === 0) {
      meetingsTable.innerHTML = `<tr><td colspan="5" style="color: var(--text-2); text-align: center; padding: 2rem;">Your next meeting will appear here</td></tr>`
      return
    }

    for (let i = meetings.length - 1; i >= 0; i--) {
      const meeting = meetings[i]!
      const row = document.createElement('tr')

      // Col 1: title (contenteditable — textContent prevents XSS)
      const tdTitle = document.createElement('td')
      const titleDiv = document.createElement('div')
      titleDiv.contentEditable = 'true'
      titleDiv.className = 'meeting-title'
      titleDiv.dataset['index'] = String(i)
      titleDiv.title = 'Rename'
      titleDiv.setAttribute('role', 'textbox')
      titleDiv.setAttribute('aria-label', `Rename meeting title: ${meeting.title ?? 'Google Meet call'}`)
      titleDiv.textContent = meeting.title ?? 'Google Meet call'
      tdTitle.appendChild(titleDiv)
      row.appendChild(tdTitle)

      // Col 2: software
      const tdSoftware = document.createElement('td')
      tdSoftware.textContent = meeting.software ?? ''
      row.appendChild(tdSoftware)

      // Col 3: time · duration
      const tdTime = document.createElement('td')
      tdTime.textContent = `${new Date(meeting.startTimestamp).toLocaleString()}  ●  ${getDuration(meeting.startTimestamp, meeting.endTimestamp)}`
      row.appendChild(tdTime)

      // Col 4: webhook status badge
      const tdStatus = document.createElement('td')
      const badge = document.createElement('span')
      badge.className = 'badge'
      const statusMap: Record<string, [string, string]> = {
        successful: ['status-success', 'Successful'],
        failed:     ['status-failed',  'Failed'],
        new:        ['status-new',     'New'],
      }
      const [cls, label] = statusMap[meeting.webhookPostStatus] ?? ['status-new', 'Pending']
      badge.classList.add(cls!)
      badge.textContent = label!
      tdStatus.appendChild(badge)
      row.appendChild(tdStatus)

      // Col 5: actions
      const tdActions = document.createElement('td')
      const actionsDiv = document.createElement('div')
      actionsDiv.style.cssText = 'display: flex; gap: 1rem; justify-content: end'

      const downloadBtn = document.createElement('button')
      downloadBtn.className = 'download-button'
      downloadBtn.title = 'Download'
      downloadBtn.setAttribute('aria-label', 'Download this meeting transcript')
      const dlImg = document.createElement('img')
      dlImg.src = './icons/download.svg'
      dlImg.alt = ''
      downloadBtn.appendChild(dlImg)

      const postBtn = document.createElement('button')
      postBtn.className = 'post-button'
      postBtn.title = meeting.webhookPostStatus === 'new' ? 'Post webhook' : 'Repost webhook'
      postBtn.setAttribute('aria-label', postBtn.title)
      const postImg = document.createElement('img')
      postImg.src = './icons/webhook.svg'
      postImg.alt = ''
      postBtn.appendChild(postImg)

      const deleteBtn = document.createElement('button')
      deleteBtn.className = 'delete-button'
      deleteBtn.title = 'Delete'
      deleteBtn.setAttribute('aria-label', 'Delete this meeting')
      const delImg = document.createElement('img')
      delImg.src = './icons/delete.svg'
      delImg.alt = ''
      deleteBtn.appendChild(delImg)

      actionsDiv.append(downloadBtn, postBtn, deleteBtn)
      tdActions.appendChild(actionsDiv)
      row.appendChild(tdActions)
      meetingsTable.appendChild(row)

      titleDiv.addEventListener('blur', () => {
        meetings[i] = { ...meeting, title: titleDiv.innerText }
        chrome.storage.local.set({ meetings })
      })

      downloadBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage(
          { v: PROTOCOL_VERSION, type: 'download_transcript_at_index', index: i },
          (response: { success: boolean; message?: ErrorObject }) => {
            if (!response?.success && response?.message) {
              showToast('Could not download transcript.', 'error')
              console.error(response.message.errorMessage)
            }
          }
        )
      })

      postBtn.addEventListener('click', () => {
        chrome.storage.sync.get(['webhookUrl'], (result) => {
          const webhookUrl = result['webhookUrl'] as string | undefined
          if (!webhookUrl) {
            showToast('Please configure a webhook URL in Settings first.', 'info')
            return
          }
          requestWebhookPermission(webhookUrl).then(() => {
            postBtn.disabled = true
            postBtn.textContent = meeting.webhookPostStatus === 'new' ? 'Posting…' : 'Reposting…'
            chrome.runtime.sendMessage(
              { v: PROTOCOL_VERSION, type: 'post_webhook_at_index', index: i },
              (response: { success: boolean; message?: ErrorObject }) => {
                loadMeetings()
                if (response?.success) {
                  showToast('Posted successfully!', 'success')
                } else {
                  if (response?.message) console.error(response.message.errorMessage)
                  showToast('Failed to post webhook.', 'error')
                }
              }
            )
          }).catch((err: unknown) => {
            showToast('Webhook permission required. Configure your URL in Settings.', 'error')
            console.error('Webhook permission error:', err)
          })
        })
      })

      deleteBtn.addEventListener('click', () => {
        showConfirm(`Delete "${meeting.title ?? 'Google Meet call'}"?`, () => {
          meetings.splice(i, 1)
          chrome.storage.local.set({ meetings }, () => loadMeetings())
        })
      })
    }

    const container = document.querySelector<HTMLElement>('#meetings-table-container')
    if (!isMeetingsTableExpanded && container && container.clientHeight > 280) {
      container.classList.add('fade-mask')
      document.querySelector('#show-all')?.setAttribute('style', 'display: block')
    }
  })
}

function initMeetings(): void {
  const recoverBtn = document.querySelector<HTMLButtonElement>('#recover-last-meeting')
  const showAllBtn = document.querySelector<HTMLButtonElement>('#show-all')

  loadMeetings()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadMeetings()
  })

  chrome.storage.onChanged.addListener(() => loadMeetings())

  recoverBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { v: PROTOCOL_VERSION, type: 'recover_last_meeting' },
      (response: { success: boolean; message?: string | ErrorObject }) => {
        loadMeetings()
        scrollTo({ top: 0, behavior: 'smooth' })
        if (response?.success) {
          showToast(
            response.message === 'No recovery needed'
              ? 'No unprocessed meetings found.'
              : 'Last meeting recovered successfully!',
            response.message === 'No recovery needed' ? 'info' : 'success'
          )
        } else {
          const err = response?.message as ErrorObject | undefined
          if (err?.errorCode === NO_MEETINGS || err?.errorCode === EMPTY_TRANSCRIPT) {
            showToast('No unprocessed meetings found.', 'info')
          } else {
            showToast('Could not recover last meeting.', 'error')
            if (err?.errorMessage) console.error(err.errorMessage)
          }
        }
      }
    )
  })

  showAllBtn?.addEventListener('click', () => {
    document.querySelector('#meetings-table-container')?.classList.remove('fade-mask')
    showAllBtn.setAttribute('style', 'display:none;')
    isMeetingsTableExpanded = true
  })
}

// ── Settings logic ────────────────────────────────────────────────────────────

function initSettings(): void {
  const autoModeRadio = document.querySelector<HTMLInputElement>('#auto-mode')
  const manualModeRadio = document.querySelector<HTMLInputElement>('#manual-mode')

  chrome.storage.sync.get(['operationMode'], (result) => {
    const mode = (result['operationMode'] as OperationMode | undefined) ?? 'auto'
    if (autoModeRadio && manualModeRadio) {
      if (mode === 'manual') {
        manualModeRadio.checked = true
      } else {
        autoModeRadio.checked = true
      }
      autoModeRadio.addEventListener('change', () => chrome.storage.sync.set({ operationMode: 'auto' }))
      manualModeRadio.addEventListener('change', () => chrome.storage.sync.set({ operationMode: 'manual' }))
    }
  })

  const autoDownloadCheckbox = document.querySelector<HTMLInputElement>('#auto-download-file')
  const autoPostCheckbox = document.querySelector<HTMLInputElement>('#auto-post-webhook')

  chrome.storage.sync.get(['autoDownloadFileAfterMeeting', 'autoPostWebhookAfterMeeting'], (result) => {
    if (autoDownloadCheckbox) {
      autoDownloadCheckbox.checked = result['autoDownloadFileAfterMeeting'] !== false
      autoDownloadCheckbox.addEventListener('change', () => {
        chrome.storage.sync.set({ autoDownloadFileAfterMeeting: autoDownloadCheckbox.checked })
      })
    }
    if (autoPostCheckbox) {
      autoPostCheckbox.checked = !!(result['autoPostWebhookAfterMeeting'])
      autoPostCheckbox.addEventListener('change', () => {
        chrome.storage.sync.set({ autoPostWebhookAfterMeeting: autoPostCheckbox.checked })
      })
    }
  })

  const webhookForm = document.querySelector<HTMLFormElement>('#webhook-url-form')
  const webhookUrlInput = document.querySelector<HTMLInputElement>('#webhook-url')
  const saveWebhookBtn = document.querySelector<HTMLButtonElement>('#save-webhook')

  if (saveWebhookBtn) saveWebhookBtn.disabled = true

  chrome.storage.sync.get(['webhookUrl'], (result) => {
    const saved = result['webhookUrl'] as string | undefined
    if (webhookUrlInput && saved) {
      webhookUrlInput.value = saved
      if (saveWebhookBtn) saveWebhookBtn.disabled = !webhookUrlInput.checkValidity()
    }
  })

  webhookUrlInput?.addEventListener('input', () => {
    if (saveWebhookBtn && webhookUrlInput) {
      saveWebhookBtn.disabled = !webhookUrlInput.checkValidity()
    }
  })

  webhookForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const url = webhookUrlInput?.value ?? ''
    if (url === '') {
      chrome.storage.sync.set({ webhookUrl: '' }, () => showToast('Webhook URL cleared.', 'success'))
      return
    }
    if (webhookUrlInput && webhookUrlInput.checkValidity()) {
      requestWebhookPermission(url).then(() => {
        chrome.storage.sync.set({ webhookUrl: url }, () => showToast('Webhook URL saved.', 'success'))
      }).catch((err: unknown) => {
        showToast('Permission required. Click Save again to retry.', 'error')
        console.error('Webhook permission error:', err)
      })
    }
  })

  const simpleRadio = document.querySelector<HTMLInputElement>('#simple-webhook-body')
  const advancedRadio = document.querySelector<HTMLInputElement>('#advanced-webhook-body')

  chrome.storage.sync.get(['webhookBodyType'], (result) => {
    const type = (result['webhookBodyType'] as WebhookBodyType | undefined) ?? 'simple'
    if (simpleRadio && advancedRadio) {
      if (type === 'advanced') {
        advancedRadio.checked = true
      } else {
        simpleRadio.checked = true
      }
      simpleRadio.addEventListener('change', () => chrome.storage.sync.set({ webhookBodyType: 'simple' }))
      advancedRadio.addEventListener('change', () => chrome.storage.sync.set({ webhookBodyType: 'advanced' }))
    }
  })
}

// ── Version ───────────────────────────────────────────────────────────────────

function initVersion(): void {
  const versionEl = document.querySelector<HTMLSpanElement>('#version')
  if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initVersion()

  const initialView = resolveInitialView()
  activateView(initialView)

  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activateView(btn.dataset['view'] as ViewId)
    })
  })

  window.addEventListener('hashchange', () => {
    activateView(resolveInitialView())
  })

  initMeetings()
  initSettings()
})
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (or only pre-existing errors unrelated to new file)

---

## Task 6: Update `vite.config.js`

Replace the `meetings` and `settings` build entries with a single `app` entry.

**Files:**
- Modify: `vite.config.js`

- [ ] **Step 1: Update the extensionScripts array**

In `vite.config.js`, replace lines 6–11:

```js
  const extensionScripts = [
    { entry: 'src/background/index.ts',           name: 'Background', output: 'background.js' },
    { entry: 'src/pages/popup/index.ts',           name: 'Popup',       output: 'popup.js' },
    { entry: 'src/pages/meetings/index.ts',       name: 'Meetings',    output: 'meetings.js' },
    { entry: 'src/pages/settings/index.ts',       name: 'Settings',    output: 'settings.js' },
  ]
```

With:

```js
  const extensionScripts = [
    { entry: 'src/background/index.ts',  name: 'Background', output: 'background.js' },
    { entry: 'src/pages/popup/index.ts', name: 'Popup',      output: 'popup.js' },
    { entry: 'src/pages/app/index.ts',   name: 'App',        output: 'app.js' },
  ]
```

- [ ] **Step 2: Run the build to confirm it compiles**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds, `extension/app.js` is created, no `meetings.js` or `settings.js` are produced.

```bash
ls extension/app.js
```
Expected: file exists.

- [ ] **Step 3: Commit**

```bash
git add extension/shared.css extension/app.css extension/popup.css extension/app.html src/pages/app/index.ts vite.config.js
git commit -m "feat: consolidate meetings + settings into single app.html with tab navigation"
```

---

## Task 7: Update `extension/popup.html`

Replace the inline `<style>` block and the `.nav-row` div with links to `shared.css` / `popup.css` and a single `#open-app` button.

**Files:**
- Modify: `extension/popup.html`

- [ ] **Step 1: Replace the entire file content**

```html
<!-- popup.html -->
<!DOCTYPE html>
<html lang="en">

<head>
  <title>Meet Transcripts</title>
  <link rel="stylesheet" href="shared.css">
  <link rel="stylesheet" href="popup.css">
</head>

<body>
  <div class="header">
    <div class="header-meta">
      <h1>Meet Transcripts</h1>
      <span class="version" id="version"></span>
    </div>
    <img class="logo" src="./icons/logo.svg" alt="Meet Transcripts logo" />
  </div>

  <div class="card">
    <div class="status-row">
      <span class="status-dot idle" id="status-dot"></span>
      <span class="status-label idle" id="status-label">Open a Google Meet to start</span>
    </div>
    <div id="status-meeting" hidden>
      <div class="status-meeting-row">
        <strong id="status-meeting-title"></strong>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-label">Capture mode</div>
    <div class="mode-toggle">
      <div class="mode-option">
        <label for="auto-mode">
          <input type="radio" name="mode" id="auto-mode" />
          Auto
        </label>
      </div>
      <div class="mode-option">
        <label for="manual-mode">
          <input type="radio" name="mode" id="manual-mode" />
          Manual
        </label>
      </div>
    </div>
    <p class="mode-desc" id="mode-desc">Captures every meeting automatically</p>
  </div>

  <button id="open-app">
    <svg width="13" height="11" viewBox="0 0 13 11" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="13" height="2" rx="1"/>
      <rect x="0" y="4.5" width="13" height="2" rx="1"/>
      <rect x="0" y="9" width="13" height="2" rx="1"/>
    </svg>
    Open Meetings
  </button>

  <div class="footer">
    <a href="https://github.com/patrick204nqh/meet-transcripts#readme" target="_blank">Help</a>
    <span class="footer-sep">&#9679;</span>
    <a href="https://github.com/patrick204nqh/meet-transcripts/issues" target="_blank">Report a bug</a>
  </div>

  <script src="popup.js"></script>
</body>

</html>
```

- [ ] **Step 2: Verify the file looks correct**

```bash
grep -n "nav-row\|meetings.html\|settings.html\|open-app" extension/popup.html
```
Expected output contains `open-app` and does NOT contain `nav-row`, `meetings.html`, or `settings.html`.

---

## Task 8: Update `src/pages/popup/index.ts`

Remove the old nav button handling (there was none — the buttons were plain `<a>` tags). Add the `#open-app` click handler that focuses an existing `app.html` tab or creates one.

**Files:**
- Modify: `src/pages/popup/index.ts`

- [ ] **Step 1: Add the open-app handler inside the existing `DOMContentLoaded` listener**

At the bottom of the `DOMContentLoaded` callback (after the `chrome.storage.onChanged.addListener` call and before the closing `}`), add:

```typescript
  const openAppBtn = document.querySelector<HTMLButtonElement>('#open-app')
  openAppBtn?.addEventListener('click', () => {
    const appUrl = chrome.runtime.getURL('app.html')
    chrome.tabs.query({ url: appUrl }, (tabs) => {
      if (tabs.length > 0 && tabs[0]?.id !== undefined) {
        chrome.tabs.update(tabs[0].id, { active: true })
        if (tabs[0].windowId !== undefined) {
          chrome.windows.update(tabs[0].windowId, { focused: true })
        }
      } else {
        chrome.tabs.create({ url: `${appUrl}#meetings` })
      }
    })
  })
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Build and confirm popup.js is regenerated**

```bash
npm run build 2>&1 | grep -E "Popup|error"
```
Expected: Popup entry builds without errors.

- [ ] **Step 4: Commit**

```bash
git add extension/popup.html src/pages/popup/index.ts
git commit -m "feat: replace popup nav buttons with single open-app button using tab focus"
```

---

## Task 9: Migrate `tests/meetings.spec.js`

Update the `beforeEach` navigation URL and one nav-link selector. No test logic changes needed.

**Files:**
- Modify: `tests/meetings.spec.js`

- [ ] **Step 1: Update `beforeEach` URL**

Find (line 43):
```js
    await page.goto(`chrome-extension://${extensionId}/meetings.html`);
```
Replace with:
```js
    await page.goto(`chrome-extension://${extensionId}/app.html#meetings`);
```

- [ ] **Step 2: Update the nav-link selector**

Find (line 50):
```js
    await expect(page.locator('a[href="settings.html"]')).toBeVisible();
```
Replace with:
```js
    await expect(page.locator('button[data-view="settings"]')).toBeVisible();
```

- [ ] **Step 3: Run the meetings tests to confirm they pass**

```bash
npx playwright test tests/meetings.spec.js --reporter=line
```
Expected: all tests pass.

---

## Task 10: Migrate `tests/settings.spec.js`

Update the `beforeEach` URL and two selectors: the `h1` assertion and the nav-link assertion.

**Files:**
- Modify: `tests/settings.spec.js`

- [ ] **Step 1: Update `beforeEach` URL**

Find (line 5):
```js
    await page.goto(`chrome-extension://${extensionId}/settings.html`);
```
Replace with:
```js
    await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
```

- [ ] **Step 2: Update the `h1` assertion**

In the `'renders expected page structure'` test, find (line 18):
```js
    await expect(page.locator('h1')).toHaveText('Settings');
```
Replace with:
```js
    await expect(page.locator('button.tab-btn.active')).toHaveText(/Settings/);
```

- [ ] **Step 3: Update the nav-link assertion**

In the same test, find (line 27):
```js
    await expect(page.locator('a[href="meetings.html"]')).toBeVisible();
```
Replace with:
```js
    await expect(page.locator('button[data-view="meetings"]')).toBeVisible();
```

- [ ] **Step 4: Run the settings tests to confirm they pass**

```bash
npx playwright test tests/settings.spec.js --reporter=line
```
Expected: all tests pass.

---

## Task 11: Migrate `tests/popup.spec.js`

Update two nav button selectors. The popup now has `#open-app` instead of two `<a>` tags.

**Files:**
- Modify: `tests/popup.spec.js`

- [ ] **Step 1: Update the nav selector assertions**

In the `'renders expected page structure'` test, find (lines 13–14):
```js
    await expect(page.locator('a[href="meetings.html"]')).toBeVisible();
    await expect(page.locator('a[href="settings.html"]')).toBeVisible();
```
Replace with:
```js
    await expect(page.locator('#open-app')).toBeVisible();
```

- [ ] **Step 2: Run the popup tests to confirm they pass**

```bash
npx playwright test tests/popup.spec.js --reporter=line
```
Expected: all tests pass.

---

## Task 12: Migrate `tests/security.spec.js`

Update `SOURCE_FILES` and the meetings page URL in the network request test.

**Files:**
- Modify: `tests/security.spec.js`

- [ ] **Step 1: Update `SOURCE_FILES`**

Find (lines 14–20):
```js
const SOURCE_FILES = [
  'background.js',
  'platforms/google-meet.js',
  'popup.js',
  'meetings.js',
  'settings.js',
];
```
Replace with:
```js
const SOURCE_FILES = [
  'background.js',
  'platforms/google-meet.js',
  'popup.js',
  'app.js',
];
```

- [ ] **Step 2: Update the meetings page network test URL**

Find (lines 54–58):
```js
  test('meetings page makes no external network requests', async ({ page, extensionId }) => {
    const external = await collectExternalRequests(
      page, extensionId,
      `chrome-extension://${extensionId}/meetings.html`
    );
```
Replace with:
```js
  test('meetings page makes no external network requests', async ({ page, extensionId }) => {
    const external = await collectExternalRequests(
      page, extensionId,
      `chrome-extension://${extensionId}/app.html#meetings`
    );
```

- [ ] **Step 3: Run the security tests to confirm they pass**

```bash
npx playwright test tests/security.spec.js --reporter=line
```
Expected: all tests pass.

---

## Task 13: Delete old files and run the full test suite

Remove the now-superseded source files and compiled outputs, then confirm the full test suite is green.

**Files:**
- Delete: `extension/meetings.html`, `extension/settings.html`
- Delete: `extension/meetings.js`, `extension/settings.js`
- Delete: `src/pages/meetings/index.ts`, `src/pages/settings/index.ts`

- [ ] **Step 1: Remove superseded extension HTML and JS files**

```bash
rm extension/meetings.html extension/settings.html extension/meetings.js extension/settings.js
```

- [ ] **Step 2: Remove superseded TypeScript source files**

```bash
rm src/pages/meetings/index.ts src/pages/settings/index.ts
```

- [ ] **Step 3: Rebuild to confirm nothing references deleted files**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds, no errors referencing deleted paths.

- [ ] **Step 4: Run the full Playwright test suite**

```bash
npx playwright test --reporter=line
```
Expected: all tests pass with 0 failures.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove superseded meetings.html, settings.html and their source files"
```

---

## Self-review

**Spec coverage:**
- ✅ meetings.html + settings.html consolidated into app.html
- ✅ Hash routing (#meetings, #settings) with native hashchange listener
- ✅ Tab nav with brand-colored active state (matches mode-toggle pattern)
- ✅ 100ms opacity fade for view transitions
- ✅ Popup nav-row replaced with single #open-app button
- ✅ chrome.tabs.query focus-if-exists logic
- ✅ CSS extracted to shared.css + app.css + popup.css
- ✅ showToast / showConfirm / requestWebhookPermission deduplicated
- ✅ Capture mode toggle stays in popup + settings (storage.sync keeps them in sync)
- ✅ ARIA: role="tablist", role="tab", aria-selected, role="tabpanel", aria-controls
- ✅ All 4 test files migrated
- ✅ Old files deleted

**Placeholder scan:** No TBD, TODO, or "similar to Task N" patterns found.

**Type consistency:** `ViewId`, `Meeting`, `ErrorObject`, `OperationMode`, `WebhookBodyType`, `MeetingTabId` are all imported from existing types at the top of `src/pages/app/index.ts`. `activateView(ViewId)` is called consistently throughout.
