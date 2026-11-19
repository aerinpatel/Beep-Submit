# Beep Fresher Jobs India — Live Web Tool & Pipeline

> A production-grade, automated web platform and data ingestion pipeline collecting, deduplicating, LLM-tagging, and indexing 200+ real fresher and internship jobs in India from public ATS sources. Built with **Next.js 14 (App Router)**, **PostgreSQL (Drizzle ORM)**, **Tailwind CSS**, and **Groq LLM (`openai/gpt-oss-20b`)**.

---

## 🏛️ System Architecture

The system decouples data ingestion from presentation. The scheduler triggers the idempotent pipeline, which moves raw postings through typed contracts into PostgreSQL. The Web UI and evaluation scripts read strictly from the database.

```mermaid
flowchart TD
    subgraph Scheduler["1. Scheduling Layer"]
        GHA["GitHub Actions Cron\n(Daily @ 02:00 UTC / 07:30 IST)"]
        CronRoute["Vercel Cron Fallback\n(/api/cron/ingest + CRON_SECRET)"]
    end

    subgraph Pipeline["2. Pipeline Orchestrator (lib/pipeline.ts)"]
        F["Stage 1: Fetchers\n(Greenhouse, Lever, Ashby, Syndication)"]
        N["Stage 2: Deterministic Normalizer\n(URL sanitization, City aliases, SHA-256 hash)"]
        D["Stage 3: Layered Deduplicator\n(Exact URL/hash + pg_trgm fuzzy similarity > 0.85)"]
        T["Stage 4: Batched LLM Tagger\n(15 posts/batch, JSON schema, contentHash cache)"]
        U["Stage 5: Idempotent DB Upsert\n(Conflict handling, last_seen_at updates)"]
        F --> N --> D --> T --> U
    end

    subgraph Database["3. PostgreSQL (Docker / Neon)"]
        PostsTable[("posts\n- Unique (source, source_id)\n- search_vector GIN\n- pg_trgm title GIN\n- is_duplicate_of soft link")]
        UsageTable[("llm_usage\n- input/output tokens\n- run_id\n- post_count")]
        RunsTable[("runs\n- stage counts\n- status & duration")]
    end

    subgraph Consumers["4. Consumers & Reporting"]
        UI["Web UI (app/page.tsx)\n- Server Component\n- Full-Text tsvector search\n- Active <= 7 days filter\n- Non-duplicates only"]
        Eval["Eval Scripts\n(scripts/eval-sample.ts\nscripts/eval-score.ts)"]
        Cost["Cost Analysis\n(scripts/cost-report.ts)"]
    end

    GHA --> F
    CronRoute --> F
    U --> PostsTable
    T --> UsageTable
    U --> RunsTable

    PostsTable --> UI
    PostsTable --> Eval
    UsageTable --> Cost
    RunsTable --> UI
```

---

## 📋 Data Contracts (`lib/types.ts`)

All pipeline stages communicate exclusively through immutable TypeScript contracts:

- **`RawPost`**: Raw ATS payload (`source`, `sourceId`, `url`, `title`, `company`, `locationRaw`, `description`, `postedAt?`).
- **`NormalizedPost`**: Sanitized payload (`RawPost` + `canonicalUrl`, `cityPre?`, `contentHash`).
- **`TaggedPost`**: Enriched payload (`NormalizedPost` + `role`, `city`, `isFresher`, `confidence`, `modelVersion`).
- **`LLMUsage`**: Granular token telemetry (`inputTokens`, `outputTokens`, `model`, `runId`, `postCount`).
- **`PipelineStageCounts`**: Stage-by-stage counts (`fetched`, `normalized`, `dedupedExact`, `dedupedFuzzy`, `tagged`, `upserted`, `errors`).

---

## 🛡️ Terms of Service (ToS) & robots.txt Compliance

| Source | Designated Public Endpoint | Compliance Decision & Rationale |
| :--- | :--- | :--- |
| **Greenhouse** | `https://boards-api.greenhouse.io/v1/boards/{company}/jobs` | **Approved**: Explicit public board REST API specifically provided by Greenhouse for syndication. |
| **Lever** | `https://api.lever.co/v0/postings/{company}` | **Approved**: Official public postings API for companies with active job boards. |
| **Ashby** | `https://api.ashbyhq.com/posting-api/job-board/{company}` | **Approved**: Public job-board syndication endpoint delivering structured JSON. |
| **LinkedIn / Naukri / Internshala** | *N/A (Excluded)* | **Prohibited**: Explicitly forbidden by site Terms of Service and protected by anti-scraping gates. We do **not** scrape them. |

---

## ⚡ Quickstart & Setup

### Prerequisites
- Node.js 20+ and `pnpm` (or `npm`)
- Docker & Docker Compose (or an external PostgreSQL instance with `pg_trgm`)
- Groq API Key (free tier at [console.groq.com](https://console.groq.com))

### 1. Clone & Install
```bash
git clone https://github.com/your-username/beep-job-pipeline.git
cd beep-job-pipeline
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `.env` contains:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5436/beep_jobs"
GROQ_API_KEY="gsk_your_groq_api_key_here"
CRON_SECRET="beep-secret-key-2026"
```

### 3. Start Database & App via Docker
```bash
docker compose up -d
```
*Note: Docker maps host port `5436:5432` to avoid collisions with any local Windows PostgreSQL instances.*

### 4. Run Migrations & Ingest Real Data
```bash
# Run idempotent database migration (enables pg_trgm, generates search_vector)
pnpm db:migrate

# Execute initial ingestion pipeline (fetches 640+ real jobs from public ATS APIs)
pnpm pipeline:run
```

### 5. Launch Web UI
Visit [http://localhost:3000](http://localhost:3000) to browse live listings, search via full-text search, and filter by role and city.

---

## 🧪 Testing Every Chunk Independently

Every chunk in the project includes an isolated test runner script under `/scripts`:

| Chunk | What It Tests | Run Command |
| :--- | :--- | :--- |
| **Chunk 1: DB Schema** | Tables, unique indexes, `pg_trgm` GIN, and `search_vector` | `pnpm db:migrate` |
| **Chunk 2: Fetchers** | Public ATS APIs (Greenhouse, Lever, Ashby, Jobicy) | `pnpm fetch:test` |
| **Chunk 3: Normalizer** | URL cleanup, corporate suffix stripping, city alias pre-pass | `pnpm normalize:test` |
| **Chunk 4: Deduplication** | Exact hash match + `pg_trgm` fuzzy similarity > 0.85 | `pnpm dedupe:test` |
| **Chunk 5: LLM Tagger** | Structured JSON tagging, Zod validation, markdown strip, cache | `pnpm tag:test` |
| **Chunk 6: Pipeline** | End-to-end 5-stage ingestion with idempotency verification | `pnpm pipeline:run` |
| **Chunk 7: Scheduler & Cron** | HTTP 401 on unauthorized calls, 200 on valid `CRON_SECRET` | `pnpm cron:test` |
| **Chunk 8: Web UI** | tsvector full-text query, active-only filter, pagination non-overlap | `pnpm ui:test` |
| **Chunk 9: Eval & Cost** | 50-post stratified eval sample, accuracy scorer, token cost report | `pnpm eval:score`<br>`pnpm cost:report` |

---

## 📊 Evaluation & Token Cost Reports

### 1. Tagging Accuracy (50 Hand-Checked Posts)
Run the evaluator against hand-checked labels:
```bash
pnpm eval:score
```

**Results:**
- **City Tagging Accuracy: 92.0%** (Deterministic `CITY_ALIASES` pre-pass + LLM eliminated city hallucinations).
- **Role Tagging Accuracy: 24.0%** (Identified actionable error patterns where Account Executives & Tech Staff titles fell into "Other").
- **Top Error Patterns**:
  1. *Sales Roles classified as "Other"*: "Account Executive" (13 posts) treated as executive title rather than sales.
  2. *Engineering Acronyms*: "MTS" (Member of Technical Staff) classified as "Other" without explicit alias mapping.
  3. *HR / Recruiting*: "Talent Acquisition Specialist" classified as "Other".

### 2. Real Cost Per 1,000 Posts (From PostgreSQL `llm_usage` logs)
Run the cost reporting script:
```bash
pnpm cost:report
```

**Metrics from Live Database Logs:**
- **Average Tokens / Post**: 224 input tokens, 105 output tokens (328 total tokens/post).
- **Cost per 1,000 Posts (Groq `openai/gpt-oss-20b`)**: **$0.0966** (~9.6 cents per 1,000 posts).
- **Cost per 1,000 Posts (Claude 3.5 Haiku)**: **$0.5992** (~60 cents per 1,000 posts).
- **Net Architectural Savings**: **96.1% monthly cost savings** vs. naive unbatched tagging:
  - *Prompt Amortization*: Batching 15 posts cuts input tokens by **73.7%**.
  - *Deduplication Firewall*: Filters **~35%** duplicate posts before invoking the LLM.
  - *Hash Caching*: Existing active postings cost **$0.00 (0 tokens)** on daily re-runs.

---

## 👨‍💻 Founder Live Coding Playbook

During a live interview call, you may be asked to extend the project on the spot. The codebase is designed so that each extension requires modifying only **one isolated file**:

### 1. How to Add a New Job Source (2 Minutes)
1. Create `lib/sources/<source_name>.ts` exporting a `fetch()` function that returns `Promise<RawPost[]>`:
   ```typescript
   import type { RawPost } from "../types";
   import { fetchWithRetry, isIndiaOrRemote, isFresherRelevant, stripHtml } from "./utils";

   export async function fetch(): Promise<RawPost[]> {
     const res = await fetchWithRetry("https://api.example.com/v1/jobs");
     const data = await res.json();

     return data.jobs
       .filter((j: any) => isIndiaOrRemote(j.location) && isFresherRelevant(j.title, j.description))
       .map((j: any) => ({
         source: "newsource",
         sourceId: String(j.id),
         url: j.apply_url,
         title: j.title,
         company: j.company_name,
         locationRaw: j.location,
         description: stripHtml(j.description),
         postedAt: j.created_at ? new Date(j.created_at) : undefined,
       }));
   }
   ```
2. Register it in `lib/sources/index.ts` inside the `sources` array:
   ```typescript
   import { fetch as fetchNewSource } from "./newsource";
   // add { name: "newsource", runner: fetchNewSource } to the sources list
   ```

### 2. How to Add a New Role or City (1 Minute)
All enums and alias maps are centralized in `lib/config.ts`:
1. **To add a Role** (e.g. `"Product Management"`):
   - Add `"Product Management"` to the `ROLES` array in `lib/config.ts`.
   - The LLM tagger prompt and Zod validator dynamically read `ROLES`—zero extra prompt changes needed!
2. **To add a City** (e.g. `"Kolkata"`):
   - Add `"Kolkata"` to `CITIES` in `lib/config.ts`.
   - Add aliases to `CITY_ALIASES` in `lib/config.ts`:
     ```typescript
     kolkata: "Kolkata",
     calcutta: "Kolkata",
     ```

### 3. How to Add a New Filter in the Web UI (2 Minutes)
In `app/page.tsx`:
1. Read the parameter from `searchParams` (e.g., `const fresherOnly = searchParams.fresher === "true"`).
2. Append the SQL condition in the query:
   ```typescript
   ${fresherOnly ? client`AND is_fresher = true` : client``}
   ```
3. Add the UI checkbox or dropdown element inside the `<form>` in `app/page.tsx`.

---

## 🛠️ What Broke While Building & How It Was Fixed

All 10 debugging stories, root causes, and fixes are logged in detail in [NOTES.md](file:///c:/Users/aerin/Desktop/code/placement/beep/NOTES.md):

1. **PowerShell Script Execution Policy**: Fixed by calling `.cmd` batch shims.
2. **pnpm v11 Build Security (`ERR_PNPM_IGNORED_BUILDS`)**: Resolved by running `pnpm approve-builds --all`.
3. **Inconsistent Public ATS Slugs & TLS Handshakes**: Curated verified company boards with `Promise.allSettled` failure isolation.
4. **Content Hash Divergence on Corporate Suffixes**: Added corporate entity suffix stripping before SHA-256 hashing.
5. **Windows Host Port Collision on Postgres 5432**: Remapped container to `5436:5432`.
6. **Content Hash Discrepancy Between Seed & Canonical Normalizer**: Synchronized seed script to use canonical hash helper.
7. **LLM Response Markdown Fence Wrapping**: Sanitized backticks before Zod schema validation.
8. **Node v22 Crypto Hashing Failure on Date Objects**: Converted Date instances to ISO 8601 strings in SQL statements.
9. **Pipeline Re-Run Deduplication Overwriting Primary Records (`is_duplicate_of = id`)**: Excluded candidate's own record from DB exact match queries.
10. **Groq Free Tier TPM Rate Limit (HTTP 429)**: Implemented `contentHash` cache reuse and batch pacing.

---

## 📜 License
MIT License. Built for Beep Career Platform evaluation.
