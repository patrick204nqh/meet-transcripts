import type { ChatMessage } from '../../types'
import { state } from '../state'
import { handleContentError } from '../ui'
import { persistStateFields } from '../state-sync'
import { log } from '../../shared/logger'

export function pushUniqueChatBlock(chatBlock: ChatMessage): void {
  const isExisting = state.chatMessages.some(item =>
    item.personName === chatBlock.personName &&
    item.text === chatBlock.text
  )
  if (!isExisting) {
    log.debug("Chat message captured")
    state.chatMessages.push(chatBlock)
    persistStateFields(["chatMessages"])
  }
}

export function chatMessagesMutationCallback(_mutationsList: MutationRecord[]): void {
  try {
    // CRITICAL DOM DEPENDENCY
    const chatMessagesElement = document.querySelector(`div[aria-live="polite"].Ge9Kpc`)
    if (!chatMessagesElement || chatMessagesElement.children.length === 0) return

    // CRITICAL DOM DEPENDENCY. Get the last message that was sent/received.
    const chatMessageElement = chatMessagesElement.lastChild?.firstChild?.firstChild?.lastChild as Element | null
    // CRITICAL DOM DEPENDENCY
    const personAndTimestampElement = chatMessageElement?.firstChild as Element | null
    const personName = personAndTimestampElement?.childNodes.length === 1
      ? state.userName
      : personAndTimestampElement?.firstChild?.textContent ?? null
    const timestamp = new Date().toISOString()
    // CRITICAL DOM DEPENDENCY
    const chatMessageText = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild as Element | null)?.textContent ?? null

    if (personName && chatMessageText) {
      const chatMessageBlock: ChatMessage = { personName, timestamp, text: chatMessageText }
      pushUniqueChatBlock(chatMessageBlock)
    }
  } catch (err) {
    if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) {
      handleContentError("006", err)
    }
    state.isChatMessagesDomErrorCaptured = true
  }
}


// CURRENT GOOGLE MEET CHAT MESSAGES DOM

{/* <div jsname="xySENc" aria-live="polite" class="Ge9Kpc z38b6">
  <div class="Ss4fHf" jsname="Ypafjf">
    <div class="QTyiie">
      <div class="poVWob">You</div>
      <div jsname="biJjHb" class="MuzmKe">17:00</div>
    </div>
    <div class="beTDc">
      <div class="er6Kjc chmVPb">
        <div class="ptNLrf">
          <div jsname="dTKtvb">
            <div jscontroller="RrV5Ic">Hello</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div> */}
