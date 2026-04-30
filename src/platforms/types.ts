import type { TranscriptBlock, ChatMessage } from '../types'

export interface TranscriptBlockDraft {
  personName: string
  text: string
}

export interface IPlatformAdapter {
  /** Human-readable name stored in Meeting.software */
  readonly name: string
  /** URL patterns for chrome.scripting.registerContentScripts */
  readonly urlMatches: string[]
  readonly urlExcludeMatches?: string[]
  /** CSS selector for the captions region element */
  readonly captionContainerSelector: string
  /** CSS selector for the current user's display name element */
  readonly userNameSelector: string

  waitForMeetingStart(): Promise<Element>
  waitForCaptionsReady(): Promise<Element>
  waitForChatContainer(): Promise<Element>
  enableCaptions(captionsElement: Element): void
  openAndCloseChat(chatElement: Element): void
  waitForTitleElement(): Promise<HTMLElement>

  /**
   * Parse a MutationRecord from the caption region.
   * Returns a draft if a complete caption block is ready, null otherwise.
   */
  parseTranscriptMutation(mutation: MutationRecord, currentUser: string): TranscriptBlockDraft | null

  /**
   * Parse the chat container for the latest unique message.
   * Receives the observed root element — must NOT call document.querySelector.
   */
  parseChatMutation(chatRoot: Element, currentUser: string): Omit<ChatMessage, 'timestamp'> | null
}
