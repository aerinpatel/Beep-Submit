import { Briefcase, Layers, Sparkles, CheckCircle2, Compass } from "lucide-react";

interface HeroProps {
  totalJobs: number;
}

export function Hero({ totalJobs }: HeroProps) {
  return (
    <section className="bg-[#FAF6EE] border-b-2 border-[#1C1917] relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-9 pb-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none bg-[#D1E7DD] text-[#0F5132] border-2 border-[#1C1917] text-xs font-black uppercase tracking-wider mb-4 shadow-[2px_2px_0px_#1C1917]">
            <Compass className="w-3.5 h-3.5" />
            Direct Public ATS Postings Only
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-[#1C1917] tracking-tight leading-[1.12]">
            Curated Fresher &amp; Internship Jobs in India
          </h1>
          <p className="mt-3 text-base sm:text-lg text-[#463E33] leading-relaxed font-semibold">
            Real 0–1 year and internship listings fetched daily from verified public ATS boards (Greenhouse, Lever, Ashby).
            Deduplicated in layers with pg_trgm and LLM-tagged.
          </p>
        </div>

        {/* Sharp Highlight Pills Bar */}
        <div className="mt-7 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-[#1C1917]">
          <div className="flex items-center gap-2 bg-[#FFFDF9] border-2 border-[#1C1917] px-3.5 py-1.5 rounded-none shadow-[3px_3px_0px_#1C1917] font-black">
            <Briefcase className="w-4 h-4 text-[#1E4D2B]" />
            <span>{totalJobs} Active Openings</span>
          </div>
          <div className="flex items-center gap-2 bg-[#FFFDF9] border-2 border-[#1C1917] px-3.5 py-1.5 rounded-none shadow-[3px_3px_0px_#1C1917] font-black">
            <Layers className="w-4 h-4 text-[#1E4D2B]" />
            <span>Deduplicated in Layers</span>
          </div>
          <div className="flex items-center gap-2 bg-[#FFFDF9] border-2 border-[#1C1917] px-3.5 py-1.5 rounded-none shadow-[3px_3px_0px_#1C1917] font-black">
            <Sparkles className="w-4 h-4 text-[#B45309]" />
            <span>LLM Tagged (Role &amp; City)</span>
          </div>
          <div className="flex items-center gap-2 bg-[#FFFDF9] border-2 border-[#1C1917] px-3.5 py-1.5 rounded-none shadow-[3px_3px_0px_#1C1917] font-black">
            <CheckCircle2 className="w-4 h-4 text-[#1E4D2B]" />
            <span>Active within 7 days</span>
          </div>
        </div>
      </div>
    </section>
  );
}
