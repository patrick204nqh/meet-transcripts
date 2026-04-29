import type { ExtensionStatusJSON } from '../types'

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

export function selectElements(selector: string, text: string | RegExp): Element[] {
  const elements = document.querySelectorAll(selector)
  return Array.prototype.filter.call(elements, (element: Element) =>
    RegExp(text).test(element.textContent ?? "")
  )
}

export async function waitForElement(selector: string, text?: string | RegExp): Promise<Element | null> {
  if (text) {
    while (!Array.from(document.querySelectorAll(selector)).find(el => el.textContent === text)) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  } else {
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  }
  return document.querySelector(selector)
}

export function showNotification(statusJSON: ExtensionStatusJSON | null): void {
  if (!statusJSON) return
  const html = document.querySelector("html")
  const obj = document.createElement("div")
  const logo = document.createElement("img")
  const text = document.createElement("p")

  logo.setAttribute("src", chrome.runtime.getURL("icon.png"))
  logo.setAttribute("height", "32px")
  logo.setAttribute("width", "32px")
  logo.style.cssText = "border-radius: 4px"
  logo.onerror = () => { logo.style.display = "none" }

  setTimeout(() => { obj.style.display = "none" }, 5000)

  if (statusJSON.status === 200) {
    obj.style.cssText = `color: #2A9ACA; ${commonCSS}`
    text.innerHTML = statusJSON.message
  } else {
    obj.style.cssText = `color: orange; ${commonCSS}`
    text.innerHTML = statusJSON.message
  }

  obj.prepend(text)
  obj.prepend(logo)
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
