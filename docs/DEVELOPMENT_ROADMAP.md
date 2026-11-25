# Peta Jalan Pengembangan — PSAS ADVENTURE

## Tahap 1 & 1A — Fondasi Arsitektur, Keamanan, & Antarmuka Utama (SELESAI)
- Penetapan identitas **SDN Pekiringan** (`schoolId: 'sdn_pekiringan'`) dan skema 20 koleksi Firestore + rules ter-deploy.
- Halaman Utama (Raka & Laras, Mulai Petualangan, Masuk Guru, Petunjuk, Pengaturan Suara), Pemilihan Jalur Masuk, Masuk Siswa, Login Guru Firebase Auth, dan Petunjuk.

## Tahap 1B — Dashboard Guru, Dashboard Siswa, & Peta 10 Dunia (SELESAI)
- **Dashboard Guru**: Header PSAS ADVENTURE + SDN Pekiringan, sapaan guru, 8 menu navigasi responsif, KPI jujur dari Firestore, serta placeholder *"Fitur dalam tahap pengembangan"* untuk `Jadwal PSAS` dan `Laporan`.
- **Dashboard Siswa**: Markas pribadi siswa dengan isolasi data pribadi yang ketat.
- **Peta 10 Dunia Petualangan**: Jalur Nusantara interaktif 10 mapel dan konfigurasi terpisah `src/data/worldStatusConfig.ts`.

## Tahap 1C — Integrasi Firebase, Backend API, & Keamanan (SELESAI)
- Pemisahan konfigurasi Firebase (`src/config/firebaseConfig.ts`, `.env.example`), integrasi verifikasi Firebase ID Token (`server/firebaseAdmin.ts`) dan Firestore REST API (`server/firestoreRest.ts`) sesuai Starter Tier.
- Rate limiting brute-force login siswa (`server/rateLimiter.ts`), pencabutan token sesi siswa pada logout (`jti`), endpoint admin/guru/siswa/publik di `/server.ts` + `/src/services/apiClient.ts`.
- Pengetatan `firestore.rules` (status aktif guru, pemisahan admin vs guru, anti-spoof `auditLogs`), `storage.rules`, serta inisialisasi idempoten tanpa siswa/kelas fiktif (`seedSchoolFoundationToFirestore`).

## Tahap 2 — Pengayaan Konten Kurikulum Merdeka Kelas 3 & Fitur Misi Lanjutan (SELANJUTNYA)
- Penambahan manajemen kelas & siswa nyata oleh Admin/Guru di SDN Pekiringan serta pengisian bank soal 10 mata pelajaran.
- Aktivasi penuh menu **Jadwal PSAS** (`startsAt`/`endsAt` otomatis) dan **Laporan** rekap semester lintas 10 dunia.

## Tahap 3 — Pengalaman Visual & Audio Ramah Anak Lanjutan
- Aktivasi Firebase Storage untuk unggah gambar soal khusus & rekaman audio narasi guru (setelah Storage bucket diaktifkan pemilik di Console).
- Pengayaan animasi perayaan artefak dan umpan balik audio per dunia.

## Tahap 4 — Asisten AI Impor Soal Guru (Gemini API Backend)
- Pembuatan endpoint server-side `/api/ai/extract-questions` menggunakan `@google/genai` untuk membaca `.docx`, `.pdf`, dan foto soal menjadi draf `BELUM_DIVERIFIKASI`.

## Tahap 5 — Deployment Produksi Google Cloud Run & Multi-Sekolah
- Deployment ke Google Cloud Run oleh pemilik proyek dengan `STUDENT_SESSION_SECRET` & kredensial produksi.
- Ekspansi multi-`schoolId` untuk sekolah lain tanpa perubahan skema database.
