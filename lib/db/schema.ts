import {
  pgTable,
  text,
  timestamp,
  boolean,
  real,
  uuid,
  integer,
  jsonb,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom tsvector type for PostgreSQL full-text search
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    locationRaw: text("location_raw").notNull(),
    description: text("description").notNull(),
    contentHash: text("content_hash").notNull(),
    postedAt: timestamp("posted_at"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),

    // Enrichment / Tagging fields
    roleTag: text("role_tag"),
    cityTag: text("city_tag"),
    isFresher: boolean("is_fresher").default(false).notNull(),
    tagConfidence: real("tag_confidence"),
    taggedAt: timestamp("tagged_at"),
    modelVersion: text("model_version"),

    // Deduplication reference (soft link to another post's id if duplicate)
    isDuplicateOf: uuid("is_duplicate_of"),

    // Full-text search vector (populated via PostgreSQL trigger / generated expression)
    searchVector: tsvector("search_vector"),
  },
  (table) => [
    uniqueIndex("posts_source_source_id_idx").on(table.source, table.sourceId),
    index("posts_content_hash_idx").on(table.contentHash),
    index("posts_canonical_url_idx").on(table.canonicalUrl),
    index("posts_company_idx").on(table.company),
    index("posts_search_vector_idx").using("gin", table.searchVector),
    index("posts_last_seen_at_idx").on(table.lastSeenAt),
    index("posts_is_duplicate_of_idx").on(table.isDuplicateOf),
  ]
);

export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: text("run_id").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    postCount: integer("post_count").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("llm_usage_run_id_idx").on(table.runId),
    index("llm_usage_created_at_idx").on(table.createdAt),
  ]
);

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  status: text("status").notNull(), // 'running' | 'success' | 'failed' | 'partial'
  stageCounts: jsonb("stage_counts").notNull(),
  errorLog: text("error_log"),
});

export type PostSelect = typeof posts.$inferSelect;
export type PostInsert = typeof posts.$inferInsert;
export type LLMUsageSelect = typeof llmUsage.$inferSelect;
export type LLMUsageInsert = typeof llmUsage.$inferInsert;
export type RunSelect = typeof runs.$inferSelect;
export type RunInsert = typeof runs.$inferInsert;
