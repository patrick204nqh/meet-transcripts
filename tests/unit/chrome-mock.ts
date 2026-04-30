import { vi } from 'vitest'

export function makeChromeMock(overrides: Record<string, unknown> = {}) {
  const storage: Record<string, unknown> = { ...overrides }

  return {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.map((k) => [k, storage[k]]).filter(([, v]) => v !== undefined)
          )
        ),
        set: vi.fn(async (data: Record<string, unknown>) => Object.assign(storage, data)),
      },
      sync: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.map((k) => [k, storage[k]]).filter(([, v]) => v !== undefined)
          )
        ),
        set: vi.fn(async (data: Record<string, unknown>) => Object.assign(storage, data)),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      lastError: null,
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
    },
    downloads: {
      download: vi.fn(),
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    _storage: storage,
  }
}

export type ChromeMock = ReturnType<typeof makeChromeMock>
