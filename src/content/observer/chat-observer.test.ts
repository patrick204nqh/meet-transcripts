// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../state', () => ({
  state: {
    userName: 'You',
    chatMessages: [] as import('../../types').ChatMessage[],
    isChatMessagesDomErrorCaptured: false,
    hasMeetingEnded: false,
  },
}))
vi.mock('../state-sync', () => ({ persistStateFields: vi.fn() }))
vi.mock('../ui', () => ({ handleContentError: vi.fn() }))

import { state } from '../state'
import { handleContentError } from '../ui'
import { pushUniqueChatBlock, chatMessagesMutationCallback } from './chat-observer'

const msg = { personName: 'Alice', timestamp: '2024-01-01T09:00:00.000Z', text: 'Hello' }

describe('pushUniqueChatBlock', () => {
  beforeEach(() => {
    state.chatMessages = []
  })

  it('adds a new message to state.chatMessages', () => {
    pushUniqueChatBlock(msg)
    expect(state.chatMessages).toHaveLength(1)
    expect(state.chatMessages[0].text).toBe('Hello')
  })

  it('does not add a duplicate (same personName + text)', () => {
    pushUniqueChatBlock(msg)
    pushUniqueChatBlock(msg)
    expect(state.chatMessages).toHaveLength(1)
  })

  it('adds a message with same person but different text', () => {
    pushUniqueChatBlock(msg)
    pushUniqueChatBlock({ ...msg, text: 'Different' })
    expect(state.chatMessages).toHaveLength(2)
  })

  it('adds a message from a different person with same text', () => {
    pushUniqueChatBlock(msg)
    pushUniqueChatBlock({ ...msg, personName: 'Bob' })
    expect(state.chatMessages).toHaveLength(2)
  })
})

describe('chatMessagesMutationCallback — no chat root', () => {
  beforeEach(() => {
    state.chatMessages = []
    state.isChatMessagesDomErrorCaptured = false
    state.hasMeetingEnded = false
    document.body.innerHTML = ''
  })

  it('returns without adding messages when chat root element is absent', () => {
    chatMessagesMutationCallback([{} as MutationRecord])
    expect(state.chatMessages).toHaveLength(0)
  })
})

describe('chatMessagesMutationCallback — successful parse', () => {
  function buildChatRoot(personName: string | null, messageText: string): Element {
    // Matches parseChatFromRoot traversal:
    // chatRoot.lastChild → .firstChild → .firstChild → .lastChild = chatMessageElement
    // chatMessageElement.firstChild = personAndTimestamp (childNodes.length > 1 for named sender)
    // chatMessageElement.lastChild.lastChild.firstChild.firstChild.firstChild.textContent = text
    const textEl = document.createElement('div')
    textEl.textContent = messageText
    const deep4 = document.createElement('div')
    deep4.appendChild(textEl)
    const deep3 = document.createElement('div')
    deep3.appendChild(deep4)
    const deep2 = document.createElement('div')
    deep2.appendChild(deep3)
    const deep1 = document.createElement('div')
    deep1.appendChild(deep2)

    const personAndTimestamp = document.createElement('div')
    if (personName !== null) {
      const personEl = document.createElement('div')
      personEl.textContent = personName
      personAndTimestamp.appendChild(personEl)
      personAndTimestamp.appendChild(document.createElement('div')) // timestamp — makes childNodes.length = 2
    } else {
      personAndTimestamp.appendChild(document.createElement('div')) // single child → self (childNodes.length = 1)
    }

    const chatMessageElement = document.createElement('div')
    chatMessageElement.appendChild(personAndTimestamp) // firstChild
    chatMessageElement.appendChild(deep1)              // lastChild

    const level2 = document.createElement('div')
    level2.appendChild(chatMessageElement)
    const level1 = document.createElement('div')
    level1.appendChild(level2)
    const wrapper = document.createElement('div')
    wrapper.appendChild(level1)

    const chatRoot = document.createElement('div')
    chatRoot.setAttribute('aria-live', 'polite')
    chatRoot.className = 'Ge9Kpc'
    chatRoot.appendChild(wrapper)
    return chatRoot
  }

  beforeEach(() => {
    state.chatMessages = []
    state.userName = 'Patrick'
    document.body.innerHTML = ''
  })

  it('parses a named sender message and pushes it to chatMessages', () => {
    document.body.appendChild(buildChatRoot('Alice', 'Hello team'))
    const anchor = document.createElement('div')
    chatMessagesMutationCallback([{ target: anchor } as unknown as MutationRecord])
    expect(state.chatMessages).toHaveLength(1)
    expect(state.chatMessages[0].personName).toBe('Alice')
    expect(state.chatMessages[0].text).toBe('Hello team')
  })

  it('uses state.userName when sender is self (single child in personAndTimestamp)', () => {
    document.body.appendChild(buildChatRoot(null, 'My message'))
    const anchor = document.createElement('div')
    chatMessagesMutationCallback([{ target: anchor } as unknown as MutationRecord])
    expect(state.chatMessages).toHaveLength(1)
    expect(state.chatMessages[0].personName).toBe('Patrick')
  })

  it('does not push a duplicate message on repeated callback', () => {
    document.body.appendChild(buildChatRoot('Bob', 'Once'))
    const anchor = document.createElement('div')
    chatMessagesMutationCallback([{ target: anchor } as unknown as MutationRecord])
    chatMessagesMutationCallback([{ target: anchor } as unknown as MutationRecord])
    expect(state.chatMessages).toHaveLength(1)
  })

  it('does not push a message when chatRoot exists but is empty (no children)', () => {
    const emptyRoot = document.createElement('div')
    emptyRoot.setAttribute('aria-live', 'polite')
    emptyRoot.className = 'Ge9Kpc'
    document.body.appendChild(emptyRoot)
    chatMessagesMutationCallback([{ target: document.createElement('div') } as unknown as MutationRecord])
    expect(state.chatMessages).toHaveLength(0)
  })

  it('does not push a message when DOM structure cannot yield personName or text', () => {
    // chatRoot has children but the traversal chain resolves to null values
    const chatRoot = document.createElement('div')
    chatRoot.setAttribute('aria-live', 'polite')
    chatRoot.className = 'Ge9Kpc'
    chatRoot.appendChild(document.createElement('div')) // shallow wrapper, no deep structure
    document.body.appendChild(chatRoot)
    chatMessagesMutationCallback([{ target: document.createElement('div') } as unknown as MutationRecord])
    expect(state.chatMessages).toHaveLength(0)
  })
})

describe('chatMessagesMutationCallback — error catch path', () => {
  beforeEach(() => {
    state.chatMessages = []
    state.isChatMessagesDomErrorCaptured = false
    state.hasMeetingEnded = false
    vi.mocked(handleContentError).mockClear()
  })

  it('sets isChatMessagesDomErrorCaptured and calls handleContentError on first error', () => {
    const badTarget = new Proxy({} as Node, {
      get(_, prop) {
        if (prop === 'ownerDocument') throw new Error('DOM access failed')
        return undefined
      },
    })
    const errorMutation = { target: badTarget } as unknown as MutationRecord
    chatMessagesMutationCallback([errorMutation])
    expect(state.isChatMessagesDomErrorCaptured).toBe(true)
    expect(handleContentError).toHaveBeenCalledWith('006', expect.any(Error))
  })

  it('does not call handleContentError again after first capture', () => {
    state.isChatMessagesDomErrorCaptured = true
    const badTarget = new Proxy({} as Node, {
      get() { throw new Error('Again') },
    })
    chatMessagesMutationCallback([{ target: badTarget } as unknown as MutationRecord])
    expect(handleContentError).not.toHaveBeenCalled()
  })

  it('does not call handleContentError when hasMeetingEnded is true', () => {
    state.hasMeetingEnded = true
    const badTarget = new Proxy({} as Node, {
      get() { throw new Error('After end') },
    })
    chatMessagesMutationCallback([{ target: badTarget } as unknown as MutationRecord])
    expect(handleContentError).not.toHaveBeenCalled()
  })
})
