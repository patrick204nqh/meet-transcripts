import type { ChatMessage } from '../../types'
import { state } from '../state'
import { handleContentError } from '../ui'
import { persistStateFields } from '../state-sync'
import { log } from '../../shared/logger'

export function pushUniqueChatBlock(chatBlock: ChatMessage): void {
  const isExisting = state.chatMessages.some(item =>
    item.personName === chatBlock.personName && item.text === chatBlock.text
  )
  if (!isExisting) {
    log.debug("Chat message captured")
    state.chatMessages.push(chatBlock)
    persistStateFields(["chatMessages"])
  }
}

// DOM: div[aria-live="polite"].Ge9Kpc  (Google Meet chat panel, verified 2025-04)
// <div jsname="xySENc" aria-live="polite" class="Ge9Kpc z38b6">
//   <div class="Ss4fHf" jsname="Ypafjf">          ← one message wrapper per message
//     <div class="QTyiie">                         ← sender + timestamp row
//       <div class="poVWob">You</div>              ← personName (absent = self)
//     </div>
//     <div class="beTDc">
//       <div class="er6Kjc">
//         <div class="ptNLrf"><div jsname="dTKtvb">
//           <div jscontroller="RrV5Ic">Hello</div>
//         </div></div>
//       </div>
//     </div>
//   </div>
// </div>
// TODO(dom): re-verify selectors after Meet UI update [2025-04]
function parseChatFromRoot(chatRoot: Element, currentUser: string): ChatMessage | null {
  if (chatRoot.children.length === 0) return null
  const chatMessageElement = chatRoot.lastChild?.firstChild?.firstChild?.lastChild as Element | null
  const personAndTimestampElement = chatMessageElement?.firstChild as Element | null
  const personName = personAndTimestampElement?.childNodes.length === 1
    ? currentUser
    : personAndTimestampElement?.firstChild?.textContent ?? null
  const chatMessageText = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild as Element | null)?.textContent ?? null
  if (!personName || !chatMessageText) return null
  return { personName, timestamp: new Date().toISOString(), text: chatMessageText }
}

export function chatMessagesMutationCallback(_mutationsList: MutationRecord[]): void {
  try {
    // DOM: div[aria-live="polite"].Ge9Kpc — the observer is attached to this element
    // Use the observed element's ownerDocument to find the chat root, not window.document,
    // so this callback works in both main-tab and PiP contexts.
    const anyTarget = _mutationsList[0]?.target
    const doc = anyTarget ? (anyTarget as Node).ownerDocument ?? document : document
    const chatRoot = doc.querySelector(`div[aria-live="polite"].Ge9Kpc`)
    if (!chatRoot) return

    const parsed = parseChatFromRoot(chatRoot, state.userName)
    if (parsed) pushUniqueChatBlock(parsed)
  } catch (err) {
    if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) {
      handleContentError("006", err)
    }
    state.isChatMessagesDomErrorCaptured = true
  }
}
