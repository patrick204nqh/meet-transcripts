import { StorageLocal } from '../shared/storage-repo'

export async function clearTabIdAndApplyUpdate(): Promise<void> {
  chrome.action.setBadgeText({ text: "" })
  await StorageLocal.setMeetingTabId(null)
  console.log("Meeting tab id cleared for next meeting")

  if (await StorageLocal.isDeferredUpdateAvailable()) {
    console.log("Applying deferred update")
    await StorageLocal.setDeferredUpdate(false)
    chrome.runtime.reload()
  }
}
