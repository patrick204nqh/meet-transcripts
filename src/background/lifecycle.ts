import { StorageLocal } from '../shared/storage-repo'
import { log } from '../shared/logger'

export async function clearTabIdAndApplyUpdate(): Promise<void> {
  chrome.action.setBadgeText({ text: "" })
  await StorageLocal.setMeetingTabId(null)
  log.info("Meeting tab id cleared for next meeting")

  if (await StorageLocal.getDeferredUpdatePending()) {
    log.info("Applying deferred update")
    await StorageLocal.setDeferredUpdatePending(false)
    chrome.runtime.reload()
  }
}
