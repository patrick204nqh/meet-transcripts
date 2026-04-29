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
