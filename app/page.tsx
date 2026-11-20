import Link from "next/link";
import { client } from "@/lib/db";
import { Search, RotateCcw } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { SearchFilters } from "@/components/SearchFilters";
import { JobCard, type JobPostItem } from "@/components/JobCard";
import { Pagination } from "@/components/Pagination";
import { Footer } from "@/components/Footer";

// Server-side rendering - force dynamic since searchParams change per request
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    q?: string;
    role?: string;
    city?: string;
    page?: string;
  };
}

interface LatestRunInfo {
  startedAt: string;
  status: string;
}

export default async function Page({ searchParams }: PageProps) {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const role = typeof searchParams.role === "string" ? searchParams.role.trim() : "";
  const city = typeof searchParams.city === "string" ? searchParams.city.trim() : "";
  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
  const pageSize = 15;
  const offset = (page - 1) * pageSize;

  let totalJobs = 0;
  let totalPages = 1;
  let posts: JobPostItem[] = [];
  let latestRun: LatestRunInfo | undefined;
  let dbError: string | null = null;

  try {
    // 1. Fetch total count matching query & filters (excluding duplicates and stale posts)
    const countQuery = await client`
      SELECT COUNT(*)::int as total
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
        ${q ? client`AND search_vector @@ websearch_to_tsquery('english', ${q})` : client``}
        ${role && role !== "all" ? client`AND role_tag = ${role}` : client``}
        ${city && city !== "all" ? client`AND city_tag = ${city}` : client``}
    `;
    totalJobs = countQuery[0]?.total ?? 0;
    totalPages = Math.max(1, Math.ceil(totalJobs / pageSize));

    // 2. Fetch paginated job posts
    posts = (await client`
      SELECT
        id, source, source_id, url, canonical_url, title, company,
        location_raw, description, posted_at, first_seen_at, last_seen_at,
        role_tag, city_tag, is_fresher, tag_confidence
        ${q ? client`, ts_rank(search_vector, websearch_to_tsquery('english', ${q})) as rank` : client``}
      FROM posts
      WHERE is_duplicate_of IS NULL
        AND last_seen_at >= NOW() - INTERVAL '7 days'
        ${q ? client`AND search_vector @@ websearch_to_tsquery('english', ${q})` : client``}
        ${role && role !== "all" ? client`AND role_tag = ${role}` : client``}
        ${city && city !== "all" ? client`AND city_tag = ${city}` : client``}
      ORDER BY
        ${q ? client`rank DESC, first_seen_at DESC` : client`COALESCE(posted_at, first_seen_at) DESC`}
      LIMIT ${pageSize} OFFSET ${offset}
    `) as unknown as JobPostItem[];

    // 3. Fetch latest pipeline run information
    const [run] = (await client`
      SELECT started_at, status
      FROM runs
      WHERE status IN ('success', 'partial')
      ORDER BY started_at DESC
      LIMIT 1
    `) as unknown as [LatestRunInfo | undefined];
    latestRun = run;
  } catch (err: unknown) {
    dbError = (err as Error)?.message || "Failed to connect to database";
    console.error("[Web UI] Database error during page render:", dbError);
  }

  const hasActiveFilters = Boolean(q || (role && role !== "all") || (city && city !== "all"));
  const startPostIndex = totalJobs === 0 ? 0 : offset + 1;
  const endPostIndex = Math.min(offset + pageSize, totalJobs);

  return (
    <div className="min-h-screen bg-[#FBF8F2] text-[#1C1917] flex flex-col font-sans selection:bg-[#1E4D2B] selection:text-white">
      {/* 1. Navbar */}
      <Navbar latestRun={latestRun} />

      {/* 2. Hero Section */}
      <Hero totalJobs={totalJobs} />

      {/* 3. Main Content & Search */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Database Diagnostic Notice */}
        {dbError && (
          <div className="mb-6 bg-[#FEF3C7] border-2 border-[#1C1917] rounded-none p-5 text-[#78350F] text-sm font-bold shadow-[4px_4px_0px_#1C1917]">
            <p className="text-base font-black">⚠️ Database Connection Required</p>
            <p className="mt-1 text-xs sm:text-sm font-semibold">
              Unable to reach the PostgreSQL container on port 5436 ({dbError}). Please start it by running:
            </p>
            <pre className="mt-2 inline-block bg-white border-2 border-[#1C1917] px-3 py-1.5 font-mono text-xs font-black text-[#1C1917] shadow-[2px_2px_0px_#1C1917]">
              docker compose up -d db
            </pre>
          </div>
        )}

        {/* Search & Filter Controls */}
        <SearchFilters q={q} role={role} city={city} />

        {/* Results Count Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 px-1">
          <p className="text-sm font-bold text-[#463E33]">
            Showing <span className="font-black text-[#1C1917]">{startPostIndex}</span> to{" "}
            <span className="font-black text-[#1C1917]">{endPostIndex}</span> of{" "}
            <span className="font-black text-[#1E4D2B]">{totalJobs}</span> fresher opportunities
          </p>
          <div className="text-xs font-bold text-[#5A5144]">
            Page <span className="font-black text-[#1C1917]">{page}</span> of {totalPages}
          </div>
        </div>

        {/* Job Listings Feed */}
        {posts.length === 0 ? (
          <div className="bg-[#FAF6EE] rounded-none border-2 border-[#1C1917] p-12 text-center shadow-[6px_6px_0px_#1C1917]">
            <div className="w-16 h-16 bg-[#D1E7DD] text-[#0F5132] border-2 border-[#1C1917] rounded-none flex items-center justify-center mx-auto mb-4 shadow-[3px_3px_0px_#1C1917]">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-black text-[#1C1917]">No matching jobs found</h3>
            <p className="mt-2 text-sm text-[#5A5144] max-w-md mx-auto font-semibold">
              We couldn&apos;t find any active listings matching your current search criteria. Try broadening your keywords
              or resetting role/city filters.
            </p>
            {hasActiveFilters && (
              <div className="mt-6">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E4D2B] text-white rounded-none text-sm font-black border-2 border-[#1C1917] shadow-[3px_3px_0px_#1C1917] hover:bg-[#163820] transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Clear all filters
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <JobCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        <Pagination page={page} totalPages={totalPages} q={q} role={role} city={city} />
      </main>

      {/* 4. Footer */}
      <Footer />
    </div>
  );
}
