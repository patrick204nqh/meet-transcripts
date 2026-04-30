import { describe, it, expect } from 'vitest'
import { makeChromeMock } from '../../tests/unit/chrome-mock'
import { createStorageLocal, createStorageSync } from './storage-repo'

function makeStorageFromMock(localOverrides?: Record<string, unknown>, syncOverrides?: Record<string, unknown>) {
  const mock = makeChromeMock(localOverrides, syncOverrides)
  return {
    localGet: mock.storage.local.get,
    localSet: mock.storage.local.set,
    syncGet: mock.storage.sync.get,
    syncSet: mock.storage.sync.set,
  }
}

describe('migrateMeeting — missing optional fields fallback to defaults', () => {
  it('defaults transcript to [] when absent', async () => {
    const storage = makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', title: 'T',
        startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
        chatMessages: [], webhookPostStatus: 'new',
      }],
    })
    const [m] = await createStorageLocal(storage).getMeetings()
    expect(m.transcript).toEqual([])
  })

  it('defaults chatMessages to [] when absent', async () => {
    const storage = makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', title: 'T',
        startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
        transcript: [], webhookPostStatus: 'new',
      }],
    })
    const [m] = await createStorageLocal(storage).getMeetings()
    expect(m.chatMessages).toEqual([])
  })

  it('defaults webhookPostStatus to "new" when absent', async () => {
    const storage = makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', title: 'T',
        startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
        transcript: [], chatMessages: [],
      }],
    })
    const [m] = await createStorageLocal(storage).getMeetings()
    expect(m.webhookPostStatus).toBe('new')
  })
})

describe('migrateMeeting — legacy field names', () => {
  it('reads meetingTitle when title is absent', async () => {
    const storage = makeStorageFromMock({
      meetings: [{
        meetingSoftware: 'Google Meet', meetingTitle: 'Old Meeting',
        meetingStartTimestamp: '2024-01-01T08:00:00.000Z',
        meetingEndTimestamp: '2024-01-01T09:00:00.000Z',
        transcript: [], chatMessages: [], webhookPostStatus: 'new',
      }],
    })
    const repo = createStorageLocal(storage)
    const meetings = await repo.getMeetings()
    expect(meetings[0].title).toBe('Old Meeting')
    expect(meetings[0].software).toBe('Google Meet')
  })

  it('prefers new field names over legacy when both exist', async () => {
    const storage = makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', meetingSoftware: 'Stale',
        title: 'New Title', meetingTitle: 'Old Title',
        startTimestamp: '2024-02-01T08:00:00.000Z',
        meetingStartTimestamp: '2000-01-01T00:00:00.000Z',
        endTimestamp: '2024-02-01T09:00:00.000Z',
        meetingEndTimestamp: '2000-01-01T01:00:00.000Z',
        transcript: [], chatMessages: [], webhookPostStatus: 'new',
      }],
    })
    const repo = createStorageLocal(storage)
    const meetings = await repo.getMeetings()
    expect(meetings[0].title).toBe('New Title')
    expect(meetings[0].software).toBe('Google Meet')
  })
})

describe('migrateTranscriptBlock — legacy transcriptText field', () => {
  function makeMeetingWith(transcriptBlock: Record<string, unknown>) {
    return makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', title: 'T',
        startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
        transcript: [transcriptBlock], chatMessages: [], webhookPostStatus: 'new',
      }],
    })
  }

  it('reads transcriptText when text is absent', async () => {
    const repo = createStorageLocal(makeMeetingWith({ personName: 'Alice', timestamp: '2024-01-01T09:00:00.000Z', transcriptText: 'Legacy' }))
    const meetings = await repo.getMeetings()
    expect(meetings[0].transcript[0].text).toBe('Legacy')
  })

  it('falls back to empty string when neither field present', async () => {
    const repo = createStorageLocal(makeMeetingWith({ personName: 'Bob', timestamp: '2024-01-01T09:00:00.000Z' }))
    const meetings = await repo.getMeetings()
    expect(meetings[0].transcript[0].text).toBe('')
  })
})

describe('migrateChatMessage — legacy chatMessageText field', () => {
  function makeMeetingWithChat(chatBlock: Record<string, unknown>) {
    return makeStorageFromMock({
      meetings: [{
        software: 'Google Meet', title: 'T',
        startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
        transcript: [], chatMessages: [chatBlock], webhookPostStatus: 'new',
      }],
    })
  }

  it('reads chatMessageText when text is absent', async () => {
    const repo = createStorageLocal(makeMeetingWithChat({ personName: 'Carol', timestamp: '2024-01-01T09:00:00.000Z', chatMessageText: 'Old chat' }))
    const meetings = await repo.getMeetings()
    expect(meetings[0].chatMessages[0].text).toBe('Old chat')
  })

  it('falls back to empty string when neither field present', async () => {
    const repo = createStorageLocal(makeMeetingWithChat({ personName: 'Dave', timestamp: '2024-01-01T09:00:00.000Z' }))
    const meetings = await repo.getMeetings()
    expect(meetings[0].chatMessages[0].text).toBe('')
  })
})

describe('setCurrentMeetingData / getCurrentMeetingData round-trip', () => {
  it('stores and retrieves current meeting fields', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    await repo.setCurrentMeetingData({
      software: 'Google Meet',
      title: 'Live Meeting',
      startTimestamp: '2024-06-01T10:00:00.000Z',
    })
    const data = await repo.getCurrentMeetingData()
    expect(data.software).toBe('Google Meet')
    expect(data.title).toBe('Live Meeting')
    expect(data.startTimestamp).toBe('2024-06-01T10:00:00.000Z')
  })
})

describe('setMeetings / getMeetings round-trip', () => {
  it('stores and retrieves meetings correctly', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    const meeting = {
      software: 'Google Meet' as const, title: 'Test',
      startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
      transcript: [], chatMessages: [], webhookPostStatus: 'new' as const,
    }
    await repo.setMeetings([meeting])
    const result = await repo.getMeetings()
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test')
  })

  it('returns empty array when storage has no meetings key', async () => {
    const repo = createStorageLocal(makeStorageFromMock())
    expect(await repo.getMeetings()).toEqual([])
  })

  it('replaces the full array — subsequent setMeetings discards prior entries', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    const make = (title: string) => ({
      software: 'Google Meet' as const, title,
      startTimestamp: '2024-01-01T08:00:00.000Z', endTimestamp: '2024-01-01T09:00:00.000Z',
      transcript: [], chatMessages: [], webhookPostStatus: 'new' as const,
    })
    await repo.setMeetings([make('A'), make('B')])
    await repo.setMeetings([make('C')])
    const result = await repo.getMeetings()
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('C')
  })
})

describe('getMeetingTabId / setMeetingTabId', () => {
  it('returns null when key is absent', async () => {
    const repo = createStorageLocal(makeStorageFromMock())
    expect(await repo.getMeetingTabId()).toBeNull()
  })

  it('round-trips a numeric tab ID', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    await repo.setMeetingTabId(42)
    expect(await repo.getMeetingTabId()).toBe(42)
  })

  it('round-trips the "processing" sentinel string', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    await repo.setMeetingTabId('processing')
    expect(await repo.getMeetingTabId()).toBe('processing')
  })
})

describe('getDeferredUpdatePending / setDeferredUpdatePending', () => {
  it('returns false when key is absent', async () => {
    const repo = createStorageLocal(makeStorageFromMock())
    expect(await repo.getDeferredUpdatePending()).toBe(false)
  })

  it('returns true after setting true', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    await repo.setDeferredUpdatePending(true)
    expect(await repo.getDeferredUpdatePending()).toBe(true)
  })

  it('returns false after setting false', async () => {
    const storage = makeStorageFromMock()
    const repo = createStorageLocal(storage)
    await repo.setDeferredUpdatePending(true)
    await repo.setDeferredUpdatePending(false)
    expect(await repo.getDeferredUpdatePending()).toBe(false)
  })
})

describe('getCurrentMeetingData — legacy field migration', () => {
  it('falls back to meetingSoftware when software is absent', async () => {
    const storage = makeStorageFromMock({ meetingSoftware: 'Google Meet' })
    const repo = createStorageLocal(storage)
    const data = await repo.getCurrentMeetingData()
    expect(data.software).toBe('Google Meet')
  })

  it('falls back to meetingStartTimestamp when startTimestamp is absent', async () => {
    const storage = makeStorageFromMock({ meetingStartTimestamp: '2024-01-01T08:00:00.000Z' })
    const repo = createStorageLocal(storage)
    const data = await repo.getCurrentMeetingData()
    expect(data.startTimestamp).toBe('2024-01-01T08:00:00.000Z')
  })

  it('prefers software over meetingSoftware when both present', async () => {
    const storage = makeStorageFromMock({ software: 'Google Meet', meetingSoftware: 'Stale' })
    const repo = createStorageLocal(storage)
    const data = await repo.getCurrentMeetingData()
    expect(data.software).toBe('Google Meet')
  })

  it('returns undefined startTimestamp when neither field present', async () => {
    const repo = createStorageLocal(makeStorageFromMock())
    const data = await repo.getCurrentMeetingData()
    expect(data.startTimestamp).toBeUndefined()
  })
})

describe('chrome-mock — local and sync storage are isolated', () => {
  it('a key written via syncSet is NOT visible through localGet', async () => {
    const mock = makeChromeMock()
    await mock.storage.sync.set({ webhookUrl: 'https://example.com' })
    const local = await mock.storage.local.get(['webhookUrl'])
    expect(local.webhookUrl).toBeUndefined()
  })

  it('a key written via localSet is NOT visible through syncGet', async () => {
    const mock = makeChromeMock()
    await mock.storage.local.set({ meetingTabId: 99 })
    const sync = await mock.storage.sync.get(['meetingTabId'])
    expect(sync.meetingTabId).toBeUndefined()
  })
})

describe('createStorageSync — getSettings', () => {
  it('returns empty object when storage is empty', async () => {
    const storage = makeStorageFromMock()
    const sync = createStorageSync(storage)
    const settings = await sync.getSettings()
    expect(settings).toEqual({})
  })

  it('round-trips full settings', async () => {
    const storage = makeStorageFromMock()
    const sync = createStorageSync(storage)
    await sync.setSettings({
      autoPostWebhookAfterMeeting: true,
      autoDownloadFileAfterMeeting: false,
      operationMode: 'auto',
      webhookBodyType: 'advanced',
      webhookUrl: 'https://hooks.example.com/test',
    })
    const result = await sync.getSettings()
    expect(result.autoPostWebhookAfterMeeting).toBe(true)
    expect(result.autoDownloadFileAfterMeeting).toBe(false)
    expect(result.webhookUrl).toBe('https://hooks.example.com/test')
    expect(result.webhookBodyType).toBe('advanced')
  })

  it('partial setSettings only overwrites supplied keys', async () => {
    const storage = makeStorageFromMock()
    const sync = createStorageSync(storage)
    await sync.setSettings({ webhookUrl: 'https://first.example.com', autoPostWebhookAfterMeeting: true })
    await sync.setSettings({ webhookUrl: 'https://second.example.com' })
    const result = await sync.getSettings()
    expect(result.webhookUrl).toBe('https://second.example.com')
    expect(result.autoPostWebhookAfterMeeting).toBe(true)
  })
})

describe('createStorageSync — getWebhookSettings', () => {
  it('returns undefined values when not configured', async () => {
    const sync = createStorageSync(makeStorageFromMock())
    const result = await sync.getWebhookSettings()
    expect(result.webhookUrl).toBeUndefined()
    expect(result.webhookBodyType).toBeUndefined()
  })

  it('returns configured webhook URL and body type', async () => {
    const storage = makeStorageFromMock()
    const sync = createStorageSync(storage)
    await sync.setSettings({ webhookUrl: 'https://hooks.example.com', webhookBodyType: 'simple' })
    const result = await sync.getWebhookSettings()
    expect(result.webhookUrl).toBe('https://hooks.example.com')
    expect(result.webhookBodyType).toBe('simple')
  })
})

describe('createStorageSync — getAutoActionSettings', () => {
  it('returns all undefined when nothing configured', async () => {
    const sync = createStorageSync(makeStorageFromMock())
    const result = await sync.getAutoActionSettings()
    expect(result.webhookUrl).toBeUndefined()
    expect(result.autoPostWebhookAfterMeeting).toBeUndefined()
    expect(result.autoDownloadFileAfterMeeting).toBeUndefined()
  })

  it('returns configured auto-action flags and webhook URL', async () => {
    const storage = makeStorageFromMock()
    const sync = createStorageSync(storage)
    await sync.setSettings({
      webhookUrl: 'https://hooks.example.com',
      autoPostWebhookAfterMeeting: true,
      autoDownloadFileAfterMeeting: false,
    })
    const result = await sync.getAutoActionSettings()
    expect(result.webhookUrl).toBe('https://hooks.example.com')
    expect(result.autoPostWebhookAfterMeeting).toBe(true)
    expect(result.autoDownloadFileAfterMeeting).toBe(false)
  })
})
