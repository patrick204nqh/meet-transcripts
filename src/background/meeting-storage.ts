import type { Meeting } from '../types'
import { ErrorCode } from '../shared/errors'
import { downloadTranscript } from './download'
import { postTranscriptToWebhook } from './webhook'

export function pickupLastMeetingFromStorage(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      ["meetingSoftware", "meetingTitle", "meetingStartTimestamp", "transcript", "chatMessages"],
      (raw) => {
        const result = raw as {
          meetingSoftware?: string
          meetingTitle?: string
          meetingStartTimestamp?: string
          transcript?: Array<unknown>
          chatMessages?: Array<unknown>
        }

        if (!result.meetingStartTimestamp) {
          reject({ errorCode: ErrorCode.NO_MEETINGS, errorMessage: "No meetings found. May be attend one?" })
          return
        }
        if (!result.transcript?.length && !result.chatMessages?.length) {
          reject({ errorCode: ErrorCode.EMPTY_TRANSCRIPT, errorMessage: "Empty transcript and empty chatMessages" })
          return
        }

        const newEntry: Meeting = {
          meetingSoftware: (result.meetingSoftware as Meeting["meetingSoftware"]) ?? "",
          meetingTitle: result.meetingTitle,
          meetingStartTimestamp: result.meetingStartTimestamp,
          meetingEndTimestamp: new Date().toISOString(),
          transcript: (result.transcript ?? []) as Meeting["transcript"],
          chatMessages: (result.chatMessages ?? []) as Meeting["chatMessages"],
          webhookPostStatus: "new",
        }

        chrome.storage.local.get(["meetings"], (localRaw) => {
          const local = localRaw as { meetings?: Meeting[] }
          let meetings = local.meetings ?? []
          meetings.push(newEntry)
          if (meetings.length > 10) meetings = meetings.slice(-10)
          chrome.storage.local.set({ meetings }, () => {
            console.log("Last meeting picked up")
            resolve("Last meeting picked up")
          })
        })
      }
    )
  })
}

export function processLastMeeting(): Promise<string> {
  return new Promise((resolve, reject) => {
    pickupLastMeetingFromStorage()
      .then(() => {
        chrome.storage.local.get(["meetings"], (localRaw) => {
          const local = localRaw as { meetings?: Meeting[] }
          chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"], (syncRaw) => {
            const sync = syncRaw as {
              webhookUrl?: string
              autoPostWebhookAfterMeeting?: boolean
              autoDownloadFileAfterMeeting?: boolean
            }

            // meetings is guaranteed non-empty after pickupLastMeetingFromStorage resolves
            const lastIndex = local.meetings!.length - 1
            const promises: Promise<unknown>[] = []

            if (sync.autoDownloadFileAfterMeeting) {
              promises.push(downloadTranscript(lastIndex, !!(sync.webhookUrl && sync.autoPostWebhookAfterMeeting)))
            }
            if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) {
              promises.push(postTranscriptToWebhook(lastIndex))
            }

            Promise.all(promises)
              .then(() => resolve("Meeting processing complete"))
              .catch((error) => {
                const err = error as { errorCode: string; errorMessage: string }
                reject({ errorCode: err.errorCode, errorMessage: err.errorMessage })
              })
          })
        })
      })
      .catch((error) => {
        const err = error as { errorCode: string; errorMessage: string }
        reject({ errorCode: err.errorCode, errorMessage: err.errorMessage })
      })
  })
}

export function recoverLastMeeting(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["meetings", "meetingStartTimestamp"], (raw) => {
      const result = raw as { meetings?: Meeting[]; meetingStartTimestamp?: string }

      if (!result.meetingStartTimestamp) {
        reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" })
        return
      }

      const meetings = result.meetings
      const lastSaved = meetings && meetings.length > 0 ? meetings[meetings.length - 1] : undefined
      if (!lastSaved || result.meetingStartTimestamp !== lastSaved.meetingStartTimestamp) {
        processLastMeeting()
          .then(() => resolve("Recovered last meeting to the best possible extent"))
          .catch((error) => {
            const err = error as { errorCode: string; errorMessage: string }
            reject({ errorCode: err.errorCode, errorMessage: err.errorMessage })
          })
      } else {
        resolve("No recovery needed")
      }
    })
  })
}
