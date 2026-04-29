import type { Meeting } from '../types'
import { StorageLocal, StorageSync } from '../shared/storage-repo'
import { downloadTranscript } from './download'
import { postTranscriptToWebhook } from './webhook'

export async function pickupLastMeetingFromStorage(): Promise<string> {
  const data = await StorageLocal.getCurrentMeetingData()

  if (!data.meetingStartTimestamp) {
    throw { errorCode: "013", errorMessage: "No meetings found. May be attend one?" }
  }
  if (!data.transcript?.length && !data.chatMessages?.length) {
    throw { errorCode: "014", errorMessage: "Empty transcript and empty chatMessages" }
  }

  const newEntry: Meeting = {
    meetingSoftware: data.meetingSoftware ?? "",
    meetingTitle: data.meetingTitle,
    meetingStartTimestamp: data.meetingStartTimestamp,
    meetingEndTimestamp: new Date().toISOString(),
    transcript: data.transcript ?? [],
    chatMessages: data.chatMessages ?? [],
    webhookPostStatus: "new",
  }

  let meetings = await StorageLocal.getMeetings()
  meetings.push(newEntry)
  if (meetings.length > 10) meetings = meetings.slice(-10)
  await StorageLocal.saveMeetings(meetings)
  console.log("Last meeting picked up")
  return "Last meeting picked up"
}

export async function processLastMeeting(): Promise<string> {
  await pickupLastMeetingFromStorage()

  const meetings = await StorageLocal.getMeetings()
  const sync = await StorageSync.getDownloadConfig()
  const lastIndex = meetings.length - 1
  const promises: Promise<unknown>[] = []

  if (sync.autoDownloadFileAfterMeeting) {
    promises.push(downloadTranscript(lastIndex, !!(sync.webhookUrl && sync.autoPostWebhookAfterMeeting)))
  }
  if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) {
    promises.push(postTranscriptToWebhook(lastIndex))
  }

  await Promise.all(promises)
  return "Meeting processing complete"
}

export async function recoverLastMeeting(): Promise<string> {
  const [meetings, data] = await Promise.all([
    StorageLocal.getMeetings(),
    StorageLocal.getCurrentMeetingData(),
  ])

  if (!data.meetingStartTimestamp) {
    throw { errorCode: "013", errorMessage: "No meetings found. May be attend one?" }
  }

  const lastSaved = meetings.length > 0 ? meetings[meetings.length - 1] : undefined
  if (!lastSaved || data.meetingStartTimestamp !== lastSaved.meetingStartTimestamp) {
    await processLastMeeting()
    return "Recovered last meeting to the best possible extent"
  }
  return "No recovery needed"
}
