# Changelog — PSAS ADVENTURE

## [Tahap 5 — Finalisasi, Laporan, Analitik & Gamifikasi] — 2026-11-25
### Ditambahkan (Backend & Keamanan)
- **Engine Pelaporan & Analitik (`/server/reportingEngine.ts`)**:
  - Penggabungan otoritatif data Assessment Store, Adventure Store, dan snapshot Firestore sekolah ter-deduplikasi berdasarkan `sessionId`, lengkap dengan pemisahan *Nilai Resmi* vs *Latihan & Simulasi*.
  - 4 kebijakan deduplikasi percobaan ganda (`best`, `latest`, `first`, `all_attempts`), kalkulasi siswa terdaftar vs sudah mengerjakan vs belum mengerjakan, laporan individu non-bocor kunci jawaban, analisis butir soal empiris (`Mudah`/`Sedang`/`Sulit`, distribusi opsi `A/B/C/D`, peringatan `N < 15`), serta rekomendasi tindak lanjut deterministik.
- **Konfigurasi Gamifikasi Admin & Monitoring (`/server/adventureStore.ts`, `/server/adventureEngine.ts`, `/server.ts`)**:
  - Penambahan `gamificationConfigs` persisten + sinkronisasi ke Firestore `badges` & `auditLogs` via `GET/PUT /api/admin/gamification/config`.
  - Laporan progres petualangan non-kompetitif `GET /api/teacher/reports/adventure-progress`, summary pelaporan `POST /api/teacher/reports/summary`, peningkatan `POST /api/scoring/analyze`, serta `usageSummary` nyata pada `GET /api/admin/dashboard`.

### Ditambahkan & Diperbarui (Frontend)
- **Pusat Laporan Guru (`/src/components/teacher/ReportsAnalyticsHub.tsx`, `/src/utils/reportExporter.ts`)**:
  - Mengganti placeholder tab `Laporan` di `TeacherDashboard` dengan hub pelaporan terpadu: KPI, 4 grafik, tabel rekap berhalaman, laporan individu siswa, analisis butir soal, rekomendasi tindak lanjut, tata cetak `@media print`, serta ekspor `.xlsx`, `.csv` (anti *formula injection*), dan `.pdf` A4 (`jspdf` + `jspdf-autotable` Portrait/Landscape) untuk 6 jenis laporan.
- **Monitoring Admin, Editor Gamifikasi & Selebrasi Siswa (`TeacherDashboard.tsx`, `AdventureEnginePanel.tsx`, `AdventureCelebrationOverlay.tsx`, `AdventureWorldMap.tsx`, `StudentDashboardPage.tsx`, `StudentAdventureRunner.tsx`)**:
  - Kartu monitoring penggunaan Admin di Overview Dashboard, editor aturan XP & 12 lencana khusus Admin, indikator *Dunia Dikunjungi* & status misi pribadi non-kompetitif di Base Camp, indikator lencana peta dunia, serta overlay selebrasi penyelesaian dunia pada akhir ujian (`reducedMotion` & audio-safe).
- **Dokumentasi**: Menambahkan `REPORTING_DOCUMENTATION.md`, `ANALYTICS_DOCUMENTATION.md`, `GAMIFICATION_DOCUMENTATION.md`, `EXPORT_DOCUMENTATION.md`, dan `STAGE5_TEST_REPORT.md`.

## [Tahap 4 — AI Question Import] — 2026-11-25
### Ditambahkan (Backend & Keamanan)
- **Engine Impor AI & Penyimpanan Temp (`/server/aiImportEngine.ts`, `/server/importStore.ts`)**:
  - Ekstraksi deterministik `.csv`/`.xlsx`, parsing `.docx` (`mammoth` + ekstrak media `JSZip`), `.pdf` (`pdf-parse` + fallback multimodal scanned PDF), serta foto (`.jpg`, `.jpeg`, `.png`, `.webp`) melalui `@google/genai` model `'gemini-4-hydrogen'` sisi server (`503 GEMINI_NOT_CONFIGURED` jika kunci tidak tersedia).
  - Validasi *magic bytes* biner, batas 5 berkas/10 MB per berkas/35 MB per batch, rate limiter `ai_import` (20 req/15 menit), proteksi anti *path traversal* pada `resolveSafeBatchSubFile`, pembersihan folder temp otomatis & penyapu TTL.
  - Penjaga integritas kunci: sumber tanpa kunci tetap `correctAnswer: ""` (`hasExplicitKey: false`, `BELUM_DIVERIFIKASI`) sementara saran AI dipisah (`aiSuggestedAnswer`) hingga disetujui guru; deteksi duplikat Bank Soal, simpan idempoten, serta metadata provenance (`importBatchId`, `sourceFileName`, `sourcePage`, dll.).
- **Endpoint API Impor Guru (`/server.ts`, `/src/services/apiClient.ts`)**:
  - Menambahkan 9 endpoint `/api/teacher/import/*` (`status`, `batches`, `upload`, `extract`, `questions`, `save`, `cancel`, `assets/:assetId`) dengan guard `authenticateStaff` + `requireRole(['admin', 'teacher'])`.
- **Aturan Keamanan Firestore (`firestore.rules`, `DRAFT_firestore.rules`)**:
  - Menambahkan skema aturan `importBatches` serta field provenance Stage 4 pada `questionBanks` dan men-deploy ulang ke Firestore.

### Ditambahkan & Diperbarui (Frontend)
- **Wizard Impor AI di Bank Soal (`/src/components/teacher/import/*`, `/src/components/teacher/QuestionBankView.tsx`)**:
  - Tombol **"Impor Soal dengan AI"** di `QuestionBankView`, wizard Tahap A–F (`ImportQuestionPage`, `FileUploadArea` dengan kamera langsung `getUserMedia` + fallback kamera perangkat, `ImportProgress`, `ExtractionResult`, `QuestionReviewEditor`, `ImportSummary`, `ImportHistory`), dan indikator eksplisit `BELUM_DIVERIFIKASI`.
- **Dokumentasi**: Menambahkan `/docs/AI_IMPORT_DOCUMENTATION.md`, `/docs/AI_IMPORT_API.md`, `/docs/AI_IMPORT_TEST_REPORT.md`, dan `/docs/ASSESSMENT_ENGINE.md`.

## [Tahap 3 — Assessment Engine & Stabilisasi Data] — 2026-11-25
### Ditambahkan & Diperbaiki
- **Assessment Engine Server-Side (`/server/assessmentEngine.ts`, `/server/assessmentStore.ts`, `/server.ts`)**:
  - Siklus lengkap Bank Soal, Paket Asesmen (`publish`, `close`, `archive`), masuk/mulai/simpan jawaban/flag/submit sesi ujian siswa anti-leak kunci jawaban, evaluasi 11 tipe soal, koreksi esai guru (`waiting_essay_grading` → `finalized`), serta kebijakan rilis nilai.
- **Pemulihan Refresh Halaman (`App.tsx`)**:
  - Menyimpan dan memulihkan konteks sesi ujian siswa aktif melalui `sessionStorage` saat terjadi F5 tanpa menyimpan token mentah ke `localStorage`.
- **Pemulihan Modul `src/data/` & `.gitignore`**:
  - Mengamankan `src/data/worlds.ts`, `src/data/worldStatusConfig.ts`, `src/data/starterSeed.ts` serta mengarahkan `.gitignore` ke `/data/` agar folder sumber tidak terabaikan.

## [Tahap 2 — Adventure Engine] — 2026-11-25
### Ditambahkan (Backend & Keamanan)
- **Engine & Persistence Server-Authoritative (`server/adventureStore.ts`, `server/adventureEngine.ts`)**:
  - Penulisan atomik `data/adventure-state.json` (dikecualikan di `.gitignore`) + penggabungan katalog dinamis Cloud Firestore (`adventureWorlds`, `checkpoints`, `badges`).
  - Perhitungan resmi 10 jenjang level (`Penjelajah Pemula` 0–99 XP hingga `Legenda Penjelajah` 2900+ XP), 12 lencana server-awarded, 30 pos ekspedisi default lintas 10 dunia, dan event ledger `adventureEvents`.
  - Deduplikasi transaksi deterministik (`BaseCampVisited`, `CharacterSelected`, `WorldOpened`, `CheckpointCompleted`, `ExamCompleted`).
- **Endpoint Adventure Engine (`/server.ts`, `/src/services/apiClient.ts`)**:
  - 16 endpoint siswa `/api/student/adventure/*` (termasuk `403 CLIENT_XP_MUTATION_FORBIDDEN` pada `POST /api/student/adventure/xp` dan hook Tahap 3 `POST /api/student/adventure/exam-completed`).
  - 4 endpoint guru `/api/teacher/adventure/*` (`overview`, `PUT worlds/:worldId`, `POST checkpoints`, `DELETE checkpoints/:checkpointId`) dan `POST /api/admin/adventure/sync-defaults` khusus admin.
- **Aturan Keamanan Firestore (`firestore.rules`, `DRAFT_firestore.rules`, `security_spec.md`)**:
  - Menambahkan aturan akses baca/tulis koleksi `adventureWorlds`, `checkpoints`, `badges`, `adventureProfiles`, `worldProgress`, `checkpointProgress`, `studentBadges`, `xpTransactions`, dan `adventureEvents` dan men-deploy ulang ke Firestore.

### Ditambahkan & Diperbarui (Frontend)
- **Gerbang Karakter, Base Camp, & Peta 10 Dunia (`ExplorerAvatarCard`, `CharacterCustomizerModal`, `AdventureCelebrationOverlay`, `WorldCheckpointModal`, `StudentDashboardPage`, `AdventureWorldMap`)**:
  - Gate pemilihan karakter wajib bagi siswa baru (`characterSelected: false`), kustomisasi aman non-PII, animasi menghormati `reducedMotion`, progres bar SVG tanpa inline style, dan modal eksplorasi 3 pos per dunia.
- **Integrasi Guru & Hook Tahap 3 (`AdventureEnginePanel`, `TeacherDashboard`, `StudentAdventureRunner`, `App.tsx`)**:
  - Tab baru **Adventure Engine** di Dashboard Guru (non-kompetitif, tanpa leaderboard skor siswa).
  - Sinkronisasi `characterId` ke state `App.tsx` serta pemanggilan `recordAdventureExamCompletedHook` pada `StudentAdventureRunner` setelah sesi benar-benar `submitted`.
- **Dokumentasi**: Menambahkan `/docs/ADVENTURE_ENGINE.md`, `/docs/XP_AND_LEVEL_SYSTEM.md`, `/docs/BADGE_SYSTEM.md`, serta memperbarui dokumentasi inti.

## [Tahap 1D — Quality Assurance, Audit Keamanan, & Stabilisasi] — 2026-11-24
### Diperbaiki (Keamanan & Backend)
- Penutupan bypass `validate-entry`, proteksi role pada `/api/scoring/*`, perbaikan rate limiter Wi-Fi sekolah (`120`/5 menit), JSON/API 404 handler rapi, serta pelestarian `isActive != false` pada `storage.rules`.

### Diperbaiki (Frontend, Stabilitas UX, & Performa)
- Isolasi state soal (`key={currentQuestion.id}`), sanitasi URL media/audio, `ConfirmModal` hapus guru, escape formula CSV, serta lazy-loading `TeacherDashboard`.

## [Tahap 1C — Integrasi Firebase, Backend API, & Keamanan] — 2026-11-23
- Verifikasi Admin SDK `verifyIdToken` + Firestore REST API (`starter_tier`), endpoint staf/admin/siswa, revokasi token `jti`, serta penghapusan data dummy kelas/siswa.

## [Tahap 1B — Dashboard Guru, Dashboard Siswa, & Peta 10 Dunia] — 2026-11-23
- Dashboard Guru 8 menu, Dashboard Siswa awal, Peta 10 Dunia Nusantara (`AdventureWorldMap`).

## [Tahap 1A — Antarmuka Utama Ramah Anak & Responsif] — 2026-11-23
- Halaman Pembuka, Pemilihan Jalur Masuk, Masuk Siswa/Guru, Petunjuk, dan komponen `/src/components/adventure/`.
