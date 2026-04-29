import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { MeetingService } from '../services/meeting'
import { clearTabIdAndApplyUpdate } from './lifecycle'
import { reRegisterContentScript } from './content-script'

chrome.tabs.onRemoved.addListener((tabId) => {
  StorageLocal.getMeetingTabId().then((id) => {
    if (tabId === id) {
      console.log("Successfully intercepted tab close")
      StorageLocal.setMeetingTabId("processing").then(() =>
        MeetingService.finalizeMeeting()
          .catch((e) => console.error("finalizeMeeting failed on tab close:", e))
          .finally(() => clearTabIdAndApplyUpdate())
      )
    }
  })
})

// Active Google Meet call URL pattern: meet.google.com/abc-defg-hij
const MEET_CALL_URL = /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // changeInfo.url is only present on the first fire per navigation (when status = "loading")
  // and only for URLs the extension has host_permissions for (https://meet.google.com/*)
  if (!changeInfo.url) return

  StorageLocal.getMeetingTabId().then((id) => {
    if (id === "processing" || id === null || tabId !== id) return

    // Meet tab navigated away from an active call URL — treat as meeting exit
    if (!MEET_CALL_URL.test(changeInfo.url!)) {
      console.log("Meet tab navigated away from call — finalizing meeting")
      StorageLocal.setMeetingTabId("processing").then(() =>
        MeetingService.finalizeMeeting()
          .catch((e) => console.error("finalizeMeeting failed on navigation away:", e))
          .finally(() => clearTabIdAndApplyUpdate())
      )
    }
  })
})

chrome.runtime.onUpdateAvailable.addListener(() => {
  StorageLocal.getMeetingTabId().then((id) => {
    if (id) {
      StorageLocal.setDeferredUpdatePending(true).then(() => console.log("Deferred update flag set"))
    } else {
      console.log("No active meeting, applying update immediately")
      chrome.runtime.reload()
    }
  })
})

chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.permissions?.includes("notifications")) {
    // Re-register notification click listener when notifications permission is granted
  }
  setTimeout(() => reRegisterContentScript(), 2000)
})

chrome.runtime.onInstalled.addListener(() => {
  reRegisterContentScript()
  StorageSync.getSettings().then((sync) => {
    StorageSync.setSettings({
      autoPostWebhookAfterMeeting: sync.autoPostWebhookAfterMeeting !== false,
      autoDownloadFileAfterMeeting: sync.autoDownloadFileAfterMeeting !== false,
      operationMode: sync.operationMode === "manual" ? "manual" : "auto",
      webhookBodyType: sync.webhookBodyType === "advanced" ? "advanced" : "simple",
    })
  })
})
