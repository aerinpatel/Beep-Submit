// Helper utilities for fetchers (lib/sources/utils.ts)
// Implements polite rate limiting, exponential backoff retries, and early-career heuristic filtering

import { CONFIG, FRESHER_KEYWORDS } from "../config";

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = CONFIG.llm.maxRetries,
  backoffMs: number = 500
): Promise<Response> {
  const headers = {
    "User-Agent": CONFIG.pipeline.userAgent,
    Accept: "application/json, text/plain, */*",
    ...(options.headers || {}),
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.pipeline.requestTimeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle HTTP rate limits (429) or temporary server errors (500, 502, 503)
      if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
        if (attempt < retries) {
          const delay = backoffMs * Math.pow(2, attempt);
          console.warn(`[fetchWithRetry] Received HTTP ${response.status} from ${url}. Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      return response;
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        throw err;
      }
      const delay = backoffMs * Math.pow(2, attempt);
      console.warn(`[fetchWithRetry] Network error on ${url}: ${(err as Error)?.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error(`Failed to fetch from ${url} after ${retries} retries`);
}

/**
 * Checks if a job title or location indicates an India-relevant or Remote early career post
 */
export function isFresherRelevant(title: string, description: string = "", location: string = ""): boolean {
  const combined = `${title} ${description.slice(0, 500)}`.toLowerCase();

  // Match early career / fresher keywords
  const hasFresherKeyword = FRESHER_KEYWORDS.some((kw) => {
    // Word boundary match or substring for numbers
    if (kw.includes("0-1") || kw.includes("2025") || kw.includes("2026") || kw.includes("sde 1")) {
      return combined.includes(kw);
    }
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    return regex.test(combined);
  });

  return hasFresherKeyword;
}

/**
 * Checks if the location mentions India, an Indian city, or Remote
 */
export function isIndiaOrRemote(location: string): boolean {
  if (!location) return true; // Default permissive so LLM tagger can refine
  const loc = location.toLowerCase();

  const indianLocations = [
    "india",
    "bangalore",
    "bengaluru",
    "pune",
    "mumbai",
    "delhi",
    "gurgaon",
    "gurugram",
    "noida",
    "hyderabad",
    "chennai",
    "kolkata",
    "ahmedabad",
    "jaipur",
    "karnataka",
    "maharashtra",
    "telangana",
    "tamil nadu",
    "haryana",
    "uttar pradesh",
    "remote",
    "anywhere",
    "virtual",
    "wfh",
  ];

  return indianLocations.some((place) => loc.includes(place));
}

/**
 * Fast HTML-to-plain-text cleaner for description fields
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}
