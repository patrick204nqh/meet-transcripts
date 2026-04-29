import type { Platform } from '../types'

const PLATFORM_CONFIGS: Record<Platform, { id: string; js: string[]; matches: string[]; excludeMatches: string[] }> = {
  google_meet: {
    id: "google-meet",
    js: ["google-meet.js"],
    matches: ["https://meet.google.com/*"],
    excludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"],
  },
}

export function registerContentScript(platform: Platform, showNotification = true): Promise<string> {
  return new Promise((resolve, reject) => {
    const config = PLATFORM_CONFIGS[platform]
    chrome.permissions.contains({ origins: config.matches }).then((hasPermission) => {
      if (!hasPermission) {
        reject("Insufficient permissions")
        return
      }
      chrome.scripting.getRegisteredContentScripts().then((scripts) => {
        if (scripts.some(s => s.id === config.id)) {
          console.log(`${platform} content script already registered`)
          resolve("Content script already registered")
          return
        }
        chrome.scripting.registerContentScripts([{
          id: config.id,
          js: config.js,
          matches: config.matches,
          excludeMatches: config.excludeMatches,
          runAt: "document_end",
        }])
          .then(() => {
            console.log(`${platform} content script registered successfully.`)
            if (showNotification) {
              chrome.permissions.contains({ permissions: ["notifications"] }).then((hasNotifyPermission) => {
                if (hasNotifyPermission && chrome.notifications) {
                  chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icons/icon-128.png",
                    title: "Enabled!",
                    message: "Refresh any existing meeting pages",
                  })
                }
              })
            }
            resolve("Content script registered")
          })
          .catch((error) => {
            console.error(`${platform} registration failed.`, error)
            reject("Failed to register content script")
          })
      })
    })
  })
}

export function reRegisterContentScript(): void {
  registerContentScript("google_meet", false).catch((error) => {
    console.log(error)
  })
}
