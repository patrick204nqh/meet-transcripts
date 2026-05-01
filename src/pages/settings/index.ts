import type { OperationMode, WebhookBodyType } from '../../types'

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

function requestWebhookPermission(url: string): Promise<void> {
  const { protocol, hostname } = new URL(url)
  return chrome.permissions.request(
    { origins: [`${protocol}//${hostname}/*`] }
  ).then((granted) => {
    if (!granted) throw new Error('Permission denied')
  })
}

document.addEventListener('DOMContentLoaded', () => {
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
})
