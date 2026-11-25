# Dokumentasi Analitik & Analisis Butir Soal — PSAS ADVENTURE (Tahap 5)

## 1. Visualisasi Ringkasan
`ReportsAnalyticsHub` menampilkan 4 grafik berbasis data nyata:
- **Distribusi Nilai**: Pengelompokan skor final (`0–49`, `50–69`, `70–84`, `85–100`).
- **Rata-Rata & Ketuntasan per Kelas**: Perbandingan capaian rata-rata skor dan persentase tuntas KKM di tiap kelas aktif.
- **Perbandingan Antar Mata Pelajaran**: Rata-rata dan tingkat ketuntasan di 10 dunia mata pelajaran.
- **Tren Historis**: Agregasi jumlah pengerjaan, rata-rata nilai, dan tingkat ketuntasan berdasarkan tanggal pengumpulan.

## 2. Analisis Butir Soal (`buildEnhancedItemAnalysis`)
- **Statistik Jawaban**: Jumlah & persentase benar, salah, tidak dijawab, serta menunggu koreksi uraian per butir soal.
- **Kategori Tingkat Kesulitan Empiris**:
  - `Mudah`: tingkat benar `>= 75%`
  - `Sedang`: tingkat benar `40%–74%`
  - `Sulit`: tingkat benar `< 40%`
  - `Belum Cukup Data`: ketika jumlah responden pada soal terkait `0`
- **Distribusi Opsi Jawaban**: Menghitung frekuensi dan persentase pilihan `A/B/C/D/...` atau `Benar/Salah` pada soal objektif (menggunakan `state.answers` server maupun `studentAnswers` Firestore yang dikirim guru).
- **Soal Paling Sulit & Butir Perlu Ditinjau**: Menandai soal dengan persentase benar rendah (`< 40%`) atau tingkat kosong tinggi (`>= 30%`) menggunakan istilah bahasa Indonesia yang mudah dipahami guru.
- **Peringatan Sampel Kecil (`N < 15`)**: Apabila jumlah responden `> 0` dan `< 15`, laporan secara eksplisit menampilkan `lowSampleWarning` dan menahan klaim psikometri/daya pembeda yang tidak sah secara statistik.
