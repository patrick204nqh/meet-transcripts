import type { ExtensionMessage, ExtensionResponse, ErrorObject } from './types'
import { state, meetingSoftware } from './state'
import { pulseStatus } from './ui'

type StorageKey = "meetingSoftware" | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages"

export function overWriteChromeStorage(keys: StorageKey[], sendDownloadMessage: boolean): void {
  const objectToSave: Record<string, unknown> = {}
  if (keys.includes("meetingSoftware")) objectToSave.meetingSoftware = meetingSoftware
  if (keys.includes("meetingTitle")) objectToSave.meetingTitle = state.meetingTitle
  if (keys.includes("meetingStartTimestamp")) objectToSave.meetingStartTimestamp = state.meetingStartTimestamp
  if (keys.includes("transcript")) objectToSave.transcript = state.transcript
  if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages

  chrome.storage.local.set(objectToSave, () => {
    pulseStatus()
    if (sendDownloadMessage) {
      const message: ExtensionMessage = { type: "meeting_ended" }
      chrome.runtime.sendMessage(message, (raw: unknown) => {
        const response = raw as ExtensionResponse
        if (!response.success && typeof response.message === "object") {
          const err = response.message as ErrorObject
          if (err.errorCode === "010") console.error(err.errorMessage)
        }
      })
    }
  })
}

export function recoverLastMeeting(): Promise<string> {
  return new Promise((resolve, reject) => {
    const message: ExtensionMessage = { type: "recover_last_meeting" }
    chrome.runtime.sendMessage(message, (raw: unknown) => {
      const response = raw as ExtensionResponse
      if (response.success) {
        resolve("Last meeting recovered successfully or recovery not needed")
      } else {
        reject(response.message)
      }
    })
  })
}
