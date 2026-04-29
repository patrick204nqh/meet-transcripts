import type { ExtensionMessage, ExtensionResponse, ErrorObject } from '../types'
import { ErrorCode } from '../shared/errors'
import { StorageLocal } from '../shared/storage-repo'
import { MeetingService } from '../services/meeting'
import { DownloadService } from '../services/download'
import { WebhookService } from '../services/webhook'
import { clearTabIdAndApplyUpdate } from './lifecycle'
import './event-listeners'

const ok: ExtensionResponse = { success: true }
const err = (e: ErrorObject): ExtensionResponse => ({ success: false, error: e })
const invalidIndex: ExtensionResponse = { success: false, error: { errorCode: ErrorCode.INVALID_INDEX, errorMessage: "Invalid index" } }
const isValidIndex = (i: unknown): i is number => typeof i === "number" && i >= 0

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  const msg = raw as ExtensionMessage
  console.log(msg.type)

  if (msg.type === "new_meeting_started") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (tabId !== undefined) StorageLocal.setMeetingTabId(tabId).then(() => console.log("Meeting tab id saved"))
    })
    chrome.action.setBadgeText({ text: "REC" })
    chrome.action.setBadgeBackgroundColor({ color: "#c0392b" })
  }

  if (msg.type === "meeting_ended") {
    StorageLocal.setMeetingTabId("processing").then(() =>
      MeetingService.finalizeMeeting()
        .then(() => sendResponse(ok))
        .catch((e: ErrorObject) => sendResponse(err(e)))
        .finally(() => clearTabIdAndApplyUpdate())
    )
  }

  if (msg.type === "download_transcript_at_index") {
    isValidIndex(msg.index)
      ? DownloadService.downloadTranscript(msg.index).then(() => sendResponse(ok)).catch((e: ErrorObject) => sendResponse(err(e)))
      : sendResponse(invalidIndex)
  }

  if (msg.type === "post_webhook_at_index") {
    isValidIndex(msg.index)
      ? WebhookService.postWebhook(msg.index).then(() => sendResponse(ok)).catch((e: ErrorObject) => { console.error("Webhook retry failed:", e); sendResponse(err(e)) })
      : sendResponse(invalidIndex)
  }

  if (msg.type === "recover_last_meeting") {
    MeetingService.recoverMeeting()
      .then((m) => sendResponse({ success: true, data: m }))
      .catch((e: ErrorObject) => sendResponse(err(e)))
  }

  if (msg.type === "open_popup") {
    chrome.action.openPopup()
      .then((m) => sendResponse({ success: true, data: String(m) }))
      .catch((e: unknown) => sendResponse({ success: false, error: { errorCode: ErrorCode.POPUP_OPEN_FAILED, errorMessage: String(e) } }))
  }

  return true
})
