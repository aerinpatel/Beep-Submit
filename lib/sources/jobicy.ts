// Jobicy Public Remote Syndication API Fetcher (lib/sources/jobicy.ts)
// Fetches early career & tech job postings from Jobicy Public API

import type { RawPost } from "../types";
import { fetchWithRetry, isIndiaOrRemote, isFresherRelevant, stripHtml } from "./utils";

interface JobicyJob {
  id: number | string;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

interface JobicyResponse {
  jobs?: JobicyJob[];
}

export async function fetch(): Promise<RawPost[]> {
  console.log("📡 [Jobicy] Starting fetch for remote and early career postings...");
  const posts: RawPost[] = [];
  const url = "https://jobicy.com/api/v2/remote-jobs?count=50";

  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      console.warn(`[Jobicy] Skipped: HTTP ${response.status}`);
      return posts;
    }

    const data = (await response.json()) as JobicyResponse;
    const rawJobs = data.jobs || [];

    for (const job of rawJobs) {
      const title = job.jobTitle || "";
      const locationRaw = job.jobGeo || "Remote";
      const plainDesc = stripHtml(job.jobDescription || job.jobExcerpt || "");
      const isJuniorOrEntry = (job.jobLevel || "").toLowerCase().includes("entry") ||
        (job.jobLevel || "").toLowerCase().includes("junior");

      if (!isIndiaOrRemote(locationRaw)) continue;
      if (!isJuniorOrEntry && !isFresherRelevant(title, plainDesc, locationRaw)) continue;

      posts.push({
        source: "jobicy",
        sourceId: `jobicy-${job.id}`,
        url: job.url,
        title: title.trim(),
        company: job.companyName.trim(),
        locationRaw: locationRaw.trim(),
        description: plainDesc.slice(0, 3000),
        postedAt: job.pubDate || null,
      });
    }

    console.log(`✅ [Jobicy] Finished with ${posts.length} posts.`);
  } catch (err: unknown) {
    console.warn(`[Jobicy] Error during fetch: ${(err as Error)?.message}`);
  }

  return posts;
}
