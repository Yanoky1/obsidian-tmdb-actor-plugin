/**
 * TMDB_response.ts
 *
 * Types and interfaces for TMDB API (TMDB.dev)
 * Defines data structures for movie/series search and detailed information
 */

/**
 * Search result item
 */
export interface TMDBSuggestItem {
	id: number;
	name: string;
	alternativeName: string;
	type: string;
	year: number;
	poster?: TMDBImageUrl;
	rating?: TMDBRatings;
}

/**
 * Search API response
 */
export interface TMDBSuggestItemsResponse {
	docs: TMDBSuggestItem[];
}

/**
 * Complete movie/series information from TMDB API
 */
export interface TMDBFullInfo {
	id: number;
	name: string;
	alternativeName: string;
	type: string;
	year: number;
	description?: string;
	TMDBLink: string;
	poster?: TMDBImageUrl;
	genres: TMDBSimpleItem[];
	countries: TMDBSimpleItem[];
	persons: TMDBPerson[];
	movieLength?: number;
	backdrop?: TMDBImageUrl;
	logo?: TMDBImageUrl;
	isSeries: boolean;
	seriesLength?: number;
	status?: string;
	rating?: TMDBRatings;
	externalId?: TMDBExternalIds;
	seasonsInfo?: TMDBSeasonInfo[];
	slogan?: string;
	budget?: TMDBMoney;
	fees?: TMDBFees;
	premiere?: TMDBPremiere;
	votes?: TMDBVotes;
	facts?: TMDBFact[];
	shortDescription?: string;
	ageRating?: number;
	ratingMpaa?: string;
	releaseYears?: TMDBReleaseYear[];
	top10?: number;
	top250?: number;
	totalSeriesLength?: number;
	typeNumber?: number;
	enName?: string;
	names?: TMDBName[];
	networks?: TMDBNetworks;
	subType?: string;
	sequelsAndPrequels?: TMDBRelatedMovie[];
	productionCompanies?: TMDBProductionCompany[];
	distributors?: TMDBDistributors;
	// Actor-specific fields
	deathday?: string;
	gender?: number;
	birthPlace?: string;
	deathPlace?: string;
	alsoKnownAs?: string[];
	hometown?: string;
	homepage?: string;
	knownForDepartment?: string;
}

/**
 * Image URL with preview
 */
export interface TMDBImageUrl {
	url?: string;
	previewUrl?: string;
}

/**
 * Simple item with name (genre, country, etc.)
 */
export interface TMDBSimpleItem {
	name: string;
}

/**
 * Person information (actor, director, etc.)
 */
export interface TMDBPerson {
	id?: number;
	name: string;
	enName?: string;
	description?: string;
	profession?: string;
	enProfession: string;
	photo?: string;
}

/**
 * Series season information
 */
export interface TMDBSeasonInfo {
	number: number;
	episodesCount: number;
}

/**
 * Ratings from various sources
 */
export interface TMDBRatings {
	tmdb?: number;
	imdb?: number;
	filmCritics?: number;
	russianFilmCritics?: number;
	await?: number;
}

/**
 * External movie/series identifiers
 */
export interface TMDBExternalIds {
	imdb?: string;
	tmdb?: number;
	kpHD?: string;
}

/**
 * Money amount with currency
 */
export interface TMDBMoney {
	value?: number;
	currency?: string;
}

/**
 * Box office collections by region
 */
export interface TMDBFees {
	world?: TMDBMoney;
	russia?: TMDBMoney;
	usa?: TMDBMoney;
}

/**
 * Premiere dates in different formats
 */
export interface TMDBPremiere {
	world?: string;
	russia?: string;
	digital?: string;
	cinema?: string;
}

/**
 * Vote counts from various sources
 */
export interface TMDBVotes {
	tmdb?: number;
	imdb?: number;
	filmCritics?: number;
	russianFilmCritics?: number;
	await?: number;
}

export interface TMDBFact {
	value: string;
	type: string;
	spoiler: boolean;
}

/**
 * Release period (for series)
 */
export interface TMDBReleaseYear {
	start?: number;
	end?: number;
}

/**
 * Alternative names in different languages
 */
export interface TMDBName {
	name: string;
	language?: string;
	type?: string;
}

/**
 * TV networks/channels
 */
export interface TMDBNetworks {
	items?: TMDBSimpleItem[];
}

/**
 * Related movie/series (sequel, prequel, etc.)
 */
export interface TMDBRelatedMovie {
	id: number;
	name: string;
	alternativeName?: string;
	enName?: string;
	type: string;
	poster?: TMDBImageUrl;
	rating?: TMDBRatings;
	year?: number;
}

export interface TMDBProductionCompany {
	name: string;
	url?: string;
	previewUrl?: string;
}

export interface TMDBDistributors {
	distributor?: string;
	distributorRelease?: string;
}