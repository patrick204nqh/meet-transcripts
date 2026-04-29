import type { TranscriptBlock, ChatMessage } from '../types'

const timeFormat: Intl.DateTimeFormatOptions = {
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
