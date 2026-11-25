# Arsitektur Aplikasi — PSAS ADVENTURE

## 1. Tumpukan Teknologi Resmi
- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (`motion` kompatibel untuk animasi halus).
- **Backend**: Node.js 22 + Express (`server.ts`) melayani endpoint API `/api/*`, token sesi HMAC-SHA256, dan SPA Vite/dist pada port `3000` (dev) / `PORT=8080` (Cloud Run).
- **Database**: Cloud Firestore (database bernama `ai-studio-554d8f01-9033-4ddb-9b02-bd17a90579b8` pada project `gen-lang-client-0036426373`).
- **Autentikasi Guru/Admin**: Firebase Authentication (Google Sign-In aktif; UI Login Email & Kata Sandi + Reset Kata Sandi siap dan aktif begitu provider Email/Password diaktifkan di Firebase Console).
- **Akses Siswa**: Pilihan Kelas + Nama Siswa + Kode Ujian (+ Nomor Peserta otomatis saat ada nama ganda dalam satu kelas), diverifikasi ke backend `/api/student/validate-entry` tanpa membocorkan seluruh daftar siswa ke browser.
- **Penyimpanan File**: Firebase Storage (`storage.rules` telah disiapkan; aktivasi bucket memerlukan konfirmasi/aktivasi di Firebase Console oleh pemilik proyek).
- **AI Pembaca Soal (Tahap Lanjut)**: Disiapkan melalui Gemini API di sisi server (`GEMINI_API_KEY` terdeteksi di `/api/health`, belum membuka rute AI di Tahap 1).

## 2. Struktur Folder
- `/server.ts` — Server Express: logging JSON terstruktur, `/api/health`, `/api/student/validate-entry`, `/api/student/verify-token`, `/api/scoring/evaluate`, `/api/scoring/analyze`.
- `/Dockerfile` & `/.dockerignore` — Konfigurasi kontainer multi-stage siap deploy ke Google Cloud Run (`npm run build` + `npm start`).
- `/firestore.rules` & `/DRAFT_firestore.rules` — Aturan keamanan Firestore yang telah divalidasi `eslint` dan di-deploy aktif.
- `/storage.rules` — Template aturan Firebase Storage per `schoolId`.
- `/firebase-blueprint.json` & `/security_spec.md` — Skema entitas & spesifikasi keamanan 20 koleksi/path.
- `/src/types/psas.ts` — Kontrak TypeScript seluruh entitas & konstanta `DEFAULT_SCHOOL_ID = 'sdn_pekiringan'`.
- `/src/lib/` — `firebase.ts`, `cryptoHash.ts` (SHA-256 browser lookup), `scoringClient.ts`, `audioEngine.ts`.
- `/src/data/` — `worlds.ts` (10 Dunia), `characters.ts` (Raka & Laras), `starterSeed.ts` (data awal SDN Pekiringan).
- `/src/services/firestoreService.ts` — Operasi CRUD, penyusunan `studentAccessKeys` & `assessmentAccess`, autosave offline/online, dan `auditLogs`.
- `/src/components/` — `StudentPortalMap.tsx`, `StudentIntroScreen.tsx`, `StudentAdventureRunner.tsx`, `QuestionRenderer.tsx`, `TeacherDashboard.tsx`, dan modul `/teacher/*`.

## 3. Batasan Starter Tier vs Google Cloud Run Produksi
- Pada lingkungan preview AI Studio Starter Tier, Firebase Admin SDK di `server.ts` tidak diberi kredensial IAM `roles/datastore.user` untuk membaca Firestore langsung. Oleh karena itu:
  1. Klien siswa melakukan lookup dokumen tunggal ter-hash by-ID (`assessmentAccess/{codeHash}` dan `studentAccessKeys/{lookupId}`) yang dilarang untuk di-`list` oleh aturan Firestore.
  2. Hasil lookup, batas waktu (`startsAt`/`endsAt`), kecocokan kelas, disambiguasi nama ganda (`participantNumber`), dan status sesi diverifikasi di backend `/api/student/validate-entry`, yang kemudian menandatangani token sesi HMAC-SHA256 (`psas_tok_v1.*`) dan menyimpannya hanya di memori JavaScript React (bukan `localStorage`).
  3. Saat proyek dipromosikan ke Cloud Run ber-IAM milik sekolah, validasi yang sama dapat ditingkatkan lebih lanjut dengan query Admin SDK server-side tanpa mengubah antarmuka pengguna maupun skema koleksi.
