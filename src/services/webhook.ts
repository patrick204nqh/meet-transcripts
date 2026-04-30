import type { Meeting } from '../types'
import { ErrorCode, ExtensionError } from '../shared/errors'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { buildWebhookBody } from '../shared/formatters'

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

chrome.permissions.contains({ permissions: ["notifications"] }, (has) => {
  if (has) registerNotificationClickListener()
})

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.permissions?.includes("notifications")) registerNotificationClickListener()
})

export const WebhookService = {
  postWebhook: async (index: number): Promise<string> => {
    const [meetings, { webhookUrl, webhookBodyType }] = await Promise.all([
      StorageLocal.getMeetings(),
      StorageSync.getWebhookSettings(),
    ])

    if (!webhookUrl) throw new ExtensionError(ErrorCode.NO_WEBHOOK_URL, "No webhook URL configured", "NETWORK")
    if (!meetings[index]) throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")

    const urlObj = new URL(webhookUrl)
    const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`
    const hasPermission = await new Promise<boolean>(res => chrome.permissions.contains({ origins: [originPattern] }, res))
    if (!hasPermission) throw new ExtensionError(ErrorCode.NO_HOST_PERMISSION, "No host permission for webhook URL. Re-save the webhook URL to grant permission.", "PERMISSION")

    const meeting: Meeting = meetings[index]
    const bodyType = webhookBodyType === "advanced" ? "advanced" : "simple"
    const webhookData = buildWebhookBody(meeting, bodyType)

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookData),
    }).catch((error: unknown) => { throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, String(error), "NETWORK") })

    if (!response.ok) {
      const withFailed = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "failed" as const } : m)
      await StorageLocal.setMeetings(withFailed)
      chrome.notifications?.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Could not post webhook!",
        message: `HTTP ${response.status} ${response.statusText}. Click to view and retry.`,
      }, (notificationId) => {
        notificationClickTargets.add(notificationId)
      })
      throw new ExtensionError(ErrorCode.WEBHOOK_REQUEST_FAILED, `HTTP ${response.status} ${response.statusText}`, "NETWORK")
    }

    const withSuccess = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "successful" as const } : m)
    await StorageLocal.setMeetings(withSuccess)
    return "Webhook posted successfully"
  },
}
