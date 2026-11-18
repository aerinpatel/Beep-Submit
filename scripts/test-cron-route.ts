// Test script for Cron Ingest API Route (scripts/test-cron-route.ts)
// Verifies:
// 1. Rejection of unauthenticated requests (HTTP 401)
// 2. Rejection of invalid Bearer token (HTTP 401)
// 3. Rejection of invalid custom header x-cron-secret (HTTP 401)
// 4. Rejection of invalid query param ?secret=... (HTTP 401)
// 5. Successful authorized execution with valid Bearer token (HTTP 200)

import dotenv from "dotenv";
dotenv.config();

import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/cron/ingest/route";
import { client } from "../lib/db";

async function runTests() {
  console.log("=================================================");
  console.log("  🧪 RUNNING CRON INGEST ROUTE TEST SUITE        ");
  console.log("=================================================");

  const secret = process.env.CRON_SECRET || "beep-secret-key-2026";
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
    // Test 1: GET request with no authorization header -> Expect 401
    // -------------------------------------------------------------
    console.log("\n[Test 1] Unauthenticated GET request (no secret)");
    const req1 = new NextRequest("http://localhost:3000/api/cron/ingest");
    const res1 = await GET(req1);
    const body1 = await res1.json();

    assert(res1.status === 401, "Returns HTTP 401 for missing token");
    assert(body1.success === false, "Body contains success: false");
    assert(
      typeof body1.error === "string" && body1.error.includes("Unauthorized"),
      "Body contains descriptive error message"
    );

    // -------------------------------------------------------------
    // Test 2: GET request with invalid Bearer token -> Expect 401
    // -------------------------------------------------------------
    console.log("\n[Test 2] Invalid Bearer token");
    const req2 = new NextRequest("http://localhost:3000/api/cron/ingest", {
      headers: {
        authorization: "Bearer wrong-invalid-secret-token",
      },
    });
    const res2 = await GET(req2);
    const body2 = await res2.json();

    assert(res2.status === 401, "Returns HTTP 401 for wrong Bearer token");
    assert(body2.success === false, "Body contains success: false");

    // -------------------------------------------------------------
    // Test 3: POST request with invalid x-cron-secret header -> Expect 401
    // -------------------------------------------------------------
    console.log("\n[Test 3] POST request with invalid custom header");
    const req3 = new NextRequest("http://localhost:3000/api/cron/ingest", {
      method: "POST",
      headers: {
        "x-cron-secret": "bogus_secret",
      },
      body: JSON.stringify({ maxPostsToTag: 5 }),
    });
    const res3 = await POST(req3);
    const body3 = await res3.json();

    assert(res3.status === 401, "Returns HTTP 401 for wrong custom header");
    assert(body3.success === false, "Body contains success: false");

    // -------------------------------------------------------------
    // Test 4: GET request with invalid ?secret= query param -> Expect 401
    // -------------------------------------------------------------
    console.log("\n[Test 4] GET request with invalid query parameter secret");
    const req4 = new NextRequest("http://localhost:3000/api/cron/ingest?secret=not_the_secret");
    const res4 = await GET(req4);
    const body4 = await res4.json();

    assert(res4.status === 401, "Returns HTTP 401 for wrong query parameter");
    assert(body4.success === false, "Body contains success: false");

    // -------------------------------------------------------------
    // Test 5: Authorized GET request with Bearer token -> Expect 200 & Pipeline Execution
    // -------------------------------------------------------------
    console.log("\n[Test 5] Authorized GET request with valid Bearer token");
    const req5 = new NextRequest("http://localhost:3000/api/cron/ingest?maxPostsToTag=5", {
      headers: {
        authorization: `Bearer ${secret}`,
      },
    });
    const res5 = await GET(req5);
    const body5 = await res5.json();

    assert(res5.status === 200, "Returns HTTP 200 OK for valid Bearer token");
    assert(body5.success === true, "Body contains success: true");
    assert(typeof body5.runId === "string" && body5.runId.startsWith("run-"), "Returns valid runId format");
    assert(body5.stageCounts && typeof body5.stageCounts.fetched === "number", "Returns stageCounts object");
    assert(typeof body5.durationMs === "number" && body5.durationMs > 0, "Returns execution durationMs");
    assert(body5.status === "success" || body5.status === "partial", "Returns valid pipeline status");
    assert(typeof body5.timestamp === "string", "Returns ISO timestamp");

    console.log("\n=================================================");
    console.log(`  🎉 TEST RESULTS: ${passed}/${total} PASSED`);
    console.log("=================================================");
  } catch (error: unknown) {
    console.error("Test execution failed with error:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runTests();
