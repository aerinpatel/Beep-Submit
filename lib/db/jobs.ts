import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import type { JobPostItem } from "@/components/JobCard";

export interface LatestRunInfo {
  startedAt: string;
  status: string;
}

export interface GetJobsParams {
  q?: string;
  role?: string;
  city?: string;
  page?: number;
  pageSize?: number;
}

export interface GetJobsResult {
  posts: JobPostItem[];
  totalJobs: number;
  totalPages: number;
  page: number;
  pageSize: number;
  latestRun?: LatestRunInfo;
  error?: string | null;
}

function mapPrismaPostToJobItem(post: {
  id: string;
  source: string;
  sourceId: string;
  url: string;
  canonicalUrl: string;
  title: string;
  company: string;
  locationRaw: string;
  description: string;
  postedAt: Date | string | null;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  roleTag: string | null;
  cityTag: string | null;
  isFresher: boolean;
  tagConfidence: number | null;
}): JobPostItem {
  return {
    id: post.id,
    source: post.source,
    sourceId: post.sourceId,
    url: post.url,
    canonicalUrl: post.canonicalUrl,
    title: post.title,
    company: post.company,
    locationRaw: post.locationRaw,
    description: post.description,
    postedAt: post.postedAt instanceof Date ? post.postedAt.toISOString() : (post.postedAt ?? null),
    firstSeenAt: post.firstSeenAt instanceof Date ? post.firstSeenAt.toISOString() : String(post.firstSeenAt),
    lastSeenAt: post.lastSeenAt instanceof Date ? post.lastSeenAt.toISOString() : String(post.lastSeenAt),
    roleTag: post.roleTag,
    cityTag: post.cityTag,
    isFresher: post.isFresher,
    tagConfidence: post.tagConfidence,
  };
}

export async function getJobs(params: GetJobsParams = {}): Promise<GetJobsResult> {
  const q = params.q?.trim() || "";
  const role = params.role?.trim() || "";
  const city = params.city?.trim() || "";
  const page = Math.max(1, params.page || 1);
  const pageSize = params.pageSize || 15;
  const offset = (page - 1) * pageSize;

  try {
    let totalJobs = 0;
    let posts: JobPostItem[] = [];

    // Pure Prisma ORM query when no full-text search string is entered
    if (!q) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const where: Prisma.PostWhereInput = {
        isDuplicateOf: null,
        lastSeenAt: {
          gte: sevenDaysAgo,
        },
        ...(role && role !== "all" ? { roleTag: role } : {}),
        ...(city && city !== "all" ? { cityTag: city } : {}),
      };

      const [count, rawPosts, run] = await Promise.all([
        prisma.post.count({ where }),
        prisma.post.findMany({
          where,
          orderBy: [
            { postedAt: "desc" },
            { firstSeenAt: "desc" },
          ],
          skip: offset,
          take: pageSize,
        }),
        prisma.run.findFirst({
          where: { status: { in: ["success", "partial"] } },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true, status: true },
        }),
      ]);

      totalJobs = count;
      posts = rawPosts.map(mapPrismaPostToJobItem);

      return {
        posts,
        totalJobs,
        totalPages: Math.max(1, Math.ceil(totalJobs / pageSize)),
        page,
        pageSize,
        latestRun: run
          ? {
              startedAt: run.startedAt.toISOString(),
              status: run.status,
            }
          : undefined,
        error: null,
      };
    }

    // Full-Text Search with ranking uses PostgreSQL tsvector via Prisma's typed SQL helper
    const roleFilter = role && role !== "all" ? Prisma.sql`AND role_tag = ${role}` : Prisma.empty;
    const cityFilter = city && city !== "all" ? Prisma.sql`AND city_tag = ${city}` : Prisma.empty;

    const [countResult, searchResults, run] = await Promise.all([
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int as total
        FROM posts
        WHERE is_duplicate_of IS NULL
          AND last_seen_at >= NOW() - INTERVAL '7 days'
          AND search_vector @@ websearch_to_tsquery('english', ${q})
          ${roleFilter}
          ${cityFilter}
      `,
      prisma.$queryRaw<{
        id: string;
        source: string;
        source_id: string;
        url: string;
        canonical_url: string;
        title: string;
        company: string;
        location_raw: string;
        description: string;
        posted_at: Date | string | null;
        first_seen_at: Date | string;
        last_seen_at: Date | string;
        role_tag: string | null;
        city_tag: string | null;
        is_fresher: boolean;
        tag_confidence: number | null;
      }[]>`
        SELECT
          id, source, source_id, url, canonical_url, title, company,
          location_raw, description, posted_at, first_seen_at, last_seen_at,
          role_tag, city_tag, is_fresher, tag_confidence,
          ts_rank(search_vector, websearch_to_tsquery('english', ${q})) as rank
        FROM posts
        WHERE is_duplicate_of IS NULL
          AND last_seen_at >= NOW() - INTERVAL '7 days'
          AND search_vector @@ websearch_to_tsquery('english', ${q})
          ${roleFilter}
          ${cityFilter}
        ORDER BY rank DESC, first_seen_at DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      prisma.run.findFirst({
        where: { status: { in: ["success", "partial"] } },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, status: true },
      }),
    ]);

    totalJobs = countResult[0]?.total ?? 0;
    posts = searchResults.map((r) => ({
      id: r.id,
      source: r.source,
      sourceId: r.source_id,
      url: r.url,
      canonicalUrl: r.canonical_url,
      title: r.title,
      company: r.company,
      locationRaw: r.location_raw,
      description: r.description,
      postedAt: r.posted_at instanceof Date ? r.posted_at.toISOString() : (r.posted_at ?? null),
      firstSeenAt: r.first_seen_at instanceof Date ? r.first_seen_at.toISOString() : String(r.first_seen_at),
      lastSeenAt: r.last_seen_at instanceof Date ? r.last_seen_at.toISOString() : String(r.last_seen_at),
      roleTag: r.role_tag,
      cityTag: r.city_tag,
      isFresher: r.is_fresher,
      tagConfidence: r.tag_confidence,
    }));

    return {
      posts,
      totalJobs,
      totalPages: Math.max(1, Math.ceil(totalJobs / pageSize)),
      page,
      pageSize,
      latestRun: run
        ? {
            startedAt: run.startedAt.toISOString(),
            status: run.status,
          }
        : undefined,
      error: null,
    };
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || "Failed to query database via Prisma";
    console.error("[Prisma Jobs Query Error]:", errorMsg);
    return {
      posts: [],
      totalJobs: 0,
      totalPages: 1,
      page,
      pageSize,
      error: errorMsg,
    };
  }
}
