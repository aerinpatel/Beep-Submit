export function Footer() {
  return (
    <footer className="border-t-2 border-[#1C1917] bg-[#F7F2E7] py-6 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold text-[#5A5144]">
        <div>
          Built with Next.js, Tailwind CSS, PostgreSQL &amp; Groq LLM for Beep.
        </div>
        <div className="flex items-center gap-4">
          <span className="font-black text-[#1E4D2B] uppercase">Direct Public ATS Feeds</span>
          <span>•</span>
          <span className="font-black text-[#1C1917] uppercase">Zero Recruiter Scraping</span>
        </div>
      </div>
    </footer>
  );
}
