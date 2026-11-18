// Data Contracts (lib/types.ts) - Source of truth across all modules
// Strictly typed without `any`

import type { ROLES, CITIES } from "./config";

export type Role = (typeof ROLES)[number];
export type City = (typeof CITIES)[number];

export interface RawPost {
  source: string;
  sourceId: string;
  url: string;
  title: string;
  company: string;
  locationRaw: string;
  description: string; // Plain text
  postedAt?: string | null;
}

export interface NormalizedPost extends RawPost {
  canonicalUrl: string;
  cityPre?: City | null;
  contentHash: string;
}

export interface TaggedPost extends NormalizedPost {
  role: Role;
  city: City;
  isFresher: boolean;
  confidence: number;
  modelVersion: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface PipelineStageCounts {
  fetched: number;
  normalized: number;
  dedupedExact: number;
  dedupedFuzzy: number;
  tagged: number;
  upserted: number;
  errors: number;
}

export interface RunLog {
  id: string;
  startedAt: Date;
  finishedAt?: Date | null;
  status: "running" | "success" | "failed" | "partial";
  stageCounts: PipelineStageCounts;
  errorLog?: string | null;
}
