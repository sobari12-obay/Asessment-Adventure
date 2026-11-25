# Panduan Konfigurasi Firebase — PSAS ADVENTURE

## 1. Proyek & Database Aktif
- **Firebase Project ID**: `gen-lang-client-0036426373`
- **Cloud Firestore Database ID**: `ai-studio-554d8f01-9033-4ddb-9b02-bd17a90579b8`
- **Storage Bucket Konfigurasi**: `gen-lang-client-0036426373.firebasestorage.app`
- **Tier Proyek**: Google-hosted **Starter Tier**
- **Admin Bootstrap**: `sobari12@guru.sd.belajar.id`
- **Sekolah Awal**: `SDN Pekiringan` (`schoolId: "sdn_pekiringan"`)

## 2. Pemisahan Konfigurasi Frontend & Backend
- **Frontend (`src/config/firebaseConfig.ts`, `src/lib/firebase.ts`)**:
  - Membaca konfigurasi publik Web SDK dari `firebase-applet-config.json`.
  - Menghubungkan `getFirestore(app, firestoreDatabaseId)`, `getAuth(app)`, dan `getStorage(app, ...)`.
  - Menyediakan `getCurrentUserIdToken()` untuk mengirim Bearer Firebase ID Token ke endpoint backend.
- **Backend (`server/firebaseAdmin.ts`, `server/firestoreRest.ts`)**:
  - Mematuhi batasan Starter Tier (tanpa file service account JSON dan tanpa operasi Admin SDK yang membutuhkan IAM proyek seperti `firebase-admin/firestore` atau `getUser`/`createUser`).
  - Menginisialisasi `firebase-admin/app` dengan `projectId` saja untuk melakukan verifikasi tanda tangan JWT Firebase ID Token secara stateless (`getAuth(app).verifyIdToken(token)`).
  - Melakukan seluruh baca/tulis Firestore server-side via **Cloud Firestore REST API** (`https://firestore.googleapis.com/v1/projects/.../databases/ai-studio-554d8f01-9033-4ddb-9b02-bd17a90579b8/documents`) menggunakan Bearer ID Token milik pemanggil agar `firestore.rules` dievaluasi oleh Google Cloud Firestore.

## 3. Environment Variables (`.env.example`)
- `GEMINI_API_KEY`: Kunci Gemini API sisi server (untuk tahap fitur AI pembaca/ekstraktor soal).
- `STUDENT_SESSION_SECRET`: Rahasia HMAC-SHA256 minimal 32 karakter untuk token sesi siswa di produksi (Cloud Run).
- `FIREBASE_PROJECT_ID` & `FIREBASE_DATABASE_ID`: Override opsional sisi server (default otomatis membaca `firebase-applet-config.json`).
- `APP_URL`, `PORT` (`3000`), `NODE_ENV`.
- **Penting**: Jangan pernah menaruh rahasia server di variabel `VITE_*`.

## 4. Langkah Aktivasi Lanjutan oleh Pemilik Proyek di Firebase Console
1. **Login Guru Email/Password (Opsional selain Google Sign-In)**:
   - Buka *Firebase Console -> Authentication -> Sign-in method* -> aktifkan **Email/Password**.
   - Daftarkan UID guru pada dokumen `teachers/{uid}` (`isActive: true`, `role: 'teacher'` atau `'admin'`).
2. **Firebase Storage**:
   - Buka *Firebase Console -> Storage -> Get started* untuk mengaktifkan bucket `gen-lang-client-0036426373.firebasestorage.app`.
   - Deploy isi berkas `/storage.rules` melalui tab *Storage -> Rules*.
3. **Inisialisasi Data Sekolah & 10 Mapel Resmi (Idempoten)**:
   - Masuk ke **Ruang Guru** sebagai administrator (`sobari12@guru.sd.belajar.id`).
   - Klik tombol **Inisialisasi Sekolah & 10 Mapel** di header dashboard untuk membuat profil `SDN Pekiringan`, pengaturan default, dan 10 mata pelajaran resmi tanpa data siswa/kelas fiktif.
