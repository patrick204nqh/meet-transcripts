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
	var StorageLocal = {
		getMeetings: async () => {
			return (await chrome.storage.local.get(["meetings"])).meetings ?? [];
		},
		saveMeetings: (meetings) => chrome.storage.local.set({ meetings }),
		getMeetingTabId: async () => {
			return (await chrome.storage.local.get(["meetingTabId"])).meetingTabId ?? null;
		},
		setMeetingTabId: (id) => chrome.storage.local.set({ meetingTabId: id }),
		getCurrentMeetingData: async () => {
			return await chrome.storage.local.get([
				"meetingSoftware",
				"meetingTitle",
				"meetingStartTimestamp",
				"transcript",
				"chatMessages"
			]);
		},
		setCurrentMeetingData: (data) => chrome.storage.local.set(data),
		isDeferredUpdateAvailable: async () => {
			return !!(await chrome.storage.local.get(["isDeferredUpdatedAvailable"])).isDeferredUpdatedAvailable;
		},
		setDeferredUpdate: (value) => chrome.storage.local.set({ isDeferredUpdatedAvailable: value })
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
		saveSettings: (settings) => chrome.storage.sync.set(settings),
		getWebhookConfig: async () => {
			return await chrome.storage.sync.get(["webhookUrl", "webhookBodyType"]);
		},
		getDownloadConfig: async () => {
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
		return transcript.map((block) => `${block.personName} (${new Date(block.timestamp).toLocaleString("default", timeFormat$1).toUpperCase()})\n${block.transcriptText}\n\n`).join("");
	}
	function getChatMessagesString(chatMessages) {
		if (chatMessages.length === 0) return "";
		return chatMessages.map((msg) => `${msg.personName} (${new Date(msg.timestamp).toLocaleString("default", timeFormat$1).toUpperCase()})\n${msg.chatMessageText}\n\n`).join("");
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
		if (meeting.meetingTitle) sanitisedTitle = meeting.meetingTitle.replaceAll(invalidFilenameRegex, "_");
		const formattedTimestamp = new Date(meeting.meetingStartTimestamp).toLocaleString("default", timeFormat$1).replace(/[/:]/g, "-");
		const fileName = `meet-transcripts/${meeting.meetingSoftware ? `${meeting.meetingSoftware} transcript` : "Transcript"}-${sanitisedTitle} at ${formattedTimestamp} on.txt`;
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
		const [meetings, { webhookUrl, webhookBodyType }] = await Promise.all([StorageLocal.getMeetings(), StorageSync.getWebhookConfig()]);
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
			meetingSoftware: meeting.meetingSoftware || "",
			meetingTitle: meeting.meetingTitle || "",
			meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toISOString(),
			meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toISOString(),
			transcript: meeting.transcript,
			chatMessages: meeting.chatMessages
		} : {
			webhookBodyType: "simple",
			meetingSoftware: meeting.meetingSoftware || "",
			meetingTitle: meeting.meetingTitle || "",
			meetingStartTimestamp: new Date(meeting.meetingStartTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
			meetingEndTimestamp: new Date(meeting.meetingEndTimestamp).toLocaleString("default", timeFormat).toUpperCase(),
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
			await StorageLocal.saveMeetings(meetings);
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
		await StorageLocal.saveMeetings(meetings);
		return "Webhook posted successfully";
	}
	//#endregion
	//#region src/background/meeting-storage.ts
	async function pickupLastMeetingFromStorage() {
		const data = await StorageLocal.getCurrentMeetingData();
		if (!data.meetingStartTimestamp) throw {
			errorCode: ErrorCode.NO_MEETINGS,
			errorMessage: "No meetings found. May be attend one?"
		};
		if (!data.transcript?.length && !data.chatMessages?.length) throw {
			errorCode: ErrorCode.EMPTY_TRANSCRIPT,
			errorMessage: "Empty transcript and empty chatMessages"
		};
		const newEntry = {
			meetingSoftware: data.meetingSoftware ?? "",
			meetingTitle: data.meetingTitle,
			meetingStartTimestamp: data.meetingStartTimestamp,
			meetingEndTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
			transcript: data.transcript ?? [],
			chatMessages: data.chatMessages ?? [],
			webhookPostStatus: "new"
		};
		let meetings = await StorageLocal.getMeetings();
		meetings.push(newEntry);
		if (meetings.length > 10) meetings = meetings.slice(-10);
		await StorageLocal.saveMeetings(meetings);
		console.log("Last meeting picked up");
		return "Last meeting picked up";
	}
	async function processLastMeeting() {
		await pickupLastMeetingFromStorage();
		const meetings = await StorageLocal.getMeetings();
		const sync = await StorageSync.getDownloadConfig();
		const lastIndex = meetings.length - 1;
		const promises = [];
		if (sync.autoDownloadFileAfterMeeting) promises.push(downloadTranscript(lastIndex, !!(sync.webhookUrl && sync.autoPostWebhookAfterMeeting)));
		if (sync.autoPostWebhookAfterMeeting && sync.webhookUrl) promises.push(postTranscriptToWebhook(lastIndex));
		await Promise.all(promises);
		return "Meeting processing complete";
	}
	async function recoverLastMeeting() {
		const [meetings, data] = await Promise.all([StorageLocal.getMeetings(), StorageLocal.getCurrentMeetingData()]);
		if (!data.meetingStartTimestamp) throw {
			errorCode: ErrorCode.NO_MEETINGS,
			errorMessage: "No meetings found. May be attend one?"
		};
		const lastSaved = meetings.length > 0 ? meetings[meetings.length - 1] : void 0;
		if (!lastSaved || data.meetingStartTimestamp !== lastSaved.meetingStartTimestamp) {
			await processLastMeeting();
			return "Recovered last meeting to the best possible extent";
		}
		return "No recovery needed";
	}
	//#endregion
	//#region src/background/lifecycle.ts
	async function clearTabIdAndApplyUpdate() {
		chrome.action.setBadgeText({ text: "" });
		await StorageLocal.setMeetingTabId(null);
		console.log("Meeting tab id cleared for next meeting");
		if (await StorageLocal.isDeferredUpdateAvailable()) {
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
	function reRegisterContentScripts() {
		registerContentScript("google_meet", false).catch((error) => {
			console.log(error);
		});
	}
	//#endregion
	//#region src/background/index.ts
	chrome.runtime.onMessage.addListener((messageUntyped, sender, sendResponse) => {
		if (sender.id !== chrome.runtime.id) return;
		const message = messageUntyped;
		console.log(message.type);
		if (message.type === "new_meeting_started") {
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
		if (message.type === "meeting_ended") StorageLocal.setMeetingTabId("processing").then(() => {
			processLastMeeting().then(() => sendResponse({ success: true })).catch((error) => sendResponse({
				success: false,
				message: error
			})).finally(() => clearTabIdAndApplyUpdate());
		});
		if (message.type === "download_transcript_at_index") if (typeof message.index === "number" && message.index >= 0) downloadTranscript(message.index, false).then(() => sendResponse({ success: true })).catch((error) => sendResponse({
			success: false,
			message: error
		}));
		else sendResponse({
			success: false,
			message: {
				errorCode: ErrorCode.INVALID_INDEX,
				errorMessage: "Invalid index"
			}
		});
		if (message.type === "post_webhook_at_index") if (typeof message.index === "number" && message.index >= 0) postTranscriptToWebhook(message.index).then(() => sendResponse({ success: true })).catch((error) => {
			console.error("Webhook retry failed:", error);
			sendResponse({
				success: false,
				message: error
			});
		});
		else sendResponse({
			success: false,
			message: {
				errorCode: ErrorCode.INVALID_INDEX,
				errorMessage: "Invalid index"
			}
		});
		if (message.type === "recover_last_meeting") recoverLastMeeting().then((msg) => sendResponse({
			success: true,
			message: msg
		})).catch((error) => sendResponse({
			success: false,
			message: error
		}));
		if (message.type === "open_popup") chrome.action.openPopup().then((msg) => sendResponse({
			success: true,
			message: String(msg)
		})).catch((error) => sendResponse({
			success: false,
			message: String(error)
		}));
		return true;
	});
	chrome.tabs.onRemoved.addListener((tabId) => {
		StorageLocal.getMeetingTabId().then((meetingTabId) => {
			if (tabId === meetingTabId) {
				console.log("Successfully intercepted tab close");
				StorageLocal.setMeetingTabId("processing").then(() => {
					processLastMeeting().finally(() => clearTabIdAndApplyUpdate());
				});
			}
		});
	});
	chrome.runtime.onUpdateAvailable.addListener(() => {
		StorageLocal.getMeetingTabId().then((meetingTabId) => {
			if (meetingTabId) StorageLocal.setDeferredUpdate(true).then(() => console.log("Deferred update flag set"));
			else {
				console.log("No active meeting, applying update immediately");
				chrome.runtime.reload();
			}
		});
	});
	chrome.permissions.onAdded.addListener(() => {
		setTimeout(() => reRegisterContentScripts(), 2e3);
	});
	chrome.runtime.onInstalled.addListener(() => {
		reRegisterContentScripts();
		StorageSync.getSettings().then((sync) => {
			StorageSync.saveSettings({
				autoPostWebhookAfterMeeting: sync.autoPostWebhookAfterMeeting === false ? false : true,
				autoDownloadFileAfterMeeting: sync.autoDownloadFileAfterMeeting === false ? false : true,
				operationMode: sync.operationMode === "manual" ? "manual" : "auto",
				webhookBodyType: sync.webhookBodyType === "advanced" ? "advanced" : "simple"
			});
		});
	});
	//#endregion
})();
