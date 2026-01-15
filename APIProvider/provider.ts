/**
 * provider.ts
 *
 * Data provider for TMDB API integration - ACTOR SEARCH VERSION
 * Handles actor/person data retrieval from themoviedb.org API
 */
import { requestUrl } from "obsidian";
import {
	TMDBSuggestItem,
	TMDBFullInfo,
} from "Models/TMDB_response";
import { MovieShow } from "Models/MovieShow.model";
import { ErrorHandler } from "APIProvider/ErrorHandler";
import { DataFormatter } from "APIProvider/DataFormatter";
import { ApiValidator } from "APIProvider/ApiValidator";
import { ImageInfo } from "Views/image_selection_modal";
import { t, tWithParams } from "../i18n";

const API_BASE_URL = "https://api.themoviedb.org/3";
const MAX_SEARCH_RESULTS = 20;
const LANGUAGE = "ru-RU";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/";

export class TMDBProvider {
	private errorHandler: ErrorHandler;
	private dataFormatter: DataFormatter;
	private validator: ApiValidator;

	constructor(settings?: {
		actorsPath: string;
		directorsPath: string;
		writersPath: string;
		producersPath: string;
	}) {
		this.errorHandler = new ErrorHandler();
		this.dataFormatter = new DataFormatter();
		this.validator = new ApiValidator();

		if (settings) {
			this.dataFormatter.setSettings(settings);
		}
	}

	/**
	 * Performs HTTP GET request to TMDB API
	 */
	private async apiGet<T>(
		endpoint: string,
		token: string,
		params: Record<string, string | number> = {}
	): Promise<T> {
		if (!this.validator.isValidToken(token)) {
			throw new Error(t("provider.tokenRequired"));
		}

		params.language = LANGUAGE;
		const url = this.buildUrl(endpoint, params);

		try {
			const res = await requestUrl({
				url,
				method: 'GET',
				headers: {
					accept: 'application/json',
					Authorization: 'Bearer ' + token
				},
			});

			return res.json as T;
		} catch (error: unknown) {
			throw this.errorHandler.handleApiError(error);
		}
	}

	/**
	 * Builds URL with query parameters
	 */
	private buildUrl(
		endpoint: string,
		params: Record<string, string | number>
	): string {
		const url = new URL(`${API_BASE_URL}${endpoint}`);

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null && value !== "") {
				url.searchParams.set(key, value.toString());
			}
		}

		return url.href;
	}

	/**
	 * Calculate relevance score for actor search result
	 */
	private calculateRelevanceScore(item: any, query: string): number {
		const normalizedQuery = query.toLowerCase().trim();
		const name = (item.name || '').toLowerCase();

		let score = 0;

		// Exact match gets highest priority
		if (name === normalizedQuery) {
			score += 1000;
		}

		// Name starts with query
		if (name.startsWith(normalizedQuery)) {
			score += 500;
		}

		// Name contains query
		if (name.includes(normalizedQuery)) {
			score += 250;
		}

		// Factor in popularity
		score += (item.popularity || 0) * 2;

		return score;
	}

	/**
	 * Search for actors/people by query
	 */
	public async searchByQuery(
		query: string,
		token: string
	): Promise<TMDBSuggestItem[]> {
		if (!this.validator.isValidSearchQuery(query)) {
			throw new Error(t("provider.enterMovieTitle")); // TODO: Change to "Enter person name"
		}

		const response = await this.apiGet<any>(
			"/search/person",
			token,
			{
				query: query.trim(),
				page: 1
			}
		);

		const results = (response.results || [])
			.map((item: any) => ({
				item: this.convertToSuggestItem(item),
				score: this.calculateRelevanceScore(item, query)
			}))
			.sort((a: any, b: any) => b.score - a.score)
			.map((entry: any) => entry.item)
			.slice(0, MAX_SEARCH_RESULTS);

		if (results.length === 0) {
			throw new Error(
				tWithParams("provider.nothingFound", { query }) +
				" " +
				t("provider.tryChangeQuery")
			);
		}

		return results;
	}

	/**
	 * Get all available images for a person
	 */
	public async getAllImages(id: number, token: string, type?: string): Promise<{
		posters: ImageInfo[];  // Profile images will be in posters
		backdrops: ImageInfo[]; // Tagged images will be in backdrops
		logos: ImageInfo[];     // Empty for actors
	}> {
		try {
			const endpoint = `/person/${id}/images`;
			const images = await this.apiGet<any>(endpoint, token, {});

			const extractImageData = (imageArray: any[] = []): ImageInfo[] => {
				return imageArray
					.map((img: any) => ({
						url: `${IMAGE_BASE_URL}original${img.file_path}`,
						language: img.iso_639_1 || undefined
					}))
					.filter((img) => img.url && img.url.trim() !== '');
			};

			// For actors, profiles go to posters, tagged images to backdrops
			return {
				posters: extractImageData(images.profiles || []),
				backdrops: extractImageData(images.tagged_images || []),
				logos: [] // Actors don't have logos
			};
		} catch (error) {
			console.error('Error fetching all images:', error);
			return { posters: [], backdrops: [], logos: [] };
		}
	}

	/**
	 * Convert TMDB person search result to TMDBSuggestItem format
	 */
	private convertToSuggestItem(item: any): TMDBSuggestItem {
		const name = item.name || '';
		const knownFor = item.known_for_department || 'Acting';

		return {
			id: item.id,
			name: name,
			alternativeName: knownFor, // Use profession instead of alt name
			type: 'person',
			year: 0, // Actors don't have a year
			poster: item.profile_path ? {
				url: `${IMAGE_BASE_URL}w500${item.profile_path}`,
				previewUrl: `${IMAGE_BASE_URL}w185${item.profile_path}`
			} : undefined,
			rating: {
				tmdb: item.popularity || 0,
				imdb: 0
			}
		};
	}

	/**
	 * Retrieves detailed person information by ID
	 */
	public async getMovieById(id: number, token: string, type?: string, userRating?: number): Promise<MovieShow> {
		if (!this.validator.isValidMovieId(id)) {
			throw new Error(t("provider.invalidMovieId"));
		}

		if (!this.validator.isValidToken(token)) {
			throw new Error(t("provider.tokenRequiredForMovie"));
		}

		const personData = await this.getPersonDetails(id, token);
		return this.dataFormatter.createMovieShowFrom(personData, userRating);
	}

	/**
	 * Get person details from TMDB
	 */
	private async getPersonDetails(id: number, token: string): Promise<TMDBFullInfo> {
		const [details, credits, images] = await Promise.all([
			this.apiGet<any>(`/person/${id}`, token, {
				append_to_response: 'external_ids,translations'
			}),
			this.apiGet<any>(`/person/${id}/combined_credits`, token, {}),
			this.apiGet<any>(`/person/${id}/images`, token, {})
		]);

		return this.dataFormatter.convertPersonToTMDBFormat(details, credits, images);
	}

	/**
	 * Validates API token by making test request
	 */
	public async validateToken(token: string): Promise<boolean> {
		if (!this.validator.isValidToken(token)) {
			return false;
		}

		try {
			await this.apiGet<any>("/configuration", token, {});
			return true;
		} catch {
			return false;
		}
	}
}

// Legacy compatibility functions
const provider = new TMDBProvider();

export async function getByQuery(
	query: string,
	token: string
): Promise<TMDBSuggestItem[]> {
	return provider.searchByQuery(query, token);
}

export async function getMovieShowById(
	id: number,
	token: string
): Promise<MovieShow> {
	return provider.getMovieById(id, token);
}

export async function validateApiToken(token: string): Promise<boolean> {
	return provider.validateToken(token);
}