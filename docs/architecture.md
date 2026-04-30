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
        Container(cs, "Content Script", "platforms/google-meet.js", "Injected into meet.google.com — observes DOM caption mutations and extracts speaker + text chunks")
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
        Component(msgHandler, "Message Handler", "message-handler.ts", "Entry point — routes incoming chrome.runtime messages; enforces protocol version gate (v field required)")
        Component(lifecycle, "Meeting Lifecycle", "lifecycle.ts", "Clears tab ID and applies deferred extension updates after meeting processing completes")
        Component(evtListeners, "Event Listeners", "event-listeners.ts", "Handles tab removal, tab navigation away from call, runtime update, permissions, and install events")
        Component(storeMgr, "Storage Repo", "shared/storage-repo.ts", "createStorageLocal / createStorageSync factories injected with IBrowserStorage; Chrome singletons for backward compat")
        Component(meetingSvc, "Meeting Service", "services/meeting.ts", "Orchestrates pickup, finalize, and recover meeting use-cases")
        Component(webhookSvc, "Webhook Service", "services/webhook.ts", "Builds payload and POSTs to the configured webhook URL; writes status back to storage")
        Component(downloadSvc, "Download Service", "services/download.ts", "Triggers browser download of the transcript as a .txt file via chrome.downloads")
        Component(formatters, "Formatters", "shared/formatters.ts", "Pure functions: transcript/chat string rendering, filename sanitisation, webhook body construction")
    }

    Container(cs, "Content Script", "platforms/google-meet.js", "Caption capture")
    Container(popup, "Popup UI", "popup.html/js", "Mode toggle")
    Container(meetings, "Meetings UI", "meetings.html/js", "History & config")
    ContainerDb(sync, "chrome.storage.sync", "Chrome Storage API", "Settings")
    ContainerDb(local, "chrome.storage.local", "Chrome Storage API", "Transcript data")
    System_Ext(webhookEp, "Webhook Endpoint", "External HTTP endpoint")

    Rel(cs, msgHandler, "Versioned meeting events", "chrome.runtime.sendMessage (v field required)")
    Rel(popup, msgHandler, "Commands / queries", "chrome.runtime.sendMessage")
    Rel(meetings, msgHandler, "Commands / queries", "chrome.runtime.sendMessage")

    Rel(msgHandler, meetingSvc, "Delegates meeting lifecycle use-cases")
    Rel(msgHandler, downloadSvc, "Delegates download requests")
    Rel(msgHandler, webhookSvc, "Delegates webhook retry requests")
    Rel(msgHandler, lifecycle, "Calls clearTabIdAndApplyUpdate after meeting ends")

    Rel(meetingSvc, storeMgr, "Reads current meeting data, reads/writes meetings list")
    Rel(meetingSvc, downloadSvc, "Triggers auto-download on finalize")
    Rel(meetingSvc, webhookSvc, "Triggers auto-post on finalize")

    Rel(downloadSvc, storeMgr, "Reads meetings list")
    Rel(downloadSvc, formatters, "buildTranscriptFilename, getTranscriptString")
    Rel(webhookSvc, storeMgr, "Reads meetings list, webhook settings; writes status")
    Rel(webhookSvc, formatters, "buildWebhookBody")

    Rel(storeMgr, sync, "Read / write")
    Rel(storeMgr, local, "Read / write")
    Rel(webhookSvc, webhookEp, "HTTP POST")

    UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

---

## Source layer structure

The TypeScript source is the canonical representation of the codebase. Vite compiles it to two IIFE bundles placed in `extension/`.

```
src/
├── types.ts                    # Domain types (Meeting, TranscriptBlock, ExtensionResponse, …)
├── browser/                    # Browser API port — interfaces + Chrome concrete implementations
│   ├── types.ts                # IBrowserStorage, IBrowserRuntime interfaces
│   └── chrome.ts               # ChromeStorage, ChromeRuntime — wire interfaces to chrome.*
├── platforms/                  # Platform adapters — all DOM knowledge lives here
│   ├── types.ts                # IPlatformAdapter interface
│   └── google-meet/
│       ├── adapter.ts          # GoogleMeetAdapter — DOM selectors + parsing logic
│       └── index.ts            # Content script entry point → builds to extension/platforms/google-meet.js
├── background/                 # Chrome API I/O adapters — no business logic
│   ├── message-handler.ts      # chrome.runtime.onMessage entry point → builds to extension/background.js
│   ├── lifecycle.ts            # Post-meeting cleanup and deferred update handling
│   ├── event-listeners.ts      # Tab, update, permissions, install event wiring
│   └── content-script.ts       # Content script registration via chrome.scripting
├── content/                    # DOM observers and session lifecycle
│   ├── core/                   # Session lifecycle classes
│   │   ├── meeting-session.ts  # MeetingSession class — drives session start/end
│   │   └── observer-manager.ts # Owns transcript/chat/watchdog MutationObserver lifetimes
│   ├── observer/               # DOM MutationObserver implementations
│   │   ├── transcript-observer.ts
│   │   └── chat-observer.ts
│   ├── state-sync.ts           # Persists content state to chrome.storage.local
│   ├── state.ts                # In-memory state + createSessionState() factory
│   ├── ui.ts                   # Notification banner, status pulse, DOM wait utilities
│   ├── pip-capture.ts          # Document Picture-in-Picture caption capture
│   └── constants.ts            # meetingSoftware, mutationConfig
├── services/                   # Use-case orchestration — owns all Chrome API calls for I/O
│   ├── meeting.ts              # pickupLastMeeting, finalizeMeeting, recoverLastMeeting
│   ├── download.ts             # DownloadService — chrome.downloads + transcript formatting
│   └── webhook.ts              # WebhookService — fetch + notification + status write-back
└── shared/                     # Pure utilities, no side-effects
    ├── errors.ts               # ErrorCode constants + ExtensionError class + ErrorCategory
    ├── formatters.ts           # Text formatting, filename sanitisation, webhook body builder
    ├── logger.ts               # Leveled logger ([meet-transcripts] prefix; debug silenced in prod)
    ├── messages.ts             # sendMessage wrapper + IBrowserRuntime injection
    ├── protocol.ts             # Versioned ExtensionMessage types + msg() factory
    └── storage-repo.ts         # createStorageLocal / createStorageSync + Chrome singletons
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

    Note over Meet,Out: Meeting ends — three paths converge on finalizeMeeting()
    alt User clicks "End call" in Meet UI
        CS->>BG: meeting_ended (reason: user_click)
    else User closes the Meet tab
        BG->>BG: chrome.tabs.onRemoved
    else Meet navigates the tab away from the call URL (e.g. PiP "Leave call")
        BG->>BG: chrome.tabs.onUpdated (URL no longer matches /meet.google.com/abc-defg-hij/)
    end

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
| `extension/platforms/google-meet.js` | Compiled content script — built from `src/platforms/google-meet/index.ts` |
| `extension/popup.html/js` | Extension popup UI (plain JS, not compiled) |
| `extension/meetings.html/js` | Meeting history and webhook configuration UI (plain JS, not compiled) |
| `src/types.ts` | Domain types; `ExtensionMessage` re-exported from `protocol.ts` |
| `src/browser/types.ts` | `IBrowserStorage`, `IBrowserRuntime` port interfaces |
| `src/platforms/types.ts` | `IPlatformAdapter` interface |
| `src/platforms/google-meet/adapter.ts` | All Google Meet DOM selectors and mutation parsing |
| `src/content/core/meeting-session.ts` | `MeetingSession` class — session lifecycle |
| `src/shared/errors.ts` | `ErrorCode` constants + `ExtensionError` class + `ErrorCategory` |
| `src/shared/logger.ts` | Leveled logger — `log.debug/info/warn/error`; debug suppressed in production |
| `src/shared/protocol.ts` | Versioned `ExtensionMessage` types + `msg()` factory |
| `src/shared/storage-repo.ts` | `createStorageLocal` / `createStorageSync` + Chrome singletons |
| `src/shared/formatters.ts` | Pure text formatting, filename sanitisation, webhook body builder |
| `src/services/meeting.ts` | Meeting use-case orchestration |
| `vite.config.js` | Vite build — two IIFE bundles (background + content script) |
| `docs/decisions/` | Architecture decision records |
