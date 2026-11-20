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
  Compass,
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
 * Modern Retro color classes for role badges
 */
function getRoleBadgeClasses(role: string | null): string {
  switch (role) {
    case "Software Engineering":
      return "bg-[#E8F2EA] text-[#1E4D2B] border-[#BED6C3]";
    case "Data/ML":
      return "bg-[#EDE9FE] text-[#5B21B6] border-[#DDD6FE]";
    case "Design":
      return "bg-[#FDF0EC] text-[#9E3E22] border-[#F4CCC1]";
    case "Marketing":
      return "bg-[#FEF7D6] text-[#78590A] border-[#ECD788]";
    case "Sales":
      return "bg-[#E2F7EB] text-[#136A3C] border-[#B7E8C8]";
    case "Operations":
      return "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]";
    case "Finance":
      return "bg-[#F3F4D8] text-[#4D5A12] border-[#D6DB9A]";
    case "Content":
      return "bg-[#FFEDD5] text-[#9A3412] border-[#FED7AA]";
    case "HR":
      return "bg-[#FFE4E6] text-[#9F1239] border-[#FECDD3]";
    default:
      return "bg-[#F2ECE1] text-[#554C40] border-[#DDD3C2]";
  }
}

/**
 * Modern Retro color classes for city badges
 */
function getCityBadgeClasses(city: string | null): string {
  if (city === "Remote") {
    return "bg-[#EBF7F0] text-[#1E5D34] border-[#BDDFCA]";
  }
  return "bg-[#FAF3E8] text-[#524434] border-[#E2D5C3]";
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
    <div className="min-h-screen bg-[#FBF8F2] text-[#24211D] flex flex-col font-sans selection:bg-[#1E4D2B] selection:text-white">
      {/* Retro Navigation Header */}
      <header className="border-b border-[#E3DACB] bg-[#F7F2E7]/95 backdrop-blur-sm sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="w-9 h-9 rounded-2xl bg-[#1E4D2B] text-[#FDFBF7] font-black text-xl flex items-center justify-center shadow-[2px_2px_0px_#0B2F1B] group-hover:scale-105 transition-transform">
                B
              </span>
              <div>
                <span className="text-2xl font-black tracking-tight text-[#1C1917] group-hover:text-[#1E4D2B] transition-colors">
                  Beep
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E4D2B] ml-2 px-2 py-0.5 rounded-full bg-[#E8F2EA] border border-[#BED6C3]">
                  Freshers
                </span>
              </div>
            </Link>
            <span className="hidden sm:inline-block text-[#D1C7B7]">|</span>
            <span className="hidden sm:inline-block text-xs font-semibold text-[#665D4F]">
              Early Career &amp; Internships • India
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs self-end sm:self-center font-medium">
            <div className="flex items-center gap-1.5 bg-[#E8F2EA] text-[#1E4D2B] px-3 py-1 rounded-full border border-[#BED6C3] font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-pulse" />
              <span>Live Ingest</span>
            </div>
            {latestRun && (
              <div className="flex items-center gap-1.5 text-[#665D4F] bg-[#EFE9DC] px-2.5 py-1 rounded-full border border-[#DDD3C2]">
                <Clock className="w-3.5 h-3.5 text-[#1E4D2B]" />
                <span>Updated {formatRelativeRunTime(latestRun.startedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-[#FAF6EE] border-b border-[#E3DACB] relative overflow-hidden">
        {/* Subtle retro backdrop accents */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 rounded-full bg-[#E8F2EA]/40 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-48 h-48 rounded-full bg-[#FEF7D6]/30 blur-2xl pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-9 pb-8 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F2EA] text-[#1E4D2B] border border-[#BED6C3] text-xs font-bold uppercase tracking-wider mb-3">
              <Compass className="w-3.5 h-3.5" />
              Direct Public ATS Postings Only
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-[#1C1917] tracking-tight leading-[1.15]">
              Curated Fresher &amp; Internship Jobs in India
            </h1>
            <p className="mt-3 text-base sm:text-lg text-[#5A5144] leading-relaxed font-medium">
              Handcrafted 0–1 year and internship listings fetched daily from verified public ATS boards (Greenhouse, Lever, Ashby).
              Deduplicated with pg_trgm &amp; LLM-tagged.
            </p>
          </div>

          {/* Retro Highlight Pills Bar */}
          <div className="mt-7 flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-[#463E33]">
            <div className="flex items-center gap-2 bg-[#FFFDF9] border border-[#DDD3C2] px-3.5 py-1.5 rounded-2xl shadow-xs font-bold text-[#1C1917]">
              <Briefcase className="w-4 h-4 text-[#1E4D2B]" />
              <span>{totalJobs} Active Openings</span>
            </div>
            <div className="flex items-center gap-2 bg-[#FFFDF9] border border-[#DDD3C2] px-3.5 py-1.5 rounded-2xl shadow-xs font-semibold">
              <Layers className="w-4 h-4 text-[#2D6A4F]" />
              <span>Deduplicated in Layers</span>
            </div>
            <div className="flex items-center gap-2 bg-[#FFFDF9] border border-[#DDD3C2] px-3.5 py-1.5 rounded-2xl shadow-xs font-semibold">
              <Sparkles className="w-4 h-4 text-[#B45309]" />
              <span>LLM Tagged (Role &amp; City)</span>
            </div>
            <div className="flex items-center gap-2 bg-[#FFFDF9] border border-[#DDD3C2] px-3.5 py-1.5 rounded-2xl shadow-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-[#1E4D2B]" />
              <span>Active within 7 days</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Retro Search & Filter Bar */}
        <div className="bg-[#FAF6EE] rounded-3xl border border-[#DFD6C6] p-4 sm:p-6 mb-7 shadow-xs">
          <form method="GET" action="/" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Search Query Input */}
              <div className="md:col-span-5 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C8070]" />
                <input
                  type="text"
                  name="q"
                  defaultValue={q}
                  placeholder="Search keywords, skills, roles... (e.g. Backend, React, Intern)"
                  className="w-full pl-11 pr-4 py-3 bg-[#FFFDF9] border border-[#D5CBBA] rounded-2xl text-sm font-medium text-[#24211D] placeholder:text-[#998D7C] focus:outline-none focus:border-[#1E4D2B] focus:ring-2 focus:ring-[#1E4D2B]/20 transition-all shadow-xs"
                />
              </div>

              {/* Role Filter Dropdown */}
              <div className="md:col-span-3">
                <select
                  name="role"
                  defaultValue={role || "all"}
                  className="w-full px-4 py-3 bg-[#FFFDF9] border border-[#D5CBBA] rounded-2xl text-sm font-medium text-[#24211D] focus:outline-none focus:border-[#1E4D2B] focus:ring-2 focus:ring-[#1E4D2B]/20 transition-all cursor-pointer shadow-xs"
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
                  className="w-full px-4 py-3 bg-[#FFFDF9] border border-[#D5CBBA] rounded-2xl text-sm font-medium text-[#24211D] focus:outline-none focus:border-[#1E4D2B] focus:ring-2 focus:ring-[#1E4D2B]/20 transition-all cursor-pointer shadow-xs"
                >
                  <option value="all">All Locations (Any)</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Green Action Button */}
              <div className="md:col-span-1 flex items-stretch">
                <button
                  type="submit"
                  className="w-full bg-[#1E4D2B] hover:bg-[#163820] text-[#FDFBF7] font-bold px-4 py-3 rounded-2xl text-sm transition-all shadow-[2px_2px_0px_#0B2F1B] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_#0B2F1B] flex items-center justify-center gap-1.5"
                >
                  <Search className="w-4 h-4" />
                  <span className="md:hidden">Search</span>
                </button>
              </div>
            </div>

            {/* Active Filters & Reset Link */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E8E0D2] text-xs text-[#665D4F]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#1C1917]">Active Filters:</span>
                  {q && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FFFDF9] text-[#24211D] border border-[#D5CBBA] font-semibold">
                      Query: &ldquo;{q}&rdquo;
                    </span>
                  )}
                  {role && role !== "all" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#E8F2EA] text-[#1E4D2B] border border-[#BED6C3] font-bold">
                      Role: {role}
                    </span>
                  )}
                  {city && city !== "all" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FAF3E8] text-[#524434] border border-[#E2D5C3] font-bold">
                      City: {city}
                    </span>
                  )}
                </div>

                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-[#1E4D2B] hover:text-[#163820] font-bold hover:underline transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset all filters
                </Link>
              </div>
            )}
          </form>
        </div>

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 px-1">
          <p className="text-sm font-semibold text-[#5A5144]">
            Showing <span className="font-black text-[#1C1917]">{startPostIndex}</span> to{" "}
            <span className="font-black text-[#1C1917]">{endPostIndex}</span> of{" "}
            <span className="font-black text-[#1E4D2B]">{totalJobs}</span> fresher opportunities
          </p>
          <div className="text-xs font-semibold text-[#786E60]">
            Page <span className="font-black text-[#1C1917]">{page}</span> of {totalPages}
          </div>
        </div>

        {/* Job Listings Feed */}
        {posts.length === 0 ? (
          /* Empty State */
          <div className="bg-[#FAF6EE] rounded-3xl border border-[#DFD6C6] p-12 text-center shadow-xs">
            <div className="w-16 h-16 bg-[#E8F2EA] text-[#1E4D2B] border border-[#BED6C3] rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-[2px_2px_0px_#BED6C3]">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-[#1C1917]">No matching jobs found</h3>
            <p className="mt-2 text-sm text-[#665D4F] max-w-md mx-auto font-medium">
              We couldn&apos;t find any active listings matching your current search criteria. Try broadening your keywords
              or resetting role/city filters.
            </p>
            {hasActiveFilters && (
              <div className="mt-6">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E4D2B] text-white rounded-2xl text-sm font-bold hover:bg-[#163820] transition-all shadow-[2px_2px_0px_#0B2F1B]"
                >
                  <RotateCcw className="w-4 h-4" />
                  Clear all filters
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const roleBadge = post.roleTag || "Early Career";
              const cityBadge = post.cityTag || post.locationRaw || "India";

              return (
                <div
                  key={post.id}
                  className="bg-[#FFFDF9] rounded-3xl border border-[#E5DEC9] p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-[#1E4D2B]/50 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4 group"
                >
                  <div className="flex-1 min-w-0">
                    {/* Top Meta Line: Company & Source */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <div className="flex items-center gap-1.5 font-black text-[#1C1917] text-sm">
                        <Building2 className="w-4 h-4 text-[#8C8070] group-hover:text-[#1E4D2B] transition-colors" />
                        <span>{post.company}</span>
                      </div>
                      <span className="text-[#CFC4B3]">•</span>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg font-mono font-bold uppercase tracking-wider bg-[#F2ECE1] text-[#554C40] border border-[#DDD3C2]">
                        {post.source}
                      </span>
                      {post.isFresher && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-[#FEF7D6] text-[#78590A] border border-[#ECD788]">
                          <Sparkles className="w-3 h-3 text-[#B45309]" />
                          Fresher Friendly
                        </span>
                      )}
                    </div>

                    {/* Job Title */}
                    <h2 className="text-base sm:text-xl font-black text-[#1C1917] group-hover:text-[#1E4D2B] transition-colors leading-snug">
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {post.title}
                      </a>
                    </h2>

                    {/* Location, Role & Date Badges */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* Role Tag */}
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl border ${getRoleBadgeClasses(
                          post.roleTag
                        )}`}
                      >
                        <Briefcase className="w-3 h-3" />
                        {roleBadge}
                      </span>

                      {/* City Tag */}
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl border ${getCityBadgeClasses(
                          post.cityTag
                        )}`}
                      >
                        <MapPin className="w-3 h-3" />
                        {cityBadge}
                      </span>

                      {/* Posted Relative Date */}
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#786E60] ml-1">
                        <Calendar className="w-3.5 h-3.5 text-[#8C8070]" />
                        {formatJobDate(post.postedAt || post.firstSeenAt)}
                      </span>
                    </div>

                    {/* Description Snippet */}
                    {post.description && (
                      <p className="mt-3 text-xs sm:text-sm text-[#5A5144] line-clamp-2 leading-relaxed font-normal">
                        {post.description.slice(0, 240)}...
                      </p>
                    )}
                  </div>

                  {/* Retro Green Apply Button */}
                  <div className="sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E8E0D2] flex items-center">
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1E4D2B] hover:bg-[#163820] text-white font-bold text-xs sm:text-sm rounded-2xl shadow-[2px_2px_0px_#0B2F1B] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_#0B2F1B] transition-all group/btn w-full sm:w-auto"
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

        {/* Retro Pagination Bar */}
        {totalPages > 1 && (
          <div className="mt-9 pt-5 border-t border-[#E3DACB] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs font-bold text-[#665D4F]">
              Showing page <span className="font-black text-[#1C1917]">{page}</span> of {totalPages}
            </div>

            <div className="flex items-center gap-2.5">
              {/* Previous Page Link */}
              {page > 1 ? (
                <Link
                  href={buildSearchUrl({ q, role, city }, page - 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-[#D5CBBA] bg-[#FFFDF9] text-xs font-bold text-[#1E4D2B] hover:bg-[#E8F2EA] transition-all shadow-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-[#E5DEC9] bg-[#F2ECE1] text-xs font-bold text-[#A89D8E] cursor-not-allowed">
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </span>
              )}

              {/* Page Numbers Indicator */}
              <div className="flex items-center gap-1.5 px-2 text-xs font-bold text-[#665D4F]">
                <span className="px-3 py-1.5 rounded-xl bg-[#1E4D2B] text-white font-black shadow-xs">
                  {page}
                </span>
                <span>/</span>
                <span className="font-bold">{totalPages}</span>
              </div>

              {/* Next Page Link */}
              {page < totalPages ? (
                <Link
                  href={buildSearchUrl({ q, role, city }, page + 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-[#D5CBBA] bg-[#FFFDF9] text-xs font-bold text-[#1E4D2B] hover:bg-[#E8F2EA] transition-all shadow-xs"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-[#E5DEC9] bg-[#F2ECE1] text-xs font-bold text-[#A89D8E] cursor-not-allowed">
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Retro Footer */}
      <footer className="border-t border-[#E3DACB] bg-[#F7F2E7] py-6 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-medium text-[#786E60]">
          <div>
            Built with Next.js, Tailwind CSS, PostgreSQL &amp; Groq LLM for Beep.
          </div>
          <div className="flex items-center gap-4">
            <span className="font-bold text-[#1E4D2B]">Direct Public ATS Feeds</span>
            <span>•</span>
            <span>Zero Recruiter Scraping</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
