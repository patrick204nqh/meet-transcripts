import type { TranscriptBlock, ChatMessage, Meeting, WebhookBody, WebhookBodyType } from '../types'

export const timeFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
}

export function getTranscriptString(transcript: TranscriptBlock[]): string {
  if (transcript.length === 0) return ""
  return transcript.map(block =>
    `${block.personName} (${new Date(block.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${block.text}\n\n`
  ).join("")
}

export function getChatMessagesString(chatMessages: ChatMessage[]): string {
  if (chatMessages.length === 0) return ""
  return chatMessages.map(msg =>
    `${msg.personName} (${new Date(msg.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${msg.text}\n\n`
  ).join("")
}

export function buildTranscriptFilename(meeting: Meeting): string {
  const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
  const sanitisedTitle = meeting.title
    ? meeting.title.replaceAll(invalidFilenameRegex, "_")
    : "Meeting"
  const timestamp = new Date(meeting.startTimestamp)
  const formattedTimestamp = timestamp.toLocaleString("default", timeFormat).replace(/[/:]/g, "-")
  const prefix = meeting.software ? `${meeting.software} transcript` : "Transcript"
  return `meet-transcripts/${prefix}-${sanitisedTitle} at ${formattedTimestamp} on.txt`
}

export function buildWebhookBody(meeting: Meeting, bodyType: WebhookBodyType): WebhookBody {
  if (bodyType === "advanced") {
    return {
      webhookBodyType: "advanced",
      software: meeting.software || "",
      title: meeting.title || "",
      startTimestamp: new Date(meeting.startTimestamp).toISOString(),
      endTimestamp: new Date(meeting.endTimestamp).toISOString(),
      transcript: meeting.transcript,
      chatMessages: meeting.chatMessages,
    }
  }
  return {
    webhookBodyType: "simple",
    software: meeting.software || "",
    title: meeting.title || "",
    startTimestamp: new Date(meeting.startTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
    endTimestamp: new Date(meeting.endTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
    transcript: getTranscriptString(meeting.transcript),
    chatMessages: getChatMessagesString(meeting.chatMessages),
  }
}
