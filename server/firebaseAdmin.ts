import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BOOTSTRAP_ADMIN_EMAIL = 'sobari12@guru.sd.belajar.id';

interface AppletConfigFile {
  projectId?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
}

function loadAppletConfig(): AppletConfigFile {
  const candidates = [
    path.resolve(__dirname, '..', 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw) as AppletConfigFile;
      }
    } catch {
      // Ignore malformed/unreadable config file
    }
  }
  return {};
}

const fileConfig = loadAppletConfig();

export const FIREBASE_PROJECT_ID =
  (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID.trim()) ||
  fileConfig.projectId ||
  '';

export const FIREBASE_DATABASE_ID =
  (process.env.FIREBASE_DATABASE_ID && process.env.FIREBASE_DATABASE_ID.trim()) ||
  fileConfig.firestoreDatabaseId ||
  '(default)';

export const FIREBASE_STORAGE_BUCKET = fileConfig.storageBucket || '';

const PLACEHOLDER_IDS = new Set(['', 'remixed-project-id', 'your-project-id']);

export const isFirebaseServerConfigured =
  Boolean(FIREBASE_PROJECT_ID) && !PLACEHOLDER_IDS.has(FIREBASE_PROJECT_ID);

let cachedApp: App | null = null;

/**
 * Starter-Tier compliant initialization:
 * Uses ONLY projectId for stateless ID token signature verification (verifyIdToken).
 * Never accesses firebase-admin/firestore or IAM-restricted Admin Auth APIs.
 */
function getFirebaseAdminApp(): App | null {
  if (!isFirebaseServerConfigured) return null;
  if (cachedApp) return cachedApp;
  const existing = getApps();
  cachedApp =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          projectId: FIREBASE_PROJECT_ID,
        });
  return cachedApp;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
}

export async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ ok: true; user: VerifiedFirebaseUser } | { ok: false; reason: string }> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length < 20) {
    return { ok: false, reason: 'Token autentikasi tidak ditemukan atau tidak valid.' };
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return { ok: false, reason: 'Konfigurasi proyek Firebase di server belum tersedia.' };
  }

  try {
    // Stateless JWT signature verification (requires zero IAM on Starter Tier)
    const decoded = await getAuth(app).verifyIdToken(idToken.trim());
    const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    const emailVerified = decoded.email_verified === true;

    if (!decoded.uid || !email) {
      return { ok: false, reason: 'Token akun Google tidak memuat identitas email yang valid.' };
    }
    if (!emailVerified) {
      return { ok: false, reason: 'Email akun Google belum terverifikasi.' };
    }

    const displayName =
      typeof decoded.name === 'string' && decoded.name.trim()
        ? decoded.name.trim().slice(0, 120)
        : email.split('@')[0];

    return {
      ok: true,
      user: {
        uid: decoded.uid,
        email,
        emailVerified,
        displayName,
      },
    };
  } catch {
    return { ok: false, reason: 'Token autentikasi Google tidak valid atau telah kedaluwarsa.' };
  }
}

export function isBootstrapAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
}
