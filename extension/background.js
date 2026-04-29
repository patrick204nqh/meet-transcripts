// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />

/** @type {Intl.DateTimeFormatOptions} */
const timeFormat = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
}

/**
 * @param {"local"|"sync"} area
 * @param {string[]} keys
 */
function chromeGet(area, keys) {
    return new Promise(resolve => chrome.storage[area].get(keys, resolve))
}

const PLATFORM_CONFIGS = {
    "google_meet": {
        id: "content-google-meet",
        js: ["content-google-meet.js"],
        matches: ["https://meet.google.com/*"],
        excludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"]
    }
}


chrome.runtime.onMessage.addListener(function (messageUnTyped, sender, sendResponse) {
    if (sender.id !== chrome.runtime.id) return

    const message = /** @type {ExtensionMessage} */ (messageUnTyped)
    console.log(message.type)

    if (message.type === "new_meeting_started") {
        // Saving current tab id, to download transcript when this tab is closed
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tabId = tabs[0]?.id
            if (tabId === undefined) return
            chrome.storage.local.set({ meetingTabId: tabId }, function () {
                console.log("Meeting tab id saved")
            })
        })
        chrome.action.setBadgeText({ text: "REC" })
        chrome.action.setBadgeBackgroundColor({ color: "#c0392b" })
    }

    if (message.type === "meeting_ended") {
        // Prevents double downloading of transcript from tab closed event listener. Also prevents available update from being applied, during meeting post processing.
        chrome.storage.local.set({ meetingTabId: "processing" }, function () {
            console.log("Meeting tab id set to processing meeting")

            processLastMeeting()
                .then(() => {
                    /** @type {ExtensionResponse} */
                    const response = { success: true }
                    sendResponse(response)
                })
                .catch((error) => {
                    // Fails with error codes: 009, 010, 011, 012, 013, 014
                    const parsedError = /** @type {ErrorObject} */ (error)

                    /** @type {ExtensionResponse} */
                    const response = { success: false, message: parsedError }
                    sendResponse(response)
                })
                .finally(() => {
                    clearTabIdAndApplyUpdate()
                })
        })
    }

    if (message.type === "download_transcript_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Download the requested item
            downloadTranscript(message.index, false)
                .then(() => {
                    /** @type {ExtensionResponse} */
                    const response = { success: true }
                    sendResponse(response)
                })
                .catch((error) => {
                    // Fails with error codes: 009, 010
                    const parsedError = /** @type {ErrorObject} */ (error)

                    /** @type {ExtensionResponse} */
                    const response = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            /** @type {ExtensionResponse} */
            const response = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "post_webhook_at_index") {
        if ((typeof message.index === "number") && (message.index >= 0)) {
            // Handle webhook retry
            postTranscriptToWebhook(message.index)
                .then(() => {
                    /** @type {ExtensionResponse} */
                    const response = { success: true }
                    sendResponse(response)
                })
                .catch(error => {
                    // Fails with error codes: 009, 010, 011, 012
                    const parsedError = /** @type {ErrorObject} */ (error)

                    console.error("Webhook retry failed:", parsedError)
                    /** @type {ExtensionResponse} */
                    const response = { success: false, message: parsedError }
                    sendResponse(response)
                })
        }
        else {
            /** @type {ExtensionResponse} */
            const response = { success: false, message: { errorCode: "015", errorMessage: "Invalid index" } }
            sendResponse(response)
        }
    }

    if (message.type === "recover_last_meeting") {
        recoverLastMeeting().then((message) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: message }
            sendResponse(response)
        })
            .catch((error) => {
                // Fails with error codes: 009, 010, 011, 012, 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)

                /** @type {ExtensionResponse} */
                const response = { success: false, message: parsedError }
                sendResponse(response)
            })
    }

    if (message.type === "open_popup") {
        /** @type {Platform} */

        openExtensionPopup().then((message) => {
            /** @type {ExtensionResponse} */
            const response = { success: true, message: message }
            sendResponse(response)
        }).catch((error) => {
            const parsedError = /** @type {ErrorObject} */ (error)

            /** @type {ExtensionResponse} */
            const response = { success: false, message: parsedError }
            sendResponse(response)
        })
    }



    return true
})

// Download last meeting if meeting tab is closed
chrome.tabs.onRemoved.addListener(function (tabId) {
    chrome.storage.local.get(["meetingTabId"], function (resultLocalUntyped) {
        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

        if (tabId === resultLocal.meetingTabId) {
            console.log("Successfully intercepted tab close")

            // Prevent misfires of onRemoved until next meeting. Also prevents available update from being applied, during meeting post processing.
            chrome.storage.local.set({ meetingTabId: "processing" }, function () {
                console.log("Meeting tab id set to processing meeting")

                processLastMeeting().finally(() => {
                    clearTabIdAndApplyUpdate()
                })
            })
        }
    })
})

// Listen for extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
    // Check if there is an active meeting
    chrome.storage.local.get(["meetingTabId"], function (resultUntyped) {
        const result = /** @type {ResultLocal} */ (resultUntyped)

        if (result.meetingTabId) {
            // There is an active meeting(values: tabId or processing), defer the update
            chrome.storage.local.set({ isDeferredUpdatedAvailable: true }, function () {
                console.log("Deferred update flag set")
            })
        } else {
            // No active meeting, apply the update immediately. Meeting tab id is nullified only post meeting operations are done, so no race conditions.
            console.log("No active meeting, applying update immediately")
            chrome.runtime.reload()
        }
    })
})

chrome.permissions.onAdded.addListener(() => {
    setTimeout(() => {
        reRegisterContentScripts()
    }, 2000)
})


chrome.runtime.onInstalled.addListener(() => {
    // Re-register content scripts whenever extension is installed or updated, provided permissions are available. Suppress notification for silent background operation.
    reRegisterContentScripts()

    // Set defaults values
    chrome.storage.sync.get(["autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting", "operationMode", "webhookBodyType", "webhookUrl"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

        chrome.storage.sync.set({
            autoPostWebhookAfterMeeting: resultSync.autoPostWebhookAfterMeeting === false ? false : true,
            autoDownloadFileAfterMeeting: resultSync.autoDownloadFileAfterMeeting === false ? false : true,
            operationMode: resultSync.operationMode === "manual" ? "manual" : "auto",
            webhookBodyType: resultSync.webhookBodyType === "advanced" ? "advanced" : "simple"
        }, function () { })
    })
})

// Download transcripts, post webhook if URL is enabled and available
// Fails if transcript is empty or webhook request fails or if no meetings in storage
/** @throws error codes: 009, 010, 011, 012, 013, 014 */
function processLastMeeting() {
    return new Promise((resolve, reject) => {
        pickupLastMeetingFromStorage()
            .then(() => {
                chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                    const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
                    chrome.storage.sync.get(["webhookUrl", "autoPostWebhookAfterMeeting", "autoDownloadFileAfterMeeting"], function (resultSyncUntyped) {
                        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)

                        // Create an array of promises to execute in parallel
                        /** @type {Promise<any>[]} */
                        const promises = []

                        // Meeting index to download and post webhook
                        // @ts-ignore - Because this line exists in the resolved promise from pickupLastMeetingFromStorage, which clearly means that at least one meeting exists and resultLocal.meetings cannot be undefined.
                        const lastIndex = resultLocal.meetings.length - 1

                        // Promise to download transcript
                        if (resultSync.autoDownloadFileAfterMeeting) {
                            promises.push(
                                downloadTranscript(
                                    lastIndex,
                                    resultSync.webhookUrl && resultSync.autoPostWebhookAfterMeeting ? true : false
                                )
                            )
                        }

                        // Promise to post webhook if enabled
                        if (resultSync.autoPostWebhookAfterMeeting && resultSync.webhookUrl) {
                            promises.push(postTranscriptToWebhook(lastIndex))
                        }

                        // Execute all promises in parallel
                        Promise.all(promises)
                            .then(() => {
                                resolve("Meeting processing and download/webhook posting complete")
                            })
                            .catch(error => {
                                // Fails with error codes: 009, 010, 011, 012
                                const parsedError = /** @type {ErrorObject} */ (error)
                                console.error("Operation failed:", parsedError.errorMessage)
                                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
                            })
                    })
                })
            })
            .catch((error) => {
                // Fails with error codes: 013, 014
                const parsedError = /** @type {ErrorObject} */ (error)
                reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
            })
    })
}

/**
 * @throws error codes: 013, 014
 */
// Process transcript and chat messages of the meeting that just ended from storage, format them into strings, and save as a new entry in meetings (keeping last 10)
function pickupLastMeetingFromStorage() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get([
            "meetingSoftware",
            "meetingTitle",
            "meetingStartTimestamp",
            "transcript",
            "chatMessages",
        ], function (resultUntyped) {
            const result = /** @type {ResultLocal} */ (resultUntyped)

            if (result.meetingStartTimestamp) {
                if ((result.transcript.length > 0) || (result.chatMessages.length > 0)) {
                    // Create new transcript entry
                    /** @type {Meeting} */
                    const newMeetingEntry = {
                        meetingSoftware: result.meetingSoftware ? result.meetingSoftware : "",
                        meetingTitle: result.meetingTitle,
                        meetingStartTimestamp: result.meetingStartTimestamp,
                        meetingEndTimestamp: new Date().toISOString(),
                        transcript: result.transcript,
                        chatMessages: result.chatMessages,
                        webhookPostStatus: "new"
                    }

                    // Get existing recent meetings and add the new meeting
                    chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
                        const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
                        let meetings = resultLocal.meetings || []
                        meetings.push(newMeetingEntry)

                        // Keep only last 10 transcripts
                        if (meetings.length > 10) {
                            meetings = meetings.slice(-10)
                        }

                        // Save updated recent transcripts
                        chrome.storage.local.set({ meetings: meetings }, function () {
                            console.log("Last meeting picked up")
                            resolve("Last meeting picked up")
                        })
                    })
                }
                else {
                    reject({ errorCode: "014", errorMessage: "Empty transcript and empty chatMessages" })
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" })
            }
        })
    })
}



/**
 * @param {number} index
 * @param {boolean} isWebhookEnabled
 * @throws error codes: 009, 010
 */
function downloadTranscript(index, isWebhookEnabled) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.meetings && resultLocal.meetings[index]) {
                const meeting = resultLocal.meetings[index]

                // Sanitise meeting title to prevent invalid file name errors
                // https://stackoverflow.com/a/78675894
                const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/gui
                let sanitisedMeetingTitle = "Meeting"
                if (meeting.meetingTitle) {
                    sanitisedMeetingTitle = meeting.meetingTitle.replaceAll(invalidFilenameRegex, "_")
                }
                else if (meeting.title) {
                    sanitisedMeetingTitle = meeting.title.replaceAll(invalidFilenameRegex, "_")
                }

                // Format timestamp for human-readable filename and sanitise to prevent invalid filenames
                const timestamp = new Date(meeting.meetingStartTimestamp)
                const formattedTimestamp = timestamp.toLocaleString("default", timeFormat).replace(/[\/:]/g, "-")

                const prefix = meeting.meetingSoftware ? `${meeting.meetingSoftware} transcript` : "Transcript"

                const fileName = `meet-transcripts/${prefix}-${sanitisedMeetingTitle} at ${formattedTimestamp} on.txt`


                // Format transcript and chatMessages content
                let content = getTranscriptString(meeting.transcript)
                content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`
                content += getChatMessagesString(meeting.chatMessages)

                // Add branding
                content += "\n\n---------------\n"
                content += "Transcript saved using meet-transcripts (https://github.com/patrick204nqh/meet-transcripts)"
                content += "\n---------------"

                const blob = new Blob([content], { type: "text/plain" })

                // Read the blob as a data URL
                const reader = new FileReader()

                // Read the blob
                reader.readAsDataURL(blob)

                // Download as text file, once blob is read
                reader.onload = function (event) {
                    if (event.target?.result) {
                        const dataUrl = event.target.result

                        // Create a download with Chrome Download API
                        chrome.downloads.download({
                            // @ts-ignore
                            url: dataUrl,
                            filename: fileName,
                            conflictAction: "uniquify"
                        }).then(() => {
                            console.log("Transcript downloaded")
                            resolve("Transcript downloaded successfully")
                        }).catch((err) => {
                            console.error(err)
                            chrome.downloads.download({
                                // @ts-ignore
                                url: dataUrl,
                                filename: "meet-transcripts/Transcript.txt",
                                conflictAction: "uniquify"
                            })
                            console.log("Invalid file name. Transcript downloaded to meet-transcripts directory with simple file name.")
                            resolve("Transcript downloaded successfully with default file name")
                        })
                    }
                    else {
                        reject({ errorCode: "009", errorMessage: "Failed to read blob" })
                    }
                }
            }
            else {
                reject({ errorCode: "010", errorMessage: "Meeting at specified index not found" })
            }
        })
    })
}

/**
 * @param {number} index
 * @throws error code: 010, 011, 012, 016
 */
async function postTranscriptToWebhook(index) {
    const resultLocal = /** @type {ResultLocal} */ (await chromeGet("local", ["meetings"]))
    const resultSync = /** @type {ResultSync} */ (await chromeGet("sync", ["webhookUrl", "webhookBodyType"]))

    if (!resultSync.webhookUrl) {
        throw { errorCode: "012", errorMessage: "No webhook URL configured" }
    }
    if (!resultLocal.meetings || !resultLocal.meetings[index]) {
        throw { errorCode: "010", errorMessage: "Meeting at specified index not found" }
    }

    // Verify host permission exists — URL may have synced from another device.
    const urlObj = new URL(resultSync.webhookUrl)
    const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`
    const hasPermission = await new Promise(res =>
        chrome.permissions.contains({ origins: [originPattern] }, res)
    )
    if (!hasPermission) {
        throw { errorCode: "016", errorMessage: "No host permission for webhook URL. Re-save the webhook URL to grant permission." }
    }

    const meeting = resultLocal.meetings[index]
    /** @type {WebhookBody} */
    const webhookData = resultSync.webhookBodyType === "advanced"
        ? {
            webhookBodyType: "advanced",
            meetingSoftware: meeting.meetingSoftware || "",
            meetingTitle: meeting.meetingTitle || meeting.title || "",
            meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toISOString(),
            meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toISOString(),
            transcript: meeting.transcript,
            chatMessages: meeting.chatMessages
        }
        : {
            webhookBodyType: "simple",
            meetingSoftware: meeting.meetingSoftware || "",
            meetingTitle: meeting.meetingTitle || meeting.title || "",
            meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
            meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
            transcript: getTranscriptString(meeting.transcript),
            chatMessages: getChatMessagesString(meeting.chatMessages)
        }

    const response = await fetch(resultSync.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookData)
    }).catch(error => { throw { errorCode: "011", errorMessage: error } })

    if (!response.ok) {
        // Update failure status and notify
        resultLocal.meetings[index].webhookPostStatus = "failed"
        await new Promise(res => chrome.storage.local.set({ meetings: resultLocal.meetings }, res))
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Could not post webhook!",
            message: `HTTP ${response.status} ${response.statusText}. Click to view and retry.`
        }, function (notificationId) {
            chrome.notifications.onClicked.addListener(function (clickedNotificationId) {
                if (clickedNotificationId === notificationId) {
                    chrome.tabs.create({ url: "meetings.html" })
                }
            })
        })
        throw { errorCode: "011", errorMessage: `HTTP ${response.status} ${response.statusText}` }
    }

    resultLocal.meetings[index].webhookPostStatus = "successful"
    await new Promise(res => chrome.storage.local.set({ meetings: resultLocal.meetings }, res))
    return "Webhook posted successfully"
}


/**
 * Format transcript entries into string
 * @param {TranscriptBlock[] | []} transcript
 */
function getTranscriptString(transcript) {
    let transcriptString = ""
    if (transcript.length > 0) {
        transcript.forEach(transcriptBlock => {
            transcriptString += `${transcriptBlock.personName} (${new Date(transcriptBlock.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n`
            transcriptString += transcriptBlock.transcriptText
            transcriptString += "\n\n"
        })
        return transcriptString
    }
    return transcriptString
}


/**
 * Format chat messages into string
 * @param {ChatMessage[] | []} chatMessages
 */
function getChatMessagesString(chatMessages) {
    let chatMessagesString = ""
    if (chatMessages.length > 0) {
        chatMessages.forEach(chatMessage => {
            chatMessagesString += `${chatMessage.personName} (${new Date(chatMessage.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n`
            chatMessagesString += chatMessage.chatMessageText
            chatMessagesString += "\n\n"
        })
    }
    return chatMessagesString
}

function clearTabIdAndApplyUpdate() {
    chrome.action.setBadgeText({ text: "" })
    // Nullify to indicate end of meeting processing
    chrome.storage.local.set({ meetingTabId: null }, function () {
        console.log("Meeting tab id cleared for next meeting")

        // Check if there's a deferred update
        chrome.storage.local.get(["isDeferredUpdatedAvailable"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)

            if (resultLocal.isDeferredUpdatedAvailable) {
                console.log("Applying deferred update")
                chrome.storage.local.set({ isDeferredUpdatedAvailable: false }, function () {
                    chrome.runtime.reload()
                })
            }
        })
    })
}

/** @throws error codes: 009, 010, 011, 012, 013, 014 */
function recoverLastMeeting() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["meetings", "meetingStartTimestamp"], function (resultLocalUntyped) {
            const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
            // Check if user ever attended a meeting
            if (resultLocal.meetingStartTimestamp) {
                /** @type {Meeting | undefined} */
                let lastSavedMeeting
                if ((resultLocal.meetings) && (resultLocal.meetings.length > 0)) {
                    lastSavedMeeting = resultLocal.meetings[resultLocal.meetings.length - 1]
                }

                // Last meeting was not processed for some reason. Need to recover that data, process and download it.
                if ((!lastSavedMeeting) || (resultLocal.meetingStartTimestamp !== lastSavedMeeting.meetingStartTimestamp)) {
                    processLastMeeting().then(() => {
                        resolve("Recovered last meeting to the best possible extent")
                    }).catch((error) => {
                        // Fails with error codes: 009, 010, 011, 013, 014
                        const parsedError = /** @type {ErrorObject} */ (error)
                        reject({ errorCode: parsedError.errorCode, errorMessage: parsedError.errorMessage })
                    })
                }
                else {
                    resolve("No recovery needed")
                }
            }
            else {
                reject({ errorCode: "013", errorMessage: "No meetings found. May be attend one?" })
            }
        })
    })
}

/**
 * @param {Platform} platform
 */
function registerContentScript(platform, showNotification = true) {
    return new Promise((resolve, reject) => {
        const config = PLATFORM_CONFIGS[platform]

        chrome.permissions.contains({ origins: config.matches }).then((hasPermission) => {
            if (hasPermission) {
                chrome.scripting
                    .getRegisteredContentScripts()
                    .then((scripts) => {
                        let isRegistered = scripts.some(s => s.id === config.id)

                        if (isRegistered) {
                            console.log(`${platform} content script already registered`)
                            resolve(`Content script already registered`)
                        } else {
                            chrome.scripting.registerContentScripts([{
                                id: config.id,
                                js: config.js,
                                matches: config.matches,
                                excludeMatches: config.excludeMatches,
                                runAt: "document_end",
                            }])
                                .then(() => {
                                    console.log(`${platform} content script registered successfully.`)

                                    if (showNotification) {
                                        chrome.permissions.contains({
                                            permissions: ["notifications"]
                                        }).then((hasNotifyPermission) => {
                                            if (hasNotifyPermission) {
                                                chrome.notifications.create({
                                                    type: "basic",
                                                    iconUrl: "icon.png",
                                                    title: "Enabled!",
                                                    message: "Refresh any existing meeting pages"
                                                })
                                            }
                                        })
                                    }
                                    resolve(`Content script registered`)
                                })
                                .catch((error) => {
                                    console.error(`${platform} registration failed.`, error)
                                    reject(`Failed to register content script`)
                                })
                        }
                    })
            } else {
                reject(`Insufficient permissions`)
            }
        })
    })
}

function reRegisterContentScripts() {
    registerContentScript("google_meet", false)
        .catch((error) => {
            console.log(error)
        })
}

/**
 * Opens the extension popup programmatically.
 */
function openExtensionPopup() {
    return new Promise((resolve, reject) => {
        chrome.action.openPopup()
            .then(() => {
                console.log("Popup opened successfully")
                resolve("Popup opened")
            })
            .catch((error) => {
                console.error("Failed to open popup:", error)
                reject("Failed to open popup")
            })
    })
}