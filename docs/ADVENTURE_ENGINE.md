# Adventure Engine — PSAS ADVENTURE (Tahap 2)

**Adventure Engine** mengubah pengalaman masuk dan pengerjaan PSAS siswa kelas 3 SDN Pekiringan (`schoolId: "sdn_pekiringan"`) menjadi pusat petualangan interaktif yang hangat, terarah, bebas hukuman, dan berjalan penuh pada sisi server.

## 1. Arsitektur Utama (Server-Authoritative)
- **Backend Store & Engine**: `/server/adventureStore.ts` (penulisan atomik ke `data/adventure-state.json` dengan antrean serial `mutateAdventureState`) & `/server/adventureEngine.ts`.
- **Integrasi Cloud Firestore**: Katalog dunia (`adventureWorlds`), pos (`checkpoints`), dan lencana (`badges`) dibaca secara dinamis melalui `firestoreRest.ts` serta dapat disinkronkan oleh administrator sekolah melalui `POST /api/admin/adventure/sync-defaults`.
- **Keamanan Rules (`firestore.rules`)**: Koleksi progres siswa (`adventureProfiles`, `worldProgress`, `checkpointProgress`, `studentBadges`, `xpTransactions`, `adventureEvents`) menolak modifikasi langsung dari browser siswa; seluruh pembaruan XP, level, checkpoint, dan lencana diproses secara otoritatif oleh server.

## 2. Alur Petualangan Siswa
1. **Gerbang Karakter (`CharacterCustomizerModal`)**:
   - Siswa yang baru pertama kali login (`characterSelected: false`) diarahkan untuk memilih karakter (**Raka Penjelajah** atau **Laras Penjelajah**), tema kostum, gaya tas, gaya sepatu, warna aksen, serta nama panggilan opsional bebas PII (disaring otomatis dari pola email/telepon/angka panjang).
   - Pilihan karakter tersimpan permanen lintas login dan tidak dapat dilewati jika belum dipilih.
2. **Base Camp Penjelajah (`StudentDashboardPage`)**:
   - Menampilkan ilustrasi Base Camp (`base_camp_explorer_1795581891616.jpg`), avatar berkarakter dengan ekspresi dinamis (`idle`, `happy`, `celebrate`), jenjang Level & bilah progres XP (SVG tanpa inline style), tombol **Lanjutkan Petualangan**, tombol **Pilih Dunia**, tab **Peta 10 Dunia**, **Lemari Lencana (12)**, dan **Riwayat XP & Jenjang Level**.
   - Dilengkapi pengaturan suara (efek suara/musik) dan *reduced motion* ramah anak.
3. **Peta 10 Dunia & 30 Pos Ekspedisi (`AdventureWorldMap` & `WorldCheckpointModal`)**:
   - 10 Dunia Resmi: `pai`, `pancasila`, `bahasa_indonesia`, `matematika`, `ipas`, `seni_rupa`, `pjok`, `bahasa_inggris`, `bahasa_sunda`, `bahasa_cirebon`.
   - Setiap dunia memiliki **3 pos ekspedisi default** (total 30 pos) yang dapat ditambah/dinonaktifkan oleh guru.
   - **Kunci Dunia**: Status terkunci/terbuka (`isAvailable`) **hanya** ditentukan oleh jadwal PSAS atau pengaturan guru/admin—**tidak pernah** mengunci dunia karena nilai rendah.
4. **Hook Tahap 3 (`StudentAdventureRunner` -> `/api/student/adventure/exam-completed`)**:
   - Setelah sesi asesmen benar-benar berstatus `submitted`/`graded` di Firestore, sistem mencatat `ExamCompleted` (+50 XP, terdeduplikasi per `assessmentId`).
5. **Panel Guru (`AdventureEnginePanel`)**:
   - Guru dan admin dapat memantau progres petualangan non-kompetitif (tanpa papan peringkat skor antar siswa), membuka/menutup ketersediaan dunia, menambah atau menonaktifkan checkpoint, dan menyinkronkan katalog default ke Firestore.
