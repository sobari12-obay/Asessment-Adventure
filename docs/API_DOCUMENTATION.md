# Dokumentasi API Backend — PSAS ADVENTURE

Seluruh endpoint berjalan pada server Node.js/Express (`server.ts`, port `3000`). Endpoint yang dilindungi memakai header `Authorization: Bearer <token>`.

## 1. Kesehatan & Katalog Publik
- **`GET /api/health`**
  - **Auth**: Publik.
  - **Response `200`**: Status server (`ok`), `schoolId` (`sdn_pekiringan`), `firebaseConfigured`, `firestoreConnected` (uji konektivitas REST nyata), `projectTier` (`starter_tier`), `adminSdkTokenVerifierReady`, `geminiConfigured`.
- **`GET /api/classes`**
  - **Auth**: Publik.
  - **Behavior**: Query Firestore `classes` dengan filter `isActive == true` sesuai `firestore.rules`. Mengembalikan `{ schoolId, items }`. Tidak pernah mengembalikan daftar kelas fiktif jika kosong.
- **`GET /api/subjects`**
  - **Auth**: Publik.
  - **Behavior**: Query Firestore `subjects` dengan filter `isActive == true`. Mengembalikan `{ schoolId, items }` terurut berdasarkan `number`.

## 2. Autentikasi & Portal Siswa (Token Sesi HMAC-SHA256 + Rate Limiter)
- **`POST /api/student/login`**
  - **Auth**: Publik (dilindungi rate limiter anti brute-force).
  - **Body**: `{ schoolId?, classId, gradeClass, studentName, examCode, participantNumber?, characterId }`
  - **Behavior**:
    - Validasi input (`400` bila tidak lengkap).
    - Lookup `assessmentAccess/{codeHash}`, validasi status `active`, `isLocked`, jendela `startsAt`/`endsAt`, dan kecocokan `classIds`.
    - Bila `identityMode === 'roster_verify'`, lookup `studentAccessKeys/{lookupId}` dan kembalikan `409 DUPLICATE_NAME_NEEDS_PARTICIPANT_NUMBER` jika nama ganda butuh `participantNumber`.
    - Kembalikan `429 TOO_MANY_FAILED_ATTEMPTS` setelah percobaan kode/identitas salah berulang.
    - Terbitkan token HMAC `psas_tok_v1.*` (berisi `jti`, masa berlaku 4 jam) + metadata `assessment` & `resumingSession`.
- **`POST /api/student/validate-entry`** & **`POST /api/student/verify-token`**
  - Endpoint kompatibilitas Stage 1 dengan rate limiting dan verifikasi pencabutan `jti`.
- **`POST /api/student/logout`**
  - **Auth**: Opsional header/body token siswa.
  - **Behavior**: Mencabut `jti` token di server sehingga token tidak dapat dipakai lagi (`{ ok: true, revoked }`).
- **`GET /api/student/profile`**
  - **Auth**: `Authorization: Bearer <studentHmacToken>` (`401` bila tidak ada/kedaluwarsa/dicabut).
  - **Response `200`**: Hanya profil siswa pemilik token saat ini.
- **`GET /api/student/dashboard`**
  - **Auth**: `Authorization: Bearer <studentHmacToken>` (`401` bila tidak valid/dicabut).
  - **Behavior**: Membaca `subjects` aktif, `publicAssessments` (`active`/`closed`), dan `assessmentSessions/{sessionId}` sambil memverifikasi `session.studentId === token.studentId` (`403` bila lintas siswa).

## 3. Identitas & Dashboard Staf (Firebase ID Token)
- **`GET /api/me`**
  - **Auth**: `Authorization: Bearer <firebaseIdToken>` (`401` bila tidak valid; `403` bila belum terdaftar sebagai `admin`/`teacher` atau `isActive === false`).
  - **Response `200`**: `{ uid, email, displayName, role, schoolId, schoolName, isActive }`.
- **`GET /api/teacher/dashboard`**
  - **Auth**: Firebase ID Token dengan peran `teacher` atau `admin` aktif.
  - **Response `200`**: Ringkasan jumlah siswa, kelas, asesmen aktif/selesai, sesi berjalan/selesai, bank soal, dan rata-rata nilai langsung dari Firestore.

## 4. Manajemen Administrator (`role === 'admin'` Saja)
Seluruh endpoint `/api/admin/*` menolak peran `teacher` biasa dengan HTTP `403 FORBIDDEN_ROLE` dan mewajibkan Firebase ID Token `admin` aktif:
- **`GET /api/admin/dashboard`**: Ringkasan sekolah, jumlah entitas, jumlah guru, dan log audit terbaru.
- **`POST /api/admin/classes`**: Membuat/memperbarui kelas di `classes/{id}` + audit log.
- **`POST /api/admin/students`**: Menambah peserta didik baru di `students/{id}` + memperbarui `studentAccessKeys` (termasuk deteksi nama ganda sekelas) + audit log.
- **`PUT /api/admin/students/:studentId`**: Memperbarui data siswa & menyinkronkan `studentAccessKeys`.
- **`POST /api/admin/exams`**: Membuat paket asesmen (`assessments/{id}`), metadata publik tanpa kode (`publicAssessments/{id}`), kunci akses ter-hash (`assessmentAccess/{codeHash}`), dan audit log tanpa mencatat kode ujian plaintext.

## 5. Penilaian & Analitik
- **`POST /api/scoring/evaluate`**: Menghitung skor objektif (PG, benar/salah, isian singkat + variasi, menjodohkan, urutkan, drag-drop, pilihan ganda kompleks) dan menandai esai untuk review manual.
- **`POST /api/scoring/analyze`**: Menghasilkan statistik nilai kelas, distribusi skor, serta penguasaan per topik dan indikator.

## 6. Adventure Engine — Siswa, Guru, & Admin (Tahap 2)
Seluruh endpoint siswa mewajibkan `Authorization: Bearer <studentHmacToken>`; endpoint guru mewajibkan Firebase ID Token `teacher`/`admin`; endpoint sinkronisasi default mewajibkan peran `admin`.
- **Karakter & Base Camp Siswa**:
  - `GET /api/student/adventure/character` & `POST /api/student/adventure/character` (menyimpan karakter + kostum non-PII, menutup Gerbang Karakter, serta menganugerahkan `CharacterSelected` + `BaseCampVisited` dan lencana `penjelajah_pertama` secara idempoten).
  - `GET /api/student/adventure/basecamp` (payload lengkap Base Camp: profil, `levelInfo`, status 10 dunia, 12 lencana, riwayat XP, event terkini, serta perayaan delta pertama kali).
- **Peta 10 Dunia, Pos Ekspedisi, XP, Lencana, & Hook Tahap 3**:
  - `GET /api/student/adventure/worlds`, `GET /api/student/adventure/world/:worldId`, `POST /api/student/adventure/world/:worldId/open` (`403 WORLD_UNAVAILABLE` bila dunia dikunci jadwal/guru; `+15 XP` sekali buka).
  - `GET /api/student/adventure/progress`, `GET /api/student/adventure/progress/:worldId`, `GET /api/student/adventure/world/:worldId/checkpoints`.
  - `POST /api/student/adventure/checkpoint/:checkpointId/start` & `POST /api/student/adventure/checkpoint/:checkpointId/complete` (membuka & menuntaskan pos ekspedisi secara idempoten + evaluasi 12 lencana + level-up).
  - `GET /api/student/adventure/xp`, `GET /api/student/adventure/xp/history`, `GET /api/student/adventure/badges`.
  - `POST /api/student/adventure/xp` — **Ditolak selalu dengan `403 CLIENT_XP_MUTATION_FORBIDDEN`** (anti-cheat: mutasi XP dari klien tidak diizinkan).
  - `POST /api/student/adventure/exam-completed` — Memverifikasi status `submitted`/`graded` pada `assessmentSessions/{sessionId}` di Firestore sebelum memberi `+50 XP` `ExamCompleted`.
- **Manajemen Guru & Sinkronisasi Admin**:
  - `GET /api/teacher/adventure/overview`: Ringkasan 10 dunia, daftar checkpoint, aktivitas penjelajah non-kompetitif (tanpa leaderboard skor), dan ledger event terkini.
  - `PUT /api/teacher/adventure/worlds/:worldId`: Mengubah ketersediaan dunia (`isAvailable`, `availabilityReason`, `scheduleLabel`) + sinkronisasi Firestore jika tersedia.
  - `POST /api/teacher/adventure/checkpoints` & `DELETE /api/teacher/adventure/checkpoints/:checkpointId`: Menambah/memperbarui atau menonaktifkan checkpoint dunia.
  - `POST /api/admin/adventure/sync-defaults`: Khusus peran `admin`, menyinkronkan 10 dunia, 30 pos default, dan 12 lencana ke koleksi Firestore (`adventureWorlds`, `checkpoints`, `badges`).

## 7. Assessment Engine — Bank Soal, Paket Ujian, Sesi Siswa, & Koreksi Esai (Tahap 3)
- **Bank Soal & Paket Ujian Guru (`authenticateStaff` + `teacher`/`admin`)**:
  - `GET /api/teacher/questions`, `POST /api/teacher/questions`, `GET/PUT/DELETE /api/teacher/questions/:questionId`, `POST /api/teacher/questions/:questionId/duplicate`.
  - `GET /api/teacher/exams`, `POST /api/teacher/exams`, `GET/PUT /api/teacher/exams/:examId`, `POST /api/teacher/exams/sync-mirror`.
  - `POST /api/teacher/exams/:examId/questions`, `DELETE /api/teacher/exams/:examId/questions/:questionId`.
  - Siklus status ujian: `POST /api/teacher/exams/:examId/publish`, `POST .../close`, `POST .../archive`.
  - Hasil & koreksi esai: `GET /api/teacher/exams/:examId/results`, `GET /api/teacher/submissions/:submissionId`, `POST /api/teacher/submissions/:submissionId/grade`.
- **Portal Ujian Siswa (`authenticateStudent`)**:
  - `POST /api/student/exam/enter`, `POST /api/student/exam/start`, `GET /api/student/exam/session`, `GET /api/student/exam/session/:sessionId`, `POST .../answer`, `POST .../flag`, `GET .../status`, `POST .../submit`, `GET /api/student/results`.
  - Payload soal siswa selalu membuang kunci jawaban (`correctAnswer`, `acceptedVariations`, `numericTolerance`, `rubric`).

## 8. AI Question Import (Tahap 4)
Lihat rincian penuh kontrak request/response di `/docs/AI_IMPORT_API.md`.
- **Endpoint Guru/Admin (`authenticateStaff` + `teacher`/`admin`)**:
  - `GET /api/teacher/import/status`, `GET /api/teacher/import/batches`, `POST /api/teacher/import/batches`.
  - `POST /api/teacher/import/batches/:batchId/upload` (multipart maks 5 berkas × 10 MB), `POST .../extract` (rate limited + `503 GEMINI_NOT_CONFIGURED` bila tanpa kunci API).
  - `GET /api/teacher/import/batches/:batchId`, `PUT .../questions`, `POST .../save` (idempoten + mirror `questionBanks`/`importBatches`), `POST .../cancel`, `GET .../assets/:assetId`.

## 9. Pelaporan, Analitik & Konfigurasi Gamifikasi (Tahap 5)
- **Endpoint Guru/Admin (`authenticateStaff` + `teacher`/`admin`)**:
  - `POST /api/teacher/reports/summary`: Menghasilkan payload laporan Stage 5 lengkap (`kpis`, `notYetAttemptedStudents`, `charts`, `classRecapRows`, `subjectRecapRows`, `assessmentRecapRows`, `studentReports`, `itemAnalysis`, `recommendations`) dengan cakupan `official`/`practice`/`all`, deduplikasi `best`/`latest`/`first`/`all_attempts`, serta filter kelas/mapel/asesmen/status/tanggal/pencarian.
  - `GET /api/teacher/reports/adventure-progress`: Mengembalikan laporan perkembangan petualangan siswa (non-kompetitif, urut alfabetis per kelas).
  - `POST /api/scoring/analyze`: Diperkaya dengan `lowSampleWarning`, `mostDifficultQuestions`, `reviewNeededQuestions`, `empiricalDifficulty`, dan `optionDistribution` secara *backward-compatible*.
- **Endpoint Khusus Administrator (`authenticateStaff` + `requireRole(['admin'])`)**:
  - `GET /api/admin/dashboard`: Kini menyertakan `usageSummary` (sesi aktif/terkumpul, hasil resmi vs latihan, ukuran bank soal, batch impor, penjelajah aktif, total XP & lencana).
  - `GET /api/admin/gamification/config` & `PUT /api/admin/gamification/config`: Membaca dan memperbarui aturan XP (`0–100`) serta katalog 12 lencana dengan sinkronisasi Firestore `badges` dan `auditLogs`.
