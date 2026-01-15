/**
 * MovieShow.model.ts
 *
 * Movie/series data model for Obsidian templates
 * Defines unified data structure for template substitution
 *
 * Note: Most fields are string arrays for YAML compatibility
 * URLs remain unquoted, numeric fields keep primitive types
 */

export interface MovieShow {
	// Basic information
	id: number;
	name: string[];
	alternativeName: string[];
	year: number;
	description: string[];
	shortDescription: string[];

	TMDBLink: string[];

	// Actor-specific fields
	sex?: string[];
	spouses?: string[];
	birthday?: string[];
	death?: string[];
	growth?: string[];
	kinopoiskUrl?: string[]; // Оставлено для совместимости
	birthPlace?: string[]; // Место рождения
	deathPlace?: string[]; // Место смерти
	alsoKnownAs?: string[]; // Также известен как
	biography?: string[]; // Биография
	hometown?: string[]; // Родной город
	placeOfBirth?: string[]; // Место рождения
	placeOfDeath?: string[]; // Место смерти
	homepage?: string[]; // Домашняя страница
	knownForDepartment?: string[]; // Известен в департаменте
	popularity?: number; // Популярность
	externalIds?: string[]; // Внешние ID
	// Combined names for aliases (to avoid duplicates)
	allNames?: string[]; // Объединенные имена для псевдонимов

	// Images - URLs without quotes (web links or local paths)
	posterUrl: string[];
	coverUrl: string[];
	logoUrl: string[];

	// Obsidian-formatted image links - auto-formatted as ![[path]] or ![](path)
	posterMarkdown: string[];
	coverMarkdown: string[];
	logoMarkdown: string[];

	// Clean image paths - filename only for template sizing: ![350]({{posterPath}})
	posterPath: string[];
	coverPath: string[];
	logoPath: string[];

	// Mobile-optimized image paths with height multiplier
	coverPathMobile: string[];

	// Classification
	genres: string[];
	genresLinks: string[]; // Formatted as [[Genre]] Obsidian links
	countries: string[];
	countriesLinks: string[]; // Formatted as [[Country]] Obsidian links
	type: string[];
	subType: string[];

	// People
	
	director: string[];
	directorsLinks: string[]; // Formatted as [[Director]] Obsidian links
	directorsLinksWithPath: string[]; // Formatted as [[path/Director]] Obsidian links
	directorsIdsWithPath: string[]; // Formatted as [[path/ID|Director]] Obsidian links

	actors: string[];
	actorsLinks: string[]; // Formatted as [[Actor]] Obsidian links
	actorsLinksWithPath: string[]; // Formatted as [[path/Actor]] Obsidian links
	actorsIdsWithPath: string[]; // Formatted as [[path/ID|Actor]] Obsidian links

	writers: string[];
	writersLinks: string[]; // Formatted as [[Writer]] Obsidian links
	writersLinksWithPath: string[]; // Formatted as [[path/Writer]] Obsidian links
	writersIdsWithPath: string[]; // Formatted as [[path/ID|Writer]] Obsidian links

	producers: string[];
	producersLinks: string[]; // Formatted as [[Producer]] Obsidian links
	producersLinksWithPath: string[]; // Formatted as [[path/Producer]] Obsidian links
	producersIdsWithPath: string[]; // Formatted as [[path/ID|Producer]] Obsidian links

	// Technical specs
	movieLength: number; // Duration in minutes
	isSeries: boolean;
	seriesLength: number; // Episode duration
	totalSeriesLength: number; // Total duration of all episodes
	isComplete: string; // Series completion status
	seasonsCount: number;
	seriesInSeasonCount: number; // Average episodes per season

	// Ratings and votes
	ratingTmdb: number;
	ratingImdb: number;
	ratingFilmCritics: number;
	ratingRussianFilmCritics: number;
	votesTmdb: number;
	votesImdb: number;
	votesFilmCritics: number;
	votesRussianFilmCritics: number;

	// User rating
	userRating?: number;

	// External IDs and links
	TMDBUrl: string[]; // URLs without quotes
	imdbId: string[];
	tmdbId: number;

	// Additional info
	slogan: string[];
	ageRating: number;
	ratingMpaa: string[];

	// Status
	status: string[];

	// Finance
	budgetValue: number;
	budgetCurrency: string[];
	feesWorldValue: number;
	feesWorldCurrency: string[];
	feesRussiaValue: number;
	feesRussiaCurrency: string[];
	feesUsaValue: number;
	feesUsaCurrency: string[];

	// Premiere dates
	premiereWorld: string[];
	premiereRussia: string[];
	premiereDigital: string[];
	premiereCinema: string[];

	// Release periods
	releaseYearsStart: number;
	releaseYearsEnd: number;

	// Top ratings
	top10: number;
	top250: number;

	// Facts - limited to 5 items, HTML cleaned
	facts: string[];

	// Alternative names
	allNamesString: string[]; // All known names
	enName: string[];

	// Networks and companies
	networks: string[]; // TV networks/channels
	networksLinks: string[]; // Formatted as Obsidian links
	productionCompanies: string[];
	productionCompaniesLinks: string[]; // Formatted as Obsidian links

	// Distributors
	distributor: string[];
	distributorRelease: string[];

	// Related movies/series
	sequelsAndPrequels: string[];
	sequelsAndPrequelsLinks: string[]; // Formatted as Obsidian links

	// File naming properties - cleaned of special characters, unquoted
	nameForFile: string;
	alternativeNameForFile: string;
	enNameForFile: string;
}