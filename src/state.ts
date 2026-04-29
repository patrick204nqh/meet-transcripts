import type { AppState } from './types'

export const state: AppState = {
  userName: "You",
  transcript: [],
  transcriptTargetBuffer: null,
  personNameBuffer: "",
  transcriptTextBuffer: "",
  timestampBuffer: "",
  chatMessages: [],
  meetingStartTimestamp: new Date().toISOString(),
  meetingTitle: document.title,
  isTranscriptDomErrorCaptured: false,
  isChatMessagesDomErrorCaptured: false,
  hasMeetingStarted: false,
  hasMeetingEnded: false,
  extensionStatusJSON: null,
}
