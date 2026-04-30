import type { Meeting } from '../types'
import { ErrorCode, ExtensionError } from '../shared/errors'
import { createStorageLocal, createStorageSync, StorageLocal, StorageSync } from '../shared/storage-repo'
import { buildWebhookBody } from '../shared/formatters'

export type WebhookDeps = {
  storageLocal: ReturnType<typeof createStorageLocal>
  storageSync: ReturnType<typeof createStorageSync>
  fetch: typeof globalThis.fetch
  hasHostPermission: (url: string) => Promise<boolean>
  notify: (title: string, message: string) => void
}

export function createWebhookService(deps: WebhookDeps) {
  return {
    postWebhook: async (index: number): Promise<string> => {
      const [meetings, { webhookUrl, webhookBodyType }] = await Promise.all([
        deps.storageLocal.getMeetings(),
        deps.storageSync.getWebhookSettings(),
      ])

      if (!webhookUrl) throw new ExtensionError(ErrorCode.NO_WEBHOOK_URL, "No webhook URL configured", "NETWORK")
      if (!meetings[index]) throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")

      const hasPermission = await deps.hasHostPermission(webhookUrl)
      if (!hasPermission) throw new ExtensionError(ErrorCode.NO_HOST_PERMISSION, "No host permission for webhook URL. Re-save the webhook URL to grant permission.", "PERMISSION")

      const meeting: Meeting = meetings[index]
      const bodyType = webhookBodyType === "advanced" ? "advanced" : "simple"
      const webhookData = buildWebhookBody(meeting, bodyType)

      const response = await deps.fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookData),
      }).catch((error: unknown) => { throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, String(error), "NETWORK") })

      if (!response.ok) {
        const withFailed = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "failed" as const } : m)
        await deps.storageLocal.setMeetings(withFailed)
        deps.notify("Could not post webhook!", `HTTP ${response.status} ${response.statusText}. Click to view and retry.`)
        throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, `HTTP ${response.status} ${response.statusText}`, "NETWORK")
      }

      const withSuccess = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "successful" as const } : m)
      await deps.storageLocal.setMeetings(withSuccess)
      return "Webhook posted successfully"
    },
  }
}

// --- Notification click tracking (extension-only, guarded for test environments) ---

const notificationClickTargets = new Set<string>()

function registerNotificationClickListener(): void {
  if (!chrome.notifications?.onClicked) return
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationClickTargets.has(notificationId)) {
      notificationClickTargets.delete(notificationId)
      chrome.tabs.create({ url: "meetings.html" })
    }
  })
}

if (typeof chrome !== 'undefined' && chrome.permissions?.contains) {
  chrome.permissions.contains({ permissions: ["notifications"] }, (has) => {
    if (has) registerNotificationClickListener()
  })
}

if (typeof chrome !== 'undefined' && chrome.permissions?.onAdded) {
  chrome.permissions.onAdded.addListener((permissions) => {
    if (permissions.permissions?.includes("notifications")) registerNotificationClickListener()
  })
}

// --- Backward-compatible singleton wired to real chrome APIs ---

export const WebhookService = createWebhookService({
  storageLocal: StorageLocal,
  storageSync: StorageSync,
  fetch: globalThis.fetch,
  hasHostPermission: async (webhookUrl: string): Promise<boolean> => {
    const urlObj = new URL(webhookUrl)
    const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`
    return new Promise<boolean>(res => chrome.permissions.contains({ origins: [originPattern] }, res))
  },
  notify: (title, message) => {
    chrome.notifications?.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title,
      message,
    }, (notificationId) => {
      notificationClickTargets.add(notificationId)
    })
  },
})
