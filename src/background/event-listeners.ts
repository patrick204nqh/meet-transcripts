import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { MeetingService } from '../services/meeting-service'
import { clearTabIdAndApplyUpdate } from './lifecycle'
import { reRegisterContentScript } from './content-script'

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
      StorageLocal.setDeferredUpdatePending(true).then(() => console.log("Deferred update flag set"))
    } else {
      console.log("No active meeting, applying update immediately")
      chrome.runtime.reload()
    }
  })
})

chrome.permissions.onAdded.addListener(() => {
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
