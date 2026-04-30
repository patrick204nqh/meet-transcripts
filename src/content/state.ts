import type { AppState } from '../types'

export const state: AppState = {
  userName: "You",
  transcript: [],
  transcriptTargetBuffer: null,
  personNameBuffer: "",
  transcriptTextBuffer: "",
  timestampBuffer: "",
  chatMessages: [],
  startTimestamp: new Date().toISOString(),
  title: document.title,
  isTranscriptDomErrorCaptured: false,
  isChatMessagesDomErrorCaptured: false,
  hasMeetingStarted: false,
  hasMeetingEnded: false,
  pipObserverAttached: false,
  extensionStatusJSON: null,
}
