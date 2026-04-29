import type { Meeting, MeetingTabId, MeetingSoftware, TranscriptBlock, ChatMessage, OperationMode, WebhookBodyType } from '../types'

export interface LocalState {
  meetingTabId: MeetingTabId
  software: MeetingSoftware
  title: string
  startTimestamp: string
  transcript: TranscriptBlock[]
  chatMessages: ChatMessage[]
  isDeferredUpdateAvailable: boolean
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

export const StorageLocal = {
  getMeetings: async (): Promise<Meeting[]> => {
    const raw = await chrome.storage.local.get(["meetings"])
    const meetings = (raw.meetings as Record<string, unknown>[] | undefined) ?? []
    return meetings.map(migrateMeeting)
  },

  setMeetings: (meetings: Meeting[]): Promise<void> =>
    chrome.storage.local.set({ meetings }),

  getMeetingTabId: async (): Promise<MeetingTabId> => {
    const raw = await chrome.storage.local.get(["meetingTabId"])
    return (raw.meetingTabId as MeetingTabId | undefined) ?? null
  },

  setMeetingTabId: (id: MeetingTabId): Promise<void> =>
    chrome.storage.local.set({ meetingTabId: id }),

  getCurrentMeetingData: async (): Promise<Partial<LocalState>> => {
    const raw = await chrome.storage.local.get([
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
    chrome.storage.local.set(data),

  getDeferredUpdatePending: async (): Promise<boolean> => {
    const raw = await chrome.storage.local.get(["isDeferredUpdateAvailable"])
    return !!(raw.isDeferredUpdateAvailable as boolean | undefined)
  },

  setDeferredUpdate: (value: boolean): Promise<void> =>
    chrome.storage.local.set({ isDeferredUpdateAvailable: value }),
}

export const StorageSync = {
  getSettings: async (): Promise<Partial<SyncSettings>> => {
    const raw = await chrome.storage.sync.get([
      "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting",
      "operationMode", "webhookBodyType", "webhookUrl",
    ])
    return raw as Partial<SyncSettings>
  },

  setSettings: (settings: Partial<SyncSettings>): Promise<void> =>
    chrome.storage.sync.set(settings),

  getWebhookSettings: async (): Promise<{ webhookUrl?: string; webhookBodyType?: WebhookBodyType }> => {
    const raw = await chrome.storage.sync.get(["webhookUrl", "webhookBodyType"])
    return raw as { webhookUrl?: string; webhookBodyType?: WebhookBodyType }
  },

  getAutoActionSettings: async (): Promise<{ webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }> => {
    const raw = await chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"])
    return raw as { webhookUrl?: string; autoPostWebhookAfterMeeting?: boolean; autoDownloadFileAfterMeeting?: boolean }
  },
}
