import type { IBrowserStorage, IBrowserRuntime } from './types'

export const ChromeStorage: IBrowserStorage = {
  localGet: (keys) => chrome.storage.local.get(keys),
  localSet: (data) => chrome.storage.local.set(data),
  syncGet: (keys) => chrome.storage.sync.get(keys),
  syncSet: (data) => chrome.storage.sync.set(data),
}

export const ChromeRuntime: IBrowserRuntime = {
  get id() { return chrome.runtime.id },
  sendMessage: (msg) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (raw) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return }
        resolve(raw)
      })
    }),
  onMessage: (handler) => chrome.runtime.onMessage.addListener(handler),
}
