import type { ErrorObject } from './types'
import { ErrorCode } from './shared/errors'
import { state } from './state'
import { waitForElement, showNotification } from './ui'
import { persistStateFields } from './state-sync'
import { recoverLastMeeting } from './shared/messages'
import { checkExtensionStatus, meetingRoutines } from './meeting'

// Attempt to recover last meeting, if any. Abort if it takes more than 2 seconds.
Promise.race([
  recoverLastMeeting(),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject({ errorCode: ErrorCode.NO_HOST_PERMISSION, errorMessage: "Recovery timed out" }), 2000)
  )
])
  .catch((error: unknown) => {
    const parsedError = error as ErrorObject
    if (parsedError.errorCode !== ErrorCode.NO_MEETINGS && parsedError.errorCode !== ErrorCode.EMPTY_TRANSCRIPT) {
      console.error(parsedError.errorMessage)
    }
  })
  .finally(() => {
    persistStateFields(["software", "startTimestamp", "title", "transcript", "chatMessages"], false)
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
