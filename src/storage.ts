import type { ErrorObject } from './types'
import { state, meetingSoftware } from './state'
import { pulseStatus } from './ui'
import { sendMessage } from './shared/messages'

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
      sendMessage({ type: "meeting_ended" }).then((response) => {
        if (!response.success && typeof response.message === "object") {
          const err = response.message as ErrorObject
          if (err.errorCode === "010") console.error(err.errorMessage)
        }
      })
    }
  })
}

export function recoverLastMeeting(): Promise<string> {
  return sendMessage({ type: "recover_last_meeting" }).then((response) => {
    if (response.success) return "Last meeting recovered successfully or recovery not needed"
    return Promise.reject(response.message)
  })
}
