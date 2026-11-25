import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AdventureProgressReportResponse,
  Stage5ReportPayload,
} from '../types/psas';

export type ExportReportType =
  | 'class_recap'
  | 'student_individual'
  | 'subject_recap'
  | 'assessment_recap'
  | 'item_analysis'
  | 'adventure_progress';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';
export type PageOrientation = 'portrait' | 'landscape';

export interface ExportOptions {
  reportType: ExportReportType;
  format: ExportFormat;
  orientation?: PageOrientation;
  schoolName: string;
  filtersLabel?: string;
  generatedBy?: string;
  selectedStudentKey?: string;
  report: Stage5ReportPayload;
  adventureReport?: AdventureProgressReportResponse | null;
  triggerDownload?: boolean;
}

export const EXPORT_REPORT_TITLES: Record<ExportReportType, string> = {
  class_recap: 'Rekap Nilai Kelas',
  student_individual: 'Nilai Individu Siswa',
  subject_recap: 'Rekap per Mata Pelajaran',
  assessment_recap: 'Rekap per Asesmen',
  item_analysis: 'Analisis Butir Soal',
  adventure_progress: 'Laporan Perkembangan Petualangan Siswa',
};

export function escapeCsvFormulaCell(raw: unknown): string {
  const s = raw === null || raw === undefined ? '' : String(raw);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function escapeExcelTextCell(raw: unknown): string | number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = raw === null || raw === undefined ? '' : String(raw);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}d`;
}

function formatIsoDate(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface BuiltTabularReport {
  title: string;
  subtitleLines: string[];
  headers: string[];
  rows: Array<Array<string | number>>;
  sheetName: string;
  extraSheets?: Array<{ sheetName: string; headers: string[]; rows: Array<Array<string | number>> }>;
}

export function buildTabularDataForExport(options: ExportOptions): BuiltTabularReport {
  const { report, adventureReport, reportType, selectedStudentKey } = options;
  const title = EXPORT_REPORT_TITLES[reportType];
  const baseSubtitle = [
    `PSAS ADVENTURE — ${options.schoolName || 'SDN Pekiringan'}`,
    options.filtersLabel ||
      `Cakupan: ${report.activeScope === 'official' ? 'Nilai Resmi' : report.activeScope === 'practice' ? 'Latihan & Simulasi' : 'Semua'} · Kebijakan Percobaan: ${report.attemptPolicyLabel}`,
    `Tanggal Cetak: ${formatIsoDate(report.generatedAt)} · KKM: ${report.kpis.kkm}`,
  ];

  if (reportType === 'class_recap') {
    const headers = [
      'No',
      'Nama Siswa',
      'No. Peserta',
      'Kelas',
      'Mata Pelajaran',
      'Nama Asesmen',
      'Nilai',
      'Status Ketuntasan',
      'Percobaan',
      'Durasi',
      'Waktu Kumpul',
    ];
    const rows = report.classRecapRows.map((r, idx) => [
      idx + 1,
      r.studentName,
      r.participantNumber || '-',
      r.gradeClass,
      r.subjectName,
      r.assessmentTitle,
      r.isOfficialScore || report.activeScope !== 'official' ? r.finalScore : r.finalScore,
      r.statusKetuntasan,
      r.attemptCountForPair > 1 ? `#${r.attemptNumber} (dari ${r.attemptCountForPair})` : `#${r.attemptNumber}`,
      formatDuration(r.durationSeconds),
      formatIsoDate(r.submittedAt),
    ]);
    return {
      title,
      subtitleLines: [
        ...baseSubtitle,
        `Total Baris: ${rows.length} · Rata-rata: ${report.kpis.averageScore} · Lulus KKM: ${report.kpis.passedKkmCount} (${report.kpis.passRatePercent}%)`,
      ],
      headers,
      rows,
      sheetName: 'Rekap Nilai Kelas',
    };
  }

  if (reportType === 'student_individual') {
    const targetStudents = selectedStudentKey
      ? report.studentReports.filter((s) => s.studentKey === selectedStudentKey)
      : report.studentReports;

    const headers = [
      'No',
      'Nama Siswa',
      'Kelas',
      'Mata Pelajaran',
      'Nama Asesmen',
      'Jenis',
      'Nilai',
      'KKM',
      'Status Ketuntasan',
      'Topik Perlu Penguatan (<70%)',
      'Waktu Kumpul',
    ];
    const rows: Array<Array<string | number>> = [];
    let counter = 1;
    for (const st of targetStudents) {
      const weakTopicsText =
        st.reinforcementTopics.length > 0
          ? st.reinforcementTopics.map((t) => `${t.topic} (${t.masteryPercent}%)`).join('; ')
          : 'Tidak ada topik lemah (<70%)';
      for (const asm of st.assessments) {
        rows.push([
          counter++,
          st.studentName,
          st.gradeClass,
          asm.subjectName,
          asm.assessmentTitle,
          asm.isOfficialScore ? 'Resmi' : 'Latihan/Simulasi',
          asm.finalScore,
          asm.kkm,
          asm.statusKetuntasan,
          weakTopicsText,
          formatIsoDate(asm.submittedAt),
        ]);
      }
    }
    const studentLabel =
      targetStudents.length === 1
        ? `Siswa: ${targetStudents[0].studentName} (${targetStudents[0].gradeClass}) · Rata-rata: ${targetStudents[0].averageScore}`
        : `Jumlah Siswa: ${targetStudents.length}`;
    return {
      title,
      subtitleLines: [...baseSubtitle, studentLabel],
      headers,
      rows,
      sheetName: 'Nilai Individu Siswa',
    };
  }

  if (reportType === 'subject_recap') {
    const headers = [
      'No',
      'Mata Pelajaran',
      'Jumlah Asesmen',
      'Jumlah Siswa',
      'Selesai Dinilai',
      'Rata-rata',
      'Tertinggi',
      'Terendah',
      'Tuntas KKM',
      'Perlu Penguatan',
      'Ketuntasan (%)',
    ];
    const rows = report.subjectRecapRows.map((s, idx) => [
      idx + 1,
      s.subjectName,
      s.assessmentCount,
      s.studentCount,
      s.finalizedCount,
      s.avgScore,
      s.highestScore,
      s.lowestScore,
      s.passedCount,
      s.needsFollowUpCount,
      `${s.passRatePercent}%`,
    ]);
    return {
      title,
      subtitleLines: baseSubtitle,
      headers,
      rows,
      sheetName: 'Rekap Per Mapel',
    };
  }

  if (reportType === 'assessment_recap') {
    const headers = [
      'No',
      'Nama Asesmen',
      'Mata Pelajaran',
      'Jenis',
      'KKM',
      'Total Kumpul',
      'Final',
      'Tunggu Uraian',
      'Rata-rata',
      'Tertinggi',
      'Terendah',
      'Tuntas (%)',
    ];
    const rows = report.assessmentRecapRows.map((a, idx) => [
      idx + 1,
      a.assessmentTitle,
      a.subjectName,
      a.isOfficialScore ? 'Resmi' : 'Latihan/Simulasi',
      a.kkm,
      a.submissionCount,
      a.finalizedCount,
      a.waitingEssayCount,
      a.avgScore,
      a.highestScore,
      a.lowestScore,
      `${a.passRatePercent}%`,
    ]);
    return {
      title,
      subtitleLines: baseSubtitle,
      headers,
      rows,
      sheetName: 'Rekap Per Asesmen',
    };
  }

  if (reportType === 'item_analysis') {
    const ia = report.itemAnalysis;
    const headers = [
      'No. Soal',
      'Ringkasan Pertanyaan',
      'Topik',
      'Responden',
      'Benar (%)',
      'Salah (%)',
      'Kosong (%)',
      'Tingkat Kesulitan',
      'Status Tinjauan',
      'Catatan Peninjauan',
    ];
    const rows = ia.questionStats.map((q) => [
      q.number,
      q.prompt.slice(0, 90),
      q.topic,
      q.respondentCount,
      `${q.correctPercent}%`,
      `${q.wrongPercent}%`,
      `${q.unansweredPercent}%`,
      q.empiricalDifficulty,
      q.needsReview ? 'Perlu Ditinjau' : 'Baik',
      q.reviewReason || '-',
    ]);
    return {
      title,
      subtitleLines: [
        ...baseSubtitle,
        `Asesmen: ${ia.selectedAssessmentTitle || '-'} (${ia.subjectName || '-'}) · Responden: ${ia.respondentCount}`,
        ia.lowSampleWarning.message,
      ],
      headers,
      rows,
      sheetName: 'Analisis Butir Soal',
      extraSheets: [
        {
          sheetName: 'Penguasaan Topik',
          headers: ['Topik', 'Jumlah Soal', 'Penguasaan (%)'],
          rows: ia.topicMastery.map((t) => [t.topic, t.questionCount, `${t.masteryPercent}%`]),
        },
      ],
    };
  }

  // adventure_progress
  const explorers = adventureReport?.explorers || [];
  const headers = [
    'No',
    'Nama Penjelajah',
    'Kelas',
    'Karakter',
    'Level',
    'Gelar Level',
    'Total XP',
    'Dunia Dijelajahi',
    'Dunia Selesai',
    'Checkpoint Selesai',
    'Lencana Diraih',
    'Hari Aktif',
  ];
  const rows = explorers.map((e, idx) => [
    idx + 1,
    e.displayName,
    e.gradeClass,
    e.characterId === 'girl' ? 'Laras (Perempuan)' : 'Raka (Laki-laki)',
    `Lv. ${e.level}`,
    e.levelTitle,
    e.totalXp,
    `${e.worldsExploredCount} / 10`,
    `${e.worldsCompletedCount} / 10`,
    e.checkpointsCompletedCount,
    `${e.badgesEarnedCount}${e.earnedBadgeNames.length ? ` (${e.earnedBadgeNames.join(', ')})` : ''}`,
    e.activeDaysCount,
  ]);
  return {
    title,
    subtitleLines: [
      `PSAS ADVENTURE — ${options.schoolName || 'SDN Pekiringan'}`,
      `Total Penjelajah: ${adventureReport?.summary.totalExplorers || 0} · Rata-rata XP: ${adventureReport?.summary.averageXp || 0} · Total Dunia Selesai: ${adventureReport?.summary.totalWorldsCompleted || 0}`,
      `Tanggal Cetak: ${formatIsoDate(new Date().toISOString())}`,
    ],
    headers,
    rows,
    sheetName: 'Progres Petualangan',
  };
}

function buildSafeFileName(reportType: ExportReportType, ext: ExportFormat): string {
  const slug = reportType.replace(/_/g, '-');
  const datePart = new Date().toISOString().slice(0, 10);
  return `psas-adventure-${slug}-${datePart}.${ext}`;
}

export function generateCsvString(options: ExportOptions): string {
  const table = buildTabularDataForExport(options);
  const metaRows = [
    [table.title],
    ...table.subtitleLines.map((line) => [line]),
    [],
    table.headers,
    ...table.rows,
  ];
  return metaRows
    .map((row) => row.map((cell) => escapeCsvFormulaCell(cell)).join(','))
    .join('\r\n');
}

export function generateExcelBytes(options: ExportOptions): Uint8Array {
  const table = buildTabularDataForExport(options);
  const wb = XLSX.utils.book_new();

  const headerAoA: Array<Array<string | number>> = [
    [table.title],
    ...table.subtitleLines.map((l) => [l]),
    [],
    table.headers.map((h) => escapeExcelTextCell(h)),
    ...table.rows.map((row) => row.map((cell) => escapeExcelTextCell(cell))),
  ];

  const ws = XLSX.utils.aoa_to_sheet(headerAoA);
  ws['!cols'] = table.headers.map((h, colIdx) => {
    let maxLen = h.length + 2;
    for (const r of table.rows) {
      const valLen = String(r[colIdx] ?? '').length;
      if (valLen + 2 > maxLen) maxLen = valLen + 2;
    }
    return { wch: Math.min(46, Math.max(10, maxLen)) };
  });
  XLSX.utils.book_append_sheet(wb, ws, table.sheetName.slice(0, 31));

  if (table.extraSheets) {
    for (const extra of table.extraSheets) {
      const extraAoA = [
        extra.headers.map((h) => escapeExcelTextCell(h)),
        ...extra.rows.map((r) => r.map((c) => escapeExcelTextCell(c))),
      ];
      const extraWs = XLSX.utils.aoa_to_sheet(extraAoA);
      XLSX.utils.book_append_sheet(wb, extraWs, extra.sheetName.slice(0, 31));
    }
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer | Uint8Array;
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

export function generatePdfBytes(options: ExportOptions): Uint8Array {
  const table = buildTabularDataForExport(options);
  const orientation: PageOrientation = options.orientation === 'landscape' ? 'landscape' : 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 36;

  // Header band
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`PSAS ADVENTURE — ${table.title}`, marginX, 28);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(options.schoolName || 'SDN Pekiringan', marginX, 46);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  let yCursor = 82;
  for (const line of table.subtitleLines) {
    const wrapped = doc.splitTextToSize(line, pageWidth - marginX * 2) as string[];
    doc.text(wrapped, marginX, yCursor);
    yCursor += wrapped.length * 12;
  }

  autoTable(doc, {
    startY: yCursor + 6,
    head: [table.headers],
    body: table.rows.length > 0 ? table.rows.map((r) => r.map((c) => String(c))) : [['-', 'Belum ada data untuk kriteria filter saat ini.']],
    theme: 'grid',
    margin: { left: marginX, right: marginX, bottom: 40 },
    styles: {
      fontSize: orientation === 'landscape' ? 8.5 : 8,
      cellPadding: 4,
      overflow: 'linebreak',
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `PSAS ADVENTURE · 10 Dunia Penjelajah Cilik · Halaman ${data.pageNumber} dari ${pageCount}`,
        marginX,
        pageHeight - 18
      );
    },
  });

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}

function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReportFile(options: ExportOptions): {
  filename: string;
  byteLength: number;
} {
  const filename = buildSafeFileName(options.reportType, options.format);
  const shouldDownload = options.triggerDownload !== false;

  if (options.format === 'csv') {
    const csv = generateCsvString(options);
    const bytes = new TextEncoder().encode('\uFEFF' + csv);
    if (shouldDownload) {
      downloadBlob(new Blob([bytes], { type: 'text/csv;charset=utf-8;' }), filename);
    }
    return { filename, byteLength: bytes.byteLength };
  }

  if (options.format === 'xlsx') {
    const bytes = generateExcelBytes(options);
    if (shouldDownload) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      downloadBlob(
        new Blob([copy.buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        filename
      );
    }
    return { filename, byteLength: bytes.byteLength };
  }

  const pdfBytes = generatePdfBytes(options);
  if (shouldDownload) {
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    downloadBlob(new Blob([copy.buffer], { type: 'application/pdf' }), filename);
  }
  return { filename, byteLength: pdfBytes.byteLength };
}
