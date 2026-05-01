import type { OperationMode, MeetingTabId } from '../../types'

document.addEventListener('DOMContentLoaded', () => {
  const autoModeRadio = document.querySelector<HTMLInputElement>('#auto-mode')
  const manualModeRadio = document.querySelector<HTMLInputElement>('#manual-mode')
  const modeDesc = document.querySelector<HTMLParagraphElement>('#mode-desc')
  const versionEl = document.querySelector<HTMLSpanElement>('#version')
  const statusDot = document.querySelector<HTMLSpanElement>('#status-dot')
  const statusLabel = document.querySelector<HTMLSpanElement>('#status-label')
  const statusMeeting = document.querySelector<HTMLDivElement>('#status-meeting')
  const statusMeetingTitle = document.querySelector<HTMLElement>('#status-meeting-title')

  if (versionEl) {
    versionEl.textContent = `v${chrome.runtime.getManifest().version}`
  }

  function setStatusIdle(): void {
    if (statusDot) statusDot.className = 'status-dot idle'
    if (statusLabel) {
      statusLabel.className = 'status-label idle'
      statusLabel.textContent = 'Open a Google Meet to start'
    }
    if (statusMeeting) statusMeeting.hidden = true
  }

  function setStatusReady(): void {
    if (statusDot) statusDot.className = 'status-dot ready'
    if (statusLabel) {
      statusLabel.className = 'status-label ready'
      statusLabel.textContent = 'Ready on Google Meet'
    }
    if (statusMeeting) statusMeeting.hidden = true
  }

  function setStatusRecording(title?: string): void {
    if (statusDot) statusDot.className = 'status-dot recording'
    if (statusLabel) {
      statusLabel.className = 'status-label recording'
      statusLabel.textContent = 'Recording'
    }
    if (statusMeeting) statusMeeting.hidden = false
    if (statusMeetingTitle) statusMeetingTitle.textContent = title ?? 'Google Meet call'
  }

  function updateStatus(): void {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const isOnMeet = !!(tab?.url?.startsWith('https://meet.google.com/'))
      if (!isOnMeet) {
        setStatusIdle()
        return
      }
      chrome.storage.local.get(['meetingTabId', 'title'], (result) => {
        const meetingTabId = result['meetingTabId'] as MeetingTabId
        const title = result['title'] as string | undefined
        if (tab.id !== undefined && meetingTabId === tab.id) {
          setStatusRecording(title)
        } else {
          setStatusReady()
        }
      })
    })
  }

  updateStatus()

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ('meetingTabId' in changes || 'title' in changes)) {
      updateStatus()
    }
  })

  const modeDescriptions: Record<OperationMode, string> = {
    auto: 'Captures every meeting automatically',
    manual: 'Manually decide when to start and stop capture',
  }

  function updateModeDesc(mode: OperationMode): void {
    if (modeDesc) modeDesc.textContent = modeDescriptions[mode]
  }

  chrome.storage.sync.get(['operationMode'], (result) => {
    const mode = (result['operationMode'] as OperationMode | undefined) ?? 'auto'
    if (autoModeRadio && manualModeRadio) {
      if (mode === 'manual') {
        manualModeRadio.checked = true
      } else {
        autoModeRadio.checked = true
      }
      updateModeDesc(mode)

      autoModeRadio.addEventListener('change', () => {
        chrome.storage.sync.set({ operationMode: 'auto' })
        updateModeDesc('auto')
      })
      manualModeRadio.addEventListener('change', () => {
        chrome.storage.sync.set({ operationMode: 'manual' })
        updateModeDesc('manual')
      })
    }
  })
})
