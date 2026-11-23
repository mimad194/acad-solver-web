import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { CreditPassEntry, StudentOrder } from "@/types/order";
import {
  getFirestoreDb,
  getLocalDataDir,
  sanitizeForFirestore,
} from "./firebase-admin";
import {
  getPublicAppConfigAsync,
  resolvePackagePriceAsync,
} from "./pricing-config";
import { updateOrder } from "./store";
import { sendTelegramAlert } from "./notify";

const PASS_COLLECTION = "credit_passes";

let localPassLock: Promise<void> = Promise.resolve();

async function withLocalPassLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = localPassLock;
  let release!: () => void;
  localPassLock = new Promise<void>((res) => {
    release = res;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function getLocalPassesPath(): string {
  return path.join(getLocalDataDir(), "credit-passes.json");
}

async function readLocalPasses(): Promise<CreditPassEntry[]> {
  try {
    const raw = await fs.readFile(getLocalPassesPath(), "utf-8");
    return JSON.parse(raw) as CreditPassEntry[];
  } catch {
    return [];
  }
}

async function writeLocalPasses(entries: CreditPassEntry[]): Promise<void> {
  const p = getLocalPassesPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(entries, null, 2), "utf-8");
}

export function normalizePassCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function generatePassCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "PASS-";
  for (let i = 0; i < 5; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

async function generateUniquePassCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generatePassCode();
    const existing = await getCreditPass(candidate);
    if (!existing) return candidate;
  }
  return `PASS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function computeSemesterExpiryIso(configuredYmd?: string): string {
  if (configuredYmd && /^\d{4}-\d{2}-\d{2}$/.test(configuredYmd.trim())) {
    const dt = new Date(`${configuredYmd.trim()}T23:59:59.000Z`);
    // Guard against stale/past semester dates issuing already-expired passes
    if (!Number.isNaN(dt.getTime()) && dt.getTime() > Date.now()) {
      return dt.toISOString();
    }
  }
  // Default: 75 days (covers the full 60-day wave window + buffer before exams)
  return new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString();
}

export async function getCreditPass(rawCode: string): Promise<CreditPassEntry | null> {
  const passCode = normalizePassCode(rawCode);
  if (!passCode) return null;
  const db = getFirestoreDb();
  if (db) {
    const doc = await db.collection(PASS_COLLECTION).doc(passCode).get();
    return doc.exists ? (doc.data() as CreditPassEntry) : null;
  }
  const all = await readLocalPasses();
  return all.find((p) => p.passCode === passCode) ?? null;
}

async function findCreditPassByOwnerOrderId(
  ownerOrderId: string
): Promise<CreditPassEntry | null> {
  if (!ownerOrderId) return null;
  const db = getFirestoreDb();
  if (db) {
    const snap = await db
      .collection(PASS_COLLECTION)
      .where("ownerOrderId", "==", ownerOrderId)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as CreditPassEntry);
  }
  const all = await readLocalPasses();
  return all.find((p) => p.ownerOrderId === ownerOrderId) ?? null;
}

async function saveCreditPass(entry: CreditPassEntry): Promise<void> {
  const clean = sanitizeForFirestore(entry);
  const db = getFirestoreDb();
  if (db) {
    await db.collection(PASS_COLLECTION).doc(clean.passCode).set(clean);
    return;
  }
  await withLocalPassLock(async () => {
    const all = await readLocalPasses();
    const idx = all.findIndex((p) => p.passCode === clean.passCode);
    if (idx >= 0) all[idx] = clean;
    else all.unshift(clean);
    await writeLocalPasses(all);
  });
}

export function evaluateCreditPassEntry(
  pass: CreditPassEntry | null
): {
  valid: boolean;
  pass?: CreditPassEntry;
  remainingCredits: number;
  message: string;
} {
  if (!pass) {
    return { valid: false, remainingCredits: 0, message: "رمز الرصيد غير موجود." };
  }
  if (!pass.active) {
    return { valid: false, pass, remainingCredits: 0, message: "رمز الرصيد متوقف حاليا." };
  }
  if (new Date() > new Date(pass.expiresAt)) {
    const expDate = pass.expiresAt.slice(0, 10);
    return {
      valid: false,
      pass,
      remainingCredits: 0,
      message: `انتهت صلاحية رصيد هذا السداسي بتاريخ ${expDate} (الرصيد صالح خلال السداسي قبل الامتحانات فقط).`,
    };
  }
  const remaining = Math.max(0, pass.totalCredits - pass.usedCredits);
  if (remaining <= 0) {
    return {
      valid: false,
      pass,
      remainingCredits: 0,
      message: `تم استنفاد كامل رصيد الأنشطة (${pass.totalCredits}/${pass.totalCredits}).`,
    };
  }
  return {
    valid: true,
    pass,
    remainingCredits: remaining,
    message: `تم تفعيل رصيدك (${pass.passCode}): سيتم خصم نشاط واحد مجانا (يتبقى لك ${remaining - 1} من أصل ${pass.totalCredits} نشاط حتى ${pass.expiresAt.slice(0, 10)}).`,
  };
}

export async function validateCreditPass(rawCode: string): Promise<{
  valid: boolean;
  pass?: CreditPassEntry;
  remainingCredits: number;
  message: string;
}> {
  const passCode = normalizePassCode(rawCode);
  const pass = await getCreditPass(passCode);
  return evaluateCreditPassEntry(pass);
}

/**
 * Automatically issues a semester-scoped Pass Code when a multi-activity order (3 or 17 credits)
 * is marked paid/waived. Idempotent: never issues duplicate passes for the same order.
 */
export async function issueCreditPassForOrder(
  order: StudentOrder
): Promise<CreditPassEntry | null> {
  if (order.creditPassUsed) return null; // Order itself consumed a credit, doesn't mint a new pass
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "waived") return null;

  if (order.issuedPassCode) {
    return getCreditPass(order.issuedPassCode);
  }

  // Secondary idempotency check in case pass was persisted before order update completed
  const existingByOwner = await findCreditPassByOwnerOrderId(order.id);
  if (existingByOwner) {
    await updateOrder(order.id, (cur) => ({
      ...cur,
      issuedPassCode: existingByOwner.passCode,
    }));
    return existingByOwner;
  }

  const pkg = await resolvePackagePriceAsync(order.packageId);
  if (pkg.creditsCount <= 1) return null;

  const cfg = await getPublicAppConfigAsync();
  const now = new Date().toISOString();
  const passCode = await generateUniquePassCode();
  const expiresAt = computeSemesterExpiryIso(cfg.semesterPassExpiresAt);

  const entry = sanitizeForFirestore<CreditPassEntry>({
    passCode,
    ownerOrderId: order.id,
    studentName: order.studentName,
    contact: order.contact,
    university: order.university,
    ...(order.cycle ? { cycle: order.cycle } : {}),
    ...(order.year ? { year: order.year } : {}),
    ...(order.specialtyId ? { specialtyId: order.specialtyId } : {}),
    specialty: order.specialty,
    packageId: pkg.packageId,
    totalCredits: pkg.creditsCount,
    usedCredits: 1, // First activity is the current order
    consumedOrderIds: [order.id],
    expiresAt,
    active: true,
    createdAt: now,
    updatedAt: now,
  });

  await saveCreditPass(entry);
  await updateOrder(order.id, (cur) => ({
    ...cur,
    issuedPassCode: passCode,
  }));

  void sendTelegramAlert(
    `🎟️ تم إصدار رمز رصيد أنشطة تلقائيا!\n` +
      `الطالب: ${order.studentName} (${order.trackingCode})\n` +
      `الرمز: ${passCode}\n` +
      `الرصيد: ${entry.totalCredits - entry.usedCredits} متبقي من أصل ${entry.totalCredits} نشاط\n` +
      `صالح حتى: ${expiresAt.slice(0, 10)}`
  );

  return entry;
}

/**
 * Atomically consumes one credit from a valid pass code.
 * Uses a Firestore transaction in production and a serialized lock in local mode
 * so concurrent requests can never double-spend the last remaining credit.
 */
export async function consumeOneCredit(
  rawPassCode: string,
  newOrderId: string
): Promise<CreditPassEntry | null> {
  const passCode = normalizePassCode(rawPassCode);
  if (!passCode || !newOrderId) return null;

  const db = getFirestoreDb();
  if (db) {
    const ref = db.collection(PASS_COLLECTION).doc(passCode);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const pass = snap.data() as CreditPassEntry;
      // Idempotent guard if retried with same orderId
      if (pass.consumedOrderIds.includes(newOrderId)) {
        return pass;
      }
      const check = evaluateCreditPassEntry(pass);
      if (!check.valid) return null;

      const updated = sanitizeForFirestore<CreditPassEntry>({
        ...pass,
        usedCredits: pass.usedCredits + 1,
        consumedOrderIds: [...pass.consumedOrderIds, newOrderId],
        updatedAt: new Date().toISOString(),
      });
      tx.set(ref, updated);
      return updated;
    });
  }

  return withLocalPassLock(async () => {
    const all = await readLocalPasses();
    const idx = all.findIndex((p) => p.passCode === passCode);
    if (idx < 0) return null;
    const pass = all[idx];
    if (pass.consumedOrderIds.includes(newOrderId)) {
      return pass;
    }
    const check = evaluateCreditPassEntry(pass);
    if (!check.valid) return null;

    const updated = sanitizeForFirestore<CreditPassEntry>({
      ...pass,
      usedCredits: pass.usedCredits + 1,
      consumedOrderIds: [...pass.consumedOrderIds, newOrderId],
      updatedAt: new Date().toISOString(),
    });
    all[idx] = updated;
    await writeLocalPasses(all);
    return updated;
  });
}

/**
 * Compensating rollback if order creation fails after consuming a credit.
 */
export async function refundOneCredit(
  rawPassCode: string,
  orderId: string
): Promise<boolean> {
  const passCode = normalizePassCode(rawPassCode);
  if (!passCode || !orderId) return false;

  const db = getFirestoreDb();
  if (db) {
    const ref = db.collection(PASS_COLLECTION).doc(passCode);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const pass = snap.data() as CreditPassEntry;
      if (!pass.consumedOrderIds.includes(orderId)) return false;

      const updated = sanitizeForFirestore<CreditPassEntry>({
        ...pass,
        usedCredits: Math.max(0, pass.usedCredits - 1),
        consumedOrderIds: pass.consumedOrderIds.filter((id) => id !== orderId),
        updatedAt: new Date().toISOString(),
      });
      tx.set(ref, updated);
      return true;
    });
  }

  return withLocalPassLock(async () => {
    const all = await readLocalPasses();
    const idx = all.findIndex((p) => p.passCode === passCode);
    if (idx < 0) return false;
    const pass = all[idx];
    if (!pass.consumedOrderIds.includes(orderId)) return false;

    all[idx] = sanitizeForFirestore<CreditPassEntry>({
      ...pass,
      usedCredits: Math.max(0, pass.usedCredits - 1),
      consumedOrderIds: pass.consumedOrderIds.filter((id) => id !== orderId),
      updatedAt: new Date().toISOString(),
    });
    await writeLocalPasses(all);
    return true;
  });
}
