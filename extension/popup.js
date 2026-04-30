// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

window.onload = function () {
  const autoModeRadio = document.querySelector("#auto-mode")
  const manualModeRadio = document.querySelector("#manual-mode")
  const versionElement = document.querySelector("#version")
  const statusDot = document.querySelector(".status-dot")
  const statusBar = document.querySelector(".status-bar")
  const statusLabel = statusBar ? statusBar.querySelector("span:last-child") : null

  if (versionElement) {
    versionElement.innerHTML = `v${chrome.runtime.getManifest().version}`
  }

  // Show real status based on whether the active tab is a Google Meet session
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0]
    const isOnMeet = !!(tab && tab.url && tab.url.startsWith("https://meet.google.com/"))
    if (!isOnMeet) {
      if (statusDot) statusDot.classList.add("idle")
      if (statusBar) statusBar.classList.add("idle")
      if (statusLabel) statusLabel.textContent = "Open a Google Meet to start"
    }
  })

  chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
    const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
    if (autoModeRadio instanceof HTMLInputElement && manualModeRadio instanceof HTMLInputElement) {
      if (resultSync.operationMode === "manual") {
        manualModeRadio.checked = true
      }
      else {
        autoModeRadio.checked = true
      }

      autoModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "auto" }, function () { })
      })
      manualModeRadio.addEventListener("change", function () {
        chrome.storage.sync.set({ operationMode: "manual" }, function () { })
      })
    }
  })
}
