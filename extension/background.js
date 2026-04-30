(function() {
	//#region src/shared/errors.ts
	var ErrorCode = {
		BLOB_READ_FAILED: "009",
		MEETING_NOT_FOUND: "010",
		WEBHOOK_REQUEST_FAILED: "011",
		NO_WEBHOOK_URL: "012",
		NO_MEETINGS: "013",
		EMPTY_TRANSCRIPT: "014",
		INVALID_INDEX: "015",
		NO_HOST_PERMISSION: "016",
		POPUP_OPEN_FAILED: "017"
	};
	//#endregion
	//#region src/shared/logger.ts
	var PREFIX = "[meet-transcripts]";
	var log = {
		debug: (...a) => {},
		info: (...a) => {
			console.info(PREFIX, ...a);
		},
		warn: (...a) => {
			console.warn(PREFIX, ...a);
		},
		error: (...a) => {
			console.error(PREFIX, ...a);
		}
	};
	//#endregion
	//#region src/shared/storage-repo.ts
	function migrateTranscriptBlock(raw) {
		return {
			personName: raw.personName,
			timestamp: raw.timestamp,
			text: raw.text ?? raw.transcriptText ?? ""
		};
	}
	function migrateChatMessage(raw) {
		return {
			personName: raw.personName,
			timestamp: raw.timestamp,
			text: raw.text ?? raw.chatMessageText ?? ""
		};
	}
	function migrateMeeting(raw) {
		return {
			software: raw.software ?? raw.meetingSoftware,
			title: raw.title ?? raw.meetingTitle,
			startTimestamp: raw.startTimestamp ?? raw.meetingStartTimestamp,
			endTimestamp: raw.endTimestamp ?? raw.meetingEndTimestamp,
			transcript: (raw.transcript ?? []).map(migrateTranscriptBlock),
			chatMessages: (raw.chatMessages ?? []).map(migrateChatMessage),
			webhookPostStatus: raw.webhookPostStatus ?? "new"
		};
	}
	var StorageLocal = {
		getMeetings: async () => {
			return ((await chrome.storage.local.get(["meetings"])).meetings ?? []).map(migrateMeeting);
		},
		setMeetings: (meetings) => chrome.storage.local.set({ meetings }),
		getMeetingTabId: async () => {
			return (await chrome.storage.local.get(["meetingTabId"])).meetingTabId ?? null;
		},
		setMeetingTabId: (id) => chrome.storage.local.set({ meetingTabId: id }),
		getCurrentMeetingData: async () => {
			const raw = await chrome.storage.local.get([
				"software",
				"title",
				"startTimestamp",
				"transcript",
				"chatMessages",
				"meetingSoftware",
				"meetingTitle",
				"meetingStartTimestamp"
			]);
			return {
				software: raw.software ?? raw.meetingSoftware,
				title: raw.title ?? raw.meetingTitle,
				startTimestamp: raw.startTimestamp ?? raw.meetingStartTimestamp,
				transcript: raw.transcript,
				chatMessages: raw.chatMessages
			};
		},
		setCurrentMeetingData: (data) => chrome.storage.local.set(data),
		getDeferredUpdatePending: async () => {
			return !!(await chrome.storage.local.get(["deferredUpdatePending"])).deferredUpdatePending;
		},
		setDeferredUpdatePending: (value) => chrome.storage.local.set({ deferredUpdatePending: value })
	};
	var StorageSync = {
		getSettings: async () => {
			return await chrome.storage.sync.get([
				"autoPostWebhookAfterMeeting",
				"autoDownloadFileAfterMeeting",
				"operationMode",
				"webhookBodyType",
				"webhookUrl"
			]);
		},
		setSettings: (settings) => chrome.storage.sync.set(settings),
		getWebhookSettings: async () => {
			return await chrome.storage.sync.get(["webhookUrl", "webhookBodyType"]);
		},
		getAutoActionSettings: async () => {
			return await chrome.storage.sync.get([
				"webhookUrl",
				"autoPostWebhookAfterMeeting",
				"autoDownloadFileAfterMeeting"
			]);
		}
	};
	//#endregion
	//#region src/shared/formatters.ts
	var timeFormat = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true
	};
	function getTranscriptString(transcript) {
		if (transcript.length === 0) return "";
		return transcript.map((block) => `${block.personName} (${new Date(block.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${block.text}\n\n`).join("");
	}
	function getChatMessagesString(chatMessages) {
		if (chatMessages.length === 0) return "";
		return chatMessages.map((msg) => `${msg.personName} (${new Date(msg.timestamp).toLocaleString("default", timeFormat).toUpperCase()})\n${msg.text}\n\n`).join("");
	}
	function buildTranscriptFilename(meeting) {
		const sanitisedTitle = meeting.title ? meeting.title.replaceAll(/[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/giu, "_") : "Meeting";
		const formattedTimestamp = new Date(meeting.startTimestamp).toLocaleString("default", timeFormat).replace(/[/:]/g, "-");
		return `meet-transcripts/${meeting.software ? `${meeting.software} transcript` : "Transcript"}-${sanitisedTitle} at ${formattedTimestamp} on.txt`;
	}
	function buildWebhookBody(meeting, bodyType) {
		if (bodyType === "advanced") return {
			webhookBodyType: "advanced",
			software: meeting.software || "",
			title: meeting.title || "",
			startTimestamp: new Date(meeting.startTimestamp).toISOString(),
			endTimestamp: new Date(meeting.endTimestamp).toISOString(),
			transcript: meeting.transcript,
			chatMessages: meeting.chatMessages
		};
		return {
			webhookBodyType: "simple",
			software: meeting.software || "",
			title: meeting.title || "",
			startTimestamp: new Date(meeting.startTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
			endTimestamp: new Date(meeting.endTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
			transcript: getTranscriptString(meeting.transcript),
			chatMessages: getChatMessagesString(meeting.chatMessages)
		};
	}
	//#endregion
	//#region src/background/download.ts
	async function downloadTranscript(index) {
		const meetings = await StorageLocal.getMeetings();
		if (!meetings[index]) throw {
			errorCode: ErrorCode.MEETING_NOT_FOUND,
			errorMessage: "Meeting at specified index not found"
		};
		const meeting = meetings[index];
		const fileName = buildTranscriptFilename(meeting);
		let content = getTranscriptString(meeting.transcript);
		content += `\n\n---------------\nCHAT MESSAGES\n---------------\n\n`;
		content += getChatMessagesString(meeting.chatMessages);
		content += "\n\n---------------\n";
		content += "Transcript saved using meet-transcripts (https://github.com/patrick204nqh/meet-transcripts)";
		content += "\n---------------";
		await new Promise((resolve, reject) => {
			const blob = new Blob([content], { type: "text/plain" });
			const reader = new FileReader();
			reader.readAsDataURL(blob);
			reader.onload = (event) => {
				if (!event.target?.result) {
					reject({
						errorCode: ErrorCode.BLOB_READ_FAILED,
						errorMessage: "Failed to read blob"
					});
					return;
				}
				const dataUrl = event.target.result;
				chrome.downloads.download({
					url: dataUrl,
					filename: fileName,
					conflictAction: "uniquify"
				}).then(() => resolve()).catch(() => {
					chrome.downloads.download({
						url: dataUrl,
						filename: "meet-transcripts/Transcript.txt",
						conflictAction: "uniquify"
					});
					resolve();
				});
			};
		});
	}
	//#endregion
	//#region src/services/download.ts
	var DownloadService = {
		downloadTranscript: async (index) => downloadTranscript(index),
		formatTranscript: (meeting) => getTranscriptString(meeting.transcript),
		formatChatMessages: (meeting) => getChatMessagesString(meeting.chatMessages),
		getMeeting: async (index) => {
			const meeting = (await StorageLocal.getMeetings())[index];
			if (!meeting) throw {
				errorCode: ErrorCode.MEETING_NOT_FOUND,
				errorMessage: "Meeting at specified index not found"
			};
			return meeting;
		}
	};
	//#endregion
	//#region src/background/webhook.ts
	var notificationClickTargets = /* @__PURE__ */ new Set();
	function registerNotificationClickListener() {
		if (!chrome.notifications?.onClicked) return;
		chrome.notifications.onClicked.addListener((notificationId) => {
			if (notificationClickTargets.has(notificationId)) {
				notificationClickTargets.delete(notificationId);
				chrome.tabs.create({ url: "meetings.html" });
			}
		});
	}
	chrome.permissions.contains({ permissions: ["notifications"] }, (has) => {
		if (has) registerNotificationClickListener();
	});
	chrome.permissions.onAdded.addListener((permissions) => {
		if (permissions.permissions?.includes("notifications")) registerNotificationClickListener();
	});
	async function postTranscriptToWebhook(index) {
		const [meetings, { webhookUrl, webhookBodyType }] = await Promise.all([StorageLocal.getMeetings(), StorageSync.getWebhookSettings()]);
		if (!webhookUrl) throw {
			errorCode: ErrorCode.NO_WEBHOOK_URL,
			errorMessage: "No webhook URL configured"
		};
		if (!meetings[index]) throw {
			errorCode: ErrorCode.MEETING_NOT_FOUND,
			errorMessage: "Meeting at specified index not found"
		};
		const urlObj = new URL(webhookUrl);
		const originPattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
		if (!await new Promise((res) => chrome.permissions.contains({ origins: [originPattern] }, res))) throw {
			errorCode: ErrorCode.NO_HOST_PERMISSION,
			errorMessage: "No host permission for webhook URL. Re-save the webhook URL to grant permission."
		};
		const meeting = meetings[index];
		const webhookData = buildWebhookBody(meeting, webhookBodyType === "advanced" ? "advanced" : "simple");
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(webhookData)
		}).catch((error) => {
			throw {
				errorCode: ErrorCode.WEBHOOK_REQUEST_FAILED,
				errorMessage: error
			};
		});
		if (!response.ok) {
			const withFailed = meetings.map((m, i) => i === index ? {
				...m,
				webhookPostStatus: "failed"
			} : m);
			await StorageLocal.setMeetings(withFailed);
			chrome.notifications?.create({
				type: "basic",
				iconUrl: "icons/icon-128.png",
				title: "Could not post webhook!",
				message: `HTTP ${response.status} ${response.statusText}. Click to view and retry.`
			}, (notificationId) => {
				notificationClickTargets.add(notificationId);
			});
			throw {
				errorCode: ErrorCode.WEBHOOK_REQUEST_FAILED,
				errorMessage: `HTTP ${response.status} ${response.statusText}`
			};
		}
		const withSuccess = meetings.map((m, i) => i === index ? {
			...m,
			webhookPostStatus: "successful"
		} : m);
		await StorageLocal.setMeetings(withSuccess);
		return "Webhook posted successfully";
	}
	//#endregion
	//#region src/services/webhook.ts
	var WebhookService = { postWebhook: (index) => postTranscriptToWebhook(index) };
	//#endregion
	//#region src/services/meeting.ts
	async function pickupLastMeeting() {
		const data = await StorageLocal.getCurrentMeetingData();
		if (!data.startTimestamp) throw {
			errorCode: ErrorCode.NO_MEETINGS,
			errorMessage: "No meetings found. May be attend one?"
		};
		if (!data.transcript?.length && !data.chatMessages?.length) throw {
			errorCode: ErrorCode.EMPTY_TRANSCRIPT,
			errorMessage: "Empty transcript and empty chatMessages"
		};
		const newEntry = {
			software: data.software,
			title: data.title,
			startTimestamp: data.startTimestamp,
			endTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
			transcript: data.transcript ?? [],
			chatMessages: data.chatMessages ?? [],
			webhookPostStatus: "new"
		};
		const updated = [...await StorageLocal.getMeetings(), newEntry].slice(-10);
		await StorageLocal.setMeetings(updated);
		console.log("Last meeting picked up");
		return "Last meeting picked up";
	}
	async function finalizeMeeting() {
		await pickupLastMeeting();
		const meetings = await StorageLocal.getMeetings();
		const sync = await StorageSync.getAutoActionSettings();
		const lastIndex = meetings.length - 1;
		const promises = [];
		if (sync.autoDownloadFileAfterMeeting) promises.push(DownloadService.downloadTranscript(lastIndex));
		if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) promises.push(WebhookService.postWebhook(lastIndex));
		await Promise.all(promises);
		return "Meeting processing complete";
	}
	async function recoverLastMeeting() {
		const [meetings, data] = await Promise.all([StorageLocal.getMeetings(), StorageLocal.getCurrentMeetingData()]);
		if (!data.startTimestamp) throw {
			errorCode: ErrorCode.NO_MEETINGS,
			errorMessage: "No meetings found. May be attend one?"
		};
		const lastSaved = meetings.length > 0 ? meetings[meetings.length - 1] : void 0;
		if (!lastSaved || data.startTimestamp !== lastSaved.startTimestamp) {
			await finalizeMeeting();
			return "Recovered last meeting to the best possible extent";
		}
		return "No recovery needed";
	}
	var MeetingService = {
		finalizeMeeting,
		recoverMeeting: recoverLastMeeting,
		pickupLastMeeting
	};
	//#endregion
	//#region src/background/lifecycle.ts
	async function clearTabIdAndApplyUpdate() {
		chrome.action.setBadgeText({ text: "" });
		await StorageLocal.setMeetingTabId(null);
		log.info("Meeting tab id cleared for next meeting");
		if (await StorageLocal.getDeferredUpdatePending()) {
			log.info("Applying deferred update");
			await StorageLocal.setDeferredUpdatePending(false);
			chrome.runtime.reload();
		}
	}
	//#endregion
	//#region src/background/content-script.ts
	var PLATFORM_CONFIGS = { google_meet: {
		id: "google-meet",
		js: ["platforms/google-meet.js"],
		matches: ["https://meet.google.com/*"],
		excludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"]
	} };
	function registerContentScript(platform, showNotification = true) {
		return new Promise((resolve, reject) => {
			const config = PLATFORM_CONFIGS[platform];
			chrome.permissions.contains({ origins: config.matches }).then((hasPermission) => {
				if (!hasPermission) {
					reject("Insufficient permissions");
					return;
				}
				chrome.scripting.getRegisteredContentScripts().then((scripts) => {
					if (scripts.some((s) => s.id === config.id)) {
						console.log(`${platform} content script already registered`);
						resolve("Content script already registered");
						return;
					}
					chrome.scripting.registerContentScripts([{
						id: config.id,
						js: config.js,
						matches: config.matches,
						excludeMatches: config.excludeMatches,
						runAt: "document_end"
					}]).then(() => {
						console.log(`${platform} content script registered successfully.`);
						if (showNotification) chrome.permissions.contains({ permissions: ["notifications"] }).then((hasNotifyPermission) => {
							if (hasNotifyPermission && chrome.notifications) chrome.notifications.create({
								type: "basic",
								iconUrl: "icons/icon-128.png",
								title: "Enabled!",
								message: "Refresh any existing meeting pages"
							});
						});
						resolve("Content script registered");
					}).catch((error) => {
						console.error(`${platform} registration failed.`, error);
						reject("Failed to register content script");
					});
				});
			});
		});
	}
	function reRegisterContentScript() {
		registerContentScript("google_meet", false).catch((error) => {
			console.log(error);
		});
	}
	//#endregion
	//#region src/background/event-listeners.ts
	chrome.tabs.onRemoved.addListener((tabId) => {
		StorageLocal.getMeetingTabId().then((id) => {
			if (tabId === id) {
				log.info("Successfully intercepted tab close");
				StorageLocal.setMeetingTabId("processing").then(() => MeetingService.finalizeMeeting().catch((e) => log.error("finalizeMeeting failed on tab close:", e)).finally(() => clearTabIdAndApplyUpdate()));
			}
		});
	});
	var MEET_CALL_URL = /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/;
	/**
	* Handles the case where the meeting tab navigates away from an active call URL.
	* Extracted so it can be invoked both from tabs.onUpdated and from a test message.
	*/
	function handleMeetTabNavigatedAway(tabId, newUrl) {
		StorageLocal.getMeetingTabId().then((id) => {
			if (id === "processing" || id === null || tabId !== id) return;
			if (!MEET_CALL_URL.test(newUrl)) {
				log.info("Meet tab navigated away from call — finalizing meeting");
				StorageLocal.setMeetingTabId("processing").then(() => MeetingService.finalizeMeeting().catch((e) => log.error("finalizeMeeting failed on navigation away:", e)).finally(() => clearTabIdAndApplyUpdate()));
			}
		}).catch(console.error);
	}
	chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
		if (!changeInfo.url) return;
		handleMeetTabNavigatedAway(tabId, changeInfo.url);
	});
	chrome.runtime.onUpdateAvailable.addListener(() => {
		StorageLocal.getMeetingTabId().then((id) => {
			if (id) StorageLocal.setDeferredUpdatePending(true).then(() => log.info("Deferred update flag set"));
			else {
				log.info("No active meeting, applying update immediately");
				chrome.runtime.reload();
			}
		});
	});
	chrome.permissions.onAdded.addListener((permissions) => {
		if (permissions.permissions?.includes("notifications")) {}
		setTimeout(() => reRegisterContentScript(), 2e3);
	});
	chrome.runtime.onInstalled.addListener(() => {
		reRegisterContentScript();
		StorageSync.getSettings().then((sync) => {
			StorageSync.setSettings({
				autoPostWebhookAfterMeeting: sync.autoPostWebhookAfterMeeting !== false,
				autoDownloadFileAfterMeeting: sync.autoDownloadFileAfterMeeting !== false,
				operationMode: sync.operationMode === "manual" ? "manual" : "auto",
				webhookBodyType: sync.webhookBodyType === "advanced" ? "advanced" : "simple"
			});
		});
	});
	//#endregion
	//#region src/background/message-handler.ts
	var ok = {
		success: true,
		data: void 0
	};
	var err = (e) => ({
		success: false,
		error: e
	});
	var invalidIndex = {
		success: false,
		error: {
			errorCode: ErrorCode.INVALID_INDEX,
			errorMessage: "Invalid index"
		}
	};
	var isValidIndex = (i) => typeof i === "number" && i >= 0;
	chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
		if (sender.id !== chrome.runtime.id) return;
		const msg = raw;
		log.debug("message received:", msg.type);
		if (msg.type === "new_meeting_started") {
			if (sender.tab?.id !== void 0) StorageLocal.setMeetingTabId(sender.tab.id).then(() => log.info("Meeting tab id saved")).catch(console.error);
			chrome.action.setBadgeText({ text: "REC" }).catch((e) => log.warn("setBadgeText failed:", e));
			chrome.action.setBadgeBackgroundColor({ color: "#c0392b" }).catch((e) => log.warn("setBadgeBgColor failed:", e));
		}
		if (msg.type === "meeting_ended") {
			StorageLocal.setMeetingTabId("processing").then(() => MeetingService.finalizeMeeting().then(() => sendResponse(ok)).catch((e) => sendResponse(err(e))).finally(() => clearTabIdAndApplyUpdate()));
			return true;
		}
		if (msg.type === "download_transcript_at_index") {
			isValidIndex(msg.index) ? DownloadService.downloadTranscript(msg.index).then(() => sendResponse(ok)).catch((e) => sendResponse(err(e))) : sendResponse(invalidIndex);
			return true;
		}
		if (msg.type === "post_webhook_at_index") {
			isValidIndex(msg.index) ? WebhookService.postWebhook(msg.index).then(() => sendResponse(ok)).catch((e) => {
				console.error("Webhook retry failed:", e);
				sendResponse(err(e));
			}) : sendResponse(invalidIndex);
			return true;
		}
		if (msg.type === "recover_last_meeting") {
			MeetingService.recoverMeeting().then((m) => sendResponse({
				success: true,
				data: m
			})).catch((e) => sendResponse(err(e)));
			return true;
		}
		if (msg.type === "open_popup") {
			chrome.action.openPopup().then(() => sendResponse(ok)).catch((e) => sendResponse({
				success: false,
				error: {
					errorCode: ErrorCode.POPUP_OPEN_FAILED,
					errorMessage: String(e)
				}
			}));
			return true;
		}
		if (msg.type === "simulate_tab_navigated_away") {
			handleMeetTabNavigatedAway(msg.tabId, msg.url);
			sendResponse(ok);
			return true;
		}
		if (msg.type === "get_debug_state") {
			Promise.all([
				StorageLocal.getMeetingTabId(),
				StorageLocal.getMeetings(),
				StorageLocal.getCurrentMeetingData()
			]).then(([meetingTabId, meetings, data]) => {
				sendResponse({
					success: true,
					data: {
						meetingTabId,
						meetingCount: meetings.length,
						hasMeetingData: !!data.startTimestamp,
						lastMeetingStart: data.startTimestamp ?? void 0
					}
				});
			}).catch((e) => sendResponse(err(e)));
			return true;
		}
		return true;
	});
	//#endregion
})();
