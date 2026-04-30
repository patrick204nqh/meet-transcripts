import type { AppState } from '../../types'
import { mutationConfig } from '../constants'
import { transcriptMutationCallback, insertGapMarker } from '../observer/transcript-observer'
import { chatMessagesMutationCallback } from '../observer/chat-observer'
import { log } from '../../shared/logger'

export class ObserverManager {
  private transcriptObserver: MutationObserver | undefined
  private chatObserver: MutationObserver | undefined
  private captionWatchdog: MutationObserver | undefined
  private isReattaching = false

  constructor(private state: AppState, private captionContainerSelector: string) {}

  attachTranscript(node: Element): void {
    this.transcriptObserver = new MutationObserver(transcriptMutationCallback)
    this.transcriptObserver.observe(node, mutationConfig)
    this.state.transcriptTargetBuffer = node
  }

  attachChat(node: Element): void {
    this.chatObserver = new MutationObserver(chatMessagesMutationCallback)
    this.chatObserver.observe(node, mutationConfig)
  }

  attachWatchdog(): void {
    this.captionWatchdog = new MutationObserver(() => {
      if (this.state.hasMeetingEnded || this.isReattaching) return
      if (this.state.transcriptTargetBuffer && !this.state.transcriptTargetBuffer.isConnected) {
        const captionEl = document.querySelector(this.captionContainerSelector)
        if (!captionEl) return
        this.isReattaching = true
        this.transcriptObserver?.disconnect()
        this.attachTranscript(captionEl)
        insertGapMarker()
        this.isReattaching = false
      }
    })
    this.captionWatchdog.observe(document.body, { childList: true, subtree: true })
  }

  reattachTranscriptIfDisconnected(): void {
    if (this.state.hasMeetingEnded || !this.state.hasMeetingStarted) return
    if (document.hidden) return
    if (this.state.transcriptTargetBuffer?.isConnected || this.isReattaching) return
    const captionEl = document.querySelector(this.captionContainerSelector)
    if (!captionEl) return
    this.isReattaching = true
    this.transcriptObserver?.disconnect()
    this.attachTranscript(captionEl)
    insertGapMarker()
    this.isReattaching = false
  }

  detach(): void {
    log.info("Detaching all observers")
    this.transcriptObserver?.disconnect()
    this.chatObserver?.disconnect()
    this.captionWatchdog?.disconnect()
  }
}
