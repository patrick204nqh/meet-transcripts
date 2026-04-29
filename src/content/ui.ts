import type { ExtensionStatusJSON } from '../types'
import { bugStatusJson } from './constants'

const commonCSS = `background: rgb(255 255 255 / 100%);
    backdrop-filter: blur(16px);
    position: fixed;
    top: 5%;
    left: 0;
    right: 0;
    margin-left: auto;
    margin-right: auto;
    max-width: 780px;
    z-index: 1000;
    padding: 0rem 1rem;
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    font-size: 1rem;
    line-height: 1.5;
    font-family: "Google Sans",Roboto,Arial,sans-serif;
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`

const DOM_POLL_INTERVAL_MS = 250
const DOM_POLL_MAX_ATTEMPTS = 120  // 30 s ceiling before giving up

// Embedded so notifications don't require a chrome-extension:// fetch — Meet's
// service worker intercepts every fetch on the page and fails on extension URLs.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="meetTranscriptsLogoBg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1e293b"/><stop offset="100%" style="stop-color:#0f172a"/></linearGradient></defs><rect width="40" height="40" rx="9" fill="url(#meetTranscriptsLogoBg)"/><rect x="4" y="3" width="30" height="25" rx="5" fill="#1e3a8a"/><rect x="4" y="3" width="30" height="25" rx="5" fill="none" stroke="#38bdf8" stroke-width="1.2"/><polygon points="8,28 14,28 10,34" fill="#1e3a8a"/><line x1="8" y1="28" x2="10" y2="34" stroke="#38bdf8" stroke-width="1.2" stroke-linecap="round"/><line x1="14" y1="28" x2="10" y2="34" stroke="#38bdf8" stroke-width="1.2" stroke-linecap="round"/><line x1="8" y1="28" x2="14" y2="28" stroke="#1e3a8a" stroke-width="1.5"/><rect x="8" y="9" width="21" height="2" rx="1" fill="#bae6fd" opacity="0.85"/><rect x="8" y="13" width="16" height="2" rx="1" fill="#bae6fd" opacity="0.85"/><rect x="8" y="17" width="11" height="2" rx="1" fill="#bae6fd" opacity="0.85"/><rect x="10" y="23" width="2" height="3" rx="1" fill="#38bdf8"/><rect x="13" y="21" width="2" height="5" rx="1" fill="#38bdf8"/><rect x="16" y="19" width="2" height="7" rx="1" fill="#38bdf8"/><rect x="19" y="22" width="2" height="4" rx="1" fill="#38bdf8"/><rect x="22" y="23" width="2" height="3" rx="1" fill="#38bdf8"/></svg>`

export function selectElements(selector: string, text: string | RegExp): Element[] {
  const elements = document.querySelectorAll(selector)
  return Array.prototype.filter.call(elements, (element: Element) =>
    RegExp(text).test(element.textContent ?? "")
  )
}

export function waitForElement(selector: string, text?: string | RegExp): Promise<Element | null> {
  return new Promise((resolve) => {
    const matches = (el: Element): boolean =>
      !text || RegExp(text).test(el.textContent ?? "")

    const find = (): Element | null =>
      Array.from(document.querySelectorAll(selector)).find(matches) ?? null

    // 1. Immediate check — element may already be in DOM
    const immediate = find()
    if (immediate) { resolve(immediate); return }

    let attempts = 0
    let done = false

    const finish = (el: Element | null): void => {
      if (done) return
      done = true
      observer.disconnect()
      clearInterval(timer)
      resolve(el)
    }

    // 2. MutationObserver fires regardless of tab visibility (unlike requestAnimationFrame)
    const observer = new MutationObserver(() => {
      const el = find()
      if (el) finish(el)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    // 3. Timeout guard — gives up after DOM_POLL_MAX_ATTEMPTS × DOM_POLL_INTERVAL_MS
    const timer = setInterval(() => {
      const el = find()
      if (el) { finish(el); return }
      if (++attempts >= DOM_POLL_MAX_ATTEMPTS) finish(null)
    }, DOM_POLL_INTERVAL_MS)
  })
}

export function showNotification(statusJSON: ExtensionStatusJSON | null): void {
  if (!statusJSON) return
  const html = document.querySelector("html")
  const obj = document.createElement("div")
  const text = document.createElement("p")

  // Inline SVG instead of <img src="chrome-extension://..."> — Meet's service worker
  // intercepts every fetch on the page and rejects extension URLs, polluting the console.
  const logoWrapper = document.createElement("div")
  logoWrapper.innerHTML = LOGO_SVG
  const logo = logoWrapper.firstElementChild as SVGElement | null
  if (logo) {
    logo.setAttribute("width", "32")
    logo.setAttribute("height", "32")
    logo.style.cssText = "border-radius: 4px; flex-shrink: 0"
  }

  setTimeout(() => { obj.style.display = "none" }, 5000)

  if (statusJSON.status === 200) {
    obj.style.cssText = `color: #2A9ACA; ${commonCSS}`
    text.innerHTML = statusJSON.message
  } else {
    obj.style.cssText = `color: orange; ${commonCSS}`
    text.innerHTML = statusJSON.message
  }

  obj.prepend(text)
  if (logo) obj.prepend(logo)
  html?.append(obj)
}

export function pulseStatus(): void {
  const statusActivityCSS = `position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    z-index: 100;
    transition: background-color 0.3s ease-in
  `

  let activityStatus = document.querySelector<HTMLDivElement>(`#meet-transcripts-status`)
  if (!activityStatus) {
    const html = document.querySelector("html")
    activityStatus = document.createElement("div")
    activityStatus.setAttribute("id", "meet-transcripts-status")
    activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
    html?.appendChild(activityStatus)
  } else {
    activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
  }

  const el = activityStatus
  setTimeout(() => {
    el.style.cssText = `background-color: transparent; ${statusActivityCSS}`
  }, 3000)
}

export function logError(code: string, err: unknown): void {
  console.error(`[meet-transcripts] Error ${code}:`, err)
}

export function handleContentError(code: string, err: unknown, notify = true): void {
  logError(code, err)
  if (notify) showNotification(bugStatusJson)
}
