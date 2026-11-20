import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  q: string;
  role: string;
  city: string;
}

function buildSearchUrl(baseParams: { q?: string; role?: string; city?: string }, targetPage: number): string {
  const params = new URLSearchParams();
  if (baseParams.q) params.set("q", baseParams.q);
  if (baseParams.role && baseParams.role !== "all") params.set("role", baseParams.role);
  if (baseParams.city && baseParams.city !== "all") params.set("city", baseParams.city);
  if (targetPage > 1) params.set("page", targetPage.toString());

  const str = params.toString();
  return str ? `/?${str}` : "/";
}

export function Pagination({ page, totalPages, q, role, city }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-9 pt-5 border-t-2 border-[#1C1917] flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="text-xs font-black text-[#463E33]">
        SHOWING PAGE <span className="text-[#1C1917]">{page}</span> OF {totalPages}
      </div>

      <div className="flex items-center gap-3">
        {/* Previous Page Link */}
        {page > 1 ? (
          <Link
            href={buildSearchUrl({ q, role, city }, page - 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-none border-2 border-[#1C1917] bg-[#FFFDF9] text-xs font-black text-[#1C1917] shadow-[3px_3px_0px_#1C1917] hover:bg-[#D1E7DD] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            PREVIOUS
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-none border-2 border-[#8C8070] bg-[#E9ECEF] text-xs font-black text-[#8C8070] cursor-not-allowed">
            <ChevronLeft className="w-3.5 h-3.5" />
            PREVIOUS
          </span>
        )}

        {/* Page Numbers Indicator */}
        <div className="flex items-center gap-1.5 text-xs font-black text-[#1C1917]">
          <span className="px-3.5 py-1.5 rounded-none bg-[#1E4D2B] text-white border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]">
            {page}
          </span>
          <span>/</span>
          <span>{totalPages}</span>
        </div>

        {/* Next Page Link */}
        {page < totalPages ? (
          <Link
            href={buildSearchUrl({ q, role, city }, page + 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-none border-2 border-[#1C1917] bg-[#FFFDF9] text-xs font-black text-[#1C1917] shadow-[3px_3px_0px_#1C1917] hover:bg-[#D1E7DD] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            NEXT
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-none border-2 border-[#8C8070] bg-[#E9ECEF] text-xs font-black text-[#8C8070] cursor-not-allowed">
            NEXT
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}
