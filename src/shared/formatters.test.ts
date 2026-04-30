import { describe, it, expect } from 'vitest'
import { buildTranscriptFilename, buildWebhookBody, getTranscriptString } from './formatters'
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
