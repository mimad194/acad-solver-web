import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1B365D",
};

export const metadata: Metadata = {
  title: "منصة المُنجِز الأكاديمي | المرافقة المنهجية والإخراج الأكاديمي",
  description:
    "منصة جامعية للمرافقة المنهجية والإخراج الأكاديمي الاحترافي لطلبة الليسانس والماستر بالاعتماد على مراجع ومطبوعات المقياس.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "المُنجِز الأكاديمي",
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
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
      <body className="min-h-screen min-h-[100dvh] font-sans antialiased flex flex-col">
        <Navbar />
        <main className="flex-1 w-full">{children}</main>
        <footer className="border-t border-slate-200 bg-white pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] mt-10 sm:mt-12">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-right text-xs sm:text-sm text-slate-500">
            <p>منصة المُنجِز الأكاديمي — المرافقة المنهجية والإخراج الأكاديمي لطلبة الجامعة</p>
            <p className="text-xs text-slate-400">جودة أكاديمية رفيعة • سرية تامة • إخراج احترافي متكامل</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
