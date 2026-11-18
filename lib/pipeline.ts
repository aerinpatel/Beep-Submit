// Pipeline Orchestrator (lib/pipeline.ts)
// Runs fetch -> normalize -> dedupe -> tag -> upsert in resumable, idempotent stages
// Records run metrics and stage errors to PostgreSQL runs table

import { client } from "./db";
import type { RawPost, NormalizedPost, TaggedPost, PipelineStageCounts, RunLog } from "./types";
import { fetchAllSources } from "./sources";
import { normalizePosts } from "./normalizer";
import { deduplicatePosts, type DedupedPost } from "./dedupe";
import { tagPosts } from "./tagger";

export interface PipelineOptions {
  runId?: string;
  sourceFilter?: string[]; // Optional: run for specific sources
  maxPostsToTag?: number;  // Optional limit for testing/dev
}

export interface PipelineExecutionResult {
  runId: string;
  status: "success" | "partial" | "failed";
  stageCounts: PipelineStageCounts;
  durationMs: number;
  errorLog?: string | null;
}

/**
 * Initializes a new run row in the PostgreSQL runs table
 */
async function initRunLog(runId: string): Promise<void> {
  const initialCounts: PipelineStageCounts = {
    fetched: 0,
    normalized: 0,
    dedupedExact: 0,
    dedupedFuzzy: 0,
    tagged: 0,
    upserted: 0,
    errors: 0,
  };

  await client`
    INSERT INTO runs (id, started_at, status, stage_counts)
    VALUES (${runId}, NOW(), 'running', ${JSON.stringify(initialCounts)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET status = 'running';
  `;
}

/**
 * Finalizes the run row with status, finished_at, stage counts, and error log
 */
async function finalizeRunLog(
  runId: string,
  status: "success" | "partial" | "failed",
  counts: PipelineStageCounts,
  errorLog?: string | null
): Promise<void> {
  try {
    await client`
      UPDATE runs
      SET
        finished_at = NOW(),
        status = ${status},
        stage_counts = ${JSON.stringify(counts)}::jsonb,
        error_log = ${errorLog || null}
      WHERE id = ${runId};
    `;
  } catch (err: unknown) {
    console.warn(`[Pipeline] Failed to update final run status in DB: ${(err as Error)?.message}`);
  }
}

/**
 * Batch upserts tagged and deduped posts into PostgreSQL posts table
 * Updates last_seen_at for live listings and properly links is_duplicate_of UUIDs
 */
async function upsertPostsToDatabase(
  dedupedPosts: DedupedPost[],
  taggedMap: Map<string, TaggedPost>
): Promise<number> {
  let upsertedCount = 0;
  const sourceIdToDbUuid = new Map<string, string>();

  // Pass 1: Upsert primary (non-duplicate) posts first so they receive valid DB UUIDs
  const primaryPosts = dedupedPosts.filter((p) => p.isDuplicateOf === null);
  const duplicatePosts = dedupedPosts.filter((p) => p.isDuplicateOf !== null);

  for (const post of primaryPosts) {
    const tagged = taggedMap.get(post.sourceId);

    const rows = await client<Array<{ id: string }>>`
      INSERT INTO posts (
        source, source_id, url, canonical_url, title, company,
        location_raw, description, content_hash, posted_at,
        last_seen_at,
        role_tag, city_tag, is_fresher, tag_confidence, tagged_at, model_version,
        is_duplicate_of
      ) VALUES (
        ${post.source}, ${post.sourceId}, ${post.url}, ${post.canonicalUrl}, ${post.title}, ${post.company},
        ${post.locationRaw}, ${post.description}, ${post.contentHash},
        ${post.postedAt ? new Date(post.postedAt).toISOString() : null},
        NOW(),
        ${tagged ? tagged.role : null},
        ${tagged ? tagged.city : null},
        ${tagged ? tagged.isFresher : false},
        ${tagged ? tagged.confidence : null},
        ${tagged ? new Date().toISOString() : null},
        ${tagged ? tagged.modelVersion : null},
        NULL
      )
      ON CONFLICT (source, source_id) DO UPDATE SET
        last_seen_at = NOW(),
        canonical_url = EXCLUDED.canonical_url,
        title = EXCLUDED.title,
        location_raw = EXCLUDED.location_raw,
        description = EXCLUDED.description,
        content_hash = EXCLUDED.content_hash,
        role_tag = COALESCE(EXCLUDED.role_tag, posts.role_tag),
        city_tag = COALESCE(EXCLUDED.city_tag, posts.city_tag),
        is_fresher = COALESCE(EXCLUDED.is_fresher, posts.is_fresher),
        tag_confidence = COALESCE(EXCLUDED.tag_confidence, posts.tag_confidence),
        tagged_at = COALESCE(EXCLUDED.tagged_at, posts.tagged_at),
        model_version = COALESCE(EXCLUDED.model_version, posts.model_version)
      RETURNING id;
    `;

    if (rows.length > 0) {
      sourceIdToDbUuid.set(post.sourceId, rows[0].id);
      upsertedCount++;
    }
  }

  // Pass 2: Upsert duplicate posts, resolving intra-batch sourceId to true UUID if needed
  for (const post of duplicatePosts) {
    const tagged = taggedMap.get(post.sourceId);

    // Resolve duplicate reference to a valid UUID
    let targetUuid: string | null = null;
    const isAlreadyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(post.isDuplicateOf || "");

    if (isAlreadyUuid) {
      targetUuid = post.isDuplicateOf;
    } else if (post.isDuplicateOf && sourceIdToDbUuid.has(post.isDuplicateOf)) {
      targetUuid = sourceIdToDbUuid.get(post.isDuplicateOf)!;
    }

    const rows = await client<Array<{ id: string }>>`
      INSERT INTO posts (
        source, source_id, url, canonical_url, title, company,
        location_raw, description, content_hash, posted_at,
        last_seen_at,
        role_tag, city_tag, is_fresher, tag_confidence, tagged_at, model_version,
        is_duplicate_of
      ) VALUES (
        ${post.source}, ${post.sourceId}, ${post.url}, ${post.canonicalUrl}, ${post.title}, ${post.company},
        ${post.locationRaw}, ${post.description}, ${post.contentHash},
        ${post.postedAt ? new Date(post.postedAt).toISOString() : null},
        NOW(),
        ${tagged ? tagged.role : null},
        ${tagged ? tagged.city : null},
        ${tagged ? tagged.isFresher : false},
        ${tagged ? tagged.confidence : null},
        ${tagged ? new Date().toISOString() : null},
        ${tagged ? tagged.modelVersion : null},
        ${targetUuid}
      )
      ON CONFLICT (source, source_id) DO UPDATE SET
        last_seen_at = NOW(),
        canonical_url = EXCLUDED.canonical_url,
        title = EXCLUDED.title,
        location_raw = EXCLUDED.location_raw,
        description = EXCLUDED.description,
        content_hash = EXCLUDED.content_hash,
        is_duplicate_of = COALESCE(EXCLUDED.is_duplicate_of, posts.is_duplicate_of)
      RETURNING id;
    `;

    if (rows.length > 0) {
      upsertedCount++;
    }
  }

  return upsertedCount;
}

/**
 * Main Pipeline Orchestrator Function
 */
export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineExecutionResult> {
  const startTime = Date.now();
  const runId = options.runId || `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const errors: string[] = [];

  const stageCounts: PipelineStageCounts = {
    fetched: 0,
    normalized: 0,
    dedupedExact: 0,
    dedupedFuzzy: 0,
    tagged: 0,
    upserted: 0,
    errors: 0,
  };

  console.log(`\n======================================================`);
  console.log(`  🚀 STARTING INGESTION PIPELINE (Run ID: ${runId})  `);
  console.log(`======================================================`);

  try {
    await initRunLog(runId);

    // -------------------------------------------------------------
    // STAGE 1: FETCH
    // -------------------------------------------------------------
    console.log("\n--- [STAGE 1/5] FETCHING POSTS ---");
    const { posts: rawPosts, sourceErrors } = await fetchAllSources();
    stageCounts.fetched = rawPosts.length;

    for (const [source, err] of Object.entries(sourceErrors)) {
      errors.push(`[Source: ${source}] ${err}`);
      stageCounts.errors++;
    }

    if (rawPosts.length === 0) {
      console.warn("⚠️ No posts fetched from any source. Terminating pipeline.");
      await finalizeRunLog(runId, "failed", stageCounts, errors.join("\n"));
      return {
        runId,
        status: "failed",
        stageCounts,
        durationMs: Date.now() - startTime,
        errorLog: errors.join("\n"),
      };
    }

    // -------------------------------------------------------------
    // STAGE 2: NORMALIZE
    // -------------------------------------------------------------
    console.log("\n--- [STAGE 2/5] NORMALIZING POSTS ---");
    const normalizedPosts = normalizePosts(rawPosts);
    stageCounts.normalized = normalizedPosts.length;
    console.log(`✓ Normalized ${normalizedPosts.length} posts (stripped UTMs, computed hashes, resolved city pre-pass).`);

    // -------------------------------------------------------------
    // STAGE 3: DEDUPE
    // -------------------------------------------------------------
    console.log("\n--- [STAGE 3/5] DEDUPLICATING POSTS ---");
    const { posts: dedupedPosts, counts: dedupeCounts } = await deduplicatePosts(normalizedPosts);
    stageCounts.dedupedExact = dedupeCounts.exactDuplicates;
    stageCounts.dedupedFuzzy = dedupeCounts.fuzzyDuplicates;
    console.log(`✓ Deduplication completed: ${dedupeCounts.unique} unique, ${dedupeCounts.exactDuplicates} exact duplicates, ${dedupeCounts.fuzzyDuplicates} fuzzy duplicates.`);

    // -------------------------------------------------------------
    // STAGE 4: TAG WITH LLM
    // -------------------------------------------------------------
    console.log("\n--- [STAGE 4/5] TAGGING UNIQUE POSTS WITH LLM ---");
    // Optimize: only send unique (non-duplicate) posts to LLM tagger
    const postsToTag = dedupedPosts.filter((p) => p.isDuplicateOf === null);
    const candidateSubset = options.maxPostsToTag
      ? postsToTag.slice(0, options.maxPostsToTag)
      : postsToTag;

    const { taggedPosts, cachedCount, newlyTaggedCount } = await tagPosts(candidateSubset, runId);
    stageCounts.tagged = taggedPosts.length;

    const taggedMap = new Map<string, TaggedPost>();
    for (const tp of taggedPosts) {
      taggedMap.set(tp.sourceId, tp);
    }

    console.log(`✓ Tagging completed: ${newlyTaggedCount} newly tagged, ${cachedCount} reused from contentHash cache.`);

    // -------------------------------------------------------------
    // STAGE 5: UPSERT TO DATABASE
    // -------------------------------------------------------------
    console.log("\n--- [STAGE 5/5] UPSERTING TO POSTGRESQL ---");
    const upserted = await upsertPostsToDatabase(dedupedPosts, taggedMap);
    stageCounts.upserted = upserted;
    console.log(`✓ Database upsert complete: ${upserted} posts inserted/updated with last_seen_at.`);

    // Determine final status
    const status: "success" | "partial" = errors.length > 0 ? "partial" : "success";
    const durationMs = Date.now() - startTime;

    await finalizeRunLog(runId, status, stageCounts, errors.length > 0 ? errors.join("\n") : null);

    console.log(`\n======================================================`);
    console.log(`  🎉 PIPELINE FINISHED IN ${(durationMs / 1000).toFixed(1)}s (Status: ${status.toUpperCase()})  `);
    console.log(`======================================================`);

    return {
      runId,
      status,
      stageCounts,
      durationMs,
      errorLog: errors.length > 0 ? errors.join("\n") : null,
    };
  } catch (err: unknown) {
    const fatalErr = (err as Error)?.message || "Unknown error";
    const stack = (err as Error)?.stack;
    console.error(`\n❌ FATAL PIPELINE FAILURE: ${fatalErr}\nStack: ${stack}`);
    errors.push(`[Fatal] ${fatalErr}`);
    stageCounts.errors++;

    await finalizeRunLog(runId, "failed", stageCounts, errors.join("\n"));

    return {
      runId,
      status: "failed",
      stageCounts,
      durationMs: Date.now() - startTime,
      errorLog: errors.join("\n"),
    };
  }
}
