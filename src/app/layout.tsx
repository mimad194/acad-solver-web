import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "منصة المُنجِز الأكاديمي | إعداد وتنسيق الأنشطة الجامعية بصيغة Word RTL",
  description:
    "منصة جامعية لاستقبال طلبات الأنشطة والتمارين وإعداد حلولها المنهجية بالاعتماد على مراجع المقياس وتصديرها في ملفات Word عربية RTL بمعادلات أصلية.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-5 mt-12">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-500">
            <p>منصة المُنجِز الأكاديمي — إعداد وتنسيق الأنشطة الجامعية بصيغة Word (RTL + OMML)</p>
            <p className="text-xs text-slate-400">توافق كامل مع Microsoft Word وخطوط المعادلات الأصلية</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
