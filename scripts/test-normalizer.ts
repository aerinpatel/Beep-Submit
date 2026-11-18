// Standalone Test Script for Normalizer: scripts/test-normalizer.ts
// Tests URL canonicalization, HTML stripping, city pre-pass alias matching, and contentHash generation

import {
  normalizeUrl,
  cleanDescription,
  resolveCityPre,
  computeContentHash,
  normalizePost,
} from "../lib/normalizer";
import type { RawPost } from "../lib/types";

function runTests() {
  console.log("==================================================");
  console.log("     🧪 TESTING JOB POST NORMALIZER (CHUNK 3)     ");
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

  // 1. Test URL Canonicalization
  console.log("1️⃣ Testing URL Canonicalization:");
  const testUrl1 =
    "https://boards.greenhouse.io/razorpay/jobs/12345?utm_source=linkedin&utm_medium=job_post&ref=social#apply";
  const normUrl1 = normalizeUrl(testUrl1);
  assert(
    "Strips UTM parameters, ref params, and fragments",
    normUrl1 === "https://boards.greenhouse.io/razorpay/jobs/12345",
    `Got: ${normUrl1}`
  );

  const testUrl2 = "https://jobs.lever.co/paytm/abc-123/?lever-origin=applied";
  const normUrl2 = normalizeUrl(testUrl2);
  assert(
    "Removes trailing slashes and lever tracking params",
    normUrl2 === "https://jobs.lever.co/paytm/abc-123",
    `Got: ${normUrl2}`
  );

  // 2. Test HTML Cleaning
  console.log("\n2️⃣ Testing HTML Sanitization & Entity Decoding:");
  const rawHtml =
    "<p>Join <strong>Razorpay</strong> as an intern.&nbsp;We offer 100% remote flexibility.</p><br/><ul><li>Python</li><li>Go</li></ul>";
  const cleanText = cleanDescription(rawHtml);
  assert(
    "Converts HTML to clean plain text without tags or &nbsp;",
    !cleanText.includes("<") && !cleanText.includes("&nbsp;") && cleanText.includes("Python"),
    `Got: "${cleanText}"`
  );

  // 3. Test City Pre-pass Aliases
  console.log("\n3️⃣ Testing Deterministic City Pre-Pass:");
  const cityTests: Array<{ input: string; expected: string | null }> = [
    { input: "Bengaluru, Karnataka, India", expected: "Bangalore" },
    { input: "Bangalore Urban", expected: "Bangalore" },
    { input: "Gurgaon, Haryana", expected: "Delhi NCR" },
    { input: "Gurugram, India", expected: "Delhi NCR" },
    { input: "Noida / Greater Noida", expected: "Delhi NCR" },
    { input: "New Delhi", expected: "Delhi NCR" },
    { input: "Pune, Maharashtra", expected: "Pune" },
    { input: "Navi Mumbai, Maharashtra", expected: "Mumbai" },
    { input: "Hyderabad, Telangana", expected: "Hyderabad" },
    { input: "Chennai, Tamil Nadu", expected: "Chennai" },
    { input: "India - Remote", expected: "Remote" },
    { input: "Work From Home", expected: "Remote" },
    { input: "India", expected: null }, // Ambiguous, leaves for LLM tagger
    { input: "Multiple Locations across APAC", expected: null }, // Ambiguous
  ];

  for (const { input, expected } of cityTests) {
    const result = resolveCityPre(input);
    assert(
      `"${input}" -> ${expected ?? "null (Ambiguous)"}`,
      result === expected,
      `Got: ${result}`
    );
  }

  // 4. Test Content Hash Stability
  console.log("\n4️⃣ Testing Content Hash Stability:");
  const hash1 = computeContentHash("CRED", "Software Engineer Intern", "Bangalore");
  const hash2 = computeContentHash("cred", "Software Engineer Intern", "Bangalore");
  const hash3 = computeContentHash("CRED Inc.", "Software Engineer Intern", "Bangalore");
  const hashDifferent = computeContentHash("CRED", "Product Design Intern", "Bangalore");

  assert("Case insensitive hash equivalence", hash1 === hash2, `Hash1: ${hash1}, Hash2: ${hash2}`);
  assert("Punctuation invariant hash equivalence", hash1 === hash3, `Hash1: ${hash1}, Hash3: ${hash3}`);
  assert("Different job titles produce distinct hashes", hash1 !== hashDifferent);

  // 5. Test Full RawPost -> NormalizedPost Transformation
  console.log("\n5️⃣ Testing Full RawPost -> NormalizedPost Pipeline:");
  const sampleRaw: RawPost = {
    source: "greenhouse",
    sourceId: "gh-888",
    url: "https://boards.greenhouse.io/inmobi/jobs/888?utm_source=jobboard#section",
    title: "Software Engineer Intern - Backend",
    company: "InMobi",
    locationRaw: "Bengaluru, Karnataka, India",
    description: "<p>Exciting fresher role in <strong>Bengaluru</strong>.</p>",
    postedAt: "2026-11-18T10:00:00Z",
  };

  const normalized = normalizePost(sampleRaw);
  assert("Canonical URL stripped", normalized.canonicalUrl === "https://boards.greenhouse.io/inmobi/jobs/888");
  assert("City pre-pass resolved to Bangalore", normalized.cityPre === "Bangalore");
  assert("Content hash is valid 64-char hex", normalized.contentHash.length === 64);
  assert("Description HTML tags stripped", !normalized.description.includes("<p>"));

  console.log("\n==================================================");
  console.log(`Summary: ${passed} passed, ${failed} failed.`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
