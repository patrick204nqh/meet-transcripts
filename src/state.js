// @ts-check
/// <reference path="../types/index.js" />

/** @type {ExtensionStatusJSON} */
export const extensionStatusJSON_bug = {
  status: 400,
  message: `<strong>meet-transcripts encountered a new error</strong> <br /> Please report it <a href="https://github.com/patrick204nqh/meet-transcripts/issues" target="_blank">here</a>.`,
}

export const reportErrorMessage = "There is a bug in meet-transcripts. Please report it at https://github.com/patrick204nqh/meet-transcripts/issues"

/** @type {MutationObserverInit} */
export const mutationConfig = { childList: true, attributes: true, subtree: true, characterData: true }

/** @type {MeetingSoftware} */
export const meetingSoftware = "Google Meet"

export const state = {
  userName: /** @type {string} */ ("You"),
  transcript: /** @type {TranscriptBlock[]} */ ([]),
  transcriptTargetBuffer: /** @type {HTMLElement | null} */ (null),
  personNameBuffer: "",
  transcriptTextBuffer: "",
  timestampBuffer: "",
  chatMessages: /** @type {ChatMessage[]} */ ([]),
  meetingStartTimestamp: new Date().toISOString(),
  meetingTitle: document.title,
  isTranscriptDomErrorCaptured: false,
  isChatMessagesDomErrorCaptured: false,
  hasMeetingStarted: false,
  hasMeetingEnded: false,
  extensionStatusJSON: /** @type {ExtensionStatusJSON | null} */ (null),
}
