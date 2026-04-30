import type { Meeting } from '../types'
import { ErrorCode, ExtensionError } from '../shared/errors'
import { createStorageLocal, StorageLocal } from '../shared/storage-repo'
import { getTranscriptString, getChatMessagesString, buildTranscriptFilename } from '../shared/formatters'

export type DownloadDeps = {
  storageLocal: ReturnType<typeof createStorageLocal>
  blobToDataUrl: (blob: Blob) => Promise<string>
  triggerDownload: (opts: { url: string; filename: string; conflictAction: string }) => Promise<void>
}

export function createDownloadService(deps: DownloadDeps) {
  return {
    getMeeting: async (index: number): Promise<Meeting> => {
      const meetings = await deps.storageLocal.getMeetings()
      const meeting = meetings[index]
      if (!meeting) throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")
      return meeting
    },

    formatTranscript: (meeting: Meeting): string => getTranscriptString(meeting.transcript),

    formatChatMessages: (meeting: Meeting): string => getChatMessagesString(meeting.chatMessages),

    downloadTranscript: async (index: number): Promise<void> => {
      const meetings = await deps.storageLocal.getMeetings()
      if (!meetings[index]) {
        throw new ExtensionError(ErrorCode.MEETING_NOT_FOUND, "Meeting at specified index not found", "MEETING")
      }
      const meeting = meetings[index]
      const filename = buildTranscriptFilename(meeting)

      let content = getTranscriptString(meeting.transcript)
      content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
      content += getChatMessagesString(meeting.chatMessages)
      content += "\n\n---------------\n"
      content += "Transcript saved using meet-transcripts (https://github.com/patrick204nqh/meet-transcripts)"
      content += "\n---------------"

      const blob = new Blob([content], { type: "text/plain" })
      const dataUrl = await deps.blobToDataUrl(blob)
      await deps.triggerDownload({ url: dataUrl, filename, conflictAction: "uniquify" })
    },
  }
}

// --- Backward-compatible singleton wired to real chrome/FileReader APIs ---

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(blob)
    reader.onload = (event) => {
      if (!event.target?.result) {
        reject(new ExtensionError(ErrorCode.BLOB_READ_FAILED, "Failed to read blob", "STORAGE"))
        return
      }
      resolve(event.target.result as string)
    }
  })
}

async function triggerDownload(opts: { url: string; filename: string; conflictAction: string }): Promise<void> {
  await chrome.downloads.download(opts as chrome.downloads.DownloadOptions)
    .catch(() => {
      chrome.downloads.download({ url: opts.url, filename: "meet-transcripts/Transcript.txt", conflictAction: "uniquify" })
    })
}

export const DownloadService = createDownloadService({
  storageLocal: StorageLocal,
  blobToDataUrl,
  triggerDownload,
})
