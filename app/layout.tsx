import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beep Fresher Jobs India | Curated Early Career Opportunities",
  description: "Verified fresher & internship jobs across India from direct company ATS boards.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FBF8F2] text-[#24211D] antialiased selection:bg-[#1E4D2B] selection:text-[#FDFBF7]">
        {children}
      </body>
    </html>
  );
}
