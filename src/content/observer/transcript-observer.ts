import { state } from '../state'
import { mutationConfig } from '../constants'
import { handleContentError } from '../ui'
import { persistStateFields } from '../state-sync'
import { log } from '../../shared/logger'

export function insertGapMarker(): void {
  state.transcript.push({
    personName: "[meet-transcripts]",
    timestamp: new Date().toISOString(),
    text: "[Captions unavailable — tab was not in focus]",
  })
  persistStateFields(["transcript"])
}

export function pushBufferToTranscript(): void {
  state.transcript.push({
    personName: state.personNameBuffer === "You" ? state.userName : state.personNameBuffer,
    timestamp: state.timestampBuffer,
    text: state.transcriptTextBuffer,
  })
  persistStateFields(["transcript"])
}

export function transcriptMutationCallback(mutationsList: MutationRecord[]): void {
  mutationsList.forEach((mutation) => {
    try {
      if (mutation.type === "characterData") {
        const mutationTargetElement = (mutation.target as Text).parentElement
        const transcriptUIBlocks = [...(mutationTargetElement?.parentElement?.parentElement?.children ?? [])]
        const isLastButSecondElement = transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement

        if (isLastButSecondElement) {
          const currentPersonName = (mutationTargetElement?.previousSibling as Element | null)?.textContent
          const currentTranscriptText = mutationTargetElement?.textContent

          if (currentPersonName && currentTranscriptText) {
            // Dim down current transcript block
            Array.from(transcriptUIBlocks[transcriptUIBlocks.length - 3]?.children ?? []).forEach((item) => {
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
            log.debug("No active transcript")
            if (state.personNameBuffer !== "" && state.transcriptTextBuffer !== "") {
              pushBufferToTranscript()
            }
            state.personNameBuffer = ""
            state.transcriptTextBuffer = ""
          }
        }
      }

      log.debug("Transcript captured")
    } catch (err) {
      if (!state.isTranscriptDomErrorCaptured && !state.hasMeetingEnded) {
        handleContentError("005", err)
      }
      state.isTranscriptDomErrorCaptured = true
    }
  })
}


// CURRENT GOOGLE MEET TRANSCRIPT DOM. TO BE UPDATED.

{/* <div class="a4cQT kV7vwc eO2Zfd">
  <div class="DtJ7e">
    <div jsname="dsyhDe" class="iOzk7 uYs2ee">
      <div class="nMcdL bj4p3b">
        <div class="adE6rb M6cG9d">
          <div class="KcIKyf jxFHg">Person 1</div>
        </div>
        <div jsname="YSxPC" class="bYevke wY1pdd">
          <div jsname="tgaKEf" class="bh44bd VbkSUe">Some transcript text.</div>
        </div>
      </div>
    </div>
  </div>
</div> */}
