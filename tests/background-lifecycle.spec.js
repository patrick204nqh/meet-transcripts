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

  test('tabs.onUpdated finalizes meeting when Meet tab navigates away from call URL', async ({ context, extensionId }) => {
    // Open popup page — stays open for storage polling throughout
    const popupPage = await context.newPage()
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)

    // Open a second page that will act as the "meeting tab"
    const meetingPage = await context.newPage()
    await meetingPage.goto(`chrome-extension://${extensionId}/popup.html`)

    // Get the meeting page's tab ID from the extension context
    const meetingTabId = await meetingPage.evaluate(() => {
      return new Promise((resolve) => chrome.tabs.getCurrent((tab) => resolve(tab ? tab.id : null)))
    })

    // Disable auto-download and auto-webhook so finalizeMeeting() completes synchronously
    // without triggering pending Chrome download or network operations that would block context teardown
    await popupPage.evaluate(() => {
      return new Promise((resolve) => chrome.storage.sync.set({
        autoDownloadFileAfterMeeting: false,
        autoPostWebhookAfterMeeting: false,
      }, resolve))
    })

    // Seed storage: this tab is the active meeting tab with transcript data
    await popupPage.evaluate((tabId) => {
      return new Promise((resolve) => chrome.storage.local.set({
        meetingTabId: tabId,
        startTimestamp: new Date().toISOString(),
        transcript: [{ personName: 'Alice', timestamp: new Date().toISOString(), text: 'Hello world' }],
        chatMessages: [],
      }, resolve))
    }, meetingTabId)

    // Verify meetingTabId is set correctly before navigation
    const before = await popupPage.evaluate(() => {
      return new Promise((resolve) => chrome.storage.local.get(['meetingTabId'], (r) => resolve(r.meetingTabId)))
    })
    expect(before).toBe(meetingTabId)

    // Use the test-only simulate_tab_navigated_away message to invoke the same handler logic
    // that tabs.onUpdated calls. Direct tab navigation to external URLs is unreliable in headless
    // Chrome (changeInfo.url is never populated because DNS resolution fails before commit).
    // The regex /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/ won't match 'https://meet.google.com/'
    await popupPage.evaluate((tabId) => {
      return new Promise((resolve) => chrome.runtime.sendMessage({
        type: 'simulate_tab_navigated_away',
        tabId,
        url: 'https://meet.google.com/',
      }, resolve))
    }, meetingTabId)

    // Poll from popup page (still has chrome access) until meetingTabId is cleared
    await expect.poll(
      () => popupPage.evaluate(() => new Promise((resolve) => chrome.storage.local.get(['meetingTabId'], (r) => resolve(r.meetingTabId)))),
      { timeout: 3000 }
    ).not.toBe(meetingTabId)

    await meetingPage.close()
    await popupPage.close()
  })
})
