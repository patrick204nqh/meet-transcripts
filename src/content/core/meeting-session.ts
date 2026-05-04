import type { AppState, MeetingEndReason } from '../../types'
import type { IPlatformAdapter } from '../../platforms/types'
import type { IBrowserStorage } from '../../browser/types'
import { log } from '../../shared/logger'
import { showNotification, handleContentError, waitForElement, waitForPageVisible } from '../ui'
import { persistStateFields, persistStateAndSignalEnd } from '../state-sync'
import { pushBufferToTranscript } from '../observer/transcript-observer'
import { detachPipObserver } from '../pip-capture'
import { ObserverManager } from './observer-manager'
import { msg } from '../../shared/protocol'

export class MeetingSession {
  private observerManager: ObserverManager
  private handlePageHide: () => void
  private handleVisibilityChange: () => void

  constructor(
    private adapter: IPlatformAdapter,
    private state: AppState,
    private _storage: IBrowserStorage,
  ) {
    this.observerManager = new ObserverManager(state, adapter.captionContainerSelector)
    // Skip ending the session on pagehide when PiP is active — the meeting continues
    // in the PiP window even though the main tab may fire pagehide when backgrounded.
    this.handlePageHide = () => { if (!this.state.pipObserverAttached) this.end("page_unload") }
    this.handleVisibilityChange = () => this.observerManager.reattachTranscriptIfDisconnected()
  }

  async start(): Promise<void> {
    const endButtonEl = await this.adapter.waitForMeetingStart()
    log.info("Meeting started")

    chrome.runtime.sendMessage(msg({ type: "new_meeting_started" }), () => {})
    this.state.hasMeetingStarted = true
    this.state.startTimestamp = new Date().toISOString()
    persistStateFields(["startTimestamp"])

    this.captureTitle()

    document.addEventListener("visibilitychange", this.handleVisibilityChange)
    window.addEventListener("pagehide", this.handlePageHide)
    this.wireEndButton(endButtonEl)

    // Wait for the tab to be visible before triggering CC and chat button clicks.
    // Those clicks cause Meet to make fetches through its own service worker, which
    // can be in its activation window right after navigation and will reject them.
    await waitForPageVisible()

    await Promise.allSettled([
      this.setupTranscript(),
      this.setupChat(),
    ])
  }

  private captureTitle(): void {
    this.adapter.waitForTitleElement().then((titleEl) => {
      titleEl.setAttribute("contenteditable", "true")
      titleEl.title = "Edit meeting title for meet-transcripts"
      titleEl.style.cssText = "text-decoration: underline white; text-underline-offset: 4px;"

      const onInput = (): void => {
        this.state.title = titleEl.innerText
        persistStateFields(["title"])
      }
      titleEl.addEventListener("input", onInput)

      setTimeout(() => {
        onInput()
        if (location.pathname === `/${titleEl.innerText}`) {
          showNotification({ status: 200, message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner" })
        }
      }, 7000)
    })
  }

  private async setupTranscript(): Promise<void> {
    try {
      const captionsReady = await this.adapter.waitForCaptionsReady()

      const { operationMode } = (await chrome.storage.sync.get(["operationMode"])) as { operationMode?: string }
      const isManual = operationMode === "manual"

      if (isManual) {
        log.info("Manual mode — leaving captions off")
      } else {
        this.adapter.enableCaptions(captionsReady)
      }

      let captionNode = await waitForElement(this.adapter.captionContainerSelector)

      if (!captionNode && !isManual) {
        // Meet's service worker may have dropped the fetch triggered by the first
        // click. Re-click once after a short settle window and try again.
        log.warn("Caption container not found after first attempt — retrying once")
        await new Promise<void>(r => setTimeout(r, 2000))
        this.adapter.enableCaptions(captionsReady)
        captionNode = await waitForElement(this.adapter.captionContainerSelector)
      }

      if (!captionNode) throw new Error("Caption container not found in DOM")

      this.observerManager.attachTranscript(captionNode)
      this.observerManager.attachWatchdog()

      if (isManual) {
        showNotification({ status: 400, message: "<strong>meet-transcripts is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
      } else {
        showNotification(this.state.extensionStatusJSON)
      }
    } catch (err) {
      this.state.isTranscriptDomErrorCaptured = true
      handleContentError("001", err)
    }
  }

  private async setupChat(): Promise<void> {
    try {
      const chatContainer = await this.adapter.waitForChatContainer()
      this.adapter.openAndCloseChat(chatContainer)
      const chatLiveRegion = await waitForElement(`div[aria-live="polite"].Ge9Kpc`)
      if (!chatLiveRegion) throw new Error("Chat live region not found")
      this.observerManager.attachChat(chatLiveRegion)
    } catch (err) {
      this.state.isChatMessagesDomErrorCaptured = true
      handleContentError("003", err)
    }
  }

  private wireEndButton(endButtonEl: Element): void {
    try {
      const clickTarget = endButtonEl.parentElement?.parentElement
      if (!clickTarget) throw new Error("Call end button parent not found in DOM")
      clickTarget.addEventListener("click", () => this.end("user_click"))
    } catch (err) {
      handleContentError("004", err)
    }
  }

  end(reason: MeetingEndReason): void {
    if (this.state.hasMeetingEnded) return
    this.state.hasMeetingEnded = true

    this.observerManager.detach()
    detachPipObserver()
    document.removeEventListener("visibilitychange", this.handleVisibilityChange)
    window.removeEventListener("pagehide", this.handlePageHide)

    if (this.state.personNameBuffer !== "" && this.state.transcriptTextBuffer !== "") {
      pushBufferToTranscript()
    }
    persistStateAndSignalEnd(["transcript", "chatMessages"], reason).catch(console.error)
  }
}
