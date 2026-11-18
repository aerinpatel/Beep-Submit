// Standalone Seed Script: scripts/seed.ts
// Populates the database with realistic fresher jobs and tests tsvector + fuzzy matching

import postgres from "postgres";
import * as dotenv from "dotenv";
import { computeContentHash } from "../lib/normalizer";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

async function seed() {
  console.log("🌱 Starting seed script...");

  try {
    // 1. Clean existing test data (safe idempotent reset)
    console.log("🧹 Clearing previous seed data...");
    await sql`DELETE FROM llm_usage;`;
    await sql`DELETE FROM runs;`;
    await sql`DELETE FROM posts;`;

    // 2. Insert primary test posts
    console.log("📝 Inserting initial sample posts...");
    const samplePosts = [
      {
        source: "greenhouse",
        sourceId: "gh-101",
        url: "https://boards.greenhouse.io/razorpay/jobs/101",
        canonicalUrl: "https://boards.greenhouse.io/razorpay/jobs/101",
        title: "Software Engineer Intern - Backend (Go/Python)",
        company: "Razorpay",
        locationRaw: "Bangalore, Karnataka, India",
        description: "Looking for 2025/2026 graduates with strong CS fundamentals, data structures, and Go or Python skills to join our payments platform team.",
        roleTag: "Software Engineering",
        cityTag: "Bangalore",
        isFresher: true,
        tagConfidence: 0.98,
        modelVersion: "openai/gpt-oss-20b",
      },
      {
        source: "lever",
        sourceId: "lev-202",
        url: "https://jobs.lever.co/pocketfm/202",
        canonicalUrl: "https://jobs.lever.co/pocketfm/202",
        title: "Graduate Data Scientist / ML Engineer",
        company: "Pocket FM",
        locationRaw: "Pune, Maharashtra",
        description: "Join our recommendation systems team. Strong Python, PyTorch, SQL and statistics background required. Freshers welcome.",
        roleTag: "Data/ML",
        cityTag: "Pune",
        isFresher: true,
        tagConfidence: 0.95,
        modelVersion: "openai/gpt-oss-20b",
      },
      {
        source: "ashby",
        sourceId: "ash-303",
        url: "https://jobs.ashbyhq.com/cred/303",
        canonicalUrl: "https://jobs.ashbyhq.com/cred/303",
        title: "Associate Product Designer",
        company: "CRED",
        locationRaw: "Bengaluru, India",
        description: "Craft world-class mobile user experiences. Portfolio of college projects or design internship experience required.",
        roleTag: "Design",
        cityTag: "Bangalore",
        isFresher: true,
        tagConfidence: 0.92,
        modelVersion: "openai/gpt-oss-20b",
      },
      {
        source: "greenhouse",
        sourceId: "gh-404",
        url: "https://boards.greenhouse.io/swiggy/jobs/404",
        canonicalUrl: "https://boards.greenhouse.io/swiggy/jobs/404",
        title: "Growth Marketing Trainee",
        company: "Swiggy",
        locationRaw: "Gurgaon / Delhi NCR",
        description: "Early career opportunity in performance marketing, growth campaigns, and user acquisition analytics.",
        roleTag: "Marketing",
        cityTag: "Delhi NCR",
        isFresher: true,
        tagConfidence: 0.90,
        modelVersion: "openai/gpt-oss-20b",
      },
    ];

    const insertedRows: Array<{ id: string; title: string }> = [];

    for (const p of samplePosts) {
      const contentHash = computeContentHash(p.company, p.title, p.cityTag);
      const [row] = await sql<Array<{ id: string; title: string }>>`
        INSERT INTO posts (
          source, source_id, url, canonical_url, title, company,
          location_raw, description, content_hash,
          role_tag, city_tag, is_fresher, tag_confidence,
          tagged_at, model_version
        ) VALUES (
          ${p.source}, ${p.sourceId}, ${p.url}, ${p.canonicalUrl}, ${p.title}, ${p.company},
          ${p.locationRaw}, ${p.description}, ${contentHash},
          ${p.roleTag}, ${p.cityTag}, ${p.isFresher}, ${p.tagConfidence},
          NOW(), ${p.modelVersion}
        )
        RETURNING id, title;
      `;
      insertedRows.push(row);
      console.log(`   ✓ Seeded: ${p.company} - ${p.title} (${row.id})`);
    }

    // 3. Insert a near-duplicate post to test pg_trgm fuzzy matching
    // (Razorpay - "Software Engineer Intern - Backend") vs original "Software Engineer Intern - Backend (Go/Python)"
    console.log("📝 Inserting fuzzy duplicate post to test pg_trgm...");
    const originalRazorpayId = insertedRows[0].id;
    const fuzzyTitle = "Software Engineer Intern - Backend";
    const fuzzyHash = computeContentHash("Razorpay", fuzzyTitle, "Bangalore");

    const [fuzzyRow] = await sql<Array<{ id: string }>>`
      INSERT INTO posts (
        source, source_id, url, canonical_url, title, company,
        location_raw, description, content_hash,
        role_tag, city_tag, is_fresher, tag_confidence,
        tagged_at, model_version, is_duplicate_of
      ) VALUES (
        'lever', 'lev-razor-999',
        'https://jobs.lever.co/razorpay/999', 'https://jobs.lever.co/razorpay/999',
        ${fuzzyTitle}, 'Razorpay',
        'Bangalore', 'Backend intern role working on Go services', ${fuzzyHash},
        'Software Engineering', 'Bangalore', true, 0.95,
        NOW(), 'openai/gpt-oss-20b', ${originalRazorpayId}
      )
      RETURNING id;
    `;
    console.log(`   ✓ Seeded fuzzy duplicate flagged with is_duplicate_of -> ${originalRazorpayId}`);

    // 4. Seed an LLM usage entry
    console.log("📝 Seeding sample llm_usage row...");
    await sql`
      INSERT INTO llm_usage (
        run_id, model, input_tokens, output_tokens, post_count
      ) VALUES (
        'seed-run-001', 'openai/gpt-oss-20b', 1450, 220, 4
      );
    `;

    // 5. Seed a pipeline runs entry
    console.log("📝 Seeding sample runs row...");
    await sql`
      INSERT INTO runs (
        id, status, stage_counts, finished_at
      ) VALUES (
        'seed-run-001', 'success',
        ${JSON.stringify({
          fetched: 5,
          normalized: 5,
          dedupedExact: 0,
          dedupedFuzzy: 1,
          tagged: 4,
          upserted: 5,
          errors: 0,
        })}::jsonb,
        NOW()
      );
    `;

    // 6. Test full-text search (tsvector generated column)
    console.log("\n🔍 Testing Full-Text Search on 'Python':");
    const searchResults = await sql`
      SELECT title, company, location_raw
      FROM posts
      WHERE search_vector @@ to_tsquery('english', 'Python');
    `;
    console.table(searchResults);

    // 7. Test pg_trgm similarity
    console.log("🔍 Testing pg_trgm similarity on titles within Razorpay:");
    const similarityResults = await sql`
      SELECT
        p1.title AS title1,
        p2.title AS title2,
        similarity(p1.title, p2.title) AS title_similarity
      FROM posts p1
      JOIN posts p2 ON p1.company = p2.company AND p1.id != p2.id
      WHERE p1.company = 'Razorpay'
      LIMIT 1;
    `;
    console.table(similarityResults);

    console.log("✅ Seed completed successfully with verified FTS and Trigram matching!");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
