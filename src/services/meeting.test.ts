import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChromeMock } from '../../tests/unit/chrome-mock'
import { createStorageLocal, createStorageSync } from '../shared/storage-repo'
import { ErrorCode } from '../shared/errors'
import { createMeetingService } from './meeting'
import type { Meeting } from '../types'

function makeDeps(localData: Record<string, unknown> = {}, syncData: Record<string, unknown> = {}) {
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
    downloadTranscript: vi.fn(async (_i: number) => {}),
    postWebhook: vi.fn(async (_i: number) => 'Webhook posted successfully'),
  }
}

const baseMeeting: Meeting = {
  software: 'Google Meet',
  title: 'Standup',
  startTimestamp: '2024-06-01T09:00:00.000Z',
  endTimestamp: '2024-06-01T09:30:00.000Z',
  transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hello' }],
  chatMessages: [],
  webhookPostStatus: 'new',
}

describe('pickupLastMeeting', () => {
  it('throws NO_MEETINGS when startTimestamp is absent', async () => {
    const deps = makeDeps()
    const svc = createMeetingService(deps)
    await expect(svc.pickupLastMeeting()).rejects.toMatchObject({ code: ErrorCode.NO_MEETINGS })
  })

  it('throws EMPTY_TRANSCRIPT when transcript and chatMessages are both empty', async () => {
    const deps = makeDeps({ startTimestamp: '2024-06-01T09:00:00.000Z', transcript: [], chatMessages: [] })
    const svc = createMeetingService(deps)
    await expect(svc.pickupLastMeeting()).rejects.toMatchObject({ code: ErrorCode.EMPTY_TRANSCRIPT })
  })

  it('creates a new meeting entry with endTimestamp close to now', async () => {
    const before = Date.now()
    const deps = makeDeps({
      software: 'Google Meet',
      title: 'Standup',
      startTimestamp: '2024-06-01T09:00:00.000Z',
      transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
      chatMessages: [],
    })
    const svc = createMeetingService(deps)
    await svc.pickupLastMeeting()
    const meetings = await deps.storageLocal.getMeetings()
    const end = new Date(meetings[0].endTimestamp).getTime()
    expect(end).toBeGreaterThanOrEqual(before)
    expect(meetings[0].software).toBe('Google Meet')
    expect(meetings[0].webhookPostStatus).toBe('new')
  })

  it('appends to existing meetings up to a cap of 10', async () => {
    const existing: Meeting[] = Array.from({ length: 10 }, (_, i) => ({
      ...baseMeeting,
      startTimestamp: `2024-0${Math.floor(i / 9) + 1}-01T0${i}:00:00.000Z`,
    }))
    const deps = makeDeps({
      meetings: existing,
      software: 'Google Meet',
      title: 'New Meeting',
      startTimestamp: '2024-06-02T09:00:00.000Z',
      transcript: [{ personName: 'Bob', timestamp: '2024-06-02T09:01:00.000Z', text: 'Hi' }],
      chatMessages: [],
    })
    const svc = createMeetingService(deps)
    await svc.pickupLastMeeting()
    const meetings = await deps.storageLocal.getMeetings()
    expect(meetings).toHaveLength(10)
    expect(meetings[9].title).toBe('New Meeting')
  })

  it('returns confirmation string on success', async () => {
    const deps = makeDeps({
      software: 'Google Meet',
      startTimestamp: '2024-06-01T09:00:00.000Z',
      transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
      chatMessages: [],
    })
    const result = await createMeetingService(deps).pickupLastMeeting()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('finalizeMeeting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls downloadTranscript when autoDownloadFileAfterMeeting is true', async () => {
    const deps = makeDeps(
      {
        software: 'Google Meet',
        startTimestamp: '2024-06-01T09:00:00.000Z',
        transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
        chatMessages: [],
      },
      { autoDownloadFileAfterMeeting: true },
    )
    await createMeetingService(deps).finalizeMeeting()
    expect(deps.downloadTranscript).toHaveBeenCalledOnce()
  })

  it('calls postWebhook when autoPostWebhookAfterMeeting and webhookUrl are set', async () => {
    const deps = makeDeps(
      {
        software: 'Google Meet',
        startTimestamp: '2024-06-01T09:00:00.000Z',
        transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
        chatMessages: [],
      },
      { autoPostWebhookAfterMeeting: true, webhookUrl: 'https://hooks.example.com' },
    )
    await createMeetingService(deps).finalizeMeeting()
    expect(deps.postWebhook).toHaveBeenCalledOnce()
  })

  it('skips both auto-actions when neither flag is set', async () => {
    const deps = makeDeps({
      software: 'Google Meet',
      startTimestamp: '2024-06-01T09:00:00.000Z',
      transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
      chatMessages: [],
    })
    await createMeetingService(deps).finalizeMeeting()
    expect(deps.downloadTranscript).not.toHaveBeenCalled()
    expect(deps.postWebhook).not.toHaveBeenCalled()
  })

  it('skips postWebhook when flag is true but webhookUrl is absent', async () => {
    const deps = makeDeps(
      {
        software: 'Google Meet',
        startTimestamp: '2024-06-01T09:00:00.000Z',
        transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
        chatMessages: [],
      },
      { autoPostWebhookAfterMeeting: true },
    )
    await createMeetingService(deps).finalizeMeeting()
    expect(deps.postWebhook).not.toHaveBeenCalled()
  })
})

describe('recoverMeeting', () => {
  it('throws NO_MEETINGS when no current meeting data', async () => {
    const deps = makeDeps()
    await expect(createMeetingService(deps).recoverMeeting()).rejects.toMatchObject({ code: ErrorCode.NO_MEETINGS })
  })

  it('calls finalizeMeeting when startTimestamp differs from last saved', async () => {
    const deps = makeDeps(
      {
        meetings: [{ ...baseMeeting, startTimestamp: '2024-06-01T08:00:00.000Z' }],
        software: 'Google Meet',
        startTimestamp: '2024-06-01T09:00:00.000Z',
        transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
        chatMessages: [],
      },
    )
    const result = await createMeetingService(deps).recoverMeeting()
    expect(result).toContain('Recovered')
  })

  it('returns "No recovery needed" when startTimestamp matches last saved', async () => {
    const deps = makeDeps({
      meetings: [{ ...baseMeeting, startTimestamp: '2024-06-01T09:00:00.000Z' }],
      software: 'Google Meet',
      startTimestamp: '2024-06-01T09:00:00.000Z',
      transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
      chatMessages: [],
    })
    const result = await createMeetingService(deps).recoverMeeting()
    expect(result).toBe('No recovery needed')
  })

  it('calls finalizeMeeting when meetings list is empty', async () => {
    const deps = makeDeps({
      software: 'Google Meet',
      startTimestamp: '2024-06-01T09:00:00.000Z',
      transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'Hi' }],
      chatMessages: [],
    })
    const result = await createMeetingService(deps).recoverMeeting()
    expect(result).toContain('Recovered')
  })
})
