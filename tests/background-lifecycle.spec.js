// @ts-check
import { test, expect } from './fixtures/extension.js';

test.describe('Background lifecycle', () => {
  test('get_debug_state returns expected shape when no meeting active', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`)

    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'get_debug_state' }, resolve)
      })
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      meetingCount: expect.any(Number),
      hasMeetingData: expect.any(Boolean),
    })
    expect(
      result.data.meetingTabId === null ||
      typeof result.data.meetingTabId === 'number' ||
      result.data.meetingTabId === 'processing'
    ).toBe(true)
  })

  test('new_meeting_started stores the sending tab ID', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/meetings.html`)

    // Clear any prior meetingTabId state
    await page.evaluate(() => new Promise((resolve) => chrome.storage.local.remove(['meetingTabId'], resolve)))

    // Get this tab's ID
    const thisTabId = await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.tabs.getCurrent((tab) => resolve(tab ? tab.id : null))
      })
    })

    // Send new_meeting_started from this tab (simulates content script)
    // Fire-and-forget: new_meeting_started has no response, so don't await the callback
    await page.evaluate(() => {
      chrome.runtime.sendMessage({ type: 'new_meeting_started' })
    })

    await expect.poll(
      () => page.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['meetingTabId'], (r) => resolve(r.meetingTabId)))),
      { timeout: 2000 }
    ).toBe(thisTabId)
  })

  test('tabs.onUpdated finalizes meeting when Meet tab navigates away from call URL', async ({ context, page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`)

    // Get the popup tab's ID
    const thisTabId = await page.evaluate(() => {
      return new Promise((resolve) => chrome.tabs.getCurrent((tab) => resolve(tab ? tab.id : null)))
    })

    // Seed: pretend this tab is the active meeting tab with transcript data
    await page.evaluate((tabId) => {
      return new Promise((resolve) => chrome.storage.local.set({
        meetingTabId: tabId,
        startTimestamp: new Date().toISOString(),
        transcript: [{ personName: 'Alice', timestamp: new Date().toISOString(), text: 'Hello world' }],
        chatMessages: [],
      }, resolve))
    }, thisTabId)

    // Verify meetingTabId is set to this tab
    const before = await page.evaluate(() => {
      return new Promise((resolve) => chrome.storage.local.get(['meetingTabId'], (r) => resolve(r.meetingTabId)))
    })
    expect(before).toBe(thisTabId)

    // Navigate this tab to Meet lobby (non-call URL) — triggers tabs.onUpdated with a URL change
    await page.goto('https://meet.google.com/')

    // The background listener should detect the navigation and finalize the meeting
    // meetingTabId should no longer match the original tab ID
    await expect.poll(
      () => page.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['meetingTabId'], (r) => resolve(r.meetingTabId)))),
      { timeout: 3000 }
    ).not.toBe(thisTabId)
  })
})
