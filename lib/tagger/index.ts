// Batched LLM Job Tagger (lib/tagger/index.ts)
// Enriches NormalizedPosts with role, city, isFresher, and confidence
// Implements contentHash caching, token logging, and Zod validation with 1-retry fallback

import { client } from "../db";
import type { NormalizedPost, TaggedPost, LLMUsage, Role, City } from "../types";
import { CONFIG } from "../config";
import { PROMPT_VERSION, buildSystemPrompt, buildBatchUserPrompt, type TaggingInputPost } from "./prompt";
import { BatchTagResponseSchema, type PostTag } from "./schema";
import { callLLM } from "./provider";

export interface TaggerResult {
  taggedPosts: TaggedPost[];
  totalUsage: LLMUsage;
  cachedCount: number;
  newlyTaggedCount: number;
}

/**
 * Checks PostgreSQL for existing tagged posts with the same contentHash
 */
async function getCachedTagsByContentHash(contentHashes: string[]): Promise<Map<string, { role: Role; city: City; isFresher: boolean; confidence: number; modelVersion: string }>> {
  const cacheMap = new Map<string, { role: Role; city: City; isFresher: boolean; confidence: number; modelVersion: string }>();

  if (contentHashes.length === 0) return cacheMap;

  const rows = await client<Array<{
    content_hash: string;
    role_tag: Role;
    city_tag: City;
    is_fresher: boolean;
    tag_confidence: number | null;
    model_version: string | null;
  }>>`
    SELECT content_hash, role_tag, city_tag, is_fresher, tag_confidence, model_version
    FROM posts
    WHERE content_hash = ANY(${contentHashes})
      AND role_tag IS NOT NULL
      AND city_tag IS NOT NULL
    LIMIT ${contentHashes.length};
  `;

  for (const row of rows) {
    if (!cacheMap.has(row.content_hash)) {
      cacheMap.set(row.content_hash, {
        role: row.role_tag,
        city: row.city_tag,
        isFresher: row.is_fresher,
        confidence: row.tag_confidence ?? 0.90,
        modelVersion: row.model_version || `cached:${CONFIG.llm.model}`,
      });
    }
  }

  return cacheMap;
}

/**
 * Records token consumption metrics into the PostgreSQL llm_usage table
 */
async function recordLLMUsage(
  runId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  postCount: number
): Promise<void> {
  try {
    await client`
      INSERT INTO llm_usage (
        run_id, model, input_tokens, output_tokens, post_count, created_at
      ) VALUES (
        ${runId}, ${model}, ${inputTokens}, ${outputTokens}, ${postCount}, NOW()
      );
    `;
  } catch (err: unknown) {
    console.warn(`[Tagger] Failed to record llm_usage to DB: ${(err as Error)?.message}`);
  }
}

/**
 * Tags a batch of NormalizedPosts using LLM with Zod validation, contentHash caching, and token logging
 */
export async function tagPosts(
  posts: NormalizedPost[],
  runId: string = `run-${Date.now()}`
): Promise<TaggerResult> {
  const totalUsage: LLMUsage = {
    inputTokens: 0,
    outputTokens: 0,
    model: CONFIG.llm.model,
  };

  if (posts.length === 0) {
    return { taggedPosts: [], totalUsage, cachedCount: 0, newlyTaggedCount: 0 };
  }

  console.log(`🏷️ [Tagger] Starting tagging for ${posts.length} posts (Prompt Version: ${PROMPT_VERSION})...`);

  // Step 1: Query contentHash cache
  const contentHashes = Array.from(new Set(posts.map((p) => p.contentHash)));
  const cachedTags = await getCachedTagsByContentHash(contentHashes);

  const postsToTag: NormalizedPost[] = [];
  const taggedPostsMap = new Map<string, TaggedPost>();
  let cachedCount = 0;

  for (const post of posts) {
    const cached = cachedTags.get(post.contentHash);
    if (cached) {
      taggedPostsMap.set(post.sourceId, {
        ...post,
        role: cached.role,
        city: cached.city,
        isFresher: cached.isFresher,
        confidence: cached.confidence,
        modelVersion: cached.modelVersion,
      });
      cachedCount++;
    } else {
      postsToTag.push(post);
    }
  }

  console.log(`   ⚡ Cache hit: ${cachedCount} posts reused. Uncached posts to send to LLM: ${postsToTag.length}`);

  // Step 2: Batch uncached posts and process with LLM
  const batchSize = CONFIG.llm.batchSize;
  const systemPrompt = buildSystemPrompt();
  let newlyTaggedCount = 0;

  for (let i = 0; i < postsToTag.length; i += batchSize) {
    const chunk = postsToTag.slice(i, i + batchSize);
    console.log(`   🤖 Tagging batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(postsToTag.length / batchSize)} (${chunk.length} posts)...`);

    const inputPayload: TaggingInputPost[] = chunk.map((p) => ({
      id: p.sourceId,
      title: p.title,
      locationRaw: p.locationRaw,
      descriptionSnippet: p.description.slice(0, 500),
      preResolvedCity: p.cityPre || null,
    }));

    const userPrompt = buildBatchUserPrompt(inputPayload);

    let parsedTags: PostTag[] | null = null;
    let attemptUsage: LLMUsage | null = null;

    // Retry loop: max 2 attempts on JSON/Zod failure
    for (let attempt = 1; attempt <= CONFIG.llm.maxRetries; attempt++) {
      try {
        const { rawContent, usage } = await callLLM(systemPrompt, userPrompt);
        attemptUsage = usage;

        // Clean any code block backticks if present
        let cleanJson = rawContent.trim();
        if (cleanJson.startsWith("```json")) {
          cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        } else if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```\s*/, "").replace(/```$/, "").trim();
        }

        const rawObj = JSON.parse(cleanJson);
        const validated = BatchTagResponseSchema.parse(rawObj);
        parsedTags = validated.tags;
        break; // Success!
      } catch (err: unknown) {
        console.warn(`[Tagger] Attempt ${attempt} failed: ${(err as Error)?.message}`);
        if (attempt === CONFIG.llm.maxRetries) {
          console.error(`[Tagger] Batch failed after ${attempt} attempts.`);
        }
      }
    }

    // Accumulate tokens
    if (attemptUsage) {
      totalUsage.inputTokens += attemptUsage.inputTokens;
      totalUsage.outputTokens += attemptUsage.outputTokens;
      totalUsage.model = attemptUsage.model;

      // Log token metrics to PostgreSQL llm_usage table
      await recordLLMUsage(
        runId,
        attemptUsage.model,
        attemptUsage.inputTokens,
        attemptUsage.outputTokens,
        chunk.length
      );
    }

    // Map parsed tags back to posts
    const tagMap = new Map<string, PostTag>();
    if (parsedTags) {
      for (const t of parsedTags) {
        tagMap.set(t.id, t);
      }
    }

    for (const post of chunk) {
      const match = tagMap.get(post.sourceId);

      if (match) {
        // Enforce deterministic pre-pass city if valid and not unknown
        const finalCity: City = post.cityPre && post.cityPre !== "Unknown" && post.cityPre !== "Other"
          ? post.cityPre
          : match.city;

        taggedPostsMap.set(post.sourceId, {
          ...post,
          role: match.role,
          city: finalCity,
          isFresher: match.isFresher,
          confidence: match.confidence,
          modelVersion: `${CONFIG.llm.model}:${PROMPT_VERSION}`,
        });
        newlyTaggedCount++;
      } else {
        // Fallback default in case of batch parsing glitch
        taggedPostsMap.set(post.sourceId, {
          ...post,
          role: "Other",
          city: post.cityPre || "Unknown",
          isFresher: true,
          confidence: 0.5,
          modelVersion: "fallback:unclassified",
        });
      }
    }
  }

  // Preserve original ordering
  const finalTaggedPosts = posts.map((p) => taggedPostsMap.get(p.sourceId)!);

  console.log(`✅ [Tagger] Finished tagging. Newly tagged: ${newlyTaggedCount}, Cached: ${cachedCount}, Total input tokens: ${totalUsage.inputTokens}, Output tokens: ${totalUsage.outputTokens}`);

  return {
    taggedPosts: finalTaggedPosts,
    totalUsage,
    cachedCount,
    newlyTaggedCount,
  };
}
