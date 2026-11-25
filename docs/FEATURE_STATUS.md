# Status Fitur — PSAS ADVENTURE

## Berfungsi Penuh & Terverifikasi (Tahap 1, 1A, 1B, 1C, 1D, Tahap 2, Tahap 3, Tahap 4, & Tahap 5)
- **Identitas Sekolah SDN Pekiringan**: Terintegrasi di seluruh antarmuka, konfigurasi server, skema Firestore (`schoolId: 'sdn_pekiringan'`), dan inisialisasi idempoten khusus admin (`seedSchoolFoundationToFirestore`).
- **Adventure Engine — Tahap 2 & Penyempurnaan Tahap 5 (`/server/adventureStore.ts`, `/server/adventureEngine.ts`, `/src/components/adventure/*`, `/src/components/pages/StudentDashboardPage.tsx`, `/src/components/teacher/AdventureEnginePanel.tsx`)**:
  - **Gerbang Karakter & Kustomisasi**: Pemilihan karakter wajib pertama kali (`boy` / `girl`), kustomisasi `outfitTheme`, `bagStyle`, `shoeStyle`, `accentColor`, dan nama panggilan non-PII persisten lintas sesi.
  - **Base Camp Penjelajah**: Pusat petualangan siswa dengan *Dunia Dikunjungi* & *Dunia Selesai*, avatar ekspresif (`idle`/`happy`/`celebrate`), bilah progres XP SVG, Level 1–10, Lemari 12 Lencana, ringkasan kesiapan misi pribadi non-kompetitif, Riwayat XP & Event, serta tombol *Lanjutkan Petualangan* & *Pilih Dunia*.
  - **Peta 10 Dunia & 30 Pos Ekspedisi**: 10 dunia mata pelajaran kelas 3 SD dengan masing-masing 3 pos ekspedisi interaktif + indikator lencana terkait dunia. Kunci dunia diatur oleh guru/jadwal, bukan nilai rendah.
  - **Sistem XP, 10 Level, 12 Lencana & Konfigurasi Admin**: Aturan XP (`0–100`) & lencana dapat diatur Admin (`/api/admin/gamification/config`), deduplikasi transaksi `transactionId`, penolakan `403` terhadap mutasi XP dari klien, tanpa pengurangan XP pada klik salah, animasi selebrasi tuntas dunia pada `StudentDashboardPage` & `StudentAdventureRunner`, serta hook Tahap 3 `ExamCompleted`.
  - **Panel Adventure Engine Guru/Admin**: Kelola status buka-tutup 10 dunia, tambah/nonaktifkan checkpoint, pantau progres non-kompetitif siswa, sinkronisasi katalog default ke Firestore (admin), dan editor aturan XP/lencana khusus admin.
- **Assessment Engine — Tahap 3 (`/server/assessmentEngine.ts`, `/server/assessmentStore.ts`, `/src/components/exam/*`, `/src/components/teacher/QuestionBankView.tsx`, `/src/components/teacher/ExamBuilderView.tsx`, `/src/components/teacher/ResultsAnalyticsView.tsx`)**:
  - **11 Tipe Soal Resmi & Kebijakan Penilaian**: `multiple_choice`, `true_false`, `short_answer` (variasi & toleransi angka), `matching`, `ordering`, `drag_drop`, `image_choice`, `audio`, `illustrated`, `multiple_select`, serta `essay` dengan status koreksi manual guru (`manual_pending` → `finalized`).
  - **Siklus Ujian Penuh & Pemulihan Refresh (F5)**: Pembuatan paket ujian, manajemen status (`draft` → `active` → `closed` → `archived`), sesi siswa anti-leak kunci jawaban, flag ragu-ragu, pemulihan sesi `sessionStorage`, serta rilis hasil sesuai kebijakan.
- **AI Question Import — Tahap 4 (`/server/aiImportEngine.ts`, `/server/importStore.ts`, `/src/components/teacher/import/*`)**:
  - **Integrasi Bank Soal ("Impor Soal dengan AI")**: Alur Tahap A–F untuk `.docx`, `.pdf` (digital + fallback multimodal scanned PDF), `.xlsx`, `.csv`, foto (`.jpg`, `.jpeg`, `.png`, `.webp`), serta kamera langsung (`getUserMedia` + fallback kamera perangkat), maks 5 berkas/batch (10 MB/file, 35 MB/batch).
  - **Integritas Kunci & Provenance**: Soal tanpa kunci sumber tetap `correctAnswer: ""` (`hasExplicitKey: false`, `verificationStatus: 'BELUM_DIVERIFIKASI'`), saran AI dipisah (`aiSuggestedAnswer`) hingga disetujui eksplisit guru, deteksi duplikat, simpan idempoten, aset temp terautentikasi, dan pembersihan otomatis.
- **Pelaporan Terpadu, Analitik, Ekspor Multi-Format & Monitoring Admin — Tahap 5 (`/server/reportingEngine.ts`, `/src/components/teacher/ReportsAnalyticsHub.tsx`, `/src/utils/reportExporter.ts`)**:
  - **Pusat Laporan Guru (`Laporan`)**: KPI partisipasi terdaftar vs sudah/belum mengerjakan, pemisahan *Nilai Resmi* vs *Latihan & Simulasi*, 4 kebijakan deduplikasi percobaan ganda (`best`, `latest`, `first`, `all_attempts`), 4 grafik nyata, rekap kelas/mapel/asesmen/petualangan, laporan individu siswa anti-bocor kunci jawaban, analisis butir soal (kesulitan empiris + distribusi opsi + peringatan sampel kecil `N < 15`), serta rekomendasi tindak lanjut deterministik.
  - **Ekspor Resmi & Tata Cetak**: 6 jenis laporan ke `.xlsx`, `.csv` (anti formula-injection), `.pdf` (`jspdf` + `jspdf-autotable` A4 Portrait/Landscape), serta cetak `@media print` tanpa `window.open`/`window.alert`.
  - **Panel Monitoring Administrator**: Ringkasan penggunaan server nyata (`usageSummary`) pada Overview Admin.
- **Arsitektur Firebase Starter Tier (`src/config/firebaseConfig.ts`, `src/lib/firebase.ts`, `server/firebaseAdmin.ts`, `server/firestoreRest.ts`)**:
  - Frontend & backend terhubung ke proyek `gen-lang-client-0036426373` dengan database `ai-studio-554d8f01-9033-4ddb-9b02-bd17a90579b8`.
  - `firestore.rules` telah di-deploy (mencakup proteksi tulis koleksi Adventure Engine, `questionBanks`, dan `importBatches`).
- **API Backend Terautentikasi & Role-Verified (`/server.ts`, `/src/services/apiClient.ts`, `/src/lib/scoringClient.ts`)**:
  - Seluruh endpoint Tahap 1C/1D + Tahap 2 + Tahap 3 + Tahap 4 + Tahap 5 (`/api/teacher/reports/summary`, `/api/teacher/reports/adventure-progress`, `/api/admin/gamification/config`, `/api/admin/dashboard` dengan `usageSummary`).

## Fitur Placeholder / Konfigurasi Sementara (Tahap 1B)
- **Jadwal PSAS Otomatis** (`TeacherFeaturePlaceholder`): Penjadwalan buka-tutup otomatis berbasis kalender masih menggunakan pintasan langsung ke menu **Buat Asesmen** / **Adventure Engine**.

## Siap / Memerlukan Aktivasi / Konfigurasi Pemilik Proyek
- **Kunci API Gemini (`GEMINI_API_KEY`)**: Diperlukan di environment server untuk menjalankan ekstraksi AI pada `.docx`/`.pdf`/foto/kamera (`gemini-4-hydrogen`); jika belum tersedia, server merespons `503 GEMINI_NOT_CONFIGURED` secara jujur (ekstraksi `.csv`/`.xlsx` tetap berjalan).
- **Login Guru Email & Kata Sandi**: Memerlukan aktivasi provider Email/Password di Firebase Authentication Console dan pendaftaran akun di `teachers/{uid}` (Google Sign-In aktif).
- **Firebase Storage Upload Media**: Memerlukan aktivasi bucket Firebase Storage (`gen-lang-client-0036426373.firebasestorage.app`) dan deploy `storage.rules` di Console; tanpa bucket aktif, simpan soal impor tetap berhasil disertai `storageWarnings`.
- **Deployment Produksi Cloud Run**: Siap pada kontainer (`Dockerfile`), belum di-deploy tanpa persetujuan pemilik proyek.
