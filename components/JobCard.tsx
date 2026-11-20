import { Building2, Sparkles, Briefcase, MapPin, Calendar, ExternalLink } from "lucide-react";

export interface JobPostItem {
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

function getRoleBadgeClasses(role: string | null): string {
  switch (role) {
    case "Software Engineering":
      return "bg-[#D1E7DD] text-[#0F5132] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "Data/ML":
      return "bg-[#E0CFFC] text-[#432874] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "Design":
      return "bg-[#F8D7DA] text-[#842029] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "Marketing":
      return "bg-[#FFF3CD] text-[#664D03] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "Sales":
      return "bg-[#D1E7DD] text-[#0A3622] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "Operations":
      return "bg-[#CFF4FC] text-[#055160] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "Finance":
      return "bg-[#E2F0D9] text-[#385723] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "Content":
      return "bg-[#FFE5D0] text-[#8A3B00] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    case "HR":
      return "bg-[#FCE2E6] text-[#7A1C2C] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
    default:
      return "bg-[#E9ECEF] text-[#495057] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
  }
}

function getCityBadgeClasses(city: string | null): string {
  if (city === "Remote") {
    return "bg-[#D1E7DD] text-[#0F5132] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
  }
  return "bg-[#FFF3CD] text-[#594200] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]";
}

interface JobCardProps {
  post: JobPostItem;
}

export function JobCard({ post }: JobCardProps) {
  const roleBadge = post.roleTag || "Early Career";
  const cityBadge = post.cityTag || post.locationRaw || "India";

  return (
    <div className="bg-[#FFFDF9] rounded-none border-2 border-[#1C1917] p-5 sm:p-6 shadow-[5px_5px_0px_#1C1917] hover:shadow-[7px_7px_0px_#1C1917] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-4 group">
      <div className="flex-1 min-w-0">
        {/* Top Meta Line: Company & Source */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 font-black text-[#1C1917] text-sm">
            <Building2 className="w-4 h-4 text-[#1E4D2B]" />
            <span>{post.company}</span>
          </div>
          <span className="text-[#1C1917] font-black">•</span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-none font-mono font-black uppercase tracking-wider bg-[#E9ECEF] text-[#1C1917] border-2 border-[#1C1917]">
            {post.source}
          </span>
          {post.isFresher && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-none font-black uppercase bg-[#FFF3CD] text-[#664D03] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]">
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
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {/* Role Tag */}
          <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-none ${getRoleBadgeClasses(post.roleTag)}`}>
            <Briefcase className="w-3.5 h-3.5" />
            {roleBadge}
          </span>

          {/* City Tag */}
          <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-none ${getCityBadgeClasses(post.cityTag)}`}>
            <MapPin className="w-3.5 h-3.5" />
            {cityBadge}
          </span>

          {/* Posted Relative Date */}
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#5A5144] ml-1 bg-[#EFE9DC] px-2 py-0.5 border border-[#1C1917] rounded-none">
            <Calendar className="w-3.5 h-3.5 text-[#1C1917]" />
            {formatJobDate(post.postedAt || post.firstSeenAt)}
          </span>
        </div>

        {/* Description Snippet */}
        {post.description && (
          <p className="mt-3 text-xs sm:text-sm text-[#463E33] line-clamp-2 leading-relaxed font-medium">
            {post.description.slice(0, 240)}...
          </p>
        )}
      </div>

      {/* Sharp Retro Green Apply Button */}
      <div className="sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1C1917] flex items-center">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1E4D2B] hover:bg-[#163820] text-white font-black text-xs sm:text-sm rounded-none border-2 border-[#1C1917] shadow-[3px_3px_0px_#1C1917] hover:shadow-[4px_4px_0px_#1C1917] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#1C1917] transition-all group/btn w-full sm:w-auto"
        >
          <span>APPLY NOW</span>
          <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
        </a>
      </div>
    </div>
  );
}
