// Lever Public Postings Fetcher (lib/sources/lever.ts)
// Fetches job postings from Lever Public Postings API

import type { RawPost } from "../types";
import { CONFIG } from "../config";
import { fetchWithRetry, isIndiaOrRemote, isFresherRelevant, stripHtml, sleep } from "./utils";

const LEVER_COMPANIES = [
  "paytm",
  "fi",
  "palantir",
  "spotify",
  "kinsta",
];

interface LeverJob {
  id: string;
  text: string;
  categories?: {
    commitment?: string;
    location?: string;
    team?: string;
    allLocations?: string[];
  };
  descriptionPlain?: string;
  description?: string;
  hostedUrl: string;
  createdAt?: number;
}

export async function fetch(): Promise<RawPost[]> {
  console.log(`📡 [Lever] Starting fetch for ${LEVER_COMPANIES.length} companies...`);
  const posts: RawPost[] = [];

  for (const company of LEVER_COMPANIES) {
    const url = `https://api.lever.co/v0/postings/${company}?mode=json`;

    try {
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        console.warn(`[Lever] Skipped ${company}: HTTP ${response.status}`);
        continue;
      }

      const jobs = (await response.json()) as LeverJob[];
      let companyAdded = 0;

      for (const job of jobs) {
        const title = job.text || "";
        const locationRaw =
          job.categories?.location ||
          job.categories?.allLocations?.join(", ") ||
          "Remote";

        const plainDesc = job.descriptionPlain || stripHtml(job.description || "");

        // Filter for India / Remote and fresher / early career posts
        if (!isIndiaOrRemote(locationRaw)) continue;
        if (!isFresherRelevant(title, plainDesc, locationRaw)) continue;

        posts.push({
          source: "lever",
          sourceId: `lev-${job.id}`,
          url: job.hostedUrl,
          title: title.trim(),
          company: company.charAt(0).toUpperCase() + company.slice(1),
          locationRaw: locationRaw.trim(),
          description: plainDesc.slice(0, 3000),
          postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
        });
        companyAdded++;
      }

      console.log(`   ✓ [Lever] ${company}: collected ${companyAdded} fresher/intern posts`);
      await sleep(CONFIG.pipeline.requestDelayMs);
    } catch (err: unknown) {
      console.warn(`[Lever] Error fetching ${company}: ${(err as Error)?.message}`);
    }
  }

  console.log(`✅ [Lever] Finished with ${posts.length} total posts.`);
  return posts;
}
