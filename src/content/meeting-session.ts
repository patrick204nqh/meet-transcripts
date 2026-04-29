import type { ExtensionMessage } from '../types'
import { state } from './state'
import { mutationConfig } from './constants'
import { selectElements, waitForElement, showNotification, handleContentError } from './ui'
import { persistStateFields, persistStateAndSignalEnd } from './state-sync'
import { transcriptMutationCallback, pushBufferToTranscript, insertGapMarker } from './observer/transcript-observer'
import { chatMessagesMutationCallback } from './observer/chat-observer'

export function checkExtensionStatus(): Promise<string> {
  return new Promise((resolve) => {
    state.extensionStatusJSON = { status: 200, message: "<strong>meet-transcripts is running</strong> <br /> Do not turn off captions" }
    resolve("Extension status set to operational")
  })
}

export function updateMeetingTitle(): void {
  waitForElement(".u6vdEc").then((element) => {
    const meetingTitleElement = element as HTMLDivElement
    if (!meetingTitleElement) return
    meetingTitleElement.setAttribute("contenteditable", "true")
    meetingTitleElement.title = "Edit meeting title for meet-transcripts"
    meetingTitleElement.style.cssText = `text-decoration: underline white; text-underline-offset: 4px;`
    meetingTitleElement.addEventListener("input", handleMeetingTitleElementChange)

    // Pick up meeting name after a delay, since Google Meet updates it after a delay
    setTimeout(() => {
      handleMeetingTitleElementChange()
      if (location.pathname === `/${meetingTitleElement.innerText}`) {
        showNotification({ status: 200, message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner" })
      }
    }, 7000)

    function handleMeetingTitleElementChange(): void {
      state.title = meetingTitleElement.innerText
      persistStateFields(["title"])
    }
  })
}

export function meetingRoutines(uiType: number): void {
  const meetingEndIconData = { selector: "", text: "" }
  const captionsIconData = { selector: "", text: "" }

  switch (uiType) {
    case 2:
      meetingEndIconData.selector = ".google-symbols"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".google-symbols"
      captionsIconData.text = "closed_caption_off"
      break
    default:
      break
  }

  waitForElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
    console.log("Meeting started")
    const message: ExtensionMessage = { type: "new_meeting_started" }
    chrome.runtime.sendMessage(message, () => { })
    state.hasMeetingStarted = true
    state.startTimestamp = new Date().toISOString()
    persistStateFields(["startTimestamp"])

    updateMeetingTitle()

    let transcriptObserver: MutationObserver | undefined
    let chatMessagesObserver: MutationObserver | undefined
    let captionWatchdog: MutationObserver | undefined
    let isReattaching = false

    const captionContainerSelector = `div[role="region"][tabindex="0"]`

    const attachTranscriptObserver = (node: Element): void => {
      transcriptObserver = new MutationObserver(transcriptMutationCallback)
      transcriptObserver.observe(node, mutationConfig)
      state.transcriptTargetBuffer = node
    }

    const onVisibilityChange = (): void => {
      if (state.hasMeetingEnded || !state.hasMeetingStarted || document.hidden) return
      if (state.transcriptTargetBuffer && !state.transcriptTargetBuffer.isConnected && !isReattaching) {
        const captionEl = document.querySelector(captionContainerSelector)
        if (!captionEl) return
        isReattaching = true
        transcriptObserver?.disconnect()
        attachTranscriptObserver(captionEl)
        insertGapMarker()
        isReattaching = false
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    // REGISTER TRANSCRIPT LISTENER
    waitForElement(captionsIconData.selector, captionsIconData.text)
      .then(() => {
        const captionsButton = selectElements(captionsIconData.selector, captionsIconData.text)[0] as HTMLElement
        chrome.storage.sync.get(["operationMode"], (resultSync: { operationMode?: string }) => {
          if (resultSync.operationMode === "manual") {
            console.log("Manual mode selected, leaving transcript off")
          } else {
            captionsButton?.click()
          }
        })
        return waitForElement(`div[role="region"][tabindex="0"]`)
      })
      .then((targetNode) => {
        if (targetNode) {
          attachTranscriptObserver(targetNode)

          captionWatchdog = new MutationObserver(() => {
            if (state.hasMeetingEnded || isReattaching) return
            if (state.transcriptTargetBuffer && !state.transcriptTargetBuffer.isConnected) {
              const captionEl = document.querySelector(captionContainerSelector)
              if (!captionEl) return
              isReattaching = true
              transcriptObserver?.disconnect()
              attachTranscriptObserver(captionEl)
              insertGapMarker()
              isReattaching = false
            }
          })
          captionWatchdog.observe(document.body, { childList: true, subtree: true })

          chrome.storage.sync.get(["operationMode"], (resultSync: { operationMode?: string }) => {
            if (resultSync.operationMode === "manual") {
              showNotification({ status: 400, message: "<strong>meet-transcripts is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
            } else {
              showNotification(state.extensionStatusJSON)
            }
          })
        } else {
          throw new Error("Transcript element not found in DOM")
        }
      })
      .catch((err) => {
        state.isTranscriptDomErrorCaptured = true
        handleContentError("001", err)
      })

    // REGISTER CHAT MESSAGES LISTENER
    waitForElement(".google-symbols", "chat")
      .then(() => {
        const chatMessagesButton = selectElements(".google-symbols", "chat")[0] as HTMLElement
        chatMessagesButton?.click()
        return waitForElement(`div[aria-live="polite"].Ge9Kpc`)
          .then(targetNode => ({ targetNode, chatMessagesButton }))
      })
      .then(({ targetNode, chatMessagesButton }) => {
        (chatMessagesButton as HTMLElement)?.click()
        if (targetNode) {
          chatMessagesObserver = new MutationObserver(chatMessagesMutationCallback)
          chatMessagesObserver.observe(targetNode, mutationConfig)
        } else {
          throw new Error("Chat messages element not found in DOM")
        }
      })
      .catch((err) => {
        state.isChatMessagesDomErrorCaptured = true
        handleContentError("003", err)
      })

    // MEETING END
    try {
      const endButton = selectElements(meetingEndIconData.selector, meetingEndIconData.text)[0]
      const clickTarget = endButton?.parentElement?.parentElement
      if (!clickTarget) throw new Error("Call end button element not found in DOM")

      clickTarget.addEventListener("click", () => {
        state.hasMeetingEnded = true
        transcriptObserver?.disconnect()
        chatMessagesObserver?.disconnect()
        captionWatchdog?.disconnect()
        document.removeEventListener("visibilitychange", onVisibilityChange)

        if (state.personNameBuffer !== "" && state.transcriptTextBuffer !== "") {
          pushBufferToTranscript()
        }
        persistStateFields(["transcript", "chatMessages"])
      })
    } catch (err) {
      handleContentError("004", err)
    }
  })
}
