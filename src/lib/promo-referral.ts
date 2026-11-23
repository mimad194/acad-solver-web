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
import {
  getFirestoreDb,
  getLocalDataDir,
  sanitizeForFirestore,
} from "./firebase-admin";
import {
  getPublicAppConfigAsync,
  resolvePackagePriceAsync,
} from "./pricing-config";
import { listOrders, updateOrder } from "./store";
import { sendTelegramAlert } from "./notify";
import { validateCreditPass } from "./credit-passes";

const PROMO_COLLECTION = "promo_codes";
const VALID_PACKAGE_IDS = new Set<PackageId>(["standard", "premium", "semester"]);
const PACKAGE_LABELS_AR: Record<PackageId, string> = {
  standard: "نشاط واحد",
  premium: "باقة 3 أنشطة",
  semester: "باقة السداسي",
};

let localPromoLock: Promise<void> = Promise.resolve();
let referralMintLock: Promise<void> = Promise.resolve();

async function withLocalPromoLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = localPromoLock;
  let release!: () => void;
  localPromoLock = new Promise<void>((res) => {
    release = res;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function withReferralMintLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = referralMintLock;
  let release!: () => void;
  referralMintLock = new Promise<void>((res) => {
    release = res;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function getLocalPromosPath(): string {
  return path.join(getLocalDataDir(), "promo-codes.json");
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

export function sanitizeAllowedPackageIds(
  raw?: unknown
): PackageId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = Array.from(
    new Set(
      raw
        .map((v) => String(v ?? "").trim())
        .filter((v): v is PackageId => VALID_PACKAGE_IDS.has(v as PackageId))
    )
  );
  return cleaned;
}

export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "REF-";
  for (let i = 0; i < 5; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

export async function generateUniqueReferralCode(): Promise<string> {
  const existing = new Set(
    (await listOrders())
      .map((o) => (o.referralCode ? normalizeCode(o.referralCode) : ""))
      .filter(Boolean)
  );
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateReferralCode();
    if (!existing.has(candidate)) return candidate;
  }
  return `REF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function generateFreeRewardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "FREE-";
  for (let i = 0; i < 5; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

async function generateUniqueFreeRewardCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateFreeRewardCode();
    const existing = await getPromoCode(candidate);
    if (!existing) return candidate;
  }
  return `FREE-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function getEffectiveAllowedPackages(promo: PromoCodeEntry): PackageId[] | undefined {
  if (Array.isArray(promo.allowedPackageIds) && promo.allowedPackageIds.length > 0) {
    return promo.allowedPackageIds;
  }
  if (promo.source === "referral_reward") {
    return ["standard"];
  }
  return undefined;
}

function formatPackageRestrictionMessage(
  promo: PromoCodeEntry,
  allowed: PackageId[]
): string {
  if (allowed.length === 1 && allowed[0] === "standard" && promo.discountPercent === 100) {
    return "هذا الكود المجاني مخصص لباقة «نشاط واحد» فقط لحماية الرصيد. اختر باقة «نشاط واحد» لتفعيله مجانا 100%!";
  }
  const names = allowed.map((id) => `«${PACKAGE_LABELS_AR[id] ?? id}»`).join(" أو ");
  return `هذا الكود (${promo.code}) مخصص لـ ${names} فقط. اختر الباقة المطابقة لتفعيل خصم ${promo.discountPercent}%.`;
}

function evaluatePromoForPackage(
  promo: PromoCodeEntry,
  packageId?: PackageId
): { ok: true } | { ok: false; message: string } {
  if (!promo.active) {
    return { ok: false, message: "هذا الكود غير مفعل حاليا." };
  }
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
    return { ok: false, message: "تم استنفاد العدد الأقصى لاستخدامات هذا الكود." };
  }
  const allowed = getEffectiveAllowedPackages(promo);
  if (allowed && allowed.length > 0 && packageId && !allowed.includes(packageId)) {
    return { ok: false, message: formatPackageRestrictionMessage(promo, allowed) };
  }
  return { ok: true };
}

function isQualifiedPaidReferralOrder(
  order: StudentOrder,
  referrerOrderId: string,
  normRef: string
): boolean {
  if (order.id === referrerOrderId) return false;
  if (!order.referredByCode || normalizeCode(order.referredByCode) !== normRef) {
    return false;
  }
  if (order.paymentStatus !== "paid") return false;
  // Credit-pass orders and 0-DZD free orders never count as paid referrals
  if (order.creditPassUsed) return false;
  if (typeof order.priceDzd === "number" && order.priceDzd <= 0) return false;
  return true;
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
  createOnly?: boolean;
}): Promise<PromoCodeEntry> {
  const code = normalizeCode(input.code);
  if (!code || code.length < 3 || !/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error("يجب أن يتكون الكود من 3 أحرف/أرقام إنجليزية على الأقل (بدون مسافات).");
  }
  if (code.startsWith("PASS-") || code.startsWith("REF-")) {
    throw new Error(
      "البادئات PASS- و REF- محجوزة لرموز الرصيد وأكواد الإحالة التلقائية. اختر بادئة أخرى مثل VIP أو LAUNCH."
    );
  }

  const rawPct = Number(input.discountPercent);
  if (!Number.isFinite(rawPct) || rawPct < 1 || rawPct > 100) {
    throw new Error("نسبة الخصم يجب أن تكون رقما صحيحا بين 1% و 100%.");
  }
  const pct = Math.round(rawPct);

  const rawMaxUses = input.maxUses !== undefined ? Number(input.maxUses) : 0;
  if (!Number.isFinite(rawMaxUses) || rawMaxUses < 0) {
    throw new Error("الحد الأقصى للاستخدام يجب أن يكون 0 (مفتوح) أو رقما موجبا.");
  }
  const maxUses = Math.round(rawMaxUses);

  const existing = await getPromoCode(code);
  if (input.createOnly && existing) {
    throw new Error(`الكود (${code}) موجود مسبقا. يمكنك تفعيله/تعديله أو حذفه أولا.`);
  }

  // Resolve allowedPackageIds without ever producing `undefined` in Firestore documents
  let resolvedAllowed: PackageId[] | undefined;
  if (input.allowedPackageIds !== undefined) {
    const cleaned = sanitizeAllowedPackageIds(input.allowedPackageIds);
    resolvedAllowed = cleaned && cleaned.length > 0 ? cleaned : undefined;
  } else if (existing?.allowedPackageIds && existing.allowedPackageIds.length > 0) {
    resolvedAllowed = existing.allowedPackageIds;
  }

  const resolvedNote =
    input.note !== undefined ? input.note.trim() : existing?.note?.trim();
  const resolvedOwnerOrderId = input.ownerOrderId ?? existing?.ownerOrderId;

  const entry = sanitizeForFirestore<PromoCodeEntry>({
    code,
    discountPercent: pct,
    maxUses,
    usedCount: existing?.usedCount ?? 0,
    active: input.active !== undefined ? Boolean(input.active) : existing?.active ?? true,
    ...(resolvedAllowed && resolvedAllowed.length > 0
      ? { allowedPackageIds: resolvedAllowed }
      : {}),
    ...(resolvedNote ? { note: resolvedNote } : {}),
    source: input.source ?? existing?.source ?? "admin",
    ...(resolvedOwnerOrderId ? { ownerOrderId: resolvedOwnerOrderId } : {}),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });

  const db = getFirestoreDb();
  if (db) {
    await db.collection(PROMO_COLLECTION).doc(code).set(entry);
    return entry;
  }

  await withLocalPromoLock(async () => {
    const list = await readLocalPromos();
    const idx = list.findIndex((p) => p.code === code);
    if (idx >= 0) list[idx] = entry;
    else list.unshift(entry);
    await writeLocalPromos(list);
  });
  return entry;
}

export async function deletePromoCode(rawCode: string): Promise<boolean> {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const db = getFirestoreDb();
  if (db) {
    const ref = db.collection(PROMO_COLLECTION).doc(code);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
  return withLocalPromoLock(async () => {
    const list = await readLocalPromos();
    const next = list.filter((p) => p.code !== code);
    if (next.length === list.length) return false;
    await writeLocalPromos(next);
    return true;
  });
}

/**
 * Atomically validates and increments usage of a promo code.
 * Uses Firestore transactions (or serialized local lock) so concurrent requests
 * can never exceed `maxUses` (e.g. two simultaneous orders using a single-use 100% code).
 */
export async function consumePromoCodeAtomic(
  rawCode: string,
  packageId?: PackageId
): Promise<
  | { ok: true; promo: PromoCodeEntry }
  | { ok: false; message: string }
> {
  const code = normalizeCode(rawCode);
  if (!code) {
    return { ok: false, message: "الكود غير صالح." };
  }

  const db = getFirestoreDb();
  if (db) {
    const ref = db.collection(PROMO_COLLECTION).doc(code);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return { ok: false as const, message: "الكود المدخل غير صحيح أو منتهي الصلاحية." };
      }
      const promo = snap.data() as PromoCodeEntry;
      const check = evaluatePromoForPackage(promo, packageId);
      if (!check.ok) {
        return { ok: false as const, message: check.message };
      }
      const updated = sanitizeForFirestore<PromoCodeEntry>({
        ...promo,
        usedCount: promo.usedCount + 1,
      });
      tx.set(ref, updated);
      return { ok: true as const, promo: updated };
    });
  }

  return withLocalPromoLock(async () => {
    const list = await readLocalPromos();
    const idx = list.findIndex((p) => p.code === code);
    if (idx < 0) {
      return { ok: false as const, message: "الكود المدخل غير صحيح أو منتهي الصلاحية." };
    }
    const promo = list[idx];
    const check = evaluatePromoForPackage(promo, packageId);
    if (!check.ok) {
      return { ok: false as const, message: check.message };
    }
    const updated = sanitizeForFirestore<PromoCodeEntry>({
      ...promo,
      usedCount: promo.usedCount + 1,
    });
    list[idx] = updated;
    await writeLocalPromos(list);
    return { ok: true as const, promo: updated };
  });
}

/**
 * Compensating rollback if order persistence fails after consuming promo usage.
 */
export async function rollbackPromoUsage(rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode);
  if (!code) return;

  const db = getFirestoreDb();
  if (db) {
    const ref = db.collection(PROMO_COLLECTION).doc(code);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const promo = snap.data() as PromoCodeEntry;
      const updated = sanitizeForFirestore<PromoCodeEntry>({
        ...promo,
        usedCount: Math.max(0, promo.usedCount - 1),
      });
      tx.set(ref, updated);
    });
    return;
  }

  await withLocalPromoLock(async () => {
    const list = await readLocalPromos();
    const idx = list.findIndex((p) => p.code === code);
    if (idx >= 0) {
      list[idx] = sanitizeForFirestore<PromoCodeEntry>({
        ...list[idx],
        usedCount: Math.max(0, list[idx].usedCount - 1),
      });
      await writeLocalPromos(list);
    }
  });
}

export async function incrementPromoUsage(rawCode: string): Promise<void> {
  await consumePromoCodeAtomic(rawCode);
}

export interface DiscountValidationResult {
  valid: boolean;
  kind?: "promo" | "referral" | "credit_pass";
  code: string;
  discountPercent: number;
  discountAmountDzd: number;
  finalPriceDzd: number;
  effectivePackageId?: PackageId;
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
  const safeBase =
    Number.isFinite(basePriceDzd) && basePriceDzd > 0 ? Math.round(basePriceDzd) : 0;
  const code = normalizeCode(rawCode);
  if (!code) {
    return {
      valid: false,
      code: "",
      discountPercent: 0,
      discountAmountDzd: 0,
      finalPriceDzd: safeBase,
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
        finalPriceDzd: safeBase,
        message: passCheck.message,
      };
    }
    // A Credit Pass ALWAYS covers 1 single activity (`standard`), never a multi-credit bundle
    const standardPkg = await resolvePackagePriceAsync("standard");
    const creditBasePrice = standardPkg.priceDzd;
    return {
      valid: true,
      kind: "credit_pass",
      code: passCheck.pass.passCode,
      discountPercent: 100,
      discountAmountDzd: creditBasePrice,
      finalPriceDzd: 0,
      effectivePackageId: "standard",
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
    const check = evaluatePromoForPackage(promo, packageId);
    if (!check.ok) {
      return {
        valid: false,
        kind: "promo",
        code: promo.code,
        discountPercent: 0,
        discountAmountDzd: 0,
        finalPriceDzd: safeBase,
        message: check.message,
      };
    }
    const pct = Math.min(100, Math.max(0, Math.round(promo.discountPercent || 0)));
    const discountAmountDzd = pct === 100 ? safeBase : Math.round((safeBase * pct) / 100);
    const finalPriceDzd = Math.max(0, safeBase - discountAmountDzd);
    return {
      valid: true,
      kind: "promo",
      code: promo.code,
      discountPercent: pct,
      discountAmountDzd,
      finalPriceDzd,
      message:
        pct === 100
          ? `تم تفعيل الكود (${promo.code}): خصم 100% — هذا النشاط مجاني بالكامل!`
          : `تم تفعيل كود البرومو (${promo.code}): خصم ${pct}% (-${discountAmountDzd} دج).`,
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
      const pct = Math.min(
        100,
        Math.max(0, Math.round(cfg.referral.friendDiscountPercent || 0))
      );
      const discountAmountDzd = pct === 100 ? safeBase : Math.round((safeBase * pct) / 100);
      const finalPriceDzd = Math.max(0, safeBase - discountAmountDzd);
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
    finalPriceDzd: safeBase,
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
  const target = Math.max(1, Math.round(cfg.referral.targetCount || 3));
  const refCode = order.referralCode || "";
  if (!refCode) {
    return {
      enabled: cfg.referral.enabled,
      referralCode: "",
      targetCount: target,
      friendDiscountPercent: cfg.referral.friendDiscountPercent,
      qualifiedCount: 0,
      pendingCount: 0,
      remainingForNextReward: target,
      rewardPromoCodes: [],
    };
  }

  const allOrders = await listOrders();
  const normRef = normalizeCode(refCode);
  const referred = allOrders.filter(
    (o) => o.id !== order.id && o.referredByCode && normalizeCode(o.referredByCode) === normRef
  );
  const qualifiedCount = referred.filter((o) =>
    isQualifiedPaidReferralOrder(o, order.id, normRef)
  ).length;
  const pendingCount = referred.filter(
    (o) =>
      o.paymentStatus === "unpaid" || o.paymentStatus === "receipt_submitted"
  ).length;
  const mod = qualifiedCount % target;
  const remainingForNextReward = mod === 0 && qualifiedCount > 0 ? target : target - mod;

  const rewardPromoCodes: Array<{ code: string; used: boolean }> = [];
  for (const rc of order.rewardPromoCodes ?? []) {
    const p = await getPromoCode(rc);
    rewardPromoCodes.push({
      code: rc,
      used: Boolean(!p || !p.active || (p.maxUses > 0 && p.usedCount >= p.maxUses)),
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
  // Credit-pass and 0-DZD free orders never qualify for referral rewards
  if (paidOrder.creditPassUsed) return null;
  if (typeof paidOrder.priceDzd === "number" && paidOrder.priceDzd <= 0) return null;

  const cfg = await getPublicAppConfigAsync();
  if (!cfg.referral.enabled) return null;
  const target = Math.max(1, Math.round(cfg.referral.targetCount || 3));

  return withReferralMintLock(async () => {
    const normRef = normalizeCode(paidOrder.referredByCode!);
    const allOrders = await listOrders();
    const referrerOrder = allOrders.find(
      (o) => o.referralCode && normalizeCode(o.referralCode) === normRef
    );
    if (!referrerOrder) return null;

    const qualifiedCount = allOrders.filter((o) =>
      isQualifiedPaidReferralOrder(o, referrerOrder.id, normRef)
    ).length;

    const earnedTotal = Math.floor(qualifiedCount / target);
    const existingRewards = referrerOrder.rewardPromoCodes ?? [];
    const toMint = earnedTotal - existingRewards.length;
    if (toMint <= 0) {
      return null;
    }

    const newlyMinted: string[] = [];
    for (let i = 0; i < toMint; i++) {
      const newCode = await generateUniqueFreeRewardCode();
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
      newlyMinted.push(newCode);
    }

    await updateOrder(referrerOrder.id, (cur) => ({
      ...cur,
      rewardPromoCodes: [...(cur.rewardPromoCodes ?? []), ...newlyMinted],
    }));

    const latestCode = newlyMinted[newlyMinted.length - 1];
    void sendTelegramAlert(
      `🎁 مكافأة إحالة مجانية 100% صدرت تلقائيا!\n` +
        `الطالب المستفيد: ${referrerOrder.studentName} (${referrerOrder.trackingCode})\n` +
        `عدد الإحالات المدفوعة: ${qualifiedCount}\n` +
        `الكود المجاني الجديد (100%): ${newlyMinted.join(" ، ")}\n` +
        `ظهر الكود تلقائيا للطالب في صفحة التتبع الخاصة به.`
    );

    return latestCode;
  });
}
