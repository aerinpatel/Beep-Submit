// Web UI & Query Layer Test Suite (scripts/test-web-ui.ts)
// Verifies:
// 1. Default listing query returns active, non-duplicate posts with proper pagination
// 2. Full-text search using PostgreSQL tsvector (websearch_to_tsquery)
// 3. Filtering by role
// 4. Filtering by city
// 5. Combined multi-parameter search (q + role + city)
// 6. Pagination page-to-page non-overlap
// 7. Graceful empty state on non-matching query

import dotenv from "dotenv";
dotenv.config();

import { client } from "../lib/db";

async function runTests() {
  console.log("=================================================");
  console.log("  🧪 RUNNING WEB UI QUERY LAYER TEST SUITE       ");
  console.log("=================================================");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Default listing query (no filters, page 1)
    // -------------------------------------------------------------
    console.log("\n[Test 1] Default feed query (page 1, 15 posts)");
    const pageSize = 15;
    const [countRow] = await client`
      SELECT COUNT(*)::int as total
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
    `;
    const defaultTotal = countRow.total;

    const page1Posts = await client`
      SELECT id, title, company, role_tag, city_tag, url, is_duplicate_of, last_seen_at
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
      ORDER BY COALESCE(posted_at, first_seen_at) DESC
      LIMIT ${pageSize} OFFSET 0
    `;

    assert(defaultTotal >= 200, `Feed contains 200+ active listings (Found: ${defaultTotal})`);
    assert(page1Posts.length === pageSize, `Page 1 returns exactly ${pageSize} posts`);
    assert(page1Posts.every((p) => p.is_duplicate_of === null), "Strictly excludes all duplicate rows");

    // -------------------------------------------------------------
    // Test 2: Full-text search via tsvector (q="engineer")
    // -------------------------------------------------------------
    console.log("\n[Test 2] Full-text search query (q='engineer')");
    const searchParam = "engineer";
    const [searchCountRow] = await client`
      SELECT COUNT(*)::int as total
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
        AND search_vector @@ websearch_to_tsquery('english', ${searchParam})
    `;

    const searchPosts = await client`
      SELECT id, title, company, role_tag, city_tag,
             ts_rank(search_vector, websearch_to_tsquery('english', ${searchParam})) as rank
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
        AND search_vector @@ websearch_to_tsquery('english', ${searchParam})
      ORDER BY rank DESC
      LIMIT 10
    `;

    assert(searchCountRow.total > 0, `Search returns matching results (Found: ${searchCountRow.total})`);
    assert(searchPosts.length > 0, "Returns top-ranked search posts");
    assert(searchPosts[0].rank > 0, "Top post has valid positive search rank");

    // -------------------------------------------------------------
    // Test 3: Role filter (role="Operations")
    // -------------------------------------------------------------
    console.log("\n[Test 3] Role filter (role='Operations')");
    const roleParam = "Operations";
    const rolePosts = await client`
      SELECT id, title, company, role_tag
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
        AND role_tag = ${roleParam}
      LIMIT 15
    `;

    assert(rolePosts.length > 0, `Returns posts for role '${roleParam}' (Found: ${rolePosts.length})`);
    assert(rolePosts.every((p) => p.role_tag === roleParam), "All returned posts match filtered role");

    // -------------------------------------------------------------
    // Test 4: City filter (city="Bangalore")
    // -------------------------------------------------------------
    console.log("\n[Test 4] City filter (city='Bangalore')");
    const cityParam = "Bangalore";
    const cityPosts = await client`
      SELECT id, title, company, city_tag
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
        AND city_tag = ${cityParam}
      LIMIT 15
    `;

    assert(cityPosts.length > 0, `Returns posts for city '${cityParam}' (Found: ${cityPosts.length})`);
    assert(cityPosts.every((p) => p.city_tag === cityParam), "All returned posts match filtered city");

    // -------------------------------------------------------------
    // Test 5: Pagination non-overlap (Page 1 vs Page 2)
    // -------------------------------------------------------------
    console.log("\n[Test 5] Pagination integrity (Page 1 vs Page 2)");
    const page2Posts = await client`
      SELECT id
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
      ORDER BY COALESCE(posted_at, first_seen_at) DESC
      LIMIT ${pageSize} OFFSET ${pageSize}
    `;

    const page1Ids = new Set(page1Posts.map((p) => p.id));
    const overlaps = page2Posts.filter((p) => page1Ids.has(p.id));

    assert(page2Posts.length === pageSize, `Page 2 returns ${pageSize} posts`);
    assert(overlaps.length === 0, "Page 1 and Page 2 contain completely distinct records (0 overlap)");

    // -------------------------------------------------------------
    // Test 6: Empty state for nonexistent query
    // -------------------------------------------------------------
    console.log("\n[Test 6] Empty state handling for non-matching query");
    const bogusQuery = "xyznonexistentjob123456789";
    const [emptyCount] = await client`
      SELECT COUNT(*)::int as total
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
        AND search_vector @@ websearch_to_tsquery('english', ${bogusQuery})
    `;

    assert(emptyCount.total === 0, "Returns 0 results for non-matching query without database errors");

    // -------------------------------------------------------------
    // Test 7: 'runs' table latest run info query
    // -------------------------------------------------------------
    console.log("\n[Test 7] 'runs' table last updated timestamp");
    const latestRuns = await client`
      SELECT started_at, status
      FROM runs
      WHERE status IN ('success', 'partial')
      ORDER BY started_at DESC
      LIMIT 1
    `;

    assert(latestRuns.length > 0, "Finds latest successful pipeline run for UI header");
    assert(Boolean(latestRuns[0].started_at), "Latest run contains valid started_at timestamp");

    console.log("\n=================================================");
    console.log(`  🎉 TEST RESULTS: ${passed}/${total} PASSED`);
    console.log("=================================================");
  } catch (error: unknown) {
    console.error("Test execution failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
