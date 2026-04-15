# Architecture

This document describes the architecture of the TranscripTonic Chrome extension
as it runs in this fork, and how the fork itself is maintained.

---

## Extension architecture

TranscripTonic is a **Manifest v3 Chrome extension** composed of three layers:
a background service worker, platform-specific content scripts, and a UI layer
(popup + meetings page).

```mermaid
graph TD
    subgraph Chrome["Chrome Browser"]
        subgraph Extension["TranscripTonic Extension"]
            BG["Background Service Worker\nbackground.js\n─────────────────\nMeeting lifecycle\nWebhook dispatch\nFile download\nStorage management"]

            subgraph ContentScripts["Content Scripts (injected per platform)"]
                GM["content-google-meet.js\nGoogle Meet capture"]
                ZM["content-zoom.js\nZoom capture (beta)"]
                TE["content-teams.js\nTeams capture (beta)"]
            end

            subgraph UI["Extension UI"]
                POP["popup.html / popup.js\nStatus · Mode toggle · Meeting list"]
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
        Zoom["*.zoom.us"]
        Teams["teams.microsoft.com\nteams.live.com"]
    end

    subgraph External["External (configurable)"]
        WH["User webhook\ne.g. n8n, Google Apps Script"]
        STATUS["Status endpoint\nMinimum version check"]
    end

    GMeet -->|DOM events| GM
    Zoom -->|DOM events| ZM
    Teams -->|DOM events| TE

    GM -->|Transcript chunks| BG
    ZM -->|Transcript chunks| BG
    TE -->|Transcript chunks| BG

    BG <-->|Read / write| SYNC
    BG <-->|Read / write| LOCAL

    BG -->|POST transcript| WH
    BG -->|Download .txt| Chrome

    GM -->|Version check on load| STATUS

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
        bool wantGoogleMeet
        bool wantZoom
        bool wantTeams
        string webhookUrl
        string webhookBodyType "simple | advanced"
    }

    LOCAL_STORAGE {
        string inProgressTranscript "Active meeting buffer"
        array meetings "Last 10 completed meetings"
    }

    MEETING {
        string title
        string platform "Google Meet | Zoom | Teams"
        string timestamp
        string transcript
    }

    LOCAL_STORAGE ||--o{ MEETING : "stores up to 10"
```

---

## Fork maintenance flow

```mermaid
flowchart LR
    UP["upstream\nvivek-nexus/transcriptonic\nmain"]
    US["upstream-sync branch\n(this repo)"]
    MA["main branch\n(this repo)\nour stable version"]

    UP -->|"CI: quarterly\ngit reset --hard"| US
    US -->|"CI: opens PR\nif new commits exist"| PR["Pull Request\nupstream-sync → main"]
    PR -->|"Manual review\nresolve conflicts\npreserve customizations"| MA

    MA -->|"Manual install\nunpacked extension"| DEV["Developer Chrome\n(sideloaded)"]
```

---

## Key files reference

| File | Role |
|------|------|
| `extension/manifest.json` | Extension metadata, permissions, host matches |
| `extension/background.js` | Service worker — central orchestrator |
| `extension/content-google-meet.js` | Google Meet DOM observer and transcript capture |
| `extension/content-zoom.js` | Zoom capture (beta) |
| `extension/content-teams.js` | Teams capture (beta) |
| `extension/popup.html/js` | Extension popup UI |
| `extension/meetings.html/js` | Meeting history and webhook configuration UI |
| `types/index.js` | JSDoc type definitions |
| `.github/workflows/upstream-sync.yml` | Quarterly upstream sync CI |
| `CUSTOMIZATIONS.md` | Diff log: what we changed from upstream |
| `docs/adr/` | Architecture decision records |
