import type { MeetingEndReason } from '../types'

export const PROTOCOL_VERSION = 1 as const
export const MIN_SUPPORTED_VERSION = 1 as const

type ProductionMessage =
  | { type: "new_meeting_started" }
  | { type: "meeting_ended"; reason: MeetingEndReason }
  | { type: "download_transcript_at_index"; index: number }
  | { type: "post_webhook_at_index"; index: number }
  | { type: "recover_last_meeting" }
  | { type: "open_popup" }
  | { type: "get_debug_state" }

type DevMessage =
  | { type: "simulate_tab_navigated_away"; tabId: number; url: string }

export type ExtensionMessage = (ProductionMessage | DevMessage) & { v: typeof PROTOCOL_VERSION }

export function msg<T extends ProductionMessage | DevMessage>(m: T): T & { v: typeof PROTOCOL_VERSION } {
  return { ...m, v: PROTOCOL_VERSION }
}
