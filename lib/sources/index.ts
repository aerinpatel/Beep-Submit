// Unified Sources Fetcher (lib/sources/index.ts)
// Aggregates all sources with failure isolation (Promise.allSettled)

import type { RawPost } from "../types";
import { fetch as fetchGreenhouse } from "./greenhouse";
import { fetch as fetchLever } from "./lever";
import { fetch as fetchAshby } from "./ashby";
import { fetch as fetchJobicy } from "./jobicy";

export interface FetchAllResult {
  posts: RawPost[];
  sourceCounts: Record<string, number>;
  sourceErrors: Record<string, string>;
}

export async function fetchAllSources(): Promise<FetchAllResult> {
  console.log("🌐 Starting fetch across all configured job sources...");

  const sources = [
    { name: "greenhouse", runner: fetchGreenhouse },
    { name: "lever", runner: fetchLever },
    { name: "ashby", runner: fetchAshby },
    { name: "jobicy", runner: fetchJobicy },
  ];

  const results = await Promise.allSettled(
    sources.map(async (s) => {
      const posts = await s.runner();
      return { name: s.name, posts };
    })
  );

  const allPosts: RawPost[] = [];
  const sourceCounts: Record<string, number> = {};
  const sourceErrors: Record<string, string> = {};

  for (let i = 0; i < results.length; i++) {
    const s = sources[i];
    const res = results[i];

    if (res.status === "fulfilled") {
      const fetched = res.value.posts;
      sourceCounts[s.name] = fetched.length;
      allPosts.push(...fetched);
      console.log(`✨ [Source: ${s.name}] Succeeded with ${fetched.length} posts.`);
    } else {
      sourceCounts[s.name] = 0;
      sourceErrors[s.name] = res.reason?.message || "Unknown error";
      console.error(`⚠️ [Source: ${s.name}] Failed: ${sourceErrors[s.name]}`);
    }
  }

  console.log(`\n🎉 Total aggregated raw posts: ${allPosts.length}`);
  return { posts: allPosts, sourceCounts, sourceErrors };
}
