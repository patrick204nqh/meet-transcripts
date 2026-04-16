# Architecture

This document describes the architecture of the meet-transcripts Chrome extension.

---

## Extension architecture

meet-transcripts is a **Manifest v3 Chrome extension** composed of three layers:
a background service worker, a content script for Google Meet, and a UI layer
(popup + meetings page).

```mermaid
graph TD
    subgraph Chrome["Chrome Browser"]
        subgraph Extension["meet-transcripts Extension"]
            BG["Background Service Worker\nbackground.js\n─────────────────\nMeeting lifecycle\nWebhook dispatch\nFile download\nStorage management"]

            subgraph ContentScripts["Content Scripts"]
                GM["content-google-meet.js\nGoogle Meet caption capture"]
            end

            subgraph UI["Extension UI"]
                POP["popup.html / popup.js\nMode toggle · Meeting list link"]
                MTG["meetings.html / meetings.js\nWebhook config · Meeting history"]
            end
        end

        subgraph Storage["chrome.storage"]
            SYNC["storage.sync\nSettings & preferences"]
            LOCAL["storage.local\nIn-progress transcript\nLast 10 meetings"]
        end
    end

    subgraph MeetingPlatforms["Meeting Platforms"]
        GMeet["meet.google.com"]
    end

    subgraph External["External (configurable)"]
        WH["User webhook\nany HTTP endpoint"]
    end

    GMeet -->|DOM events| GM

    GM -->|Transcript chunks| BG

    BG <-->|Read / write| SYNC
    BG <-->|Read / write| LOCAL

    BG -->|POST transcript| WH
    BG -->|Download .txt| Chrome

    POP <-->|chrome.runtime messages| BG
    MTG <-->|chrome.runtime messages| BG
    POP <-->|Read settings| SYNC
    MTG <-->|Read settings / history| SYNC
```

---

## Data flow: transcript capture to output

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

## Transcript storage model

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
        string inProgressTranscript "Active meeting buffer"
        array meetings "Last 10 completed meetings"
    }

    MEETING {
        string title
        string platform "Google Meet"
        string timestamp
        string transcript
    }

    LOCAL_STORAGE ||--o{ MEETING : "stores up to 10"
```

---

## Key files reference

| File | Role |
|------|------|
| `extension/manifest.json` | Extension metadata, permissions, host matches |
| `extension/background.js` | Service worker — central orchestrator |
| `extension/content-google-meet.js` | Google Meet DOM observer and transcript capture |
| `extension/popup.html/js` | Extension popup UI |
| `extension/meetings.html/js` | Meeting history and webhook configuration UI |
| `types/index.js` | JSDoc type definitions |
| `docs/decisions/` | Architecture decision records |
