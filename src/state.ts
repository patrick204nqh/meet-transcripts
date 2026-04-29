import type { AppState, ExtensionStatusJSON, MeetingSoftware } from './types'

export const extensionStatusJSON_bug: ExtensionStatusJSON = {
  status: 400,
  message: `<strong>meet-transcripts encountered a new error</strong> <br /> Please report it <a href="https://github.com/patrick204nqh/meet-transcripts/issues" target="_blank">here</a>.`,
}

export const reportErrorMessage = "There is a bug in meet-transcripts. Please report it at https://github.com/patrick204nqh/meet-transcripts/issues"

export const mutationConfig: MutationObserverInit = { childList: true, attributes: true, subtree: true, characterData: true }

export const meetingSoftware: MeetingSoftware = "Google Meet"

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
