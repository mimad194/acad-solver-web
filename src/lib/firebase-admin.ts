import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let lastFirebaseConfigError: string | null = null;

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
  return loadServiceAccount() !== null;
}

export function getFirebaseDiagnostic(): {
  configured: boolean;
  hasRawEnv: boolean;
  error: string | null;
} {
  const configured = loadServiceAccount() !== null;
  return {
    configured,
    hasRawEnv: Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_PROJECT_ID
    ),
    error: configured ? null : lastFirebaseConfigError,
  };
}

let cachedDb: Firestore | null = null;

export function getFirestoreDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) return null;

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({ credential: cert(serviceAccount) });

  cachedDb = getFirestore(app);
  return cachedDb;
}
