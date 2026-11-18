// Greenhouse Public Board Fetcher (lib/sources/greenhouse.ts)
// Fetches job postings from Greenhouse Public Board API

import type { RawPost } from "../types";
import { CONFIG } from "../config";
import { fetchWithRetry, isIndiaOrRemote, isFresherRelevant, stripHtml, sleep } from "./utils";

// Targeted tech companies with India presence using Greenhouse
const GREENHOUSE_COMPANIES = [
  "inmobi",
  "groww",
  "slice",
  "deliveroo",
  "rubrik",
  "datadog",
  "affirm",
  "brex",
  "coinbase",
  "gitlab",
  "okta",
  "mongodb",
  "databricks",
  "twilio",
  "pinterest",
  "dropbox",
  "gusto",
  "airtable",
  "cloudflare",
  "samsara",
  "zscaler",
  "purestorage",
  "netskope",
  "flexport",
  "toast",
  "reddit",
  "roblox",
];

interface GreenhouseJob {
  id: number | string;
  title: string;
  absolute_url: string;
  location?: {
    name?: string;
  };
  content?: string;
  company_name?: string;
  first_published?: string;
  updated_at?: string;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

export async function fetch(): Promise<RawPost[]> {
  console.log(`📡 [Greenhouse] Starting fetch for ${GREENHOUSE_COMPANIES.length} companies...`);
  const posts: RawPost[] = [];

  for (const company of GREENHOUSE_COMPANIES) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;

    try {
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        console.warn(`[Greenhouse] Skipped ${company}: HTTP ${response.status}`);
        continue;
      }

      const data = (await response.json()) as GreenhouseResponse;
      const rawJobs = data.jobs || [];
      let companyAdded = 0;

      for (const job of rawJobs) {
        const locationName = job.location?.name || "";
        const title = job.title || "";
        const plainDesc = stripHtml(job.content || "");

        // Keep jobs located in India/Remote and fitting fresher/early career criteria
        if (!isIndiaOrRemote(locationName)) continue;
        if (!isFresherRelevant(title, plainDesc, locationName)) continue;

        posts.push({
          source: "greenhouse",
          sourceId: `gh-${job.id}`,
          url: job.absolute_url,
          title: title.trim(),
          company: job.company_name || company.charAt(0).toUpperCase() + company.slice(1),
          locationRaw: locationName.trim(),
          description: plainDesc.slice(0, 3000), // Cap description length for memory efficiency
          postedAt: job.first_published || job.updated_at || null,
        });
        companyAdded++;
      }

      console.log(`   ✓ [Greenhouse] ${company}: collected ${companyAdded} fresher/intern posts`);
      // Polite delay between distinct company board requests
      await sleep(CONFIG.pipeline.requestDelayMs);
    } catch (err: unknown) {
      console.warn(`[Greenhouse] Error fetching ${company}: ${(err as Error)?.message}`);
    }
  }

  console.log(`✅ [Greenhouse] Finished with ${posts.length} total posts.`);
  return posts;
}
