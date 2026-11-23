import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type {
  AcademicCycle,
  AcademicYearCode,
  SolutionDocument,
  StudentOrder,
} from "@/types/order";
import {
  getFirestoreDb,
  getLocalDataDir,
  sanitizeForFirestore,
} from "./firebase-admin";
import { normalizeCourseKey } from "./ufc-catalog";

const BLUEPRINT_COLLECTION = "verified_blueprints";

export interface VerifiedBlueprintEntry {
  id: string;
  key: string;
  cycle?: AcademicCycle;
  year?: AcademicYearCode;
  specialtyId?: string;
  moduleName: string;
  assignmentTitle: string;
  sourceOrderId: string;
  solution: SolutionDocument;
  updatedAt: string;
}

function getLocalBlueprintsPath(): string {
  return path.join(getLocalDataDir(), "verified-blueprints.json");
}

async function readLocalBlueprints(): Promise<VerifiedBlueprintEntry[]> {
  try {
    const raw = await fs.readFile(getLocalBlueprintsPath(), "utf-8");
    return JSON.parse(raw) as VerifiedBlueprintEntry[];
  } catch {
    return [];
  }
}

async function writeLocalBlueprints(entries: VerifiedBlueprintEntry[]): Promise<void> {
  const p = getLocalBlueprintsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(entries, null, 2), "utf-8");
}

function normalizeTitle(t: string): string {
  return t
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

export function buildBlueprintKey(order: Pick<
  StudentOrder,
  "cycle" | "year" | "specialtyId" | "moduleName" | "assignmentTitle"
>): string {
  const base =
    order.cycle && order.year && order.specialtyId
      ? normalizeCourseKey(order.cycle, order.year, order.specialtyId, order.moduleName)
      : `generic|${normalizeTitle(order.moduleName)}`;
  return `${base}||${normalizeTitle(order.assignmentTitle)}`;
}

function makeDocId(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
}

export async function findVerifiedBlueprint(
  order: Pick<
    StudentOrder,
    "cycle" | "year" | "specialtyId" | "moduleName" | "assignmentTitle"
  >
): Promise<VerifiedBlueprintEntry | null> {
  const key = buildBlueprintKey(order);
  const id = makeDocId(key);
  const db = getFirestoreDb();
  if (db) {
    const snap = await db.collection(BLUEPRINT_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as VerifiedBlueprintEntry) : null;
  }
  const all = await readLocalBlueprints();
  return all.find((b) => b.key === key) ?? null;
}

export async function saveVerifiedBlueprintFromOrder(
  order: StudentOrder
): Promise<VerifiedBlueprintEntry> {
  if (!order.solution) {
    throw new Error("لا يوجد حل معتمد في هذا الطلب لحفظه كمرجع سريع للموجة.");
  }
  const key = buildBlueprintKey(order);
  const id = makeDocId(key);
  const entry: VerifiedBlueprintEntry = {
    id,
    key,
    cycle: order.cycle,
    year: order.year,
    specialtyId: order.specialtyId,
    moduleName: order.moduleName.trim(),
    assignmentTitle: order.assignmentTitle.trim(),
    sourceOrderId: order.id,
    solution: order.solution,
    updatedAt: new Date().toISOString(),
  };

  const db = getFirestoreDb();
  if (db) {
    await db.collection(BLUEPRINT_COLLECTION).doc(id).set(sanitizeForFirestore(entry));
    return entry;
  }
  const all = await readLocalBlueprints();
  const idx = all.findIndex((b) => b.id === id);
  if (idx >= 0) all[idx] = entry;
  else all.unshift(entry);
  await writeLocalBlueprints(all);
  return entry;
}
