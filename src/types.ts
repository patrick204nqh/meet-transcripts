export interface TranscriptBlock {
  personName: string
  timestamp: string
  text: string
}

export interface ChatMessage {
  personName: string
  timestamp: string
  text: string
}

export type MeetingSoftware = "Google Meet" | undefined
export type MeetingTabId = number | "processing" | null
export type OperationMode = "auto" | "manual"
export type WebhookBodyType = "simple" | "advanced"
export type MeetingEndReason = "user_click" | "page_unload"

export interface Meeting {
  software?: MeetingSoftware
  title?: string
  startTimestamp: string
  endTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  webhookPostStatus: "new" | "failed" | "successful"
}

export type WebhookBody =
  | {
      webhookBodyType: "advanced"
      software: string
      title: string
      startTimestamp: string
      endTimestamp: string
      transcript: TranscriptBlock[]
      chatMessages: ChatMessage[]
    }
  | {
      webhookBodyType: "simple"
      software: string
      title: string
      startTimestamp: string
      endTimestamp: string
      transcript: string
      chatMessages: string
    }

export interface ExtensionStatusJSON {
  status: number
  message: string
  showBetaMessage?: boolean
}

export interface ErrorObject {
  errorCode: string
  errorMessage: string
}

export interface DebugState {
  meetingTabId: MeetingTabId
  hasMeetingData: boolean
  meetingCount: number
  lastMeetingStart?: string
}

export type ExtensionMessage =
  | { type: "new_meeting_started" }
  | { type: "meeting_ended"; reason: MeetingEndReason }
  | { type: "download_transcript_at_index"; index: number }
  | { type: "post_webhook_at_index"; index: number }
  | { type: "recover_last_meeting" }
  | { type: "open_popup" }
  | { type: "get_debug_state" }
  /** Test-only: simulates tabs.onUpdated firing with a URL for the given tab ID. */
  | { type: "simulate_tab_navigated_away"; tabId: number; url: string }

export type ExtensionResponse<T = void> =
  | { success: true; data: T }
  | { success: false; error: ErrorObject }

export type Platform = "google_meet"

export interface AppState {
  userName: string
  transcript: TranscriptBlock[]
  transcriptTargetBuffer: Element | null
  personNameBuffer: string
  transcriptTextBuffer: string
  timestampBuffer: string
  chatMessages: ChatMessage[]
  startTimestamp: string
  title: string
  isTranscriptDomErrorCaptured: boolean
  isChatMessagesDomErrorCaptured: boolean
  hasMeetingStarted: boolean
  hasMeetingEnded: boolean
  pipObserverAttached: boolean
  extensionStatusJSON: ExtensionStatusJSON | null
}
