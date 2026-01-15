import { Modal, Setting, App } from "obsidian";
import { StatusSelectionModal } from "./status_selection_modal";
// import { t } from "../i18n"; // Раскомментируй, если используешь переводы

export interface ImageInfo {
    url: string;
    language?: string;
}

export class ImageApprovalModal extends Modal {
    private isListView = false;
    private activeViewType: "poster" | "cover" | "logo" = "poster";
    // Храним копию данных для возможности отмены
    private backupData: any;

    constructor(
        app: App,
        private data: {
            poster: { current: string, all: ImageInfo[] },
            cover: { current: string, all: ImageInfo[] },
            logo: { current: string, all: ImageInfo[] }
        },
        private onConfirm: (results: { poster: string, cover: string, logo: string }) => void
    ) {
        super(app);
    }

    private sortImages(images: ImageInfo[]): ImageInfo[] {
        const getLangPriority = (lang?: string): number => {
            if (lang === 'ru') return 1;
            if (lang === 'en') return 2;
            return 3;
        };

        return [...images].sort((a, b) => {
            const priorityA = getLangPriority(a.language);
            const priorityB = getLangPriority(b.language);
            return priorityA - priorityB;
        });
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("TMDB-plugin__image-approval-modal");

        if (this.isListView) {
            this.renderListView();
        } else {
            this.renderSummaryView();
        }
    }

    // --- ЭКРАН 1: Сводка (Только просмотр) ---
    private renderSummaryView(): void {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Оригинальные изображения" });

        const scrollContainer = contentEl.createDiv({ cls: "TMDB-plugin__summary-scroll" });

        // Находим инфо об изображениях
        const posterInfo = this.data.poster.all.find(img => img.url === this.data.poster.current);
        const coverInfo = this.data.cover.all.find(img => img.url === this.data.cover.current);
        const logoInfo = this.data.logo.all.find(img => img.url === this.data.logo.current);

        this.createSummarySection(scrollContainer, "Постер", this.data.poster.current, "poster", posterInfo?.language);
        // this.createSummarySection(scrollContainer, "Обложка", this.data.cover.current, "cover", coverInfo?.language);
        // this.createSummarySection(scrollContainer, "Логотип", this.data.logo.current, "logo", logoInfo?.language);

        const footer = contentEl.createDiv({ cls: "TMDB-plugin__button-container" });
        const setting = new Setting(footer);

        // // Кнопка "Выбрать вручную" теперь работает как "Начать с начала (с постеров)"
        // setting.addButton(btn => btn
        //     .setButtonText("Выбрать все пошагово")
        //     .onClick(() => {
        //         this.backupData = JSON.parse(JSON.stringify(this.data));
        //         this.activeViewType = "poster";
        //         this.isListView = true;
        //         this.render();
        //     })
        // );

        setting.addButton(btn => btn
            .setButtonText("Сохранить")
            .setCta()
            .onClick(() => {
                // Вызовем onConfirm только с изображениями
                this.onConfirm({
                    poster: this.data.poster.current,
                    cover: this.data.cover.current,
                    logo: this.data.logo.current
                });
                this.close();
            })
        );
    }

    private createSummarySection(
        parent: HTMLElement,
        title: string,
        url: string,
        type: "poster" | "cover" | "logo",
        language?: string
    ): void {
        const card = parent.createDiv({ cls: "TMDB-plugin__summary-section" });

        const header = card.createDiv({ cls: "TMDB-plugin__summary-header" });
        header.createEl("h3", { text: title });

        const imgFrame = card.createDiv({ cls: `TMDB-plugin__summary-image-frame is-${type}` });

        if (url) {
            if (language) {
                imgFrame.createDiv({
                    cls: 'TMDB-plugin__language-badge',
                    text: language.toUpperCase()
                });
            }

            const img = imgFrame.createEl("img");
            img.src = url;
            if (type === 'logo') img.addClass('is-contain');
        } else {
            imgFrame.addClass("is-empty");
            imgFrame.createDiv({ text: "Нет изображения", cls: "empty-text" });
        }

        // --- НОВАЯ КНОПКА "ИЗМЕНИТЬ" ПОД КАРТИНКОЙ ---
        const actionContainer = card.createDiv({ cls: "TMDB-plugin__summary-actions" });
        new Setting(actionContainer).addButton(btn => btn
            .setButtonText("Изменить")
            .setClass("mod-ghost") // Делаем её менее акцентной, чем основные кнопки
            .onClick(() => {
                this.backupData = JSON.parse(JSON.stringify(this.data));
                this.activeViewType = type; // Устанавливаем тип изображения этой секции
                this.isListView = true;
                this.render();
            })
        );
    }

    private renderListView(): void {
        const { contentEl } = this;
        const currentType = this.activeViewType;
        const listData = this.data[currentType];

        contentEl.empty();

        const headerDiv = contentEl.createDiv({ cls: "TMDB-plugin__list-header" });
        const titles: Record<string, string> = {
            "poster": "Выберите Постер",
            "cover": "Выберите Обложку",
            "logo": "Выберите Логотип"
        };
        headerDiv.createEl("h2", { text: titles[currentType] || currentType });

        const gridContainer = contentEl.createDiv({ cls: "TMDB-plugin__images-grid" });
        gridContainer.addClass(`is-${currentType}`);

        const sortedImages = this.sortImages(listData.all);

        sortedImages.forEach((imageInfo) => {
            const { url, language } = imageInfo;
            const imgWrapper = gridContainer.createDiv({
                cls: `TMDB-plugin__grid-item ${url === listData.current ? "is-selected" : ""}`
            });

            if (language) {
                imgWrapper.createDiv({
                    cls: 'TMDB-plugin__language-badge',
                    text: language.toUpperCase()
                });
            }

            const img = imgWrapper.createEl("img");
            img.src = url;

            // Измененная логика клика
            imgWrapper.addEventListener("click", () => {
                // 1. Сохраняем выбранный URL
                this.data[currentType].current = url;

                // 2. СРАЗУ переключаем режим в "Сводку" (Summary View)
                this.isListView = false;

                // 3. Сбрасываем активный тип на постер (по умолчанию для следующего входа)
                this.activeViewType = 'poster';

                // 4. Перерисовываем модалку
                this.render();
            });
        });

        const footer = contentEl.createDiv({ cls: "TMDB-plugin__button-container" });
        new Setting(footer).addButton(btn => btn
            .setButtonText("Назад к сводке")
            .onClick(() => {
                // Отменяем изменения этого шага из бэкапа
                if (this.backupData) {
                    this.data[currentType].current = this.backupData[currentType].current;
                }

                this.isListView = false; // Возврат на главный экран
                this.render();
            }));
    }

    onOpen() {
        this.render();
    }
}