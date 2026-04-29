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
	//#region src/content/state.ts
	var state = {
		userName: "You",
		transcript: [],
		transcriptTargetBuffer: null,
		personNameBuffer: "",
		transcriptTextBuffer: "",
		timestampBuffer: "",
		chatMessages: [],
		startTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
		title: document.title,
		isTranscriptDomErrorCaptured: false,
		isChatMessagesDomErrorCaptured: false,
		hasMeetingStarted: false,
		hasMeetingEnded: false,
		extensionStatusJSON: null
	};
	//#endregion
	//#region src/content/constants.ts
	var bugStatusJson = {
		status: 400,
		message: `<strong>meet-transcripts encountered a new error</strong> <br /> Please report it <a href="https://github.com/patrick204nqh/meet-transcripts/issues" target="_blank">here</a>.`
	};
	var mutationConfig = {
		childList: true,
		attributes: true,
		subtree: true,
		characterData: true
	};
	var meetingSoftware = "Google Meet";
	//#endregion
	//#region src/content/ui.ts
	var commonCSS = `background: rgb(255 255 255 / 100%);
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
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`;
	var DOM_POLL_INTERVAL_MS = 250;
	var DOM_POLL_MAX_ATTEMPTS = 120;
	var LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M11 5 H37 A6 6 0 0 1 43 11 V29 A6 6 0 0 1 37 35 H20 L13 42 V35 H11 A6 6 0 0 1 5 29 V11 A6 6 0 0 1 11 5 Z" fill="#1e3a8a" stroke="#38bdf8" stroke-width="1.2" stroke-linejoin="round"/><rect x="10" y="11" width="25" height="2" rx="1" fill="#bae6fd" opacity="0.85"/><rect x="10" y="16" width="19" height="2" rx="1" fill="#bae6fd" opacity="0.85"/><rect x="10" y="21" width="13" height="2" rx="1" fill="#bae6fd" opacity="0.85"/><rect x="12" y="27" width="2" height="4" rx="1" fill="#38bdf8"/><rect x="16" y="25" width="2" height="6" rx="1" fill="#38bdf8"/><rect x="20" y="23" width="2" height="8" rx="1" fill="#38bdf8"/><rect x="24" y="26" width="2" height="5" rx="1" fill="#38bdf8"/><rect x="28" y="27" width="2" height="4" rx="1" fill="#38bdf8"/></svg>`;
	function selectElements(selector, text) {
		const elements = document.querySelectorAll(selector);
		return Array.prototype.filter.call(elements, (element) => RegExp(text).test(element.textContent ?? ""));
	}
	function waitForElement(selector, text) {
		return new Promise((resolve) => {
			const matches = (el) => !text || RegExp(text).test(el.textContent ?? "");
			const find = () => Array.from(document.querySelectorAll(selector)).find(matches) ?? null;
			const immediate = find();
			if (immediate) {
				resolve(immediate);
				return;
			}
			let attempts = 0;
			let done = false;
			const finish = (el) => {
				if (done) return;
				done = true;
				observer.disconnect();
				clearInterval(timer);
				resolve(el);
			};
			const observer = new MutationObserver(() => {
				const el = find();
				if (el) finish(el);
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			const timer = setInterval(() => {
				const el = find();
				if (el) {
					finish(el);
					return;
				}
				if (++attempts >= DOM_POLL_MAX_ATTEMPTS) finish(null);
			}, DOM_POLL_INTERVAL_MS);
		});
	}
	function showNotification(statusJSON) {
		if (!statusJSON) return;
		const html = document.querySelector("html");
		const obj = document.createElement("div");
		const text = document.createElement("p");
		const logoWrapper = document.createElement("div");
		logoWrapper.innerHTML = LOGO_SVG;
		const logo = logoWrapper.firstElementChild;
		if (logo) {
			logo.setAttribute("width", "32");
			logo.setAttribute("height", "32");
			logo.style.cssText = "border-radius: 4px; flex-shrink: 0";
		}
		setTimeout(() => {
			obj.style.display = "none";
		}, 5e3);
		if (statusJSON.status === 200) {
			obj.style.cssText = `color: #2A9ACA; ${commonCSS}`;
			text.innerHTML = statusJSON.message;
		} else {
			obj.style.cssText = `color: orange; ${commonCSS}`;
			text.innerHTML = statusJSON.message;
		}
		obj.prepend(text);
		if (logo) obj.prepend(logo);
		html?.append(obj);
	}
	function pulseStatus() {
		const statusActivityCSS = `position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    z-index: 100;
    transition: background-color 0.3s ease-in
  `;
		let activityStatus = document.querySelector(`#meet-transcripts-status`);
		if (!activityStatus) {
			const html = document.querySelector("html");
			activityStatus = document.createElement("div");
			activityStatus.setAttribute("id", "meet-transcripts-status");
			activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`;
			html?.appendChild(activityStatus);
		} else activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`;
		const el = activityStatus;
		setTimeout(() => {
			el.style.cssText = `background-color: transparent; ${statusActivityCSS}`;
		}, 3e3);
	}
	function logError(code, err) {
		console.error(`[meet-transcripts] Error ${code}:`, err);
	}
	function handleContentError(code, err, notify = true) {
		logError(code, err);
		if (notify) showNotification(bugStatusJson);
	}
	//#endregion
	//#region src/shared/messages.ts
	function sendMessage(msg) {
		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(msg, (raw) => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
					return;
				}
				resolve(raw);
			});
		});
	}
	function recoverLastMeeting() {
		return sendMessage({ type: "recover_last_meeting" }).then((response) => {
			if (response.success) return response.data ?? "Last meeting recovered successfully or recovery not needed";
			return Promise.reject(response.error);
		});
	}
	//#endregion
	//#region src/content/state-sync.ts
	function buildStorageObject(keys) {
		const obj = {};
		if (keys.includes("software")) obj.software = meetingSoftware;
		if (keys.includes("title")) obj.title = state.title;
		if (keys.includes("startTimestamp")) obj.startTimestamp = state.startTimestamp;
		if (keys.includes("transcript")) obj.transcript = state.transcript;
		if (keys.includes("chatMessages")) obj.chatMessages = state.chatMessages;
		return obj;
	}
	function persistStateFields(keys) {
		chrome.storage.local.set(buildStorageObject(keys), () => pulseStatus());
	}
	async function persistStateAndSignalEnd(keys, reason) {
		await chrome.storage.local.set(buildStorageObject(keys));
		pulseStatus();
		if (reason === "page_unload") {
			chrome.runtime.sendMessage({
				type: "meeting_ended",
				reason
			}).catch(() => {});
			return;
		}
		const response = await sendMessage({
			type: "meeting_ended",
			reason
		});
		if (!response.success && response.error.errorCode === ErrorCode.MEETING_NOT_FOUND) console.error(response.error.errorMessage);
	}
	//#endregion
	//#region src/content/observer/transcript-observer.ts
	function insertGapMarker() {
		state.transcript.push({
			personName: "[meet-transcripts]",
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			text: "[Captions unavailable — tab was not in focus]"
		});
		persistStateFields(["transcript"]);
	}
	function pushBufferToTranscript() {
		state.transcript.push({
			personName: state.personNameBuffer === "You" ? state.userName : state.personNameBuffer,
			timestamp: state.timestampBuffer,
			text: state.transcriptTextBuffer
		});
		persistStateFields(["transcript"]);
	}
	function transcriptMutationCallback(mutationsList) {
		mutationsList.forEach((mutation) => {
			try {
				if (mutation.type === "characterData") {
					const mutationTargetElement = mutation.target.parentElement;
					const transcriptUIBlocks = [...mutationTargetElement?.parentElement?.parentElement?.children ?? []];
					if (transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement) {
						const currentPersonName = (mutationTargetElement?.previousSibling)?.textContent;
						const currentTranscriptText = mutationTargetElement?.textContent;
						if (currentPersonName && currentTranscriptText) {
							Array.from(transcriptUIBlocks[transcriptUIBlocks.length - 3]?.children ?? []).forEach((item) => {
								item.setAttribute("style", "opacity:0.2");
							});
							if (state.transcriptTextBuffer === "") {
								state.personNameBuffer = currentPersonName;
								state.timestampBuffer = (/* @__PURE__ */ new Date()).toISOString();
								state.transcriptTextBuffer = currentTranscriptText;
							} else if (state.personNameBuffer !== currentPersonName) {
								pushBufferToTranscript();
								state.personNameBuffer = currentPersonName;
								state.timestampBuffer = (/* @__PURE__ */ new Date()).toISOString();
								state.transcriptTextBuffer = currentTranscriptText;
							} else {
								if (currentTranscriptText.length - state.transcriptTextBuffer.length < -250) {
									pushBufferToTranscript();
									state.timestampBuffer = (/* @__PURE__ */ new Date()).toISOString();
								}
								state.transcriptTextBuffer = currentTranscriptText;
							}
						} else {
							console.log("No active transcript");
							if (state.personNameBuffer !== "" && state.transcriptTextBuffer !== "") pushBufferToTranscript();
							state.personNameBuffer = "";
							state.transcriptTextBuffer = "";
						}
					}
				}
				console.log("Transcript captured");
			} catch (err) {
				if (!state.isTranscriptDomErrorCaptured && !state.hasMeetingEnded) handleContentError("005", err);
				state.isTranscriptDomErrorCaptured = true;
			}
		});
	}
	//#endregion
	//#region src/content/observer/chat-observer.ts
	function pushUniqueChatBlock(chatBlock) {
		if (!state.chatMessages.some((item) => item.personName === chatBlock.personName && item.text === chatBlock.text)) {
			console.log("Chat message captured");
			state.chatMessages.push(chatBlock);
			persistStateFields(["chatMessages"]);
		}
	}
	function chatMessagesMutationCallback(_mutationsList) {
		try {
			const chatMessagesElement = document.querySelector(`div[aria-live="polite"].Ge9Kpc`);
			if (!chatMessagesElement || chatMessagesElement.children.length === 0) return;
			const chatMessageElement = chatMessagesElement.lastChild?.firstChild?.firstChild?.lastChild;
			const personAndTimestampElement = chatMessageElement?.firstChild;
			const personName = personAndTimestampElement?.childNodes.length === 1 ? state.userName : personAndTimestampElement?.firstChild?.textContent ?? null;
			const timestamp = (/* @__PURE__ */ new Date()).toISOString();
			const chatMessageText = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild)?.textContent ?? null;
			if (personName && chatMessageText) pushUniqueChatBlock({
				personName,
				timestamp,
				text: chatMessageText
			});
		} catch (err) {
			if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) handleContentError("006", err);
			state.isChatMessagesDomErrorCaptured = true;
		}
	}
	//#endregion
	//#region src/content/meeting-session.ts
	function checkExtensionStatus() {
		return new Promise((resolve) => {
			state.extensionStatusJSON = {
				status: 200,
				message: "<strong>meet-transcripts is running</strong> <br /> Do not turn off captions"
			};
			resolve("Extension status set to operational");
		});
	}
	function updateMeetingTitle() {
		waitForElement(".u6vdEc").then((element) => {
			const meetingTitleElement = element;
			if (!meetingTitleElement) return;
			meetingTitleElement.setAttribute("contenteditable", "true");
			meetingTitleElement.title = "Edit meeting title for meet-transcripts";
			meetingTitleElement.style.cssText = `text-decoration: underline white; text-underline-offset: 4px;`;
			meetingTitleElement.addEventListener("input", handleMeetingTitleElementChange);
			setTimeout(() => {
				handleMeetingTitleElementChange();
				if (location.pathname === `/${meetingTitleElement.innerText}`) showNotification({
					status: 200,
					message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner"
				});
			}, 7e3);
			function handleMeetingTitleElementChange() {
				state.title = meetingTitleElement.innerText;
				persistStateFields(["title"]);
			}
		});
	}
	function meetingRoutines(uiType) {
		const meetingEndIconData = {
			selector: "",
			text: ""
		};
		const captionsIconData = {
			selector: "",
			text: ""
		};
		switch (uiType) {
			case 2:
				meetingEndIconData.selector = ".google-symbols";
				meetingEndIconData.text = "call_end";
				captionsIconData.selector = ".google-symbols";
				captionsIconData.text = "closed_caption_off";
				break;
			default: break;
		}
		waitForElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
			console.log("Meeting started");
			chrome.runtime.sendMessage({ type: "new_meeting_started" }, () => {});
			state.hasMeetingStarted = true;
			state.startTimestamp = (/* @__PURE__ */ new Date()).toISOString();
			persistStateFields(["startTimestamp"]);
			updateMeetingTitle();
			let transcriptObserver;
			let chatMessagesObserver;
			let captionWatchdog;
			let isReattaching = false;
			const captionContainerSelector = `div[role="region"][tabindex="0"]`;
			const attachTranscriptObserver = (node) => {
				transcriptObserver = new MutationObserver(transcriptMutationCallback);
				transcriptObserver.observe(node, mutationConfig);
				state.transcriptTargetBuffer = node;
			};
			const onVisibilityChange = () => {
				if (state.hasMeetingEnded || !state.hasMeetingStarted || document.hidden) return;
				if (state.transcriptTargetBuffer && !state.transcriptTargetBuffer.isConnected && !isReattaching) {
					const captionEl = document.querySelector(captionContainerSelector);
					if (!captionEl) return;
					isReattaching = true;
					transcriptObserver?.disconnect();
					attachTranscriptObserver(captionEl);
					insertGapMarker();
					isReattaching = false;
				}
			};
			document.addEventListener("visibilitychange", onVisibilityChange);
			waitForElement(captionsIconData.selector, captionsIconData.text).then(() => {
				const captionsButton = selectElements(captionsIconData.selector, captionsIconData.text)[0];
				chrome.storage.sync.get(["operationMode"], (resultSync) => {
					if (resultSync.operationMode === "manual") console.log("Manual mode selected, leaving transcript off");
					else captionsButton?.click();
				});
				return waitForElement(`div[role="region"][tabindex="0"]`);
			}).then((targetNode) => {
				if (targetNode) {
					attachTranscriptObserver(targetNode);
					captionWatchdog = new MutationObserver(() => {
						if (state.hasMeetingEnded || isReattaching) return;
						if (state.transcriptTargetBuffer && !state.transcriptTargetBuffer.isConnected) {
							const captionEl = document.querySelector(captionContainerSelector);
							if (!captionEl) return;
							isReattaching = true;
							transcriptObserver?.disconnect();
							attachTranscriptObserver(captionEl);
							insertGapMarker();
							isReattaching = false;
						}
					});
					captionWatchdog.observe(document.body, {
						childList: true,
						subtree: true
					});
					chrome.storage.sync.get(["operationMode"], (resultSync) => {
						if (resultSync.operationMode === "manual") showNotification({
							status: 400,
							message: "<strong>meet-transcripts is not running</strong> <br /> Turn on captions using the CC icon, if needed"
						});
						else showNotification(state.extensionStatusJSON);
					});
				} else throw new Error("Transcript element not found in DOM");
			}).catch((err) => {
				state.isTranscriptDomErrorCaptured = true;
				handleContentError("001", err);
			});
			waitForElement(".google-symbols", "chat").then(() => {
				const chatMessagesButton = selectElements(".google-symbols", "chat")[0];
				chatMessagesButton?.click();
				return waitForElement(`div[aria-live="polite"].Ge9Kpc`).then((targetNode) => ({
					targetNode,
					chatMessagesButton
				}));
			}).then(({ targetNode, chatMessagesButton }) => {
				chatMessagesButton?.click();
				if (targetNode) {
					chatMessagesObserver = new MutationObserver(chatMessagesMutationCallback);
					chatMessagesObserver.observe(targetNode, mutationConfig);
				} else throw new Error("Chat messages element not found in DOM");
			}).catch((err) => {
				state.isChatMessagesDomErrorCaptured = true;
				handleContentError("003", err);
			});
			const handleMeetingEnd = (reason) => {
				if (state.hasMeetingEnded) return;
				state.hasMeetingEnded = true;
				transcriptObserver?.disconnect();
				chatMessagesObserver?.disconnect();
				captionWatchdog?.disconnect();
				document.removeEventListener("visibilitychange", onVisibilityChange);
				window.removeEventListener("pagehide", handlePageHide);
				if (state.personNameBuffer !== "" && state.transcriptTextBuffer !== "") pushBufferToTranscript();
				persistStateAndSignalEnd(["transcript", "chatMessages"], reason).catch(console.error);
			};
			const handlePageHide = () => handleMeetingEnd("page_unload");
			window.addEventListener("pagehide", handlePageHide);
			try {
				const clickTarget = selectElements(meetingEndIconData.selector, meetingEndIconData.text)[0]?.parentElement?.parentElement;
				if (!clickTarget) throw new Error("Call end button element not found in DOM");
				clickTarget.addEventListener("click", () => handleMeetingEnd("user_click"));
			} catch (err) {
				handleContentError("004", err);
			}
		});
	}
	//#endregion
	//#region src/content/google-meet.ts
	Promise.race([recoverLastMeeting(), new Promise((_, reject) => setTimeout(() => reject({
		errorCode: ErrorCode.NO_HOST_PERMISSION,
		errorMessage: "Recovery timed out"
	}), 2e3))]).catch((error) => {
		const parsedError = error;
		if (parsedError.errorCode !== ErrorCode.NO_MEETINGS && parsedError.errorCode !== ErrorCode.EMPTY_TRANSCRIPT) console.error(parsedError.errorMessage);
	}).finally(() => {
		persistStateFields([
			"software",
			"startTimestamp",
			"title",
			"transcript",
			"chatMessages"
		]);
	});
	checkExtensionStatus().finally(() => {
		console.log("Extension status " + state.extensionStatusJSON?.status);
		if (state.extensionStatusJSON?.status === 200) {
			waitForElement(".awLEm").then(() => {
				const captureUserNameInterval = setInterval(() => {
					if (!state.hasMeetingStarted) {
						const capturedUserName = document.querySelector(".awLEm")?.textContent;
						if (capturedUserName) {
							state.userName = capturedUserName;
							clearInterval(captureUserNameInterval);
						}
					} else clearInterval(captureUserNameInterval);
				}, 100);
			});
			meetingRoutines(2);
		} else showNotification(state.extensionStatusJSON);
	});
	//#endregion
})();
