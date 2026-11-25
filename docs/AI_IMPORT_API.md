# Dokumentasi API AI Question Import — Tahap 4

Seluruh endpoint berada di `/server.ts`, dilindungi oleh middleware `authenticateStaff` + `requireRole(['admin', 'teacher'])`, serta terikat pada `staff.schoolId`. Pengguna tidak terautentikasi ditolak dengan `401 UNAUTHENTICATED`, dan siswa/peran non-staf ditolak dengan `403`.

## 1. Status & Daftar Sesi Impor
- **`GET /api/teacher/import/status`**
  - **Response `200`**: `{ ok: true, geminiConfigured: boolean, maxFileSizeBytes: number, maxFilesPerBatch: number, storageBucketConfigured: boolean }`.
- **`GET /api/teacher/import/batches`**
  - **Response `200`**: `{ ok: true, items: ImportHistorySummary[] }` (riwayat sesi impor milik sekolah terkait).

## 2. Siklus Batch Impor (Tahap A–F)
- **`POST /api/teacher/import/batches`**
  - **Body**: `{ sourceMode?: 'document' | 'photo' | 'camera', defaultSubjectId?, defaultGrade?, defaultSemester?, defaultTopic? }`
  - **Response `201`**: `{ ok: true, batch }`.
- **`POST /api/teacher/import/batches/:batchId/upload`**
  - **Content-Type**: `multipart/form-data` (field `files`, maks 5 berkas × 10 MB; maks 35 MB/batch).
  - **Validasi**: Ekstensi diizinkan (`.docx`, `.pdf`, `.xlsx`, `.csv`, `.jpg`, `.jpeg`, `.png`, `.webp`) + pengecekan *magic bytes* biner agar berkas palsu ditolak (`400 UNSUPPORTED_FILE_TYPE` / `INVALID_FILE_SIGNATURE` / `FILE_TOO_LARGE` / `TOO_MANY_FILES`).
  - **Response `200`**: `{ ok: true, batch }`.
- **`POST /api/teacher/import/batches/:batchId/extract`**
  - **Rate Limit**: 20 permintaan / 15 menit per `(schoolId, uid)` (`429 RATE_LIMITED`).
  - **Behavior**:
    - Ekstraksi deterministik untuk `.csv`/`.xlsx`; ekstraksi DOCX via `mammoth` + `JSZip` (termasuk gambar `word/media/*`); ekstraksi PDF via `pdf-parse` + multimodal Gemini untuk *scanned PDF* atau foto.
    - Jika sumber membutuhkan AI dan `GEMINI_API_KEY` tidak tersedia/valid di server, mengembalikan **`503 GEMINI_NOT_CONFIGURED`**.
  - **Response `200`**: `{ ok: true, batch }` dengan `candidates[]`, `tempAssets[]`, dan statistik ringkasan.
- **`GET /api/teacher/import/batches/:batchId`**
  - **Response `200`**: `{ ok: true, batch }` (`404 BATCH_NOT_FOUND` jika bukan milik sekolah atau tidak ada).
- **`PUT /api/teacher/import/batches/:batchId/questions`**
  - **Body**: `{ candidates: ExtractedCandidateRecord[] }`
  - **Behavior**: Menyimpan hasil suntingan guru (ubah soal, setujui `aiSuggestedAnswer` secara eksplisit, tandai pilihan simpan, ubah urutan).
- **`POST /api/teacher/import/batches/:batchId/save`**
  - **Body**: `{ selectedIds?: string[], skipDuplicates?: boolean }`
  - **Behavior**:
    - Menyimpan kandidat terpilih secara **idempoten** ke Bank Soal (`questionBanks`) + mirror ke Firestore (`questionBanks` & `importBatches`).
    - Mengunggah aset gambar temp ke Firebase Storage bila bucket aktif, atau mencatat peringatan pada `storageWarnings[]` jika bucket belum dikonfigurasi.
    - Membersihkan folder berkas temp mentah setelah selesai.
  - **Response `200`**: `{ ok: true, alreadySaved: boolean, savedQuestionIds: string[], storageWarnings: string[], batch }`.
- **`POST /api/teacher/import/batches/:batchId/cancel`**
  - **Behavior**: Membatalkan batch tertunda dan langsung menghapus direktori `data/import-temp/{batchId}`.
- **`GET /api/teacher/import/batches/:batchId/assets/:assetId`**
  - **Auth**: Wajib `Authorization: Bearer <firebaseIdToken>` guru/admin; header keamanan `X-Content-Type-Options: nosniff` & `Cache-Control: private, max-age=300`.
  - **Behavior**: Mengalirkan aset gambar sementara dari `data/import-temp/{batchId}/assets/` dengan sanitasi ID ketat.
