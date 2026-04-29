(function() {
	//#region src/state.js
	/** @type {ExtensionStatusJSON} */
	var extensionStatusJSON_bug = {
		status: 400,
		message: `<strong>meet-transcripts encountered a new error</strong> <br /> Please report it <a href="https://github.com/patrick204nqh/meet-transcripts/issues" target="_blank">here</a>.`
	};
	var reportErrorMessage = "There is a bug in meet-transcripts. Please report it at https://github.com/patrick204nqh/meet-transcripts/issues";
	/** @type {MutationObserverInit} */
	var mutationConfig = {
		childList: true,
		attributes: true,
		subtree: true,
		characterData: true
	};
	/** @type {MeetingSoftware} */
	var meetingSoftware = "Google Meet";
	var state = {
		userName: "You",
		transcript: [],
		transcriptTargetBuffer: null,
		personNameBuffer: "",
		transcriptTextBuffer: "",
		timestampBuffer: "",
		chatMessages: [],
		meetingStartTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
		meetingTitle: document.title,
		isTranscriptDomErrorCaptured: false,
		isChatMessagesDomErrorCaptured: false,
		hasMeetingStarted: false,
		hasMeetingEnded: false,
		extensionStatusJSON: null
	};
	//#endregion
	//#region src/ui.js
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
	/**
	* @param {string} selector
	* @param {string | RegExp} text
	*/
	function selectElements(selector, text) {
		var elements = document.querySelectorAll(selector);
		return Array.prototype.filter.call(elements, function(element) {
			return RegExp(text).test(element.textContent);
		});
	}
	/**
	* @param {string} selector
	* @param {string | RegExp} [text]
	*/
	async function waitForElement(selector, text) {
		if (text) while (!Array.from(document.querySelectorAll(selector)).find((element) => element.textContent === text)) await new Promise((resolve) => requestAnimationFrame(resolve));
		else while (!document.querySelector(selector)) await new Promise((resolve) => requestAnimationFrame(resolve));
		return document.querySelector(selector);
	}
	/**
	* @param {ExtensionStatusJSON} extensionStatusJSON
	*/
	function showNotification(extensionStatusJSON) {
		let html = document.querySelector("html");
		let obj = document.createElement("div");
		let logo = document.createElement("img");
		let text = document.createElement("p");
		logo.setAttribute("src", chrome.runtime.getURL("icon.png"));
		logo.setAttribute("height", "32px");
		logo.setAttribute("width", "32px");
		logo.style.cssText = "border-radius: 4px";
		logo.onerror = () => {
			logo.style.display = "none";
		};
		setTimeout(() => {
			obj.style.display = "none";
		}, 5e3);
		if (extensionStatusJSON.status === 200) {
			obj.style.cssText = `color: #2A9ACA; ${commonCSS}`;
			text.innerHTML = extensionStatusJSON.message;
		} else {
			obj.style.cssText = `color: orange; ${commonCSS}`;
			text.innerHTML = extensionStatusJSON.message;
		}
		obj.prepend(text);
		obj.prepend(logo);
		if (html) html.append(obj);
	}
	function pulseStatus() {
		const statusActivityCSS = `position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    z-index: 100;
    transition: background-color 0.3s ease-in
  `;
		/** @type {HTMLDivElement | null} */
		let activityStatus = document.querySelector(`#meet-transcripts-status`);
		if (!activityStatus) {
			let html = document.querySelector("html");
			activityStatus = document.createElement("div");
			activityStatus.setAttribute("id", "meet-transcripts-status");
			activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`;
			html?.appendChild(activityStatus);
		} else activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`;
		setTimeout(() => {
			activityStatus.style.cssText = `background-color: transparent; ${statusActivityCSS}`;
		}, 3e3);
	}
	/**
	* @param {string} code
	* @param {any} err
	*/
	function logError(code, err) {
		console.error(`[meet-transcripts] Error ${code}:`, err);
	}
	//#endregion
	//#region src/storage.js
	/**
	* @param {Array<"meetingSoftware" | "meetingTitle" | "meetingStartTimestamp" | "transcript" | "chatMessages">} keys
	* @param {boolean} sendDownloadMessage
	*/
	function overWriteChromeStorage(keys, sendDownloadMessage) {
		const objectToSave = {};
		if (keys.includes("meetingSoftware")) objectToSave.meetingSoftware = meetingSoftware;
		if (keys.includes("meetingTitle")) objectToSave.meetingTitle = state.meetingTitle;
		if (keys.includes("meetingStartTimestamp")) objectToSave.meetingStartTimestamp = state.meetingStartTimestamp;
		if (keys.includes("transcript")) objectToSave.transcript = state.transcript;
		if (keys.includes("chatMessages")) objectToSave.chatMessages = state.chatMessages;
		chrome.storage.local.set(objectToSave, function() {
			pulseStatus();
			if (sendDownloadMessage) chrome.runtime.sendMessage({ type: "meeting_ended" }, (responseUntyped) => {
				const response = responseUntyped;
				if (!response.success && typeof response.message === "object" && response.message?.errorCode === "010") console.error(response.message.errorMessage);
			});
		});
	}
	function recoverLastMeeting() {
		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage({ type: "recover_last_meeting" }, function(responseUntyped) {
				const response = responseUntyped;
				if (response.success) resolve("Last meeting recovered successfully or recovery not needed");
				else reject(response.message);
			});
		});
	}
	//#endregion
	//#region src/observer/transcript-observer.js
	function insertGapMarker() {
		state.transcript.push({
			personName: "[meet-transcripts]",
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			transcriptText: "[Captions unavailable — tab was not in focus]"
		});
		overWriteChromeStorage(["transcript"], false);
	}
	function pushBufferToTranscript() {
		state.transcript.push({
			personName: state.personNameBuffer === "You" ? state.userName : state.personNameBuffer,
			timestamp: state.timestampBuffer,
			transcriptText: state.transcriptTextBuffer
		});
		overWriteChromeStorage(["transcript"], false);
	}
	/**
	* @param {MutationRecord[]} mutationsList
	*/
	function transcriptMutationCallback(mutationsList) {
		mutationsList.forEach((mutation) => {
			try {
				if (mutation.type === "characterData") {
					const mutationTargetElement = mutation.target.parentElement;
					const transcriptUIBlocks = [...mutationTargetElement?.parentElement?.parentElement?.children || []];
					if (transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement ? true : false) {
						const currentPersonName = mutationTargetElement?.previousSibling?.textContent;
						const currentTranscriptText = mutationTargetElement?.textContent;
						if (currentPersonName && currentTranscriptText) {
							[...transcriptUIBlocks[transcriptUIBlocks.length - 3].children].forEach((item) => {
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
				console.error(err);
				if (!state.isTranscriptDomErrorCaptured && !state.hasMeetingEnded) {
					console.log(reportErrorMessage);
					showNotification(extensionStatusJSON_bug);
					logError("005", err);
				}
				state.isTranscriptDomErrorCaptured = true;
			}
		});
	}
	//#endregion
	//#region src/observer/chat-observer.js
	/**
	* @param {ChatMessage} chatBlock
	*/
	function pushUniqueChatBlock(chatBlock) {
		if (!state.chatMessages.some((item) => item.personName === chatBlock.personName && item.chatMessageText === chatBlock.chatMessageText)) {
			console.log("Chat message captured");
			state.chatMessages.push(chatBlock);
			overWriteChromeStorage(["chatMessages"], false);
		}
	}
	/**
	* @param {MutationRecord[]} mutationsList
	*/
	function chatMessagesMutationCallback(mutationsList) {
		mutationsList.forEach(() => {
			try {
				const chatMessagesElement = document.querySelector(`div[aria-live="polite"].Ge9Kpc`);
				if (chatMessagesElement && chatMessagesElement.children.length > 0) {
					const chatMessageElement = chatMessagesElement.lastChild?.firstChild?.firstChild?.lastChild;
					const personAndTimestampElement = chatMessageElement?.firstChild;
					const personName = personAndTimestampElement?.childNodes.length === 1 ? state.userName : personAndTimestampElement?.firstChild?.textContent;
					const timestamp = (/* @__PURE__ */ new Date()).toISOString();
					const chatMessageText = chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild?.textContent;
					if (personName && chatMessageText) pushUniqueChatBlock({
						personName,
						timestamp,
						chatMessageText
					});
				}
			} catch (err) {
				console.error(err);
				if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) {
					console.log(reportErrorMessage);
					showNotification(extensionStatusJSON_bug);
					logError("006", err);
				}
				state.isChatMessagesDomErrorCaptured = true;
			}
		});
	}
	//#endregion
	//#region src/meeting.js
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
			meetingTitleElement?.setAttribute("contenteditable", "true");
			meetingTitleElement.title = "Edit meeting title for meet-transcripts";
			meetingTitleElement.style.cssText = `text-decoration: underline white; text-underline-offset: 4px;`;
			meetingTitleElement?.addEventListener("input", handleMeetingTitleElementChange);
			setTimeout(() => {
				handleMeetingTitleElementChange();
				if (location.pathname === `/${meetingTitleElement.innerText}`) showNotification({
					status: 200,
					message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner"
				});
			}, 7e3);
			function handleMeetingTitleElementChange() {
				state.meetingTitle = meetingTitleElement.innerText;
				overWriteChromeStorage(["meetingTitle"], false);
			}
		});
	}
	/**
	* @param {number} uiType
	*/
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
			default: break;
		}
		waitForElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
			console.log("Meeting started");
			chrome.runtime.sendMessage({ type: "new_meeting_started" }, function() {});
			state.hasMeetingStarted = true;
			state.meetingStartTimestamp = (/* @__PURE__ */ new Date()).toISOString();
			overWriteChromeStorage(["meetingStartTimestamp"], false);
			updateMeetingTitle();
			/** @type {MutationObserver} */
			let transcriptObserver;
			/** @type {MutationObserver} */
			let chatMessagesObserver;
			/** @type {MutationObserver} */
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
				chrome.storage.sync.get(["operationMode"], function(resultSyncUntyped) {
					if (resultSyncUntyped.operationMode === "manual") console.log("Manual mode selected, leaving transcript off");
					else captionsButton.click();
				});
				return waitForElement(`div[role="region"][tabindex="0"]`).then((targetNode) => targetNode);
			}).then((targetNode) => {
				const transcriptTargetNode = targetNode;
				if (transcriptTargetNode) {
					attachTranscriptObserver(transcriptTargetNode);
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
					chrome.storage.sync.get(["operationMode"], function(resultSyncUntyped) {
						if (resultSyncUntyped.operationMode === "manual") showNotification({
							status: 400,
							message: "<strong>meet-transcripts is not running</strong> <br /> Turn on captions using the CC icon, if needed"
						});
						else showNotification(state.extensionStatusJSON);
					});
				} else throw new Error("Transcript element not found in DOM");
			}).catch((err) => {
				console.error(err);
				state.isTranscriptDomErrorCaptured = true;
				showNotification(extensionStatusJSON_bug);
				logError("001", err);
			});
			waitForElement(".google-symbols", "chat").then(() => {
				const chatMessagesButton = selectElements(".google-symbols", "chat")[0];
				chatMessagesButton.click();
				return waitForElement(`div[aria-live="polite"].Ge9Kpc`).then((targetNode) => ({
					targetNode,
					chatMessagesButton
				}));
			}).then(({ targetNode, chatMessagesButton }) => {
				chatMessagesButton.click();
				const chatMessagesTargetNode = targetNode;
				if (chatMessagesTargetNode) {
					chatMessagesObserver = new MutationObserver(chatMessagesMutationCallback);
					chatMessagesObserver.observe(chatMessagesTargetNode, mutationConfig);
				} else throw new Error("Chat messages element not found in DOM");
			}).catch((err) => {
				console.error(err);
				state.isChatMessagesDomErrorCaptured = true;
				showNotification(extensionStatusJSON_bug);
				logError("003", err);
			});
			try {
				selectElements(meetingEndIconData.selector, meetingEndIconData.text)[0].parentElement.parentElement.addEventListener("click", () => {
					state.hasMeetingEnded = true;
					if (transcriptObserver) transcriptObserver.disconnect();
					if (chatMessagesObserver) chatMessagesObserver.disconnect();
					if (captionWatchdog) captionWatchdog.disconnect();
					document.removeEventListener("visibilitychange", onVisibilityChange);
					if (state.personNameBuffer !== "" && state.transcriptTextBuffer !== "") pushBufferToTranscript();
					overWriteChromeStorage(["transcript", "chatMessages"], true);
				});
			} catch (err) {
				console.error(err);
				showNotification(extensionStatusJSON_bug);
				logError("004", err);
			}
		});
	}
	//#endregion
	//#region src/content-google-meet.js
	Promise.race([recoverLastMeeting(), new Promise((_, reject) => setTimeout(() => reject({
		errorCode: "016",
		errorMessage: "Recovery timed out"
	}), 2e3))]).catch((error) => {
		const parsedError = error;
		if (parsedError.errorCode !== "013" && parsedError.errorCode !== "014") console.error(parsedError.errorMessage);
	}).finally(() => {
		overWriteChromeStorage([
			"meetingSoftware",
			"meetingStartTimestamp",
			"meetingTitle",
			"transcript",
			"chatMessages"
		], false);
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
