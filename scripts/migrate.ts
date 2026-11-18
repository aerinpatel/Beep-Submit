// Migration runner: scripts/migrate.ts
// Ensures pg_trgm extension, tables, generated tsvector, and all indexes are created

import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ Error: DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

async function runMigrations() {
  console.log("🚀 Starting database schema initialization...");

  try {
    // 1. Enable pg_trgm for fuzzy matching
    console.log("📦 Enabling pg_trgm extension...");
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;

    // 2. Create posts table
    console.log("📦 Creating posts table...");
    await sql`
      CREATE TABLE IF NOT EXISTS posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        url TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        location_raw TEXT NOT NULL,
        description TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        posted_at TIMESTAMP,
        first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        role_tag TEXT,
        city_tag TEXT,
        is_fresher BOOLEAN NOT NULL DEFAULT FALSE,
        tag_confidence REAL,
        tagged_at TIMESTAMP,
        model_version TEXT,
        is_duplicate_of UUID REFERENCES posts(id) ON DELETE SET NULL,
        search_vector tsvector GENERATED ALWAYS AS (
          to_tsvector('english',
            coalesce(title, '') || ' ' ||
            coalesce(company, '') || ' ' ||
            coalesce(location_raw, '') || ' ' ||
            coalesce(description, '')
          )
        ) STORED
      );
    `;

    // 3. Create indexes on posts
    console.log("📦 Creating indexes on posts...");
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS posts_source_source_id_idx ON posts (source, source_id);`;
    await sql`CREATE INDEX IF NOT EXISTS posts_content_hash_idx ON posts (content_hash);`;
    await sql`CREATE INDEX IF NOT EXISTS posts_canonical_url_idx ON posts (canonical_url);`;
    await sql`CREATE INDEX IF NOT EXISTS posts_company_idx ON posts (company);`;
    await sql`CREATE INDEX IF NOT EXISTS posts_last_seen_at_idx ON posts (last_seen_at);`;
    await sql`CREATE INDEX IF NOT EXISTS posts_is_duplicate_of_idx ON posts (is_duplicate_of);`;
    await sql`CREATE INDEX IF NOT EXISTS posts_search_vector_idx ON posts USING gin (search_vector);`;
    await sql`CREATE INDEX IF NOT EXISTS posts_title_trgm_idx ON posts USING gin (title gin_trgm_ops);`;

    // 4. Create llm_usage table
    console.log("📦 Creating llm_usage table...");
    await sql`
      CREATE TABLE IF NOT EXISTS llm_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        post_count INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS llm_usage_run_id_idx ON llm_usage (run_id);`;
    await sql`CREATE INDEX IF NOT EXISTS llm_usage_created_at_idx ON llm_usage (created_at);`;

    // 5. Create runs table
    console.log("📦 Creating runs table...");
    await sql`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMP,
        status TEXT NOT NULL,
        stage_counts JSONB NOT NULL,
        error_log TEXT
      );
    `;

    console.log("✅ Schema initialized successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
