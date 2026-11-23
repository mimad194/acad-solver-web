import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type {
  AcademicCycle,
  AcademicYearCode,
  CourseLibraryEntry,
  UploadedFileMeta,
} from "@/types/order";
import { getFirestoreDb } from "./firebase-admin";
import { findCatalogSpecialty, normalizeCourseKey } from "./ufc-catalog";

const LIBRARY_COLLECTION = "course_library";

function getLocalLibraryPath(): string {
  const dir =
    process.env.VERCEL || process.env.NETLIFY
      ? path.join("/tmp", "acad-solver-data")
      : path.join(process.cwd(), ".data");
  return path.join(dir, "course-library.json");
}

async function readLocalLibrary(): Promise<CourseLibraryEntry[]> {
  try {
    const raw = await fs.readFile(getLocalLibraryPath(), "utf-8");
    return JSON.parse(raw) as CourseLibraryEntry[];
  } catch {
    return [];
  }
}

async function writeLocalLibrary(entries: CourseLibraryEntry[]): Promise<void> {
  const p = getLocalLibraryPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(entries, null, 2), "utf-8");
}

function makeDocIdFromKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
}

export async function listCourseLibrary(filter?: {
  cycle?: AcademicCycle;
  year?: AcademicYearCode;
  specialtyId?: string;
}): Promise<CourseLibraryEntry[]> {
  const db = getFirestoreDb();
  let entries: CourseLibraryEntry[] = [];

  if (db) {
    try {
      let ref: FirebaseFirestore.Query = db.collection(LIBRARY_COLLECTION);
      if (filter?.cycle) ref = ref.where("cycle", "==", filter.cycle);
      if (filter?.year) ref = ref.where("year", "==", filter.year);
      if (filter?.specialtyId) ref = ref.where("specialtyId", "==", filter.specialtyId);
      const snap = await ref.get();
      entries = snap.docs.map((d) => d.data() as CourseLibraryEntry);
    } catch {
      // Fallback to full scan if composite index is not created yet
      const snap = await db.collection(LIBRARY_COLLECTION).get();
      entries = snap.docs.map((d) => d.data() as CourseLibraryEntry);
      if (filter?.cycle) entries = entries.filter((e) => e.cycle === filter.cycle);
      if (filter?.year) entries = entries.filter((e) => e.year === filter.year);
      if (filter?.specialtyId) {
        entries = entries.filter((e) => e.specialtyId === filter.specialtyId);
      }
    }
  } else {
    entries = await readLocalLibrary();
    if (filter?.cycle) entries = entries.filter((e) => e.cycle === filter.cycle);
    if (filter?.year) entries = entries.filter((e) => e.year === filter.year);
    if (filter?.specialtyId) {
      entries = entries.filter((e) => e.specialtyId === filter.specialtyId);
    }
  }

  return entries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function findCourseLibraryEntry(params: {
  cycle?: AcademicCycle;
  year?: AcademicYearCode;
  specialtyId?: string;
  moduleName: string;
}): Promise<CourseLibraryEntry | null> {
  if (!params.cycle || !params.year || !params.specialtyId || !params.moduleName.trim()) {
    return null;
  }
  const key = normalizeCourseKey(
    params.cycle,
    params.year,
    params.specialtyId,
    params.moduleName
  );
  const docId = makeDocIdFromKey(key);
  const db = getFirestoreDb();

  if (db) {
    const doc = await db.collection(LIBRARY_COLLECTION).doc(docId).get();
    if (doc.exists) return doc.data() as CourseLibraryEntry;
    return null;
  }

  const all = await readLocalLibrary();
  return all.find((e) => e.key === key) ?? null;
}

export async function upsertCourseLibraryReferences(params: {
  cycle: AcademicCycle;
  year: AcademicYearCode;
  specialtyId: string;
  moduleName: string;
  referenceFiles: UploadedFileMeta[];
}): Promise<CourseLibraryEntry> {
  const key = normalizeCourseKey(
    params.cycle,
    params.year,
    params.specialtyId,
    params.moduleName
  );
  const id = makeDocIdFromKey(key);
  const spec = findCatalogSpecialty(params.cycle, params.year, params.specialtyId);
  const existing = await findCourseLibraryEntry(params);

  // Deduplicate by blobUrl or originalName so zero duplicate references accumulate
  const mergedMap = new Map<string, UploadedFileMeta>();
  for (const f of existing?.referenceFiles ?? []) {
    mergedMap.set(f.blobUrl || f.originalName.toLowerCase(), f);
  }
  for (const f of params.referenceFiles) {
    mergedMap.set(f.blobUrl || f.originalName.toLowerCase(), {
      ...f,
      category: "reference",
    });
  }

  const entry: CourseLibraryEntry = {
    id,
    key,
    cycle: params.cycle,
    year: params.year,
    specialtyId: params.specialtyId,
    specialtyLabel: spec?.label ?? existing?.specialtyLabel ?? params.specialtyId,
    domain: spec?.domain ?? existing?.domain ?? "",
    moduleName: params.moduleName.trim(),
    referenceFiles: Array.from(mergedMap.values()),
    updatedAt: new Date().toISOString(),
  };

  const db = getFirestoreDb();
  if (db) {
    await db.collection(LIBRARY_COLLECTION).doc(id).set(entry);
    return entry;
  }

  const all = await readLocalLibrary();
  const idx = all.findIndex((e) => e.id === id);
  if (idx >= 0) all[idx] = entry;
  else all.unshift(entry);
  await writeLocalLibrary(all);
  return entry;
}
