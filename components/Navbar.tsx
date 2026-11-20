import Link from "next/link";
import { Clock } from "lucide-react";

interface NavbarProps {
  latestRun?: {
    startedAt: string;
    status: string;
  };
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

export function Navbar({ latestRun }: NavbarProps) {
  return (
    <header className="border-b-2 border-[#1C1917] bg-[#F7F2E7] sticky top-0 z-30 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-9 h-9 rounded-none bg-[#1E4D2B] text-white font-black text-xl flex items-center justify-center border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917] group-hover:translate-x-[1px] group-hover:translate-y-[1px] group-hover:shadow-[1px_1px_0px_#1C1917] transition-all">
              B
            </span>
            <div>
              <span className="text-2xl font-black tracking-tight text-[#1C1917] group-hover:text-[#1E4D2B] transition-colors">
                Beep
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-[#0F5132] ml-2 px-2 py-0.5 rounded-none bg-[#D1E7DD] border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]">
                Freshers
              </span>
            </div>
          </Link>
          <span className="hidden sm:inline-block text-[#1C1917] font-black">|</span>
          <span className="hidden sm:inline-block text-xs font-bold uppercase tracking-wider text-[#5A5144]">
            India Early Career &amp; Internships
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs self-end sm:self-center font-bold">
          <div className="flex items-center gap-1.5 bg-[#D1E7DD] text-[#0F5132] px-3 py-1 rounded-none border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]">
            <span className="w-2 h-2 bg-[#1E4D2B] animate-pulse rounded-none" />
            <span>LIVE INGEST</span>
          </div>
          {latestRun && (
            <div className="flex items-center gap-1.5 text-[#1C1917] bg-[#FFFDF9] px-2.5 py-1 rounded-none border-2 border-[#1C1917] shadow-[2px_2px_0px_#1C1917]">
              <Clock className="w-3.5 h-3.5 text-[#1E4D2B]" />
              <span>Updated {formatRelativeRunTime(latestRun.startedAt)}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
