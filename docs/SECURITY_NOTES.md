# Catatan Keamanan — PSAS ADVENTURE

1. **Verifikasi Token Google & Pemisahan Peran (`admin` vs `teacher`)**:
   - Seluruh endpoint `/api/me`, `/api/teacher/*`, `/api/scoring/*`, dan `/api/admin/*` memverifikasi Firebase ID Token melalui `verifyIdToken` (`server/firebaseAdmin.ts`) dan memeriksa `email_verified == true` serta status aktif akun (`isActive != false`) di Firestore.
   - Endpoint `/api/admin/*`, serta penulisan koleksi `schools`, `subjects`, `settings`, `users`, `admins`, dan `teachers`, hanya diizinkan untuk peran `admin` (`isAdmin()`). Guru biasa yang memanggil `/api/admin/*` ditolak dengan HTTP `403`.
2. **Isolasi Kunci Jawaban & Soal Master**:
   - `questionKeys`, `questions`, dan `questionBanks` hanya dapat dibaca dan ditulis oleh akun `teacher` atau `admin` terverifikasi (`isTeacher()`). Dalam Mode PSAS, `publicQuestions` tidak pernah memuat kunci jawaban ataupun penjelasan.
3. **Isolasi Daftar Siswa (`students`), Validasi Server-Authoritative, & Rate Limiting Kelas**:
   - Browser siswa dilarang melakukan `list` pada koleksi `students`, `studentAccessKeys`, maupun `assessmentAccess`.
   - Baik `POST /api/student/login` maupun alias `POST /api/student/validate-entry` selalu memvalidasi kode ujian (`assessmentAccess/{codeHash}`) dan identitas peserta (`studentAccessKeys/{lookupId}`) langsung ke Firestore dari server (mengabaikan objek lookup kiriman klien).
   - Rate limiter (`server/rateLimiter.ts`) mengizinkan burst Wi-Fi sekolah (`120` permintaan/5 menit per IP) dan hanya menghitung kegagalan otentik melalui `peekFailedAttempts` + `recordFailedAttempt` (`6` gagal -> HTTP `429`), termasuk pada salah Nomor Peserta (`PARTICIPANT_MISMATCH`).
   - Kode ujian plaintext dan token rahasia tidak pernah dicatat dalam server logs ataupun `auditLogs`.
4. **Token Sesi Siswa & Pencabutan Logout (`jti`)**:
   - Token `psas_tok_v1.*` memuat `jti` unik dan ditandatangani dengan `HMAC-SHA256` (`STUDENT_SESSION_SECRET`), disimpan hanya di state memori React (`App.tsx`), **tidak pernah** ditulis ke `localStorage`.
   - Saat siswa keluar (`POST /api/student/logout`), `jti` token dicabut sehingga panggilan berikutnya ke `/api/student/profile`, `/api/student/dashboard`, atau `/api/student/verify-token` dengan token tersebut langsung ditolak (`401`).
   - `/api/student/dashboard` memverifikasi kepemilikan `studentId` terhadap `assessmentSessions` sehingga siswa tidak dapat melihat data siswa lain.
5. **Integritas Sesi, Jawaban, Ekspor CSV, Sanitasi Media, & Audit Log**:
   - Siswa hanya dapat membuat `assessmentSessions` berstatus `in_progress` dan memodifikasi field progres tertentu sebelum berstatus `submitted`/`graded`.
   - `auditLogs` bersifat append-only (`allow update, delete: if false`) dan menolak pemalsuan `actorType` `'admin'`/`'teacher'` dari klien non-guru.
   - `QuestionRenderer.tsx` membatasi URL gambar/audio ke skema aman (`http:`, `https:`, `/src/assets/`, `/assets/`), dan ekspor CSV di `ResultsAnalyticsView.tsx` menetralkan prefiks rumus spreadsheet (`=`, `+`, `-`, `@`, `\t`, `\r`).
6. **Keamanan Firebase Storage (`storage.rules`)**:
   - Dibatasi ke prefix `/schools/{schoolId}/public/**` dan `/schools/{schoolId}/private/**` untuk guru aktif (`isActive != false`) atau admin, dengan validasi ukuran maks 10 MB serta tipe konten `image/*`, `audio/*`, dan `application/pdf`.
7. **Rahasia Lingkungan & Kebersihan API**:
   - `GEMINI_API_KEY`, `STUDENT_SESSION_SECRET`, serta variabel server lain hanya berada di server (`process.env`), tidak pernah disematkan di `VITE_*`. JSON tidak valid menghasilkan `400 INVALID_JSON` dan route `/api/*` yang tidak terdaftar menghasilkan `404 API_NOT_FOUND`.
8. **Catatan Audit Dependensi (`xlsx@0.18.5`)**:
   - Pustaka `xlsx@0.18.5` memiliki advisory upstream tanpa rilis perbaikan resmi di npm. Sebagai mitigasi, modul `TeacherDashboard` dimuat secara lazy hanya untuk guru/admin terverifikasi dan tidak dimuat dalam bundel siswa.
9. **Anti-Cheat Adventure Engine & Integritas XP/Lencana (Tahap 2)**:
   - Seluruh perhitungan XP, level, checkpoint, dan lencana diproses secara otoritatif di server (`/server/adventureEngine.ts`); endpoint `POST /api/student/adventure/xp` selalu mengembalikan `403 CLIENT_XP_MUTATION_FORBIDDEN`.
   - `firestore.rules` memblokir penulisan browser siswa ke `adventureProfiles`, `worldProgress`, `checkpointProgress`, `studentBadges`, `xpTransactions`, dan `adventureEvents`.
   - Deduplikasi deterministik melalui `transactionId` dan `eventId` mencegah penggandaan XP atau spam Level-Up dari panggilan berulang. Hook Tahap 3 `/api/student/adventure/exam-completed` selalu memverifikasi kepemilikan `studentId` dan status `submitted`/`graded` langsung ke dokumen `assessmentSessions` di Firestore.
10. **Perlindungan Privasi Anak & Non-Kompetitif**:
   - Nama panggilan kustom karakter siswa dibersihkan server-side (`sanitizeNickname`) untuk mencegah penyimpanan email, nomor telepon, atau rangkaian angka panjang (NIK/NISN).
   - Panel `AdventureEnginePanel` untuk guru tidak menyajikan papan peringkat nilai antar siswa dan menjaga fokus asesmen bebas tekanan.
11. **Keamanan AI Question Import & Integritas Kunci Jawaban (Tahap 4)**:
   - Seluruh panggilan `@google/genai` (`gemini-4-hydrogen`) dijalankan eksklusif di server (`/server/aiImportEngine.ts`) menggunakan `process.env.GEMINI_API_KEY`; jika belum disetel, server mengembalikan `503 GEMINI_NOT_CONFIGURED` tanpa hasil buatan.
   - Endpoint `/api/teacher/import/*` mewajibkan `authenticateStaff` + `requireRole(['admin', 'teacher'])`, rate limiting 20 ekstraksi / 15 menit, validasi ekstensi & *magic bytes* biner, serta batas 5 berkas × 10 MB.
   - `resolveSafeBatchSubFile` di `/server/importStore.ts` menolak pola traversal (`/`, `\`, `..`) sebelum mengakses direktori; berkas temp otomatis dihapus saat selesai/batal/TTL.
   - Sumber soal tanpa kunci jawaban eksplisit wajib menjaga `correctAnswer: ""` (`hasExplicitKey: false`, `BELUM_DIVERIFIKASI`), dan `aiSuggestedAnswer` hanya menjadi kunci resmi jika disetujui eksplisit oleh guru.
