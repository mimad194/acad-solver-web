import path from "path";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let lastFirebaseConfigError: string | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively strips `undefined` properties from plain objects and `undefined`
 * elements from arrays so Firestore never rejects a document write even when
 * `ignoreUndefinedProperties` is disabled.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = sanitizeForFirestore(v);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Resolves the local fallback data directory. Supports `ACAD_SOLVER_DATA_DIR`
 * for completely isolated test runs without touching `.data/` or `/tmp`.
 */
export function getLocalDataDir(): string {
  const override = process.env.ACAD_SOLVER_DATA_DIR?.trim();
  if (override) return override;
  if (process.env.VERCEL || process.env.NETLIFY) {
    return path.join("/tmp", "acad-solver-data");
  }
  return path.join(process.cwd(), ".data");
}

function parseServiceAccountJson(raw: string): ServiceAccount | null {
  let text = raw.trim();
  // Strip accidental surrounding single/double quotes
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"') && !text.startsWith('{"'))
  ) {
    text = text.slice(1, -1).trim();
  }
  // Support base64-encoded JSON if pasted as base64
  if (!text.startsWith("{")) {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf-8").trim();
      if (decoded.startsWith("{")) text = decoded;
    } catch {
      // ignore
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Handle raw unescaped newlines pasted inside JSON strings
    const sanitized = text.replace(/\r?\n/g, "\\n");
    parsed = JSON.parse(sanitized) as Record<string, unknown>;
  }

  const projectId = String(parsed.project_id ?? parsed.projectId ?? "").trim();
  const clientEmail = String(parsed.client_email ?? parsed.clientEmail ?? "").trim();
  const rawKey = String(parsed.private_key ?? parsed.privateKey ?? "");
  const privateKey = rawKey.replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) {
    lastFirebaseConfigError = "missing_fields_in_json";
    return null;
  }
  lastFirebaseConfigError = null;
  return { projectId, clientEmail, privateKey };
}

function loadServiceAccount(): ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (rawJson) {
    try {
      return parseServiceAccountJson(rawJson);
    } catch (err) {
      lastFirebaseConfigError =
        err instanceof Error ? `json_parse_error: ${err.message}` : "json_parse_error";
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON:", err);
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (projectId && clientEmail && privateKey) {
    lastFirebaseConfigError = null;
    return { projectId, clientEmail, privateKey };
  }
  lastFirebaseConfigError = "env_var_not_set";
  return null;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim()) || loadServiceAccount() !== null;
}

export function getFirebaseDiagnostic(): {
  configured: boolean;
  hasRawEnv: boolean;
  error: string | null;
} {
  const configured = isFirebaseConfigured();
  return {
    configured,
    hasRawEnv: Boolean(
      process.env.FIRESTORE_EMULATOR_HOST ||
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
        process.env.FIREBASE_PROJECT_ID
    ),
    error: configured ? null : lastFirebaseConfigError,
  };
}

const globalForFirestore = globalThis as unknown as {
  __acadSolverFirestoreDb?: Firestore | null;
  __acadSolverFirestoreTestOverride?: Firestore | null | undefined;
};

/**
 * Test-only hook to inject an isolated Firestore instance (e.g. strict in-memory
 * Firestore harness) or pass `undefined` to restore normal resolution.
 */
export function __setFirestoreDbForTests(db: Firestore | null | undefined): void {
  globalForFirestore.__acadSolverFirestoreTestOverride = db;
}

export function getFirestoreDb(): Firestore | null {
  if (globalForFirestore.__acadSolverFirestoreTestOverride !== undefined) {
    return globalForFirestore.__acadSolverFirestoreTestOverride;
  }
  if (globalForFirestore.__acadSolverFirestoreDb) {
    return globalForFirestore.__acadSolverFirestoreDb;
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim();
  if (emulatorHost) {
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || "demo-acad-solver";
    const app =
      getApps().length > 0 ? getApps()[0] : initializeApp({ projectId });
    const db = getFirestore(app);
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured on a reused Firestore instance
    }
    globalForFirestore.__acadSolverFirestoreDb = db;
    return db;
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) return null;

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });

  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured (e.g. across Next.js hot reloads)
  }
  globalForFirestore.__acadSolverFirestoreDb = db;
  return db;
}
