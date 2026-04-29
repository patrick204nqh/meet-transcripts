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
		NO_HOST_PERMISSION: "016"
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
			return !!(await chrome.storage.local.get(["isDeferredUpdateAvailable"])).isDeferredUpdateAvailable;
		},
		setDeferredUpdate: (value) => chrome.storage.local.set({ isDeferredUpdateAvailable: value })
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
	//#region src/background/download.ts
	var timeFormat$1 = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true
	};
	function getTranscriptString(transcript) {
		if (transcript.length === 0) return "";
		return transcript.map((block) => `${block.personName} (${new Date(block.timestamp).toLocaleString("default", timeFormat$1).toUpperCase()})\n${block.text}\n\n`).join("");
	}
	function getChatMessagesString(chatMessages) {
		if (chatMessages.length === 0) return "";
		return chatMessages.map((msg) => `${msg.personName} (${new Date(msg.timestamp).toLocaleString("default", timeFormat$1).toUpperCase()})\n${msg.text}\n\n`).join("");
	}
	async function downloadTranscript(index, _isWebhookEnabled) {
		const meetings = await StorageLocal.getMeetings();
		if (!meetings[index]) throw {
			errorCode: ErrorCode.MEETING_NOT_FOUND,
			errorMessage: "Meeting at specified index not found"
		};
		const meeting = meetings[index];
		const invalidFilenameRegex = /[:?"*<>|~/\\\u{1}-\u{1f}\u{7f}\u{80}-\u{9f}\p{Cf}\p{Cn}]|^[.\u{0}\p{Zl}\p{Zp}\p{Zs}]|[.\u{0}\p{Zl}\p{Zp}\p{Zs}]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/giu;
		let sanitisedTitle = "Meeting";
		if (meeting.title) sanitisedTitle = meeting.title.replaceAll(invalidFilenameRegex, "_");
		const formattedTimestamp = new Date(meeting.startTimestamp).toLocaleString("default", timeFormat$1).replace(/[/:]/g, "-");
		const fileName = `meet-transcripts/${meeting.software ? `${meeting.software} transcript` : "Transcript"}-${sanitisedTitle} at ${formattedTimestamp} on.txt`;
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
	//#region src/background/webhook.ts
	var timeFormat = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true
	};
	var notificationClickTargets = /* @__PURE__ */ new Set();
	chrome.notifications.onClicked.addListener((notificationId) => {
		if (notificationClickTargets.has(notificationId)) {
			notificationClickTargets.delete(notificationId);
			chrome.tabs.create({ url: "meetings.html" });
		}
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
		const webhookData = (webhookBodyType === "advanced" ? "advanced" : "simple") === "advanced" ? {
			webhookBodyType: "advanced",
			software: meeting.software || "",
			title: meeting.title || "",
			startTimestamp: new Date(meeting.startTimestamp).toISOString(),
			endTimestamp: new Date(meeting.endTimestamp).toISOString(),
			transcript: meeting.transcript,
			chatMessages: meeting.chatMessages
		} : {
			webhookBodyType: "simple",
			software: meeting.software || "",
			title: meeting.title || "",
			startTimestamp: new Date(meeting.startTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
			endTimestamp: new Date(meeting.endTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
			transcript: getTranscriptString(meeting.transcript),
			chatMessages: getChatMessagesString(meeting.chatMessages)
		};
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
			meetings[index].webhookPostStatus = "failed";
			await StorageLocal.setMeetings(meetings);
			chrome.notifications.create({
				type: "basic",
				iconUrl: "icon.png",
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
		meetings[index].webhookPostStatus = "successful";
		await StorageLocal.setMeetings(meetings);
		return "Webhook posted successfully";
	}
	//#endregion
	//#region src/background/meeting-storage.ts
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
			software: data.software ?? "",
			title: data.title,
			startTimestamp: data.startTimestamp,
			endTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
			transcript: data.transcript ?? [],
			chatMessages: data.chatMessages ?? [],
			webhookPostStatus: "new"
		};
		let meetings = await StorageLocal.getMeetings();
		meetings.push(newEntry);
		if (meetings.length > 10) meetings = meetings.slice(-10);
		await StorageLocal.setMeetings(meetings);
		console.log("Last meeting picked up");
		return "Last meeting picked up";
	}
	async function finalizeMeeting() {
		await pickupLastMeeting();
		const meetings = await StorageLocal.getMeetings();
		const sync = await StorageSync.getAutoActionSettings();
		const lastIndex = meetings.length - 1;
		const promises = [];
		if (sync.autoDownloadFileAfterMeeting) promises.push(downloadTranscript(lastIndex, !!(sync.webhookUrl && sync.autoPostWebhookAfterMeeting)));
		if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) promises.push(postTranscriptToWebhook(lastIndex));
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
	//#endregion
	//#region src/services/meeting-service.ts
	var MeetingService = {
		finalizeMeeting: () => finalizeMeeting(),
		recoverMeeting: () => recoverLastMeeting(),
		pickupLastMeeting: () => pickupLastMeeting()
	};
	//#endregion
	//#region src/services/download-service.ts
	var DownloadService = {
		downloadTranscript: async (index) => downloadTranscript(index, false),
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
	//#region src/services/webhook-service.ts
	var WebhookService = { postWebhook: (index) => postTranscriptToWebhook(index) };
	//#endregion
	//#region src/background/lifecycle.ts
	async function clearTabIdAndApplyUpdate() {
		chrome.action.setBadgeText({ text: "" });
		await StorageLocal.setMeetingTabId(null);
		console.log("Meeting tab id cleared for next meeting");
		if (await StorageLocal.getDeferredUpdatePending()) {
			console.log("Applying deferred update");
			await StorageLocal.setDeferredUpdate(false);
			chrome.runtime.reload();
		}
	}
	//#endregion
	//#region src/background/content-scripts.ts
	var PLATFORM_CONFIGS = { google_meet: {
		id: "content-google-meet",
		js: ["content-google-meet.js"],
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
							if (hasNotifyPermission) chrome.notifications.create({
								type: "basic",
								iconUrl: "icon.png",
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
				console.log("Successfully intercepted tab close");
				StorageLocal.setMeetingTabId("processing").then(() => MeetingService.finalizeMeeting().finally(() => clearTabIdAndApplyUpdate()));
			}
		});
	});
	chrome.runtime.onUpdateAvailable.addListener(() => {
		StorageLocal.getMeetingTabId().then((id) => {
			if (id) StorageLocal.setDeferredUpdate(true).then(() => console.log("Deferred update flag set"));
			else {
				console.log("No active meeting, applying update immediately");
				chrome.runtime.reload();
			}
		});
	});
	chrome.permissions.onAdded.addListener(() => {
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
	//#region src/background/index.ts
	var ok = { success: true };
	var err = (e) => ({
		success: false,
		message: e
	});
	var invalidIndex = {
		success: false,
		message: {
			errorCode: ErrorCode.INVALID_INDEX,
			errorMessage: "Invalid index"
		}
	};
	var isValidIndex = (i) => typeof i === "number" && i >= 0;
	chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
		if (sender.id !== chrome.runtime.id) return;
		const msg = raw;
		console.log(msg.type);
		if (msg.type === "new_meeting_started") {
			chrome.tabs.query({
				active: true,
				currentWindow: true
			}, (tabs) => {
				const tabId = tabs[0]?.id;
				if (tabId !== void 0) StorageLocal.setMeetingTabId(tabId).then(() => console.log("Meeting tab id saved"));
			});
			chrome.action.setBadgeText({ text: "REC" });
			chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
		}
		if (msg.type === "meeting_ended") StorageLocal.setMeetingTabId("processing").then(() => MeetingService.finalizeMeeting().then(() => sendResponse(ok)).catch((e) => sendResponse(err(e))).finally(() => clearTabIdAndApplyUpdate()));
		if (msg.type === "download_transcript_at_index") isValidIndex(msg.index) ? DownloadService.downloadTranscript(msg.index).then(() => sendResponse(ok)).catch((e) => sendResponse(err(e))) : sendResponse(invalidIndex);
		if (msg.type === "post_webhook_at_index") isValidIndex(msg.index) ? WebhookService.postWebhook(msg.index).then(() => sendResponse(ok)).catch((e) => {
			console.error("Webhook retry failed:", e);
			sendResponse(err(e));
		}) : sendResponse(invalidIndex);
		if (msg.type === "recover_last_meeting") MeetingService.recoverMeeting().then((m) => sendResponse({
			success: true,
			message: m
		})).catch((e) => sendResponse(err(e)));
		if (msg.type === "open_popup") chrome.action.openPopup().then((m) => sendResponse({
			success: true,
			message: String(m)
		})).catch((e) => sendResponse({
			success: false,
			message: String(e)
		}));
		return true;
	});
	//#endregion
})();
