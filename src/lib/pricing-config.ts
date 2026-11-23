import fs from "fs/promises";
import path from "path";
import type { PackageId, PricingPackage, PublicAppConfig } from "@/types/order";
import { getFirestoreDb } from "./firebase-admin";

const SETTINGS_COLLECTION = "app_settings";
const SETTINGS_DOC_ID = "commercial";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function getLocalSettingsPath(): string {
  const dir =
    process.env.VERCEL || process.env.NETLIFY
      ? path.join("/tmp", "acad-solver-data")
      : path.join(process.cwd(), ".data");
  return path.join(dir, "commercial-settings.json");
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

export function getEnvAppConfig(): PublicAppConfig {
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
      // Ignore malformed custom JSON
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

export interface StoredCommercialOverrides {
  currency?: string;
  previewLockEnabled?: boolean;
  supportWhatsapp?: string;
  payment?: {
    baridimobRip?: string;
    ccpAccount?: string;
    accountName?: string;
  };
  packages?: Array<{
    id: PackageId;
    name?: string;
    subtitle?: string;
    badge?: string;
    priceDzd?: number;
  }>;
  updatedAt?: string;
}

async function readStoredOverrides(): Promise<StoredCommercialOverrides | null> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
      return snap.exists ? (snap.data() as StoredCommercialOverrides) : null;
    } catch {
      return null;
    }
  }
  try {
    const raw = await fs.readFile(getLocalSettingsPath(), "utf-8");
    return JSON.parse(raw) as StoredCommercialOverrides;
  } catch {
    return null;
  }
}

export async function saveCommercialOverrides(
  overrides: StoredCommercialOverrides
): Promise<PublicAppConfig> {
  const payload: StoredCommercialOverrides = {
    ...overrides,
    updatedAt: new Date().toISOString(),
  };

  const db = getFirestoreDb();
  if (db) {
    await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(payload);
  } else {
    const p = getLocalSettingsPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(payload, null, 2), "utf-8");
  }

  return getPublicAppConfigAsync();
}

export async function getPublicAppConfigAsync(): Promise<PublicAppConfig> {
  const base = getEnvAppConfig();
  const ov = await readStoredOverrides();
  if (!ov) return base;

  const mergedPackages = base.packages.map((pkg) => {
    const patch = ov.packages?.find((p) => p.id === pkg.id);
    if (!patch) return pkg;
    return {
      ...pkg,
      name: patch.name?.trim() || pkg.name,
      subtitle: patch.subtitle?.trim() || pkg.subtitle,
      badge: patch.badge !== undefined ? patch.badge.trim() || undefined : pkg.badge,
      priceDzd:
        typeof patch.priceDzd === "number" && Number.isFinite(patch.priceDzd) && patch.priceDzd >= 0
          ? Math.round(patch.priceDzd)
          : pkg.priceDzd,
    };
  });

  return {
    currency: ov.currency?.trim() || base.currency,
    cohortMaxSlots: base.cohortMaxSlots,
    previewLockEnabled:
      typeof ov.previewLockEnabled === "boolean"
        ? ov.previewLockEnabled
        : base.previewLockEnabled,
    payment: {
      baridimobRip:
        ov.payment?.baridimobRip !== undefined
          ? ov.payment.baridimobRip.trim()
          : base.payment.baridimobRip,
      ccpAccount:
        ov.payment?.ccpAccount !== undefined
          ? ov.payment.ccpAccount.trim()
          : base.payment.ccpAccount,
      accountName:
        ov.payment?.accountName !== undefined
          ? ov.payment.accountName.trim()
          : base.payment.accountName,
    },
    supportWhatsapp:
      ov.supportWhatsapp !== undefined
        ? ov.supportWhatsapp.replace(/[^\d]/g, "")
        : base.supportWhatsapp,
    packages: mergedPackages,
  };
}

export async function resolvePackagePriceAsync(packageId?: PackageId): Promise<{
  packageId: PackageId;
  priceDzd: number;
  packageName: string;
}> {
  const cfg = await getPublicAppConfigAsync();
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

export async function isOrderPaymentUnlockedAsync(order: {
  paymentStatus?: string;
}): Promise<boolean> {
  const cfg = await getPublicAppConfigAsync();
  if (!cfg.previewLockEnabled) return true;
  if (!order.paymentStatus) return true;
  return order.paymentStatus === "paid" || order.paymentStatus === "waived";
}

// Keep sync exports for any backward-compatible callers
export const getPublicAppConfig = getEnvAppConfig;
