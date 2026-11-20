import Link from "next/link";
import { Search, RotateCcw } from "lucide-react";
import { ROLES, CITIES } from "@/lib/config";

interface SearchFiltersProps {
  q: string;
  role: string;
  city: string;
}

export function SearchFilters({ q, role, city }: SearchFiltersProps) {
  const hasActiveFilters = Boolean(q || (role && role !== "all") || (city && city !== "all"));

  return (
    <div className="bg-[#FAF6EE] rounded-none border-2 border-[#1C1917] p-5 sm:p-6 mb-7 shadow-[6px_6px_0px_#1C1917]">
      <form method="GET" action="/" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          {/* Search Query Input */}
          <div className="md:col-span-5 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A5144]" />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search keywords, skills, roles... (e.g. Backend, React, Intern)"
              className="w-full pl-11 pr-4 py-3 bg-[#FFFDF9] border-2 border-[#1C1917] rounded-none text-sm font-bold text-[#1C1917] placeholder:text-[#8C8070] focus:outline-none focus:bg-white shadow-[2px_2px_0px_#1C1917] transition-all"
            />
          </div>

          {/* Role Filter Dropdown */}
          <div className="md:col-span-3">
            <select
              name="role"
              defaultValue={role || "all"}
              className="w-full px-4 py-3 bg-[#FFFDF9] border-2 border-[#1C1917] rounded-none text-sm font-bold text-[#1C1917] focus:outline-none focus:bg-white cursor-pointer shadow-[2px_2px_0px_#1C1917] transition-all"
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
              className="w-full px-4 py-3 bg-[#FFFDF9] border-2 border-[#1C1917] rounded-none text-sm font-bold text-[#1C1917] focus:outline-none focus:bg-white cursor-pointer shadow-[2px_2px_0px_#1C1917] transition-all"
            >
              <option value="all">All Locations (Any)</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Sharp Green Action Button */}
          <div className="md:col-span-1 flex items-stretch">
            <button
              type="submit"
              className="w-full bg-[#1E4D2B] hover:bg-[#163820] text-white font-black px-4 py-3 border-2 border-[#1C1917] rounded-none shadow-[3px_3px_0px_#1C1917] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_#1C1917] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#1C1917] transition-all flex items-center justify-center gap-1.5"
            >
              <Search className="w-4 h-4" />
              <span className="md:hidden">Search</span>
            </button>
          </div>
        </div>

        {/* Active Filters & Reset Link */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t-2 border-[#1C1917] text-xs font-bold text-[#463E33]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-[#1C1917] uppercase">Active Filters:</span>
              {q && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-none bg-[#FFFDF9] text-[#1C1917] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917] font-black">
                  Query: &ldquo;{q}&rdquo;
                </span>
              )}
              {role && role !== "all" && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-none bg-[#D1E7DD] text-[#0F5132] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917] font-black">
                  Role: {role}
                </span>
              )}
              {city && city !== "all" && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-none bg-[#FFF3CD] text-[#594200] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917] font-black">
                  City: {city}
                </span>
              )}
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[#1E4D2B] hover:text-[#163820] font-black uppercase tracking-wider hover:underline transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset all filters
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}
