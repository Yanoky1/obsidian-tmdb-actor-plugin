/**
 * main.ts
 *
 * Main plugin class for TMDB API integration in Obsidian.
 * Coordinates the entire workflow of searching and creating movie/series notes.
 */

import { Notice, Plugin, TFile, TAbstractFile } from "obsidian";
import { SearchModal } from "Views/search_modal";
import { ItemsSuggestModal } from "Views/suggest_modal";
import { TMDBSuggestItem } from "Models/TMDB_response";
import { MovieShow } from "Models/MovieShow.model";
import { TMDBProvider } from "./APIProvider/provider";
import { StatusSelectionModal } from "Views/status_selection_modal";
import { t } from "./i18n";
import {
	ObsidianTMDBPluginSettings,
	DEFAULT_SETTINGS,
	ObsidianTMDBSettingTab,
} from "Settings/settings";
import {
	makeFileName,
	getTemplateContents,
	replaceVariableSyntax,
} from "Utils/utils";
import { CursorJumper } from "Utils/cursor_jumper";
import { initializeLanguage } from "./i18n";

export default class ObsidianTMDBPlugin extends Plugin {
	settings: ObsidianTMDBPluginSettings;

	async onload() {
		await this.loadSettings();

		// Initialize language from settings or auto-detect
		initializeLanguage(this.settings.language);

		this.addRibbonIcon("user", "Search actors in TMDB", () => {
			this.createNewNote();
		});

		this.addCommand({
			id: "search",
			name: "Search",
			callback: () => {
				this.createNewNote();
			},
		});

		// this.addCommand({
		// 	id: "analyze-res-notes",
		// 	name: "Analyze current note for _res poster and update ratings",
		// 	callback: async () => {
		// 		await this.analyzeResNotes();
		// 	},
		// });

		// this.addCommand({
		// 	id: "analyze-all-res-notes",
		// 	name: "Analyze all notes in movie/series folders for _res poster and update ratings",
		// 	callback: async () => {
		// 		await this.analyzeAllResNotes();
		// 	},
		// });

		this.registerEvent(
			this.app.vault.on('create', (file: TAbstractFile) => {
				if (file instanceof TFile) {
					this.onFileCreated(file);
				}
			})
		);

		this.addSettingTab(new ObsidianTMDBSettingTab(this.app, this));

		// Setup file deletion listener
		this.setupFileDeletionListener();

		// Setup file creation listener
		this.setupFileCreationListener();
	}

	// Setup file creation listener to handle new file events
	private setupFileCreationListener(): void {
		// Listen for file creations in the vault
		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (file instanceof TFile) {
					await this.handleFileCreation(file);
				}
			})
		);
	}

	// Handle file creation event
	private async handleFileCreation(file: TFile): Promise<void> {
		console.log(`[FileCreation] New file created: ${file.path}`);
		// Add any specific logic for handling new files here
	}

	// Setup file deletion listener to automatically remove associated media files
	private setupFileDeletionListener(): void {
		// Listen for file deletions in the vault
		this.registerEvent(
			this.app.vault.on('delete', async (file) => {
				if (file instanceof TFile) {
					await this.handleFileDeletion(file);
				}
			})
		);
	}

	// Handle file deletion by removing associated media files
	private async handleFileDeletion(file: TFile): Promise<void> {
		// Check if the deleted file is in one of our configured folders
		const movieFolderPath = this.settings.movieFolder;
		const seriesFolderPath = this.settings.seriesFolder;

		const isInMovieFolder = movieFolderPath && file.path.startsWith(movieFolderPath);
		const isInSeriesFolder = seriesFolderPath && file.path.startsWith(seriesFolderPath);

		if (!isInMovieFolder && !isInSeriesFolder) {
			return; // File is not in our configured folders
		}

		// Extract the base name (without extension) from the deleted file
		const fileNameWithoutExt = file.basename;

		if (!fileNameWithoutExt) {
			return; // No valid name to match against
		}

		console.log(`[FileDeletion] Detected deletion of: ${file.path}, looking for associated media files...`);

		// Find files that contain the same name as the deleted file anywhere in the vault
		const filesToDelete = [];
		const allFiles = this.app.vault.getFiles();

		// Create a more flexible search pattern - look for files that start with the note name
		// or contain the note name followed by common separators like '_', '-', or '.'
		const searchPattern = new RegExp(`^${this.escapeRegExp(fileNameWithoutExt)}(?:_|-|\\.\\w|$)`, 'i');

		for (const vaultFile of allFiles) {
			// Check if the file is a media file and its name relates to the deleted file
			if ((vaultFile.extension === 'jpg' || vaultFile.extension === 'jpeg' ||
				vaultFile.extension === 'png' || vaultFile.extension === 'gif' ||
				vaultFile.extension === 'webp') &&
				// Match files that start with the note name or contain it in a meaningful way
				(vaultFile.name.toLowerCase().startsWith(fileNameWithoutExt.toLowerCase()) ||
					vaultFile.name.toLowerCase().includes(fileNameWithoutExt.toLowerCase() + '_') ||
					vaultFile.name.toLowerCase().includes(fileNameWithoutExt.toLowerCase() + '-') ||
					searchPattern.test(vaultFile.name))) {
				filesToDelete.push(vaultFile);
			}
		}

		// Delete the associated media files
		for (const mediaFile of filesToDelete) {
			try {
				await this.app.vault.delete(mediaFile);
				console.log(`[FileDeletion] Deleted associated media file: ${mediaFile.path}`);
			} catch (error) {
				console.error(`[FileDeletion] Error deleting media file ${mediaFile.path}:`, error);
			}
		}

		if (filesToDelete.length > 0) {
			new Notice(`Deleted ${filesToDelete.length} associated media file(s) for: ${fileNameWithoutExt}`);
		}
	}

	// Helper function to escape special regex characters
	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// Shows error notification to user
	showNotice(error: Error) {
		try {
			new Notice(error.message);
		} catch {
			// eslint-disable
		}
	}

	// Полный метод createNewNote() с правильной обработкой актёров

	async createNewNote(): Promise<void> {
		try {
			console.log('[Main] Starting createNewNote');
			const movieShow = await this.searchMovieShow();

			console.log('[Main] Movie/Show/Person received:', {
				id: movieShow.id,
				name: movieShow.name,
				type: movieShow.type,
				isSeries: movieShow.isSeries,
				year: movieShow.year
			});

			const {
				movieFileNameFormat,
				movieFolder,
				seriesFileNameFormat,
				seriesFolder,
				actorFolder,           // Папка для актёров
				actorFileNameFormat    // Формат имени файла для актёров
			} = this.settings;

			// Определить папку и формат имени файла в зависимости от типа
			let fileNameFormat: string;
			let folderPath: string;

			// Проверяем тип - может быть строкой или массивом
			const itemType = Array.isArray(movieShow.type) ? movieShow.type[0] : movieShow.type;

			console.log('[Main] Item type detected:', itemType);

			// Проверяем на 'person' или 'Персона' (русский перевод)
			if (itemType === 'person' || itemType === 'Персона' || itemType.toLowerCase().includes('person')) {
				fileNameFormat = actorFileNameFormat || '{{id}}';
				folderPath = actorFolder || movieFolder;
				console.log('[Main] Using actor settings:', { fileNameFormat, folderPath });
			} else if (movieShow.isSeries) {
				fileNameFormat = seriesFileNameFormat;
				folderPath = seriesFolder;
				console.log('[Main] Using series settings');
			} else {
				fileNameFormat = movieFileNameFormat;
				folderPath = movieFolder;
				console.log('[Main] Using movie settings');
			}

			// Set the status in the movieShow object before rendering the template
			const status = (movieShow as any).status || t("status.willWatch");
			movieShow.status = [status];

			const finalContents = await this.getRenderedContents(movieShow);

			// Create folder if it doesn't exist
			if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
				await this.app.vault.createFolder(folderPath);
			}

			const fileName = await makeFileName(
				this.app,
				movieShow,
				fileNameFormat,
				folderPath
			);

			console.log('[Main] Creating file with name:', fileName);

			const filePath = `${folderPath}/${fileName}`;
			const targetFile = await this.app.vault.create(
				filePath,
				finalContents
			);
			const newLeaf = this.app.workspace.getLeaf(true);
			if (!newLeaf) {
				console.warn("No new leaf");
				return;
			}
			await newLeaf.openFile(targetFile, { state: { mode: "preview" } });
			newLeaf.setEphemeralState({ rename: "all" });

			// Jump cursor to next template location
			await new CursorJumper(this.app).jumpToNextCursorLocation();
		} catch (err) {
			console.warn(err);
			this.showNotice(err);
		}
	}



	// Add status to content
	private addStatusToContent(content: string, status: string): string {
		// First escape any quotes in the status to prevent YAML issues
		const escapedStatus = status.replace(/"/g, '\\"');

		// Remove any {{status}} template variables from the content
		let processedContent = content.replace(/{{status}}/gi, escapedStatus);

		// If content has YAML frontmatter, add or update status there
		if (processedContent.startsWith('---')) {
			const frontmatterEndIndex = processedContent.indexOf('\n---\n', 3); // Find the end of frontmatter
			if (frontmatterEndIndex !== -1) {
				const frontmatter = processedContent.substring(0, frontmatterEndIndex + 5); // include \n---\n
				const body = processedContent.substring(frontmatterEndIndex + 5);

				// Check if status already exists in frontmatter and update it
				const statusPattern = new RegExp(`${t("common.status")}:\\s*["']?([^"'\n,}]+)["']?`, 'i');
				if (frontmatter.match(statusPattern)) {
					// Status exists, replace it
					const updatedFrontmatter = frontmatter.replace(statusPattern, `${t("common.status")}: "${escapedStatus}"`);
					return `${updatedFrontmatter}${body}`;
				} else {
					// Status doesn't exist, add it
					const updatedFrontmatter = frontmatter.replace('\n---\n', `\n${t("common.status")}: "${escapedStatus}"\n---\n`);
					return `${updatedFrontmatter}${body}`;
				}
			} else {
				// Alternative pattern for frontmatter end
				const altFrontmatterEndIndex = processedContent.indexOf('---\n', 4); // start after initial ---
				if (altFrontmatterEndIndex !== -1) {
					const frontmatter = processedContent.substring(0, altFrontmatterEndIndex + 4); // include ---\n
					const body = processedContent.substring(altFrontmatterEndIndex + 4);

					// Check if status already exists in frontmatter and update it
					const statusPattern = new RegExp(`${t("common.status")}:\\s*["']?([^"'\n,}]+)["']?`, 'i');
					if (frontmatter.match(statusPattern)) {
						// Status exists, replace it
						const updatedFrontmatter = frontmatter.replace(statusPattern, `${t("common.status")}: "${escapedStatus}"`);
						return `${updatedFrontmatter}${body}`;
					} else {
						// Status doesn't exist, add it
						const updatedFrontmatter = frontmatter.replace('---\n', `---\n${t("common.status")}: "${escapedStatus}"\n`);
						return `${updatedFrontmatter}${body}`;
					}
				}
			}
		}

		// If no frontmatter, return processed content
		return processedContent;
	}

	// Coordinates search process: search then select from results
	async searchMovieShow(): Promise<MovieShow> {
		const searchedItems = await this.openSearchModal();
		return await this.openSuggestModal(searchedItems);
	}

	// Opens search modal and returns found items
	async openSearchModal(): Promise<TMDBSuggestItem[]> {
		return new Promise((resolve, reject) => {
			return new SearchModal(this, (error, results) => {
				return error ? reject(error) : resolve(results ?? []);
			}).open();
		});
	}

	// Opens suggestion modal and returns detailed info about selected item
	async openSuggestModal(items: TMDBSuggestItem[]): Promise<MovieShow> {
		return new Promise((resolve, reject) => {
			return new ItemsSuggestModal(this, items, (error, selectedItem) => {
				return error ? reject(error) : resolve(selectedItem!);
			}).open();
		});
	}

	async getRenderedContents(movieShow: MovieShow) {
		const {
			movieTemplateFile,
			seriesTemplateFile,
			actorTemplateFile  // Добавить в настройки
		} = this.settings;

		// Определить тип
		const itemType = Array.isArray(movieShow.type) ? movieShow.type[0] : movieShow.type;

		let templateFile: string;

		if (itemType === 'person') {
			templateFile = actorTemplateFile || movieTemplateFile; // Fallback to movie template
		} else {
			templateFile = movieShow.isSeries ? seriesTemplateFile : movieTemplateFile;
		}

		if (templateFile) {
			const templateContents = await getTemplateContents(
				this.app,
				templateFile
			);
			const replacedVariable = replaceVariableSyntax(
				movieShow,
				templateContents
			);
			return replacedVariable;
		}
		return "";
	}
	// Analyzes all notes in configured folders for those with "_res" in poster filename or "КинопоискОценка"
	// Extracts title and rating, searches TMDB, and creates new notes with user rating - runs in background
	async analyzeAllResNotes(): Promise<void> {
		try {
			console.log('[AnalyzeAll] Starting analysis of all _res notes in configured folders');

			// Get all markdown files from both movie and series folders
			const movieFolderPath = this.settings.movieFolder;
			const seriesFolderPath = this.settings.seriesFolder;

			const movieFiles = movieFolderPath ?
				await this.app.vault.getMarkdownFiles()
					.filter(file => file.path.startsWith(movieFolderPath)) : [];
			const seriesFiles = seriesFolderPath && seriesFolderPath !== movieFolderPath ?
				await this.app.vault.getMarkdownFiles()
					.filter(file => file.path.startsWith(seriesFolderPath)) : [];

			// Combine unique files from both folders
			const allFiles = [...new Set([...movieFiles, ...seriesFiles])];

			console.log(`[AnalyzeAll] Found ${allFiles.length} markdown files in configured folders`);

			if (allFiles.length === 0) {
				new Notice("No files found in configured folders.");
				return;
			}

			// Show initial progress notice
			const progressNotice = new Notice(`Analyzing 0/${allFiles.length} files...`, 0); // 0 means no timeout

			let processedCount = 0;
			let errorCount = 0;

			// Process each file to find those with "_res" in poster filename or "КинопоискОценка"
			for (const file of allFiles) {
				try {
					const content = await this.app.vault.cachedRead(file);
					if (this.containsResPoster(content)) {
						console.log(`[AnalyzeAll] Found _res poster in file: ${file.path}`);
						// Process the file directly without opening it
						await this.processResNoteInBackground(file, content);
						processedCount++;
					}
					// Update progress notice
					progressNotice.setMessage(`Analyzing ${processedCount + errorCount}/${allFiles.length} files...`);
				} catch (error) {
					console.error(`[AnalyzeAll] Error processing file ${file.path}:`, error);
					errorCount++;
					// Update progress notice even for errors
					progressNotice.setMessage(`Analyzing ${processedCount + errorCount}/${allFiles.length} files... (${errorCount} errors)`);
				}
			}

			// Hide the progress notice and show final result
			progressNotice.hide();
			new Notice(`Mass analysis completed! Processed: ${processedCount}, Errors: ${errorCount}`);
			console.log(`[AnalyzeAll] Mass analysis completed! Processed: ${processedCount}, Errors: ${errorCount}`);
		} catch (err) {
			console.warn(err);
			this.showNotice(err);
		}
	}

	// Process a note in background without opening it
	private async processResNoteInBackground(file: TFile, content: string): Promise<void> {
		console.log(`[ProcessBg] Processing file in background: ${file.path}`);

		// Extract title and rating from the note
		const title = this.extractTitle(file.basename, content);
		const rating = this.extractRating(content);

		// Check if user rating existed in the original file
		const hasUserRating = new RegExp(`${t("ratings.myRating")}:\\s*\\d+\\.?\\d*`, 'i').test(content);

		// Extract custom status from the original file
		const customStatus = this.extractCustomStatus(content);

		// Extract year - prioritize year from filename, then from content
		const yearFromFile = this.extractYearFromFile(file.basename);
		const yearFromContent = this.extractYear(content);
		const year = yearFromFile || yearFromContent;

		console.log(`[ProcessBg] Extracted title: ${title}, rating: ${rating}, hasUserRating: ${hasUserRating}, status: ${customStatus}, year: ${year}`);

		if (title) {
			// Search TMDB for the title
			const searchResults = await this.searchOnTMDB(title);

			if (searchResults && searchResults.length > 0) {
				// Find the most appropriate match based on title and year
				const bestMatch = this.findBestMatch(searchResults, title, year);

				if (bestMatch) {
					console.log(`[ProcessBg] Best match found: ${bestMatch.name}`);
					// Create new note with matched TMDB data and user rating - without opening the file
					await this.createNoteWithRatingInBackground(file, bestMatch, rating, customStatus, hasUserRating);
				}
			}
		}
	}

	// Create a new note in background without opening it
	private async createNoteWithRatingInBackground(originalFile: TFile, item: TMDBSuggestItem, userRating: number | null, customStatus: string | null = null, hasUserRating: boolean = false): Promise<void> {
		if (!item || !this.settings.apiToken) {
			return;
		}

		try {
			// Rename the original file by adding '_old' suffix
			const originalPath = originalFile.path;
			const lastSlashIndex = originalPath.lastIndexOf('/');
			const lastSlashIndexWin = originalPath.lastIndexOf('\\');
			const lastSlashPos = Math.max(lastSlashIndex, lastSlashIndexWin);

			const folderPath = originalPath.substring(0, lastSlashPos + 1);
			const fileNameWithExt = originalPath.substring(lastSlashPos + 1);

			const lastDotIndex = fileNameWithExt.lastIndexOf('.');
			const baseName = fileNameWithExt.substring(0, lastDotIndex);
			const extension = fileNameWithExt.substring(lastDotIndex + 1);

			const newPath = folderPath + baseName + '_old.' + extension;

			await this.app.fileManager.renameFile(originalFile, newPath);
			console.log(`[RenameBg] Renamed original file to: ${newPath}`);

			// Get full movie/series details from TMDB
			const provider = new TMDBProvider();
			let movieShow = await provider.getMovieById(item.id, this.settings.apiToken, item.type, userRating ?? undefined);

			// Process images if local saving is enabled
			if (this.settings.saveImagesLocally) {
				const { processImages } = await import("./Utils/imageUtils");

				movieShow = await processImages(
					this.app,
					movieShow,
					this.settings
				);
			}

			// If we have a user rating, store it in the movieShow object to ensure it's preserved
			if (userRating !== null) {
				(movieShow as any).userRating = userRating;
			}

			// Set the status in the movieShow object so it gets replaced in the template
			if (customStatus) {
				// Update the status field in movieShow
				movieShow.status = [customStatus];
			} else {
				// Use default status if no custom status provided
				movieShow.status = [t("status.willWatch")]; // Default to "Will watch"
			}

			// Use the original file's folder path instead of settings folder
			// Determine folder based on type (should be the same as original)
			const targetFolderPath = item.type === 'tv-series' ?
				this.settings.seriesFolder : this.settings.movieFolder;

			// Create folder if it doesn't exist
			if (targetFolderPath && !(await this.app.vault.adapter.exists(targetFolderPath))) {
				await this.app.vault.createFolder(targetFolderPath);
			}

			// Get template content and render it
			let renderedContents = await this.getRenderedContents(movieShow);

			// If we have a custom status, we need to REPLACE the existing status in the content
			if (customStatus !== null) {
				// Replace the existing status with the custom one, handling quotes properly
				// First escape any quotes in the custom status to prevent YAML issues
				const escapedStatus = customStatus.replace(/"/g, '\\"');
				renderedContents = renderedContents.replace(new RegExp(`${t("common.status")}:\\s*["']?([^"'\n,}]+)["']?`, 'i'), `${t("common.status")}: "${escapedStatus}"`);
			}

			// If we have a user rating AND the original file had a user rating, we need to inject it into the content
			// This depends on how the template is structured
			if (userRating !== null && hasUserRating) {
				// If the template doesn't have a userRating variable, we might need to add it
				if (!renderedContents.includes('{{userRating}}')) {
					// If the template doesn't support user rating, we'll add it to the content
					// Check if there's YAML frontmatter
					if (renderedContents.startsWith('---')) {
						// Insert rating in YAML frontmatter
						const frontmatterEndIndex = renderedContents.indexOf('\n---\n', 3);
						if (frontmatterEndIndex !== -1) {
							// Extract the frontmatter and body
							const frontmatter = renderedContents.substring(0, frontmatterEndIndex + 5); // include \n---\n
							const body = renderedContents.substring(frontmatterEndIndex + 5);

							// Check if rating already exists in frontmatter to avoid duplication
							if (!frontmatter.includes(`${t("ratings.myRating")}:`)) {
								// Add rating to the existing frontmatter
								const updatedFrontmatter = frontmatter.replace('\n---\n', `\n${t("ratings.myRating")}: ${userRating}\n---\n`);
								renderedContents = `${updatedFrontmatter}${body}`;
							}
						} else {
							// Try alternative pattern for frontmatter end
							const altFrontmatterEndIndex = renderedContents.indexOf('---\n', 4); // start after initial ---
							if (altFrontmatterEndIndex !== -1) {
								const frontmatter = renderedContents.substring(0, altFrontmatterEndIndex + 4); // include ---\n
								const body = renderedContents.substring(altFrontmatterEndIndex + 4);

								// Check if rating already exists in frontmatter to avoid duplication
								if (!frontmatter.includes(`${t("ratings.myRating")}:`)) {
									// Add rating to the existing frontmatter
									const updatedFrontmatter = frontmatter.replace('---\n', `${t("ratings.myRating")}: ${userRating}\n---\n`);
									renderedContents = `${updatedFrontmatter}${body}`;
								}
							} else {
								// If there's no clear closing ---, append rating to frontmatter
								renderedContents = renderedContents.replace('---', `---\n${t("ratings.myRating")}: ${userRating}`);
							}
						}
					} else {
						// Add rating to the beginning of the file
						renderedContents = `---\n${t("ratings.myRating")}: ${userRating}\n---\n\n${renderedContents}`;
					}
				}
			}

			// Use the original file name (without _old suffix) for the new file
			const originalFileName = baseName.replace('_old', '') + '.' + extension;
			const newFilePath = `${targetFolderPath}/${originalFileName}`;

			const targetFile = await this.app.vault.create(
				newFilePath,
				renderedContents
			);

			console.log(`[CreateBg] Created updated note with user rating: ${newFilePath}`);
		} catch (error) {
			console.error('[Update NoteBg] Error updating note with rating:', error);
			this.showNotice(new Error(`Error updating note: ${error.message}`));
		}
	}

	// Analyzes the current active note for "_res" in poster filename
	// Extracts title and rating, searches TMDB, and creates new notes with user rating
	async analyzeResNotes(): Promise<void> {
		try {
			console.log('[Analyze] Starting analysis of current note for _res poster');

			// Get the currently active file
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile || activeFile.extension !== 'md') {
				new Notice("Please open a markdown note to analyze");
				return;
			}

			const content = await this.app.vault.cachedRead(activeFile);
			console.log(`[Analyze] Analyzing current file: ${activeFile.path}`);

			if (this.containsResPoster(content)) {
				console.log(`[Analyze] Found _res poster in current file`);
				await this.processResNote(activeFile, content);
				new Notice(`Found and processed _res note: ${activeFile.basename}`);
			} else {
				new Notice(`Current note does not contain _res poster: ${activeFile.basename}`);
				console.log(`[Analyze] Current file does not contain _res poster`);
			}
		} catch (err) {
			console.warn(err);
			this.showNotice(err);
		}
	}

	// Check if content contains "_res" in poster filename or "КинопоискОценка"
	private containsResPoster(content: string): boolean {
		// Look for common patterns where poster filenames might contain "_res"
		// This could be in markdown image links like ![[poster_res.jpg]] or ![](poster_res.jpg)
		// Also includes "_resources" pattern
		const resPattern = /(!\[\[.*_res|!\[.*\]\(.*_res|poster.*_res|cover.*_res|_resources)/i;

		// Also check for Kinopoisk rating pattern
		const kinopoiskPattern = new RegExp(`${t("ratings.kinopoiskRating")}:\\s*\\d+\\.?\\d*`, 'i');

		return resPattern.test(content) || kinopoiskPattern.test(content);
	}

	// Process a note that contains "_res" in poster filename
	private async processResNote(file: TFile, content: string): Promise<void> {
		console.log(`[Process] Processing file: ${file.path}`);

		// Extract title and rating from the note
		const title = this.extractTitle(file.basename, content);
		const rating = this.extractRating(content);

		// Check if user rating existed in the original file
		const hasUserRating = new RegExp(`${t("ratings.myRating")}:\\s*\\d+\\.?\\d*`, 'i').test(content);

		// Extract custom status from the original file
		const customStatus = this.extractCustomStatus(content);

		// Extract year - prioritize year from filename, then from content
		const yearFromFile = this.extractYearFromFile(file.basename);
		const yearFromContent = this.extractYear(content);
		const year = yearFromFile || yearFromContent;

		console.log(`[Process] Extracted title: ${title}, rating: ${rating}, hasUserRating: ${hasUserRating}, status: ${customStatus}, year: ${year}`);

		if (title) {
			// Search TMDB for the title
			const searchResults = await this.searchOnTMDB(title);

			if (searchResults && searchResults.length > 0) {
				// Find the most appropriate match based on title and year
				const bestMatch = this.findBestMatch(searchResults, title, year);

				if (bestMatch) {
					console.log(`[Process] Best match found: ${bestMatch.name}`);
					// Create new note with matched TMDB data and user rating
					await this.createNoteWithRating(bestMatch, rating, customStatus, hasUserRating);
				}
			}
		}
	}

	// Extract title from filename or content
	private extractTitle(basename: string, content: string): string {
		// First try to extract from filename (remove year and other info)
		const filenameTitle = basename.replace(/\s*\(\d{4}\).*/, '').trim();
		if (filenameTitle) return filenameTitle;

		// Try to extract from YAML frontmatter or content
		const titleMatch = content.match(/title:\s*["']?([^"'\n]+)/i);
		if (titleMatch) return titleMatch[1].trim();

		// Try other common patterns
		const nameMatch = content.match(/name:\s*["']?([^"'\n]+)/i);
		if (nameMatch) return nameMatch[1].trim();

		return '';
	}

	// Extract year from filename or content
	private extractYearFromFile(basename: string): number | null {
		// Try to extract year from filename (in parentheses)
		const yearMatch = basename.match(/\((\d{4})\)/);
		if (yearMatch && yearMatch[1]) {
			return parseInt(yearMatch[1]);
		}
		return null;
	}

	// Extract rating from content - prioritize user rating over Kinopoisk rating
	private extractRating(content: string): number | null {
		// Look for user rating patterns first (higher priority)
		const userRatingPatterns = [
			new RegExp(`${t("ratings.myRating")}:\\s*(\\d+\\.?\\d*)`, 'i'), // Localized "MyRating" - highest priority
			/rating:\s*(\d+\.?\d*)/i,
			/user_rating:\s*(\d+\.?\d*)/i,
			/my_rating:\s*(\d+\.?\d*)/i,
			/оценка:\s*(\d+\.?\d*)/i, // Russian for "rating"
			/рейтинг:\s*(\d+\.?\d*)/i, // Russian for "rating"
		];

		for (const pattern of userRatingPatterns) {
			const match = content.match(pattern);
			if (match && match[1]) {
				const rating = parseFloat(match[1]);
				if (!isNaN(rating)) {
					return rating;
				}
			}
		}

		// If no user rating found, look for Kinopoisk rating
		const kinopoiskPattern = new RegExp(`${t("ratings.kinopoiskRating")}:\\s*(\\d+\\.?\\d*)`, 'i'); // Localized "KinopoiskRating"
		const kinopoiskMatch = content.match(kinopoiskPattern);
		if (kinopoiskMatch && kinopoiskMatch[1]) {
			const rating = parseFloat(kinopoiskMatch[1]);
			if (!isNaN(rating)) {
				return rating;
			}
		}

		return null;
	}

	// Extract custom status from content
	private extractCustomStatus(content: string): string | null {
		// Look for status patterns in the content
		const statusPatterns = [
			new RegExp(`${t("common.status")}:\\s*["']?([^"'\n,]+)`, 'i'), // Localized "Status"
			/status:\s*["']?([^"'\n,]+)/i,
		];

		for (const pattern of statusPatterns) {
			const match = content.match(pattern);
			if (match && match[1]) {
				return match[1].trim();
			}
		}

		return null;
	}

	// Extract Kinopoisk rating from content
	private extractKinopoiskRating(content: string): number | null {
		// Look for Kinopoisk rating pattern in the content
		const kinopoiskPattern = new RegExp(`${t("ratings.kinopoiskRating")}:\\s*(\\d+\\.?\\d*)`, 'i');
		const match = content.match(kinopoiskPattern);

		if (match && match[1]) {
			const rating = parseFloat(match[1]);
			if (!isNaN(rating)) {
				return rating;
			}
		}

		return null;
	}

	// Extract year from content
	private extractYear(content: string): number | null {
		// Look for year patterns in the content, including localized "Year"
		const yearPatterns = [
			new RegExp(`${t("ratings.year")}:\\s*(\\d{4})`, 'i'), // Localized "Year"
			/year:\s*(\d{4})/i,
			/release_date.*?(\d{4})/i,
			/\b(19|20)\d{2}\b/, // More specific 4-digit year pattern (19xx-20xx)
		];

		for (const pattern of yearPatterns) {
			const match = content.match(pattern);
			if (match && match[0] && /^\d{4}$/.test(match[0])) {
				return parseInt(match[0]);
			}
		}
		return null;
	}

	// Search TMDB for a title
	private async searchOnTMDB(title: string): Promise<TMDBSuggestItem[] | null> {
		if (!title || !this.settings.apiToken) {
			return null;
		}

		try {
			const provider = new TMDBProvider();
			return await provider.searchByQuery(title, this.settings.apiToken);
		} catch (error) {
			console.error(`[TMDB Search] Error searching for "${title}":`, error);
			return null;
		}
	}

	// Find the best matching result based on title and year
	private findBestMatch(results: TMDBSuggestItem[], title: string, year: number | null): TMDBSuggestItem | null {
		if (!results || results.length === 0) {
			return null;
		}

		// First, try to find exact title match
		const exactTitleMatches = results.filter(item =>
			item.name.toLowerCase() === title.toLowerCase() ||
			item.alternativeName.toLowerCase() === title.toLowerCase()
		);

		if (exactTitleMatches.length > 0) {
			// If we have year, try to match that too with tolerance for 1 year difference
			if (year) {
				// First try exact year match
				const exactMatchWithYear = exactTitleMatches.find(item => item.year === year);
				if (exactMatchWithYear) return exactMatchWithYear;

				// Then try close year match (±1 year)
				const closeYearMatch = exactTitleMatches.find(item =>
					item.year > 0 && Math.abs(item.year - year) <= 1
				);
				if (closeYearMatch) return closeYearMatch;
			}
			// Return the first exact title match
			return exactTitleMatches[0];
		}

		// If no exact title match, try fuzzy matching
		const fuzzyMatches = results.filter(item =>
			item.name.toLowerCase().includes(title.toLowerCase()) ||
			item.alternativeName.toLowerCase().includes(title.toLowerCase())
		);

		if (fuzzyMatches.length > 0) {
			if (year) {
				// Try to match year for fuzzy matches
				const fuzzyMatchWithYear = fuzzyMatches.find(item => item.year === year);
				if (fuzzyMatchWithYear) return fuzzyMatchWithYear;

				// Then try close year match (±1 year)
				const closeFuzzyYearMatch = fuzzyMatches.find(item =>
					item.year > 0 && Math.abs(item.year - year) <= 1
				);
				if (closeFuzzyYearMatch) return closeFuzzyYearMatch;
			}
			// Return the first fuzzy match
			return fuzzyMatches[0];
		}

		// If no matches found, use the first result as fallback
		return results[0];
	}


	async onFileCreated(file: TFile): Promise<void> {
    // 1. Проверки: включена ли настройка, расширение md, и нужная ли это папка
    if (!this.settings.autoFillOnCreate || file.extension !== 'md') {
        return;
    }

    const movieFolder = this.settings.movieFolder;
    const seriesFolder = this.settings.seriesFolder;
    const actorFolder = this.settings.actorFolder;

    const isInAllowedFolder = 
        (movieFolder && file.path.startsWith(movieFolder)) ||
        (seriesFolder && file.path.startsWith(seriesFolder)) ||
        (actorFolder && file.path.startsWith(actorFolder));

    if (!isInAllowedFolder) return;

    // 2. Проверка содержимого (чтобы не перезаписать непустые файлы)
    const content = await this.app.vault.read(file);
    if (content.trim().length > 10) return;

    const searchQuery = file.basename;

    // Задержка для корректного открытия файла в интерфейсе
    setTimeout(async () => {
        try {
            const isNumericId = /^\d+$/.test(searchQuery.trim());
            let selectedMovie: MovieShow;
            const provider = new TMDBProvider();

            if (isNumericId) {
                const id = parseInt(searchQuery.trim());
                new Notice(`Fetching from TMDB by ID: ${id}`);
                // По умолчанию для числовых имен файлов пробуем 'movie', 
                // либо можно добавить логику определения типа
                selectedMovie = await provider.getMovieById(id, this.settings.apiToken, 'movie');
            } else {
                new Notice(`Searching TMDB for: ${searchQuery}`);
                const searchResults = await provider.searchByQuery(searchQuery, this.settings.apiToken);

                if (!searchResults?.length) {
                    new Notice(`No results found for "${searchQuery}"`);
                    return;
                }
                selectedMovie = await this.openSuggestModal(searchResults);
            }

            // 3. Обработка изображений
            if (this.settings.saveImagesLocally) {
                new Notice("Processing images...");
                const { processImages } = await import("./Utils/imageUtils");
                selectedMovie = await processImages(this.app, selectedMovie, this.settings);
            }

            // 4. Рендеринг и запись
            const renderedContents = await this.getRenderedContents(selectedMovie);
            await this.app.vault.modify(file, renderedContents);

            // Переключение в режим предпросмотра
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file, { state: { mode: "preview" } });

            new Notice("Data auto-filled successfully!");
        } catch (err) {
            console.warn('Error auto-filling file:', err);
        }
    }, 300);
}

	// Update the original note with TMDB data and user rating
	private async createNoteWithRating(item: TMDBSuggestItem, userRating: number | null, customStatus: string | null = null, hasUserRating: boolean = false): Promise<void> {
		if (!item || !this.settings.apiToken) {
			return;
		}

		try {
			// Show notice about starting the update process
			const updateNotice = new Notice(`Updating: ${item.name}`, 0);

			// Get the currently active file (the original file with _res)
			const originalFile = this.app.workspace.getActiveFile();
			if (!originalFile) {
				console.error('[Update Note] No active file found');
				updateNotice.hide();
				return;
			}

			// Read the original file content to preserve custom status
			const originalContent = await this.app.vault.read(originalFile);

			// Rename the original file by adding '_old' suffix
			const originalPath = originalFile.path;
			const lastSlashIndex = originalPath.lastIndexOf('/');
			const lastSlashIndexWin = originalPath.lastIndexOf('\\');
			const lastSlashPos = Math.max(lastSlashIndex, lastSlashIndexWin);

			const folderPath = originalPath.substring(0, lastSlashPos + 1);
			const fileNameWithExt = originalPath.substring(lastSlashPos + 1);

			const lastDotIndex = fileNameWithExt.lastIndexOf('.');
			const baseName = fileNameWithExt.substring(0, lastDotIndex);
			const extension = fileNameWithExt.substring(lastDotIndex + 1);

			const newPath = folderPath + baseName + '_old.' + extension;

			await this.app.fileManager.renameFile(originalFile, newPath);
			console.log(`[Rename] Renamed original file to: ${newPath}`);
			updateNotice.setMessage(`Renamed to: ${baseName}_old.${extension}`);

			// Get full movie/series details from TMDB
			const provider = new TMDBProvider();
			let movieShow = await provider.getMovieById(item.id, this.settings.apiToken, item.type, userRating ?? undefined);

			// Show notice that TMDB data is retrieved
			updateNotice.setMessage(`Retrieved TMDB data for: ${item.name}`);

			// Process images if local saving is enabled
			if (this.settings.saveImagesLocally) {
				const { processImages } = await import("./Utils/imageUtils");

				// Show notice about image processing
				const imageNotice = new Notice("Processing images...", 0); // 0 means no timeout

				movieShow = await processImages(
					this.app,
					movieShow,
					this.settings,
					(current: number, total: number, currentTask: string) => {
						// Progress callback to show status
						if (total > 0) {
							imageNotice.setMessage(`Images: ${current}/${total}`);
						} else {
							imageNotice.setMessage(currentTask); // For status messages when total is 0
						}
					}
				);

				imageNotice.hide();
				new Notice("Images processed!");
			}

			// If we have a user rating, store it in the movieShow object to ensure it's preserved
			if (userRating !== null) {
				(movieShow as any).userRating = userRating;
			}

			// Set the status in the movieShow object so it gets replaced in the template
			if (customStatus) {
				// Update the status field in movieShow
				movieShow.status = [customStatus];
			} else {
				// Use default status if no custom status provided
				movieShow.status = [t("status.willWatch")]; // Default to "Will watch"
			}

			// Use the original file's folder path instead of settings folder
			const itemTypeStr = Array.isArray((movieShow as any).type)
				? (movieShow as any).type[0]
				: (movieShow as any).type;

			let targetFolderPath: string;

			if (itemTypeStr === 'person' || itemTypeStr === 'Персона') {
				targetFolderPath = this.settings.actorFolder;
			} else if (item.type === 'tv-series') {
				targetFolderPath = this.settings.seriesFolder;
			} else {
				targetFolderPath = this.settings.movieFolder;
			}

			// Create folder if it doesn't exist
			if (targetFolderPath && !(await this.app.vault.adapter.exists(targetFolderPath))) {
				await this.app.vault.createFolder(targetFolderPath);
			}

			// Create folder if it doesn't exist
			if (targetFolderPath && !(await this.app.vault.adapter.exists(targetFolderPath))) {
				await this.app.vault.createFolder(targetFolderPath);
			}

			// Get template content and render it
			let renderedContents = await this.getRenderedContents(movieShow);
			updateNotice.setMessage(`Rendering template...`);

			// If we have a user rating AND the original file had a user rating, we need to inject it into the content
			// This depends on how the template is structured
			if (userRating !== null && hasUserRating) {
				// If the template doesn't have a userRating variable, we might need to add it
				if (!renderedContents.includes('{{userRating}}')) {
					// If the template doesn't support user rating, we'll add it to the content
					// Check if there's YAML frontmatter
					if (renderedContents.startsWith('---')) {
						// Insert rating in YAML frontmatter
						const frontmatterEndIndex = renderedContents.indexOf('\n---\n', 3);
						if (frontmatterEndIndex !== -1) {
							// Extract the frontmatter and body
							const frontmatter = renderedContents.substring(0, frontmatterEndIndex + 5); // include \n---\n
							const body = renderedContents.substring(frontmatterEndIndex + 5);

							// Check if rating already exists in frontmatter to avoid duplication
							if (!frontmatter.includes(`${t("ratings.myRating")}:`)) {
								// Add rating to the existing frontmatter
								const updatedFrontmatter = frontmatter.replace('\n---\n', `\n${t("ratings.myRating")}: ${userRating}\n---\n`);
								renderedContents = `${updatedFrontmatter}${body}`;
							}
						} else {
							// Try alternative pattern for frontmatter end
							const altFrontmatterEndIndex = renderedContents.indexOf('---\n', 4); // start after initial ---
							if (altFrontmatterEndIndex !== -1) {
								const frontmatter = renderedContents.substring(0, altFrontmatterEndIndex + 4); // include ---\n
								const body = renderedContents.substring(altFrontmatterEndIndex + 4);

								// Check if rating already exists in frontmatter to avoid duplication
								if (!frontmatter.includes(`${t("ratings.myRating")}:`)) {
									// Add rating to the existing frontmatter
									const updatedFrontmatter = frontmatter.replace('---\n', `${t("ratings.myRating")}: ${userRating}\n---\n`);
									renderedContents = `${updatedFrontmatter}${body}`;
								}
							} else {
								// If there's no clear closing ---, append rating to frontmatter
								renderedContents = renderedContents.replace('---', `---\n${t("ratings.myRating")}: ${userRating}`);
							}
						}
					} else {
						// Add rating to the beginning of the file
						renderedContents = `---\n${t("ratings.myRating")}: ${userRating}\n---\n\n${renderedContents}`;
					}
				}
			}

			// If we have a custom status, we need to REPLACE the existing status in the content
			if (customStatus !== null) {
				// Replace the existing status with the custom one, handling quotes properly
				// First escape any quotes in the custom status to prevent YAML issues
				const escapedStatus = customStatus.replace(/"/g, '\\"');
				renderedContents = renderedContents.replace(new RegExp(`${t("common.status")}:\\s*["']?([^"'\n,}]+)["']?`, 'i'), `${t("common.status")}: "${escapedStatus}"`);
			}

			// Use the original file name (without _old suffix) for the new file
			const originalFileName = baseName.replace('_old', '') + '.' + extension;
			const newFilePath = `${targetFolderPath}/${originalFileName}`;

			const targetFile = await this.app.vault.create(
				newFilePath,
				renderedContents
			);

			console.log(`[Create] Created updated note with user rating: ${newFilePath}`);
			updateNotice.setMessage(`Creating note...`);

			// Open the newly created file in a new pane
			const newLeaf = this.app.workspace.getLeaf(true);
			if (newLeaf) {
				await newLeaf.openFile(targetFile, { state: { mode: "preview" } });
				updateNotice.setMessage(`Opening: ${originalFileName}`);
			}

			// Final success message
			updateNotice.hide();
			new Notice(`✅ Updated: ${originalFileName}`);

		} catch (error) {
			console.error('[Update Note] Error updating note with rating:', error);
			this.showNotice(new Error(`Error updating note: ${error.message}`));
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
