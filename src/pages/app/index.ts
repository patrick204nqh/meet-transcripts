import { PROTOCOL_VERSION } from '../../shared/protocol'
import type { Meeting, ErrorObject, OperationMode, WebhookBodyType } from '../../types'

// ── Shared utilities ──────────────────────────────────────────────────────────

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 4000): void {
  const container = document.getElementById('toast-container')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

function showConfirm(message: string, onConfirm: () => void): void {
  const container = document.getElementById('toast-container')
  if (!container) return
  container.querySelector('.toast-confirm')?.remove()
  const toast = document.createElement('div')
  toast.className = 'toast toast-confirm'
  const msg = document.createElement('p')
  msg.style.margin = '0'
  msg.textContent = message
  const actions = document.createElement('div')
  actions.className = 'toast-confirm-actions'
  const yes = document.createElement('button')
  yes.className = 'toast-confirm-yes'
  yes.textContent = 'Delete'
  const no = document.createElement('button')
  no.className = 'toast-confirm-no'
  no.textContent = 'Cancel'
  actions.append(yes, no)
  toast.append(msg, actions)
  container.appendChild(toast)
  yes.addEventListener('click', () => { onConfirm(); toast.remove() })
  no.addEventListener('click', () => toast.remove())
  setTimeout(() => { if (toast.isConnected) toast.remove() }, 15000)
}

function requestWebhookPermission(url: string): Promise<void> {
  const { protocol, hostname } = new URL(url)
  return chrome.permissions.request(
    { origins: [`${protocol}//${hostname}/*`] }
  ).then((granted) => {
    if (!granted) throw new Error('Permission denied')
  })
}

// ── Hash router ───────────────────────────────────────────────────────────────

type ViewId = 'meetings' | 'settings'

function activateView(viewId: ViewId): void {
  document.querySelectorAll<HTMLElement>('.view').forEach(el => {
    el.classList.remove('active')
    el.hidden = true
  })
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    const isActive = btn.dataset['view'] === viewId
    btn.classList.toggle('active', isActive)
    btn.setAttribute('aria-selected', String(isActive))
  })
  const view = document.getElementById(`view-${viewId}`)
  if (view) {
    view.hidden = false
    view.classList.add('active')
  }
  if (location.hash !== `#${viewId}`) {
    history.replaceState(null, '', `#${viewId}`)
  }
}

function resolveInitialView(): ViewId {
  const hash = location.hash.replace('#', '')
  return hash === 'settings' ? 'settings' : 'meetings'
}

// ── Meetings logic ────────────────────────────────────────────────────────────

const NO_MEETINGS = '013'
const EMPTY_TRANSCRIPT = '014'

let isMeetingsTableExpanded = false

function getDuration(startTimestamp: string, endTimestamp: string): string {
  const ms = new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes}m`
}

function loadMeetings(): void {
  const meetingsTable = document.querySelector<HTMLTableSectionElement>('#meetings-table')
  if (!meetingsTable) return

  chrome.storage.local.get(['meetings'], (result) => {
    const meetings = (result['meetings'] as Meeting[] | undefined) ?? []
    meetingsTable.innerHTML = ''

    if (meetings.length === 0) {
      meetingsTable.innerHTML = `<tr><td colspan="5" style="color: var(--text-2); text-align: center; padding: 2rem;">Your next meeting will appear here</td></tr>`
      return
    }

    for (let i = meetings.length - 1; i >= 0; i--) {
      const meeting = meetings[i]!
      const row = document.createElement('tr')

      // Col 1: title (contenteditable — textContent prevents XSS)
      const tdTitle = document.createElement('td')
      const titleDiv = document.createElement('div')
      titleDiv.contentEditable = 'true'
      titleDiv.className = 'meeting-title'
      titleDiv.dataset['index'] = String(i)
      titleDiv.title = 'Rename'
      titleDiv.setAttribute('role', 'textbox')
      titleDiv.setAttribute('aria-label', `Rename meeting title: ${meeting.title ?? 'Google Meet call'}`)
      titleDiv.textContent = meeting.title ?? 'Google Meet call'
      tdTitle.appendChild(titleDiv)
      row.appendChild(tdTitle)

      // Col 2: software
      const tdSoftware = document.createElement('td')
      tdSoftware.textContent = meeting.software ?? ''
      row.appendChild(tdSoftware)

      // Col 3: time · duration
      const tdTime = document.createElement('td')
      tdTime.textContent = `${new Date(meeting.startTimestamp).toLocaleString()}  ●  ${getDuration(meeting.startTimestamp, meeting.endTimestamp)}`
      row.appendChild(tdTime)

      // Col 4: webhook status badge
      const tdStatus = document.createElement('td')
      const badge = document.createElement('span')
      badge.className = 'badge'
      const statusMap: Record<string, [string, string]> = {
        successful: ['status-success', 'Successful'],
        failed:     ['status-failed',  'Failed'],
        new:        ['status-new',     'New'],
      }
      const [cls, label] = statusMap[meeting.webhookPostStatus] ?? ['status-new', 'Pending']
      badge.classList.add(cls!)
      badge.textContent = label!
      tdStatus.appendChild(badge)
      row.appendChild(tdStatus)

      // Col 5: actions
      const tdActions = document.createElement('td')
      const actionsDiv = document.createElement('div')
      actionsDiv.style.cssText = 'display: flex; gap: 1rem; justify-content: end'

      const downloadBtn = document.createElement('button')
      downloadBtn.className = 'download-button'
      downloadBtn.title = 'Download'
      downloadBtn.setAttribute('aria-label', 'Download this meeting transcript')
      const dlImg = document.createElement('img')
      dlImg.src = './icons/download.svg'
      dlImg.alt = ''
      downloadBtn.appendChild(dlImg)

      const postBtn = document.createElement('button')
      postBtn.className = 'post-button'
      postBtn.title = meeting.webhookPostStatus === 'new' ? 'Post webhook' : 'Repost webhook'
      postBtn.setAttribute('aria-label', postBtn.title)
      const postImg = document.createElement('img')
      postImg.src = './icons/webhook.svg'
      postImg.alt = ''
      postBtn.appendChild(postImg)

      const deleteBtn = document.createElement('button')
      deleteBtn.className = 'delete-button'
      deleteBtn.title = 'Delete'
      deleteBtn.setAttribute('aria-label', 'Delete this meeting')
      const delImg = document.createElement('img')
      delImg.src = './icons/delete.svg'
      delImg.alt = ''
      deleteBtn.appendChild(delImg)

      actionsDiv.append(downloadBtn, postBtn, deleteBtn)
      tdActions.appendChild(actionsDiv)
      row.appendChild(tdActions)
      meetingsTable.appendChild(row)

      titleDiv.addEventListener('blur', () => {
        meetings[i] = { ...meeting, title: titleDiv.innerText }
        chrome.storage.local.set({ meetings })
      })

      downloadBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage(
          { v: PROTOCOL_VERSION, type: 'download_transcript_at_index', index: i },
          (response: { success: boolean; message?: ErrorObject }) => {
            if (!response?.success && response?.message) {
              showToast('Could not download transcript.', 'error')
              console.error(response.message.errorMessage)
            }
          }
        )
      })

      postBtn.addEventListener('click', () => {
        chrome.storage.sync.get(['webhookUrl'], (result) => {
          const webhookUrl = result['webhookUrl'] as string | undefined
          if (!webhookUrl) {
            showToast('Please configure a webhook URL in Settings first.', 'info')
            return
          }
          requestWebhookPermission(webhookUrl).then(() => {
            postBtn.disabled = true
            postBtn.textContent = meeting.webhookPostStatus === 'new' ? 'Posting…' : 'Reposting…'
            chrome.runtime.sendMessage(
              { v: PROTOCOL_VERSION, type: 'post_webhook_at_index', index: i },
              (response: { success: boolean; message?: ErrorObject }) => {
                loadMeetings()
                if (response?.success) {
                  showToast('Posted successfully!', 'success')
                } else {
                  if (response?.message) console.error(response.message.errorMessage)
                  showToast('Failed to post webhook.', 'error')
                }
              }
            )
          }).catch((err: unknown) => {
            showToast('Webhook permission required. Configure your URL in Settings.', 'error')
            console.error('Webhook permission error:', err)
          })
        })
      })

      deleteBtn.addEventListener('click', () => {
        showConfirm(`Delete "${meeting.title ?? 'Google Meet call'}"?`, () => {
          meetings.splice(i, 1)
          chrome.storage.local.set({ meetings }, () => loadMeetings())
        })
      })
    }

    const container = document.querySelector<HTMLElement>('#meetings-table-container')
    if (!isMeetingsTableExpanded && container && container.clientHeight > 280) {
      container.classList.add('fade-mask')
      document.querySelector('#show-all')?.setAttribute('style', 'display: block')
    }
  })
}

function initMeetings(): void {
  const recoverBtn = document.querySelector<HTMLButtonElement>('#recover-last-meeting')
  const showAllBtn = document.querySelector<HTMLButtonElement>('#show-all')

  loadMeetings()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadMeetings()
  })

  chrome.storage.onChanged.addListener(() => loadMeetings())

  recoverBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { v: PROTOCOL_VERSION, type: 'recover_last_meeting' },
      (response: { success: boolean; message?: string | ErrorObject }) => {
        loadMeetings()
        scrollTo({ top: 0, behavior: 'smooth' })
        if (response?.success) {
          showToast(
            response.message === 'No recovery needed'
              ? 'No unprocessed meetings found.'
              : 'Last meeting recovered successfully!',
            response.message === 'No recovery needed' ? 'info' : 'success'
          )
        } else {
          const err = response?.message as ErrorObject | undefined
          if (err?.errorCode === NO_MEETINGS || err?.errorCode === EMPTY_TRANSCRIPT) {
            showToast('No unprocessed meetings found.', 'info')
          } else {
            showToast('Could not recover last meeting.', 'error')
            if (err?.errorMessage) console.error(err.errorMessage)
          }
        }
      }
    )
  })

  showAllBtn?.addEventListener('click', () => {
    document.querySelector('#meetings-table-container')?.classList.remove('fade-mask')
    showAllBtn.setAttribute('style', 'display:none;')
    isMeetingsTableExpanded = true
  })
}

// ── Settings logic ────────────────────────────────────────────────────────────

function initSettings(): void {
  // ── Mode toggle ──
  const autoModeRadio = document.querySelector<HTMLInputElement>('#auto-mode')
  const manualModeRadio = document.querySelector<HTMLInputElement>('#manual-mode')

  chrome.storage.sync.get(['operationMode'], (result) => {
    const mode = (result['operationMode'] as OperationMode | undefined) ?? 'auto'
    if (autoModeRadio && manualModeRadio) {
      if (mode === 'manual') {
        manualModeRadio.checked = true
      } else {
        autoModeRadio.checked = true
      }
      autoModeRadio.addEventListener('change', () => chrome.storage.sync.set({ operationMode: 'auto' }))
      manualModeRadio.addEventListener('change', () => chrome.storage.sync.set({ operationMode: 'manual' }))
    }
  })

  // ── Automation checkboxes ──
  const autoDownloadCheckbox = document.querySelector<HTMLInputElement>('#auto-download-file')
  const autoPostCheckbox = document.querySelector<HTMLInputElement>('#auto-post-webhook')

  chrome.storage.sync.get(['autoDownloadFileAfterMeeting', 'autoPostWebhookAfterMeeting'], (result) => {
    if (autoDownloadCheckbox) {
      autoDownloadCheckbox.checked = result['autoDownloadFileAfterMeeting'] !== false
      autoDownloadCheckbox.addEventListener('change', () => {
        chrome.storage.sync.set({ autoDownloadFileAfterMeeting: autoDownloadCheckbox.checked })
      })
    }
    if (autoPostCheckbox) {
      autoPostCheckbox.checked = !!(result['autoPostWebhookAfterMeeting'])
      autoPostCheckbox.addEventListener('change', () => {
        chrome.storage.sync.set({ autoPostWebhookAfterMeeting: autoPostCheckbox.checked })
      })
    }
  })

  // ── Webhook URL form ──
  const webhookForm = document.querySelector<HTMLFormElement>('#webhook-url-form')
  const webhookUrlInput = document.querySelector<HTMLInputElement>('#webhook-url')
  const saveWebhookBtn = document.querySelector<HTMLButtonElement>('#save-webhook')

  if (saveWebhookBtn) saveWebhookBtn.disabled = true

  chrome.storage.sync.get(['webhookUrl'], (result) => {
    const saved = result['webhookUrl'] as string | undefined
    if (webhookUrlInput && saved) {
      webhookUrlInput.value = saved
      if (saveWebhookBtn) saveWebhookBtn.disabled = !webhookUrlInput.checkValidity()
    }
  })

  webhookUrlInput?.addEventListener('input', () => {
    if (saveWebhookBtn && webhookUrlInput) {
      saveWebhookBtn.disabled = !webhookUrlInput.checkValidity()
    }
  })

  webhookForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const url = webhookUrlInput?.value ?? ''
    if (url === '') {
      chrome.storage.sync.set({ webhookUrl: '' }, () => showToast('Webhook URL cleared.', 'success'))
      return
    }
    if (webhookUrlInput && webhookUrlInput.checkValidity()) {
      requestWebhookPermission(url).then(() => {
        chrome.storage.sync.set({ webhookUrl: url }, () => showToast('Webhook URL saved.', 'success'))
      }).catch((err: unknown) => {
        showToast('Permission required. Click Save again to retry.', 'error')
        console.error('Webhook permission error:', err)
      })
    }
  })

  // ── Webhook body type ──
  const simpleRadio = document.querySelector<HTMLInputElement>('#simple-webhook-body')
  const advancedRadio = document.querySelector<HTMLInputElement>('#advanced-webhook-body')

  chrome.storage.sync.get(['webhookBodyType'], (result) => {
    const type = (result['webhookBodyType'] as WebhookBodyType | undefined) ?? 'simple'
    if (simpleRadio && advancedRadio) {
      if (type === 'advanced') {
        advancedRadio.checked = true
      } else {
        simpleRadio.checked = true
      }
      simpleRadio.addEventListener('change', () => chrome.storage.sync.set({ webhookBodyType: 'simple' }))
      advancedRadio.addEventListener('change', () => chrome.storage.sync.set({ webhookBodyType: 'advanced' }))
    }
  })
}

// ── Version ───────────────────────────────────────────────────────────────────

function initVersion(): void {
  const versionEl = document.querySelector<HTMLSpanElement>('#version')
  if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initVersion()

  const initialView = resolveInitialView()
  activateView(initialView)

  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activateView(btn.dataset['view'] as ViewId)
    })
  })

  window.addEventListener('hashchange', () => {
    activateView(resolveInitialView())
  })

  initMeetings()
  initSettings()
})
