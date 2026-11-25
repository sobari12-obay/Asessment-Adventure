# Project Overview — PSAS ADVENTURE

## 1. Identitas Aplikasi
- **Nama Aplikasi**: PSAS ADVENTURE
- **Subjudul**: 10 Dunia Penjelajah Cilik
- **Slogan**: *"Jelajahi Dunia, Selesaikan Misi, Raih Pengalaman!"*
- **Sekolah Pengguna Awal**: **SDN Pekiringan** (`schoolId: 'sdn_pekiringan'`; skema siap multi-sekolah).
- **Target Pengguna**: Siswa Kelas 3 Sekolah Dasar (usia 8–9 tahun), Guru Kelas/Mapel, dan Administrator Sekolah.
- **Bahasa Utama**: Bahasa Indonesia (mendukung mata pelajaran Bahasa Inggris, Bahasa Sunda, dan Bahasa Cirebon).
- **Platform**: Aplikasi Web Responsif (Mobile-first untuk HP Android/iPhone, Tablet, Laptop, Chromebook, dan Desktop).

## 2. Visi & Konsep Utama
Mengubah pengalaman Penilaian Sumatif Akhir Semester (PSAS) dari ujian konvensional yang menegangkan menjadi petualangan edukatif interaktif melintasi **10 Dunia Mata Pelajaran**:
1. **PAI** — *Negeri Cahaya Kebaikan*
2. **Pendidikan Pancasila** — *Negeri Sahabat*
3. **Bahasa Indonesia** — *Hutan Kata*
4. **Matematika** — *Pulau Angka*
5. **IPAS** — *Ekspedisi Alam*
6. **Seni Rupa** — *Galeri Kreativitas*
7. **PJOK** — *Arena Gerak Ceria*
8. **Bahasa Inggris** — *English Quest*
9. **Bahasa Sunda** — *Lembur Pangumbaraan*
10. **Bahasa Cirebon** — *Jelajah Tanah Cirebon*

## 3. Prinsip Desain & Asesmen
- **Objektivitas Akademik**: Gamifikasi (peta, dua karakter penjelajah Raka & Laras, checkpoint, artefak, bintang) hanya memotivasi progres, tidak mengubah bobot, kunci jawaban, maupun perhitungan nilai.
- **Tanpa Penalti Emosional**: Tidak ada pengurangan nyawa, tidak ada papan peringkat antar-siswa, dan tidak ada pesan kegagalan pada jawaban salah.
- **Privasi & Keamanan Ujian**: Daftar seluruh siswa, kode ujian plaintext, dan kunci jawaban tidak pernah diekspos ke browser siswa. Masuk siswa diverifikasi melalui hash SHA-256 dan token sesi bertanda tangan HMAC-SHA256 di backend Express.
- **Dua Mode Terpisah**:
  - **Mode PSAS Resmi**: Kunci jawaban terisolasi di backend/koleksi khusus guru, tanpa feedback benar/salah saat pengerjaan.
  - **Mode Latihan**: Mendukung petunjuk ringan, pembahasan, dan kesempatan mengulang tanpa memengaruhi data PSAS resmi.
