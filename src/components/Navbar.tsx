"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, FilePlus2, SearchCheck, ShieldCheck } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "تقديم طلب جديد", mobileLabel: "طلب جديد", icon: FilePlus2, showLabelOnMobile: true },
    { href: "/track", label: "متابعة طلبي", mobileLabel: "متابعة", icon: SearchCheck, showLabelOnMobile: true },
    { href: "/admin", label: "لوحة الإدارة", mobileLabel: "الإدارة", icon: ShieldCheck, showLabelOnMobile: false },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-sm pt-[env(safe-area-inset-top)]">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 min-h-[60px] sm:h-16 py-1.5 sm:py-0 flex items-center justify-between gap-2 sm:gap-4">
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 group min-w-0 shrink">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-navy-700 text-white flex items-center justify-center shadow-sm group-hover:bg-navy-600 transition-colors shrink-0">
            <BookOpenCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <span className="block font-extrabold text-sm sm:text-lg text-navy-800 leading-tight truncate">
              المُنجِز الأكاديمي
            </span>
            <span className="hidden sm:block text-[11px] text-slate-500 leading-tight truncate">
              المرافقة المنهجية والإخراج الأكاديمي
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 shrink-0" aria-label="التنقل الرئيسي">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                className={`flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-bold sm:font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-navy-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-navy-50 hover:text-navy-800"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.showLabelOnMobile ? (
                  <>
                    <span className="sm:hidden">{item.mobileLabel}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                ) : (
                  <span className="hidden sm:inline">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
