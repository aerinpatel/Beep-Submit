import Link from "next/link";
import { client } from "@/lib/db";
import { ROLES, CITIES } from "@/lib/config";
import {
  Search,
  MapPin,
  Briefcase,
  Building2,
  ExternalLink,
  Calendar,
  Sparkles,
  Clock,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Layers,
} from "lucide-react";

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

interface JobPost {
  id: string;
  source: string;
  sourceId: string;
  url: string;
  canonicalUrl: string;
  title: string;
  company: string;
  locationRaw: string;
  description: string;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  roleTag: string | null;
  cityTag: string | null;
  isFresher: boolean;
  tagConfidence: number | null;
}

interface LatestRunInfo {
  startedAt: string;
  status: string;
}

/**
 * Format date into clean relative or absolute readable string
 */
function formatJobDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Recently";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Recently";

  const now = new Date();
  const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function formatRelativeRunTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Today";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Recently";

  return d.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Color classes for role badges
 */
function getRoleBadgeClasses(role: string | null): string {
  switch (role) {
    case "Software Engineering":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Data/ML":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "Design":
      return "bg-pink-50 text-pink-700 border-pink-200";
    case "Marketing":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Sales":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Operations":
      return "bg-cyan-50 text-cyan-700 border-cyan-200";
    case "Finance":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "Content":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "HR":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

/**
 * Color classes for city badges
 */
function getCityBadgeClasses(city: string | null): string {
  if (city === "Remote") {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

/**
 * Helper to construct search URL while preserving active params
 */
function buildSearchUrl(baseParams: { q?: string; role?: string; city?: string }, targetPage: number): string {
  const params = new URLSearchParams();
  if (baseParams.q) params.set("q", baseParams.q);
  if (baseParams.role && baseParams.role !== "all") params.set("role", baseParams.role);
  if (baseParams.city && baseParams.city !== "all") params.set("city", baseParams.city);
  if (targetPage > 1) params.set("page", targetPage.toString());

  const str = params.toString();
  return str ? `/?${str}` : "/";
}

export default async function Page({ searchParams }: PageProps) {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const role = typeof searchParams.role === "string" ? searchParams.role.trim() : "";
  const city = typeof searchParams.city === "string" ? searchParams.city.trim() : "";
  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);
  const pageSize = 15;
  const offset = (page - 1) * pageSize;

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
  const totalJobs = countQuery[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalJobs / pageSize));

  // 2. Fetch paginated job posts
  const posts = (await client`
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
  `) as unknown as JobPost[];

  // 3. Fetch latest pipeline run information
  const [latestRun] = (await client`
    SELECT started_at, status
    FROM runs
    WHERE status IN ('success', 'partial')
    ORDER BY started_at DESC
    LIMIT 1
  `) as unknown as [LatestRunInfo | undefined];

  // 4. Determine if any filters are active
  const hasActiveFilters = Boolean(q || (role && role !== "all") || (city && city !== "all"));

  const startPostIndex = totalJobs === 0 ? 0 : offset + 1;
  const endPostIndex = Math.min(offset + pageSize, totalJobs);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-xs group-hover:bg-indigo-700 transition-colors">
                B
              </span>
              <div>
                <span className="text-xl font-extrabold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Beep
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 ml-1.5 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100">
                  Freshers
                </span>
              </div>
            </Link>
            <span className="hidden sm:inline-block text-slate-300">|</span>
            <span className="hidden sm:inline-block text-xs font-medium text-slate-500">
              India Early Career &amp; Internships
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 self-end sm:self-center">
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Sync</span>
            </div>
            {latestRun && (
              <div className="flex items-center gap-1 text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Updated {formatRelativeRunTime(latestRun.startedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero & Highlights */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-7">
          <div className="max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Curated Fresher &amp; Internship Jobs in India
            </h1>
            <p className="mt-2 text-base sm:text-lg text-slate-600 leading-relaxed">
              Real 0-1 year &amp; internship roles fetched daily from verified public ATS boards (Greenhouse, Lever, Ashby).
              Filtered, deduplicated, and LLM-tagged.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs sm:text-sm text-slate-600 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              <span>{totalJobs} Active Openings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Deduplicated in Layers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>LLM Tagged (Role &amp; City)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>Seen within last 7 days</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Search & Filter Bar */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 sm:p-5 mb-6">
          <form method="GET" action="/" className="space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Search Query Input */}
              <div className="md:col-span-5 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Search by title, skills, keywords... (e.g. Backend, React, Intern)"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Role Filter Dropdown */}
              <div className="md:col-span-3">
                <select
                  name="role"
                  defaultValue={role || "all"}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="all">All Roles (Any)</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* City Filter Dropdown */}
              <div className="md:col-span-3">
                <select
                  name="city"
                  defaultValue={city || "all"}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="all">All Locations (Any)</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Submit Button */}
              <div className="md:col-span-1 flex items-stretch">
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Search className="w-4 h-4" />
                  <span className="md:hidden">Search</span>
                </button>
              </div>
            </div>

            {/* Active Filters & Reset Link */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-700">Filters:</span>
                  {q && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 font-medium">
                      Query: &ldquo;{q}&rdquo;
                    </span>
                  )}
                  {role && role !== "all" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                      Role: {role}
                    </span>
                  )}
                  {city && city !== "all" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                      City: {city}
                    </span>
                  )}
                </div>

                <Link
                  href="/"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset all filters
                </Link>
              </div>
            )}
          </form>
        </div>

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-slate-900">{startPostIndex}</span> to{" "}
            <span className="font-semibold text-slate-900">{endPostIndex}</span> of{" "}
            <span className="font-semibold text-slate-900">{totalJobs}</span> fresher opportunities
          </p>
          <div className="text-xs text-slate-500">
            Page <span className="font-medium text-slate-800">{page}</span> of {totalPages}
          </div>
        </div>

        {/* Job Listings Feed */}
        {posts.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No matching jobs found</h3>
            <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
              We couldn&apos;t find any active listings matching your current search criteria. Try broadening your keywords
              or resetting your filters.
            </p>
            {hasActiveFilters && (
              <div className="mt-5">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  <RotateCcw className="w-4 h-4" />
                  Clear all filters
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {posts.map((post) => {
              const roleBadge = post.roleTag || "Early Career";
              const cityBadge = post.cityTag || post.locationRaw || "India";

              return (
                <div
                  key={post.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4 group"
                >
                  <div className="flex-1 min-w-0">
                    {/* Top Meta Line: Company & Badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                        <Building2 className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                        <span>{post.company}</span>
                      </div>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs px-2 py-0.5 rounded font-mono font-medium uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {post.source}
                      </span>
                      {post.isFresher && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          Fresher Friendly
                        </span>
                      )}
                    </div>

                    {/* Job Title */}
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {post.title}
                      </a>
                    </h2>

                    {/* Location & Role Badges */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {/* Role Tag */}
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md border ${getRoleBadgeClasses(
                          post.roleTag
                        )}`}
                      >
                        <Briefcase className="w-3 h-3" />
                        {roleBadge}
                      </span>

                      {/* City Tag */}
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md border ${getCityBadgeClasses(
                          post.cityTag
                        )}`}
                      >
                        <MapPin className="w-3 h-3" />
                        {cityBadge}
                      </span>

                      {/* Posted Relative Date */}
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 ml-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatJobDate(post.postedAt || post.firstSeenAt)}
                      </span>
                    </div>

                    {/* Description Snippet */}
                    {post.description && (
                      <p className="mt-3 text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">
                        {post.description.slice(0, 240)}...
                      </p>
                    )}
                  </div>

                  {/* Apply CTA Button */}
                  <div className="sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex items-center">
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-semibold text-xs sm:text-sm rounded-lg border border-indigo-200 hover:border-transparent transition-all shadow-xs group/btn w-full sm:w-auto"
                    >
                      <span>Apply Now</span>
                      <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500">
              Showing page <span className="font-semibold text-slate-800">{page}</span> of {totalPages}
            </div>

            <div className="flex items-center gap-2">
              {/* Previous Page Link */}
              {page > 1 ? (
                <Link
                  href={buildSearchUrl({ q, role, city }, page - 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-400 cursor-not-allowed">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </span>
              )}

              {/* Page Numbers Indicator */}
              <div className="flex items-center gap-1 px-2 text-xs font-medium text-slate-600">
                <span className="px-2.5 py-1 rounded-md bg-indigo-600 text-white font-bold">{page}</span>
                <span>/</span>
                <span>{totalPages}</span>
              </div>

              {/* Next Page Link */}
              {page < totalPages ? (
                <Link
                  href={buildSearchUrl({ q, role, city }, page + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-400 cursor-not-allowed">
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Built with Next.js, Tailwind CSS, PostgreSQL (Drizzle ORM) &amp; Groq LLM for Beep.
          </div>
          <div className="flex items-center gap-4">
            <span>Direct Public ATS Feeds</span>
            <span>•</span>
            <span>Zero Recruiter Scraping</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
