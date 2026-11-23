import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type {
  AcademicCycle,
  AcademicYearCode,
  PackageId,
  PromoCodeEntry,
  StudentOrder,
} from "@/types/order";
import { getFirestoreDb } from "./firebase-admin";
import { getPublicAppConfigAsync } from "./pricing-config";
import { listOrders, updateOrder } from "./store";
import { sendTelegramAlert } from "./notify";
import { validateCreditPass } from "./credit-passes";

const PROMO_COLLECTION = "promo_codes";

function getLocalPromosPath(): string {
  const dir =
    process.env.VERCEL || process.env.NETLIFY
      ? path.join("/tmp", "acad-solver-data")
      : path.join(process.cwd(), ".data");
  return path.join(dir, "promo-codes.json");
}

async function readLocalPromos(): Promise<PromoCodeEntry[]> {
  try {
    const raw = await fs.readFile(getLocalPromosPath(), "utf-8");
    return JSON.parse(raw) as PromoCodeEntry[];
  } catch {
    return [];
  }
}

async function writeLocalPromos(entries: PromoCodeEntry[]): Promise<void> {
  const p = getLocalPromosPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(entries, null, 2), "utf-8");
}

export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "REF-";
  for (let i = 0; i < 5; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

function generateFreeRewardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "FREE-";
  for (let i = 0; i < 5; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

export async function listPromoCodes(): Promise<PromoCodeEntry[]> {
  const db = getFirestoreDb();
  if (db) {
    const snap = await db.collection(PROMO_COLLECTION).get();
    return snap.docs
      .map((d) => d.data() as PromoCodeEntry)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  const list = await readLocalPromos();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getPromoCode(rawCode: string): Promise<PromoCodeEntry | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const db = getFirestoreDb();
  if (db) {
    const doc = await db.collection(PROMO_COLLECTION).doc(code).get();
    return doc.exists ? (doc.data() as PromoCodeEntry) : null;
  }
  const list = await readLocalPromos();
  return list.find((p) => p.code === code) ?? null;
}

export async function upsertPromoCode(input: {
  code: string;
  discountPercent: number;
  maxUses?: number;
  active?: boolean;
  allowedPackageIds?: PackageId[];
  note?: string;
  source?: "admin" | "referral_reward";
  ownerOrderId?: string;
}): Promise<PromoCodeEntry> {
  const code = normalizeCode(input.code);
  if (!code || code.length < 3 || !/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error("يجب أن يتكون الكود من 3 أحرف/أرقام إنجليزية على الأقل (بدون مسافات).");
  }
  const pct = Math.min(100, Math.max(1, Math.round(Number(input.discountPercent) || 0)));
  const maxUses = Math.max(0, Math.round(Number(input.maxUses ?? 0) || 0));
  const existing = await getPromoCode(code);

  const entry: PromoCodeEntry = {
    code,
    discountPercent: pct,
    maxUses,
    usedCount: existing?.usedCount ?? 0,
    active: input.active !== undefined ? Boolean(input.active) : existing?.active ?? true,
    allowedPackageIds: input.allowedPackageIds ?? existing?.allowedPackageIds,
    note: input.note !== undefined ? input.note.trim() : existing?.note,
    source: input.source ?? existing?.source ?? "admin",
    ownerOrderId: input.ownerOrderId ?? existing?.ownerOrderId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  const db = getFirestoreDb();
  if (db) {
    await db.collection(PROMO_COLLECTION).doc(code).set(entry);
    return entry;
  }
  const list = await readLocalPromos();
  const idx = list.findIndex((p) => p.code === code);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  await writeLocalPromos(list);
  return entry;
}

export async function deletePromoCode(rawCode: string): Promise<boolean> {
  const code = normalizeCode(rawCode);
  const db = getFirestoreDb();
  if (db) {
    const ref = db.collection(PROMO_COLLECTION).doc(code);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
  const list = await readLocalPromos();
  const next = list.filter((p) => p.code !== code);
  if (next.length === list.length) return false;
  await writeLocalPromos(next);
  return true;
}

export async function incrementPromoUsage(rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode);
  const existing = await getPromoCode(code);
  if (!existing) return;
  const updated: PromoCodeEntry = {
    ...existing,
    usedCount: existing.usedCount + 1,
  };
  const db = getFirestoreDb();
  if (db) {
    await db.collection(PROMO_COLLECTION).doc(code).set(updated);
    return;
  }
  const list = await readLocalPromos();
  const idx = list.findIndex((p) => p.code === code);
  if (idx >= 0) {
    list[idx] = updated;
    await writeLocalPromos(list);
  }
}

export interface DiscountValidationResult {
  valid: boolean;
  kind?: "promo" | "referral" | "credit_pass";
  code: string;
  discountPercent: number;
  discountAmountDzd: number;
  finalPriceDzd: number;
  referrerName?: string;
  creditPassRemaining?: number;
  creditPassTotal?: number;
  creditPassExpiresAt?: string;
  prefillStudent?: {
    studentName: string;
    contact: string;
    university: string;
    cycle?: AcademicCycle;
    year?: AcademicYearCode;
    specialtyId?: string;
  };
  message: string;
}

export async function validatePromoOrReferralCode(
  rawCode: string,
  basePriceDzd: number,
  packageId?: PackageId
): Promise<DiscountValidationResult> {
  const code = normalizeCode(rawCode);
  if (!code) {
    return {
      valid: false,
      code: "",
      discountPercent: 0,
      discountAmountDzd: 0,
      finalPriceDzd: basePriceDzd,
      message: "يرجى إدخال كود برومو أو كود إحالة أو رمز رصيد (PASS-...).",
    };
  }

  // 0) Check Semester Activity Credit Pass (PASS-XXXXX)
  if (code.startsWith("PASS-")) {
    const passCheck = await validateCreditPass(code);
    if (!passCheck.valid || !passCheck.pass) {
      return {
        valid: false,
        kind: "credit_pass",
        code,
        discountPercent: 0,
        discountAmountDzd: 0,
        finalPriceDzd: basePriceDzd,
        message: passCheck.message,
      };
    }
    return {
      valid: true,
      kind: "credit_pass",
      code: passCheck.pass.passCode,
      discountPercent: 100,
      discountAmountDzd: basePriceDzd,
      finalPriceDzd: 0,
      creditPassRemaining: passCheck.remainingCredits,
      creditPassTotal: passCheck.pass.totalCredits,
      creditPassExpiresAt: passCheck.pass.expiresAt,
      prefillStudent: {
        studentName: passCheck.pass.studentName,
        contact: passCheck.pass.contact,
        university: passCheck.pass.university,
        cycle: passCheck.pass.cycle,
        year: passCheck.pass.year,
        specialtyId: passCheck.pass.specialtyId,
      },
      message: passCheck.message,
    };
  }

  // 1) Check Promo Codes
  const promo = await getPromoCode(code);
  if (promo) {
    if (!promo.active) {
      return {
        valid: false,
        code,
        discountPercent: 0,
        discountAmountDzd: 0,
        finalPriceDzd: basePriceDzd,
        message: "هذا الكود غير مفعل حاليا.",
      };
    }
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
      return {
        valid: false,
        code,
        discountPercent: 0,
        discountAmountDzd: 0,
        finalPriceDzd: basePriceDzd,
        message: "تم استنفاد العدد الأقصى لاستخدامات هذا الكود.",
      };
    }
    // Enforce package scope (e.g. referral reward FREE-XXXXX is strictly for single activity `standard`!)
    const allowed =
      promo.allowedPackageIds ??
      (promo.source === "referral_reward" ? (["standard"] as PackageId[]) : undefined);
    if (allowed && allowed.length > 0 && packageId && !allowed.includes(packageId)) {
      return {
        valid: false,
        kind: "promo",
        code: promo.code,
        discountPercent: 0,
        discountAmountDzd: 0,
        finalPriceDzd: basePriceDzd,
        message:
          "هذا الكود المجاني مخصص لباقة «نشاط واحد» فقط لحماية الرصيد. اختر باقة «نشاط واحد» لتفعيله مجانا 100%!",
      };
    }
    const discountAmountDzd = Math.round((basePriceDzd * promo.discountPercent) / 100);
    const finalPriceDzd = Math.max(0, basePriceDzd - discountAmountDzd);
    return {
      valid: true,
      kind: "promo",
      code: promo.code,
      discountPercent: promo.discountPercent,
      discountAmountDzd,
      finalPriceDzd,
      message:
        promo.discountPercent === 100
          ? `تم تفعيل الكود (${promo.code}): خصم 100% — هذا النشاط مجاني بالكامل!`
          : `تم تفعيل كود البرومو (${promo.code}): خصم ${promo.discountPercent}% (-${discountAmountDzd} دج).`,
    };
  }

  // 2) Check Student Referral Codes
  const cfg = await getPublicAppConfigAsync();
  if (cfg.referral.enabled) {
    const allOrders = await listOrders();
    const owner = allOrders.find(
      (o) => o.referralCode && normalizeCode(o.referralCode) === code
    );
    if (owner) {
      const pct = cfg.referral.friendDiscountPercent;
      const discountAmountDzd = Math.round((basePriceDzd * pct) / 100);
      const finalPriceDzd = Math.max(0, basePriceDzd - discountAmountDzd);
      return {
        valid: true,
        kind: "referral",
        code,
        discountPercent: pct,
        discountAmountDzd,
        finalPriceDzd,
        referrerName: owner.studentName,
        message:
          pct > 0
            ? `تم تفعيل كود إحالة زميلك (${code}): استفدت من خصم ترحيبي ${pct}%!`
            : `تم ربط طلبك بكود إحالة زميلك (${code}) بنجاح.`,
      };
    }
  }

  return {
    valid: false,
    code,
    discountPercent: 0,
    discountAmountDzd: 0,
    finalPriceDzd: basePriceDzd,
    message: "الكود المدخل غير صحيح أو منتهي الصلاحية.",
  };
}

export async function getReferralStatsForOrder(order: StudentOrder): Promise<{
  enabled: boolean;
  referralCode: string;
  targetCount: number;
  friendDiscountPercent: number;
  qualifiedCount: number;
  pendingCount: number;
  remainingForNextReward: number;
  rewardPromoCodes: Array<{ code: string; used: boolean }>;
}> {
  const cfg = await getPublicAppConfigAsync();
  const refCode = order.referralCode || "";
  if (!refCode) {
    return {
      enabled: cfg.referral.enabled,
      referralCode: "",
      targetCount: cfg.referral.targetCount,
      friendDiscountPercent: cfg.referral.friendDiscountPercent,
      qualifiedCount: 0,
      pendingCount: 0,
      remainingForNextReward: cfg.referral.targetCount,
      rewardPromoCodes: [],
    };
  }

  const allOrders = await listOrders();
  const normRef = normalizeCode(refCode);
  const referred = allOrders.filter(
    (o) => o.id !== order.id && o.referredByCode && normalizeCode(o.referredByCode) === normRef
  );
  const qualifiedCount = referred.filter((o) => o.paymentStatus === "paid").length;
  const pendingCount = referred.length - qualifiedCount;
  const target = cfg.referral.targetCount;
  const mod = qualifiedCount % target;
  const remainingForNextReward = mod === 0 && qualifiedCount > 0 ? target : target - mod;

  const rewardPromoCodes: Array<{ code: string; used: boolean }> = [];
  for (const rc of order.rewardPromoCodes ?? []) {
    const p = await getPromoCode(rc);
    rewardPromoCodes.push({
      code: rc,
      used: Boolean(p && p.maxUses > 0 && p.usedCount >= p.maxUses),
    });
  }

  return {
    enabled: cfg.referral.enabled,
    referralCode: refCode,
    targetCount: target,
    friendDiscountPercent: cfg.referral.friendDiscountPercent,
    qualifiedCount,
    pendingCount,
    remainingForNextReward,
    rewardPromoCodes,
  };
}

/**
 * Called automatically whenever an order is marked `paid`.
 * If the order came from a referral code and the referrer hits a multiple of `targetCount`
 * (e.g. 3 paid referrals), mints a single-use 100% FREE promo code (`FREE-XXXXX`) for the referrer!
 */
export async function processReferralQualification(
  paidOrder: StudentOrder
): Promise<string | null> {
  if (!paidOrder.referredByCode || paidOrder.paymentStatus !== "paid") return null;
  const cfg = await getPublicAppConfigAsync();
  if (!cfg.referral.enabled) return null;

  const normRef = normalizeCode(paidOrder.referredByCode);
  const allOrders = await listOrders();
  const referrerOrder = allOrders.find(
    (o) => o.referralCode && normalizeCode(o.referralCode) === normRef
  );
  if (!referrerOrder) return null;

  const qualifiedCount = allOrders.filter(
    (o) =>
      o.id !== referrerOrder.id &&
      o.referredByCode &&
      normalizeCode(o.referredByCode) === normRef &&
      o.paymentStatus === "paid"
  ).length;

  const earnedTotal = Math.floor(qualifiedCount / cfg.referral.targetCount);
  const existingRewards = referrerOrder.rewardPromoCodes ?? [];
  if (earnedTotal <= existingRewards.length) {
    return null;
  }

  const newCode = generateFreeRewardCode();
  await upsertPromoCode({
    code: newCode,
    discountPercent: 100,
    maxUses: 1,
    active: true,
    allowedPackageIds: ["standard"], // Strictly 1 free single activity only!
    note: `مكافأة إحالات (${qualifiedCount} إحالات مؤكدة — نشاط واحد مجاني) للطالب ${referrerOrder.studentName}`,
    source: "referral_reward",
    ownerOrderId: referrerOrder.id,
  });

  await updateOrder(referrerOrder.id, (cur) => ({
    ...cur,
    rewardPromoCodes: [...(cur.rewardPromoCodes ?? []), newCode],
  }));

  void sendTelegramAlert(
    `🎁 مكافأة إحالة مجانية 100% صدرت تلقائيا!\n` +
      `الطالب المستفيد: ${referrerOrder.studentName} (${referrerOrder.trackingCode})\n` +
      `عدد الإحالات المدفوعة: ${qualifiedCount}\n` +
      `الكود المجاني الجديد (100%): ${newCode}\n` +
      `ظهر الكود تلقائيا للطالب في صفحة التتبع الخاصة به.`
  );

  return newCode;
}
