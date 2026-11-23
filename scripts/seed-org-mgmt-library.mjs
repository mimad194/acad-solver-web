#!/usr/bin/env node
/**
 * Idempotent Course Reference Library Seeder for UFC Master Organizational Management (M1 & M2)
 *
 * Usage:
 *   node scripts/seed-org-mgmt-library.mjs --dry-run [--verbose]
 *   node scripts/seed-org-mgmt-library.mjs --apply [--service-account <path-to-json>] [--verbose]
 *
 * Credentials:
 *   - BLOB_READ_WRITE_TOKEN from .env.local or environment
 *   - Firebase Admin via --service-account <json-file>, GOOGLE_APPLICATION_CREDENTIALS,
 *     FIREBASE_SERVICE_ACCOUNT_KEY / FIREBASE_SERVICE_ACCOUNT_JSON, or split FIREBASE_* vars.
 *
 * Source folders are STRICTLY READ-ONLY. Never modifies or deletes any source file.
 * Matches src/lib/ufc-catalog.ts (normalizeCourseKey) and src/lib/course-library.ts (Firestore schema).
 */

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { put } from "@vercel/blob";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const DEFAULT_SOURCE_ROOT =
  "D:\\UFC\\Master\\Master Organizational Management - 2025-2027";
const LIBRARY_COLLECTION = "course_library";
const CYCLE = "master";
const SPECIALTY_ID = "m_org_management";
const SPECIALTY_LABEL = "إدارة المنظمات";
const DOMAIN_LABEL = "ميدان العلوم الاقتصادية، التسيير والعلوم التجارية";
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB strict ceiling

// ============================================================================
// EXACT KEY NORMALIZATION (100% parity with src/lib/ufc-catalog.ts & course-library.ts)
// ============================================================================

export function normalizeModuleName(moduleName) {
  return moduleName
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeCourseKey(cycle, year, specialtyId, moduleName) {
  return `${cycle}|${year}|${specialtyId}|${normalizeModuleName(moduleName)}`;
}

export function makeDocIdFromKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
}

// ============================================================================
// OFFICIAL CURRICULUM CATALOG (M1 & M2 — matches src/lib/ufc-catalog.ts)
// ============================================================================

export const OFFICIAL_MODULES = [
  // M1 — S1
  { year: "M1", semester: "S1", name: "مبادئ الإدارة المعاصرة", slug: "s1-contemporary-management", folderAliases: ["مبادئ الإدارة المعاصرة"] },
  { year: "M1", semester: "S1", name: "نظرية المنظمة", slug: "s1-organization-theory", folderAliases: ["نظرية المنظمة"] },
  { year: "M1", semester: "S1", name: "قانون المنازعات الإدارية", slug: "s1-admin-disputes-law", folderAliases: ["قانون المنازعات الإدارية"] },
  { year: "M1", semester: "S1", name: "إدارة الاجتماعات", slug: "s1-meeting-management", folderAliases: ["إدارة الاجتماعات"] },
  { year: "M1", semester: "S1", name: "منهجية البحث العلمي", slug: "s1-research-methodology", folderAliases: ["منهجية البحث العلمي"] },
  { year: "M1", semester: "S1", name: "قانون الصفقات العمومية", slug: "s1-public-procurement-law", folderAliases: ["قانون الصفقات العمومية"] },
  { year: "M1", semester: "S1", name: "قانون العمل", slug: "s1-labor-law", folderAliases: ["قانون العمل"] },
  { year: "M1", semester: "S1", name: "لغة إنجليزية للأعمال 1", slug: "s1-business-english-1", folderAliases: ["Business English 01", "Business English 1", "لغة إنجليزية للأعمال 1"] },
  { year: "M1", semester: "S1", name: "الذكاء الاصطناعي", slug: "s1-artificial-intelligence", folderAliases: ["الذكاء الاصطناعي"] },

  // M1 — S2
  { year: "M1", semester: "S2", name: "مراقبة التسيير", slug: "s2-management-control", folderAliases: ["مراقبة التسيير"] },
  { year: "M1", semester: "S2", name: "الإدارة الاستراتيجية", slug: "s2-strategic-management", folderAliases: ["الإدارة الإستراتيجية", "الإدارة الاستراتيجية"] },
  { year: "M1", semester: "S2", name: "إدارة الموازنة العامة", slug: "s2-public-budget-management", folderAliases: ["إدارة الموازنة العامة"] },
  { year: "M1", semester: "S2", name: "التحرير الإداري", slug: "s2-administrative-writing", folderAliases: ["التحرير الاداري", "التحرير الإداري"] },
  { year: "M1", semester: "S2", name: "التقنيات الإحصائية", slug: "s2-statistical-techniques", folderAliases: ["التقنيات الإحصائية"] },
  { year: "M1", semester: "S2", name: "قانون الوظيف العمومي", slug: "s2-civil-service-law", folderAliases: ["قانون الوظيف العمومي"] },
  { year: "M1", semester: "S2", name: "النزاهة ومكافحة الفساد", slug: "s2-integrity-anticorruption", folderAliases: ["النزاهة ومكافحة الفساد"] },
  { year: "M1", semester: "S2", name: "لغة إنجليزية للأعمال 2", slug: "s2-business-english-2", folderAliases: ["Business English 02", "Business English 2", "لغة إنجليزية للأعمال 2"] },
  { year: "M1", semester: "S2", name: "الأمن السيبراني", slug: "s2-cybersecurity", folderAliases: ["الأمن السيبيراني", "الأمن السيبراني"] },

  // M2 — S3
  { year: "M2", semester: "S3", name: "قانون الأعمال", slug: "s3-business-law", folderAliases: ["قانون الاعمال", "قانون الأعمال"] },
  { year: "M2", semester: "S3", name: "إدارة الموارد البشرية", slug: "s3-human-resource-management", folderAliases: ["إدارة الموارد البشرية"] },
  { year: "M2", semester: "S3", name: "المحاسبة والتسيير المالي", slug: "s3-accounting-financial-mgmt", folderAliases: ["المحاسبة والتسيير المالي"] },
  { year: "M2", semester: "S3", name: "أصول التفاوض", slug: "s3-negotiation-fundamentals", folderAliases: ["أصول التفاوض"] },
  { year: "M2", semester: "S3", name: "تحليل المعطيات", slug: "s3-data-analysis", folderAliases: ["تحليل المعطيات"] },
  { year: "M2", semester: "S3", name: "الاقتصاد الجزائري والعولمة", slug: "s3-algerian-economy-globalization", folderAliases: ["الاقتصاد الجزائري والعولمة"] },
  { year: "M2", semester: "S3", name: "الاقتصاد الأخضر", slug: "s3-green-economy", folderAliases: ["الاقتصاد الاخضر", "الاقتصاد الأخضر"] },
  { year: "M2", semester: "S3", name: "لغة إنجليزية للأعمال 3", slug: "s3-business-english-3", folderAliases: ["Business English 03", "Business English 3", "لغة إنجليزية للأعمال 3"] },
  { year: "M2", semester: "S3", name: "إدارة الجودة", slug: "s3-quality-management", folderAliases: ["إدارة الجودة"] },

  // M2 — S4
  { year: "M2", semester: "S4", name: "العمل الشخصي (إعداد مذكرة التخرج)", slug: "s4-graduation-thesis", folderAliases: ["العمل الشخصي"] },
  { year: "M2", semester: "S4", name: "الدراسة الميدانية (اختياري)", slug: "s4-field-study", folderAliases: ["الدراسة الميدانية"] },
  { year: "M2", semester: "S4", name: "حضور الملتقيات والدورات (اختياري)", slug: "s4-seminars-training", folderAliases: ["حضور الملتقيات والدورات"] },
  { year: "M2", semester: "S4", name: "أعمال أخرى (اختياري)", slug: "s4-other-works", folderAliases: ["أعمال أخرى"] },
];

const YEAR_ROOTS = [
  { year: "M1", dirName: "M1 2025-2026" },
  { year: "M2", dirName: "M2 2026-2027" },
];

// Explicit root-level official reference files not nested in a module subfolder
const EXPLICIT_ROOT_FILE_MAPPINGS = [
  {
    year: "M1",
    semester: "S1",
    normalizedName: normalizeModuleName("loi 90-11 de travail - ocr .pdf"),
    moduleName: "قانون العمل",
  },
];

// ============================================================================
// STRICT EXCLUSION / CLASSIFICATION RULES
// ============================================================================

const EXCLUDED_DIR_NAMES = new Set([
  "02 dec",
  "14 dec",
  "15 nov",
  "22 nov",
  "loi de travail 90-11", // raw page jpg scans duplicated by loi 90-11 OCR pdf
  "activite",             // student homework drafts
  "notebooklm",           // student AI activity reports
]);

const VIDEO_AUDIO_EXTS = new Set([
  ".mp4", ".mkv", ".avi", ".mov", ".webm", ".wmv", ".flv",
  ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
]);

const ARCHIVE_EXTS = new Set([
  ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz",
]);

const ALLOWED_DOCUMENT_EXTS = new Set([
  ".pdf",
  ".csv",
  ".txt",
]);

// Official reference images explicitly allowlisted (statistical tables only, not banners/thumbnails)
const ALLOWLISTED_IMAGE_NAMES = new Set([
  "standard normal distribution table.png",
]);

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function classifyFile({ absPath, relFromSemester, fileName, size, dirSegments }) {
  const lowerName = fileName.toLowerCase();
  const normName = normalizeModuleName(fileName);
  const ext = path.extname(fileName).toLowerCase();

  // 1. Hidden or temp Office lock files
  if (fileName.startsWith(".") || fileName.startsWith("~$")) {
    return { include: false, reason: "temp_or_hidden" };
  }

  // 2. Excluded folders (homework date folders, raw scan folders, student draft folders)
  for (const seg of dirSegments) {
    if (EXCLUDED_DIR_NAMES.has(seg.trim().toLowerCase())) {
      return { include: false, reason: `excluded_dir:${seg}` };
    }
  }

  // 3. Videos / audio
  if (VIDEO_AUDIO_EXTS.has(ext)) {
    return { include: false, reason: "video_or_audio" };
  }

  // 4. Archives
  if (ARCHIVE_EXTS.has(ext)) {
    return { include: false, reason: "archive" };
  }

  // 5. Huge files > 20 MB
  if (size > MAX_FILE_BYTES) {
    return { include: false, reason: "oversize_gt_20mb" };
  }

  // 6. Student homework / solutions / submissions (STRICTLY EXCLUDED)
  if (
    normName.includes("حل النشاط") ||
    normName.includes("حل نشاط") ||
    normName.includes("حل اسئله") ||
    normName.includes("حل_النشاط") ||
    normName.includes("المشارك_") ||
    lowerName.startsWith("reponse-") ||
    lowerName.includes("activity2_report")
  ) {
    return { include: false, reason: "student_solution_or_submission" };
  }

  // 7. Model solutions to activities (excluded by default for strict zero-solution safety)
  if (normName.includes("الحل النموذجي")) {
    return { include: false, reason: "model_solution_excluded" };
  }

  // 8. Activity / assignment prompts & exercise sheets (not course lecture references)
  if (
    normName.includes("النشاط") ||
    normName.startsWith("نشاط ") ||
    /\b(assignment|assainement|activity)\b/i.test(lowerName)
  ) {
    return { include: false, reason: "activity_or_assignment_prompt" };
  }

  // 9. Schedules / timetables (only root-level schedules or explicitly named رزنامة)
  if (
    normName.includes("رزنامه") ||
    (dirSegments.length === 0 && normName.includes("برنامج"))
  ) {
    return { include: false, reason: "semester_schedule" };
  }

  // 10. Known duplicate copies
  if (
    /\bcopy\b/i.test(lowerName) ||
    lowerName === "loi 90-11 de travail.pdf" || // non-OCR duplicate of loi 90-11 OCR pdf
    lowerName === "a2018 053.pdf"               // full JORA issue duplicating extracted قانون عضوي رقم 18-15.pdf
  ) {
    return { include: false, reason: "duplicate_copy" };
  }

  // 11. Unofficial / third-party study summaries (keep official "مقطع X مع الملخص.pdf")
  if (
    !normName.includes("مقطع") &&
    (normName.startsWith("ملخص") || normName.startsWith("تلخيص"))
  ) {
    return { include: false, reason: "unofficial_summary_pdf" };
  }

  // 12. Images: ONLY allow explicit official reference tables (exclude covers, banners, mindmaps, 4-6 MB slides)
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
    if (ALLOWLISTED_IMAGE_NAMES.has(lowerName)) {
      return { include: true, reason: "official_reference_table_image" };
    }
    return { include: false, reason: "decorative_or_infographic_image" };
  }

  // 13. DOCX / XLSX files:
  // Note: src/lib/gemini-solver.ts SUPPORTED_INLINE_MIMES only sends PDF/image/text/csv to Gemini;
  // S2 DOCX files duplicate existing PDFs, and S3 "عن المقياس.docx" files are syllabus wrappers not parsed by Gemini.
  if (ext === ".docx" || ext === ".doc") {
    return { include: false, reason: "docx_not_inline_supported_or_duplicate" };
  }
  if (ext === ".xlsx" || ext === ".xls") {
    return { include: false, reason: "spreadsheet_excluded" };
  }

  // 14. Allowed official document extensions (PDF, CSV, TXT)
  if (!ALLOWED_DOCUMENT_EXTS.has(ext)) {
    return { include: false, reason: `unsupported_ext:${ext || "none"}` };
  }

  return { include: true, reason: "official_course_reference", absPath, relFromSemester };
}

function resolveModuleForFile(year, semester, topFolder, fileName) {
  // Root-level file directly under S1/S2/S3/S4
  if (!topFolder) {
    const normFile = normalizeModuleName(fileName);
    const explicit = EXPLICIT_ROOT_FILE_MAPPINGS.find(
      (m) =>
        m.year === year &&
        m.semester === semester &&
        m.normalizedName === normFile
    );
    if (!explicit) return null;
    return (
      OFFICIAL_MODULES.find(
        (m) => m.year === year && m.name === explicit.moduleName
      ) ?? null
    );
  }

  const normFolder = normalizeModuleName(topFolder);
  for (const mod of OFFICIAL_MODULES) {
    if (mod.year !== year) continue;
    if (normalizeModuleName(mod.name) === normFolder) return mod;
    if (mod.folderAliases.some((a) => normalizeModuleName(a) === normFolder)) {
      return mod;
    }
  }
  return null;
}

// ============================================================================
// ENVIRONMENT & CREDENTIALS LOADER (NEVER logs secret values)
// ============================================================================

async function loadDotEnvLocal() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  let exists = false;
  try {
    const raw = await fs.readFile(envPath, "utf-8");
    exists = true;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    exists = false;
  }
  return { envLocalExists: exists, envPath };
}

function isVercelSensitivePlaceholder(val) {
  if (!val) return false;
  const cleaned = String(val).trim().replace(/^["']|["']$/g, "").trim();
  return cleaned.toUpperCase() === "[SENSITIVE]";
}

function resolveBlobToken() {
  const direct = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (direct && !isVercelSensitivePlaceholder(direct)) {
    return { token: direct, masked: false };
  }
  if (isVercelSensitivePlaceholder(direct)) {
    return { token: undefined, masked: true };
  }
  const altKey = Object.keys(process.env).find(
    (k) => k.endsWith("_READ_WRITE_TOKEN") && k.toUpperCase().includes("BLOB")
  );
  const altVal = altKey ? process.env[altKey]?.trim() : undefined;
  if (altVal && !isVercelSensitivePlaceholder(altVal)) {
    return { token: altVal, masked: false };
  }
  return { token: undefined, masked: isVercelSensitivePlaceholder(altVal) };
}

function parseServiceAccountJson(raw) {
  let text = raw.trim();
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"') && !text.startsWith('{"'))
  ) {
    text = text.slice(1, -1).trim();
  }
  if (!text.startsWith("{")) {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf-8").trim();
      if (decoded.startsWith("{")) text = decoded;
    } catch {
      // ignore
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = JSON.parse(text.replace(/\r?\n/g, "\\n"));
  }

  const projectId = String(parsed.project_id ?? parsed.projectId ?? "").trim();
  const clientEmail = String(parsed.client_email ?? parsed.clientEmail ?? "").trim();
  const privateKey = String(parsed.private_key ?? parsed.privateKey ?? "")
    .replace(/\\n/g, "\n")
    .trim();

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

async function loadFirebaseServiceAccount(cliServiceAccountPath) {
  // 1. Explicit CLI --service-account <path-to-json-file>
  if (cliServiceAccountPath) {
    const resolvedPath = path.resolve(cliServiceAccountPath);
    try {
      const raw = await fs.readFile(resolvedPath, "utf-8");
      const account = parseServiceAccountJson(raw);
      if (account) {
        return { account, source: "--service-account", masked: false, error: null };
      }
      return {
        account: null,
        source: "--service-account",
        masked: false,
        error: `Invalid Firebase service account JSON (missing project_id/client_email/private_key): ${resolvedPath}`,
      };
    } catch (err) {
      return {
        account: null,
        source: "--service-account",
        masked: false,
        error: `Could not read --service-account file (${resolvedPath}): ${err instanceof Error ? err.code || err.message : "read_error"}`,
      };
    }
  }

  // 2. GOOGLE_APPLICATION_CREDENTIALS file path
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (gacPath && !isVercelSensitivePlaceholder(gacPath)) {
    const resolvedPath = path.resolve(gacPath);
    try {
      const raw = await fs.readFile(resolvedPath, "utf-8");
      const account = parseServiceAccountJson(raw);
      if (account) {
        return {
          account,
          source: "GOOGLE_APPLICATION_CREDENTIALS",
          masked: false,
          error: null,
        };
      }
      return {
        account: null,
        source: "GOOGLE_APPLICATION_CREDENTIALS",
        masked: false,
        error: `Invalid Firebase service account JSON in GOOGLE_APPLICATION_CREDENTIALS (${resolvedPath})`,
      };
    } catch (err) {
      return {
        account: null,
        source: "GOOGLE_APPLICATION_CREDENTIALS",
        masked: false,
        error: `Could not read GOOGLE_APPLICATION_CREDENTIALS file (${resolvedPath}): ${err instanceof Error ? err.code || err.message : "read_error"}`,
      };
    }
  }

  // 3. Inline JSON env vars (detect Vercel "[SENSITIVE]" masked placeholder)
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  const rawJsonAlt = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  const sensitiveMasked =
    isVercelSensitivePlaceholder(rawKey) ||
    isVercelSensitivePlaceholder(rawJsonAlt) ||
    isVercelSensitivePlaceholder(rawPrivateKey);

  const rawJson =
    (rawKey && !isVercelSensitivePlaceholder(rawKey) ? rawKey : "") ||
    (rawJsonAlt && !isVercelSensitivePlaceholder(rawJsonAlt) ? rawJsonAlt : "");

  if (rawJson) {
    try {
      const account = parseServiceAccountJson(rawJson);
      if (account) {
        return { account, source: "env", masked: false, error: null };
      }
    } catch {
      return {
        account: null,
        source: "env",
        masked: false,
        error: "FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as valid JSON.",
      };
    }
  }

  // 4. Split FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = rawPrivateKey?.replace(/\\n/g, "\n").trim();
  if (
    projectId &&
    clientEmail &&
    privateKey &&
    !isVercelSensitivePlaceholder(projectId) &&
    !isVercelSensitivePlaceholder(clientEmail) &&
    !isVercelSensitivePlaceholder(privateKey)
  ) {
    return {
      account: { projectId, clientEmail, privateKey },
      source: "env-split",
      masked: false,
      error: null,
    };
  }

  return { account: null, source: null, masked: sensitiveMasked, error: null };
}

// ============================================================================
// RECURSIVE READ-ONLY SCANNER
// ============================================================================

async function walkFilesReadOnly(dirPath) {
  const results = [];
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFilesReadOnly(fullPath)));
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      results.push({ absPath: fullPath, size: stat.size });
    }
  }
  return results;
}

function makeBlobPathname(year, moduleSlug, originalName) {
  const ext = path.extname(originalName).toLowerCase() || ".bin";
  const base = path.basename(originalName, path.extname(originalName));
  const asciiSlug = base
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  const hash = crypto
    .createHash("sha256")
    .update(`${year}|${moduleSlug}|${originalName}`)
    .digest("hex")
    .slice(0, 10);
  const safeName = asciiSlug ? `${asciiSlug}-${hash}${ext}` : `ref-${hash}${ext}`;
  return `acad-solver/library/${SPECIALTY_ID}/${year}/${moduleSlug}/${safeName}`;
}

async function scanInventory(sourceRoot) {
  const byModule = new Map();
  for (const mod of OFFICIAL_MODULES) {
    const key = normalizeCourseKey(CYCLE, mod.year, SPECIALTY_ID, mod.name);
    const docId = makeDocIdFromKey(key);
    byModule.set(`${mod.year}|${mod.name}`, {
      ...mod,
      key,
      docId,
      files: [],
    });
  }

  const excluded = [];
  const unmapped = [];
  let totalScanned = 0;

  for (const { year, dirName } of YEAR_ROOTS) {
    const yearDir = path.join(sourceRoot, dirName);
    let semEntries = [];
    try {
      semEntries = await fs.readdir(yearDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const semEntry of semEntries) {
      if (!semEntry.isDirectory()) continue;
      const semester = semEntry.name.toUpperCase();
      const semDir = path.join(yearDir, semEntry.name);
      const allFiles = await walkFilesReadOnly(semDir);

      for (const { absPath, size } of allFiles) {
        totalScanned++;
        const relFromSemester = path.relative(semDir, absPath);
        const parts = relFromSemester.split(path.sep);
        const fileName = parts[parts.length - 1];
        const dirSegments = parts.slice(0, -1);
        const topFolder = dirSegments.length > 0 ? dirSegments[0] : null;

        const verdict = classifyFile({
          absPath,
          relFromSemester,
          fileName,
          size,
          dirSegments,
        });

        if (!verdict.include) {
          excluded.push({
            year,
            semester,
            relPath: relFromSemester,
            size,
            reason: verdict.reason,
          });
          continue;
        }

        const mod = resolveModuleForFile(year, semester, topFolder, fileName);
        if (!mod) {
          unmapped.push({
            year,
            semester,
            relPath: relFromSemester,
            size,
          });
          continue;
        }

        const bucket = byModule.get(`${mod.year}|${mod.name}`);
        // Deduplicate within module by normalized originalName + size
        const dedupSig = `${normalizeModuleName(fileName)}|${size}`;
        if (bucket.files.some((f) => f.dedupSig === dedupSig)) {
          excluded.push({
            year,
            semester,
            relPath: relFromSemester,
            size,
            reason: "duplicate_within_module",
          });
          continue;
        }

        const ext = path.extname(fileName).toLowerCase();
        bucket.files.push({
          absPath,
          relPath: relFromSemester,
          originalName: fileName,
          size,
          mimeType: MIME_BY_EXT[ext] || "application/octet-stream",
          blobPathname: makeBlobPathname(year, mod.slug, fileName),
          dedupSig,
        });
      }
    }
  }

  for (const bucket of byModule.values()) {
    bucket.files.sort((a, b) => a.originalName.localeCompare(b.originalName, "ar"));
  }

  return {
    modules: Array.from(byModule.values()),
    excluded,
    unmapped,
    totalScanned,
  };
}

// ============================================================================
// APPLY (VERCEL BLOB + FIRESTORE IDEMPOTENT MERGE)
// ============================================================================

async function applyToCloud(modules, blobToken, serviceAccount) {
  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);

  let uploadedCount = 0;
  let skippedExistingCount = 0;
  let updatedDocsCount = 0;
  let uploadedBytes = 0;

  for (const mod of modules) {
    if (mod.files.length === 0) continue;

    const docRef = db.collection(LIBRARY_COLLECTION).doc(mod.docId);
    const snap = await docRef.get();
    const existingEntry = snap.exists ? snap.data() : null;
    const existingFiles = Array.isArray(existingEntry?.referenceFiles)
      ? existingEntry.referenceFiles
      : [];

    const existingByNameSize = new Set(
      existingFiles.map((f) => `${String(f.originalName || "").trim().toLowerCase()}|${Number(f.size || 0)}`)
    );
    const existingByName = new Set(
      existingFiles.map((f) => String(f.originalName || "").trim().toLowerCase())
    );

    const newMetas = [];
    for (const file of mod.files) {
      const nameLower = file.originalName.trim().toLowerCase();
      const nameSizeKey = `${nameLower}|${file.size}`;
      if (existingByNameSize.has(nameSizeKey) || existingByName.has(nameLower)) {
        skippedExistingCount++;
        continue;
      }

      const buf = await fs.readFile(file.absPath);
      const blob = await put(file.blobPathname, buf, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: file.mimeType,
        token: blobToken,
      });

      newMetas.push({
        id: crypto.randomUUID(),
        originalName: file.originalName,
        storedName: file.blobPathname,
        blobUrl: blob.url,
        mimeType: file.mimeType,
        size: buf.length,
        category: "reference",
        uploadedAt: new Date().toISOString(),
      });

      uploadedCount++;
      uploadedBytes += buf.length;
      console.log(`  [UPLOADED] ${mod.year}/${mod.semester} ${mod.name} -> ${file.originalName} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
    }

    if (newMetas.length === 0 && existingEntry) {
      console.log(`  [UP-TO-DATE] ${mod.year}/${mod.semester} ${mod.name} (${existingFiles.length} refs)`);
      continue;
    }

    // Merge without duplicates (exact same invariant as src/lib/course-library.ts)
    const mergedMap = new Map();
    for (const f of existingFiles) {
      const k = `${String(f.originalName || "").trim().toLowerCase()}|${Number(f.size || 0)}`;
      mergedMap.set(k, f);
    }
    for (const f of newMetas) {
      const k = `${String(f.originalName || "").trim().toLowerCase()}|${Number(f.size || 0)}`;
      mergedMap.set(k, f);
    }

    const entry = {
      id: mod.docId,
      key: mod.key,
      cycle: CYCLE,
      year: mod.year,
      specialtyId: SPECIALTY_ID,
      specialtyLabel: SPECIALTY_LABEL,
      domain: DOMAIN_LABEL,
      moduleName: mod.name,
      referenceFiles: Array.from(mergedMap.values()),
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(entry);
    updatedDocsCount++;
    console.log(
      `  [SAVED] course_library/${mod.docId} | ${mod.year} | ${mod.name} | total refs: ${entry.referenceFiles.length}`
    );
  }

  return { uploadedCount, skippedExistingCount, updatedDocsCount, uploadedBytes };
}

// ============================================================================
// MAIN CLI
// ============================================================================

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function getCliOptionValue(args, flagName) {
  const eqPrefix = `${flagName}=`;
  const eqArg = args.find((a) => a.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length).trim() || null;
  const idx = args.indexOf(flagName);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
    return args[idx + 1].trim();
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes("--apply");
  const dryRunMode = args.includes("--dry-run") || !applyMode;
  const verbose = args.includes("--verbose");
  const sourceRoot =
    getCliOptionValue(args, "--source-root") || DEFAULT_SOURCE_ROOT;
  const cliServiceAccountPath = getCliOptionValue(args, "--service-account");

  const { envLocalExists } = await loadDotEnvLocal();
  const blobInfo = resolveBlobToken();
  const blobToken = blobInfo.token;
  const firebaseInfo = await loadFirebaseServiceAccount(cliServiceAccountPath);
  const firebaseAccount = firebaseInfo.account;

  const blobStatus = blobToken
    ? "present"
    : blobInfo.masked
      ? "masked ([SENSITIVE])"
      : "missing";
  const firebaseStatus = firebaseAccount
    ? `present (${firebaseInfo.source})`
    : firebaseInfo.masked
      ? "masked ([SENSITIVE])"
      : "missing";

  console.log("=== UFC Master Organizational Management Library Seeder ===");
  console.log(`Mode: ${applyMode ? "APPLY (LIVE UPLOAD)" : "DRY-RUN (READ-ONLY)"}`);
  console.log(`Source root: ${sourceRoot}`);
  console.log(
    `Credentials: .env.local=${envLocalExists ? "present" : "missing"} | BLOB_READ_WRITE_TOKEN=${blobStatus} | FIREBASE_SERVICE_ACCOUNT=${firebaseStatus}`
  );
  if (firebaseInfo.masked) {
    console.log(
      'Note: Vercel CLI wrote "[SENSITIVE]" placeholders for masked Firebase secret env vars in .env.local.'
    );
    console.log(
      '      Pass your downloaded Firebase service account JSON file directly without hand-escaping:'
    );
    console.log(
      '        node scripts/seed-org-mgmt-library.mjs --apply --service-account "C:\\path\\to\\service-account.json"'
    );
    console.log(
      "      (or set GOOGLE_APPLICATION_CREDENTIALS to that JSON file path)."
    );
  }
  if (firebaseInfo.error) {
    console.log(`Note: ${firebaseInfo.error}`);
  }
  console.log("");

  const { modules, excluded, unmapped, totalScanned } = await scanInventory(sourceRoot);

  let totalIncludedFiles = 0;
  let totalIncludedBytes = 0;
  let populatedModules = 0;

  console.log("Per-Module Mapping Summary:");
  console.log("Year | Sem | Files | Size (MB) | Firestore Doc ID         | Official Module Name");
  console.log("-----|-----|-------|-----------|--------------------------|----------------------------------------");

  for (const mod of modules) {
    const modBytes = mod.files.reduce((sum, f) => sum + f.size, 0);
    totalIncludedFiles += mod.files.length;
    totalIncludedBytes += modBytes;
    if (mod.files.length > 0) populatedModules++;
    console.log(
      `${mod.year.padEnd(4)} | ${mod.semester.padEnd(3)} | ${String(mod.files.length).padStart(5)} | ${formatMb(modBytes).padStart(9)} | ${mod.docId} | ${mod.name}`
    );
    if (verbose && mod.files.length > 0) {
      for (const f of mod.files) {
        console.log(`       + [${formatMb(f.size)} MB] ${f.originalName} -> ${f.blobPathname}`);
      }
    }
  }

  console.log("");
  console.log(`Total files scanned:  ${totalScanned}`);
  console.log(`Total INCLUDED files: ${totalIncludedFiles} across ${populatedModules}/${modules.length} official modules (${formatMb(totalIncludedBytes)} MB)`);
  console.log(`Total EXCLUDED files: ${excluded.length}`);
  console.log(`Total UNMAPPED files: ${unmapped.length}`);

  // Group exclusion breakdown by reason
  const reasonCounts = new Map();
  for (const ex of excluded) {
    reasonCounts.set(ex.reason, (reasonCounts.get(ex.reason) || 0) + 1);
  }
  console.log("\nExclusion Breakdown:");
  for (const [reason, count] of Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`);
  }

  if (verbose) {
    console.log("\nExcluded Files Detail:");
    for (const ex of excluded) {
      console.log(`  - [${ex.reason}] ${ex.year}/${ex.semester}/${ex.relPath} (${formatMb(ex.size)} MB)`);
    }
  }

  if (unmapped.length > 0) {
    console.log("\nUNMAPPED FILES (require review):");
    for (const u of unmapped) {
      console.log(`  ! ${u.year}/${u.semester}/${u.relPath} (${formatMb(u.size)} MB)`);
    }
  }

  if (dryRunMode && !applyMode) {
    console.log("\nDry-run complete. Re-run with --apply once credentials are configured.");
    return;
  }

  // Guard rails before --apply
  if (!blobToken || !firebaseAccount) {
    console.error(
      "\nABORTED --apply: Missing required credentials (BLOB_READ_WRITE_TOKEN and/or Firebase service account)."
    );
    if (!firebaseAccount) {
      console.error(
        'Provide Firebase Admin credentials via --service-account "<path-to-json>", GOOGLE_APPLICATION_CREDENTIALS, or a real FIREBASE_SERVICE_ACCOUNT_KEY in .env.local.'
      );
    }
    process.exit(1);
  }
  if (unmapped.length > 0) {
    console.error("\nABORTED --apply: Unmapped files found. Resolve mapping before applying.");
    process.exit(1);
  }

  console.log("\nStarting idempotent cloud seed (--apply)...");
  const result = await applyToCloud(modules, blobToken, firebaseAccount);
  console.log("\nApply complete:");
  console.log(`  Uploaded new files:       ${result.uploadedCount} (${formatMb(result.uploadedBytes)} MB)`);
  console.log(`  Skipped existing files:   ${result.skippedExistingCount}`);
  console.log(`  Firestore docs upserted:  ${result.updatedDocsCount}`);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
