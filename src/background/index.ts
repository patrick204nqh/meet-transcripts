import type { ExtensionMessage, ExtensionResponse, ErrorObject } from '../types'
import { ErrorCode } from '../shared/errors'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { processLastMeeting, recoverLastMeeting } from './meeting-storage'
import { downloadTranscript } from './download'
import { postTranscriptToWebhook } from './webhook'
import { clearTabIdAndApplyUpdate } from './lifecycle'
import { reRegisterContentScripts } from './content-scripts'

chrome.runtime.onMessage.addListener((messageUntyped, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return

  const message = messageUntyped as ExtensionMessage
  console.log(message.type)

  if (message.type === "new_meeting_started") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      if (tabId !== undefined) StorageLocal.setMeetingTabId(tabId).then(() => console.log("Meeting tab id saved"))
    })
    chrome.action.setBadgeText({ text: "REC" })
    chrome.action.setBadgeBackgroundColor({ color: "#c0392b" })
  }

  if (message.type === "meeting_ended") {
    StorageLocal.setMeetingTabId("processing").then(() => {
      processLastMeeting()
        .then(() => sendResponse({ success: true } satisfies ExtensionResponse))
        .catch((error: ErrorObject) => sendResponse({ success: false, message: error } satisfies ExtensionResponse))
        .finally(() => clearTabIdAndApplyUpdate())
    })
  }

  if (message.type === "download_transcript_at_index") {
    if (typeof message.index === "number" && message.index >= 0) {
      downloadTranscript(message.index, false)
        .then(() => sendResponse({ success: true } satisfies ExtensionResponse))
        .catch((error: ErrorObject) => sendResponse({ success: false, message: error } satisfies ExtensionResponse))
    } else {
      sendResponse({ success: false, message: { errorCode: ErrorCode.INVALID_INDEX, errorMessage: "Invalid index" } } satisfies ExtensionResponse)
    }
  }

  if (message.type === "post_webhook_at_index") {
    if (typeof message.index === "number" && message.index >= 0) {
      postTranscriptToWebhook(message.index)
        .then(() => sendResponse({ success: true } satisfies ExtensionResponse))
        .catch((error: ErrorObject) => {
          console.error("Webhook retry failed:", error)
          sendResponse({ success: false, message: error } satisfies ExtensionResponse)
        })
    } else {
      sendResponse({ success: false, message: { errorCode: ErrorCode.INVALID_INDEX, errorMessage: "Invalid index" } } satisfies ExtensionResponse)
    }
  }

  if (message.type === "recover_last_meeting") {
    recoverLastMeeting()
      .then((msg) => sendResponse({ success: true, message: msg } satisfies ExtensionResponse))
      .catch((error: ErrorObject) => sendResponse({ success: false, message: error } satisfies ExtensionResponse))
  }

  if (message.type === "open_popup") {
    chrome.action.openPopup()
      .then((msg) => sendResponse({ success: true, message: String(msg) } satisfies ExtensionResponse))
      .catch((error: unknown) => sendResponse({ success: false, message: String(error) } satisfies ExtensionResponse))
  }

  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  StorageLocal.getMeetingTabId().then((meetingTabId) => {
    if (tabId === meetingTabId) {
      console.log("Successfully intercepted tab close")
      StorageLocal.setMeetingTabId("processing").then(() => {
        processLastMeeting().finally(() => clearTabIdAndApplyUpdate())
      })
    }
  })
})

chrome.runtime.onUpdateAvailable.addListener(() => {
  StorageLocal.getMeetingTabId().then((meetingTabId) => {
    if (meetingTabId) {
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
      autoPostWebhookAfterMeeting: sync.autoPostWebhookAfterMeeting === false ? false : true,
      autoDownloadFileAfterMeeting: sync.autoDownloadFileAfterMeeting === false ? false : true,
      operationMode: sync.operationMode === "manual" ? "manual" : "auto",
      webhookBodyType: sync.webhookBodyType === "advanced" ? "advanced" : "simple",
    })
  })
})
