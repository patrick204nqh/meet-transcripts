import type { Meeting } from '../types'
import { ErrorCode, ExtensionError } from '../shared/errors'
import { StorageLocal } from '../shared/storage-repo'
import { getTranscriptString, getChatMessagesString, buildTranscriptFilename } from '../shared/formatters'

export const DownloadService = {
  downloadTranscript: async (index: number): Promise<void> => {
    const meetings = await StorageLocal.getMeetings()
    if (!meetings[index]) {
      throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")
    }
    const meeting = meetings[index]
    const fileName = buildTranscriptFilename(meeting)
    let content = getTranscriptString(meeting.transcript)
    content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
    content += getChatMessagesString(meeting.chatMessages)
    content += "\n\n---------------\n"
    content += "Transcript saved using meet-transcripts (https://github.com/patrick204nqh/meet-transcripts)"
    content += "\n---------------"

    await new Promise<void>((resolve, reject) => {
      const blob = new Blob([content], { type: "text/plain" })
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onload = (event) => {
        if (!event.target?.result) {
          reject(new ExtensionError(ErrorCode.BLOB_READ_FAILED, "Failed to read blob", "STORAGE"))
          return
        }
        const dataUrl = event.target.result as string
        chrome.downloads.download({ url: dataUrl, filename: fileName, conflictAction: "uniquify" })
          .then(() => resolve())
          .catch(() => {
            chrome.downloads.download({ url: dataUrl, filename: "meet-transcripts/Transcript.txt", conflictAction: "uniquify" })
            resolve()
          })
      }
    })
  },

  formatTranscript: (meeting: Meeting): string => getTranscriptString(meeting.transcript),

  formatChatMessages: (meeting: Meeting): string => getChatMessagesString(meeting.chatMessages),

  getMeeting: async (index: number): Promise<Meeting> => {
    const meetings = await StorageLocal.getMeetings()
    const meeting = meetings[index]
    if (!meeting) throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")
    return meeting
  },
}
