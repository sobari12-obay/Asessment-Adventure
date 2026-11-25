# Laporan Pengujian — Tahap 3 & Tahap 4 (AI Question Import)

Tanggal verifikasi: **2026-11-25**

## 1. Pengujian Terverifikasi Penuh (`PASS`)

| No | Cakupan Pengujian | Metode / Alat | Hasil Nyata |
| :--- | :--- | :--- | :--- |
| 1 | Build Produksi & TypeScript Strictness | `compile_applet` (`vite build`) + `lint_applet` (`tsc --noEmit`) | **PASS** — 0 error kompilasi & 0 error TypeScript setelah seluruh komponen Tahap 3 & Tahap 4 terpasang. |
| 2 | Live HTTP Server & RBAC Auth Guards | HTTP fetch ke `http://127.0.0.1:3000` | **PASS** — `GET /api/health` -> `200 OK`; permintaan tanpa token ke `/api/teacher/import/status`, `/api/teacher/import/batches`, `/api/teacher/import/batches/b1/assets/a1`, `/api/teacher/questions`, dan `/api/student/exam/enter` seluruhnya mengembalikan `401`. |
| 3 | Stage 3 Evaluasi 11 Tipe Soal | Script verifikasi engine (`server/assessmentEngine.ts`) | **PASS** — Seluruh 11 tipe (`multiple_choice`, `true_false`, `short_answer` variasi & toleransi angka, `matching`, `ordering`, `drag_drop`, `image_choice`, `audio`, `illustrated`, `multiple_select` skor parsial, serta `essay` berstatus `manual_pending`) terevaluasi sesuai aturan. |
| 4 | Stage 3 Siklus Ujian & Anti-Leak Kunci | Script verifikasi lifecycle (`upsertQuestionBankItemEngine` → `upsertExamEngine` → `transitionExamStatusEngine('active')` → `enter` → `start` → `answer` → `flag` → `submit` → `gradeEssaySubmissionEngine`) | **PASS** — Payload soal siswa saat `start` terbukti bebas `correctAnswer`; koreksi esai mengubah status menjadi `finalized` (`finalScore: 100`). |
| 5 | Keamanan Upload & Anti Path Traversal | `resolveSafeBatchSubFile` & `validateUploadedFile` | **PASS** — Percobaan `../../etc/passwd` ditolak langsung sebelum pembuatan folder; *magic bytes* tidak cocok, ekstensi terlarang (`.exe`), serta berkas melebihi 10 MB ditolak (`INVALID_FILE_SIGNATURE` / `UNSUPPORTED_FILE_TYPE` / `FILE_TOO_LARGE`). |
| 6 | Ekstraksi Deterministik `.csv` & `.xlsx` + Aturan Kunci Kosong | `uploadFilesToImportBatchEngine` + `extractImportBatchEngine` | **PASS** — Soal terbaca akurat; soal tanpa kunci tetap berstatus `hasExplicitKey: false`, `correctAnswer: ""`, dan menghasilkan `verificationStatus: 'BELUM_DIVERIFIKASI'` saat disimpan ke Bank Soal. |
| 7 | Deteksi Duplikat, Provenance, & Idempoten Save | `saveImportBatchToBankEngine` (panggilan berulang) + ekstrak media DOCX (`JSZip`) | **PASS** — Soal duplikat terdeteksi (`duplicateOfId`); gambar tertanam pada `.docx` diekstrak ke `tempAssets`; pemanggilan `/save` dua kali tidak menggandakan soal (`alreadySaved: true`); folder temp batch dibersihkan setelah simpan/batal. |
| 8 | Perilaku Jujur Tanpa Kunci Gemini | `extractImportBatchEngine` pada berkas gambar/PDF saat `GEMINI_API_KEY` tidak diatur | **PASS** — Server mengembalikan status `503` berkode `GEMINI_NOT_CONFIGURED` tanpa memalsukan keluaran AI. |
| 9 | Kebersihan Rules Firestore | `eslint DRAFT_firestore.rules firestore.rules` + `DeployRules` | **PASS** — Aturan `questionBanks` & `importBatches` tervalidasi dan aktif di Firestore. |

## 2. Item Belum Teruji / Memerlukan Konfigurasi Lingkungan
- **Ekstraksi AI Langsung via Gemini (`gemini-4-hydrogen`) untuk `.docx`, `.pdf`, foto, & kamera**: Belum dapat diuji langsung ke endpoint Gemini karena `GEMINI_API_KEY` belum disetel pada lingkungan server saat pengujian (`GEMINI_API_KEY present: false`).
- **Uji Interaktif Browser Penuh**: Belum dilakukan pengujian klik E2E di browser headless untuk *flow* webcam `getUserMedia`, modal editor, dan upload gambar ke bucket Firebase Storage produksi (tergantung aktivasi Firebase Storage di console).
