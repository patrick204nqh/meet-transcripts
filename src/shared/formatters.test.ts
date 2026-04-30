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
    // Only the title-derived portion should have illegal chars replaced — the directory separator is expected
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
})

describe('getTranscriptString', () => {
  it('returns empty string for empty transcript', () => {
    expect(getTranscriptString([])).toBe('')
  })

  it('formats each block as "Name (timestamp)\\ntext\\n\\n"', () => {
    const result = getTranscriptString([
      { personName: 'Bob', timestamp: '2024-01-01T09:00:00.000Z', text: 'Hey' },
    ])
    expect(result).toContain('Bob')
    expect(result).toContain('Hey')
  })
})

describe('getChatMessagesString', () => {
  it('returns empty string for empty chat messages', () => {
    expect(getChatMessagesString([])).toBe('')
  })

  it('formats each message as "Name (timestamp)\\ntext\\n\\n"', () => {
    const result = getChatMessagesString([
      { personName: 'Carol', timestamp: '2024-01-01T09:00:00.000Z', text: 'Agreed' },
    ])
    expect(result).toContain('Carol')
    expect(result).toContain('Agreed')
  })

  it('joins multiple messages', () => {
    const result = getChatMessagesString([
      { personName: 'Alice', timestamp: '2024-01-01T09:00:00.000Z', text: 'First' },
      { personName: 'Bob', timestamp: '2024-01-01T09:01:00.000Z', text: 'Second' },
    ])
    expect(result).toContain('Alice')
    expect(result).toContain('Bob')
  })
})

describe('buildWebhookBody — undefined software and title fallback', () => {
  const bare: Meeting = {
    ...base,
    software: undefined as unknown as Meeting['software'],
    title: undefined,
  }

  it('simple body — software and title default to empty string', () => {
    const body = buildWebhookBody(bare, 'simple')
    expect(body.software).toBe('')
    expect(body.title).toBe('')
  })

  it('advanced body — software and title default to empty string', () => {
    const body = buildWebhookBody(bare, 'advanced')
    expect(body.software).toBe('')
    expect(body.title).toBe('')
  })
})
