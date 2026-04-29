// @ts-check
/// <reference path="../../types/index.js" />

import { state, extensionStatusJSON_bug, reportErrorMessage } from '../state.js'
import { showNotification, logError } from '../ui.js'
import { overWriteChromeStorage } from '../storage.js'

/**
 * @param {ChatMessage} chatBlock
 */
export function pushUniqueChatBlock(chatBlock) {
  const isExisting = state.chatMessages.some(item =>
    (item.personName === chatBlock.personName) &&
    (item.chatMessageText === chatBlock.chatMessageText)
  )
  if (!isExisting) {
    console.log("Chat message captured")
    state.chatMessages.push(chatBlock)
    overWriteChromeStorage(["chatMessages"], false)
  }
}

/**
 * @param {MutationRecord[]} mutationsList
 */
export function chatMessagesMutationCallback(mutationsList) {
  mutationsList.forEach(() => {
    try {
      // CRITICAL DOM DEPENDENCY
      const chatMessagesElement = document.querySelector(`div[aria-live="polite"].Ge9Kpc`)
      if (chatMessagesElement && chatMessagesElement.children.length > 0) {
        // CRITICAL DOM DEPENDENCY. Get the last message that was sent/received.
        const chatMessageElement = chatMessagesElement.lastChild?.firstChild?.firstChild?.lastChild
        // CRITICAL DOM DEPENDENCY
        const personAndTimestampElement = chatMessageElement?.firstChild
        const personName = personAndTimestampElement?.childNodes.length === 1 ? state.userName : personAndTimestampElement?.firstChild?.textContent
        const timestamp = new Date().toISOString()
        // CRITICAL DOM DEPENDENCY
        const chatMessageText = chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild?.textContent

        if (personName && chatMessageText) {
          /** @type {ChatMessage} */
          const chatMessageBlock = {
            personName,
            timestamp,
            chatMessageText,
          }
          pushUniqueChatBlock(chatMessageBlock)
        }
      }
    } catch (err) {
      console.error(err)
      if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)
        logError("006", err)
      }
      state.isChatMessagesDomErrorCaptured = true
    }
  })
}


// CURRENT GOOGLE MEET CHAT MESSAGES DOM

{/* <div jsname="xySENc" aria-live="polite" jscontroller="Mzzivb" jsaction="nulN2d:XL2g4b;vrPT5c:XL2g4b;k9UrDc:ClCcUe"
  class="Ge9Kpc z38b6">
  <div class="Ss4fHf" jsname="Ypafjf" tabindex="-1" jscontroller="LQRnv"
    jsaction="JIbuQc:sCzVOd(aUCive),T4Iwcd(g21v4c),yyLnsd(iJEnyb),yFT8A(RNMM1e),Cg1Rgf(EZbOH)" style="order: 0;">
    <div class="QTyiie">
      <div class="poVWob">You</div>
      <div jsname="biJjHb" class="MuzmKe">17:00</div>
    </div>
    <div class="beTDc">
      <div class="er6Kjc chmVPb">
        <div class="ptNLrf">
          <div jsname="dTKtvb">
            <div jscontroller="RrV5Ic" jsaction="rcuQ6b:XZyPzc" data-is-tv="false">Hello</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div> */}
