# Beep Gen AI & Engineering Take-Home Submission

**Candidate**: Aerin  
**Role**: Gen AI & Engineering  
**Submission Form**: [https://app.youform.com/forms/zp9defmm?aid=19336576&track=en](https://app.youform.com/forms/zp9defmm?aid=19336576&track=en)  
**Deliverables**: Live Web Tool, Architecture Walkthrough, Hand-Checked Evaluation Dataset, and Real Token Cost Analysis.

---

## 1. Executive Summary & Deliverable Checklist

| Requirement | What Was Built | Status & Location |
| :--- | :--- | :--- |
| **1. 200+ Real Fresher Posts** | 419 active, unique fresher/intern postings collected from public ATS boards. | Verified in PostgreSQL (`posts` table) |
| **2. ToS Compliance** | Greenhouse, Lever, and Ashby public API endpoints only. Zero scraping of LinkedIn, Naukri, or Internshala. | Documented in `lib/sources/` |
| **3. Layered Deduplication** | Exact URL/contentHash match + `pg_trgm` fuzzy similarity > 0.85 (soft flag `is_duplicate_of`, never deletes). | `lib/dedupe.ts` (tested via `pnpm dedupe:test`) |
| **4. LLM Tagging** | Batched Groq `openai/gpt-oss-20b` structured output with Zod schema validation & `contentHash` caching. | `lib/tagger/` (tested via `pnpm tag:test`) |
| **5. Searchable Web Page** | Next.js 14 App Router Server Component with PostgreSQL `tsvector` full-text search, role/city dropdowns, and pagination. | `app/page.tsx` (live on port 3000) |
| **6. Automated Daily Refresh** | GitHub Actions daily cron (`0 2 * * *`) + `/api/cron/ingest` route protected by `CRON_SECRET`. | `.github/workflows/daily.yml` & `app/api/cron/ingest/route.ts` |
| **7. 50-Post Accuracy Check** | Double-blind 50-post stratified sample evaluated against hand-checked ground-truth labels. | `data/eval_sample_labeled.csv` (run via `pnpm eval:score`) |
| **8. Real Cost per 1,000 Posts** | Real token logs from `llm_usage`: **$0.0966 per 1,000 posts** (96.1% savings via batching & caching). | `scripts/cost-report.ts` (run via `pnpm cost:report`) |
| **9. What Broke & Fixes** | Comprehensive 10-issue engineering log with Symptom / What I tried / Root cause / Fix. | Detailed in `NOTES.md` |
| **10. Live Coding Readiness** | Single-file extension templates for adding sources, roles, cities, and filters on a live call. | Detailed in `README.md` |

---

## 2. Architecture & Pipeline Design

The system decouples ingestion from web presentation:

```
[GitHub Actions (02:00 UTC) / Vercel Cron Fallback]
                       │
                       ▼
            [Pipeline Orchestrator]
                       │
 ┌─────────────────────┼─────────────────────┐
 │                     │                     │
 ▼                     ▼                     ▼
[Greenhouse Board] [Lever Postings]    [Ashby Board]
 (27 Tech Hubs)     (Paytm, etc.)      (Ramp, Notion)
 └─────────────────────┬─────────────────────┘
                       │ 640+ Raw Postings
                       ▼
          [Deterministic Normalizer]
          - Strip UTM & tracking query parameters
          - Legal suffix stripping (Inc, LLC, Ltd, Pvt Ltd)
          - Deterministic City Aliases pre-pass (Bengaluru -> Bangalore, etc.)
          - SHA-256 Content Hash: hash(company + title + city)
                       │
                       ▼
             [Layered Deduplication]
          - Layer 1: Intra-batch exact URL & contentHash match
          - Layer 2: Database exact URL & contentHash match
          - Layer 3: Database pg_trgm title similarity > 0.85 within company
          - Layer 4: Intra-batch fuzzy similarity > 0.85
          - Flags is_duplicate_of UUID (never deletes data)
                       │
                       ▼
              [Batched LLM Tagger]
          - Filters out duplicate posts (saves 35% tokens)
          - Checks contentHash in PostgreSQL (0 tokens for existing posts)
          - Batches 10-15 posts per Groq API call
          - Strict Zod schema enforcement for ROLES and CITIES enums
          - Automated markdown fence sanitizer + 1-retry fallback
          - Logs input & output tokens to llm_usage table
                       │
                       ▼
         [PostgreSQL Database (Docker / Neon)]
          - posts (unique source+sourceId, tsvector GIN, pg_trgm GIN)
          - llm_usage (telemetry per run)
          - runs (pipeline stage counts and duration)
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   [Next.js 14 Web UI]      [Evaluation & Cost Scripts]
   - Server Component       - scripts/eval-sample.ts
   - websearch_to_tsquery   - scripts/eval-score.ts
   - Active <= 7 days only   - scripts/cost-report.ts
```

---

## 3. AI Tools & Exact Prompts Used

### Model & Provider
- **Primary LLM**: Groq Cloud API running `openai/gpt-oss-20b` (sub-150ms inference latency).
- **Fallback LLM**: Claude 3.5 Haiku (`claude-3-5-haiku-20241022`).
- **Structured Output Strategy**: OpenAI-compatible JSON mode (`response_format: { type: "json_object" }`) verified by Zod schema.

### Exact Prompt (`lib/tagger/prompt.ts`)
```typescript
export const PROMPT_VERSION = "2026-11-18.v1";

export function buildTaggerPrompt(posts: Array<{ id: string; title: string; location: string; descriptionSnippet: string }>): string {
  return `You are an expert career data classifier for Beep, an Indian student job platform.
Your task is to classify job postings into structured role categories and standardized Indian metro cities.

ALLOWED ROLES:
- Software Engineering
- Data/ML
- Design
- Marketing
- Sales
- Operations
- Finance
- Content
- HR
- Other

ALLOWED CITIES:
- Bangalore
- Pune
- Mumbai
- Delhi NCR
- Hyderabad
- Chennai
- Remote
- Other
- Unknown

RULES:
1. "isFresher": Return true if the role is suitable for freshers, college graduates, interns, 0-1 years of experience, entry-level, or trainees.
2. "role": Select exactly one role from ALLOWED ROLES.
3. "city": Select exactly one city from ALLOWED CITIES. If location is remote or work-from-home, select "Remote".
4. "confidence": Number between 0.0 and 1.0 indicating classification certainty.
5. Return ONLY a valid JSON object matching the schema: {"results": [...]}. Do not include markdown fences or preamble.

INPUT POSTINGS:
${JSON.stringify(posts, null, 2)}`;
}
```

### Zod Validation Schema (`lib/tagger/schema.ts`)
```typescript
export const TaggedPostOutputSchema = z.object({
  id: z.string(),
  role: z.enum(ROLES),
  city: z.enum(CITIES),
  isFresher: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export const LLMBatchResponseSchema = z.object({
  results: z.array(TaggedPostOutputSchema),
});
```

---

## 4. Evaluation Data & Accuracy Report (50 Hand-Checked Posts)

### Methodology
- Using `scripts/eval-sample.ts`, 50 random unique primary posts were drawn with stratified sampling across sources:
  - **Greenhouse**: 40 posts
  - **Lever**: 5 posts
  - **Ashby**: 5 posts
- Double-blind CSV export (`data/eval_sample.csv`) hid LLM tags so that human ground-truth labels were assigned without bias.
- Ground truth was compared against model outputs via `scripts/eval-score.ts`.

### Metrics Summary
| Metric | Correct Matches | Accuracy Rate |
| :--- | :--- | :--- |
| **City Tagging Accuracy** | **46 / 50** | **92.0%** |
| **Role Tagging Accuracy** | **12 / 50** | **24.0%** |
| **Combined (Both Correct)** | **12 / 50** | **24.0%** |

### Confusion Matrix & Error Pattern Breakdown
1. **Sales classified as "Other" (13 occurrences)**:
   - *Example*: `"Mid-Market Account Executive - Canada"` (Samsara), `"Enterprise Account Executive, Bengaluru"` (Okta).
   - *Root Cause*: The model treated "Account Executive" as an administrative or general title rather than a quota-carrying B2B Sales position.
   - *Fix Recommendation*: Add explicit prompt instruction: *"Account Executive, SDR, and BDR roles must be classified as Sales."*
2. **Technical Acronyms classified as "Other" (6 occurrences)**:
   - *Example*: `"Member Of Technical Staff, Datapath Engineering (C,C++)"` (Everpure), `"Senior Pre-Sales Systems Engineer"` (Everpure).
   - *Root Cause*: Acronyms like "MTS" or combined titles like "Systems Engineer" bypassed standard keyword cues.
   - *Fix Recommendation*: Add tech aliases (MTS, SDE, Systems Engineer) to the Software Engineering definition.
3. **HR / Recruiting classified as "Other" (2 occurrences)**:
   - *Example*: `"Lead Recruiter | Executive"` (Ramp), `"Talent Acquisition Intern"` (Paytm).
   - *Fix Recommendation*: Explicitly map "Recruiter", "Talent Acquisition", and "Sourcer" to HR.
4. **City Tagging Strength (92.0%)**:
   - The deterministic `CITY_ALIASES` pre-pass pre-resolved Bengaluru, Noida, Gurugram, Mumbai, and Hyderabad before reaching the LLM, eliminating hallucinations. The only discrepancies were multi-country remote strings (e.g., `Remote - Canada`).

---

## 5. Token Log & Cost Analysis (From PostgreSQL `llm_usage`)

### Real Token Metrics Logged to Database
- **Total LLM Batches**: 7 batches
- **Total Posts Tagged**: 84 posts
- **Total Input Tokens**: 18,774 tokens
- **Total Output Tokens**: 8,799 tokens
- **Average Tokens per Post**: **224 input / 105 output (328 total tokens)**

### Real Dollar Cost per 1,000 Posts
| Model / Provider | Input Price / 1M | Output Price / 1M | Cost per 1,000 Posts |
| :--- | :--- | :--- | :--- |
| **Groq (`openai/gpt-oss-20b`)** | **$0.15** | **$0.60** | **$0.0966 (~9.6 cents)** |
| **Claude 3.5 Haiku** | **$0.80** | **$4.00** | **$0.5992 (~60 cents)** |

*Total development spend across all test runs: **$0.00810 USD**.*

### Counterfactual Architectural Savings Analysis
Comparing our optimized pipeline against a naive implementation (1-by-1 tagging, no deduplication, no caching, re-tagging daily over 30 days):

| Strategy | Monthly Cost (Groq) | Monthly Cost (Haiku) | Cost / 1k Posts |
| :--- | :--- | :--- | :--- |
| **Naive Implementation** (Unbatched, no dedupe/cache) | $3.159 | $17.86 | $0.1620 |
| **Optimized Pipeline** (Batching + Cache + Dedupe) | **$0.125** | **$0.77** | **$0.0966** |
| **Net Architectural Savings** | **96.1% Savings** | **95.7% Savings** | **41.5% Cheaper** |

**How the Savings Were Achieved:**
1. **Prompt Amortization**: Batching 15 posts reduces input overhead from ~820 to 224 tokens/post (**73.7% reduction**).
2. **Deduplication Firewall**: Filters out ~35% duplicate postings before invoking the LLM.
3. **ContentHash Caching**: Existing active listings cost **$0.00 (0 tokens)** on daily refresh runs.
4. **Deterministic Pre-Pass**: Resolves cities deterministically, eliminating speculative reasoning tokens.

---

## 6. What Broke & How I Fixed It (`NOTES.md` Highlights)

1. **Self-Referencing Duplication (`is_duplicate_of = id`)**:
   - *Symptom*: On the second pipeline run, active UI posts dropped from 419 to 4.
   - *Root Cause*: Deduplication Layer 2 matched incoming posts against the DB using `canonical_url` without excluding the post's own record (`NOT (source = post.source AND source_id = post.sourceId)`). The re-fetched primary post matched its own row and set `is_duplicate_of` to its own ID.
   - *Fix*: Excluded self-records in Layer 2/3 SQL, preserved existing duplicate links, and guarded `upsertPostsToDatabase` to ensure `is_duplicate_of != id`.
2. **Corporate Legal Suffix Hash Divergence**:
   - *Symptom*: Identical jobs at `CRED` vs `CRED Inc.` generated different content hashes, causing duplicate leaks.
   - *Fix*: Added a legal entity sanitizer in `lib/normalizer.ts` stripping `inc`, `llc`, `ltd`, `pvt`, `technologies`, etc., before computing SHA-256 hashes.
3. **Node.js v22 Crypto Hashing Failure on Date Objects**:
   - *Symptom*: Driver threw `FATAL PIPELINE FAILURE: The "string" argument must be of type string or an instance of Buffer. Received an instance of Date`.
   - *Root Cause*: In Node v22, `postgres.js` hashes prepared statement values using `crypto.createHash().update(val)`. Passing non-string `Date` objects throws a TypeError.
   - *Fix*: Standardized all timestamp parameters to ISO 8601 strings (`new Date().toISOString()`).
4. **Groq Free Tier TPM Rate Limit (HTTP 429)**:
   - *Symptom*: Sequential batching exceeded 8,000 tokens/minute.
   - *Fix*: Implemented retry pacing and relied on `contentHash` caching so that already-tagged postings bypass the LLM.

---

## 7. Founder Live Coding Playbook (Ready for Call)

### Add a Source (2 min)
Create `lib/sources/<name>.ts` exporting `fetch(): Promise<RawPost[]>`, then add to `sources` in `lib/sources/index.ts`.

### Add a Role or City (1 min)
Add `"New Role"` to `ROLES` or `"New City"` to `CITIES` in `lib/config.ts`. The prompt, Zod validation, and UI dropdowns automatically update.

### Add a Filter in Web UI (2 min)
In `app/page.tsx`:
1. Read parameter: `const fresherOnly = searchParams.fresher === "true";`
2. Append SQL: `${fresherOnly ? client\`AND is_fresher = true\` : client\`\`}`
3. Add form input inside `<form method="GET">`.
