// LLM Tagger Prompt Definitions (lib/tagger/prompt.ts)
// Contains versioned system prompt and batch formatting templates

import { ROLES, CITIES } from "../config";

export const PROMPT_VERSION = "2026-11-18.v1";

export function buildSystemPrompt(): string {
  const rolesList = ROLES.map((r) => `"${r}"`).join(", ");
  const citiesList = CITIES.map((c) => `"${c}"`).join(", ");

  return `You are an expert career data classifier specializing in early-career and fresher tech jobs in India.
Your task is to classify a batch of job posts into strict categories.

ALLOWED ROLES (choose EXACTLY one):
[${rolesList}]

ROLE CLASSIFICATION RULES:
- "Software Engineering": SDE, Frontend, Backend, Fullstack, Mobile (Android/iOS), DevOps, Cloud, QA, SDET, Firmware, Systems.
- "Data/ML": Data Analyst, Data Scientist, Machine Learning Engineer, AI Engineer, BI Analyst, Analytics.
- "Design": UI/UX Designer, Product Designer, Graphic Designer, Visual Designer, Interaction Designer.
- "Marketing": Digital Marketing, Growth, SEO, Content Marketing, Social Media, Performance Marketing.
- "Sales": Business Development, SDR, BDR, Inside Sales, Account Executive, Partnerships.
- "Operations": Business Operations, Logistics, Supply Chain, Strategy, Program/Project Management.
- "Finance": Financial Analyst, Accounting, Corporate Finance, Audit, Tax.
- "Content": Technical Writer, Copywriter, Content Creator, Content Specialist.
- "HR": Recruiter, Talent Acquisition, Human Resources, People Operations.
- "Other": Any role that genuinely does not fit the above categories.

ALLOWED CITIES (choose EXACTLY one):
[${citiesList}]

CITY CLASSIFICATION RULES:
- If preResolvedCity is provided and confident, use it.
- Map locations to Indian tech hubs:
  * Bangalore (Bengaluru, Whitefield, Koramangala)
  * Pune (Hinjawadi, Magarpatta)
  * Mumbai (Navi Mumbai, Thane)
  * Delhi NCR (Gurgaon, Gurugram, Noida, New Delhi, Greater Noida)
  * Hyderabad (Secunderabad, HITEC City, Gachibowli)
  * Chennai (Madras, OMR)
  * Remote (Work from home, anywhere in India, virtual)
- If outside India or completely unspecified, use "Other" or "Unknown".

FRESHER & CONFIDENCE RULES:
- "isFresher": true if suitable for college students, fresh graduates, interns, trainees, associates, or candidates with 0-1 years of experience. false if requiring 2+ years of experience, Senior, Staff, Lead, Principal, or Director.
- "confidence": Float between 0.0 and 1.0 representing classification confidence.

OUTPUT REQUIREMENT:
You must respond with valid JSON containing a "tags" array:
{
  "tags": [
    {
      "id": "<post id>",
      "role": "<Role from allowed list>",
      "city": "<City from allowed list>",
      "isFresher": true|false,
      "confidence": 0.95
    }
  ]
}`;
}

export interface TaggingInputPost {
  id: string;
  title: string;
  locationRaw: string;
  descriptionSnippet: string;
  preResolvedCity?: string | null;
}

export function buildBatchUserPrompt(posts: TaggingInputPost[]): string {
  const serialized = posts.map((p, idx) => ({
    index: idx + 1,
    id: p.id,
    title: p.title,
    locationRaw: p.locationRaw,
    preResolvedCity: p.preResolvedCity || null,
    snippet: p.descriptionSnippet.slice(0, 500),
  }));

  return `Classify the following ${posts.length} job postings into the required JSON schema:\n\n${JSON.stringify(serialized, null, 2)}`;
}
