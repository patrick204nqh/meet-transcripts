# ADR-006: Dual test stack — Vitest (unit) + Playwright (E2E)

**Date:** 2026-04-29
**Status:** Accepted

---

## Context

Testing a Chrome extension presents a layering problem: some code is pure logic (formatters, error classification, storage factories), some code calls Chrome APIs (`chrome.storage`, `chrome.downloads`, `chrome.runtime`), and some code drives real DOM interactions inside a live Chromium extension context. No single test runner handles all three layers well.

The layered architecture from ADR-003 was designed partly with this in mind: `shared/` functions have no Chrome API dependencies and can be exercised with plain Node.js assertions. `services/` functions depend on `IBrowserStorage` and `IBrowserRuntime` interfaces that can be satisfied by mocks. The full extension UI — popup, app page — requires a real browser with the extension loaded.

---

## Decision

Use two test runners with a hard split by layer:

**Vitest** — unit tests under `tests/unit/`. Runs in Node via `vitest run`. Tests pure functions in `shared/` and service logic via a `makeChromeMock()` fixture that implements `IBrowserStorage` / `IBrowserRuntime` without any real `chrome.*` calls. No browser launched.

**Playwright** — E2E tests under `tests/*.spec.js`. Runs against a real Chromium instance with the compiled extension loaded as an unpacked extension. Tests the full user-facing behaviour: popup rendering, app page tab switching, meetings table, webhook form, and security assertions (no external network requests).

CI runs Vitest before Playwright. If unit tests fail, E2E tests do not run.

---

## Alternatives Considered

### Alternative 1: Jest for unit tests
- **Pros**: Widely adopted; large ecosystem
- **Cons**: Requires additional config to handle TypeScript and ESM; slower than Vitest on this codebase; no meaningful feature advantage over Vitest for pure unit tests
- **Why not**: Vitest is the natural choice for a Vite-based TypeScript project — zero config, native ESM, same `describe`/`it`/`expect` API

### Alternative 2: Puppeteer instead of Playwright for E2E
- **Pros**: Lower-level; more direct Chrome DevTools Protocol access
- **Cons**: No built-in test runner (requires Jest or Mocha alongside); extension loading is more manual; weaker selector ergonomics
- **Why not**: Playwright's `test` runner, fixtures, and extension-loading support (`--load-extension`) provide everything needed with less boilerplate

### Alternative 3: Single test runner for everything (e.g. Playwright for all tests)
- **Pros**: One tool, one config
- **Cons**: Unit tests that don't need a browser pay the cost of launching Chromium; the fast-feedback loop for pure logic is lost; Chrome API mocks inside Playwright are awkward
- **Why not**: The layer split makes the two-runner approach natural — fast unit tests stay fast, E2E tests stay honest

---

## Consequences

### Positive
- Unit tests run in milliseconds with no browser startup cost — fast feedback during development
- Vitest's native TypeScript support means unit tests are type-checked alongside source
- Playwright tests exercise the real extension API surface — no stubbed `chrome.*` at this layer
- CI gates E2E on unit tests passing, catching pure logic regressions cheaply

### Negative
- Two test configs to maintain (`vitest.config.ts` + `playwright.config.js`)
- The `chrome.*` mock in `tests/unit/chrome-mock.ts` must be kept in sync with the interfaces actually used by the code under test — it can drift if new Chrome API calls are added to `services/` without updating the mock
- Playwright tests require a full `npm run build` before running (`pretest` hook) — a stale build produces stale test results

### Risks
- Coverage from Vitest covers only `shared/` and the parts of `services/` that are reachable through mocks. Code paths that depend on real Chrome behaviour (download filename conflicts, storage quota errors) are not covered. Mitigation: treat manual extension testing after Meet DOM changes as the final gate for that class of risk.
