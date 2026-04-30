import type { AppState } from '../types'

export function createSessionState(): AppState {
  return {
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
}

// Backward-compatible singleton — replaced by createSessionState() in the entry point.
// Modules that still import `state` directly will continue to work until each is
// migrated to receive state as a parameter.
export const state: AppState = createSessionState()
