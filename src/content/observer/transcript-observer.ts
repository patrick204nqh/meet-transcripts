import { state } from '../state'
import { mutationConfig } from '../constants'
import { handleContentError } from '../ui'
import { persistStateFields } from '../state-sync'
import { log } from '../../shared/logger'

// Google Meet drops and restarts a speaker's transcript block after ~30 minutes.
// A sudden shrink beyond this threshold signals a restart, not normal editing.
const TRANSCRIPT_RESTART_THRESHOLD = -250

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

        // Primary (main window): Meet renders the active block at [length-3].
        // Shorter lists (< 3 blocks) fall back to [length-1].
        const activeIndex = transcriptUIBlocks.length >= 3 ? transcriptUIBlocks.length - 3 : transcriptUIBlocks.length - 1
        const isAtPosition = transcriptUIBlocks[activeIndex] === mutationTargetElement?.parentElement

        // Fallback (PiP): when the position check fails in PiP mode, the PiP DOM
        // places the person-name as the preceding sibling of the text element directly,
        // so trust that structure instead of the sibling-count heuristic.
        const precedingSibling = mutationTargetElement?.previousSibling as Element | null
        const isActiveBlock = isAtPosition ||
          (state.pipObserverAttached && !!precedingSibling?.textContent?.trim())

        log.debug("Transcript mutation — blocks:", transcriptUIBlocks.length, "activeIndex:", activeIndex,
          "positioned:", isAtPosition, "pip-fallback:", !isAtPosition && state.pipObserverAttached)

        if (isActiveBlock) {
          const currentPersonName = (mutationTargetElement?.previousSibling as Element | null)?.textContent
          const currentTranscriptText = mutationTargetElement?.textContent

          if (currentPersonName && currentTranscriptText) {
            // Dim down current transcript block (use parentElement directly in PiP fallback)
            const blockToDim = isAtPosition ? transcriptUIBlocks[activeIndex] : mutationTargetElement?.parentElement
            Array.from(blockToDim?.children ?? []).forEach((item) => {
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
                if ((currentTranscriptText.length - state.transcriptTextBuffer.length) < TRANSCRIPT_RESTART_THRESHOLD) {
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
