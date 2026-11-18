// Ashby Public Job Board Fetcher (lib/sources/ashby.ts)
// Fetches job postings from Ashby Public Job Board API

import type { RawPost } from "../types";
import { CONFIG } from "../config";
import { fetchWithRetry, isIndiaOrRemote, isFresherRelevant, stripHtml, sleep } from "./utils";

const ASHBY_COMPANIES = [
  "ramp",
  "linear",
  "sentry",
  "vanta",
  "notion",
  "replit",
];

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

export async function fetch(): Promise<RawPost[]> {
  console.log(`📡 [Ashby] Starting fetch for ${ASHBY_COMPANIES.length} companies...`);
  const posts: RawPost[] = [];

  for (const company of ASHBY_COMPANIES) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${company}`;

    try {
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        console.warn(`[Ashby] Skipped ${company}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as AshbyResponse;
      const rawJobs = data.jobs || [];
      let companyAdded = 0;

      for (const job of rawJobs) {
        const title = job.title || "";
        const secondary = job.secondaryLocations?.map((l) => l.location).filter(Boolean).join(", ");
        const locationRaw = [job.location, secondary].filter(Boolean).join(", ") || "Remote";

        const plainDesc = job.descriptionPlain || stripHtml(job.descriptionHtml || "");

        if (!isIndiaOrRemote(locationRaw)) continue;
        if (!isFresherRelevant(title, plainDesc, locationRaw)) continue;

        posts.push({
          source: "ashby",
          sourceId: `ash-${job.id}`,
          url: job.jobUrl,
          title: title.trim(),
          company: company.charAt(0).toUpperCase() + company.slice(1),
          locationRaw: locationRaw.trim(),
          description: plainDesc.slice(0, 3000),
          postedAt: job.publishedAt || null,
        });
        companyAdded++;
      }

      console.log(`   ✓ [Ashby] ${company}: collected ${companyAdded} fresher/intern posts`);
      await sleep(CONFIG.pipeline.requestDelayMs);
    } catch (err: unknown) {
      console.warn(`[Ashby] Error fetching ${company}: ${(err as Error)?.message}`);
    }
  }

  console.log(`✅ [Ashby] Finished with ${posts.length} total posts.`);
  return posts;
}
