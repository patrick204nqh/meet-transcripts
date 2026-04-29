import type { Meeting } from '../types'
import { ErrorCode } from '../shared/errors'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { DownloadService } from './download-service'
import { WebhookService } from './webhook-service'

export async function pickupLastMeeting(): Promise<string> {
  const data = await StorageLocal.getCurrentMeetingData()

  if (!data.startTimestamp) {
    throw { errorCode: ErrorCode.NO_MEETINGS, errorMessage: "No meetings found. May be attend one?" }
  }
  if (!data.transcript?.length && !data.chatMessages?.length) {
    throw { errorCode: ErrorCode.EMPTY_TRANSCRIPT, errorMessage: "Empty transcript and empty chatMessages" }
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

  const meetings = await StorageLocal.getMeetings()
  const updated = [...meetings, newEntry].slice(-10)
  await StorageLocal.setMeetings(updated)
  console.log("Last meeting picked up")
  return "Last meeting picked up"
}

export async function finalizeMeeting(): Promise<string> {
  await pickupLastMeeting()

  const meetings = await StorageLocal.getMeetings()
  const sync = await StorageSync.getAutoActionSettings()
  const lastIndex = meetings.length - 1
  const promises: Promise<unknown>[] = []

  if (sync.autoDownloadFileAfterMeeting) {
    promises.push(DownloadService.downloadTranscript(lastIndex))
  }
  if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) {
    promises.push(WebhookService.postWebhook(lastIndex))
  }

  await Promise.all(promises)
  return "Meeting processing complete"
}

export async function recoverLastMeeting(): Promise<string> {
  const [meetings, data] = await Promise.all([
    StorageLocal.getMeetings(),
    StorageLocal.getCurrentMeetingData(),
  ])

  if (!data.startTimestamp) {
    throw { errorCode: ErrorCode.NO_MEETINGS, errorMessage: "No meetings found. May be attend one?" }
  }

  const lastSaved = meetings.length > 0 ? meetings[meetings.length - 1] : undefined
  if (!lastSaved || data.startTimestamp !== lastSaved.startTimestamp) {
    await finalizeMeeting()
    return "Recovered last meeting to the best possible extent"
  }
  return "No recovery needed"
}

export const MeetingService = {
  finalizeMeeting,
  recoverMeeting: recoverLastMeeting,
  pickupLastMeeting,
}
