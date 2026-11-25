# Dokumentasi Pelaporan Hasil Asesmen — PSAS ADVENTURE (Tahap 5)

## 1. Gambaran Umum
Modul pelaporan Tahap 5 (`/server/reportingEngine.ts` dan `/src/components/teacher/ReportsAnalyticsHub.tsx`) menggabungkan data otoritatif dari:
- Server Assessment Store (`/server/assessmentStore.ts`),
- Server Adventure Store (`/server/adventureStore.ts`), dan
- Rekaman Firestore milik sekolah (`assessments`, `results`, `students`, `classes`, `questionKeys`/`publicQuestions`, `studentAnswers`) secara ter-deduplikasi oleh `sessionId` dengan prioritas pada submission Stage 3.

Seluruh perhitungan dikunci terhadap `schoolId` (`sdn_pekiringan`), hanya menghitung hasil nyata yang tersimpan, dan mengembalikan nilai `0`/daftar kosong apabila belum terdapat data (tanpa data buatan).

## 2. Pemisahan Nilai Resmi vs Latihan & Simulasi
- **`official` (Bawaan)**: Hanya menyertakan `psas`, `ulangan_harian`, dan `sumatif` (`isOfficialScore !== false`). Hasil latihan/simulasi tidak mencemari nilai rapor resmi.
- **`practice`**: Hanya `latihan` dan `simulasi`.
- **`all`**: Gabungan seluruh cakupan dengan penanda mode eksplisit pada setiap baris.

## 3. Kebijakan Deduplikasi Percobaan Ganda (`AttemptPolicy`)
Untuk pasangan `(studentIdentityKey, assessmentId)`:
- **`best` (Rekomendasi)**: Memilih nilai akhir tertinggi; jika seri, memilih waktu kumpul terbaru.
- **`latest`**: Memilih percobaan terbaru.
- **`first`**: Memilih percobaan pertama (`attemptNumber` terendah).
- **`all_attempts`**: Menampilkan seluruh percobaan tanpa deduplikasi.

Banner kebijakan aktif ditampilkan di antarmuka dan ikut tercetak pada header laporan ekspor.

## 4. Jenis Tampilan Laporan
1. **Ringkasan & Grafik**: KPI partisipasi siswa terdaftar vs sudah mengerjakan vs belum mengerjakan, rata-rata nilai, nilai tertinggi/terendah, ketuntasan KKM, serta jumlah siswa perlu tindak lanjut.
2. **Rekap Nilai Kelas, Mapel, Asesmen & Petualangan**: Tabel berhalaman (15 baris/halaman), panel lipat *"Siswa Terdaftar Belum Mengerjakan"*, dan sub-tampilan per Mata Pelajaran, Asesmen, maupun Perkembangan Petualangan Siswa.
3. **Laporan Individu Siswa**: Daftar asesmen yang dikerjakan, status ketuntasan, durasi, waktu kumpul, mata pelajaran yang dikuasai (`>= KKM`), topik perlu penguatan (`< 70%`), serta ringkasan XP/Level/Lencana — **tanpa membocorkan kunci jawaban atau pembahasan soal**.
4. **Rekomendasi Tindak Lanjut**: Pengelompokan siswa siap pengayaan (`>= KKM`), siswa perlu remedial (`< KKM`) beserta topik lemahnya, topik klasikal `< 70%`, serta butir soal yang disarankan untuk ditinjau guru.
