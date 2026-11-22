import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function loadServiceAccount(): ServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string;
        projectId?: string;
        client_email?: string;
        clientEmail?: string;
        private_key?: string;
        privateKey?: string;
      };
      const projectId = parsed.project_id || parsed.projectId;
      const clientEmail = parsed.client_email || parsed.clientEmail;
      const privateKey = (parsed.private_key || parsed.privateKey)?.replace(/\\n/g, "\n");
      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
      }
    } catch (err) {
      console.error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON:", err);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

export function isFirebaseConfigured(): boolean {
  return loadServiceAccount() !== null;
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
