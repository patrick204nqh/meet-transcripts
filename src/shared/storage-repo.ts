import type { Meeting, MeetingTabId, MeetingSoftware, TranscriptBlock, ChatMessage, OperationMode, WebhookBodyType } from '../types'

export interface LocalState {
  meetingTabId: MeetingTabId
  meetingSoftware: MeetingSoftware
  meetingTitle: string
  meetingStartTimestamp: string
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

export const StorageLocal = {
  getMeetings: async (): Promise<Meeting[]> => {
    const raw = await chrome.storage.local.get(["meetings"])
    return (raw.meetings as Meeting[] | undefined) ?? []
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
      "meetingSoftware", "meetingTitle", "meetingStartTimestamp", "transcript", "chatMessages",
    ])
    return raw as Partial<LocalState>
  },

  setCurrentMeetingData: (data: Partial<Pick<LocalState, "meetingSoftware" | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages">>): Promise<void> =>
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
