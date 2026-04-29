import type { Meeting, WebhookBody } from '../types'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { getTranscriptString, getChatMessagesString } from './download'

const timeFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}

const notificationClickTargets = new Set<string>()

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationClickTargets.has(notificationId)) {
    notificationClickTargets.delete(notificationId)
    chrome.tabs.create({ url: "meetings.html" })
  }
})

export async function postTranscriptToWebhook(index: number): Promise<string> {
  const [meetings, { webhookUrl, webhookBodyType }] = await Promise.all([
    StorageLocal.getMeetings(),
    StorageSync.getWebhookConfig(),
  ])

  if (!webhookUrl) throw { errorCode: "012", errorMessage: "No webhook URL configured" }
  if (!meetings[index]) throw { errorCode: "010", errorMessage: "Meeting at specified index not found" }

  const urlObj = new URL(webhookUrl)
  const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`
  const hasPermission = await new Promise<boolean>(res => chrome.permissions.contains({ origins: [originPattern] }, res))
  if (!hasPermission) throw { errorCode: "016", errorMessage: "No host permission for webhook URL. Re-save the webhook URL to grant permission." }

  const meeting: Meeting = meetings[index]
  const bodyType = webhookBodyType === "advanced" ? "advanced" : "simple"
  const webhookData: WebhookBody = bodyType === "advanced"
    ? {
        webhookBodyType: "advanced",
        meetingSoftware: meeting.meetingSoftware || "",
        meetingTitle: meeting.meetingTitle || meeting.title || "",
        meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toISOString(),
        meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toISOString(),
        transcript: meeting.transcript,
        chatMessages: meeting.chatMessages,
      }
    : {
        webhookBodyType: "simple",
        meetingSoftware: meeting.meetingSoftware || "",
        meetingTitle: meeting.meetingTitle || meeting.title || "",
        meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
        meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
        transcript: getTranscriptString(meeting.transcript),
        chatMessages: getChatMessagesString(meeting.chatMessages),
      }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookData),
  }).catch(error => { throw { errorCode: "011", errorMessage: error } })

  if (!response.ok) {
    meetings[index].webhookPostStatus = "failed"
    await StorageLocal.saveMeetings(meetings)
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "Could not post webhook!",
      message: `HTTP ${response.status} ${response.statusText}. Click to view and retry.`,
    }, (notificationId) => {
      notificationClickTargets.add(notificationId)
    })
    throw { errorCode: "011", errorMessage: `HTTP ${response.status} ${response.statusText}` }
  }

  meetings[index].webhookPostStatus = "successful"
  await StorageLocal.saveMeetings(meetings)
  return "Webhook posted successfully"
}
