import { postTranscriptToWebhook } from '../background/webhook'

export const WebhookService = {
  post: (index: number): Promise<string> => postTranscriptToWebhook(index),
}
