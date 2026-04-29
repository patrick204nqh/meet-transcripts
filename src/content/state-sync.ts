import type { MeetingEndReason } from '../types'
import { ErrorCode } from '../shared/errors'
import { state } from './state'
import { meetingSoftware as meetingSoftwareConst } from './constants'
import { pulseStatus } from './ui'
import { sendMessage } from '../shared/messages'

type StorageKey = "software" | "title" | "startTimestamp" | "transcript" | "chatMessages"

function buildStorageObject(keys: StorageKey[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  if (keys.includes("software")) obj.software = meetingSoftwareConst
  if (keys.includes("title")) obj.title = state.title
  if (keys.includes("startTimestamp")) obj.startTimestamp = state.startTimestamp
  if (keys.includes("transcript")) obj.transcript = state.transcript
  if (keys.includes("chatMessages")) obj.chatMessages = state.chatMessages
  return obj
}

export function persistStateFields(keys: StorageKey[]): void {
  chrome.storage.local.set(buildStorageObject(keys), () => pulseStatus())
}

export async function persistStateAndSignalEnd(keys: StorageKey[], reason: MeetingEndReason): Promise<void> {
  await chrome.storage.local.set(buildStorageObject(keys))
  pulseStatus()

  // On page_unload the content script's message channel will close before the background
  // can call sendResponse — fire-and-forget to avoid an "Unchecked runtime.lastError" warning.
  // The background's tabs.onUpdated/onRemoved listeners finalize the meeting as a fallback.
  if (reason === "page_unload") {
    chrome.runtime.sendMessage({ type: "meeting_ended", reason }).catch(() => {})
    return
  }

  const response = await sendMessage({ type: "meeting_ended", reason })
  if (!response.success && response.error.errorCode === ErrorCode.MEETING_NOT_FOUND) {
    console.error(response.error.errorMessage)
  }
}
