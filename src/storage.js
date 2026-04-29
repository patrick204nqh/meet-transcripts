// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

import { state, meetingSoftware } from './state.js'
import { pulseStatus } from './ui.js'

/**
 * @param {Array<"meetingSoftware" | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages">} keys
 * @param {boolean} sendDownloadMessage
 */
export function overWriteChromeStorage(keys, sendDownloadMessage) {
  const objectToSave = {}
  if (keys.includes("meetingSoftware")) objectToSave.meetingSoftware = meetingSoftware
  if (keys.includes("meetingTitle")) objectToSave.meetingTitle = state.meetingTitle
  if (keys.includes("meetingStartTimestamp")) objectToSave.meetingStartTimestamp = state.meetingStartTimestamp
  if (keys.includes("transcript")) objectToSave.transcript = state.transcript
  if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages

  chrome.storage.local.set(objectToSave, function () {
    pulseStatus()
    if (sendDownloadMessage) {
      /** @type {ExtensionMessage} */
      const message = { type: "meeting_ended" }
      chrome.runtime.sendMessage(message, (responseUntyped) => {
        const response = /** @type {ExtensionResponse} */ (responseUntyped)
        if ((!response.success) && (typeof response.message === 'object') && (response.message?.errorCode === "010")) {
          console.error(response.message.errorMessage)
        }
      })
    }
  })
}

export function recoverLastMeeting() {
  return new Promise((resolve, reject) => {
    /** @type {ExtensionMessage} */
    const message = { type: "recover_last_meeting" }
    chrome.runtime.sendMessage(message, function (responseUntyped) {
      const response = /** @type {ExtensionResponse} */ (responseUntyped)
      if (response.success) {
        resolve("Last meeting recovered successfully or recovery not needed")
      } else {
        reject(response.message)
      }
    })
  })
}
