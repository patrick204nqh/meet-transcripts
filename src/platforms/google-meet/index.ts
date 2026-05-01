import type { ErrorObject } from '../../types'
import { ErrorCode } from '../../shared/errors'
import { state } from '../../content/state'
import { waitForElement, showNotification } from '../../content/ui'
import { persistStateFields } from '../../content/state-sync'
import { recoverLastMeeting } from '../../shared/messages'
import { initializePipCapture } from '../../content/pip-capture'
import { MeetingSession } from '../../content/core/meeting-session'
import { GoogleMeetAdapter } from './adapter'
import { ChromeStorage } from '../../browser/chrome'

function checkExtensionStatus(): Promise<string> {
  return new Promise((resolve) => {
    state.extensionStatusJSON = { status: 200, message: "<strong>meet-transcripts is running</strong> <br /> Do not turn off captions" }
    resolve("Extension status set to operational")
  })
}

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
    persistStateFields(["software", "startTimestamp", "title", "transcript", "chatMessages"])
  })

checkExtensionStatus().finally(() => {
  if (state.extensionStatusJSON?.status === 200) {
    // Capture username before meeting starts
    waitForElement(".awLEm").then(() => {
      const captureInterval = setInterval(() => {
        if (!state.hasMeetingStarted) {
          const name = document.querySelector(".awLEm")?.textContent
          if (name) { state.userName = name; clearInterval(captureInterval) }
        } else {
          clearInterval(captureInterval)
        }
      }, 100)
    })

    const session = new MeetingSession(GoogleMeetAdapter, state, ChromeStorage)
    session.start()
    initializePipCapture()
  } else {
    showNotification(state.extensionStatusJSON)
  }
})
