import { postTranscriptToWebhook } from '../background/webhook'

export const WebhookService = {
  postWebhook: (index: number): Promise<string> => postTranscriptToWebhook(index),
}
