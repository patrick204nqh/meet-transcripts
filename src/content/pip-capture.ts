import { state } from './state'
import { mutationConfig } from './constants'
import { transcriptMutationCallback, insertGapMarker } from './observer/transcript-observer'
import { log } from '../shared/logger'

// Confirmed via Phase 0 discovery: same selector as main-tab caption container
const PIP_CAPTION_SELECTOR = 'div[role="region"][tabindex="0"]'

let pipObserver: MutationObserver | undefined

interface DocumentPictureInPictureEvent extends Event {
  window: Window
}

interface DocumentPictureInPictureLike extends EventTarget {
  window: Window | null
}

function attachPipObserver(pipDoc: Document): void {
  if (state.pipObserverAttached) return

  const findAndAttach = (): boolean => {
    const captionEl = pipDoc.querySelector(PIP_CAPTION_SELECTOR)
    if (!captionEl) return false
    pipObserver = new MutationObserver(transcriptMutationCallback)
    pipObserver.observe(captionEl, mutationConfig)
    state.pipObserverAttached = true
    state.transcriptTargetBuffer = captionEl
    log.info("PiP entered — attaching caption observer")
    insertGapMarker()
    return true
  }

  if (findAndAttach()) return

  // Caption container not yet in DOM — wait for it
  const bootstrapObserver = new MutationObserver(() => {
    if (findAndAttach()) bootstrapObserver.disconnect()
  })
  bootstrapObserver.observe(pipDoc.body, { childList: true, subtree: true })
}

export function detachPipObserver(): void {
  pipObserver?.disconnect()
  pipObserver = undefined
  state.pipObserverAttached = false
}

export function initializePipCapture(): void {
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPictureLike }).documentPictureInPicture
  if (!dpip) {
    log.info("Document Picture-in-Picture not supported — PiP capture disabled")
    return
  }

  dpip.addEventListener("enter", (event: Event) => {
    if (state.hasMeetingEnded) return
    const pipEvent = event as DocumentPictureInPictureEvent
    attachPipObserver(pipEvent.window.document)
  })

  dpip.addEventListener("leave", () => {
    log.info("PiP left — detaching caption observer")
    detachPipObserver()
    insertGapMarker()
  })
}
