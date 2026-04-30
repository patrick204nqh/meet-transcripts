import type { ExtensionMessage, ExtensionResponse } from '../types'
import type { IBrowserRuntime } from '../browser/types'
import { ChromeRuntime } from '../browser/chrome'

export function createMessenger(runtime: IBrowserRuntime) {
  return {
    sendMessage: (msg: ExtensionMessage): Promise<ExtensionResponse> =>
      runtime.sendMessage(msg).then((raw) => raw as ExtensionResponse),
  }
}

// Backward-compatible singleton for existing callers
const defaultMessenger = createMessenger(ChromeRuntime)

export function sendMessage(msg: ExtensionMessage): Promise<ExtensionResponse> {
  return defaultMessenger.sendMessage(msg)
}

export function recoverLastMeeting(): Promise<string> {
  return sendMessage({ type: "recover_last_meeting" }).then((response) => {
    if (response.success) return (response.data as unknown as string) ?? "Last meeting recovered"
    return Promise.reject(response.error)
  })
}
