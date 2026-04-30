import { describe, it, expect } from 'vitest'
import { makeChromeMock } from '../../tests/unit/chrome-mock'
import { createStorageLocal } from './storage-repo'

function makeStorageFromMock(overrides?: Record<string, unknown>) {
  const mock = makeChromeMock(overrides)
  return {
    localGet: mock.storage.local.get,
    localSet: mock.storage.local.set,
    syncGet: mock.storage.sync.get,
    syncSet: mock.storage.sync.set,
  }
}

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
})
