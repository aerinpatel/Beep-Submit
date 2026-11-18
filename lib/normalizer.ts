// Deterministic Job Post Normalizer (lib/normalizer.ts)
// Canonicalizes URLs, sanitizes descriptions, runs deterministic city pre-pass, and computes contentHash

import { createHash } from "crypto";
import type { RawPost, NormalizedPost, City } from "./types";
import { CITY_ALIASES, CITIES } from "./config";

/**
 * Strips UTM tags, tracking parameters, fragments, and trailing slashes from URLs
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);

    // List of tracking query parameters to discard
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "gh_src",
      "gh_jid",
      "lever-source",
      "lever-origin",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
    ];

    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }

    // Strip URL fragment/hash
    parsed.hash = "";

    // Normalize protocol and host to lowercase
    let cleanUrl = `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}`;

    // Remove trailing slash unless it is just root domain path
    if (cleanUrl.endsWith("/") && parsed.pathname !== "/") {
      cleanUrl = cleanUrl.slice(0, -1);
    }

    // Retain non-tracking query parameters if any remained
    const remainingQuery = parsed.searchParams.toString();
    if (remainingQuery) {
      cleanUrl += `?${remainingQuery}`;
    }

    return cleanUrl;
  } catch {
    // If URL parsing fails, clean basic string
    return rawUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
  }
}

/**
 * Converts any HTML to plain text and strips extra whitespace and escape characters
 */
export function cleanDescription(rawText: string): string {
  if (!rawText) return "";

  return rawText
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/[\r\t]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Deterministic pre-pass: matches raw location string against canonical CITY_ALIASES
 * Returns resolved City enum value if matched deterministically, or null if ambiguous
 */
export function resolveCityPre(locationRaw: string): City | null {
  if (!locationRaw) return null;

  // Clean and normalize input string
  const normalized = locationRaw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  // 1. Direct alias check (sorted by key length descending so longer phrases match first)
  const aliasKeys = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);

  for (const alias of aliasKeys) {
    // Check for whole word or exact token match
    const regex = new RegExp(`\\b${alias}\\b`, "i");
    if (regex.test(normalized)) {
      return CITY_ALIASES[alias];
    }
  }

  // 2. Check canonical enum list
  for (const city of CITIES) {
    if (city === "Other" || city === "Unknown") continue;
    const regex = new RegExp(`\\b${city.toLowerCase()}\\b`, "i");
    if (regex.test(normalized)) {
      return city;
    }
  }

  return null;
}

/**
 * Normalizes a company name, stripping legal entity suffixes and non-alphanumeric chars
 */
function normalizeCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|pvt|private|technologies|technology|solutions|labs)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Normalizes a text string for hash calculation (lowercase alphanumeric only)
 */
function normalizeForHash(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Computes deterministic contentHash = SHA-256(normalize(company + title + city))
 */
export function computeContentHash(
  company: string,
  title: string,
  city?: string | null
): string {
  const normCompany = normalizeCompany(company);
  const normTitle = normalizeForHash(title);
  const normCity = city ? normalizeForHash(city) : "unknown";

  const seed = `${normCompany}|${normTitle}|${normCity}`;
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Normalizes a single RawPost into a NormalizedPost
 */
export function normalizePost(raw: RawPost): NormalizedPost {
  const canonicalUrl = normalizeUrl(raw.url);
  const cleanedDesc = cleanDescription(raw.description);
  const cityPre = resolveCityPre(raw.locationRaw);
  const contentHash = computeContentHash(raw.company, raw.title, cityPre);

  return {
    ...raw,
    canonicalUrl,
    description: cleanedDesc,
    cityPre,
    contentHash,
  };
}

/**
 * Normalizes an array of RawPosts
 */
export function normalizePosts(rawPosts: RawPost[]): NormalizedPost[] {
  return rawPosts.map(normalizePost);
}
