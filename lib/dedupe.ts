// Layered Job Post Deduplicator (lib/dedupe.ts)
// Layer (a): Exact match on canonicalUrl or contentHash
// Layer (b): Fuzzy match via pg_trgm title similarity > 0.85 within the same company
// Flags duplicates with is_duplicate_of without deleting records

import { sql } from "drizzle-orm";
import { client } from "./db";
import type { NormalizedPost } from "./types";
import { CONFIG } from "./config";

export interface DedupeCounts {
  total: number;
  unique: number;
  exactDuplicates: number;
  fuzzyDuplicates: number;
}

export interface DedupedPost extends NormalizedPost {
  isDuplicateOf: string | null;
}

export interface DedupeResult {
  posts: DedupedPost[];
  counts: DedupeCounts;
}

/**
 * Computes in-memory trigram similarity between two strings
 * Used for intra-batch duplicate detection before rows are committed to Postgres
 */
export function calculateTrigramSimilarity(str1: string, str2: string): number {
  const s1 = `  ${str1.toLowerCase().trim()} `;
  const s2 = `  ${str2.toLowerCase().trim()} `;

  if (s1 === s2) return 1.0;
  if (s1.length < 3 || s2.length < 3) return 0.0;

  const getTrigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 2; i++) {
      const tri = s.slice(i, i + 3);
      map.set(tri, (map.get(tri) || 0) + 1);
    }
    return map;
  };

  const map1 = getTrigrams(s1);
  const map2 = getTrigrams(s2);

  let intersection = 0;
  for (const [tri, count1] of map1.entries()) {
    const count2 = map2.get(tri);
    if (count2) {
      intersection += Math.min(count1, count2);
    }
  }

  const totalTrigrams = (s1.length - 2) + (s2.length - 2);
  return (2.0 * intersection) / totalTrigrams;
}

/**
 * Deduplicates an array of NormalizedPosts against the PostgreSQL database and within the batch
 */
export async function deduplicatePosts(incomingPosts: NormalizedPost[]): Promise<DedupeResult> {
  const counts: DedupeCounts = {
    total: incomingPosts.length,
    unique: 0,
    exactDuplicates: 0,
    fuzzyDuplicates: 0,
  };

  const results: DedupedPost[] = [];

  // In-memory registries for intra-batch exact and fuzzy deduplication
  const seenCanonicalUrls = new Map<string, string>(); // canonicalUrl -> primary post id or sourceId
  const seenContentHashes = new Map<string, string>(); // contentHash -> primary post id or sourceId
  const acceptedBatchPosts: Array<{ title: string; company: string; identifier: string }> = [];

  for (const post of incomingPosts) {
    let duplicateOf: string | null = null;

    // -------------------------------------------------------------
    // LAYER 1: Exact Match (Intra-batch)
    // -------------------------------------------------------------
    if (seenCanonicalUrls.has(post.canonicalUrl)) {
      duplicateOf = seenCanonicalUrls.get(post.canonicalUrl)!;
      counts.exactDuplicates++;
      results.push({ ...post, isDuplicateOf: duplicateOf });
      continue;
    }

    if (seenContentHashes.has(post.contentHash)) {
      duplicateOf = seenContentHashes.get(post.contentHash)!;
      counts.exactDuplicates++;
      results.push({ ...post, isDuplicateOf: duplicateOf });
      continue;
    }

    // -------------------------------------------------------------
    // LAYER 2: Exact Match (Database Lookups via canonical_url or content_hash)
    // Exclude the post's own existing record to prevent self-duplication on re-runs
    // -------------------------------------------------------------
    const exactMatches = await client<Array<{ id: string; is_duplicate_of: string | null }>>`
      SELECT id, is_duplicate_of
      FROM posts
      WHERE (canonical_url = ${post.canonicalUrl} OR content_hash = ${post.contentHash})
        AND NOT (source = ${post.source} AND source_id = ${post.sourceId})
      LIMIT 1;
    `;

    if (exactMatches.length > 0) {
      // Point to original root post if the matched row is itself a duplicate
      duplicateOf = exactMatches[0].is_duplicate_of || exactMatches[0].id;
      seenCanonicalUrls.set(post.canonicalUrl, duplicateOf);
      seenContentHashes.set(post.contentHash, duplicateOf);
      counts.exactDuplicates++;
      results.push({ ...post, isDuplicateOf: duplicateOf });
      continue;
    }

    // -------------------------------------------------------------
    // LAYER 3: Fuzzy Match via pg_trgm (Database lookup within same company)
    // Threshold defined in CONFIG (0.85) - exclude self
    // -------------------------------------------------------------
    const threshold = CONFIG.dedupe.fuzzyTitleSimilarityThreshold;

    const fuzzyDbMatches = await client<Array<{ id: string; is_duplicate_of: string | null; similarity: number }>>`
      SELECT id, is_duplicate_of, similarity(title, ${post.title}) AS similarity
      FROM posts
      WHERE LOWER(company) = LOWER(${post.company})
        AND is_duplicate_of IS NULL
        AND NOT (source = ${post.source} AND source_id = ${post.sourceId})
        AND similarity(title, ${post.title}) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT 1;
    `;

    if (fuzzyDbMatches.length > 0) {
      duplicateOf = fuzzyDbMatches[0].is_duplicate_of || fuzzyDbMatches[0].id;
      seenCanonicalUrls.set(post.canonicalUrl, duplicateOf);
      seenContentHashes.set(post.contentHash, duplicateOf);
      counts.fuzzyDuplicates++;
      results.push({ ...post, isDuplicateOf: duplicateOf });
      continue;
    }

    // Check if this post was already registered in DB with an existing duplicate link
    const existingSelf = await client<Array<{ id: string; is_duplicate_of: string | null }>>`
      SELECT id, is_duplicate_of
      FROM posts
      WHERE source = ${post.source} AND source_id = ${post.sourceId}
      LIMIT 1;
    `;

    if (existingSelf.length > 0 && existingSelf[0].is_duplicate_of !== null && existingSelf[0].is_duplicate_of !== existingSelf[0].id) {
      // Maintain previous duplicate link to root post
      counts.exactDuplicates++;
      results.push({ ...post, isDuplicateOf: existingSelf[0].is_duplicate_of });
      continue;
    }

    // -------------------------------------------------------------
    // LAYER 4: Fuzzy Match (Intra-batch within same company)
    // -------------------------------------------------------------
    let intraBatchFuzzyMatch: string | null = null;
    for (const prev of acceptedBatchPosts) {
      if (prev.company.toLowerCase() === post.company.toLowerCase()) {
        const sim = calculateTrigramSimilarity(prev.title, post.title);
        if (sim >= threshold) {
          intraBatchFuzzyMatch = prev.identifier;
          break;
        }
      }
    }

    if (intraBatchFuzzyMatch) {
      duplicateOf = intraBatchFuzzyMatch;
      seenCanonicalUrls.set(post.canonicalUrl, duplicateOf);
      seenContentHashes.set(post.contentHash, duplicateOf);
      counts.fuzzyDuplicates++;
      results.push({ ...post, isDuplicateOf: duplicateOf });
      continue;
    }

    // Post is unique!
    counts.unique++;
    const postIdentifier = post.sourceId;
    seenCanonicalUrls.set(post.canonicalUrl, postIdentifier);
    seenContentHashes.set(post.contentHash, postIdentifier);
    acceptedBatchPosts.push({
      title: post.title,
      company: post.company,
      identifier: postIdentifier,
    });

    results.push({ ...post, isDuplicateOf: null });
  }

  return {
    posts: results,
    counts,
  };
}
