import { describe, it, expect, vi } from 'vitest'
import { makeChromeMock } from '../../tests/unit/chrome-mock'
import { createStorageLocal } from '../shared/storage-repo'
import { ErrorCode } from '../shared/errors'
import { createDownloadService } from './download'
import type { Meeting } from '../types'

const meeting: Meeting = {
  software: 'Google Meet',
  title: 'Sprint Review',
  startTimestamp: '2024-06-01T09:00:00.000Z',
  endTimestamp: '2024-06-01T10:00:00.000Z',
  transcript: [{ personName: 'Alice', timestamp: '2024-06-01T09:01:00.000Z', text: 'All good' }],
  chatMessages: [{ personName: 'Bob', timestamp: '2024-06-01T09:05:00.000Z', text: 'Agreed' }],
  webhookPostStatus: 'new',
}

function makeDeps(localData: Record<string, unknown> = {}) {
  const mock = makeChromeMock(localData)
  const storageLocal = createStorageLocal({
    localGet: (keys) => mock.storage.local.get(keys),
    localSet: (data) => mock.storage.local.set(data),
    syncGet: (keys) => mock.storage.sync.get(keys),
    syncSet: (data) => mock.storage.sync.set(data),
  })
  const blobToDataUrl = vi.fn(async (_blob: Blob) => 'data:text/plain;base64,SGVsbG8=')
  const triggerDownload = vi.fn(async (_opts: { url: string; filename: string; conflictAction: string }) => {})
  return { storageLocal, blobToDataUrl, triggerDownload }
}

describe('getMeeting', () => {
  it('returns the meeting at a valid index', async () => {
    const deps = makeDeps({ meetings: [meeting] })
    const svc = createDownloadService(deps)
    const result = await svc.getMeeting(0)
    expect(result.title).toBe('Sprint Review')
  })

  it('throws MEETING_NOT_FOUND for an out-of-bounds index', async () => {
    const deps = makeDeps({ meetings: [meeting] })
    await expect(createDownloadService(deps).getMeeting(5)).rejects.toMatchObject({ code: ErrorCode.MEETING_NOT_FOUND })
  })

  it('throws MEETING_NOT_FOUND when meetings list is empty', async () => {
    const deps = makeDeps()
    await expect(createDownloadService(deps).getMeeting(0)).rejects.toMatchObject({ code: ErrorCode.MEETING_NOT_FOUND })
  })
})

describe('formatTranscript', () => {
  it('returns formatted string containing speaker names', () => {
    const svc = createDownloadService(makeDeps())
    const result = svc.formatTranscript(meeting)
    expect(result).toContain('Alice')
    expect(result).toContain('All good')
  })

  it('returns empty string for empty transcript', () => {
    const svc = createDownloadService(makeDeps())
    expect(svc.formatTranscript({ ...meeting, transcript: [] })).toBe('')
  })
})

describe('formatChatMessages', () => {
  it('returns formatted string containing chat speaker names', () => {
    const svc = createDownloadService(makeDeps())
    const result = svc.formatChatMessages(meeting)
    expect(result).toContain('Bob')
    expect(result).toContain('Agreed')
  })

  it('returns empty string for empty chat messages', () => {
    const svc = createDownloadService(makeDeps())
    expect(svc.formatChatMessages({ ...meeting, chatMessages: [] })).toBe('')
  })
})

describe('downloadTranscript', () => {
  it('throws MEETING_NOT_FOUND when index is out of bounds', async () => {
    const deps = makeDeps()
    await expect(createDownloadService(deps).downloadTranscript(0)).rejects.toMatchObject({ code: ErrorCode.MEETING_NOT_FOUND })
  })

  it('calls blobToDataUrl and triggerDownload for a valid meeting', async () => {
    const deps = makeDeps({ meetings: [meeting] })
    const svc = createDownloadService(deps)
    await svc.downloadTranscript(0)
    expect(deps.blobToDataUrl).toHaveBeenCalledOnce()
    expect(deps.triggerDownload).toHaveBeenCalledOnce()
  })

  it('passes a filename containing the meeting title to triggerDownload', async () => {
    const deps = makeDeps({ meetings: [meeting] })
    await createDownloadService(deps).downloadTranscript(0)
    const opts = deps.triggerDownload.mock.calls[0][0] as { filename: string }
    expect(opts.filename).toContain('Sprint Review')
  })

  it('transcript content includes speaker name and separator', async () => {
    const deps = makeDeps({ meetings: [meeting] })
    await createDownloadService(deps).downloadTranscript(0)
    const blob = deps.blobToDataUrl.mock.calls[0][0] as Blob
    const text = await blob.text()
    expect(text).toContain('Alice')
    expect(text).toContain('CHAT MESSAGES')
  })
})
