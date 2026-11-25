# Assessment Engine — Tahap 3 (PSAS ADVENTURE)

**Assessment Engine** menggerakkan seluruh siklus pembuatan soal, pengelolaan ujian, pengerjaan siswa berbasis petualangan, penilaian otomatis & manual, hingga analitik hasil di **PSAS ADVENTURE — 10 Dunia Penjelajah Cilik** (`SDN Pekiringan`).

## 1. 11 Tipe Soal Resmi & Kebijakan Penilaian

Server (`/server/assessmentEngine.ts`) dan antarmuka siswa (`/src/components/exam/QuestionRenderer.tsx`) mendukung 11 tipe soal:

| No | Tipe (`type`) | Mekanisme Jawaban & Evaluasi Server |
| :--- | :--- | :--- |
| 1 | `multiple_choice` | Pilihan ganda (1 kunci pasti, perbandingan ter-normalisasi) |
| 2 | `true_false` | Benar / Salah |
| 3 | `short_answer` | Isian singkat: mendukung `acceptedVariations[]`, sensitivitas huruf opsional, dan `numericTolerance` |
| 4 | `matching` | Menjodohkan pasangan kiri-kanan (skor proporsional per pasangan benar) |
| 5 | `ordering` | Mengurutkan langkah/urutan item (perbandingan urutan tepat) |
| 6 | `drag_drop` | Pasangkan kartu ke target zona |
| 7 | `image_choice` | Pilihan berbasis kartu gambar/motif |
| 8 | `audio` | Soal menyimak audio dengan pelindung sanitasi URL |
| 9 | `illustrated` | Soal bergambar ilustrasi dengan sanitasi skema aman |
| 10 | `multiple_select` | Pilihan ganda kompleks (`exact` atau `partial_proportional`) |
| 11 | `essay` | Uraian bebas: status awal `manual_pending`, wajib dikoreksi guru menggunakan rubrik (`POST /api/teacher/submissions/:submissionId/grade`) |

## 2. Siklus Hidup Ujian & Isolasi Kunci Jawaban

1. **Bank Soal & Paket Asesmen Guru (`/api/teacher/questions/*`, `/api/teacher/exams/*`)**:
   - Guru menyusun soal di Bank Soal (`questionBanks`) dengan status verifikasi `VERIFIED` atau `BELUM_DIVERIFIKASI`, lalu melampirkannya ke paket ujian (`assessments`).
   - Siklus status asesmen: `draft` → `scheduled` → `active` → `closed` → `completed` / `archived`.
2. **Isolasi Anti-Cheat Siswa**:
   - Payload `/api/student/exam/start` dan `/api/student/exam/session/:sessionId` **tidak pernah mengirimkan** `correctAnswer`, `acceptedVariations`, `numericTolerance`, maupun `rubric` (pada mode PSAS).
   - Simpan jawaban (`POST .../answer`), tandai soal ragu-ragu (`POST .../flag`), dan status sesi (`GET .../status`) selalu terikat pada `studentId` dari token HMAC siswa.
3. **Pemulihan Refresh Halaman (F5) (`App.tsx` + `sessionStorage`)**:
   - Metadata sesi siswa & ujian aktif dipulihkan secara aman tanpa menyimpan token mentah di `localStorage`, sehingga refresh halaman tetap menjaga kelanjutan asesmen sesuai sisa waktu server.
4. **Koreksi Esai & Rilis Hasil**:
   - Paket ujian yang memiliki soal `essay` otomatis berstatus `waiting_essay_grading` hingga guru mengisi skor & catatan per soal.
   - Kebijakan rilis nilai (`ResultPolicyRecord`): `immediately_after_submit`, `after_manual_grading`, `when_released_by_teacher`, atau `score_hidden`.
   - Setelah sesi berstatus `submitted` atau `graded`, hook Tahap 2 `POST /api/student/adventure/exam-completed` memberi `+50 XP` secara idempoten.
