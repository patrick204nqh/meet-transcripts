(function() {
	//#region src/pages/meetings/index.ts
	var NO_MEETINGS = "013";
	var EMPTY_TRANSCRIPT = "014";
	var isMeetingsTableExpanded = false;
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
	function showConfirm(message, onConfirm) {
		const container = document.getElementById("toast-container");
		if (!container) return;
		container.querySelector(".toast-confirm")?.remove();
		const toast = document.createElement("div");
		toast.className = "toast toast-confirm";
		const msg = document.createElement("p");
		msg.style.margin = "0";
		msg.textContent = message;
		const actions = document.createElement("div");
		actions.className = "toast-confirm-actions";
		const yes = document.createElement("button");
		yes.className = "toast-confirm-yes";
		yes.textContent = "Delete";
		const no = document.createElement("button");
		no.className = "toast-confirm-no";
		no.textContent = "Cancel";
		actions.append(yes, no);
		toast.append(msg, actions);
		container.appendChild(toast);
		yes.addEventListener("click", () => {
			onConfirm();
			toast.remove();
		});
		no.addEventListener("click", () => toast.remove());
		setTimeout(() => {
			if (toast.isConnected) toast.remove();
		}, 15e3);
	}
	function requestWebhookPermission(url) {
		const { protocol, hostname } = new URL(url);
		return chrome.permissions.request({ origins: [`${protocol}//${hostname}/*`] }).then((granted) => {
			if (!granted) throw new Error("Permission denied");
		});
	}
	function getDuration(startTimestamp, endTimestamp) {
		const ms = new Date(endTimestamp).getTime() - new Date(startTimestamp).getTime();
		const totalMinutes = Math.round(ms / 6e4);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes}m`;
	}
	function loadMeetings() {
		const meetingsTable = document.querySelector("#meetings-table");
		if (!meetingsTable) return;
		chrome.storage.local.get(["meetings"], (result) => {
			const meetings = result["meetings"] ?? [];
			meetingsTable.innerHTML = "";
			if (meetings.length === 0) {
				meetingsTable.innerHTML = `<tr><td colspan="5" style="color: var(--text-2); text-align: center; padding: 2rem;">Your next meeting will appear here</td></tr>`;
				return;
			}
			for (let i = meetings.length - 1; i >= 0; i--) {
				const meeting = meetings[i];
				const row = document.createElement("tr");
				const tdTitle = document.createElement("td");
				const titleDiv = document.createElement("div");
				titleDiv.contentEditable = "true";
				titleDiv.className = "meeting-title";
				titleDiv.dataset["index"] = String(i);
				titleDiv.title = "Rename";
				titleDiv.setAttribute("role", "textbox");
				titleDiv.setAttribute("aria-label", `Rename meeting title: ${meeting.title ?? "Google Meet call"}`);
				titleDiv.textContent = meeting.title ?? "Google Meet call";
				tdTitle.appendChild(titleDiv);
				row.appendChild(tdTitle);
				const tdSoftware = document.createElement("td");
				tdSoftware.textContent = meeting.software ?? "";
				row.appendChild(tdSoftware);
				const tdTime = document.createElement("td");
				tdTime.textContent = `${new Date(meeting.startTimestamp).toLocaleString()}  ●  ${getDuration(meeting.startTimestamp, meeting.endTimestamp)}`;
				row.appendChild(tdTime);
				const tdStatus = document.createElement("td");
				const badge = document.createElement("span");
				badge.className = "badge";
				const [cls, label] = {
					successful: ["status-success", "Successful"],
					failed: ["status-failed", "Failed"],
					new: ["status-new", "New"]
				}[meeting.webhookPostStatus] ?? ["status-new", "Pending"];
				badge.classList.add(cls);
				badge.textContent = label;
				tdStatus.appendChild(badge);
				row.appendChild(tdStatus);
				const tdActions = document.createElement("td");
				const actionsDiv = document.createElement("div");
				actionsDiv.style.cssText = "display: flex; gap: 1rem; justify-content: end";
				const downloadBtn = document.createElement("button");
				downloadBtn.className = "download-button";
				downloadBtn.title = "Download";
				downloadBtn.setAttribute("aria-label", "Download this meeting transcript");
				const dlImg = document.createElement("img");
				dlImg.src = "./icons/download.svg";
				dlImg.alt = "";
				downloadBtn.appendChild(dlImg);
				const postBtn = document.createElement("button");
				postBtn.className = "post-button";
				postBtn.title = meeting.webhookPostStatus === "new" ? "Post webhook" : "Repost webhook";
				postBtn.setAttribute("aria-label", postBtn.title);
				const postImg = document.createElement("img");
				postImg.src = "./icons/webhook.svg";
				postImg.alt = "";
				postBtn.appendChild(postImg);
				const deleteBtn = document.createElement("button");
				deleteBtn.className = "delete-button";
				deleteBtn.title = "Delete";
				deleteBtn.setAttribute("aria-label", "Delete this meeting");
				const delImg = document.createElement("img");
				delImg.src = "./icons/delete.svg";
				delImg.alt = "";
				deleteBtn.appendChild(delImg);
				actionsDiv.append(downloadBtn, postBtn, deleteBtn);
				tdActions.appendChild(actionsDiv);
				row.appendChild(tdActions);
				meetingsTable.appendChild(row);
				titleDiv.addEventListener("blur", () => {
					meetings[i] = {
						...meeting,
						title: titleDiv.innerText
					};
					chrome.storage.local.set({ meetings });
				});
				downloadBtn.addEventListener("click", () => {
					chrome.runtime.sendMessage({
						v: 1,
						type: "download_transcript_at_index",
						index: i
					}, (response) => {
						if (!response?.success && response?.message) {
							showToast("Could not download transcript.", "error");
							console.error(response.message.errorMessage);
						}
					});
				});
				postBtn.addEventListener("click", () => {
					chrome.storage.sync.get(["webhookUrl"], (result) => {
						const webhookUrl = result["webhookUrl"];
						if (!webhookUrl) {
							showToast("Please configure a webhook URL in Settings first.", "info");
							return;
						}
						requestWebhookPermission(webhookUrl).then(() => {
							postBtn.disabled = true;
							postBtn.textContent = meeting.webhookPostStatus === "new" ? "Posting…" : "Reposting…";
							chrome.runtime.sendMessage({
								v: 1,
								type: "post_webhook_at_index",
								index: i
							}, (response) => {
								loadMeetings();
								if (response?.success) showToast("Posted successfully!", "success");
								else {
									if (response?.message) console.error(response.message.errorMessage);
									showToast("Failed to post webhook.", "error");
								}
							});
						}).catch((err) => {
							showToast("Webhook permission required. Configure your URL in Settings.", "error");
							console.error("Webhook permission error:", err);
						});
					});
				});
				deleteBtn.addEventListener("click", () => {
					showConfirm(`Delete "${meeting.title ?? "Google Meet call"}"?`, () => {
						meetings.splice(i, 1);
						chrome.storage.local.set({ meetings }, () => loadMeetings());
					});
				});
			}
			const container = document.querySelector("#meetings-table-container");
			if (!isMeetingsTableExpanded && container && container.clientHeight > 280) {
				container.classList.add("fade-mask");
				document.querySelector("#show-all")?.setAttribute("style", "display: block");
			}
		});
	}
	document.addEventListener("DOMContentLoaded", () => {
		const recoverBtn = document.querySelector("#recover-last-meeting");
		const showAllBtn = document.querySelector("#show-all");
		loadMeetings();
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") loadMeetings();
		});
		chrome.storage.onChanged.addListener(() => loadMeetings());
		recoverBtn?.addEventListener("click", () => {
			chrome.runtime.sendMessage({
				v: 1,
				type: "recover_last_meeting"
			}, (response) => {
				loadMeetings();
				scrollTo({
					top: 0,
					behavior: "smooth"
				});
				if (response?.success) showToast(response.message === "No recovery needed" ? "No unprocessed meetings found." : "Last meeting recovered successfully!", response.message === "No recovery needed" ? "info" : "success");
				else {
					const err = response?.message;
					if (err?.errorCode === NO_MEETINGS || err?.errorCode === EMPTY_TRANSCRIPT) showToast("No unprocessed meetings found.", "info");
					else {
						showToast("Could not recover last meeting.", "error");
						if (err?.errorMessage) console.error(err.errorMessage);
					}
				}
			});
		});
		showAllBtn?.addEventListener("click", () => {
			document.querySelector("#meetings-table-container")?.classList.remove("fade-mask");
			showAllBtn.setAttribute("style", "display:none;");
			isMeetingsTableExpanded = true;
		});
	});
	//#endregion
})();
