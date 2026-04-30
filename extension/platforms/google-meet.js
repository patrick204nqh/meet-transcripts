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
		POPUP_OPEN_FAILED: "017",
		VERSION_MISMATCH: "018"
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
		pipObserverAttached: false,
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
	function handleContentError(code, err, notify = true) {
		log.error(`Error ${code}:`, err);
		if (notify) showNotification(bugStatusJson);
	}
	function msg(m) {
		return {
			...m,
			v: 1
		};
	}
	//#endregion
	//#region src/browser/chrome.ts
	var ChromeStorage = {
		localGet: (keys) => chrome.storage.local.get(keys),
		localSet: (data) => chrome.storage.local.set(data),
		syncGet: (keys) => chrome.storage.sync.get(keys),
		syncSet: (data) => chrome.storage.sync.set(data)
	};
	var ChromeRuntime = {
		get id() {
			return chrome.runtime.id;
		},
		sendMessage: (msg) => new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(msg, (raw) => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
					return;
				}
				resolve(raw);
			});
		}),
		onMessage: (handler) => chrome.runtime.onMessage.addListener(handler)
	};
	//#endregion
	//#region src/shared/messages.ts
	function createMessenger(runtime) {
		return { sendMessage: (msg) => runtime.sendMessage(msg).then((raw) => raw) };
	}
	var defaultMessenger = createMessenger(ChromeRuntime);
	function sendMessage(msg) {
		return defaultMessenger.sendMessage(msg);
	}
	function recoverLastMeeting() {
		return sendMessage(msg({ type: "recover_last_meeting" })).then((response) => {
			if (response.success) return response.data ?? "Last meeting recovered";
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
			chrome.runtime.sendMessage(msg({
				type: "meeting_ended",
				reason
			})).catch(() => {});
			return;
		}
		const response = await sendMessage(msg({
			type: "meeting_ended",
			reason
		}));
		if (!response.success && response.error.errorCode === ErrorCode.MEETING_NOT_FOUND) console.error(response.error.errorMessage);
	}
	//#endregion
	//#region src/content/observer/transcript-observer.ts
	var TRANSCRIPT_RESTART_THRESHOLD = -250;
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
								if (currentTranscriptText.length - state.transcriptTextBuffer.length < TRANSCRIPT_RESTART_THRESHOLD) {
									pushBufferToTranscript();
									state.timestampBuffer = (/* @__PURE__ */ new Date()).toISOString();
								}
								state.transcriptTextBuffer = currentTranscriptText;
							}
						} else {
							log.debug("No active transcript");
							if (state.personNameBuffer !== "" && state.transcriptTextBuffer !== "") pushBufferToTranscript();
							state.personNameBuffer = "";
							state.transcriptTextBuffer = "";
						}
					}
				}
				log.debug("Transcript captured");
			} catch (err) {
				if (!state.isTranscriptDomErrorCaptured && !state.hasMeetingEnded) handleContentError("005", err);
				state.isTranscriptDomErrorCaptured = true;
			}
		});
	}
	//#endregion
	//#region src/content/pip-capture.ts
	var PIP_CAPTION_SELECTOR = "div[role=\"region\"][tabindex=\"0\"]";
	var pipObserver;
	function attachPipObserver(pipDoc) {
		if (state.pipObserverAttached) return;
		const findAndAttach = () => {
			const captionEl = pipDoc.querySelector(PIP_CAPTION_SELECTOR);
			if (!captionEl) return false;
			pipObserver = new MutationObserver(transcriptMutationCallback);
			pipObserver.observe(captionEl, mutationConfig);
			state.pipObserverAttached = true;
			state.transcriptTargetBuffer = captionEl;
			log.info("PiP entered — attaching caption observer");
			insertGapMarker();
			return true;
		};
		if (findAndAttach()) return;
		const bootstrapObserver = new MutationObserver(() => {
			if (findAndAttach()) bootstrapObserver.disconnect();
		});
		bootstrapObserver.observe(pipDoc.body, {
			childList: true,
			subtree: true
		});
	}
	function detachPipObserver() {
		pipObserver?.disconnect();
		pipObserver = void 0;
		state.pipObserverAttached = false;
	}
	function initializePipCapture() {
		const dpip = window.documentPictureInPicture;
		if (!dpip) {
			log.info("Document Picture-in-Picture not supported — PiP capture disabled");
			return;
		}
		dpip.addEventListener("enter", (event) => {
			if (state.hasMeetingEnded) return;
			attachPipObserver(event.window.document);
		});
		dpip.addEventListener("leave", () => {
			log.info("PiP left — detaching caption observer");
			detachPipObserver();
			insertGapMarker();
		});
	}
	//#endregion
	//#region src/content/observer/chat-observer.ts
	function pushUniqueChatBlock(chatBlock) {
		if (!state.chatMessages.some((item) => item.personName === chatBlock.personName && item.text === chatBlock.text)) {
			log.debug("Chat message captured");
			state.chatMessages.push(chatBlock);
			persistStateFields(["chatMessages"]);
		}
	}
	function parseChatFromRoot(chatRoot, currentUser) {
		if (chatRoot.children.length === 0) return null;
		const chatMessageElement = chatRoot.lastChild?.firstChild?.firstChild?.lastChild;
		const personAndTimestampElement = chatMessageElement?.firstChild;
		const personName = personAndTimestampElement?.childNodes.length === 1 ? currentUser : personAndTimestampElement?.firstChild?.textContent ?? null;
		const chatMessageText = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild)?.textContent ?? null;
		if (!personName || !chatMessageText) return null;
		return {
			personName,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			text: chatMessageText
		};
	}
	function chatMessagesMutationCallback(_mutationsList) {
		try {
			const anyTarget = _mutationsList[0]?.target;
			const chatRoot = (anyTarget ? anyTarget.ownerDocument ?? document : document).querySelector(`div[aria-live="polite"].Ge9Kpc`);
			if (!chatRoot) return;
			const parsed = parseChatFromRoot(chatRoot, state.userName);
			if (parsed) pushUniqueChatBlock(parsed);
		} catch (err) {
			if (!state.isChatMessagesDomErrorCaptured && !state.hasMeetingEnded) handleContentError("006", err);
			state.isChatMessagesDomErrorCaptured = true;
		}
	}
	//#endregion
	//#region src/content/core/observer-manager.ts
	var ObserverManager = class {
		constructor(state, captionContainerSelector) {
			this.state = state;
			this.captionContainerSelector = captionContainerSelector;
			this.isReattaching = false;
		}
		attachTranscript(node) {
			this.transcriptObserver = new MutationObserver(transcriptMutationCallback);
			this.transcriptObserver.observe(node, mutationConfig);
			this.state.transcriptTargetBuffer = node;
		}
		attachChat(node) {
			this.chatObserver = new MutationObserver(chatMessagesMutationCallback);
			this.chatObserver.observe(node, mutationConfig);
		}
		attachWatchdog() {
			this.captionWatchdog = new MutationObserver(() => {
				if (this.state.hasMeetingEnded || this.isReattaching) return;
				if (this.state.transcriptTargetBuffer && !this.state.transcriptTargetBuffer.isConnected) {
					const captionEl = document.querySelector(this.captionContainerSelector);
					if (!captionEl) return;
					this.isReattaching = true;
					this.transcriptObserver?.disconnect();
					this.attachTranscript(captionEl);
					insertGapMarker();
					this.isReattaching = false;
				}
			});
			this.captionWatchdog.observe(document.body, {
				childList: true,
				subtree: true
			});
		}
		reattachTranscriptIfDisconnected() {
			if (this.state.hasMeetingEnded || !this.state.hasMeetingStarted) return;
			if (document.hidden) return;
			if (this.state.transcriptTargetBuffer?.isConnected || this.isReattaching) return;
			const captionEl = document.querySelector(this.captionContainerSelector);
			if (!captionEl) return;
			this.isReattaching = true;
			this.transcriptObserver?.disconnect();
			this.attachTranscript(captionEl);
			insertGapMarker();
			this.isReattaching = false;
		}
		detach() {
			log.info("Detaching all observers");
			this.transcriptObserver?.disconnect();
			this.chatObserver?.disconnect();
			this.captionWatchdog?.disconnect();
		}
	};
	//#endregion
	//#region src/content/core/meeting-session.ts
	var MeetingSession = class {
		constructor(adapter, state, _storage) {
			this.adapter = adapter;
			this.state = state;
			this._storage = _storage;
			this.observerManager = new ObserverManager(state, adapter.captionContainerSelector);
			this.handlePageHide = () => this.end("page_unload");
			this.handleVisibilityChange = () => this.observerManager.reattachTranscriptIfDisconnected();
		}
		async start() {
			await this.adapter.waitForMeetingStart();
			log.info("Meeting started");
			chrome.runtime.sendMessage(msg({ type: "new_meeting_started" }), () => {});
			this.state.hasMeetingStarted = true;
			this.state.startTimestamp = (/* @__PURE__ */ new Date()).toISOString();
			persistStateFields(["startTimestamp"]);
			this.captureTitle();
			document.addEventListener("visibilitychange", this.handleVisibilityChange);
			window.addEventListener("pagehide", this.handlePageHide);
			this.wireEndButton();
			await Promise.allSettled([this.setupTranscript(), this.setupChat()]);
		}
		captureTitle() {
			this.adapter.waitForTitleElement().then((titleEl) => {
				titleEl.setAttribute("contenteditable", "true");
				titleEl.title = "Edit meeting title for meet-transcripts";
				titleEl.style.cssText = "text-decoration: underline white; text-underline-offset: 4px;";
				const onInput = () => {
					this.state.title = titleEl.innerText;
					persistStateFields(["title"]);
				};
				titleEl.addEventListener("input", onInput);
				setTimeout(() => {
					onInput();
					if (location.pathname === `/${titleEl.innerText}`) showNotification({
						status: 200,
						message: "<b>Give this meeting a title?</b><br/>Edit the underlined text in the bottom left corner"
					});
				}, 7e3);
			});
		}
		async setupTranscript() {
			try {
				const captionsReady = await this.adapter.waitForCaptionsReady();
				chrome.storage.sync.get(["operationMode"], (result) => {
					if (result.operationMode === "manual") log.info("Manual mode — leaving captions off");
					else this.adapter.enableCaptions(captionsReady);
				});
				const captionNode = await waitForElement(this.adapter.captionContainerSelector);
				if (!captionNode) throw new Error("Caption container not found in DOM");
				this.observerManager.attachTranscript(captionNode);
				this.observerManager.attachWatchdog();
				chrome.storage.sync.get(["operationMode"], (result) => {
					if (result.operationMode === "manual") showNotification({
						status: 400,
						message: "<strong>meet-transcripts is not running</strong> <br /> Turn on captions using the CC icon, if needed"
					});
					else showNotification(this.state.extensionStatusJSON);
				});
			} catch (err) {
				this.state.isTranscriptDomErrorCaptured = true;
				handleContentError("001", err);
			}
		}
		async setupChat() {
			try {
				const chatContainer = await this.adapter.waitForChatContainer();
				this.adapter.openAndCloseChat(chatContainer);
				const chatLiveRegion = await waitForElement(`div[aria-live="polite"].Ge9Kpc`);
				if (!chatLiveRegion) throw new Error("Chat live region not found");
				this.observerManager.attachChat(chatLiveRegion);
			} catch (err) {
				this.state.isChatMessagesDomErrorCaptured = true;
				handleContentError("003", err);
			}
		}
		wireEndButton() {
			try {
				const clickTarget = Array.from(document.querySelectorAll(".google-symbols")).find((el) => el.textContent === "call_end")?.parentElement?.parentElement;
				if (!clickTarget) throw new Error("Call end button not found in DOM");
				clickTarget.addEventListener("click", () => this.end("user_click"));
			} catch (err) {
				handleContentError("004", err);
			}
		}
		end(reason) {
			if (this.state.hasMeetingEnded) return;
			this.state.hasMeetingEnded = true;
			this.observerManager.detach();
			detachPipObserver();
			document.removeEventListener("visibilitychange", this.handleVisibilityChange);
			window.removeEventListener("pagehide", this.handlePageHide);
			if (this.state.personNameBuffer !== "" && this.state.transcriptTextBuffer !== "") pushBufferToTranscript();
			persistStateAndSignalEnd(["transcript", "chatMessages"], reason).catch(console.error);
		}
	};
	//#endregion
	//#region src/platforms/google-meet/adapter.ts
	var MEETING_END_SELECTOR = ".google-symbols";
	var MEETING_END_TEXT = "call_end";
	var CAPTIONS_SELECTOR = ".google-symbols";
	var CAPTIONS_TEXT = "closed_caption_off";
	var CAPTION_CONTAINER_SELECTOR = "div[role=\"region\"][tabindex=\"0\"]";
	var USERNAME_SELECTOR = ".awLEm";
	var TITLE_SELECTOR = ".u6vdEc";
	var CHAT_SELECTOR = ".google-symbols";
	var CHAT_TEXT = "chat";
	var CHAT_LIVE_REGION = `div[aria-live="polite"].Ge9Kpc`;
	var GoogleMeetAdapter = {
		name: "Google Meet",
		urlMatches: ["https://meet.google.com/*"],
		urlExcludeMatches: ["https://meet.google.com/", "https://meet.google.com/landing"],
		captionContainerSelector: CAPTION_CONTAINER_SELECTOR,
		userNameSelector: USERNAME_SELECTOR,
		waitForMeetingStart: () => waitForElement(MEETING_END_SELECTOR, MEETING_END_TEXT).then((el) => el),
		waitForCaptionsReady: () => waitForElement(CAPTIONS_SELECTOR, CAPTIONS_TEXT).then((el) => el),
		waitForChatContainer: () => waitForElement(CHAT_SELECTOR, CHAT_TEXT).then(() => {
			selectElements(CHAT_SELECTOR, CHAT_TEXT)[0]?.click();
			return waitForElement(CHAT_LIVE_REGION).then((el) => el);
		}),
		enableCaptions: (captionsElement) => {
			captionsElement.click();
		},
		openAndCloseChat: (chatElement) => {
			chatElement.click();
		},
		waitForTitleElement: () => waitForElement(TITLE_SELECTOR).then((el) => el),
		parseTranscriptMutation(mutation, _currentUser) {
			if (mutation.type !== "characterData") return null;
			const mutationTargetElement = mutation.target.parentElement;
			const transcriptUIBlocks = [...mutationTargetElement?.parentElement?.parentElement?.children ?? []];
			if (!(transcriptUIBlocks[transcriptUIBlocks.length - 3] === mutationTargetElement?.parentElement)) return null;
			const currentPersonName = (mutationTargetElement?.previousSibling)?.textContent;
			const currentTranscriptText = mutationTargetElement?.textContent;
			if (!currentPersonName || !currentTranscriptText) return null;
			Array.from(transcriptUIBlocks[transcriptUIBlocks.length - 3]?.children ?? []).forEach((item) => {
				item.setAttribute("style", "opacity:0.2");
			});
			return {
				personName: currentPersonName,
				text: currentTranscriptText
			};
		},
		parseChatMutation(chatRoot, currentUser) {
			if (chatRoot.children.length === 0) return null;
			const chatMessageElement = chatRoot.lastChild?.firstChild?.firstChild?.lastChild;
			const personAndTimestampElement = chatMessageElement?.firstChild;
			const personName = personAndTimestampElement?.childNodes.length === 1 ? currentUser : personAndTimestampElement?.firstChild?.textContent ?? null;
			const text = (chatMessageElement?.lastChild?.lastChild?.firstChild?.firstChild?.firstChild)?.textContent ?? null;
			if (!personName || !text) return null;
			return {
				personName,
				text
			};
		}
	};
	//#endregion
	//#region src/platforms/google-meet/index.ts
	function checkExtensionStatus() {
		return new Promise((resolve) => {
			state.extensionStatusJSON = {
				status: 200,
				message: "<strong>meet-transcripts is running</strong> <br /> Do not turn off captions"
			};
			resolve("Extension status set to operational");
		});
	}
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
		if (state.extensionStatusJSON?.status === 200) {
			waitForElement(".awLEm").then(() => {
				const captureInterval = setInterval(() => {
					if (!state.hasMeetingStarted) {
						const name = document.querySelector(".awLEm")?.textContent;
						if (name) {
							state.userName = name;
							clearInterval(captureInterval);
						}
					} else clearInterval(captureInterval);
				}, 100);
			});
			new MeetingSession(GoogleMeetAdapter, state, ChromeStorage).start();
			initializePipCapture();
		} else showNotification(state.extensionStatusJSON);
	});
	//#endregion
})();
