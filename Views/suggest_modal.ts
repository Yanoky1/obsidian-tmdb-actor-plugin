import { SuggestModal, Notice, App } from "obsidian";
import { TMDBSuggestItem } from "Models/TMDB_response";
import { MovieShow } from "Models/MovieShow.model";
import { TMDBProvider } from "APIProvider/provider";
import { processImages, ProgressCallback } from "Utils/imageUtils";
import { ImageApprovalModal, ImageInfo } from "Views/image_selection_modal"; // UPDATED
import { StatusSelectionModal } from "Views/status_selection_modal";
import ObsidianTMDBPlugin from "main";
import { t } from "../i18n";

interface SuggestCallback {
    (error: Error | null, result?: MovieShow): void;
}

// NEW: Функция-хелпер для преобразования данных
// В suggest_modal.ts
const toImageInfoArray = (items: (string | ImageInfo)[] | undefined): ImageInfo[] => {
    if (!items) return [];
    return items.map(item => typeof item === 'string' ? { url: item } : item);
};

export class ItemsSuggestModal extends SuggestModal<TMDBSuggestItem> {
    private token = "";
    private loadingNotice?: Notice;
    private TMDBProvider: TMDBProvider;

    constructor(
        private plugin: ObsidianTMDBPlugin,
        private readonly suggestion: TMDBSuggestItem[],
        private onChoose: SuggestCallback
    ) {
        super(plugin.app);
        this.token = plugin.settings.apiToken;
        this.TMDBProvider = new TMDBProvider({
            actorsPath: plugin.settings.actorsPath,
            directorsPath: plugin.settings.directorsPath,
            writersPath: plugin.settings.writersPath,
            producersPath: plugin.settings.producersPath
        });
    }

    getSuggestions(query: string): TMDBSuggestItem[] {
        return this.suggestion.filter((item) => {
            const searchQuery = query?.toLowerCase();
            return (
                item.name.toLowerCase().includes(searchQuery) ||
                item.alternativeName.toLowerCase().includes(searchQuery)
            );
        });
    }

    private isValidImageUrl(url?: string): boolean {
        if (!url || url.trim() === "") return false;
        try {
            new URL(url);
            return url.startsWith("http://") || url.startsWith("https://");
        } catch {
            return false;
        }
    }

    private createPosterElement(
        item: TMDBSuggestItem,
        container: HTMLElement
    ): HTMLElement {
        const posterUrl = item.poster?.url;
        if (this.isValidImageUrl(posterUrl)) {
            const imgElement = container.createEl("img", {
                cls: "TMDB-plugin__suggest-poster",
            });
            imgElement.src = posterUrl!;
            imgElement.addEventListener("error", () => {
                const placeholder = container.createEl("div", {
                    text: t("modals.posterPlaceholderEmoji"),
                    cls: "TMDB-plugin__suggest-poster-placeholder",
                });
                placeholder.title = t("modals.posterTooltipGeoblock");
                imgElement.replaceWith(placeholder);
            });
            return imgElement;
        } else {
            const placeholder = container.createEl("div", {
                text: t("modals.posterPlaceholderEmoji"),
                cls: "TMDB-plugin__suggest-poster-placeholder",
            });
            const reason = !posterUrl
                ? t("modals.posterTooltipMissing")
                : posterUrl.trim() === ""
                    ? t("modals.posterTooltipEmptyLink")
                    : t("modals.posterTooltipInvalidLink");
            placeholder.title = reason;
            return placeholder;
        }
    }
    // Обновить метод renderSuggestion в ItemsSuggestModal

    renderSuggestion(item: TMDBSuggestItem, el: HTMLElement) {
        el.addClass("TMDB-plugin__suggest-item");

        const title = item.name;

        // Для актёров показываем профессию вместо типа и года
        const subtitle = item.type === 'person'
            ? `${item.alternativeName}, Популярность: ${Number(item.rating?.tmdb?.toFixed(0))}`
            : `${t("common.type")}: ${item.type}, ${t("ratings.year")}: ${item.year}, TMDB: ${Number(item.rating?.tmdb?.toFixed(0))}, IMDB: ${Number(item.rating?.imdb?.toFixed(0))}`;

        this.createPosterElement(item, el);

        const textInfo = el.createEl("div", {
            cls: "TMDB-plugin__suggest-text-info",
        });

        textInfo.createEl("div", { text: title });
        textInfo.createEl("small", { text: subtitle });
    }

    onChooseSuggestion(item: TMDBSuggestItem) {

        this.getItemDetails(item);
    }

    private updateStatus(message: string, persistent: boolean = true): void {
        this.hideLoadingNotice();
        this.loadingNotice = new Notice(message, persistent ? 0 : 3000);
    }

    private hideLoadingNotice(): void {
        if (this.loadingNotice) {
            this.loadingNotice.hide();
            this.loadingNotice = undefined;
        }
    }

    private updateLoadingNotice(message: string): void {
        if (this.loadingNotice) {
            const noticeEl = this.loadingNotice.noticeEl;
            if (noticeEl) {
                noticeEl.textContent = message;
            }
        } else {
            this.updateStatus(message);
        }
    }

    private createProgressText(
        current: number,
        total: number,
        task: string
    ): string {
        if (total === 0) return task;
        const percentage = Math.round((current / total) * 100);
        const progressBar = this.createProgressBar(current, total);
        return `${task}\n${progressBar} ${current}/${total} (${percentage}%)`;
    }

    private createProgressBar(
        current: number,
        total: number,
        length: number = 20
    ): string {
        if (total === 0) return "";
        const filled = Math.round((current / total) * length);
        const empty = length - filled;
        return "█".repeat(filled) + "░".repeat(empty);
    }

    private validateInput(item: TMDBSuggestItem): boolean {
        if (!item?.id || item.id <= 0) {
            new Notice(t("modals.errorMovieData"));
            this.onChoose(new Error(t("modals.errorMovieData")));
            return false;
        }
        if (!this.token?.trim()) {
            new Notice(t("modals.needApiToken"));
            this.onChoose(new Error(t("modals.needApiToken")));
            return false;
        }
        return true;
    }

    private async fetchMovieData(itemId: number, type?: string): Promise<MovieShow> {
        return await this.TMDBProvider.getMovieById(itemId, this.token, type);
    }

    private async processImageApprovals(
        movieShow: MovieShow,
        itemId: number,
        itemType: string
    ): Promise<MovieShow> {
        this.updateLoadingNotice(t("modals.loadingAlternativeImages"));
        const allImages = await this.TMDBProvider.getAllImages(
            itemId,
            this.token,
            itemType
        );
        this.hideLoadingNotice();

        return new Promise(async (resolve) => {
            const modal = new ImageApprovalModal(
                this.app,
                {
                    // FIXED: Преобразуем данные перед передачей
                    poster: {
                        current: movieShow.posterUrl[0] || "",
                        all: toImageInfoArray(allImages.posters)
                    },
                    cover: {
                        current: movieShow.coverUrl[0] || "",
                        all: toImageInfoArray(allImages.backdrops)
                    },
                    logo: {
                        current: movieShow.logoUrl[0] || "",
                        all: toImageInfoArray(allImages.logos)
                    }
                },
                async (finalSelection) => {
                    movieShow.posterUrl = finalSelection.poster ? [finalSelection.poster] : [];
                    movieShow.coverUrl = finalSelection.cover ? [finalSelection.cover] : [];
                    movieShow.logoUrl = finalSelection.logo ? [finalSelection.logo] : [];

                    // После выбора изображений, запросим статус у пользователя (только для фильмов и сериалов, не для актеров)
                    if (itemType === 'person') {
                        // Для актеров не запрашиваем статус, просто устанавливаем пустой статус
                        (movieShow as any).status = [""];
                        resolve(movieShow);
                    } else {
                        // Для фильмов и сериалов запрашиваем статус
                        const statusOptions = [
                            t("status.willWatch"),
                            t("status.haveWatched"),
                            t("status.watching"),
                            t("status.dropped")
                        ];

                        new StatusSelectionModal(this.app, statusOptions, (selectedStatus) => {
                            // Store the selected status in the movieShow object
                            (movieShow as any).status = selectedStatus || t("status.willWatch");

                            resolve(movieShow);
                        }).open();
                    }
                }
            );
            modal.open();
        });
    }

    private handleSuccess(
        movieShow: MovieShow,
        hadImageProcessing: boolean = false
    ): void {
        this.hideLoadingNotice();
        if (!hadImageProcessing) {
            new Notice(t("modals.movieInfoLoaded"));
        }
        this.onChoose(null, movieShow);
    }

    private handleError(error: unknown): void {
        this.hideLoadingNotice();
        const errorMessage =
            error instanceof Error
                ? error.message
                : t("modals.errorGettingDetails");
        new Notice(errorMessage);
        console.error("Error getting movie details:", error);
        this.onChoose(error as Error);
    }

    async getItemDetails(item: TMDBSuggestItem) {

        if (!this.validateInput(item)) {
            return;
        }

        try {
            this.updateStatus(t("modals.loadingMovieInfo"));
            let movieShow = await this.fetchMovieData(item.id, item.type);

            if (!this.plugin.settings.saveImagesLocally) {
                this.handleSuccess(movieShow, false);
                return;
            }

            movieShow = await this.processImageApprovals(movieShow, item.id, item.type);

            let imageProcessingCompleted = false;
            const imageSettings = {
                saveImagesLocally: true,
                imagesFolder: this.plugin.settings.imagesFolder,
                savePosterImage: this.plugin.settings.savePosterImage && movieShow.posterUrl.length > 0,
                saveCoverImage: this.plugin.settings.saveCoverImage && movieShow.coverUrl.length > 0,
                saveLogoImage: this.plugin.settings.saveLogoImage && movieShow.logoUrl.length > 0,
            };

            const anyImageToDownload =
                imageSettings.savePosterImage ||
                imageSettings.saveCoverImage ||
                imageSettings.saveLogoImage;

            if (!anyImageToDownload) {
                this.handleSuccess(movieShow, false);
                return;
            }

            this.updateLoadingNotice(t("modals.preparingImages"));
            const progressCallback: ProgressCallback = (
                current: number,
                total: number,
                currentTask: string
            ) => {
                const progressText = this.createProgressText(
                    current,
                    total,
                    currentTask
                );
                this.updateLoadingNotice(progressText);
                if (current === total) {
                    imageProcessingCompleted = true;
                }
            };

            const processedMovieShow = await processImages(
                this.plugin.app,
                movieShow,
                imageSettings,
                progressCallback
            );

            if (imageProcessingCompleted) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            this.handleSuccess(processedMovieShow, true);
        } catch (error) {
            this.handleError(error);
        }
    }

    onClose() {
        this.hideLoadingNotice();
        super.onClose();
    }
}
