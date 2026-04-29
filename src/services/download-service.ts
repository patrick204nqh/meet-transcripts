import type { Meeting } from '../types'
import { ErrorCode } from '../shared/errors'
import { StorageLocal } from '../shared/storage-repo'
import { downloadTranscript, getTranscriptString, getChatMessagesString } from '../background/download'

export const DownloadService = {
  downloadTranscript: async (index: number): Promise<void> => downloadTranscript(index, false),

  formatTranscript: (meeting: Meeting): string => getTranscriptString(meeting.transcript),

  formatChatMessages: (meeting: Meeting): string => getChatMessagesString(meeting.chatMessages),

  getMeeting: async (index: number): Promise<Meeting> => {
    const meetings = await StorageLocal.getMeetings()
    const meeting = meetings[index]
    if (!meeting) throw { errorCode: ErrorCode.MEETING_NOT_FOUND, errorMessage: "Meeting at specified index not found" }
    return meeting
  },
}
