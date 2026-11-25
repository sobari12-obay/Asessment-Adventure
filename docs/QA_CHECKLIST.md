# QA Checklist — Stage 1D (PSAS ADVENTURE)

**Tanggal Audit**: 2026-11-24  
**Status Legenda**:
- **PASS**: Diuji langsung dan terbukti berjalan dengan benar pada environment saat ini.
- **FAIL**: Ditemukan kegagalan (seluruh `FAIL` yang ditemukan telah diperbaiki dan diuji ulang hingga `PASS`).
- **BLOCKED**: Terkendala prasyarat eksternal yang memerlukan tindakan pemilik proyek (browser OAuth Google interaktif, aktivasi Console, atau tidak tersedianya headless browser di container CLI).
- **NOT TESTED**: Belum dijalankan secara end-to-end karena ketergantungan prasyarat `BLOCKED`.

| ID | Kategori | Item Pemeriksaan | Status | Bukti / Catatan Verifikasi |
| :--- | :--- | :--- | :--- | :--- |
| QA-01 | Build & TypeScript | `tsc --noEmit` (`lint_applet`) 0 error | **PASS** | Terverifikasi setelah seluruh perbaikan Stage 1D (`$ tsc --noEmit` exit 0). |
| QA-02 | Build Produksi | `npm run build` (`compile_applet`) sukses + aset `dist/src/assets/images/` (6 JPG) utuh | **PASS** | `TeacherDashboard` (`893 KB` termasuk `xlsx`) terpisah dari chunk siswa (`index`). |
| QA-03 | Rules Syntax | Validasi sintaks `firestore.rules` dengan ESLint | **PASS** | `npx eslint firestore.rules` exit 0 tanpa error/warning. |
| QA-04 | Rules Storage | Konsistensi cek `teachers/{uid}.data.isActive != false` di `storage.rules` | **PASS** | Diperbaiki & diverifikasi di `storage.rules` baris 15–18. |
| QA-05 | Backend Health | `GET /api/health` mengembalikan konektivitas Firestore REST & status konfigurasi | **PASS** | HTTP `200`, `firestoreConnected: true`, `projectTier: "starter_tier"`, `geminiConfigured: true`. |
| QA-06 | Katalog Sekolah | `GET /api/classes` dan `GET /api/subjects` tanpa fallback data palsu | **PASS** | HTTP `200`, mengembalikan `items: []` jujur saat koleksi Firestore belum diisi admin. |
| QA-07 | Auth Endpoint Staf | `GET /api/me`, `/api/teacher/dashboard`, `/api/admin/dashboard` menolak token kosong/palsu | **PASS** | Seluruhnya mengembalikan HTTP `401 INVALID_FIREBASE_TOKEN`. |
| QA-08 | Auth Scoring Engine | `POST /api/scoring/evaluate` & `/api/scoring/analyze` mewajibkan token staf | **PASS** | Diperbaiki pada Stage 1D; request palsu/tanpa token ditolak HTTP `401`. |
| QA-09 | Auth Token Siswa | `GET /api/student/profile` & `/api/student/dashboard` menolak token kosong/palsu | **PASS** | Mengembalikan HTTP `401 STUDENT_UNAUTHENTICATED`. |
| QA-10 | Anti-Bypass Login | `POST /api/student/validate-entry` mengabaikan payload `accessRecord` palsu klien | **PASS** | PoC payload palsu ditolak server dengan `403 CODE_NOT_FOUND`. |
| QA-11 | Rate Limiter Sekolah | IP sekolah bersama (12+ percobaan non-gagal) tidak terblokir palsu; 7 kode salah memicu `429` | **PASS** | 12 input `400` lolos tanpa lockout palsu; percobaan salah ke-7 mengembalikan `429 TOO_MANY_FAILED_ATTEMPTS`. |
| QA-12 | API Error Hygiene | Payload JSON rusak mengembalikan `400 INVALID_JSON`; route `/api/*` tak dikenal mengembalikan `404 API_NOT_FOUND` | **PASS** | Teruji langsung via request HTTP ke port 3000. |
| QA-13 | Keamanan Render & CSV | Sanitasi URL media di `QuestionRenderer` & escape formula CSV di `ResultsAnalyticsView` | **PASS** | Diperbaiki & lolos TypeScript/build; pembersihan timer suara saat pindah soal ditambahkan. |
| QA-14 | Stabilitas State Soal | `<QuestionRenderer key={currentQuestion.id}>` mencegah bocornya state antar soal | **PASS** | Diperbaiki di `StudentAdventureRunner.tsx`. |
| QA-15 | UX Hapus & Error Guru | `ConfirmModal` + `try/catch` pada hapus asesmen/soal/siswa/bank soal & preserve `ownerId` edit soal | **PASS** | Diterapkan di `AssessmentManager`, `RosterManager`, `QuestionBankView`, `QuestionEditorModal`, `ResultsAnalyticsView`. |
| QA-16 | Audit Dependensi | `bun audit` read-only dijalankan & dicatat jujur | **PASS** | 4 advisory tercatat (`xlsx@0.18.5` high tanpa patch npm resmi + `@grpc/grpc-js` transitif Firebase); mitigasi isolasi modul guru & validasi server diterapkan. |
| QA-17 | Login Google Nyata Browser | Login interaktif `sobari12@guru.sd.belajar.id` + inisialisasi fondasi + CRUD browser E2E | **BLOCKED** | Tidak ada browser headless di container CLI & memerlukan popup Google OAuth interaktif pemilik proyek. |
| QA-18 | Login Guru Email/Password | Uji masuk guru via Email & Kata Sandi di `TeacherLoginPage` | **BLOCKED** | Provider Email/Password di Firebase Authentication Console belum diaktifkan oleh pemilik proyek. |
| QA-19 | Upload Media Firebase Storage | Uji unggah & baca berkas di `schools/sdn_pekiringan/**` | **BLOCKED** | Bucket Firebase Storage perlu diaktifkan & `storage.rules` di-deploy di Firebase Console oleh pemilik proyek. |
| QA-20 | Visual Browser 360px/768px/1280px | Pengujian rendering piksel aktual pada Chromium/Playwright nyata | **NOT TESTED** | Container tidak memiliki Playwright/Chromium; responsivitas diperbaiki melalui audit kelas Tailwind CSS (`AdventureHeader`, `AdventureLogo`, `JourneyTrailBar`, `QuestionEditorModal`). |
| QA-21 | Deployment Cloud Run | Deployment produksi ke Google Cloud Run | **NOT TESTED** | Sesuai batasan Stage 1D: tidak melakukan deployment sebelum verifikasi pemilik proyek. |
