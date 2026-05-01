import { describe, it, expect } from 'vitest'
import { makeChromeMock } from './chrome-mock'

describe('makeChromeMock — storage isolation', () => {
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
