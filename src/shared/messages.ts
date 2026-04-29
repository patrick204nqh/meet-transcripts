import type { ExtensionMessage, ExtensionResponse } from '../types'

export function sendMessage(msg: ExtensionMessage): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (raw: unknown) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
        return
      }
      resolve(raw as ExtensionResponse)
    })
  })
}

export function recoverLastMeeting(): Promise<string> {
  return sendMessage({ type: "recover_last_meeting" }).then((response) => {
    if (response.success) return "Last meeting recovered successfully or recovery not needed"
    return Promise.reject(response.message)
  })
}
