// Standalone Test Script for Fetchers: scripts/test-fetchers.ts

import { fetchAllSources } from "../lib/sources";

async function main() {
  console.log("==================================================");
  console.log("   🧪 TESTING ALL JOB BOARD FETCHERS (CHUNK 2)    ");
  console.log("==================================================\n");

  const startTime = Date.now();
  const { posts, sourceCounts, sourceErrors } = await fetchAllSources();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n==================================================");
  console.log("               FETCHER SUMMARY REPORT             ");
  console.log("==================================================");
  console.log(`⏱️ Time elapsed: ${elapsed}s`);
  console.log(`📦 Total posts fetched: ${posts.length}\n`);

  console.log("📊 Breakdown by Source:");
  for (const [source, count] of Object.entries(sourceCounts)) {
    console.log(`   - ${source.padEnd(12)}: ${count} posts`);
  }

  if (Object.keys(sourceErrors).length > 0) {
    console.log("\n⚠️ Source Errors (Isolated, non-blocking):");
    for (const [source, err] of Object.entries(sourceErrors)) {
      console.log(`   - ${source}: ${err}`);
    }
  }

  if (posts.length > 0) {
    console.log("\n👀 First 5 Sample Collected Posts:");
    console.table(
      posts.slice(0, 5).map((p) => ({
        source: p.source,
        company: p.company,
        title: p.title.slice(0, 40),
        location: p.locationRaw.slice(0, 25),
        postedAt: p.postedAt ? p.postedAt.slice(0, 10) : "N/A",
      }))
    );
  }

  console.log("\n✅ Fetcher chunk test completed.");
}

main().catch((err) => {
  console.error("❌ Fatal error in test-fetchers:", err);
  process.exit(1);
});
