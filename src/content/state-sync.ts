import type { ErrorObject } from '../types'
import { state } from './state'
import { meetingSoftware as meetingSoftwareConst } from './constants'
import { pulseStatus } from './ui'
import { sendMessage } from '../shared/messages'

type StorageKey = "software" | "title" | "startTimestamp" | "transcript" | "chatMessages"

export function persistStateFields(keys: StorageKey[], sendEndMessage: boolean): void {
  const objectToSave: Record<string, unknown> = {}
  if (keys.includes("software")) objectToSave.software = meetingSoftwareConst
  if (keys.includes("title")) objectToSave.title = state.title
  if (keys.includes("startTimestamp")) objectToSave.startTimestamp = state.startTimestamp
  if (keys.includes("transcript")) objectToSave.transcript = state.transcript
  if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages

  chrome.storage.local.set(objectToSave, () => {
    pulseStatus()
    if (sendEndMessage) {
      sendMessage({ type: "meeting_ended" }).then((response) => {
        if (!response.success && typeof response.message === "object") {
          const err = response.message as ErrorObject
          if (err.errorCode === "010") console.error(err.errorMessage)
        }
      })
    }
  })
}
