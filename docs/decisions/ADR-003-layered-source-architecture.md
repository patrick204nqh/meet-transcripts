# ADR-003: Layered source architecture

**Date:** 2026-04-29
**Status:** Accepted — extended 2026-04-30 (architecture-refactor)

---

## Context

After the TypeScript migration (ADR-002), all source lived under `src/` but without a defined module boundary model. The original JavaScript had mixed concerns in a single file: the background service worker performed DOM-unrelated use-case logic (deciding whether to download and post), storage operations, Chrome API calls, and data formatting in the same functions. As the service grew, this caused:

- **Untestable business logic.** Logic gated on `chrome.storage` or `chrome.downloads` calls could not be unit-tested without a full Chrome extension environment.
- **Invisible coupling.** Renaming a storage key or changing an error shape required grep-based searches rather than type-directed refactoring.
- **Layering violations.** The services façade files (`meeting-service.ts`, `download-service.ts`, `webhook-service.ts`) were initially no-op pass-throughs that added a call level without isolating concerns.

A plan to resolve this was documented in `docs/plans/2026-04-29-codebase-standardization.md` and implemented across two PRs.

---

## Decision

Organise `src/` into six layers with explicit dependency rules:

```
src/
├── types.ts          # Domain types — no imports
├── shared/           # Pure utilities — may import types only
├── browser/          # Browser API port — interfaces + Chrome implementations
├── platforms/        # Platform adapters — all DOM knowledge; one subdir per platform
├── services/         # Use-case orchestration — owns all Chrome I/O calls
├── background/       # Chrome event wiring — routes to services, no business logic
└── content/          # Session lifecycle + DOM observers
```

**Layer contracts:**

| Layer | Allowed imports | Prohibited |
|-------|----------------|------------|
| `shared/` | `types.ts` only | Chrome APIs, services, browser/ |
| `browser/` | `types.ts`, `shared/` | Business logic |
| `platforms/` | `shared/`, `types.ts`, `content/` (ui, state-sync) | `services/`, `background/` |
| `services/` | `shared/`, `browser/`, `types.ts` | Importing from `background/` |
| `background/` | `services/`, `shared/`, `browser/`, `types.ts` | Business logic — only routes events or delegates to services |
| `content/` | `shared/`, `browser/`, `platforms/`, `types.ts` | `services/`, `background/` (communication is via `sendMessage`) |

**What lives where:**

- `shared/formatters.ts` — Pure text rendering, filename sanitisation, webhook body construction. No Chrome APIs, no I/O.
- `shared/storage-repo.ts` — `createStorageLocal` / `createStorageSync` factories injected with `IBrowserStorage`. Chrome singletons for backward compat. Single point where storage keys are named.
- `shared/errors.ts` — `ErrorCode` constants + `ExtensionError` class + `ErrorCategory`. Shared by all layers.
- `shared/logger.ts` — Leveled logger (`log.debug/info/warn/error`). Debug calls stripped in production builds via `__DEV__`.
- `shared/protocol.ts` — Versioned `ExtensionMessage` union + `msg()` factory. Every message sent from the content script must be wrapped with `msg()`.
- `browser/types.ts` — `IBrowserStorage` and `IBrowserRuntime` interfaces. Enables injecting mocks in unit tests.
- `browser/chrome.ts` — `ChromeStorage` and `ChromeRuntime` concrete implementations wired to `chrome.*`.
- `platforms/google-meet/adapter.ts` — All Google Meet DOM selectors and mutation parsing. No other file should reference Meet-specific class names.
- `platforms/google-meet/index.ts` — Content script entry point. Wires adapter + state + session lifecycle.
- `content/core/meeting-session.ts` — `MeetingSession` class. Replaces the 190-line `meetingRoutines()` god-function.
- `content/core/observer-manager.ts` — Owns `MutationObserver` lifetimes for transcript, chat, and watchdog.
- `services/meeting.ts` — `pickupLastMeeting`, `finalizeMeeting`, `recoverLastMeeting`. Owns the meeting lifecycle state machine.
- `services/download.ts` — `DownloadService`. All `chrome.downloads` logic + filename construction. No longer a thin facade.
- `services/webhook.ts` — `WebhookService`. All `fetch` + notification + status write-back logic. No longer a thin facade.
- `background/message-handler.ts` — Routes `chrome.runtime.onMessage` events to services. Enforces protocol version gate.

---

## Consequences

**Positive**

- `shared/` functions can be tested with plain Node.js via Vitest — no Chrome environment needed
- `services/` can be tested by passing a `makeChromeMock()`-backed `IBrowserStorage` — no real `chrome.*` calls needed
- Type-directed refactoring: changing a type in `types.ts` propagates errors to all consumers immediately
- Clear place for new code: a new use-case goes in `services/`, a new Chrome API call goes in `background/`, a new platform goes in `platforms/<name>/`
- `services/download.ts` and `services/webhook.ts` now contain the real logic — the thin-façade indirection is eliminated
- All Google Meet DOM selectors are centralised in `platforms/google-meet/adapter.ts` — a single file to update when Meet changes its UI

**Negative / trade-offs**

- The `extension/popup.js` and `extension/meetings.js` UI scripts do not participate in this layer model — they remain plain JS and access storage and background messaging directly. Bringing them into the TypeScript layer would require additional Vite entries.
- `content/` modules that import `state` directly still use the global singleton rather than the injected instance from `createSessionState()`. Full dependency injection of state is deferred until each module is migrated.

**Risks**

- The layer rule (content may not call `chrome.*` directly, services may not import from background/) is enforced by convention, not tooling. A lint rule (e.g. `no-restricted-imports`) could enforce it mechanically if violations become a recurring issue.
