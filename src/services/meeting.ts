import type { Meeting } from '../types'
import { ErrorCode, ExtensionError } from '../shared/errors'
import { createStorageLocal, createStorageSync, StorageLocal, StorageSync } from '../shared/storage-repo'
import { DownloadService } from './download'
import { WebhookService } from './webhook'

export type MeetingDeps = {
  storageLocal: ReturnType<typeof createStorageLocal>
  storageSync: ReturnType<typeof createStorageSync>
  downloadTranscript: (index: number) => Promise<void>
  postWebhook: (index: number) => Promise<string>
}

export function createMeetingService(deps: MeetingDeps) {
  async function pickupLastMeeting(): Promise<string> {
    const data = await deps.storageLocal.getCurrentMeetingData()

    if (!data.startTimestamp) {
      throw new ExtensionError(ErrorCode.NO_MEETINGS, "No meetings found. May be attend one?", "MEETING")
    }
    if (!data.transcript?.length && !data.chatMessages?.length) {
      throw new ExtensionError(ErrorCode.EMPTY_TRANSCRIPT, "Empty transcript and empty chatMessages", "MEETING")
    }

    const newEntry: Meeting = {
      software: data.software,
      title: data.title,
      startTimestamp: data.startTimestamp,
      endTimestamp: new Date().toISOString(),
      transcript: data.transcript ?? [],
      chatMessages: data.chatMessages ?? [],
      webhookPostStatus: "new",
    }

    const meetings = await deps.storageLocal.getMeetings()
    const updated = [...meetings, newEntry].slice(-10)
    await deps.storageLocal.setMeetings(updated)
    return "Last meeting picked up"
  }

  async function finalizeMeeting(): Promise<string> {
    await pickupLastMeeting()

    const meetings = await deps.storageLocal.getMeetings()
    const sync = await deps.storageSync.getAutoActionSettings()
    const lastIndex = meetings.length - 1
    const promises: Promise<unknown>[] = []

    if (sync.autoDownloadFileAfterMeeting) {
      promises.push(deps.downloadTranscript(lastIndex))
    }
    if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) {
      promises.push(deps.postWebhook(lastIndex))
    }

    await Promise.all(promises)
    return "Meeting processing complete"
  }

  async function recoverLastMeeting(): Promise<string> {
    const [meetings, data] = await Promise.all([
      deps.storageLocal.getMeetings(),
      deps.storageLocal.getCurrentMeetingData(),
    ])

    if (!data.startTimestamp) {
      throw new ExtensionError(ErrorCode.NO_MEETINGS, "No meetings found. May be attend one?", "MEETING")
    }

    const lastSaved = meetings.length > 0 ? meetings[meetings.length - 1] : undefined
    if (!lastSaved || data.startTimestamp !== lastSaved.startTimestamp) {
      await finalizeMeeting()
      return "Recovered last meeting to the best possible extent"
    }
    return "No recovery needed"
  }

  return {
    pickupLastMeeting,
    finalizeMeeting,
    recoverMeeting: recoverLastMeeting,
  }
}

// --- Backward-compatible singleton wired to real services ---

export const MeetingService = createMeetingService({
  storageLocal: StorageLocal,
  storageSync: StorageSync,
  downloadTranscript: (i) => DownloadService.downloadTranscript(i),
  postWebhook: (i) => WebhookService.postWebhook(i),
})
