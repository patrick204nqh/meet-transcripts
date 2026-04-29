import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { MeetingService } from '../services/meeting-service'
import { clearTabIdAndApplyUpdate } from './lifecycle'
import { reRegisterContentScripts } from './content-scripts'

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
    StorageSync.setSettings({
      autoPostWebhookAfterMeeting: sync.autoPostWebhookAfterMeeting !== false,
      autoDownloadFileAfterMeeting: sync.autoDownloadFileAfterMeeting !== false,
      operationMode: sync.operationMode === "manual" ? "manual" : "auto",
      webhookBodyType: sync.webhookBodyType === "advanced" ? "advanced" : "simple",
    })
  })
})
