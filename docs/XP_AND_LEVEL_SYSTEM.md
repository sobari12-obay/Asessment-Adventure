# Sistem XP & 10 Jenjang Level — PSAS ADVENTURE

Seluruh perhitungan Experience Points (XP) dan kenaikan level berjalan **100% di sisi server** (`server/adventureEngine.ts`). Permintaan mutasi XP langsung dari klien (`POST /api/student/adventure/xp`) ditolak dengan status HTTP `403 CLIENT_XP_MUTATION_FORBIDDEN`.

## 1. Sumber Perolehan XP (Deduplikasi Deterministik)
Setiap perolehan XP dicatat dengan `transactionId` deterministik di `xpTransactions` sehingga mengulang aksi yang sama tidak pernah menggandakan XP:

| Sumber Aksi (`sourceType`) | XP | Aturan Deduplikasi & Keamanan |
| :--- | :---: | :--- |
| `CharacterSelected` | +10 | Sekali per siswa saat menyelesaikan Gerbang Karakter |
| `BaseCampVisited` | +10 | Sekali per siswa saat pertama masuk Base Camp |
| `WorldOpened` | +15 | Sekali per siswa per dunia saat dunia dalam status terbuka |
| `CheckpointCompleted` | +15 s.d. +50 | Sekali per siswa per pos setelah pos dimulai & diselesaikan |
| `ExamCompleted` | +50 | Hook Tahap 3; dipicu hanya setelah `assessmentSessions.status` bernilai `submitted`/`graded` |

**Prinsip Ramah Anak**: Jawaban atau klik eksplorasi yang belum tepat pada checkpoint tidak pernah memotong atau mengurangi XP (`amount > 0` selalu).

## 2. Tabel Resmi 10 Jenjang Level Penjelajah
Dihitung otomatis dari `totalXp` via `computeLevelInfo(totalXp)`:

| Level | Gelar Penjelajah | Rentang XP |
| :---: | :--- | :--- |
| **1** | Penjelajah Pemula | `0 – 99 XP` |
| **2** | Penjelajah Muda | `100 – 249 XP` |
| **3** | Penjelajah Aktif | `250 – 449 XP` |
| **4** | Penjelajah Hebat | `450 – 699 XP` |
| **5** | Petualang Cerdas | `700 – 999 XP` |
| **6** | Petualang Tangguh | `1000 – 1399 XP` |
| **7** | Penjelajah Andal | `1400 – 1799 XP` |
| **8** | Penjelajah Istimewa | `1800 – 2299 XP` |
| **9** | Master Petualangan | `2300 – 2899 XP` |
| **10** | Legenda Penjelajah | `2900+ XP` |

## 3. Aturan Perayaan Level-Up & Ledger Kejadian
- **Anti-Spam Level-Up**: `leveledUp: true` hanya bernilai benar pada transaksi di mana `newLevel > previousLevel`.
- **Ledger Kejadian (`adventureEvents`)**: Setiap peristiwa (`CharacterCustomized`, `BaseCampEntered`, `WorldEntered`, `CheckpointOpened`, `CheckpointDone`, `XpAwarded`, `LevelUp`, `BadgeUnlocked`) direkam secara append-only untuk ditampilkan di tab Riwayat Base Camp maupun ringkasan aktivitas guru.
