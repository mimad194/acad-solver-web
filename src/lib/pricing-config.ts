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
  const stdPrice = parsePositiveInt(process.env.PRICE_STANDARD_DZD, 250);
  const wavePrice = parsePositiveInt(process.env.PRICE_PREMIUM_DZD, 650);
  const semPrice = parsePositiveInt(process.env.PRICE_SEMESTER_DZD, 3300);

  return [
    {
      id: "standard",
      name: process.env.PACKAGE_STANDARD_NAME?.trim() || "نشاط واحد (للتجربة)",
      priceDzd: stdPrice,
      creditsCount: 1,
      subtitle:
        process.env.PACKAGE_STANDARD_DESC?.trim() ||
        "مثالية لتجربة الجودة الكاملة في نشاط واحد بلا مخاطرة",
      features: [
        "نفس الجودة القصوى: التزام بمطبوعات الأستاذ وتدقيق حسابي ومنهجي",
        "ملف Word احترافي منسّق بالجداول والمعادلات وجاهز للاستخدام المباشر",
        "بصمة أسلوبية وتنسيقية فريدة (تشابه < 20% مع باقي الدفعة)",
        "بطاقة «دليل الفهم السريع والمناقشة» حصرية للطالب",
      ],
    },
    {
      id: "premium",
      name: process.env.PACKAGE_PREMIUM_NAME?.trim() || "باقة الموجة الواحدة (3 أنشطة)",
      badge: "الأكثر مرونة",
      highlighted: true,
      priceDzd: wavePrice,
      creditsCount: 3,
      subtitle:
        process.env.PACKAGE_PREMIUM_DESC?.trim() ||
        "تغطي موجة كاملة (2–3 أنشطة) برصيد مشترك صالح طوال السداسي",
      features: [
        "رصيد 3 أنشطة كاملة بنفس الجودة القصوى (توفير مقارنة بالفردي)",
        "رمز رصيد خاص (Pass Code) تستهلك منه أنشطتك دون تكرار الدفع",
        "أنسنة أكاديمية متقدمة وفحص تفرد الدفعة (< 20%) لكل نشاط",
        "دليل الفهم والمناقشة + تعديل مجاني خلال 48 ساعة",
      ],
    },
    {
      id: "semester",
      name: process.env.PACKAGE_SEMESTER_NAME?.trim() || "باقة السداسي الشاملة (17 نشاطاً)",
      badge: "توفير كبير — 6 موجات",
      priceDzd: semPrice,
      creditsCount: 17,
      subtitle:
        process.env.PACKAGE_SEMESTER_DESC?.trim() ||
        "مرافقة كاملة لكل أنشطة السداسي (60 يوماً قبل الامتحانات) برصيد موحّد",
      features: [
        "رصيد 17 نشاطاً جامعياً يغطي كافة موجات السداسي قبل الامتحانات",
        "دفع مرة واحدة + رمز رصيد (Pass Code) لطلب كل موجة في 10 ثوانٍ",
        "أمان وخصوصية تامة دون الحاجة لمشاركة كلمة سر حسابك في Moodle",
        "بصمة منهجية وتنسيق Word مختلف كليا لكل نشاط (تشابه < 20%)",
      ],
    },
  ];
}

export function getEnvAppConfig(): PublicAppConfig {
  const currency = process.env.PRICE_CURRENCY?.trim() || "دج";
  const cohortMaxSlots = parsePositiveInt(process.env.COHORT_MAX_SLOTS, 8);
  const previewLockEnabled =
    (process.env.PREVIEW_LOCK_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const referralEnabled =
    (process.env.REFERRAL_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const referralTargetCount = Math.max(
    1,
    parsePositiveInt(process.env.REFERRAL_TARGET_COUNT, 3)
  );
  const referralFriendDiscountPercent = Math.min(
    100,
    parsePositiveInt(process.env.REFERRAL_FRIEND_DISCOUNT_PERCENT, 10)
  );

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
    semesterPassExpiresAt: process.env.SEMESTER_PASS_EXPIRES_AT?.trim() || "",
    referral: {
      enabled: referralEnabled,
      targetCount: referralTargetCount,
      friendDiscountPercent: referralFriendDiscountPercent,
    },
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
  semesterPassExpiresAt?: string;
  supportWhatsapp?: string;
  referral?: {
    enabled?: boolean;
    targetCount?: number;
    friendDiscountPercent?: number;
  };
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
    creditsCount?: number;
    features?: string[];
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
    const cleanedFeatures = Array.isArray(patch.features)
      ? patch.features.map((f) => String(f).trim()).filter(Boolean)
      : null;
    return {
      ...pkg,
      name: patch.name?.trim() || pkg.name,
      subtitle: patch.subtitle?.trim() || pkg.subtitle,
      badge: patch.badge !== undefined ? patch.badge.trim() || undefined : pkg.badge,
      priceDzd:
        typeof patch.priceDzd === "number" && Number.isFinite(patch.priceDzd) && patch.priceDzd >= 0
          ? Math.round(patch.priceDzd)
          : pkg.priceDzd,
      creditsCount:
        typeof patch.creditsCount === "number" &&
        Number.isFinite(patch.creditsCount) &&
        patch.creditsCount >= 1
          ? Math.round(patch.creditsCount)
          : pkg.creditsCount,
      features:
        cleanedFeatures && cleanedFeatures.length > 0
          ? cleanedFeatures
          : pkg.features,
    };
  });

  return {
    currency: ov.currency?.trim() || base.currency,
    cohortMaxSlots: base.cohortMaxSlots,
    previewLockEnabled:
      typeof ov.previewLockEnabled === "boolean"
        ? ov.previewLockEnabled
        : base.previewLockEnabled,
    semesterPassExpiresAt:
      ov.semesterPassExpiresAt !== undefined
        ? ov.semesterPassExpiresAt.trim()
        : base.semesterPassExpiresAt,
    referral: {
      enabled:
        typeof ov.referral?.enabled === "boolean"
          ? ov.referral.enabled
          : base.referral.enabled,
      targetCount:
        typeof ov.referral?.targetCount === "number" &&
        Number.isFinite(ov.referral.targetCount) &&
        ov.referral.targetCount >= 1
          ? Math.round(ov.referral.targetCount)
          : base.referral.targetCount,
      friendDiscountPercent:
        typeof ov.referral?.friendDiscountPercent === "number" &&
        Number.isFinite(ov.referral.friendDiscountPercent) &&
        ov.referral.friendDiscountPercent >= 0
          ? Math.min(100, Math.round(ov.referral.friendDiscountPercent))
          : base.referral.friendDiscountPercent,
    },
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
  creditsCount: number;
  packageName: string;
}> {
  const cfg = await getPublicAppConfigAsync();
  const matched =
    cfg.packages.find((p) => p.id === packageId) ??
    cfg.packages.find((p) => p.id === "standard") ??
    cfg.packages[0];
  return {
    packageId: matched.id,
    priceDzd: matched.priceDzd,
    creditsCount:
      matched.creditsCount ??
      (matched.id === "semester" ? 17 : matched.id === "premium" ? 3 : 1),
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
