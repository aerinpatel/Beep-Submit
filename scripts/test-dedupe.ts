// Standalone Test Script for Deduplicator: scripts/test-dedupe.ts
// Verifies exact matching (canonicalUrl & contentHash) and fuzzy matching (pg_trgm similarity > 0.85)

import { deduplicatePosts, calculateTrigramSimilarity } from "../lib/dedupe";
import { normalizePost } from "../lib/normalizer";
import { client } from "../lib/db";
import type { RawPost, NormalizedPost } from "../lib/types";

async function main() {
  console.log("==================================================");
  console.log("     🧪 TESTING LAYERED DEDUPLICATOR (CHUNK 4)    ");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`   ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`   ❌ FAIL: ${name} ${extra || ""}`);
      failed++;
    }
  }

  // 1. In-memory trigram algorithm unit test
  console.log("1️⃣ Testing In-Memory Trigram Similarity Helper:");
  const sim1 = calculateTrigramSimilarity(
    "Software Engineer Intern",
    "Software Engineer Intern"
  );
  assert("Identical strings have similarity 1.0", Math.abs(sim1 - 1.0) < 0.001);

  const sim2 = calculateTrigramSimilarity(
    "Software Engineer Intern",
    "Software Engineering Intern"
  );
  assert(
    "Near identical strings ('Engineer' vs 'Engineering') have similarity > 0.85",
    sim2 >= 0.85,
    `Got: ${sim2.toFixed(3)}`
  );

  const sim3 = calculateTrigramSimilarity(
    "Software Engineer Intern",
    "Product Designer Intern"
  );
  assert(
    "Completely different job titles have similarity < 0.50",
    sim3 < 0.5,
    `Got: ${sim3.toFixed(3)}`
  );

  // 2. Query an existing seeded post from the DB
  const [existingPost] = await client<Array<{ id: string; canonical_url: string; company: string; title: string; content_hash: string }>>`
    SELECT id, canonical_url, company, title, content_hash
    FROM posts
    WHERE is_duplicate_of IS NULL
    LIMIT 1;
  `;

  if (!existingPost) {
    console.error("❌ No posts found in database. Run 'pnpm db:seed' first.");
    process.exit(1);
  }

  console.log(`\n📌 Found reference post in DB: [${existingPost.company}] "${existingPost.title}" (${existingPost.id})`);

  // 3. Construct test incoming posts
  console.log("\n2️⃣ Testing Database & Intra-Batch Deduplication Layers:");

  // Test Post A: Completely unique post
  const rawUnique: RawPost = {
    source: "greenhouse",
    sourceId: "gh-test-unique-1",
    url: "https://boards.greenhouse.io/cloudflare/jobs/unique1",
    title: "Edge Network Engineer Intern",
    company: "Cloudflare",
    locationRaw: "Bangalore",
    description: "Build high performance edge infrastructure.",
  };

  // Test Post B: Exact duplicate via canonicalUrl
  const rawExactUrl: RawPost = {
    source: "lever",
    sourceId: "lev-test-dup-url",
    url: existingPost.canonical_url, // Exact match on canonicalUrl
    title: "Completely Rewritten Title But Same URL",
    company: existingPost.company,
    locationRaw: "Bangalore",
    description: "Same canonical URL from another aggregator.",
  };

  // Test Post C: Exact duplicate via contentHash (different URL, but same company + title + city)
  const rawExactHash: RawPost = {
    source: "ashby",
    sourceId: "ash-test-dup-hash",
    url: "https://jobs.ashbyhq.com/different-url/999",
    title: existingPost.title, // Exact title
    company: existingPost.company, // Exact company
    locationRaw: "Bangalore",
    description: "Different source and URL, but exact content hash.",
  };

  // Test Post D: Fuzzy duplicate (> 0.85 similarity on title within same company)
  // Razorpay has: "Software Engineer Intern - Backend (Go/Python)"
  // Fuzzy variation: "Software Engineering Intern - Backend (Go/Python)"
  const rawFuzzyDb: RawPost = {
    source: "lever",
    sourceId: "lev-test-fuzzy",
    url: "https://jobs.lever.co/razorpay/fuzzy-1",
    title: "Software Engineering Intern - Backend (Go/Python)",
    company: existingPost.company,
    locationRaw: "Bangalore",
    description: "Backend Go/Python payments engineering.",
  };

  // Test Post E: Distinct role at the same company (should NOT be flagged as fuzzy duplicate)
  const rawDistinctSameCompany: RawPost = {
    source: "greenhouse",
    sourceId: "gh-test-distinct",
    url: "https://boards.greenhouse.io/razorpay/distinct-url",
    title: "Director of Product Management",
    company: existingPost.company,
    locationRaw: "Bangalore",
    description: "Executive product leadership role.",
  };

  // Test Post F: Intra-batch exact duplicate of Post A
  const rawIntraBatchExact: RawPost = {
    source: "lever",
    sourceId: "lev-test-intra-exact",
    url: "https://boards.greenhouse.io/cloudflare/jobs/unique1", // Same URL as Post A
    title: "Edge Network Engineer Intern",
    company: "Cloudflare",
    locationRaw: "Bangalore",
    description: "Duplicate within the same incoming batch.",
  };

  const incomingBatch: NormalizedPost[] = [
    normalizePost(rawUnique),
    normalizePost(rawExactUrl),
    normalizePost(rawExactHash),
    normalizePost(rawFuzzyDb),
    normalizePost(rawDistinctSameCompany),
    normalizePost(rawIntraBatchExact),
  ];

  const { posts: processed, counts } = await deduplicatePosts(incomingBatch);

  console.log("\n📊 Deduplication Execution Counts:");
  console.log(`   - Total input posts:   ${counts.total}`);
  console.log(`   - Unique posts:        ${counts.unique}`);
  console.log(`   - Exact duplicates:    ${counts.exactDuplicates}`);
  console.log(`   - Fuzzy duplicates:    ${counts.fuzzyDuplicates}`);

  // Assertions
  assert("Total count matches input length", counts.total === 6);
  assert("Unique count is 2 (Unique Cloudflare post + Distinct CRED post)", counts.unique === 2);
  assert("Exact duplicates count is 3 (1 via URL, 1 via hash, 1 intra-batch)", counts.exactDuplicates === 3);
  assert("Fuzzy duplicates count is 1 (CRED fuzzy title)", counts.fuzzyDuplicates === 1);

  // Check specific flags
  assert("Post A (Unique) has isDuplicateOf === null", processed[0].isDuplicateOf === null);
  assert("Post B (Exact URL) points to existing post ID", processed[1].isDuplicateOf === existingPost.id);
  assert("Post C (Exact Hash) points to existing post ID", processed[2].isDuplicateOf === existingPost.id);
  assert("Post D (Fuzzy CRED) is flagged with duplicate ID", processed[3].isDuplicateOf !== null);
  assert("Post E (Distinct CRED role) has isDuplicateOf === null", processed[4].isDuplicateOf === null);
  assert("Post F (Intra-batch duplicate) is flagged with primary post ID", processed[5].isDuplicateOf === "gh-test-unique-1");

  console.log("\n==================================================");
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  console.log("==================================================");

  await client.end();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fatal error in test-dedupe:", err);
  process.exit(1);
});
