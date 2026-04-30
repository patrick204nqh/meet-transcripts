// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../state', () => ({
  state: {
    userName: 'You',
    transcript: [] as import('../../types').TranscriptBlock[],
    personNameBuffer: '',
    transcriptTextBuffer: '',
    timestampBuffer: '',
    isTranscriptDomErrorCaptured: false,
    hasMeetingEnded: false,
  },
}))
vi.mock('../state-sync', () => ({ persistStateFields: vi.fn() }))
vi.mock('../ui', () => ({ handleContentError: vi.fn() }))

import { state } from '../state'
import { transcriptMutationCallback } from './transcript-observer'

function makeMutation(personName: string, text: string): MutationRecord {
  // container > blockEl (at index 0 of 3) > [personEl, transcriptEl > textNode]
  const textNode = document.createTextNode(text)
  const personEl = document.createElement('div')
  personEl.textContent = personName
  const transcriptEl = document.createElement('div')
  transcriptEl.appendChild(textNode)
  const blockEl = document.createElement('div')
  blockEl.appendChild(personEl)
  blockEl.appendChild(transcriptEl)
  const container = document.createElement('div')
  container.appendChild(blockEl)
  container.appendChild(document.createElement('div'))
  container.appendChild(document.createElement('div'))

  return {
    type: 'characterData',
    target: textNode,
    addedNodes: [] as unknown as NodeList,
    removedNodes: [] as unknown as NodeList,
    attributeName: null, attributeNamespace: null,
    nextSibling: null, oldValue: null, previousSibling: null,
  } as MutationRecord
}

describe('transcriptMutationCallback — buffer accumulation', () => {
  beforeEach(() => {
    state.transcript = []
    state.personNameBuffer = ''
    state.transcriptTextBuffer = ''
    state.timestampBuffer = ''
  })

  it('initialises buffer on first mutation', () => {
    transcriptMutationCallback([makeMutation('Alice', 'Hello')])
    expect(state.personNameBuffer).toBe('Alice')
    expect(state.transcriptTextBuffer).toBe('Hello')
  })

  it('flushes buffer and starts new block when speaker changes', () => {
    transcriptMutationCallback([makeMutation('Alice', 'Good morning')])
    transcriptMutationCallback([makeMutation('Bob', 'Hey there')])
    expect(state.transcript).toHaveLength(1)
    expect(state.transcript[0].personName).toBe('Alice')
    expect(state.personNameBuffer).toBe('Bob')
  })

  it('does not flush when same speaker keeps talking', () => {
    transcriptMutationCallback([makeMutation('Alice', 'Short text')])
    transcriptMutationCallback([makeMutation('Alice', 'Short text, extended')])
    expect(state.transcript).toHaveLength(0)
    expect(state.transcriptTextBuffer).toBe('Short text, extended')
  })
})

describe('transcriptMutationCallback — 30-min restart threshold', () => {
  beforeEach(() => {
    state.transcript = []
    state.personNameBuffer = ''
    state.transcriptTextBuffer = ''
    state.timestampBuffer = ''
  })

  it('flushes when text shrinks by more than 250 chars', () => {
    const longText = 'A'.repeat(400)
    const restartedText = 'B'.repeat(50) // diff = 50 - 400 = -350 < -250
    transcriptMutationCallback([makeMutation('Alice', longText)])
    transcriptMutationCallback([makeMutation('Alice', restartedText)])
    expect(state.transcript).toHaveLength(1)
    expect(state.transcript[0].text).toBe(longText)
    expect(state.transcriptTextBuffer).toBe(restartedText)
  })

  it('does NOT flush when shrink is exactly -250 (threshold is strictly <)', () => {
    const longText = 'A'.repeat(400)
    const shrunkText = 'A'.repeat(150) // diff = 150 - 400 = -250, NOT < -250
    transcriptMutationCallback([makeMutation('Alice', longText)])
    transcriptMutationCallback([makeMutation('Alice', shrunkText)])
    expect(state.transcript).toHaveLength(0)
    expect(state.transcriptTextBuffer).toBe(shrunkText)
  })

  it('flushes when shrink is -251 (one over the boundary)', () => {
    const longText = 'A'.repeat(400)
    const shrunkText = 'A'.repeat(149) // diff = 149 - 400 = -251 < -250
    transcriptMutationCallback([makeMutation('Alice', longText)])
    transcriptMutationCallback([makeMutation('Alice', shrunkText)])
    expect(state.transcript).toHaveLength(1)
  })
})
