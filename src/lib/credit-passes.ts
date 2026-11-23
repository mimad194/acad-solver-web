import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { CreditPassEntry, StudentOrder } from "@/types/order";
import { getFirestoreDb } from "./firebase-admin";
import {
  getPublicAppConfigAsync,
  resolvePackagePriceAsync,
} from "./pricing-config";
import { updateOrder } from "./store";
import { sendTelegramAlert } from "./notify";

const PASS_COLLECTION = "credit_passes";

function getLocalPassesPath(): string {
  const dir =
    process.env.VERCEL || process.env.NETLIFY
      ? path.join("/tmp", "acad-solver-data")
      : path.join(process.cwd(), ".data");
  return path.join(dir, "credit-passes.json");
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

function normalizePassCode(raw: string): string {
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

function computeSemesterExpiryIso(configuredYmd?: string): string {
  if (configuredYmd && /^\d{4}-\d{2}-\d{2}$/.test(configuredYmd.trim())) {
    const dt = new Date(`${configuredYmd.trim()}T23:59:59.000Z`);
    if (!Number.isNaN(dt.getTime())) {
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

async function saveCreditPass(entry: CreditPassEntry): Promise<void> {
  const db = getFirestoreDb();
  if (db) {
    await db.collection(PASS_COLLECTION).doc(entry.passCode).set(entry);
    return;
  }
  const all = await readLocalPasses();
  const idx = all.findIndex((p) => p.passCode === entry.passCode);
  if (idx >= 0) all[idx] = entry;
  else all.unshift(entry);
  await writeLocalPasses(all);
}

export async function validateCreditPass(rawCode: string): Promise<{
  valid: boolean;
  pass?: CreditPassEntry;
  remainingCredits: number;
  message: string;
}> {
  const passCode = normalizePassCode(rawCode);
  const pass = await getCreditPass(passCode);
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

  const pkg = await resolvePackagePriceAsync(order.packageId);
  if (pkg.creditsCount <= 1) return null;

  const cfg = await getPublicAppConfigAsync();
  const now = new Date().toISOString();
  const passCode = generatePassCode();
  const expiresAt = computeSemesterExpiryIso(cfg.semesterPassExpiresAt);

  const entry: CreditPassEntry = {
    passCode,
    ownerOrderId: order.id,
    studentName: order.studentName,
    contact: order.contact,
    university: order.university,
    cycle: order.cycle,
    year: order.year,
    specialtyId: order.specialtyId,
    specialty: order.specialty,
    packageId: pkg.packageId,
    totalCredits: pkg.creditsCount,
    usedCredits: 1, // First activity is the current order
    consumedOrderIds: [order.id],
    expiresAt,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

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

export async function consumeOneCredit(
  rawPassCode: string,
  newOrderId: string
): Promise<CreditPassEntry | null> {
  const check = await validateCreditPass(rawPassCode);
  if (!check.valid || !check.pass) return null;

  const updated: CreditPassEntry = {
    ...check.pass,
    usedCredits: check.pass.usedCredits + 1,
    consumedOrderIds: [...check.pass.consumedOrderIds, newOrderId],
    updatedAt: new Date().toISOString(),
  };
  await saveCreditPass(updated);
  return updated;
}
