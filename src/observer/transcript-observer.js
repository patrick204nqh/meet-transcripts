// @ts-check
/// <reference path="../../types/index.js" />

import { state, mutationConfig, extensionStatusJSON_bug, reportErrorMessage } from '../state.js'
import { showNotification, logError } from '../ui.js'
import { overWriteChromeStorage } from '../storage.js'

export function insertGapMarker() {
  state.transcript.push({
    personName: "[meet-transcripts]",
    timestamp: new Date().toISOString(),
    transcriptText: "[Captions unavailable — tab was not in focus]",
  })
  overWriteChromeStorage(["transcript"], false)
}

export function pushBufferToTranscript() {
  state.transcript.push({
    personName: state.personNameBuffer === "You" ? state.userName : state.personNameBuffer,
    timestamp: state.timestampBuffer,
    transcriptText: state.transcriptTextBuffer,
  })
  overWriteChromeStorage(["transcript"], false)
}

/**
 * @param {MutationRecord[]} mutationsList
 */
export function transcriptMutationCallback(mutationsList) {
  mutationsList.forEach((mutation) => {
    try {
      if (mutation.type === "characterData") {
        const mutationTargetElement = mutation.target.parentElement
        const transcriptUIBlocks = [...mutationTargetElement?.parentElement?.parentElement?.children || []]
        const isLastButSecondElement = transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement ? true : false

        if (isLastButSecondElement) {
          const currentPersonName = mutationTargetElement?.previousSibling?.textContent
          const currentTranscriptText = mutationTargetElement?.textContent

          if (currentPersonName && currentTranscriptText) {
            // Dim down current transcript block
            [...transcriptUIBlocks[transcriptUIBlocks.length - 3].children].forEach((item) => {
              item.setAttribute("style", "opacity:0.2")
            })

            if (state.transcriptTextBuffer === "") {
              state.personNameBuffer = currentPersonName
              state.timestampBuffer = new Date().toISOString()
              state.transcriptTextBuffer = currentTranscriptText
            } else {
              if (state.personNameBuffer !== currentPersonName) {
                pushBufferToTranscript()
                state.personNameBuffer = currentPersonName
                state.timestampBuffer = new Date().toISOString()
                state.transcriptTextBuffer = currentTranscriptText
              } else {
                // Same person speaking >30min — Meet drops and restarts their transcript
                if ((currentTranscriptText.length - state.transcriptTextBuffer.length) < -250) {
                  pushBufferToTranscript()
                  state.timestampBuffer = new Date().toISOString()
                }
                state.transcriptTextBuffer = currentTranscriptText
              }
            }
          } else {
            console.log("No active transcript")
            if ((state.personNameBuffer !== "") && (state.transcriptTextBuffer !== "")) {
              pushBufferToTranscript()
            }
            state.personNameBuffer = ""
            state.transcriptTextBuffer = ""
          }
        }
      }

      console.log("Transcript captured")
    } catch (err) {
      console.error(err)
      if (!state.isTranscriptDomErrorCaptured && !state.hasMeetingEnded) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)
        logError("005", err)
      }
      state.isTranscriptDomErrorCaptured = true
    }
  })
}


// CURRENT GOOGLE MEET TRANSCRIPT DOM. TO BE UPDATED.

{/* <div class="a4cQT kV7vwc eO2Zfd" jscontroller="D1tHje" jsaction="bz0DVc:HWTqGc;E18dRb:lUFH9b;QBUr8:lUFH9b;stc2ve:oh3Xke" style="">
  // CAPTION LANGUAGE SETTINGS. MAY OR MAY NOT HAVE CHILDREN
  <div class="NmXUuc  P9KVBf" jscontroller="rRafu" jsaction="F41Sec:tsH52e;OmFrlf:xfAI6e(zHUIdd)"></div>
  <div class="DtJ7e">
    <span class="frX3lc-vlkzWd  P9KVBf"></span>
    <div jsname="dsyhDe" class="iOzk7 uYs2ee " style="">
      //PERSON 1
      <div class="nMcdL bj4p3b" style="">
        <div class="adE6rb M6cG9d">
          <img alt="" class="Z6byG r6DyN" src="https://lh3.googleusercontent.com/a/some-url" data-iml="63197.699999999255">
            <div class="KcIKyf jxFHg">Person 1</div>
        </div>
        <div jsname="YSxPC" class="bYevke wY1pdd" style="height: 27.5443px;">
          <div jsname="tgaKEf" class="bh44bd VbkSUe">
            Some transcript text.
            Some more text.</div>
        </div>
      </div>
      //PERSON 2
      <div class="nMcdL bj4p3b" style="">
        <div class="adE6rb M6cG9d">
          <img alt="" class="Z6byG r6DyN" src="https://lh3.googleusercontent.com/a/some-url" data-iml="63197.699999999255">
            <div class="KcIKyf jxFHg">Person 2</div>
        </div>
        <div jsname="YSxPC" class="bYevke wY1pdd" style="height: 27.5443px;">
          <div jsname="tgaKEf" class="bh44bd VbkSUe">
            Some transcript text.
            Some more text.</div>
        </div>
      </div>
    </div>
    <div jsname="APQunf" class="iOzk7 uYs2ee" style="display: none;">
    </div>
  </div>
  <div jscontroller="mdnBv" jsaction="stc2ve:MO88xb;QBUr8:KNou4c">
  </div>
</div> */}
