import { vi } from 'vitest'

export function makeChromeMock(localOverrides: Record<string, unknown> = {}, syncOverrides: Record<string, unknown> = {}) {
  const localStore: Record<string, unknown> = { ...localOverrides }
  const syncStore: Record<string, unknown> = { ...syncOverrides }

  return {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.map((k) => [k, localStore[k]]).filter(([, v]) => v !== undefined)
          )
        ),
        set: vi.fn(async (data: Record<string, unknown>) => { Object.assign(localStore, data) }),
      },
      sync: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.map((k) => [k, syncStore[k]]).filter(([, v]) => v !== undefined)
          )
        ),
        set: vi.fn(async (data: Record<string, unknown>) => { Object.assign(syncStore, data) }),
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
    _localStore: localStore,
    _syncStore: syncStore,
  }
}

export type ChromeMock = ReturnType<typeof makeChromeMock>
