import type { TranscriptBlock, ChatMessage } from '../types'

const timeFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}

export function getTranscriptString(transcript: TranscriptBlock[]): string {
  if (transcript.length === 0) return ""
  return transcript.map(block =>
    `${block.personName} (${new Date(block.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${block.transcriptText}\n\n`
  ).join("")
}

export function getChatMessagesString(chatMessages: ChatMessage[]): string {
  if (chatMessages.length === 0) return ""
  return chatMessages.map(msg =>
    `${msg.personName} (${new Date(msg.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${msg.chatMessageText}\n\n`
  ).join("")
}

export function downloadTranscript(index: number, _isWebhookEnabled: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["meetings"], (raw) => {
      const result = raw as { meetings?: Array<{ meetingTitle?: string; title?: string; meetingSoftware?: string; meetingStartTimestamp: string; transcript: TranscriptBlock[]; chatMessages: ChatMessage[] }> }

      if (!result.meetings || !result.meetings[index]) {
        reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
        return
      }

      const meeting = result.meetings[index]
      const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
      let sanitisedTitle = "Meeting"
      if (meeting.meetingTitle) {
        sanitisedTitle = meeting.meetingTitle.replaceAll(invalidFilenameRegex, "_")
      } else if (meeting.title) {
        sanitisedTitle = meeting.title.replaceAll(invalidFilenameRegex, "_")
      }

      const timestamp = new Date(meeting.meetingStartTimestamp)
      const formattedTimestamp = timestamp.toLocaleString("default", timeFormat).replace(/[/:]/g, "-")
      const prefix = meeting.meetingSoftware ? `${meeting.meetingSoftware} transcript` : "Transcript"
      const fileName = `meet-transcripts/${prefix}-${sanitisedTitle} at ${formattedTimestamp} on.txt`

      let content = getTranscriptString(meeting.transcript)
      content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
      content += getChatMessagesString(meeting.chatMessages)
      content += "\n\n---------------\n"
      content += "Transcript saved using meet-transcripts (https://github.com/patrick204nqh/meet-transcripts)"
      content += "\n---------------"

      const blob = new Blob([content], { type: "text/plain" })
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onload = (event) => {
        if (!event.target?.result) {
          reject({ errorCode: "009", errorMessage: "Failed to read blob" })
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
  })
}
