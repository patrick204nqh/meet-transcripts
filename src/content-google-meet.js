// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

import { state } from './state.js'
import { waitForElement, showNotification } from './ui.js'
import { overWriteChromeStorage, recoverLastMeeting } from './storage.js'
import { checkExtensionStatus, meetingRoutines } from './meeting.js'

// Attempt to recover last meeting, if any. Abort if it takes more than 2 seconds.
Promise.race([
  recoverLastMeeting(),
  new Promise((_, reject) =>
    setTimeout(() => reject({ errorCode: "016", errorMessage: "Recovery timed out" }), 2000)
  )
])
  .catch((error) => {
    const parsedError = /** @type {ErrorObject} */ (error)
    if ((parsedError.errorCode !== "013") && (parsedError.errorCode !== "014")) {
      console.error(parsedError.errorMessage)
    }
  })
  .finally(() => {
    overWriteChromeStorage(["meetingSoftware", "meetingStartTimestamp", "meetingTitle", "transcript", "chatMessages"], false)
  })

checkExtensionStatus().finally(() => {
  console.log("Extension status " + state.extensionStatusJSON?.status)

  if (state.extensionStatusJSON?.status === 200) {
    // NON CRITICAL DOM DEPENDENCY. Capture username before meeting starts.
    waitForElement(".awLEm").then(() => {
      const captureUserNameInterval = setInterval(() => {
        if (!state.hasMeetingStarted) {
          const capturedUserName = document.querySelector(".awLEm")?.textContent
          if (capturedUserName) {
            state.userName = capturedUserName
            clearInterval(captureUserNameInterval)
          }
        } else {
          clearInterval(captureUserNameInterval)
        }
      }, 100)
    })

    // Meet UI post July/Aug 2024
    meetingRoutines(2)
  } else {
    showNotification(state.extensionStatusJSON)
  }
})
