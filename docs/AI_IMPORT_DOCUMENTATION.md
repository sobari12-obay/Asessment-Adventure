# AI Question Import — Tahap 4 (PSAS ADVENTURE)

**Stage 4: AI Question Import** memungkinkan guru/admin mengunggah dokumen atau foto soal lalu mengekstrak kandidat soal secara terstruktur ke dalam **Bank Soal** (`QuestionBankView.tsx` → **"Impor Soal dengan AI"**).

## 1. Sumber Input yang Didukung

1. **Dokumen (`document`)**:
   - Microsoft Word (`.docx`) — ekstraksi teks & tabel melalui `mammoth` serta ekstraksi gambar tertanam (`word/media/*`) via `JSZip`.
   - PDF (`.pdf`) — ekstraksi teks digital via `pdf-parse`; jika PDF terdeteksi hasil pindaian (*scanned PDF*), berkas diteruskan secara multimodal ke Gemini API.
   - Lembar sebar terstruktur (`.xlsx`, `.csv`) — parsing deterministik via `xlsx` (tanpa memerlukan panggilan Gemini jika struktur kolom terbaca langsung).
2. **Foto Soal (`photo`) & Kamera Langsung (`camera`)**:
   - Gambar `.jpg`, `.jpeg`, `.png`, `.webp` dengan validasi *magic bytes* asli dan dukungan kamera `getUserMedia` + fallback unggah galeri/kamera perangkat seluler.
3. **Batasan Batch**:
   - Maksimal **5 berkas** per sesi, **10 MB per berkas**, dan **35 MB total per batch**.

## 2. Arsitektur & Keamanan Pemrosesan

- **Server-Side AI Only (`/server/aiImportEngine.ts`)**:
  - Menggunakan `@google/genai` dengan model `'gemini-4-hydrogen'` hanya di sisi server melalui `process.env.GEMINI_API_KEY`.
  - Jika `GEMINI_API_KEY` belum dikonfigurasi pada server, endpoint ekstraksi AI mengembalikan HTTP **`503 GEMINI_NOT_CONFIGURED`** secara jujur tanpa menghasilkan data AI palsu.
  - Parsing deterministik `.csv` dan `.xlsx` tetap berjalan normal tanpa ketergantungan kunci API Gemini.
- **Aturan Ketat Kunci Jawaban (`BELUM_DIVERIFIKASI`)**:
  - Jika dokumen sumber tidak mencantumkan kunci jawaban eksplisit, sistem **wajib** membiarkan `correctAnswer: ""` dengan `hasExplicitKey: false`.
  - Dugaan jawaban dari AI disimpan terpisah pada field `aiSuggestedAnswer` (`aiSuggestionApproved: false`) dan **tidak pernah** disalin otomatis menjadi kunci resmi tanpa klik persetujuan eksplisit guru (**"Jadikan Kunci Resmi"**).
  - Soal yang disimpan tanpa kunci jawaban otomatis ditandai `verificationStatus: 'BELUM_DIVERIFIKASI'` di Bank Soal.
- **Deteksi Duplikat & Provenance**:
  - Setiap kandidat dibandingkan terhadap `questionBanks` sekolah terkait (`duplicateOfId`, `duplicateSimilarity`, `duplicatePromptPreview`) dan dapat dilewati saat simpan (`skipDuplicates`).
  - Setiap soal hasil impor menyimpan metadata asal (`importBatchId`, `sourceFileName`, `sourceFileType`, `sourcePage`, `sourceQuestionNumber`, `extractionStatus`, `extractionConfidence`, `needsReview`, `importedBy`, `importedAt`).
- **Penyimpanan Sementara & Pembersihan (`/server/importStore.ts`)**:
  - Berkas unggahan mentah & aset gambar ekstrak disimpan di direktori terisolasi `data/import-temp/{batchId}/` dengan proteksi anti *path traversal* (`resolveSafeBatchSubFile`).
  - Pembersihan otomatis berjalan setelah batch selesai (`completed`), dibatalkan (`cancelled`), gagal, dan via penyapu TTL berkala (2 jam untuk batch aktif, 15 menit untuk batch selesai).

## 3. Alur Antarmuka Guru (Tahap A–F)

Komponen di `/src/components/teacher/import/`:
- `ImportQuestionPage.tsx` — orkestrator alur A–F & tab riwayat impor.
- `FileUploadArea.tsx` — mode *Dokumen*, *Foto*, & *Kamera Langsung* + metadata default kelas/mapel/semester.
- `ImportProgress.tsx` — indikator progres tahapan unggah & ekstraksi.
- `ExtractionResult.tsx` — daftar kandidat soal dengan 5 filter (`Semua`, `Perlu Review`, `Tanpa Kunci`, `Duplikat`, `Gagal`), pratinjau gambar temp terautentikasi, persetujuan saran kunci AI, ubah urutan, dan hapus item.
- `QuestionReviewEditor.tsx` — modal editor detail untuk memperbaiki tipe soal, stem, opsi, variasi jawaban, rubrik, atau menandai hapus gambar.
- `ImportSummary.tsx` — ringkasan konfirmasi akhir sebelum simpan idempoten ke Bank Soal & Firestore (`questionBanks` + `importBatches`).
- `ImportHistory.tsx` — daftar riwayat sesi impor untuk melanjutkan review atau membatalkan sesi tertunda.
