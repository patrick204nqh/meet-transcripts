// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

const ErrorCode = {
  NO_MEETINGS: "013",
  EMPTY_TRANSCRIPT: "014",
}

let isMeetingsTableExpanded = false

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container')
    if (!container) return
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    if (type === 'error') {
        toast.setAttribute('role', 'alert')
    } else {
        toast.setAttribute('role', 'status')
    }
    toast.textContent = message
    container.appendChild(toast)
    setTimeout(() => toast.remove(), duration)
}

/**
 * @param {string} message
 * @param {() => void} onConfirm
 */
function showConfirm(message, onConfirm) {
    const container = document.getElementById('toast-container')
    if (!container) return
    // Dismiss any existing confirm toast before showing a new one
    const existing = container.querySelector('.toast-confirm')
    if (existing) existing.remove()
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
    actions.appendChild(yes)
    actions.appendChild(no)
    toast.appendChild(msg)
    toast.appendChild(actions)
    container.appendChild(toast)
    yes.addEventListener('click', () => { onConfirm(); toast.remove() })
    no.addEventListener('click', () => toast.remove())
    // Auto-dismiss after 15 s if no action taken
    setTimeout(() => { if (toast.isConnected) toast.remove() }, 15000)
}

document.addEventListener("DOMContentLoaded", function () {
    const webhookUrlForm = document.querySelector("#webhook-url-form")
    const webhookUrlInput = document.querySelector("#webhook-url")
    const saveButton = document.querySelector("#save-webhook")
    const autoPostCheckbox = document.querySelector("#auto-post-webhook")
    const autoDownloadCheckbox = document.querySelector("#auto-download-file")
    const simpleWebhookBodyRadio = document.querySelector("#simple-webhook-body")
    const advancedWebhookBodyRadio = document.querySelector("#advanced-webhook-body")
    const recoverLastMeetingButton = document.querySelector("#recover-last-meeting")
    const showAllButton = document.querySelector("#show-all")

    // Initial load of transcripts
    loadMeetings()

    // Reload transcripts when page becomes visible
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            loadMeetings()
        }
    })

    chrome.storage.onChanged.addListener(() => {
        loadMeetings()
    })

    if (recoverLastMeetingButton instanceof HTMLButtonElement) {
        recoverLastMeetingButton.addEventListener("click", function () {
            /** @type {ExtensionMessage} */
            const message = {
                v: 1, // keep in sync with PROTOCOL_VERSION in src/shared/protocol.ts
                type: "recover_last_meeting",
            }
            chrome.runtime.sendMessage(message, function (responseUntyped) {
                const response = /** @type {ExtensionResponse} */ (responseUntyped)
                loadMeetings()
                scrollTo({ top: 0, behavior: "smooth" })
                if (response.success) {
                    if (response.message === "No recovery needed") {
                        showToast("No unprocessed meetings found.", 'info')
                    }
                    else {
                        showToast("Last meeting recovered successfully!", 'success')
                    }
                }
                else {
                    const parsedError = /** @type {ErrorObject} */ (response.message)
                    if (parsedError.errorCode === ErrorCode.NO_MEETINGS || parsedError.errorCode === ErrorCode.EMPTY_TRANSCRIPT) {
                        showToast("No unprocessed meetings found.", 'info')
                    }
                    else {
                        showToast("Could not recover last meeting.", 'error')
                        console.error(parsedError.errorMessage)
                    }
                }
            })
        })
    }

    if (saveButton instanceof HTMLButtonElement && webhookUrlForm instanceof HTMLFormElement && webhookUrlInput instanceof HTMLInputElement && autoPostCheckbox instanceof HTMLInputElement && simpleWebhookBodyRadio instanceof HTMLInputElement && advancedWebhookBodyRadio instanceof HTMLInputElement) {
        // Initially disable the save button
        saveButton.disabled = true

        // Load saved webhook URL, auto-post setting, and webhook body type
        chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting", "webhookBodyType"], function (resultSyncUntyped) {
            const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

            if (resultSync.webhookUrl) {
                webhookUrlInput.value = resultSync.webhookUrl
                saveButton.disabled = !webhookUrlInput.checkValidity()
            }

            // Set checkbox state
            autoPostCheckbox.checked = resultSync.autoPostWebhookAfterMeeting
            if (autoDownloadCheckbox instanceof HTMLInputElement) {
                autoDownloadCheckbox.checked = resultSync.autoDownloadFileAfterMeeting !== false
            }

            // Set radio button state
            if (resultSync.webhookBodyType === "advanced") {
                advancedWebhookBodyRadio.checked = true
            } else {
                simpleWebhookBodyRadio.checked = true
            }
        })

        // Handle URL input changes
        webhookUrlInput.addEventListener("input", function () {
            saveButton.disabled = !webhookUrlInput.checkValidity()
        })

        // Save webhook URL, auto-post setting, and webhook body type
        webhookUrlForm.addEventListener("submit", function (e) {
            e.preventDefault()
            const webhookUrl = webhookUrlInput.value
            if (webhookUrl === "") {
                // Save webhook URL and settings
                chrome.storage.sync.set({
                    webhookUrl: webhookUrl
                }, function () {
                    showToast("Webhook URL cleared.", 'success')
                })
            }
            else if (webhookUrl && webhookUrlInput.checkValidity()) {
                // Request runtime permission for the webhook URL
                requestWebhookAndNotificationPermission(webhookUrl).then(() => {
                    // Save webhook URL and settings
                    chrome.storage.sync.set({
                        webhookUrl: webhookUrl
                    }, function () {
                        showToast("Webhook URL saved.", 'success')
                    })
                }).catch((error) => {
                    showToast("Permission required. Click Save again to retry.", 'error')
                    console.error("Webhook permission error:", error)
                })
            }
        })

        // Auto save auto-post setting
        autoPostCheckbox.addEventListener("change", function () {
            chrome.storage.sync.set({
                autoPostWebhookAfterMeeting: autoPostCheckbox.checked,
            }, function () { })
        })

        if (autoDownloadCheckbox instanceof HTMLInputElement) {
            autoDownloadCheckbox.addEventListener("change", function () {
                chrome.storage.sync.set({
                    autoDownloadFileAfterMeeting: autoDownloadCheckbox.checked,
                }, function () { })
            })
        }

        // Auto save webhook body type
        simpleWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: "simple" }, function () { })
        })

        // Auto save webhook body type
        advancedWebhookBodyRadio.addEventListener("change", function () {
            // Save webhook URL and settings
            chrome.storage.sync.set({ webhookBodyType: advancedWebhookBodyRadio.checked ? "advanced" : "simple" }, function () { })
        })
    }

    if (showAllButton instanceof HTMLButtonElement) {
        showAllButton.addEventListener("click", () => {
            const meetingsTableContainer = document.querySelector("#meetings-table-container")
            meetingsTableContainer?.classList.remove("fade-mask")
            showAllButton.setAttribute("style", "display:none;")
            isMeetingsTableExpanded = true
        })
    }
})


// Request runtime permission for webhook URL
/**
 * @param {string} url
 */
function requestWebhookAndNotificationPermission(url) {
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url)
            const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

            // Request both host and notifications permissions
            chrome.permissions.request({
                origins: [originPattern],
                permissions: ["notifications"]
            }).then((granted) => {
                if (granted) {
                    resolve("Permission granted")
                } else {
                    reject(new Error("Permission denied"))
                }
            }).catch((error) => {
                reject(error)
            })
        } catch (error) {
            reject(error)
        }
    })
}

// Load and display recent transcripts
function loadMeetings() {
    const meetingsTable = document.querySelector("#meetings-table")

    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
        // Clear existing content
        if (meetingsTable) {
            meetingsTable.innerHTML = ""


            if (resultLocal.meetings && resultLocal.meetings.length > 0) {
                const meetings = resultLocal.meetings
                // Loop through the array in reverse order to list latest meeting first
                for (let i = meetings.length - 1; i >= 0; i--) {
                    const meeting = meetings[i]
                    const timestamp = new Date(meeting.startTimestamp).toLocaleString()
                    const durationString = getDuration(meeting.startTimestamp, meeting.endTimestamp)

                    const row = document.createElement("tr")

                    // Col 1: meeting title (contenteditable — textContent prevents XSS)
                    const tdTitle = document.createElement("td")
                    const titleDiv = document.createElement("div")
                    titleDiv.contentEditable = "true"
                    titleDiv.className = "meeting-title"
                    titleDiv.dataset.index = String(i)
                    titleDiv.title = "Rename"
                    titleDiv.setAttribute("role", "textbox")
                    titleDiv.setAttribute("aria-label", `Rename meeting title: ${meeting.title || "Google Meet call"}`)
                    titleDiv.textContent = meeting.title || "Google Meet call"
                    tdTitle.appendChild(titleDiv)
                    row.appendChild(tdTitle)

                    // Col 2: meeting software
                    const tdSoftware = document.createElement("td")
                    tdSoftware.textContent = meeting.software || ""
                    row.appendChild(tdSoftware)

                    // Col 3: timestamp · duration
                    const tdTime = document.createElement("td")
                    tdTime.textContent = `${timestamp}  ●  ${durationString}`
                    row.appendChild(tdTime)

                    // Col 4: webhook status badge
                    const tdStatus = document.createElement("td")
                    const badge = document.createElement("span")
                    badge.className = "badge"
                    switch (meeting.webhookPostStatus) {
                        case "successful":
                            badge.classList.add("status-success")
                            badge.textContent = "Successful"
                            break
                        case "failed":
                            badge.classList.add("status-failed")
                            badge.textContent = "Failed"
                            break
                        case "new":
                            badge.classList.add("status-new")
                            badge.textContent = "New"
                            break
                        default:
                            badge.classList.add("status-new")
                            badge.textContent = "Pending"
                    }
                    tdStatus.appendChild(badge)
                    row.appendChild(tdStatus)

                    // Col 5: action buttons
                    const tdActions = document.createElement("td")
                    const actionsDiv = document.createElement("div")
                    actionsDiv.style.cssText = "display: flex; gap: 1rem; justify-content: end"

                    const downloadButton = document.createElement("button")
                    downloadButton.className = "download-button"
                    downloadButton.dataset.index = String(i)
                    downloadButton.title = "Download"
                    downloadButton.setAttribute("aria-label", "Download this meeting transcript")
                    const downloadImg = document.createElement("img")
                    downloadImg.src = "./icons/download.svg"
                    downloadImg.alt = ""
                    downloadButton.appendChild(downloadImg)

                    const webhookPostButton = document.createElement("button")
                    webhookPostButton.className = "post-button"
                    webhookPostButton.dataset.index = String(i)
                    webhookPostButton.title = meeting.webhookPostStatus === "new" ? "Post webhook" : "Repost webhook"
                    webhookPostButton.setAttribute("aria-label", webhookPostButton.title)
                    const postImg = document.createElement("img")
                    postImg.src = "./icons/webhook.svg"
                    postImg.alt = ""
                    webhookPostButton.appendChild(postImg)

                    const deleteButton = document.createElement("button")
                    deleteButton.className = "delete-button"
                    deleteButton.dataset.index = String(i)
                    deleteButton.title = "Delete"
                    deleteButton.setAttribute("aria-label", "Delete this meeting")
                    const deleteImg = document.createElement("img")
                    deleteImg.src = "./icons/delete.svg"
                    deleteImg.alt = ""
                    deleteButton.appendChild(deleteImg)

                    actionsDiv.appendChild(downloadButton)
                    actionsDiv.appendChild(webhookPostButton)
                    actionsDiv.appendChild(deleteButton)
                    tdActions.appendChild(actionsDiv)
                    row.appendChild(tdActions)

                    meetingsTable.appendChild(row)

                    // Meeting title rename
                    titleDiv.addEventListener("blur", function () {
                        const updatedMeeting = /** @type {Meeting} */ {
                            ...meeting,
                            title: titleDiv.innerText
                        }
                        meetings[i] = updatedMeeting
                        chrome.storage.local.set({ meetings: meetings }, function () {
                            console.log("Meeting title updated")
                        })
                    })

                    // Download transcript
                    downloadButton.addEventListener("click", function () {
                        /** @type {ExtensionMessage} */
                        const message = {
                            v: 1, // keep in sync with PROTOCOL_VERSION in src/shared/protocol.ts
                            type: "download_transcript_at_index",
                            index: i
                        }
                        chrome.runtime.sendMessage(message, (responseUntyped) => {
                            const response = /** @type {ExtensionResponse} */ (responseUntyped)
                            if (!response.success) {
                                showToast("Could not download transcript.", 'error')
                                const parsedError = /** @type {ErrorObject} */ (response.message)
                                if (typeof parsedError === 'object') {
                                    console.error(parsedError.errorMessage)
                                }
                            }
                        })
                    })

                    // Post webhook
                    webhookPostButton.addEventListener("click", function () {
                        chrome.storage.sync.get(["webhookUrl"], function (resultSyncUntyped) {
                            const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
                            if (resultSync.webhookUrl) {
                                // Request runtime permission for the webhook URL. Needed for cases when user signs on a new browser—webhook URL and other sync variables are available, but runtime permissions will be missing.
                                requestWebhookAndNotificationPermission(resultSync.webhookUrl).then(() => {
                                    webhookPostButton.disabled = true
                                    webhookPostButton.textContent = meeting.webhookPostStatus === "new" ? "Posting..." : "Reposting..."

                                    /** @type {ExtensionMessage} */
                                    const message = {
                                        v: 1, // keep in sync with PROTOCOL_VERSION in src/shared/protocol.ts
                                        type: "post_webhook_at_index",
                                        index: i
                                    }
                                    chrome.runtime.sendMessage(message, (responseUntyped) => {
                                        const response = /** @type {ExtensionResponse} */ (responseUntyped)
                                        loadMeetings()
                                        if (response.success) {
                                            showToast("Posted successfully!", 'success')
                                        }
                                        else {
                                            const parsedError = /** @type {ErrorObject} */ (response.message)
                                            if (typeof parsedError === 'object') {
                                                console.error(parsedError.errorMessage)
                                            }
                                            showToast("Failed to post webhook.", 'error')
                                        }
                                    })
                                }).catch((error) => {
                                    showToast("Webhook permission required. Configure your URL again to retry.", 'error')
                                    console.error("Webhook permission error:", error)
                                })
                            }
                            else {
                                showToast("Please configure a webhook URL first.", 'info')
                            }
                        })
                    })

                    // Delete meeting
                    deleteButton.addEventListener("click", function () {
                        showConfirm(`Delete "${meeting.title || "Google Meet call"}"?`, () => {
                            meetings.splice(i, 1)
                            chrome.storage.local.set({ meetings: meetings }, function () {
                                loadMeetings()
                            })
                        })
                    })
                }
                const meetingsTableContainer = document.querySelector("#meetings-table-container")
                if (!isMeetingsTableExpanded && meetingsTableContainer && (meetingsTableContainer.clientHeight > 280)) {
                    meetingsTableContainer?.classList.add("fade-mask")
                    document.querySelector("#show-all")?.setAttribute("style", "display: block")
                }
            }
            else {
                meetingsTable.innerHTML = `<tr><td colspan="5" style="color: var(--text-2); text-align: center; padding: 2rem;">Your next meeting will appear here</td></tr>`
            }
        }
    })
}

// Format duration between two timestamps, specified in milliseconds elapsed since the epoch
/**
 * @param {string} startTimestamp - ISO timestamp
 * @param {string} endTimestamp - ISO timestamp
 */
function getDuration(startTimestamp, endTimestamp) {
    const duration = new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime()
    const durationMinutes = Math.round(duration / (1000 * 60))
    const durationHours = Math.floor(durationMinutes / 60)
    const remainingMinutes = durationMinutes % 60
    return durationHours > 0
        ? `${durationHours}h ${remainingMinutes}m`
        : `${durationMinutes}m`
}