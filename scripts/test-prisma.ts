// Prisma ORM Test Suite (scripts/test-prisma.ts)
import dotenv from "dotenv";
dotenv.config();

import { getJobs } from "../lib/db/jobs";
import { prisma } from "../lib/db/prisma";

async function runPrismaTests() {
  console.log("=================================================");
  console.log("  🧪 RUNNING PRISMA ORM TEST SUITE               ");
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
    // 1. Default Feed via Prisma
    console.log("\n[Test 1] Default feed via Prisma getJobs()");
    const defaultResult = await getJobs({ page: 1, pageSize: 15 });
    assert(defaultResult.totalJobs >= 200, `Found 200+ jobs via Prisma (Total: ${defaultResult.totalJobs})`);
    assert(defaultResult.posts.length === 15, `Page 1 returned 15 posts`);
    assert(!defaultResult.error, "No error returned");
    assert(defaultResult.latestRun !== undefined, "Latest pipeline run info fetched");

    // 2. Full-Text Search via Prisma
    console.log("\n[Test 2] Full-text search (q='developer')");
    const searchResult = await getJobs({ q: "developer", page: 1, pageSize: 10 });
    assert(searchResult.totalJobs > 0, `Search returned results (Total: ${searchResult.totalJobs})`);
    assert(searchResult.posts.length > 0, `Search posts returned`);

    // 3. Role filter via Prisma
    console.log("\n[Test 3] Role filter (role='Software Engineering')");
    const roleResult = await getJobs({ role: "Software Engineering", page: 1, pageSize: 15 });
    assert(roleResult.totalJobs > 0, `Role filter found records (Total: ${roleResult.totalJobs})`);
    assert(roleResult.posts.every((p) => p.roleTag === "Software Engineering"), "All posts have matching roleTag");

    // 4. City filter via Prisma
    console.log("\n[Test 4] City filter (city='Bangalore')");
    const cityResult = await getJobs({ city: "Bangalore", page: 1, pageSize: 15 });
    assert(cityResult.totalJobs > 0, `City filter found records (Total: ${cityResult.totalJobs})`);
    assert(cityResult.posts.every((p) => p.cityTag === "Bangalore"), "All posts have matching cityTag");

    // 5. Combined filter via Prisma
    console.log("\n[Test 5] Combined query (q='engineer', role='Other', city='Bangalore')");
    const comboResult = await getJobs({ q: "engineer", role: "Other", city: "Bangalore", page: 1 });
    assert(comboResult.totalJobs > 0, `Combined search returned matches (Total: ${comboResult.totalJobs})`);

    // 6. Pagination check
    console.log("\n[Test 6] Pagination non-overlap");
    const p1 = await getJobs({ page: 1, pageSize: 10 });
    const p2 = await getJobs({ page: 2, pageSize: 10 });
    const p1Ids = new Set(p1.posts.map((p) => p.id));
    const overlap = p2.posts.some((p) => p1Ids.has(p.id));
    assert(!overlap, "Page 1 and Page 2 contain non-overlapping posts");

    // 7. Direct Prisma model queries
    console.log("\n[Test 7] Direct Prisma Model Queries");
    const postCount = await prisma.post.count({ where: { isDuplicateOf: null } });
    assert(postCount >= 200, `Direct prisma.post.count() returned >= 200 (Count: ${postCount})`);

    const latestRun = await prisma.run.findFirst({
      where: { status: { in: ["success", "partial"] } },
      orderBy: { startedAt: "desc" },
    });
    assert(latestRun !== null, `Direct prisma.run.findFirst() found run ID: ${latestRun?.id}`);

    console.log("\n=================================================");
    console.log(`  RESULTS: ${passed}/${total} TESTS PASSED`);
    console.log("=================================================");

    await prisma.$disconnect();
    if (passed !== total) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test failure:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runPrismaTests();
