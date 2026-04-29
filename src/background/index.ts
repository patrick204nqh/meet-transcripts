import type { ExtensionMessage, ExtensionResponse, ErrorObject } from '../types'
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
      if (tabId === undefined) return
      chrome.storage.local.set({ meetingTabId: tabId }, () => {
        console.log("Meeting tab id saved")
      })
    })
    chrome.action.setBadgeText({ text: "REC" })
    chrome.action.setBadgeBackgroundColor({ color: "#c0392b" })
  }

  if (message.type === "meeting_ended") {
    chrome.storage.local.set({ meetingTabId: "processing" }, () => {
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
      sendResponse({ success: false, message: { errorCode: "015", errorMessage: "Invalid index" } } satisfies ExtensionResponse)
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
      sendResponse({ success: false, message: { errorCode: "015", errorMessage: "Invalid index" } } satisfies ExtensionResponse)
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
  chrome.storage.local.get(["meetingTabId"], (raw) => {
    const result = raw as { meetingTabId?: number | string | null }
    if (tabId === result.meetingTabId) {
      console.log("Successfully intercepted tab close")
      chrome.storage.local.set({ meetingTabId: "processing" }, () => {
        processLastMeeting().finally(() => clearTabIdAndApplyUpdate())
      })
    }
  })
})

chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.storage.local.get(["meetingTabId"], (raw) => {
    const result = raw as { meetingTabId?: number | string | null }
    if (result.meetingTabId) {
      chrome.storage.local.set({ isDeferredUpdatedAvailable: true }, () => {
        console.log("Deferred update flag set")
      })
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
  chrome.storage.sync.get(
    ["autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting", "operationMode", "webhookBodyType"],
    (raw) => {
      const sync = raw as {
        autoPostWebhookAfterMeeting?: boolean
        autoDownloadFileAfterMeeting?: boolean
        operationMode?: string
        webhookBodyType?: string
      }
      chrome.storage.sync.set({
        autoPostWebhookAfterMeeting: sync.autoPostWebhookAfterMeeting === false ? false : true,
        autoDownloadFileAfterMeeting: sync.autoDownloadFileAfterMeeting === false ? false : true,
        operationMode: sync.operationMode === "manual" ? "manual" : "auto",
        webhookBodyType: sync.webhookBodyType === "advanced" ? "advanced" : "simple",
      })
    }
  )
})
