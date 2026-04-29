import type { Meeting } from '../types'
import { ErrorCode } from '../shared/errors'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { buildWebhookBody } from '../shared/formatters'

const notificationClickTargets = new Set<string>()

function registerNotificationClickListener() {
  if (!chrome.notifications?.onClicked) return
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationClickTargets.has(notificationId)) {
      notificationClickTargets.delete(notificationId)
      chrome.tabs.create({ url: "meetings.html" })
    }
  })
}

// notifications is optional — only register when the permission is present
chrome.permissions.contains({ permissions: ["notifications"] }, (has) => {
  if (has) registerNotificationClickListener()
})

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.permissions?.includes("notifications")) registerNotificationClickListener()
})

export async function postTranscriptToWebhook(index: number): Promise<string> {
  const [meetings, { webhookUrl, webhookBodyType }] = await Promise.all([
    StorageLocal.getMeetings(),
    StorageSync.getWebhookSettings(),
  ])

  if (!webhookUrl) throw { errorCode: ErrorCode.NO_WEBHOOK_URL, errorMessage: "No webhook URL configured" }
  if (!meetings[index]) throw { errorCode: ErrorCode.MEETING_NOT_FOUND, errorMessage: "Meeting at specified index not found" }

  const urlObj = new URL(webhookUrl)
  const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`
  const hasPermission = await new Promise<boolean>(res => chrome.permissions.contains({ origins: [originPattern] }, res))
  if (!hasPermission) throw { errorCode: ErrorCode.NO_HOST_PERMISSION, errorMessage: "No host permission for webhook URL. Re-save the webhook URL to grant permission." }

  const meeting: Meeting = meetings[index]
  const bodyType = webhookBodyType === "advanced" ? "advanced" : "simple"
  const webhookData = buildWebhookBody(meeting, bodyType)

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookData),
  }).catch(error => { throw { errorCode: ErrorCode.WEBHOOK_REQUEST_FAILED, errorMessage: error } })

  if (!response.ok) {
    const withFailed = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "failed" as const } : m)
    await StorageLocal.setMeetings(withFailed)
    chrome.notifications?.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "Could not post webhook!",
      message: `HTTP ${response.status} ${response.statusText}. Click to view and retry.`,
    }, (notificationId) => {
      notificationClickTargets.add(notificationId)
    })
    throw { errorCode: ErrorCode.WEBHOOK_REQUEST_FAILED, errorMessage: `HTTP ${response.status} ${response.statusText}` }
  }

  const withSuccess = meetings.map((m, i) => i === index ? { ...m, webhookPostStatus: "successful" as const } : m)
  await StorageLocal.setMeetings(withSuccess)
  return "Webhook posted successfully"
}
