import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

export class StatusSelectionModal extends Modal {
	private selectedStatus: string | null = null;
	private onChooseStatus: (status: string | null) => void;

	constructor(app: App, private statusOptions: string[], onChooseStatus: (status: string | null) => void) {
		super(app);
		this.onChooseStatus = onChooseStatus;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("TMDB-plugin__status-selection-modal");

		contentEl.createEl("h2", { text: t("status.selectStatus") });

		// Create a container for the status options
		const optionsContainer = contentEl.createDiv({ cls: "status-options-container" });

		// Add each status option as clickable text with emojis
		this.statusOptions.forEach((status) => {
			// Map status to emoji
			const statusEmojis: { [key: string]: string } = {
				[t("status.willWatch")]: "🎬",
				[t("status.haveWatched")]: "✅",
				[t("status.watching")]: "📺",
				[t("status.dropped")]: "⏸️"
			};

			const emoji = statusEmojis[status] || "⭐"; // Default emoji if not found
			const displayName = `${emoji} ${status}`;

			const setting = new Setting(optionsContainer)
				.setName(displayName);

			// Make the entire setting clickable
			setting.settingEl.style.cursor = "pointer";
			setting.settingEl.onclick = () => {
				this.selectedStatus = status; // Store the text without emoji
				this.close();
			};
		});

		// Add a "Skip" option
		const skipSetting = new Setting(contentEl)
			.setName(t("status.skip"))
			.setDesc(`${t("status.useDefault")} (${t("status.defaultStatus")})`);

		skipSetting.settingEl.style.cursor = "pointer";
		skipSetting.settingEl.onclick = () => {
			this.selectedStatus = null; // Will use default
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.onChooseStatus(this.selectedStatus);
	}
}