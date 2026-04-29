import { ErrorCode } from '../shared/errors'
import { StorageLocal } from '../shared/storage-repo'
import { getTranscriptString, getChatMessagesString, buildTranscriptFilename } from '../shared/formatters'

export async function downloadTranscript(index: number): Promise<void> {
  const meetings = await StorageLocal.getMeetings()

  if (!meetings[index]) {
    throw { errorCode: ErrorCode.MEETING_NOT_FOUND, errorMessage: "Meeting at specified index not found" }
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
        reject({ errorCode: ErrorCode.BLOB_READ_FAILED, errorMessage: "Failed to read blob" })
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
}
