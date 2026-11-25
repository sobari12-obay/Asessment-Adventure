# Dokumentasi Gamifikasi & Progres Siswa — PSAS ADVENTURE (Tahap 5)

## 1. Jenjang Level & Prinsip Sehat Anak
- **10 Level Resmi (`LEVEL_THRESHOLDS` tetap)**: Level 1 (`Penjelajah Pemula`, `0 XP`) hingga Level 10 (`Legenda Penjelajah`, `2900+ XP`).
- **XP Non-Negatif & Idempoten**: Seluruh transaksi menggunakan `transactionId` deterministik (`BaseCampVisited`, `CharacterSelected`, `WorldOpened`, `CheckpointCompleted`, `ExamCompleted`); klik salah atau nilai rendah **tidak pernah** mengurangi XP atau mengunci dunia lain.
- **Non-Kompetitif**: Papan peringkat skor antar siswa dilarang keras di sisi siswa maupun laporan guru (`getTeacherAdventureProgressReport` diurutkan secara alfabetis berdasarkan kelas dan nama).

## 2. Konfigurasi Aturan Gamifikasi oleh Administrator (`GET/PUT /api/admin/gamification/config`)
Admin sekolah dapat mengatur melalui menu **Adventure Engine**:
- Nilai hadiah XP (`0–100`): `xpBaseCampVisit`, `xpCharacterSelect`, `xpWorldOpen`, `xpExamOfficial`, `xpExamPractice`, dan `xpExamSimulation`.
- Katalog 12 lencana: ubah `name`, `description`, `targetCount`/`xpThreshold`, serta status `isActive`.
- Perubahan disimpan di `adventureStore` (`gamificationConfigs[schoolId]`) dan disinkronkan ke koleksi Firestore `badges/{badgeId}` serta dicatat ke `auditLogs`.

## 3. Animasi Selebrasi & Dasbor Siswa
- `AdventureCelebrationOverlay` aktif saat kenaikan XP, naik level, lencana baru terbuka, maupun penyelesaian dunia (`completedWorldName`), lengkap dengan kilau bintang ramah anak yang menghormati `reducedMotion` dan pengaturan `soundEffectsEnabled`.
- `StudentAdventureRunner` menampilkan overlay selebrasi satu kali saat siswa menuntaskan ujian/misi.
- `StudentDashboardPage` & `AdventureWorldMap` menampilkan jumlah **Dunia Dikunjungi**, **Dunia Selesai**, status kesiapan misi asesmen pribadi, serta indikator lencana terkait tiap dunia.
