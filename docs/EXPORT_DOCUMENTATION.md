# Dokumentasi Ekspor Laporan & Tata Cetak — PSAS ADVENTURE (Tahap 5)

## 1. Jenis Laporan yang Didukung (`/src/utils/reportExporter.ts`)
1. `class_recap`: Rekap Nilai Kelas (+ sheet kedua `Belum Mengerjakan` pada `.xlsx`).
2. `student_individual`: Nilai Individu Siswa (lengkap dengan mata pelajaran dikuasai & topik perlu penguatan, tanpa kunci jawaban).
3. `subject_recap`: Rekap per Mata Pelajaran (10 Dunia).
4. `assessment_recap`: Rekap per Paket Asesmen.
5. `item_analysis`: Analisis Butir Soal (+ sheet kedua `Penguasaan Topik` pada `.xlsx`).
6. `adventure_progress`: Laporan Perkembangan Petualangan Siswa (non-kompetitif).

## 2. Format & Orientasi
- **Excel (`.xlsx`)**: Dihasilkan oleh `SheetJS` (`xlsx`) dengan lebar kolom otomatis dan pelolosan karakter formula awal sel (`'`).
- **CSV (`.csv`)**: UTF-8 dengan BOM (`\uFEFF`) dan pelolosan `escapeCsvFormulaCell` terhadap karakter awal `=`, `+`, `-`, `@`, tab, atau carriage return untuk mencegah *CSV formula injection*.
- **PDF (`.pdf`)**: Dihasilkan sisi klien menggunakan `jspdf` + `jspdf-autotable` berukuran A4 dalam pilihan orientasi **`portrait`** maupun **`landscape`**, memuat header identitas `PSAS ADVENTURE`, nama sekolah (`SDN Pekiringan`), filter aktif, tanggal cetak, serta nomor halaman.
- **Cetak Langsung (`window.print()`)**: Menggunakan aturan CSS `@media print` & `@page` pada `/src/index.css`, menyembunyikan elemen `.no-print`, menampilkan header cetak resmi `.print-only`, serta menghindari pemotongan kartu analisis melalui `.break-inside-avoid` (tanpa menggunakan `window.open` atau `window.alert`).
