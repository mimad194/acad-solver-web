"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, FilePlus2, SearchCheck, ShieldCheck } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "تقديم طلب جديد", icon: FilePlus2 },
    { href: "/track", label: "متابعة طلبي", icon: SearchCheck },
    { href: "/admin", label: "لوحة الإدارة", icon: ShieldCheck },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-navy-700 text-white flex items-center justify-center shadow-sm group-hover:bg-navy-600 transition-colors">
            <BookOpenCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="block font-extrabold text-lg text-navy-800 leading-tight">
              المُنجِز الأكاديمي
            </span>
            <span className="block text-[11px] text-slate-500 leading-tight">
              إعداد وتنسيق الأنشطة الجامعية RTL
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-2">
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
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-navy-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-navy-50 hover:text-navy-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
