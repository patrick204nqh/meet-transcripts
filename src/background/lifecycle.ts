export function clearTabIdAndApplyUpdate(): void {
  chrome.action.setBadgeText({ text: "" })
  chrome.storage.local.set({ meetingTabId: null }, () => {
    console.log("Meeting tab id cleared for next meeting")
    chrome.storage.local.get(["isDeferredUpdatedAvailable"], (raw) => {
      const result = raw as { isDeferredUpdatedAvailable?: boolean }
      if (result.isDeferredUpdatedAvailable) {
        console.log("Applying deferred update")
        chrome.storage.local.set({ isDeferredUpdatedAvailable: false }, () => {
          chrome.runtime.reload()
        })
      }
    })
  })
}
