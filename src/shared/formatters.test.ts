import { describe, it, expect } from 'vitest'
import { buildTranscriptFilename, buildWebhookBody, getChatMessagesString, getTranscriptString } from './formatters'
import type { Meeting } from '../types'

const base: Meeting = {
  software: 'Google Meet',
  title: 'Sprint Planning',
  startTimestamp: '2024-03-15T09:00:00.000Z',
  endTimestamp: '2024-03-15T10:00:00.000Z',
  transcript: [],
  chatMessages: [],
  webhookPostStatus: 'new',
}

describe('buildTranscriptFilename', () => {
  it('includes the expected path prefix and .txt suffix', () => {
    expect(buildTranscriptFilename(base)).toMatch(/^meet-transcripts\/Google Meet transcript-/)
    expect(buildTranscriptFilename(base)).toMatch(/\.txt$/)
  })

  it('replaces characters illegal in filenames', () => {
    const result = buildTranscriptFilename({ ...base, title: 'Q4: Budget / Plan? <Final>' })
    const filenameOnly = result.split('/').pop()!
    expect(filenameOnly).not.toMatch(/[/:?<>]/)
    expect(result).toContain('Q4_')
  })

  it('falls back to "Meeting" when title is undefined', () => {
    expect(buildTranscriptFilename({ ...base, title: undefined })).toContain('-Meeting at ')
  })

  it('uses "Transcript" prefix when software is undefined', () => {
    expect(buildTranscriptFilename({ ...base, software: undefined })).toMatch(/^meet-transcripts\/Transcript-/)
  })
})

describe('buildWebhookBody', () => {
  const withTranscript: Meeting = {
    ...base,
    transcript: [{ personName: 'Alice', timestamp: '2024-03-15T09:01:00.000Z', text: 'Hello team' }],
  }

  it('simple body — transcript is a string', () => {
    const body = buildWebhookBody(withTranscript, 'simple')
    expect(body.webhookBodyType).toBe('simple')
    expect(typeof body.transcript).toBe('string')
    expect(body.transcript as string).toContain('Alice')
  })

  it('advanced body — transcript is an array', () => {
    const body = buildWebhookBody(withTranscript, 'advanced')
    expect(body.webhookBodyType).toBe('advanced')
    expect(Array.isArray(body.transcript)).toBe(true)
  })

  it.each([
    ['simple', 'simple'],
    ['advanced', 'advanced'],
  ] as const)('%s body — undefined software and title default to empty string', (_, bodyType) => {
    const bare: Meeting = { ...base, software: undefined as unknown as Meeting['software'], title: undefined }
    const body = buildWebhookBody(bare, bodyType)
    expect(body.software).toBe('')
    expect(body.title).toBe('')
  })
})

// Both functions share the same input shape and formatting contract — tested together.
describe.each([
  ['getTranscriptString', getTranscriptString],
  ['getChatMessagesString', getChatMessagesString],
] as const)('%s', (_, fn) => {
  it('returns empty string for empty input', () => {
    expect(fn([])).toBe('')
  })

  it('formats a block with speaker name and text', () => {
    const result = fn([{ personName: 'Bob', timestamp: '2024-01-01T09:00:00.000Z', text: 'Hey' }])
    expect(result).toContain('Bob')
    expect(result).toContain('Hey')
  })

  it('joins multiple entries', () => {
    const result = fn([
      { personName: 'Alice', timestamp: '2024-01-01T09:00:00.000Z', text: 'First' },
      { personName: 'Bob', timestamp: '2024-01-01T09:01:00.000Z', text: 'Second' },
    ])
    expect(result).toContain('Alice')
    expect(result).toContain('Bob')
  })
})
