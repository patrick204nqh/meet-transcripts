import type { ExtensionMessage, ExtensionResponse, ErrorObject, DebugState } from '../types'
import { ErrorCode, ExtensionError } from '../shared/errors'
import { log } from '../shared/logger'
import { StorageLocal } from '../shared/storage-repo'
import { MeetingService } from '../services/meeting'
import { DownloadService } from '../services/download'
import { WebhookService } from '../services/webhook'
import { clearTabIdAndApplyUpdate } from './lifecycle'
import { handleMeetTabNavigatedAway } from './event-listeners'

const ok: ExtensionResponse = { success: true, data: undefined }
const err = (e: unknown): ExtensionResponse => {
  if (e instanceof ExtensionError) return { success: false, error: e.toErrorObject() }
  const obj = e as ErrorObject
  return { success: false, error: { errorCode: obj.errorCode ?? "000", errorMessage: obj.errorMessage ?? String(e) } }
}
const invalidIndex: ExtensionResponse = {
  success: false,
  error: { errorCode: ErrorCode.INVALID_INDEX, errorMessage: "Invalid index" },
}
const isValidIndex = (i: unknown): i is number => typeof i === "number" && i >= 0

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  const msg = raw as ExtensionMessage
  log.debug("message received:", msg.type)

  if (msg.type === "new_meeting_started") {
    // RC-1 fix: use sender.tab.id (authoritative) instead of tabs.query (races with focus changes)
    if (sender.tab?.id !== undefined) {
      StorageLocal.setMeetingTabId(sender.tab.id)
        .then(() => log.info("Meeting tab id saved"))
        .catch(console.error)
    }
    chrome.action.setBadgeText({ text: "REC" }).catch((e: unknown) => log.warn("setBadgeText failed:", e))
    chrome.action.setBadgeBackgroundColor({ color: "#c0392b" }).catch((e: unknown) => log.warn("setBadgeBgColor failed:", e))
  }

  if (msg.type === "meeting_ended") {
    StorageLocal.setMeetingTabId("processing").then(() =>
      MeetingService.finalizeMeeting()
        .then(() => sendResponse(ok))
        .catch((e: ErrorObject) => sendResponse(err(e)))
        .finally(() => clearTabIdAndApplyUpdate())
    )
    return true
  }

  if (msg.type === "download_transcript_at_index") {
    isValidIndex(msg.index)
      ? DownloadService.downloadTranscript(msg.index)
          .then(() => sendResponse(ok))
          .catch((e: ErrorObject) => sendResponse(err(e)))
      : sendResponse(invalidIndex)
    return true
  }

  if (msg.type === "post_webhook_at_index") {
    isValidIndex(msg.index)
      ? WebhookService.postWebhook(msg.index)
          .then(() => sendResponse(ok))
          .catch((e: ErrorObject) => { console.error("Webhook retry failed:", e); sendResponse(err(e)) })
      : sendResponse(invalidIndex)
    return true
  }

  if (msg.type === "recover_last_meeting") {
    MeetingService.recoverMeeting()
      .then((m) => sendResponse({ success: true, data: m }))
      .catch((e: ErrorObject) => sendResponse(err(e)))
    return true
  }

  if (msg.type === "open_popup") {
    chrome.action.openPopup()
      .then(() => sendResponse(ok))
      .catch((e: unknown) => sendResponse({
        success: false,
        error: { errorCode: ErrorCode.POPUP_OPEN_FAILED, errorMessage: String(e) },
      }))
    return true
  }

  if (msg.type === "simulate_tab_navigated_away") {
    // Test hook: invokes the same logic tabs.onUpdated calls. Needed because headless Chrome
    // cannot navigate to external URLs, so changeInfo.url is never populated in offline tests.
    // Reachable only from within the extension (same trust boundary as every other message).
    handleMeetTabNavigatedAway(msg.tabId, msg.url)
    sendResponse(ok)
    return true
  }

  if (msg.type === "get_debug_state") {
    Promise.all([
      StorageLocal.getMeetingTabId(),
      StorageLocal.getMeetings(),
      StorageLocal.getCurrentMeetingData(),
    ]).then(([meetingTabId, meetings, data]) => {
      const debugState: DebugState = {
        meetingTabId,
        meetingCount: meetings.length,
        hasMeetingData: !!data.startTimestamp,
        lastMeetingStart: data.startTimestamp ?? undefined,
      }
      sendResponse({ success: true, data: debugState })
    }).catch((e: unknown) => sendResponse(err(e as ErrorObject)))
    return true
  }

  return true
})
