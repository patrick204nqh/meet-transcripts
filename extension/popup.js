(function() {
	//#region src/pages/popup/index.ts
	document.addEventListener("DOMContentLoaded", () => {
		const autoModeRadio = document.querySelector("#auto-mode");
		const manualModeRadio = document.querySelector("#manual-mode");
		const modeDesc = document.querySelector("#mode-desc");
		const versionEl = document.querySelector("#version");
		const statusDot = document.querySelector("#status-dot");
		const statusLabel = document.querySelector("#status-label");
		const statusMeeting = document.querySelector("#status-meeting");
		const statusMeetingTitle = document.querySelector("#status-meeting-title");
		if (versionEl) versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
		function setStatusIdle() {
			if (statusDot) statusDot.className = "status-dot idle";
			if (statusLabel) {
				statusLabel.className = "status-label idle";
				statusLabel.textContent = "Open a Google Meet to start";
			}
			if (statusMeeting) statusMeeting.hidden = true;
		}
		function setStatusReady() {
			if (statusDot) statusDot.className = "status-dot ready";
			if (statusLabel) {
				statusLabel.className = "status-label ready";
				statusLabel.textContent = "Ready on Google Meet";
			}
			if (statusMeeting) statusMeeting.hidden = true;
		}
		function setStatusRecording(title) {
			if (statusDot) statusDot.className = "status-dot recording";
			if (statusLabel) {
				statusLabel.className = "status-label recording";
				statusLabel.textContent = "Recording";
			}
			if (statusMeeting) statusMeeting.hidden = false;
			if (statusMeetingTitle) statusMeetingTitle.textContent = title ?? "Google Meet call";
		}
		function updateStatus() {
			chrome.tabs.query({
				active: true,
				currentWindow: true
			}, (tabs) => {
				const tab = tabs[0];
				if (!!!tab?.url?.startsWith("https://meet.google.com/")) {
					setStatusIdle();
					return;
				}
				chrome.storage.local.get(["meetingTabId", "title"], (result) => {
					const meetingTabId = result["meetingTabId"];
					const title = result["title"];
					if (tab.id !== void 0 && meetingTabId === tab.id) setStatusRecording(title);
					else setStatusReady();
				});
			});
		}
		updateStatus();
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === "local" && ("meetingTabId" in changes || "title" in changes)) updateStatus();
		});
		document.querySelector("#open-app")?.addEventListener("click", () => {
			const appUrl = chrome.runtime.getURL("app.html");
			chrome.tabs.query({ url: appUrl }, (tabs) => {
				if (tabs.length > 0 && tabs[0]?.id !== void 0) {
					chrome.tabs.update(tabs[0].id, { active: true });
					if (tabs[0].windowId !== void 0) chrome.windows.update(tabs[0].windowId, { focused: true });
				} else chrome.tabs.create({ url: `${appUrl}#meetings` });
			});
		});
		const modeDescriptions = {
			auto: "Captures every meeting automatically",
			manual: "Manually decide when to start and stop capture"
		};
		function updateModeDesc(mode) {
			if (modeDesc) modeDesc.textContent = modeDescriptions[mode];
		}
		chrome.storage.sync.get(["operationMode"], (result) => {
			const mode = result["operationMode"] ?? "auto";
			if (autoModeRadio && manualModeRadio) {
				if (mode === "manual") manualModeRadio.checked = true;
				else autoModeRadio.checked = true;
				updateModeDesc(mode);
				autoModeRadio.addEventListener("change", () => {
					chrome.storage.sync.set({ operationMode: "auto" });
					updateModeDesc("auto");
				});
				manualModeRadio.addEventListener("change", () => {
					chrome.storage.sync.set({ operationMode: "manual" });
					updateModeDesc("manual");
				});
			}
		});
	});
	//#endregion
})();
