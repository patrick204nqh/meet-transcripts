import { describe, it, expect, vi } from 'vitest'
import { makeChromeMock } from '../../tests/unit/chrome-mock'
import { createStorageLocal, createStorageSync } from '../shared/storage-repo'
import { ErrorCode } from '../shared/errors'
import { createWebhookService } from './webhook'
import type { Meeting } from '../types'

const meeting: Meeting = {
  software: 'Google Meet',
  title: 'Planning',
  startTimestamp: '2024-06-01T09:00:00.000Z',
  endTimestamp: '2024-06-01T10:00:00.000Z',
  transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Ready' }],
  chatMessages: [],
  webhookPostStatus: 'new',
}

function makeDeps(
  localData: Record<string, unknown> = {},
  syncData: Record<string, unknown> = {},
  fetchOverride?: typeof globalThis.fetch,
  hasPermission = true,
) {
  const mock = makeChromeMock(localData, syncData)
  const storage = {
    localGet: (keys: string[]) => mock.storage.local.get(keys),
    localSet: (data: Record<string, unknown>) => mock.storage.local.set(data),
    syncGet: (keys: string[]) => mock.storage.sync.get(keys),
    syncSet: (data: Record<string, unknown>) => mock.storage.sync.set(data),
  }
  return {
    storageLocal: createStorageLocal(storage),
    storageSync: createStorageSync(storage),
    fetch: fetchOverride ?? vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }) as Response),
    hasHostPermission: vi.fn(async (_url: string) => hasPermission),
    notify: vi.fn(),
  }
}

function makeOkFetch() {
  return vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }) as Response)
}

function makeFailFetch(status: number) {
  return vi.fn(async () => ({ ok: false, status, statusText: 'Error' }) as Response)
}

describe('postWebhook — guard clauses', () => {
  it('throws NO_WEBHOOK_URL when webhookUrl is absent', async () => {
    const deps = makeDeps({ meetings: [meeting] })
    const svc = createWebhookService(deps)
    await expect(svc.postWebhook(0)).rejects.toMatchObject({ code: ErrorCode.NO_WEBHOOK_URL })
  })

  it('throws MEETING_NOT_FOUND for an out-of-bounds index', async () => {
    const deps = makeDeps({}, { webhookUrl: 'https://hooks.example.com' })
    await expect(createWebhookService(deps).postWebhook(5)).rejects.toMatchObject({ code: ErrorCode.MEETING_NOT_FOUND })
  })

  it('throws NO_HOST_PERMISSION when permission check returns false', async () => {
    const deps = makeDeps({ meetings: [meeting] }, { webhookUrl: 'https://hooks.example.com' }, undefined, false)
    await expect(createWebhookService(deps).postWebhook(0)).rejects.toMatchObject({ code: ErrorCode.NO_HOST_PERMISSION })
  })
})

describe('postWebhook — success path', () => {
  it('returns success string on 2xx response', async () => {
    const deps = makeDeps(
      { meetings: [meeting] },
      { webhookUrl: 'https://hooks.example.com' },
      makeOkFetch(),
    )
    const result = await createWebhookService(deps).postWebhook(0)
    expect(result).toBe('Webhook posted successfully')
  })

  it('marks meeting webhookPostStatus as "successful" after 2xx', async () => {
    const deps = makeDeps(
      { meetings: [meeting] },
      { webhookUrl: 'https://hooks.example.com' },
      makeOkFetch(),
    )
    await createWebhookService(deps).postWebhook(0)
    const meetings = await deps.storageLocal.getMeetings()
    expect(meetings[0].webhookPostStatus).toBe('successful')
  })

  it('sends JSON body to the webhook URL', async () => {
    const fetchMock = makeOkFetch()
    const deps = makeDeps({ meetings: [meeting] }, { webhookUrl: 'https://hooks.example.com' }, fetchMock)
    await createWebhookService(deps).postWebhook(0)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example.com',
      expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' } }),
    )
  })

  it('sends simple body type by default', async () => {
    const fetchMock = makeOkFetch()
    const deps = makeDeps({ meetings: [meeting] }, { webhookUrl: 'https://hooks.example.com' }, fetchMock)
    await createWebhookService(deps).postWebhook(0)
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string)
    expect(body.webhookBodyType).toBe('simple')
  })

  it('sends advanced body type when configured', async () => {
    const fetchMock = makeOkFetch()
    const deps = makeDeps(
      { meetings: [meeting] },
      { webhookUrl: 'https://hooks.example.com', webhookBodyType: 'advanced' },
      fetchMock,
    )
    await createWebhookService(deps).postWebhook(0)
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string)
    expect(body.webhookBodyType).toBe('advanced')
    expect(Array.isArray(body.transcript)).toBe(true)
  })
})

describe('postWebhook — failure path', () => {
  it('marks meeting webhookPostStatus as "failed" on non-2xx response', async () => {
    const deps = makeDeps(
      { meetings: [meeting] },
      { webhookUrl: 'https://hooks.example.com' },
      makeFailFetch(500),
    )
    await expect(createWebhookService(deps).postWebhook(0)).rejects.toMatchObject({ code: ErrorCode.WEBHOOK_REQUEST_FAILED })
    const meetings = await deps.storageLocal.getMeetings()
    expect(meetings[0].webhookPostStatus).toBe('failed')
  })

  it('throws WEBHOOK_REQUEST_FAILED when fetch throws a network error', async () => {
    const deps = makeDeps(
      { meetings: [meeting] },
      { webhookUrl: 'https://hooks.example.com' },
      vi.fn(async () => { throw new Error('network error') }),
    )
    await expect(createWebhookService(deps).postWebhook(0)).rejects.toMatchObject({ code: ErrorCode.WEBHOOK_REQUEST_FAILED })
  })

  it('calls notify on non-2xx response', async () => {
    const deps = makeDeps(
      { meetings: [meeting] },
      { webhookUrl: 'https://hooks.example.com' },
      makeFailFetch(503),
    )
    try { await createWebhookService(deps).postWebhook(0) } catch { /* expected */ }
    expect(deps.notify).toHaveBeenCalledOnce()
  })
})
