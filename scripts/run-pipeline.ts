// Standalone Pipeline Runner: scripts/run-pipeline.ts
// Executes the end-to-end ingestion pipeline against the PostgreSQL database

import { runPipeline } from "../lib/pipeline";
import { client } from "../lib/db";

async function main() {
  console.log("======================================================");
  console.log("       🧪 RUNNING END-TO-END PIPELINE (CHUNK 6)       ");
  console.log("======================================================");

  // In testing/dev, allow limiting posts to tag via MAX_TAG env var if desired
  const maxPostsToTag = process.env.MAX_TAG ? parseInt(process.env.MAX_TAG, 10) : undefined;

  const result = await runPipeline({
    maxPostsToTag,
  });

  console.log("\n======================================================");
  console.log("               PIPELINE EXECUTION REPORT              ");
  console.log("======================================================");
  console.log(`📌 Run ID:      ${result.runId}`);
  console.log(`🟢 Status:      ${result.status.toUpperCase()}`);
  console.log(`⏱️ Duration:    ${(result.durationMs / 1000).toFixed(1)}s`);

  console.log("\n📊 Stage Counts:");
  console.table(result.stageCounts);

  if (result.errorLog) {
    console.log("\n⚠️ Logged Warnings / Non-Fatal Errors:");
    console.log(result.errorLog);
  }

  // Query database verification
  console.log("\n🔍 Database Verification Queries:");

  const totalInDb = await client<Array<{ count: string }>>`
    SELECT COUNT(*) AS count FROM posts;
  `;
  const uniqueInDb = await client<Array<{ count: string }>>`
    SELECT COUNT(*) AS count FROM posts WHERE is_duplicate_of IS NULL;
  `;
  const fresherInDb = await client<Array<{ count: string }>>`
    SELECT COUNT(*) AS count FROM posts WHERE is_duplicate_of IS NULL AND is_fresher = TRUE;
  `;
  const runRow = await client<Array<{ id: string; status: string; stage_counts: object }>>`
    SELECT id, status, stage_counts FROM runs WHERE id = ${result.runId};
  `;

  console.log(`   - Total posts in DB:              ${totalInDb[0]?.count}`);
  console.log(`   - Unique primary posts in DB:     ${uniqueInDb[0]?.count}`);
  console.log(`   - Active fresher posts in DB:     ${fresherInDb[0]?.count}`);
  console.log(`   - Verified 'runs' record status:  ${runRow[0]?.status}`);

  console.log("\n👀 Top 5 Live Fresher Jobs in DB:");
  const sampleJobs = await client<Array<{
    title: string;
    company: string;
    role_tag: string;
    city_tag: string;
    last_seen_at: Date;
  }>>`
    SELECT title, company, role_tag, city_tag, last_seen_at
    FROM posts
    WHERE is_duplicate_of IS NULL AND is_fresher = TRUE
    ORDER BY first_seen_at DESC
    LIMIT 5;
  `;

  console.table(
    sampleJobs.map((j) => ({
      company: j.company.slice(0, 15),
      title: j.title.slice(0, 35),
      role: j.role_tag,
      city: j.city_tag,
      lastSeen: j.last_seen_at ? new Date(j.last_seen_at).toISOString().slice(0, 10) : "N/A",
    }))
  );

  console.log("\n✅ Pipeline chunk test completed.");
  await client.end();
}

main().catch((err) => {
  console.error("❌ Fatal error in run-pipeline:", err);
  process.exit(1);
});
