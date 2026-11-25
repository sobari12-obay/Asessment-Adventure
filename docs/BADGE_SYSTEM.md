# Sistem 12 Lencana Penjelajah — PSAS ADVENTURE

Seluruh lencana dievaluasi dan diberikan secara otomatis oleh server (`evaluateAndAwardBadges` di `server/adventureEngine.ts`) setelah setiap aksi petualangan yang sah. Siswa tidak dapat memanggil pembukaan lencana secara manual dari browser.

## Katalog 12 Lencana Resmi

| No | `badgeId` | Nama Lencana | Kategori | Syarat Pembukaan Otomatis |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `penjelajah_pertama` | **Penjelajah Pertama** | Tonggak | Menyelesaikan pemilihan karakter dan masuk Base Camp pertama kali |
| 2 | `si_pemberani` | **Si Pemberani** | Tonggak | Menyelesaikan pos checkpoint pertama pada dunia mana pun |
| 3 | `penjelajah_konsisten` | **Penjelajah Konsisten** | Konsistensi | Membuka minimal 3 dunia berbeda atau aktif di >= 2 hari berbeda |
| 4 | `sahabat_alam` | **Sahabat Alam** | Dunia (`ipas`) | Menuntaskan seluruh pos ekspedisi di Dunia IPAS |
| 5 | `ahli_angka` | **Ahli Angka** | Dunia (`matematika`) | Menuntaskan seluruh pos di Dunia Matematika |
| 6 | `pencinta_kata` | **Pencinta Kata** | Dunia (`bahasa_indonesia`) | Menuntaskan seluruh pos di Dunia Bahasa Indonesia |
| 7 | `seniman_cilik` | **Seniman Cilik** | Dunia (`seni_rupa`) | Menuntaskan seluruh pos di Dunia Seni Rupa |
| 8 | `bintang_kebaikan` | **Bintang Kebaikan** | Dunia (`pai` / `pancasila`) | Menuntaskan Dunia PAI atau Pendidikan Pancasila |
| 9 | `english_explorer` | **English Explorer** | Dunia (`bahasa_inggris`) | Menuntaskan seluruh pos di Dunia Bahasa Inggris |
| 10 | `budaya_nusantara` | **Budaya Nusantara** | Dunia (`bahasa_sunda` / `bahasa_cirebon`) | Menuntaskan Dunia Bahasa Sunda atau Bahasa Cirebon |
| 11 | `penjelajah_5_dunia` | **Penjelajah 5 Dunia** | Tonggak | Menyelesaikan seluruh pos di minimal 5 dunia berbeda |
| 12 | `penjelajah_10_dunia` | **Penjelajah 10 Dunia** | Tonggak | Menyelesaikan seluruh pos di ke-10 dunia Penjelajah Cilik |

## Prinsip Penghargaan
- Idempoten berdasarkan kunci unik `{schoolId}__{studentId}__{badgeId}` di `studentBadges`.
- Setiap pembukaan lencana baru memicu event `BadgeUnlocked` pada `adventureEvents` dan tampil pada overlay perayaan (`AdventureCelebrationOverlay`) maupun tab **Lemari Lencana (12)** di Base Camp.
- Tidak ada papan peringkat skor antar siswa; lencana merayakan ketekunan dan eksplorasi tiap anak.
