import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import {
  firebaseConfig,
  firestoreDatabaseId,
  isFirebaseConfigured,
} from '../config/firebaseConfig';

const app = initializeApp(firebaseConfig);
export const db =
  firestoreDatabaseId && firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firestoreDatabaseId)
    : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let storageInstance: FirebaseStorage | null = null;
export function getFirebaseStorage(): FirebaseStorage | null {
  if (!isFirebaseConfigured || !firebaseConfig.storageBucket) return null;
  if (!storageInstance) {
    storageInstance = getStorage(app, `gs://${firebaseConfig.storageBucket.replace(/^gs:\/\//, '')}`);
  }
  return storageInstance;
}

const ALLOWED_QUESTION_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_QUESTION_IMAGE_BYTES = 2 * 1024 * 1024;

export async function uploadQuestionImageToStorage(
  file: File,
  schoolId = 'sdn_pekiringan'
): Promise<string> {
  if (!ALLOWED_QUESTION_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Format gambar harus PNG, JPG, WEBP, atau GIF.');
  }
  if (file.size > MAX_QUESTION_IMAGE_BYTES) {
    throw new Error('Ukuran gambar maksimal 2 MB agar cepat dimuat di HP siswa.');
  }
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error(
      'Firebase Storage belum dikonfigurasi pada project ini. Aktifkan Storage di Firebase Console atau tempel URL gambar yang valid.'
    );
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || 'soal.png';
  const objectPath = `schools/${schoolId}/public/questions/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, objectPath);
  try {
    await uploadBytes(storageRef, file, {
      contentType: file.type,
      cacheControl: 'public, max-age=86400',
    });
    return await getDownloadURL(storageRef);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('storage/unauthorized') || msg.includes('403')) {
      throw new Error('Akses unggah ditolak. Pastikan Anda masuk sebagai guru/admin terverifikasi.');
    }
    if (msg.includes('storage/bucket-not-found') || msg.includes('404')) {
      throw new Error(
        'Bucket Firebase Storage belum aktif di Firebase Console. Aktifkan Firebase Storage terlebih dahulu atau gunakan URL gambar eksternal.'
      );
    }
    throw new Error(`Gagal mengunggah gambar ke Firebase Storage: ${msg}`);
  }
}

export async function getCurrentUserIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<{ online: boolean; message?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { online: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { online: false, message: 'Koneksi ke Firestore sedang offline.' };
    }
    return { online: true };
  }
}

void testConnection();
