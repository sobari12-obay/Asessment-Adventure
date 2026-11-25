# Security Specification — PSAS ADVENTURE (SDN Pekiringan)

## 1. Data Invariants
1. **Default Deny**: Semua koleksi yang tidak didefinisikan secara eksplisit ditolak (`allow read, write: if false`).
2. **Isolasi Sekolah (`schoolId`)**: Seluruh entitas inti wajib membawa `schoolId` (default awal `sdn_pekiringan`) untuk kesiapan multi-sekolah.
3. **Kunci Jawaban Terisolasi**: Koleksi `questions`, `questionKeys`, dan `questionBanks` hanya dapat dibaca/ditulis oleh guru/admin terverifikasi (`isTeacher()`). Siswa tidak pernah mendapat akses ke kunci jawaban PSAS resmi.
4. **Tanpa Kebocoran Daftar Siswa & Kode Ujian**:
   - Koleksi `students` hanya dapat dibaca oleh guru/admin (`allow read: if isTeacher()`). Browser siswa tidak pernah melakukan `list` terhadap seluruh daftar siswa.
   - Koleksi `studentAccessKeys` hanya mengizinkan `get` berbasis hash identitas spesifik (`allow list: if false`), sehingga tidak dapat di-scrape.
   - Koleksi `assessmentAccess` menyimpan hash kode ujian (`codeHash`) dan hanya mengizinkan `get` berbasis hash kode (`allow list: if false`), sehingga daftar kode ujian tidak terekspos ke browser.
   - `publicAssessments` tidak menyimpan kode ujian teks terbuka (`code`).
5. **Integritas Sesi & Riwayat**:
   - `assessmentSessions` hanya boleh dibuat dalam status `'in_progress'` dan mengacu pada `publicAssessments` yang aktif dan tidak terkunci.
   - Siswa hanya dapat memperbarui progres selama `existing().status == 'in_progress'`, dengan daftar field terbatas (`affectedKeys().hasOnly(...)`). Setelah `'submitted'` atau `'graded'`, sesi terkunci dari modifikasi siswa.
   - `studentAnswers` terhubung ke `assessmentSessions` dan hanya dapat ditulis saat sesi masih `'in_progress'`.
   - `results` hanya boleh dibuat/diubah oleh guru terverifikasi (`isTeacher()`).
6. **Audit Trail (`auditLogs`)**: Log aktivitas bersifat append-only untuk kejadian sistem/autentikasi/guru; tidak boleh diubah atau dihapus, dan klien non-guru/non-admin tidak boleh memalsukan `actorType` sebagai `'admin'` atau `'teacher'`.
7. **Pemisahan Admin vs Guru**: Perubahan identitas sekolah (`schools`), master mata pelajaran (`subjects`), pengaturan global (`settings`), serta daftar peran (`users`/`admins`/`teachers`) hanya diizinkan oleh `isAdmin()`. Guru yang dinonaktifkan (`isActive == false`) otomatis ditolak oleh `isTeacher()`.

## 2. The "Dirty Dozen" Payloads (Harus Menghasilkan PERMISSION_DENIED)
1. **Unauthenticated Teacher Read on `questions` / `questionKeys`**: Siswa atau klien anonim membaca `questionKeys/q_mtk_1` -> DITOLAK.
2. **Unauthenticated List on `students`**: Klien anonim mencoba `list` koleksi `students` untuk mengunduh daftar siswa -> DITOLAK.
3. **List Enumeration on `studentAccessKeys`**: Klien non-guru mencoba `list` `studentAccessKeys` -> DITOLAK (`allow list: if isTeacher()`).
4. **List Enumeration on `assessmentAccess`**: Klien non-guru mencoba `list` `assessmentAccess` -> DITOLAK (`allow list: if isTeacher()`).
5. **Self-Privilege Escalation on `teachers`/`users`/`admins`**: Pengguna Google non-admin mencoba membuat atau menaikkan peran di `teachers/{uid}`, `users/{uid}`, atau `admins/{uid}` -> DITOLAK.
6. **Unverified Email or Deactivated Teacher**: Pengguna dengan `email_verified: false` atau dokumen guru dengan `isActive: false` mencoba akses write guru -> DITOLAK.
7. **Student Forging Result Score**: Siswa mencoba membuat atau mengubah `results/{sessionId}` -> DITOLAK (`isTeacher()` required).
8. **Shadow Field Injection on `assessmentSessions`**: Siswa mengirim field ekstra `isVerified: true` atau `finalScore: 100` saat membuat/update `assessmentSessions` -> DITOLAK (`hasOnly`).
9. **Post-Submit Tampering**: Siswa mencoba mengubah `studentAnswers` atau `assessmentSessions` setelah status sesi menjadi `'submitted'` -> DITOLAK.
10. **ID Poisoning**: Payload menggunakan dokumen ID > 128 karakter atau karakter ilegal `../../admin` -> DITOLAK (`isValidId`).
11. **Timestamp Forgery**: Guru/siswa mengirim timestamp klien mundur pada `createdAt`/`updatedAt` -> DITOLAK (`== request.time`).
12. **Cross-Owner / Immutable Field Mutation**: Guru mencoba mengganti `ownerId` atau `createdAt` pada `assessments` saat update -> DITOLAK.
13. **Stage 2 Anti-Cheat XP/Badge/Level Spoofing**: Siswa atau klien non-admin mencoba menulis langsung ke `adventureProfiles`, `worldProgress`, `checkpointProgress`, `studentBadges`, `xpTransactions`, atau `adventureEvents` di Firestore -> DITOLAK (`isAdmin()` / `false` pada update-delete). Seluruh XP, level, lencana, dan event petualangan bersifat server-authoritative.
14. **Stage 2 World & Checkpoint Catalog Tampering**: Siswa mencoba mengubah ketersediaan dunia (`adventureWorlds`), reward checkpoint (`checkpoints.xpReward > 50`), atau definisi lencana (`badges`) di Firestore -> DITOLAK (`isTeacher()` / `isAdmin()` required).
