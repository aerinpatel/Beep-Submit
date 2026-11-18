// Standalone Test Script for LLM Tagger: scripts/test-tagger.ts
// Tests batch LLM tagging, Zod validation, token tracking into llm_usage, and contentHash caching

import { tagPosts } from "../lib/tagger";
import { normalizePost } from "../lib/normalizer";
import { client } from "../lib/db";
import { ROLES, CITIES } from "../lib/config";
import type { RawPost, NormalizedPost } from "../lib/types";

async function main() {
  console.log("==================================================");
  console.log("       🧪 TESTING BATCHED LLM TAGGER (CHUNK 5)    ");
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

  // 1. Construct test input posts across roles
  const rawPosts: RawPost[] = [
    {
      source: "greenhouse",
      sourceId: "tag-test-1",
      url: "https://boards.greenhouse.io/postman/jobs/101",
      title: "Backend Software Engineer Intern (Go/Node.js)",
      company: "Postman",
      locationRaw: "Bangalore, Karnataka",
      description: "Looking for 2025/2026 graduates with strong CS fundamentals, algorithms, and Go or TypeScript experience. Zero to one year of experience required.",
    },
    {
      source: "ashby",
      sourceId: "tag-test-2",
      url: "https://jobs.ashbyhq.com/cred/jobs/202",
      title: "Associate Product Designer",
      company: "CRED",
      locationRaw: "Mumbai, India",
      description: "Join our design studio. Strong portfolio showcasing mobile interaction design, Figma prototypes, and user empathy.",
    },
    {
      source: "lever",
      sourceId: "tag-test-3",
      url: "https://jobs.lever.co/paytm/jobs/303",
      title: "Growth Marketing Trainee - Acquisition",
      company: "Paytm",
      locationRaw: "Gurugram / Noida",
      description: "Early career opportunity in performance marketing, growth hacking, and ad campaign optimization.",
    },
    {
      source: "greenhouse",
      sourceId: "tag-test-4",
      url: "https://boards.greenhouse.io/datadog/jobs/404",
      title: "Staff Cloud Infrastructure Architect",
      company: "Datadog",
      locationRaw: "Bengaluru, India",
      description: "Requires minimum 10+ years of large-scale distributed systems experience. Lead architectural direction for multi-region Kubernetes.",
    },
  ];

  const normalizedBatch: NormalizedPost[] = rawPosts.map(normalizePost);

  console.log(`📋 Prepared test batch with ${normalizedBatch.length} jobs.`);

  // 2. Run first tagging call (Cold start: expects LLM call)
  console.log("\n1️⃣ Running Initial Cold LLM Tagging Call:");
  const testRunId = `test-run-${Date.now()}`;
  const result1 = await tagPosts(normalizedBatch, testRunId);

  assert("Returns 4 tagged posts", result1.taggedPosts.length === 4);
  assert("Tokens consumed (> 0)", result1.totalUsage.inputTokens > 0 && result1.totalUsage.outputTokens > 0, `Tokens: in=${result1.totalUsage.inputTokens}, out=${result1.totalUsage.outputTokens}`);
  assert("Newly tagged count is 4", result1.newlyTaggedCount === 4);

  // Validate tags
  const [sdePost, designPost, mktPost, seniorPost] = result1.taggedPosts;

  console.log("\n📊 Tagged Results:");
  console.table(
    result1.taggedPosts.map((p) => ({
      title: p.title.slice(0, 35),
      role: p.role,
      city: p.city,
      isFresher: p.isFresher,
      confidence: p.confidence,
    }))
  );

  assert("SDE tagged as 'Software Engineering'", sdePost.role === "Software Engineering");
  assert("SDE tagged in Bangalore", sdePost.city === "Bangalore");
  assert("SDE marked as fresher", sdePost.isFresher === true);

  assert("Designer tagged as 'Design'", designPost.role === "Design");
  assert("Designer tagged in Mumbai", designPost.city === "Mumbai");
  assert("Designer marked as fresher", designPost.isFresher === true);

  assert("Marketing tagged as 'Marketing'", mktPost.role === "Marketing");
  assert("Marketing tagged in Delhi NCR", mktPost.city === "Delhi NCR");

  assert("Staff Architect tagged as NOT fresher (isFresher: false)", seniorPost.isFresher === false);

  // Verify all roles and cities belong to strictly allowed enums
  for (const p of result1.taggedPosts) {
    assert(`Post ${p.sourceId} role is strictly in ROLES`, ROLES.includes(p.role));
    assert(`Post ${p.sourceId} city is strictly in CITIES`, CITIES.includes(p.city));
  }

  // 3. Verify PostgreSQL llm_usage table logging
  console.log("\n2️⃣ Verifying Token Logging in PostgreSQL llm_usage:");
  const usageRows = await client<Array<{ id: string; run_id: string; input_tokens: number; output_tokens: number }>>`
    SELECT id, run_id, input_tokens, output_tokens
    FROM llm_usage
    WHERE run_id = ${testRunId}
    LIMIT 1;
  `;

  assert("llm_usage row recorded in database", usageRows.length > 0);
  if (usageRows.length > 0) {
    assert("Recorded input tokens match", usageRows[0].input_tokens === result1.totalUsage.inputTokens);
    assert("Recorded output tokens match", usageRows[0].output_tokens === result1.totalUsage.outputTokens);
  }

  // 4. Test ContentHash Cache (Simulate second pipeline run)
  console.log("\n3️⃣ Testing contentHash Caching Layer:");

  // First stage: insert these newly tagged posts into posts table so cache can find them
  for (const p of result1.taggedPosts) {
    await client`
      INSERT INTO posts (
        source, source_id, url, canonical_url, title, company,
        location_raw, description, content_hash,
        role_tag, city_tag, is_fresher, tag_confidence, tagged_at, model_version
      ) VALUES (
        ${p.source}, ${p.sourceId}, ${p.url}, ${p.canonicalUrl}, ${p.title}, ${p.company},
        ${p.locationRaw}, ${p.description}, ${p.contentHash},
        ${p.role}, ${p.city}, ${p.isFresher}, ${p.confidence}, NOW(), ${p.modelVersion}
      )
      ON CONFLICT (source, source_id) DO UPDATE SET
        role_tag = EXCLUDED.role_tag,
        city_tag = EXCLUDED.city_tag,
        is_fresher = EXCLUDED.is_fresher,
        tag_confidence = EXCLUDED.tag_confidence,
        tagged_at = EXCLUDED.tagged_at;
    `;
  }

  // Call tagPosts again on the exact same batch with a new runId
  const result2 = await tagPosts(normalizedBatch, `cache-run-${Date.now()}`);

  assert("Cached run consumes 0 tokens", result2.totalUsage.inputTokens === 0 && result2.totalUsage.outputTokens === 0);
  assert("Cached count is 4", result2.cachedCount === 4);
  assert("Newly tagged count is 0", result2.newlyTaggedCount === 0);
  assert("Cached roles match previous run", result2.taggedPosts[0].role === sdePost.role);

  // Clean up test rows
  console.log("\n🧹 Cleaning up test posts from database...");
  await client`DELETE FROM posts WHERE source_id LIKE 'tag-test-%';`;
  await client`DELETE FROM llm_usage WHERE run_id = ${testRunId};`;

  console.log("\n==================================================");
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  console.log("==================================================");

  await client.end();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fatal error in test-tagger:", err);
  process.exit(1);
});
