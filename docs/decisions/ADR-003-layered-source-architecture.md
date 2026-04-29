# ADR-003: Layered source architecture

**Date:** 2026-04-29
**Status:** Accepted

---

## Context

After the TypeScript migration (ADR-002), all source lived under `src/` but without a defined module boundary model. The original JavaScript had mixed concerns in a single file: the background service worker performed DOM-unrelated use-case logic (deciding whether to download and post), storage operations, Chrome API calls, and data formatting in the same functions. As the service grew, this caused:

- **Untestable business logic.** Logic gated on `chrome.storage` or `chrome.downloads` calls could not be unit-tested without a full Chrome extension environment.
- **Invisible coupling.** Renaming a storage key or changing an error shape required grep-based searches rather than type-directed refactoring.
- **Layering violations.** The services façade files (`meeting-service.ts`, `download-service.ts`, `webhook-service.ts`) were initially no-op pass-throughs that added a call level without isolating concerns.

A plan to resolve this was documented in `docs/plans/2026-04-29-codebase-standardization.md` and implemented across two PRs.

---

## Decision

Organise `src/` into four layers with explicit dependency rules:

```
src/
├── types.ts          # Domain types — no imports
├── shared/           # Pure utilities — may import types only
├── services/         # Use-case orchestration — may import shared/ and types
├── background/       # Chrome API adapters — may import services/, shared/, types
└── content/          # DOM observers — may import shared/ and types
```

**Layer contracts:**

| Layer | Allowed imports | Prohibited |
|-------|----------------|------------|
| `shared/` | `types.ts` only | Chrome APIs, services |
| `services/` | `shared/`, `types.ts`, `background/` adapters (download, webhook) | Direct `chrome.*` calls |
| `background/` | `services/`, `shared/`, `types.ts` | Business logic — only calls Chrome APIs or delegates to services |
| `content/` | `shared/`, `types.ts` | `services/`, `background/` (communication is via `sendMessage`) |

**What lives where:**

- `shared/formatters.ts` — Pure text rendering, filename sanitisation, webhook body construction. No Chrome APIs, no I/O.
- `shared/storage-repo.ts` — Typed `StorageLocal` / `StorageSync` wrappers. The single point where Chrome storage keys are named.
- `shared/errors.ts` — `ErrorCode` constants. Shared by all layers.
- `services/meeting.ts` — `pickupLastMeeting`, `finalizeMeeting`, `recoverLastMeeting`. Owns the meeting lifecycle state machine. Calls `StorageLocal`, `DownloadService`, `WebhookService`.
- `background/download.ts` — `chrome.downloads` adapter only. Delegates filename logic to `formatters.ts`.
- `background/webhook.ts` — `fetch` adapter + Chrome notification. Delegates body construction to `formatters.ts`.
- `background/message-handler.ts` — Routes `chrome.runtime.onMessage` events to services and adapters. No business logic.

---

## Consequences

**Positive**

- `shared/formatters.ts` functions can be tested with plain Node.js — no Chrome environment needed
- The `services/` layer can be tested by mocking `StorageLocal` and the adapter façades without Chrome APIs
- Type-directed refactoring: changing a type in `types.ts` propagates errors to all consumers immediately
- Clear place for new code: a new use-case goes in `services/`, a new Chrome API call goes in `background/`

**Negative / trade-offs**

- `services/download.ts` and `services/webhook.ts` are currently thin façades over the background adapters. They exist to give services a stable import surface and to allow the background adapters to be replaced without touching services. The indirection adds one call level.
- The `extension/popup.js` and `extension/meetings.js` UI scripts do not participate in this layer model — they remain plain JS and access storage and background messaging directly. Bringing them into the TypeScript layer would require additional Vite entries.

**Risks**

- The layer rule (services may not call `chrome.*` directly) is enforced by convention, not tooling. A lint rule (e.g. `no-restricted-imports`) could enforce it mechanically if violations become a recurring issue.
