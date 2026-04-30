import type { Meeting, MeetingTabId, MeetingSoftware, TranscriptBlock, ChatMessage, OperationMode, WebhookBodyType } from '../types'
import type { IBrowserStorage } from '../browser/types'

export interface LocalState {
  meetingTabId: MeetingTabId
  software: MeetingSoftware
  title: string
  startTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  deferredUpdatePending: boolean
  meetings: Meeting[]
}

export interface SyncSettings {
  autoPostWebhookAfterMeeting: boolean
  autoDownloadFileAfterMeeting: boolean
  operationMode: OperationMode
  webhookBodyType: WebhookBodyType
  webhookUrl: string
}

function migrateTranscriptBlock(raw: Record<string, unknown>): TranscriptBlock {
  return {
    personName: raw.personName as string,
    timestamp: raw.timestamp as string,
    text: (raw.text ?? raw.transcriptText) as string ?? "",
  }
}

function migrateChatMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    personName: raw.personName as string,
    timestamp: raw.timestamp as string,
    text: (raw.text ?? raw.chatMessageText) as string ?? "",
  }
}

function migrateMeeting(raw: Record<string, unknown>): Meeting {
  return {
    software: (raw.software ?? raw.meetingSoftware) as MeetingSoftware,
    title: (raw.title ?? raw.meetingTitle) as string | undefined,
    startTimestamp: (raw.startTimestamp ?? raw.meetingStartTimestamp) as string,
    endTimestamp: (raw.endTimestamp ?? raw.meetingEndTimestamp) as string,
    transcript: ((raw.transcript ?? []) as Record<string, unknown>[]).map(migrateTranscriptBlock),
    chatMessages: ((raw.chatMessages ?? []) as Record<string, unknown>[]).map(migrateChatMessage),
    webhookPostStatus: (raw.webhookPostStatus ?? "new") as "new" | "failed" | "successful",
  }
}

export function createStorageLocal(storage: IBrowserStorage) {
  return {
    getMeetings: async (): Promise<Meeting[]> => {
      const raw = await storage.localGet(["meetings"])
      const meetings = (raw.meetings as Record<string, unknown>[] | undefined) ?? []
      return meetings.map(migrateMeeting)
    },

    setMeetings: (meetings: Meeting[]): Promise<void> =>
      storage.localSet({ meetings }),

    getMeetingTabId: async (): Promise<MeetingTabId> => {
      const raw = await storage.localGet(["meetingTabId"])
      return (raw.meetingTabId as MeetingTabId | undefined) ?? null
    },

    setMeetingTabId: (id: MeetingTabId): Promise<void> =>
      storage.localSet({ meetingTabId: id }),

    getCurrentMeetingData: async (): Promise<Partial<LocalState>> => {
      const raw = await storage.localGet([
        "software", "title", "startTimestamp", "transcript", "chatMessages",
        "meetingSoftware", "meetingTitle", "meetingStartTimestamp",
      ])
      return {
        software: (raw.software ?? raw.meetingSoftware) as MeetingSoftware | undefined,
        title: (raw.title ?? raw.meetingTitle) as string | undefined,
        startTimestamp: (raw.startTimestamp ?? raw.meetingStartTimestamp) as string | undefined,
        transcript: raw.transcript as TranscriptBlock[] | undefined,
        chatMessages: raw.chatMessages as ChatMessage[] | undefined,
      }
    },

    setCurrentMeetingData: (data: Partial<Pick<LocalState, "software" | "title" | "startTimestamp" | "transcript" | "chatMessages">>): Promise<void> =>
      storage.localSet(data as Record<string, unknown>),

    getDeferredUpdatePending: async (): Promise<boolean> => {
      const raw = await storage.localGet(["deferredUpdatePending"])
      return !!(raw.deferredUpdatePending as boolean | undefined)
    },

    setDeferredUpdatePending: (value: boolean): Promise<void> =>
      storage.localSet({ deferredUpdatePending: value }),
  }
}

export function createStorageSync(storage: IBrowserStorage) {
  return {
    getSettings: async (): Promise<Partial<SyncSettings>> => {
      const raw = await storage.syncGet([
        "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting",
        "operationMode", "webhookBodyType", "webhookUrl",
      ])
      return raw as Partial<SyncSettings>
    },

    setSettings: (settings: Partial<SyncSettings>): Promise<void> =>
      storage.syncSet(settings as Record<string, unknown>),

    getWebhookSettings: async (): Promise<{ webhookUrl?: string; webhookBodyType?: WebhookBodyType }> => {
      const raw = await storage.syncGet(["webhookUrl", "webhookBodyType"])
      return raw as { webhookUrl?: string; webhookBodyType?: WebhookBodyType }
    },

    getAutoActionSettings: async (): Promise<{ webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }> => {
      const raw = await storage.syncGet(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"])
      return raw as { webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }
    },
  }
}

// Backward-compatible singletons — wired to chrome at module level for existing callers.
// Replaced by injected instances in Task 8 (MeetingSession).
import { ChromeStorage } from '../browser/chrome'
export const StorageLocal = createStorageLocal(ChromeStorage)
export const StorageSync = createStorageSync(ChromeStorage)
