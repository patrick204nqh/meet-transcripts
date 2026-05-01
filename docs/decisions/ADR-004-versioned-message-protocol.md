# ADR-004: Versioned extension message protocol

**Date:** 2026-04-29
**Status:** Accepted

---

## Context

The Chrome extension communicates internally via `chrome.runtime.sendMessage`. As the codebase grew, message types multiplied across three callers (content script, popup, meetings/settings UI) and one handler (background service worker). Two problems emerged:

- **Silent failures.** If a caller sent a message the handler no longer recognised — due to a rename or a caller that hadn't been updated after a refactor — `chrome.runtime.sendMessage` calls the callback with `undefined`. There is no error thrown. The UI appears to do nothing.
- **No contract enforcement.** There was no mechanism to detect that a caller was sending stale message shapes. The architecture refactor (ADR-003) renamed and restructured message types; the plain-JS UI files (`meetings.js`, `settings.js`) were not updated at the same time, causing all three action buttons (Recover, Download, Post webhook) to silently fail.

---

## Decision

Every message sent via `chrome.runtime.sendMessage` must include a `v` field set to the current `PROTOCOL_VERSION` constant (defined in `src/shared/protocol.ts`). The background message handler rejects any message where `v` is absent or does not match the expected version, returning an explicit error response instead of silently ignoring it.

The `msg()` factory in `src/shared/protocol.ts` stamps `v` automatically for TypeScript callers. Plain-JS callers must include `v` manually.

---

## Alternatives Considered

### Alternative 1: No versioning — rely on message type strings
- **Pros**: No boilerplate; callers already know the type
- **Cons**: Callers that lag behind a refactor silently do nothing; no way to detect the mismatch at the handler boundary
- **Why not**: This was the status quo — it caused real, invisible failures after ADR-003 landed

### Alternative 2: Namespace types by version (e.g. `type: "v1/recover_last_meeting"`)
- **Pros**: Makes the version part of the type string; no separate field needed
- **Cons**: String-matching becomes fragile; harder to parse; breaks all existing type constants
- **Why not**: More disruptive than a single `v` field with no benefit

---

## Consequences

### Positive
- Stale callers get an explicit error response instead of a silent no-op — the failure is visible in the console and surfaced to the UI
- The handler has a single, auditable gate for version checking
- `msg()` factory prevents TypeScript callers from ever forgetting the field

### Negative
- Plain-JS UI callers must be updated manually whenever `PROTOCOL_VERSION` bumps — the compiler won't catch it
- The version is a blunt instrument: a single integer shared across all message types, not per-type versioning

### Risks
- If `PROTOCOL_VERSION` is bumped without updating all callers, the same silent-failure class re-emerges — but now as an explicit rejection rather than `undefined`. Mitigation: treat `PROTOCOL_VERSION` bumps as a cross-cutting change that requires a grep for all `sendMessage` call sites.
