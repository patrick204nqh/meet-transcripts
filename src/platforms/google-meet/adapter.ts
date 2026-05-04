import type { IPlatformAdapter, TranscriptBlockDraft } from '../types'
import type { ChatMessage } from '../../types'
import { waitForElement, selectElements } from '../../content/ui'

// DOM: div[role="region"][tabindex="0"]  (Google Meet caption container, verified 2025-04)
// <div role="region" tabindex="0" aria-label="Captions" class="vNKgIf UDinHf" ...>
//   <div class="nMcdL bj4p3b">
//     <div class="adE6rb">
//       <div class="KcIKyf jxFHg"><span class="NWpY1d">Speaker Name</span></div>
//     </div>
//     <div class="ygicle VbkSUe">Caption text here.</div>
//   </div>
// </div>
// TODO(dom): re-verify selectors after Meet UI update [2025-04]

// Google Meet UI profile post July/Aug 2024
const MEETING_END_SELECTOR = ".google-symbols"
const MEETING_END_TEXT = "call_end"
const CAPTIONS_SELECTOR = ".google-symbols"
const CAPTIONS_TEXT = "closed_caption_off"
const CAPTION_CONTAINER_SELECTOR = 'div[role="region"][tabindex="0"]'
const USERNAME_SELECTOR = ".awLEm"
const TITLE_SELECTOR = ".u6vdEc"
const CHAT_SELECTOR = ".google-symbols"
const CHAT_TEXT = "chat"
const CHAT_LIVE_REGION = `div[aria-live="polite"].Ge9Kpc`

export const GoogleMeetAdapter: IPlatformAdapter = {
  name: "Google Meet",
  urlMatches: ["https://meet.google.com/*"],
  urlExcludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"],
  captionContainerSelector: CAPTION_CONTAINER_SELECTOR,
  userNameSelector: USERNAME_SELECTOR,

  waitForMeetingStart: () =>
    waitForElement(MEETING_END_SELECTOR, MEETING_END_TEXT).then(el => {
      if (!el) throw new Error("Meeting start element not found in DOM")
      return el
    }),

  waitForCaptionsReady: () =>
    waitForElement(CAPTIONS_SELECTOR, CAPTIONS_TEXT).then(el => {
      if (!el) throw new Error("Captions button not found in DOM")
      return el
    }),

  waitForChatContainer: () =>
    waitForElement(CHAT_SELECTOR, CHAT_TEXT).then(() => {
      const chatBtn = selectElements(CHAT_SELECTOR, CHAT_TEXT)[0] as HTMLElement
      chatBtn?.click()
      return waitForElement(CHAT_LIVE_REGION).then(el => {
        if (!el) throw new Error("Chat live region not found in DOM")
        return el
      })
    }),

  enableCaptions: (captionsElement) => {
    (captionsElement as HTMLElement).click()
  },

  openAndCloseChat: (chatElement) => {
    (chatElement as HTMLElement).click()
  },

  waitForTitleElement: () =>
    waitForElement(TITLE_SELECTOR).then((el) => el as HTMLElement),

  parseTranscriptMutation(mutation, _currentUser): TranscriptBlockDraft | null {
    if (mutation.type !== "characterData") return null
    const mutationTargetElement = (mutation.target as Text).parentElement
    const transcriptUIBlocks = [...(mutationTargetElement?.parentElement?.parentElement?.children ?? [])]
    const isLastButSecondElement = transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement
    if (!isLastButSecondElement) return null

    const currentPersonName = (mutationTargetElement?.previousSibling as Element | null)?.textContent
    const currentTranscriptText = mutationTargetElement?.textContent
    if (!currentPersonName || !currentTranscriptText) return null

    // Dim the captured block
    Array.from(transcriptUIBlocks[transcriptUIBlocks.length - 3]?.children ?? []).forEach((item) => {
      item.setAttribute("style", "opacity:0.2")
    })

    return { personName: currentPersonName, text: currentTranscriptText }
  },

  parseChatMutation(chatRoot, currentUser): Omit<ChatMessage, 'timestamp'> | null {
    if (chatRoot.children.length === 0) return null
    const chatMessageElement = chatRoot.lastChild?.firstChild?.firstChild?.lastChild as Element | null
    const personAndTimestampElement = chatMessageElement?.firstChild as Element | null
    const personName = personAndTimestampElement?.childNodes.length === 1
      ? currentUser
      : personAndTimestampElement?.firstChild?.textContent ?? null
    const text = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild as Element | null)?.textContent ?? null
    if (!personName || !text) return null
    return { personName, text }
  },
}
