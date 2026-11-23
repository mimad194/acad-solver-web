import type { PackageId, PricingPackage, PublicAppConfig } from "@/types/order";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function buildDefaultPackages(): PricingPackage[] {
  const stdPrice = parsePositiveInt(process.env.PRICE_STANDARD_DZD, 600);
  const premPrice = parsePositiveInt(process.env.PRICE_PREMIUM_DZD, 1200);
  const semPrice = parsePositiveInt(process.env.PRICE_SEMESTER_DZD, 2900);

  return [
    {
      id: "standard",
      name: process.env.PACKAGE_STANDARD_NAME?.trim() || "الباقة القياسية (نشاط فردي)",
      priceDzd: stdPrice,
      subtitle:
        process.env.PACKAGE_STANDARD_DESC?.trim() ||
        "مثالية للأنشطة النظرية أو التطبيقية المباشرة",
      features: [
        "حل منهجي ملتزم بمطبوعات ومحاضرات الأستاذ",
        "ملف Word عربي RTL أصلي بمعادلات وجداول جاهزة لـ Moodle",
        "أسلوب صياغة متفرد وقالب تنسيق خاص بطلبك",
        "بطاقة «دليل الفهم السريع» للتحضير للمناقشة",
      ],
    },
    {
      id: "premium",
      name: process.env.PACKAGE_PREMIUM_NAME?.trim() || "باقة الامتياز (كمّي / ماستر)",
      badge: "الأكثر طلبا",
      highlighted: true,
      priceDzd: premPrice,
      subtitle:
        process.env.PACKAGE_PREMIUM_DESC?.trim() ||
        "للأنشطة الكمية والإحصائية ودراسات الحالة المعمّقة",
      features: [
        "تدقيق حسابي ومنهجي ثنائي المرحلة (توليد + مراجعة أستاذ مدقّق)",
        "جداول حسابات وسيطة كاملة وتحليل تسييري/اقتصادي معمّق",
        "أنسنة أكاديمية متقدمة وفحص تفرد الدفعة (تشابه < 20%)",
        "دليل الفهم والمناقشة الشفوية + تعديل مجاني خلال 48 ساعة",
      ],
    },
    {
      id: "semester",
      name: process.env.PACKAGE_SEMESTER_NAME?.trim() || "باقة السداسي (4 أنشطة)",
      badge: "توفير 35%",
      priceDzd: semPrice,
      subtitle:
        process.env.PACKAGE_SEMESTER_DESC?.trim() ||
        "مرافقة كاملة لأربعة أنشطة خلال السداسي بأولوية معالجة",
      features: [
        "تغطي 4 أنشطة جامعية بمستوى «باقة الامتياز» الكامل",
        "أولوية قصوى في الإعداد والمراجعة والتسليم",
        "بصمة منهجية وتنسيق Word مختلف كليا لكل نشاط",
        "فحص تفرد آلي (< 20%) مقابل كامل طلبات الدفعة",
      ],
    },
  ];
}

export function getPublicAppConfig(): PublicAppConfig {
  const currency = process.env.PRICE_CURRENCY?.trim() || "دج";
  const cohortMaxSlots = parsePositiveInt(process.env.COHORT_MAX_SLOTS, 8);
  const previewLockEnabled =
    (process.env.PREVIEW_LOCK_ENABLED ?? "true").trim().toLowerCase() !== "false";

  let packages = buildDefaultPackages();
  const customJson = process.env.PRICING_PACKAGES_JSON?.trim();
  if (customJson) {
    try {
      const parsed = JSON.parse(customJson) as PricingPackage[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        packages = parsed.filter(
          (p) => p && typeof p.id === "string" && typeof p.priceDzd === "number"
        );
      }
    } catch {
      // Ignore malformed custom JSON and keep defaults
    }
  }

  return {
    currency,
    packages,
    cohortMaxSlots,
    previewLockEnabled,
    payment: {
      baridimobRip: process.env.PAYMENT_BARIDIMOB_RIP?.trim() || "",
      ccpAccount: process.env.PAYMENT_CCP_ACCOUNT?.trim() || "",
      accountName: process.env.PAYMENT_ACCOUNT_NAME?.trim() || "",
    },
    supportWhatsapp: (process.env.SUPPORT_WHATSAPP ?? "").replace(/[^\d]/g, ""),
  };
}

export function resolvePackagePrice(packageId?: PackageId): {
  packageId: PackageId;
  priceDzd: number;
  packageName: string;
} {
  const cfg = getPublicAppConfig();
  const matched =
    cfg.packages.find((p) => p.id === packageId) ??
    cfg.packages.find((p) => p.id === "premium") ??
    cfg.packages[0];
  return {
    packageId: matched.id,
    priceDzd: matched.priceDzd,
    packageName: matched.name,
  };
}

export function isOrderPaymentUnlocked(order: {
  paymentStatus?: string;
}): boolean {
  const cfg = getPublicAppConfig();
  if (!cfg.previewLockEnabled) return true;
  // Backward compatibility: legacy orders created before paymentStatus existed stay unlocked
  if (!order.paymentStatus) return true;
  return order.paymentStatus === "paid" || order.paymentStatus === "waived";
}
