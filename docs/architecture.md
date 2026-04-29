# Architecture

This document describes the architecture of the Meet Transcripts Chrome extension using the [C4 model](https://c4model.com/).

---

## Level 1 — System Context

Who uses the system and what external systems does it interact with.

```mermaid
C4Context
    title System Context — Meet Transcripts

    Person(user, "User", "Joins Google Meet calls and wants transcripts exported automatically")

    System(ext, "Meet Transcripts", "Chrome extension that captures live captions from Google Meet and exports transcripts as files or webhook payloads")

    System_Ext(gmeet, "Google Meet", "Web-based video conferencing at meet.google.com")
    System_Ext(webhook, "Webhook Endpoint", "User-configured HTTP endpoint (e.g. Zapier, Make, custom API)")

    Rel(user, ext, "Configures settings, views meeting history")
    Rel(ext, gmeet, "Observes live captions via DOM mutations")
    Rel(ext, webhook, "POSTs transcript payload on meeting end")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

---

## Level 2 — Container

The internal containers (deployable/runnable units) inside the extension.

```mermaid
C4Container
    title Container Diagram — Meet Transcripts Extension

    Person(user, "User", "Chrome browser user")

    Container_Boundary(ext, "Meet Transcripts Extension (MV3)") {
        Container(bg, "Background Service Worker", "background.js", "Central orchestrator: meeting lifecycle, webhook dispatch, file download, storage management")
        Container(cs, "Content Script", "google-meet.js", "Injected into meet.google.com — observes DOM caption mutations and extracts speaker + text chunks")
        Container(popup, "Popup UI", "popup.html / popup.js", "Mode toggle (auto / manual), link to meetings page")
        Container(meetings, "Meetings UI", "meetings.html / meetings.js", "Meeting history viewer and webhook configuration")
    }

    ContainerDb(sync, "chrome.storage.sync", "Chrome Storage API", "Persisted user settings: operationMode, webhookUrl, webhookBodyType, download/post flags")
    ContainerDb(local, "chrome.storage.local", "Chrome Storage API", "Ephemeral state: in-progress transcript buffer, last 10 completed meetings")

    System_Ext(gmeet, "Google Meet", "meet.google.com")
    System_Ext(webhook, "Webhook Endpoint", "User-configured HTTP endpoint")

    Rel(user, popup, "Opens to toggle mode or navigate")
    Rel(user, meetings, "Views history, configures webhook")
    Rel(gmeet, cs, "Fires DOM MutationObserver events")
    Rel(cs, bg, "Sends transcript chunks", "chrome.runtime.sendMessage")
    Rel(bg, sync, "Reads / writes settings", "chrome.storage API")
    Rel(bg, local, "Reads / writes transcript data", "chrome.storage API")
    Rel(bg, webhook, "POSTs transcript on meeting end", "fetch / XMLHttpRequest")
    Rel(popup, bg, "Sends commands, receives status", "chrome.runtime messaging")
    Rel(meetings, bg, "Sends commands, receives history", "chrome.runtime messaging")
    Rel(popup, sync, "Reads current settings", "chrome.storage API")
    Rel(meetings, sync, "Reads settings and meeting history", "chrome.storage API")

    UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

---

## Level 3 — Component (Background Service Worker)

Internal components of the central orchestrator.

```mermaid
C4Component
    title Component Diagram — Background Service Worker (background.js)

    Container_Boundary(bg, "Background Service Worker") {
        Component(msgHandler, "Message Handler", "message-handler.ts", "Entry point — routes incoming chrome.runtime messages from content script and UI containers")
        Component(lifecycle, "Meeting Lifecycle", "lifecycle.ts", "Clears tab ID and applies deferred extension updates after meeting processing completes")
        Component(evtListeners, "Event Listeners", "event-listeners.ts", "Handles tab removal, runtime update, permissions, and install events")
        Component(storeMgr, "Storage Repo", "shared/storage-repo.ts", "Abstracts all chrome.storage.sync and .local reads and writes")
        Component(meetingSvc, "Meeting Service", "services/meeting.ts", "Orchestrates pickup, finalize, and recover meeting use-cases")
        Component(webhookAdp, "Webhook Adapter", "background/webhook.ts", "Builds payload and POSTs to the configured webhook URL; writes status back to storage")
        Component(downloadAdp, "Download Adapter", "background/download.ts", "Triggers browser download of the transcript as a .txt file via chrome.downloads")
        Component(formatters, "Formatters", "shared/formatters.ts", "Pure functions: transcript/chat string rendering, filename sanitisation, webhook body construction")
    }

    Container(cs, "Content Script", "google-meet.js", "Caption capture")
    Container(popup, "Popup UI", "popup.html/js", "Mode toggle")
    Container(meetings, "Meetings UI", "meetings.html/js", "History & config")
    ContainerDb(sync, "chrome.storage.sync", "Chrome Storage API", "Settings")
    ContainerDb(local, "chrome.storage.local", "Chrome Storage API", "Transcript data")
    System_Ext(webhookEp, "Webhook Endpoint", "External HTTP endpoint")

    Rel(cs, msgHandler, "Transcript chunk / meeting events", "chrome.runtime.sendMessage")
    Rel(popup, msgHandler, "Commands / queries", "chrome.runtime.sendMessage")
    Rel(meetings, msgHandler, "Commands / queries", "chrome.runtime.sendMessage")

    Rel(msgHandler, meetingSvc, "Delegates meeting lifecycle use-cases")
    Rel(msgHandler, downloadAdp, "Delegates download requests")
    Rel(msgHandler, webhookAdp, "Delegates webhook retry requests")
    Rel(msgHandler, lifecycle, "Calls clearTabIdAndApplyUpdate after meeting ends")

    Rel(meetingSvc, storeMgr, "Reads current meeting data, reads/writes meetings list")
    Rel(meetingSvc, downloadAdp, "Triggers auto-download on finalize")
    Rel(meetingSvc, webhookAdp, "Triggers auto-post on finalize")

    Rel(downloadAdp, storeMgr, "Reads meetings list")
    Rel(downloadAdp, formatters, "buildTranscriptFilename, getTranscriptString")
    Rel(webhookAdp, storeMgr, "Reads meetings list, webhook settings; writes status")
    Rel(webhookAdp, formatters, "buildWebhookBody")

    Rel(storeMgr, sync, "Read / write")
    Rel(storeMgr, local, "Read / write")
    Rel(webhookAdp, webhookEp, "HTTP POST")

    UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

---

## Source layer structure

The TypeScript source is the canonical representation of the codebase. Vite compiles it to two IIFE bundles placed in `extension/`.

```
src/
├── types.ts                    # Domain types (Meeting, TranscriptBlock, ExtensionResponse, …)
├── background/                 # Chrome API I/O adapters — no business logic
│   ├── message-handler.ts      # chrome.runtime.onMessage entry point → builds to extension/background.js
│   ├── lifecycle.ts            # Post-meeting cleanup and deferred update handling
│   ├── event-listeners.ts      # Tab, update, permissions, install event wiring
│   ├── content-script.ts       # Content script registration via chrome.scripting
│   ├── download.ts             # chrome.downloads adapter
│   └── webhook.ts              # fetch adapter + notification
├── content/                    # DOM observers — builds to extension/google-meet.js
│   ├── google-meet.ts          # Content script entry point
│   ├── meeting-session.ts      # Extension status check + meeting routines
│   ├── state-sync.ts           # Persists content state to chrome.storage.local
│   ├── state.ts                # In-memory content script state
│   ├── ui.ts                   # Notification banner, status pulse
│   ├── constants.ts            # meetingSoftware constant
│   └── observer/               # DOM MutationObserver implementations
│       ├── transcript-observer.ts
│       └── chat-observer.ts
├── services/                   # Use-case orchestration — no Chrome APIs
│   ├── meeting.ts              # pickupLastMeeting, finalizeMeeting, recoverLastMeeting
│   ├── download.ts             # DownloadService façade
│   └── webhook.ts              # WebhookService façade
└── shared/                     # Pure utilities, no side-effects
    ├── errors.ts               # ErrorCode constants
    ├── formatters.ts           # Text formatting, filename sanitisation, webhook body builder
    ├── messages.ts             # sendMessage wrapper, recoverLastMeeting helper
    └── storage-repo.ts         # StorageLocal / StorageSync typed abstractions
```

---

## Data flow — transcript capture to output

```mermaid
sequenceDiagram
    participant Meet as Google Meet (DOM)
    participant CS as Content Script
    participant BG as Background Worker
    participant Store as chrome.storage.local
    participant Out as Output

    Meet->>CS: Caption element mutation
    CS->>CS: Parse speaker + text
    CS->>BG: chrome.runtime.sendMessage(chunk)
    BG->>Store: Append chunk to in-progress transcript

    Note over Meet,Out: Meeting ends (tab close / leave)

    BG->>Store: Read full transcript
    BG->>Out: Download as .txt file
    BG->>Out: POST to webhook URL (if configured)
    BG->>Store: Write to last-10-meetings list
    BG->>Store: Clear in-progress transcript
```

---

## Storage model

```mermaid
erDiagram
    SYNC_STORAGE {
        string operationMode "auto | manual"
        bool autoDownloadFileAfterMeeting
        bool autoPostWebhookAfterMeeting
        string webhookUrl
        string webhookBodyType "simple | advanced"
    }

    LOCAL_STORAGE {
        string startTimestamp "Active meeting buffer"
        string title
        string software
        array transcript
        array chatMessages
        number meetingTabId "null | 'processing' | tab id"
        bool deferredUpdatePending
        array meetings "Last 10 completed meetings"
    }

    MEETING {
        string software "Google Meet | undefined"
        string title
        string startTimestamp
        string endTimestamp
        array transcript
        array chatMessages
        string webhookPostStatus "new | failed | successful"
    }

    LOCAL_STORAGE ||--o{ MEETING : "stores up to 10"
```

---

## Key files reference

| File | Role |
|------|------|
| `extension/manifest.json` | Extension metadata, permissions, host matches |
| `extension/background.js` | Compiled service worker — built from `src/background/message-handler.ts` |
| `extension/google-meet.js` | Compiled content script — built from `src/content/google-meet.ts` |
| `extension/popup.html/js` | Extension popup UI (plain JS, not compiled) |
| `extension/meetings.html/js` | Meeting history and webhook configuration UI (plain JS, not compiled) |
| `src/types.ts` | All domain types and message/response contracts |
| `src/shared/errors.ts` | `ErrorCode` constants |
| `src/shared/storage-repo.ts` | `StorageLocal` / `StorageSync` typed wrappers |
| `src/shared/formatters.ts` | Pure text formatting, filename sanitisation, webhook body builder |
| `src/services/meeting.ts` | Meeting use-case orchestration |
| `vite.config.js` | Vite build — two IIFE bundles (background + content script) |
| `docs/decisions/` | Architecture decision records |
