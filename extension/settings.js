(function() {
	//#region src/pages/settings/index.ts
	function showToast(message, type = "info", duration = 4e3) {
		const container = document.getElementById("toast-container");
		if (!container) return;
		const toast = document.createElement("div");
		toast.className = `toast toast-${type}`;
		toast.setAttribute("role", type === "error" ? "alert" : "status");
		toast.textContent = message;
		container.appendChild(toast);
		setTimeout(() => toast.remove(), duration);
	}
	function requestWebhookPermission(url) {
		const { protocol, hostname } = new URL(url);
		return chrome.permissions.request({ origins: [`${protocol}//${hostname}/*`] }).then((granted) => {
			if (!granted) throw new Error("Permission denied");
		});
	}
	document.addEventListener("DOMContentLoaded", () => {
		const autoModeRadio = document.querySelector("#auto-mode");
		const manualModeRadio = document.querySelector("#manual-mode");
		chrome.storage.sync.get(["operationMode"], (result) => {
			const mode = result["operationMode"] ?? "auto";
			if (autoModeRadio && manualModeRadio) {
				if (mode === "manual") manualModeRadio.checked = true;
				else autoModeRadio.checked = true;
				autoModeRadio.addEventListener("change", () => chrome.storage.sync.set({ operationMode: "auto" }));
				manualModeRadio.addEventListener("change", () => chrome.storage.sync.set({ operationMode: "manual" }));
			}
		});
		const autoDownloadCheckbox = document.querySelector("#auto-download-file");
		const autoPostCheckbox = document.querySelector("#auto-post-webhook");
		chrome.storage.sync.get(["autoDownloadFileAfterMeeting", "autoPostWebhookAfterMeeting"], (result) => {
			if (autoDownloadCheckbox) {
				autoDownloadCheckbox.checked = result["autoDownloadFileAfterMeeting"] !== false;
				autoDownloadCheckbox.addEventListener("change", () => {
					chrome.storage.sync.set({ autoDownloadFileAfterMeeting: autoDownloadCheckbox.checked });
				});
			}
			if (autoPostCheckbox) {
				autoPostCheckbox.checked = !!result["autoPostWebhookAfterMeeting"];
				autoPostCheckbox.addEventListener("change", () => {
					chrome.storage.sync.set({ autoPostWebhookAfterMeeting: autoPostCheckbox.checked });
				});
			}
		});
		const webhookForm = document.querySelector("#webhook-url-form");
		const webhookUrlInput = document.querySelector("#webhook-url");
		const saveWebhookBtn = document.querySelector("#save-webhook");
		if (saveWebhookBtn) saveWebhookBtn.disabled = true;
		chrome.storage.sync.get(["webhookUrl"], (result) => {
			const saved = result["webhookUrl"];
			if (webhookUrlInput && saved) {
				webhookUrlInput.value = saved;
				if (saveWebhookBtn) saveWebhookBtn.disabled = !webhookUrlInput.checkValidity();
			}
		});
		webhookUrlInput?.addEventListener("input", () => {
			if (saveWebhookBtn && webhookUrlInput) saveWebhookBtn.disabled = !webhookUrlInput.checkValidity();
		});
		webhookForm?.addEventListener("submit", (e) => {
			e.preventDefault();
			const url = webhookUrlInput?.value ?? "";
			if (url === "") {
				chrome.storage.sync.set({ webhookUrl: "" }, () => showToast("Webhook URL cleared.", "success"));
				return;
			}
			if (webhookUrlInput && webhookUrlInput.checkValidity()) requestWebhookPermission(url).then(() => {
				chrome.storage.sync.set({ webhookUrl: url }, () => showToast("Webhook URL saved.", "success"));
			}).catch((err) => {
				showToast("Permission required. Click Save again to retry.", "error");
				console.error("Webhook permission error:", err);
			});
		});
		const simpleRadio = document.querySelector("#simple-webhook-body");
		const advancedRadio = document.querySelector("#advanced-webhook-body");
		chrome.storage.sync.get(["webhookBodyType"], (result) => {
			const type = result["webhookBodyType"] ?? "simple";
			if (simpleRadio && advancedRadio) {
				if (type === "advanced") advancedRadio.checked = true;
				else simpleRadio.checked = true;
				simpleRadio.addEventListener("change", () => chrome.storage.sync.set({ webhookBodyType: "simple" }));
				advancedRadio.addEventListener("change", () => chrome.storage.sync.set({ webhookBodyType: "advanced" }));
			}
		});
	});
	//#endregion
})();
