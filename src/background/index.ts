import type { ExtensionMessage, ExtensionResponse, ErrorObject } from '../types'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { MeetingService } from '../services/meeting-service'
import { DownloadService } from '../services/download-service'
import { WebhookService } from '../services/webhook-service'
import { clearTabIdAndApplyUpdate } from './lifecycle'
import { reRegisterContentScripts } from './content-scripts'

const ok: ExtensionResponse = { success: true }
const err = (e: ErrorObject): ExtensionResponse => ({ success: false, message: e })
const invalidIndex: ExtensionResponse = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
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
      ? DownloadService.download(msg.index).then(() => sendResponse(ok)).catch((e: ErrorObject) => sendResponse(err(e)))
      : sendResponse(invalidIndex)
  }

  if (msg.type === "post_webhook_at_index") {
    isValidIndex(msg.index)
      ? WebhookService.post(msg.index).then(() => sendResponse(ok)).catch((e: ErrorObject) => { console.error("Webhook retry failed:", e); sendResponse(err(e)) })
      : sendResponse(invalidIndex)
  }

  if (msg.type === "recover_last_meeting") {
    MeetingService.recoverMeeting()
      .then((m) => sendResponse({ success: true, message: m }))
      .catch((e: ErrorObject) => sendResponse(err(e)))
  }

  if (msg.type === "open_popup") {
    chrome.action.openPopup()
      .then((m) => sendResponse({ success: true, message: String(m) }))
      .catch((e: unknown) => sendResponse({ success: false, message: String(e) }))
  }

  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  StorageLocal.getMeetingTabId().then((id) => {
    if (tabId === id) {
      console.log("Successfully intercepted tab close")
      StorageLocal.setMeetingTabId("processing").then(() =>
        MeetingService.finalizeMeeting().finally(() => clearTabIdAndApplyUpdate())
      )
    }
  })
})

chrome.runtime.onUpdateAvailable.addListener(() => {
  StorageLocal.getMeetingTabId().then((id) => {
    if (id) {
      StorageLocal.setDeferredUpdate(true).then(() => console.log("Deferred update flag set"))
    } else {
      console.log("No active meeting, applying update immediately")
      chrome.runtime.reload()
    }
  })
})

chrome.permissions.onAdded.addListener(() => {
  setTimeout(() => reRegisterContentScripts(), 2000)
})

chrome.runtime.onInstalled.addListener(() => {
  reRegisterContentScripts()
  StorageSync.getSettings().then((sync) => {
    StorageSync.saveSettings({
      autoPostWebhookAfterMeeting: sync.autoPostWebhookAfterMeeting !== false,
      autoDownloadFileAfterMeeting: sync.autoDownloadFileAfterMeeting !== false,
      operationMode: sync.operationMode === "manual" ? "manual" : "auto",
      webhookBodyType: sync.webhookBodyType === "advanced" ? "advanced" : "simple",
    })
  })
})
