/**
 * settings.ts - Полный файл настроек с поддержкой актёров
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianTMDBPlugin from "../main";
import { t } from "../i18n";

export interface ObsidianTMDBPluginSettings {
	// API settings
	apiToken: string;
	language: string;

	// Image settings
	saveImagesLocally: boolean;
	imagesFolder: string;
	savePosterImage: boolean;
	saveCoverImage: boolean;
	saveLogoImage: boolean;

	// Movie settings
	movieFileNameFormat: string;
	movieFolder: string;
	movieTemplateFile: string;

	// Series settings
	seriesFileNameFormat: string;
	seriesFolder: string;
	seriesTemplateFile: string;

	// Actor settings
	actorFolder: string;
	actorTemplateFile: string;
	actorFileNameFormat: string;

	// Mobile settings
	coverHeightMultiplier: number;

	// Person path settings
	actorsPath: string;
	directorsPath: string;
	writersPath: string;
	producersPath: string;

	autoFillOnCreate: boolean;
}

export const DEFAULT_SETTINGS: ObsidianTMDBPluginSettings = {
	// API settings
	apiToken: "",
	language: "ru",

	// Image settings
	saveImagesLocally: true,
	imagesFolder: "attachments/TMDB",
	savePosterImage: true,
	saveCoverImage: true,
	saveLogoImage: true,

	// Movie settings
	movieFileNameFormat: "{{nameForFile}} ({{year}})",
	movieFolder: "Movies",
	movieTemplateFile: "",

	// Series settings
	seriesFileNameFormat: "{{nameForFile}} ({{year}})",
	seriesFolder: "Series",
	seriesTemplateFile: "",

	// Actor settings
	actorFolder: "Люди/Актёры",
	actorTemplateFile: "",
	actorFileNameFormat: "{{id}}",

	// Mobile settings
	coverHeightMultiplier: 1.5,

	// Person path settings
	actorsPath: "Люди/Актёры",
	directorsPath: "Люди/Режиссёры",
	writersPath: "Люди/Сценаристы",
	producersPath: "Люди/Продюсеры",

	autoFillOnCreate: false,
};

export class ObsidianTMDBSettingTab extends PluginSettingTab {
	plugin: ObsidianTMDBPlugin;

	constructor(app: App, plugin: ObsidianTMDBPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("obsidian-TMDB-plugin__settings");

		// Language setting
		new Setting(containerEl)
			.setName(t("settings.language"))
			.setDesc(t("settings.languageDesc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("ru", "Русский")
					.addOption("en", "English")
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value;
						await this.plugin.saveSettings();
						// Reload language
						const { initializeLanguage } = await import("../i18n");
						initializeLanguage(value);
					})
			);

		// API Token
		new Setting(containerEl)
			.setName(t("settings.apiToken"))
			.setDesc(
				createFragment((frag) => {
					frag.createDiv({ text: t("settings.apiTokenDesc") });
					frag.createEl("a", {
						text: t("settings.getApiToken"),
						href: "https://www.themoviedb.org/settings/api",
					});
				})
			)
			.addText((text) =>
				text
					.setPlaceholder(t("settings.apiTokenPlaceholder"))
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText(t("settings.validateToken"))
					.setCta()
					.onClick(async () => {
						const { validateApiToken } = await import(
							"../APIProvider/provider"
						);
						const isValid = await validateApiToken(
							this.plugin.settings.apiToken
						);
						const tokenInput = containerEl.querySelector(
							".setting-item-control input"
						) as HTMLInputElement;
						if (tokenInput) {
							if (isValid) {
								tokenInput.classList.add("TMDB-plugin__token-valid");
								tokenInput.classList.remove("TMDB-plugin__token-invalid");
							} else {
								tokenInput.classList.add("TMDB-plugin__token-invalid");
								tokenInput.classList.remove("TMDB-plugin__token-valid");
							}
						}
					})
			);

		// Images section
		containerEl.createEl("h3", { text: t("settings.imagesHeading") });

		new Setting(containerEl)
			.setName(t("settings.saveImagesLocally"))
			.setDesc(t("settings.saveImagesLocallyDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.saveImagesLocally)
					.onChange(async (value) => {
						this.plugin.settings.saveImagesLocally = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.imagesFolder"))
			.setDesc(t("settings.imagesFolderDesc"))
			.addSearch((search) =>
				search
					.setPlaceholder("attachments/TMDB")
					.setValue(this.plugin.settings.imagesFolder)
					.onChange(async (value) => {
						this.plugin.settings.imagesFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.savePosterImage"))
			.setDesc(t("settings.savePosterImageDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.savePosterImage)
					.onChange(async (value) => {
						this.plugin.settings.savePosterImage = value;
						await this.plugin.saveSettings();
					})
			);


		// Actor section
		containerEl.createEl("h3", { text: "Настройки актёров" });

		new Setting(containerEl)
			.setName("Формат имени файла актёра")
			.setDesc("Доступные переменные: {{id}}, {{nameForFile}}, {{enNameForFile}}")
			.addText((text) =>
				text
					.setPlaceholder("{{id}}")
					.setValue(this.plugin.settings.actorFileNameFormat)
					.onChange(async (value) => {
						this.plugin.settings.actorFileNameFormat = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Папка для актёров")
			.setDesc("Папка, в которой будут создаваться заметки об актёрах")
			.addSearch((search) =>
				search
					.setPlaceholder("Люди/Актёры")
					.setValue(this.plugin.settings.actorFolder)
					.onChange(async (value) => {
						this.plugin.settings.actorFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Шаблон для актёров")
			.setDesc("Файл шаблона для создания заметок об актёрах")
			.addSearch((search) =>
				search
					.setPlaceholder("Templates/actor.md")
					.setValue(this.plugin.settings.actorTemplateFile)
					.onChange(async (value) => {
						this.plugin.settings.actorTemplateFile = value;
						await this.plugin.saveSettings();
					})
			);

		// Внутри класса ObsidianTMDBSettingTab в методе display()

		new Setting(containerEl)
			.setName("Auto-fill on create")
			.setDesc("Automatically search TMDB when a new file is created in movie/series/actor folders")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoFillOnCreate)
					.onChange(async (value) => {
						this.plugin.settings.autoFillOnCreate = value;
						await this.plugin.saveSettings();
					})
			);

	}
}