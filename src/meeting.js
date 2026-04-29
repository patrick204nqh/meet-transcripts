// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

import { state, mutationConfig, extensionStatusJSON_bug } from './state.js'
import { selectElements, waitForElement, showNotification, logError } from './ui.js'
import { overWriteChromeStorage } from './storage.js'
import { transcriptMutationCallback, pushBufferToTranscript, insertGapMarker } from './observer/transcript-observer.js'
import { chatMessagesMutationCallback } from './observer/chat-observer.js'

export function checkExtensionStatus() {
  return new Promise((resolve) => {
    state.extensionStatusJSON = { status: 200, message: "<strong>meet-transcripts is running</strong> <br /> Do not turn off captions" }
    resolve("Extension status set to operational")
  })
}

export function updateMeetingTitle() {
  waitForElement(".u6vdEc").then((element) => {
    const meetingTitleElement = /** @type {HTMLDivElement} */ (element)
    meetingTitleElement?.setAttribute("contenteditable", "true")
    meetingTitleElement.title = "Edit meeting title for meet-transcripts"
    meetingTitleElement.style.cssText = `text-decoration: underline white; text-underline-offset: 4px;`
    meetingTitleElement?.addEventListener("input", handleMeetingTitleElementChange)

    // Pick up meeting name after a delay, since Google Meet updates it after a delay
    setTimeout(() => {
      handleMeetingTitleElementChange()
      if (location.pathname === `/${meetingTitleElement.innerText}`) {
        showNotification({ status: 200, message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner" })
      }
    }, 7000)

    function handleMeetingTitleElementChange() {
      state.meetingTitle = meetingTitleElement.innerText
      overWriteChromeStorage(["meetingTitle"], false)
    }
  })
}

/**
 * @param {number} uiType
 */
export function meetingRoutines(uiType) {
  const meetingEndIconData = { selector: "", text: "" }
  const captionsIconData = { selector: "", text: "" }

  switch (uiType) {
    case 2:
      meetingEndIconData.selector = ".google-symbols"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".google-symbols"
      captionsIconData.text = "closed_caption_off"
    default:
      break
  }

  waitForElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
    console.log("Meeting started")
    /** @type {ExtensionMessage} */
    const message = { type: "new_meeting_started" }
    chrome.runtime.sendMessage(message, function () { })
    state.hasMeetingStarted = true
    state.meetingStartTimestamp = new Date().toISOString()
    overWriteChromeStorage(["meetingStartTimestamp"], false)

    updateMeetingTitle()

    /** @type {MutationObserver} */
    let transcriptObserver
    /** @type {MutationObserver} */
    let chatMessagesObserver
    /** @type {MutationObserver} */
    let captionWatchdog
    let isReattaching = false

    const captionContainerSelector = `div[role="region"][tabindex="0"]`

    const attachTranscriptObserver = (node) => {
      transcriptObserver = new MutationObserver(transcriptMutationCallback)
      transcriptObserver.observe(node, mutationConfig)
      state.transcriptTargetBuffer = node
    }

    const onVisibilityChange = () => {
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
        const captionsButton = selectElements(captionsIconData.selector, captionsIconData.text)[0]
        chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
          const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
          if (resultSync.operationMode === "manual") {
            console.log("Manual mode selected, leaving transcript off")
          } else {
            captionsButton.click()
          }
        })
        return waitForElement(`div[role="region"][tabindex="0"]`).then(targetNode => targetNode)
      })
      .then((targetNode) => {
        const transcriptTargetNode = targetNode
        if (transcriptTargetNode) {
          attachTranscriptObserver(transcriptTargetNode)

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

          chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
            const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
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
        console.error(err)
        state.isTranscriptDomErrorCaptured = true
        showNotification(extensionStatusJSON_bug)
        logError("001", err)
      })

    // REGISTER CHAT MESSAGES LISTENER
    waitForElement(".google-symbols", "chat")
      .then(() => {
        const chatMessagesButton = selectElements(".google-symbols", "chat")[0]
        chatMessagesButton.click()
        return waitForElement(`div[aria-live="polite"].Ge9Kpc`)
          .then(targetNode => ({ targetNode, chatMessagesButton }))
      })
      .then(({ targetNode, chatMessagesButton }) => {
        chatMessagesButton.click()
        const chatMessagesTargetNode = targetNode
        if (chatMessagesTargetNode) {
          chatMessagesObserver = new MutationObserver(chatMessagesMutationCallback)
          chatMessagesObserver.observe(chatMessagesTargetNode, mutationConfig)
        } else {
          throw new Error("Chat messages element not found in DOM")
        }
      })
      .catch((err) => {
        console.error(err)
        state.isChatMessagesDomErrorCaptured = true
        showNotification(extensionStatusJSON_bug)
        logError("003", err)
      })

    // MEETING END
    try {
      selectElements(meetingEndIconData.selector, meetingEndIconData.text)[0].parentElement.parentElement.addEventListener("click", () => {
        state.hasMeetingEnded = true
        if (transcriptObserver) transcriptObserver.disconnect()
        if (chatMessagesObserver) chatMessagesObserver.disconnect()
        if (captionWatchdog) captionWatchdog.disconnect()
        document.removeEventListener("visibilitychange", onVisibilityChange)

        if ((state.personNameBuffer !== "") && (state.transcriptTextBuffer !== "")) {
          pushBufferToTranscript()
        }
        overWriteChromeStorage(["transcript", "chatMessages"], true)
      })
    } catch (err) {
      console.error(err)
      showNotification(extensionStatusJSON_bug)
      logError("004", err)
    }
  })
}
