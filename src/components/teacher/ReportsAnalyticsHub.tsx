import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { WORLDS } from '../../data/worlds';
import {
  fetchTeacherAdventureProgressReport,
  fetchTeacherStage5Report,
} from '../../services/apiClient';
import {
  getSessionAnswersForTeacher,
  getTeacherQuestionsWithKeys,
} from '../../services/firestoreService';
import {
  exportReportFile,
  type ExportFormat,
  type ExportReportType,
  type PageOrientation,
} from '../../utils/reportExporter';
import type {
  AdventureProgressReportResponse,
  AssessmentConfig,
  AssessmentResult,
  AttemptPolicy,
  ClassRoom,
  CompletionStatusFilter,
  PublicQuestion,
  ReportScope,
  RosterStudent,
  Stage5ReportPayload,
  UserRole,
} from '../../types/psas';

interface ReportsAnalyticsHubProps {
  assessments: AssessmentConfig[];
  results: AssessmentResult[];
  roster: RosterStudent[];
  classes: ClassRoom[];
  defaultKkm: number;
  schoolName: string;
  userRole: UserRole;
  teacherName?: string;
  initialAssessmentId?: string;
}

type ReportSubTab =
  | 'overview'
  | 'recap'
  | 'individual'
  | 'item_analysis'
  | 'recommendations';

type RecapViewMode = 'class' | 'subject' | 'assessment' | 'adventure';

const PAGE_SIZE = 15;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}d`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
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

export const ReportsAnalyticsHub: React.FC<ReportsAnalyticsHubProps> = ({
  assessments,
  results,
  roster,
  classes,
  defaultKkm,
  schoolName,
  teacherName,
  initialAssessmentId,
}) => {
  const [subTab, setSubTab] = useState<ReportSubTab>('overview');
  const [recapMode, setRecapMode] = useState<RecapViewMode>('class');

  // Filters
  const [scope, setScope] = useState<ReportScope>('official');
  const [classFilter, setClassFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [assessmentFilter, setAssessmentFilter] = useState<string>(initialAssessmentId || '');
  const [completionStatus, setCompletionStatus] = useState<CompletionStatusFilter>('all');
  const [attemptPolicy, setAttemptPolicy] = useState<AttemptPolicy>('best');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Report State
  const [report, setReport] = useState<Stage5ReportPayload | null>(null);
  const [adventureReport, setAdventureReport] =
    useState<AdventureProgressReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // UI Helper State
  const [recapPage, setRecapPage] = useState<number>(1);
  const [showNotYetList, setShowNotYetList] = useState<boolean>(false);
  const [selectedStudentKey, setSelectedStudentKey] = useState<string>('');
  const [studentPickerSearch, setStudentPickerSearch] = useState<string>('');

  // Export Controls
  const [exportReportType, setExportReportType] = useState<ExportReportType>('class_recap');
  const [exportOrientation, setExportOrientation] = useState<PageOrientation>('portrait');
  const [exportMessage, setExportMessage] = useState<string>('');

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 220);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setRecapPage(1);
  }, [
    scope,
    classFilter,
    subjectFilter,
    assessmentFilter,
    completionStatus,
    attemptPolicy,
    dateFrom,
    dateTo,
    debouncedSearch,
    recapMode,
  ]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // Optional Firestore enrichment for Item Analysis when an assessment is selected
      let clientQuestions: PublicQuestion[] = [];
      let clientSessions: Array<{
        sessionId: string;
        answers?: Record<string, { questionId: string; answerValue: string; isAnswered?: boolean }>;
      }> = [];

      const candidateAsmId =
        assessmentFilter || (assessments.length === 1 ? assessments[0].id : '');

      if (candidateAsmId) {
        try {
          clientQuestions = await getTeacherQuestionsWithKeys(candidateAsmId);
        } catch {
          clientQuestions = [];
        }

        const matchingFirestoreResults = results
          .filter((r) => r.assessmentId === candidateAsmId)
          .slice(0, 40);

        if (matchingFirestoreResults.length > 0 && clientQuestions.length > 0) {
          const settled = await Promise.all(
            matchingFirestoreResults.map(async (r) => {
              try {
                const ansList = await getSessionAnswersForTeacher(r.sessionId);
                const answersMap: Record<
                  string,
                  { questionId: string; answerValue: string; isAnswered?: boolean }
                > = {};
                for (const a of ansList) {
                  answersMap[a.questionId] = {
                    questionId: a.questionId,
                    answerValue: a.answerValue,
                    isAnswered: a.isAnswered,
                  };
                }
                return { sessionId: r.sessionId, answers: answersMap };
              } catch {
                return null;
              }
            })
          );
          clientSessions = settled.filter(
            (x): x is NonNullable<typeof x> => x !== null
          );
        }
      }

      const [stage5Res, advRes] = await Promise.all([
        fetchTeacherStage5Report({
          filters: {
            scope,
            classFilter: classFilter || undefined,
            subjectFilter: subjectFilter || undefined,
            assessmentFilter: assessmentFilter || undefined,
            completionStatus,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            search: debouncedSearch || undefined,
            attemptPolicy,
            defaultKkm,
          },
          clientAssessments: assessments,
          clientQuestions,
          clientResults: results,
          clientSessions,
          clientRoster: roster,
          clientClasses: classes,
        }),
        fetchTeacherAdventureProgressReport({
          classFilter: classFilter || undefined,
          search: debouncedSearch || undefined,
        }),
      ]);

      setReport(stage5Res.report);
      setAdventureReport(advRes);

      if (stage5Res.report.studentReports.length > 0) {
        setSelectedStudentKey((prev) => {
          if (
            prev &&
            stage5Res.report.studentReports.some((s) => s.studentKey === prev)
          ) {
            return prev;
          }
          return stage5Res.report.studentReports[0].studentKey;
        });
      } else {
        setSelectedStudentKey('');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memuat laporan asesmen dari server.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    scope,
    classFilter,
    subjectFilter,
    assessmentFilter,
    completionStatus,
    dateFrom,
    dateTo,
    debouncedSearch,
    attemptPolicy,
    defaultKkm,
    assessments,
    results,
    roster,
    classes,
  ]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  // Keep exportReportType sensibly aligned when switching sub-tab
  useEffect(() => {
    if (subTab === 'individual') setExportReportType('student_individual');
    else if (subTab === 'item_analysis') setExportReportType('item_analysis');
    else if (subTab === 'recap') {
      if (recapMode === 'subject') setExportReportType('subject_recap');
      else if (recapMode === 'assessment') setExportReportType('assessment_recap');
      else if (recapMode === 'adventure') setExportReportType('adventure_progress');
      else setExportReportType('class_recap');
    }
  }, [subTab, recapMode]);

  const filtersLabel = useMemo(() => {
    const scopeText =
      scope === 'official'
        ? 'Nilai Resmi'
        : scope === 'practice'
          ? 'Latihan & Simulasi'
          : 'Semua Mode';
    const clsText = classFilter ? `Kelas ${classFilter}` : 'Semua Kelas';
    const subjObj = report?.availableFilters.subjects.find((s) => s.id === subjectFilter);
    const subjText = subjObj ? subjObj.name : 'Semua Mapel';
    return `${scopeText} · ${clsText} · ${subjText} · Kebijakan: ${report?.attemptPolicyLabel || attemptPolicy}`;
  }, [scope, classFilter, subjectFilter, report, attemptPolicy]);

  const handleExport = (format: ExportFormat, overrideType?: ExportReportType) => {
    if (!report) return;
    const typeToUse = overrideType || exportReportType;
    setExportMessage('');
    try {
      const outcome = exportReportFile({
        reportType: typeToUse,
        format,
        orientation: exportOrientation,
        schoolName,
        filtersLabel,
        generatedBy: teacherName || 'Guru SDN Pekiringan',
        selectedStudentKey: selectedStudentKey || undefined,
        report,
        adventureReport,
        triggerDownload: true,
      });
      setExportMessage(`Berhasil mengunduh ${outcome.filename}`);
      window.setTimeout(() => setExportMessage(''), 4500);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal membuat file ekspor.'
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredStudentPickerList = useMemo(() => {
    if (!report) return [];
    const q = studentPickerSearch.trim().toLowerCase();
    if (!q) return report.studentReports;
    return report.studentReports.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        s.gradeClass.toLowerCase().includes(q) ||
        (s.participantNumber || '').toLowerCase().includes(q)
    );
  }, [report, studentPickerSearch]);

  const activeStudentReport = useMemo(() => {
    if (!report) return null;
    return (
      report.studentReports.find((s) => s.studentKey === selectedStudentKey) ||
      report.studentReports[0] ||
      null
    );
  }, [report, selectedStudentKey]);

  // Pagination for class recap table
  const classRecapRows = report?.classRecapRows || [];
  const totalPages = Math.max(1, Math.ceil(classRecapRows.length / PAGE_SIZE));
  const pagedClassRows = classRecapRows.slice(
    (recapPage - 1) * PAGE_SIZE,
    recapPage * PAGE_SIZE
  );

  const kpis = report?.kpis;
  const maxTrendOrDistCount = useMemo(() => {
    if (!report) return 1;
    const maxDist = Math.max(1, ...report.charts.scoreDistribution.map((d) => d.count));
    return maxDist;
  }, [report]);

  return (
    <div className="space-y-6">
      {/* Formal Print Header — visible only when printing */}
      <div className="hidden print-only border-b-2 border-slate-900 pb-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              PSAS ADVENTURE — 10 Dunia Penjelajah Cilik
            </p>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
              Laporan Hasil Asesmen & Perkembangan Siswa — {schoolName}
            </h1>
            <p className="text-xs text-slate-700 mt-1">{filtersLabel}</p>
          </div>
          <div className="text-right text-xs text-slate-700">
            <p>Tanggal Cetak: {formatDateTime(report?.generatedAt)}</p>
            <p>KKM Standar: {kpis?.kkm ?? defaultKkm}</p>
            {teacherName && <p>Guru: {teacherName}</p>}
          </div>
        </div>
      </div>

      {/* Top Header & Multi-Format Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 no-print">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg mb-2">
              <BarChart3 className="w-3.5 h-3.5" />
              Pusat Laporan, Analisis & Gamifikasi Stage 5
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Laporan Nilai, Analisis Butir Soal & Rekap Petualangan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh angka dihitung dari hasil asesmen yang benar-benar tersimpan untuk{' '}
              <span className="font-semibold text-slate-700">{schoolName}</span>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadReports()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat Ulang Data
          </button>
        </div>

        {/* Export & Print Controls */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="text-xs font-semibold text-slate-700">
              Jenis Laporan Ekspor:
            </label>
            <select
              value={exportReportType}
              onChange={(e) => setExportReportType(e.target.value as ExportReportType)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800"
            >
              <option value="class_recap">1. Rekap Nilai Kelas</option>
              <option value="student_individual">2. Nilai Individu Siswa</option>
              <option value="subject_recap">3. Rekap per Mata Pelajaran</option>
              <option value="assessment_recap">4. Rekap per Asesmen</option>
              <option value="item_analysis">5. Analisis Butir Soal</option>
              <option value="adventure_progress">6. Perkembangan Petualangan Siswa</option>
            </select>

            <select
              value={exportOrientation}
              onChange={(e) => setExportOrientation(e.target.value as PageOrientation)}
              aria-label="Orientasi Halaman PDF"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700"
            >
              <option value="portrait">PDF: Portrait (A4)</option>
              <option value="landscape">PDF: Landscape (A4)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!report || loading}
              onClick={() => handleExport('xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Unduh Excel (.xlsx)
            </button>
            <button
              type="button"
              disabled={!report || loading}
              onClick={() => handleExport('csv')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh CSV
            </button>
            <button
              type="button"
              disabled={!report || loading}
              onClick={() => handleExport('pdf')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Unduh PDF (.pdf)
            </button>
            <button
              type="button"
              disabled={!report || loading}
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak Halaman
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {exportMessage}
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Cakupan Nilai
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as ReportScope)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800"
            >
              <option value="official">Nilai Resmi (PSAS / Ujian)</option>
              <option value="practice">Latihan & Simulasi</option>
              <option value="all">Semua (Resmi + Latihan/Simulasi)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Kebijakan Percobaan Ganda
            </label>
            <select
              value={attemptPolicy}
              onChange={(e) => setAttemptPolicy(e.target.value as AttemptPolicy)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800"
            >
              <option value="best">Nilai Terbaik (Rekomendasi)</option>
              <option value="latest">Percobaan Terbaru</option>
              <option value="first">Percobaan Pertama</option>
              <option value="all_attempts">Semua Percobaan (Tanpa Deduplikasi)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Filter Kelas
            </label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
            >
              <option value="">Semua Kelas</option>
              {(report?.availableFilters.classes || []).map((cls) => (
                <option key={cls} value={cls}>
                  Kelas {cls}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Mata Pelajaran / Dunia
            </label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
            >
              <option value="">Semua 10 Dunia</option>
              {(report?.availableFilters.subjects || WORLDS.map((w) => ({ id: w.id, name: w.subjectName }))).map((subj) => (
                <option key={subj.id} value={subj.id}>
                  {subj.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Filter Paket Asesmen
            </label>
            <select
              value={assessmentFilter}
              onChange={(e) => setAssessmentFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
            >
              <option value="">Semua Asesmen</option>
              {(report?.availableFilters.assessments || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.subjectName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Status Penilaian
            </label>
            <select
              value={completionStatus}
              onChange={(e) => setCompletionStatus(e.target.value as CompletionStatusFilter)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
            >
              <option value="all">Semua Status</option>
              <option value="final">Nilai Final (Sudah Tuntas Dinilai)</option>
              <option value="waiting_essay">Menunggu Koreksi Uraian</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Rentang Tanggal
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Dari tanggal"
                className="w-full px-2 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-700"
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Sampai tanggal"
                className="w-full px-2 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Cari Nama Siswa / Asesmen
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nama siswa, kelas, judul..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          {[
            { id: 'overview' as const, label: 'Ringkasan & Grafik', icon: TrendingUp },
            { id: 'recap' as const, label: 'Rekap Nilai & Petualangan', icon: FileSpreadsheet },
            { id: 'individual' as const, label: 'Laporan Individu Siswa', icon: UserCheck },
            { id: 'item_analysis' as const, label: 'Analisis Butir Soal', icon: Target },
            { id: 'recommendations' as const, label: 'Rekomendasi Tindak Lanjut', icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {loading && !report && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          Memuat data laporan & analitik dari server...
        </div>
      )}

      {/* SUB-TAB 1: OVERVIEW & CHARTS */}
      {report && kpis && subTab === 'overview' && (
        <div className="space-y-6">
          {/* Active Scope & Deduplication Notice */}
          <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-950 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                <strong>Cakupan aktif:</strong>{' '}
                {report.activeScope === 'official'
                  ? 'Nilai Resmi (Latihan & Simulasi dipisahkan otomatis)'
                  : report.activeScope === 'practice'
                    ? 'Latihan & Simulasi Saja'
                    : 'Gabungan Nilai Resmi dan Latihan/Simulasi'}{' '}
                · <strong>Kebijakan Percobaan:</strong> {report.attemptPolicyLabel}
              </span>
            </div>
            <span className="font-mono-tabular font-semibold text-teal-800">
              KKM: {kpis.kkm}
            </span>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-medium text-slate-500">Partisipasi Siswa</p>
              <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                {kpis.attemptedStudentsCount}
                {kpis.hasRosterData ? (
                  <span className="text-sm font-normal text-slate-500">
                    {' '}
                    / {kpis.registeredStudentsCount}
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {kpis.hasRosterData
                  ? `${kpis.notYetAttemptedCount} terdaftar belum mengerjakan`
                  : 'Roster kelas belum diisi; dihitung dari peserta unik'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-medium text-slate-500">Rata-Rata Nilai</p>
              <p className="font-mono-tabular text-2xl font-bold text-teal-700 mt-1">
                {kpis.finalizedCount > 0 ? kpis.averageScore : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {kpis.finalizedCount > 0
                  ? `Dari ${kpis.finalizedCount} hasil final (${kpis.waitingEssayCount} menunggu uraian)`
                  : 'Belum ada nilai final pada filter ini'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-medium text-slate-500">Tertinggi / Terendah</p>
              <p className="font-mono-tabular text-2xl font-bold text-slate-900 mt-1">
                {kpis.finalizedCount > 0
                  ? `${kpis.highestScore} / ${kpis.lowestScore}`
                  : '—'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Rentang nilai hasil final terdeduplikasi
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-medium text-slate-500">Tuntas KKM ({kpis.kkm})</p>
              <p className="font-mono-tabular text-2xl font-bold text-emerald-700 mt-1">
                {kpis.passedKkmCount}
                <span className="text-sm font-semibold text-emerald-600 ml-1">
                  ({kpis.passRatePercent}%)
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Dari {kpis.finalizedCount} hasil berstatus final
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-medium text-slate-500">Perlu Tindak Lanjut</p>
              <p className="font-mono-tabular text-2xl font-bold text-amber-700 mt-1">
                {kpis.needsFollowUpCount}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Capaian di bawah KKM {kpis.kkm}
              </p>
            </div>
          </div>

          {/* Empty State if zero submissions */}
          {kpis.deduplicatedRecapCount === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-display font-bold text-slate-800">
                Belum Ada Data Hasil Asesmen Pada Filter Ini
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tidak ada data buatan yang ditampilkan. Grafik dan rekap akan terisi otomatis setelah siswa menyelesaikan asesmen pada cakupan & filter yang dipilih.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1: Distribusi Nilai */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Distribusi Rentang Nilai
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sebaran capaian nilai final siswa dalam 4 kelompok skor
                  </p>
                </div>
                <div className="space-y-3">
                  {report.charts.scoreDistribution.map((bucket) => {
                    const widthPct =
                      maxTrendOrDistCount > 0
                        ? Math.round((bucket.count / maxTrendOrDistCount) * 100)
                        : 0;
                    const barColor =
                      bucket.label.startsWith('85')
                        ? 'bg-emerald-600'
                        : bucket.label.startsWith('70')
                          ? 'bg-teal-600'
                          : bucket.label.startsWith('50')
                            ? 'bg-amber-500'
                            : 'bg-rose-500';
                    return (
                      <div key={bucket.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700">
                            Rentang {bucket.label}
                          </span>
                          <span className="font-mono-tabular text-slate-600">
                            {bucket.count} siswa ({bucket.percent}%)
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${Math.max(bucket.count > 0 ? 4 : 0, widthPct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 2: Ketuntasan per Kelas */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Rata-Rata & Ketuntasan per Kelas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Perbandingan rata-rata skor dan persentase tuntas KKM tiap kelas
                  </p>
                </div>
                {report.charts.classMastery.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    Belum ada data per kelas.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {report.charts.classMastery.map((cm) => (
                      <div key={cm.gradeClass} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">
                            Kelas {cm.gradeClass}{' '}
                            <span className="text-slate-500 font-normal">
                              ({cm.finalizedCount} nilai final)
                            </span>
                          </span>
                          <span className="font-mono-tabular text-slate-700">
                            Rata-rata <strong>{cm.avgScore}</strong> · Tuntas {cm.passRatePercent}%
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-teal-600"
                            style={{ width: `${Math.min(100, Math.max(0, cm.avgScore))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chart 3: Perbandingan Mata Pelajaran */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Perbandingan Antar Mata Pelajaran
                  </h3>
                  <p className="text-xs text-slate-500">
                    Rata-rata nilai pada setiap dunia mata pelajaran
                  </p>
                </div>
                {report.charts.subjectComparison.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    Belum ada data perbandingan mapel.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {report.charts.subjectComparison.map((sc) => (
                      <div key={sc.subjectId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-800">
                            {sc.subjectName}{' '}
                            <span className="text-slate-500 font-normal">
                              ({sc.attemptCount} hasil)
                            </span>
                          </span>
                          <span className="font-mono-tabular text-slate-700">
                            {sc.avgScore} (Tuntas {sc.passRatePercent}%)
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              sc.avgScore >= kpis.kkm ? 'bg-emerald-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, sc.avgScore))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chart 4: Tren Historis */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Tren Historis Pengerjaan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Perkembangan rata-rata nilai berdasarkan tanggal pengumpulan
                  </p>
                </div>
                {report.charts.historicalTrend.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    Belum ada data tren historis bertanggal.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {report.charts.historicalTrend.map((pt) => (
                      <div
                        key={pt.date}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                      >
                        <div>
                          <span className="font-mono-tabular font-semibold text-slate-800">
                            {pt.date}
                          </span>
                          <span className="text-slate-500 ml-2">
                            ({pt.attemptCount} pengerjaan)
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono-tabular">
                          <span className="text-slate-700">
                            Rata-rata: <strong>{pt.avgScore}</strong>
                          </span>
                          <span className="text-emerald-700 font-semibold">
                            Tuntas {pt.passRatePercent}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: REKAP NILAI & PETUALANGAN */}
      {report && subTab === 'recap' && (
        <div className="space-y-5">
          {/* Sub-view Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 no-print">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'class' as const, label: 'Rekap Nilai Kelas' },
                { id: 'subject' as const, label: 'Per Mata Pelajaran' },
                { id: 'assessment' as const, label: 'Per Asesmen' },
                { id: 'adventure' as const, label: 'Progres Petualangan Siswa' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setRecapMode(m.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                    recapMode === m.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Kebijakan aktif: <strong>{report.attemptPolicyLabel}</strong>
            </p>
          </div>

          {recapMode === 'class' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Rekap Nilai Siswa & Kelas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Menampilkan {classRecapRows.length} baris rekap sesuai filter & kebijakan percobaan.
                  </p>
                </div>
                {report.notYetAttemptedStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNotYetList((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold cursor-pointer"
                  >
                    {report.notYetAttemptedStudents.length} Siswa Belum Mengerjakan
                    {showNotYetList ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {showNotYetList && report.notYetAttemptedStudents.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <p className="text-xs font-bold text-amber-950">
                    Siswa Terdaftar yang Belum Memiliki Hasil Pada Filter Ini:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {report.notYetAttemptedStudents.map((stu) => (
                      <div
                        key={stu.id}
                        className="px-3 py-2 rounded-lg bg-white border border-amber-200 text-xs flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800">{stu.name}</span>
                        <span className="text-slate-500">
                          {stu.gradeClass}
                          {stu.participantNumber ? ` · ${stu.participantNumber}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {classRecapRows.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  Belum ada data rekap nilai sesuai filter saat ini.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-2.5 px-3">No</th>
                          <th className="py-2.5 px-3">Nama Siswa</th>
                          <th className="py-2.5 px-3">Kelas</th>
                          <th className="py-2.5 px-3">Mata Pelajaran</th>
                          <th className="py-2.5 px-3">Nama Asesmen</th>
                          <th className="py-2.5 px-3 text-right">Nilai</th>
                          <th className="py-2.5 px-3">Status Ketuntasan</th>
                          <th className="py-2.5 px-3 text-center">Percobaan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedClassRows.map((row, idx) => (
                          <tr key={row.submissionId} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono-tabular text-slate-500">
                              {(recapPage - 1) * PAGE_SIZE + idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStudentKey(row.studentKey);
                                  setSubTab('individual');
                                }}
                                className="font-semibold text-teal-800 hover:underline text-left cursor-pointer"
                              >
                                {row.studentName}
                              </button>
                              {row.participantNumber && (
                                <p className="text-[11px] text-slate-400 font-mono-tabular">
                                  No: {row.participantNumber}
                                </p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{row.gradeClass}</td>
                            <td className="py-2.5 px-3 text-slate-700">{row.subjectName}</td>
                            <td className="py-2.5 px-3 text-slate-800">
                              <span>{row.assessmentTitle}</span>
                              {!row.isOfficialScore && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-600">
                                  {row.examMode}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-slate-900">
                              {row.finalScore}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                                  row.statusKetuntasan === 'Tuntas'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : row.statusKetuntasan === 'Menunggu Koreksi Uraian'
                                      ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {row.statusKetuntasan}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono-tabular text-xs text-slate-600">
                              #{row.attemptNumber}
                              {row.attemptCountForPair > 1
                                ? ` / ${row.attemptCountForPair}`
                                : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600 no-print">
                      <span>
                        Halaman {recapPage} dari {totalPages}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={recapPage <= 1}
                          onClick={() => setRecapPage((p) => Math.max(1, p - 1))}
                          className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={recapPage >= totalPages}
                          onClick={() => setRecapPage((p) => Math.min(totalPages, p + 1))}
                          className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {recapMode === 'subject' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-display font-bold text-base text-slate-900">
                Rekap Nilai per Mata Pelajaran (10 Dunia)
              </h3>
              {report.subjectRecapRows.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Belum ada data per mata pelajaran.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-3">Mata Pelajaran</th>
                        <th className="py-2.5 px-3 text-right">Asesmen</th>
                        <th className="py-2.5 px-3 text-right">Siswa</th>
                        <th className="py-2.5 px-3 text-right">Rata-Rata</th>
                        <th className="py-2.5 px-3 text-right">Tertinggi</th>
                        <th className="py-2.5 px-3 text-right">Terendah</th>
                        <th className="py-2.5 px-3 text-right">Tuntas</th>
                        <th className="py-2.5 px-3 text-right">Perlu Penguatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.subjectRecapRows.map((row) => (
                        <tr key={row.subjectId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {row.subjectName}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {row.assessmentCount}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {row.studentCount}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-teal-700">
                            {row.avgScore}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {row.highestScore}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {row.lowestScore}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular text-emerald-700 font-semibold">
                            {row.passedCount} ({row.passRatePercent}%)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular text-amber-700">
                            {row.needsFollowUpCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {recapMode === 'assessment' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-display font-bold text-base text-slate-900">
                Rekap Nilai per Paket Asesmen
              </h3>
              {report.assessmentRecapRows.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Belum ada data per asesmen.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-3">Asesmen</th>
                        <th className="py-2.5 px-3">Mapel</th>
                        <th className="py-2.5 px-3">Mode</th>
                        <th className="py-2.5 px-3 text-right">KKM</th>
                        <th className="py-2.5 px-3 text-right">Peserta</th>
                        <th className="py-2.5 px-3 text-right">Rata-Rata</th>
                        <th className="py-2.5 px-3 text-right">Tuntas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.assessmentRecapRows.map((row) => (
                        <tr key={row.assessmentId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {row.assessmentTitle}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{row.subjectName}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">{row.examMode}</td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">{row.kkm}</td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {row.submissionCount}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-teal-700">
                            {row.avgScore}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular text-emerald-700 font-semibold">
                            {row.passedCount} ({row.passRatePercent}%)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {recapMode === 'adventure' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Laporan Perkembangan Petualangan Siswa (Non-Kompetitif)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Diurutkan berdasarkan kelas dan abjad nama siswa untuk mendampingi kemajuan belajar anak secara sehat.
                  </p>
                </div>
                {adventureReport && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 font-semibold">
                      {adventureReport.summary.totalExplorers} Penjelajah
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold">
                      Rata-rata {adventureReport.summary.averageXp} XP
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold">
                      {adventureReport.summary.totalWorldsCompleted} Dunia Selesai
                    </span>
                  </div>
                )}
              </div>

              {!adventureReport || adventureReport.explorers.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  Belum ada profil penjelajah petualangan yang tercatat.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2.5 px-3">Nama Siswa</th>
                        <th className="py-2.5 px-3">Kelas</th>
                        <th className="py-2.5 px-3">Level & Gelar</th>
                        <th className="py-2.5 px-3 text-right">Total XP</th>
                        <th className="py-2.5 px-3 text-right">Dunia Selesai</th>
                        <th className="py-2.5 px-3 text-right">Checkpoint</th>
                        <th className="py-2.5 px-3">Lencana Diperoleh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {adventureReport.explorers.map((exp) => (
                        <tr key={exp.studentId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {exp.displayName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{exp.gradeClass}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-teal-800">
                              Lv.{exp.level}
                            </span>{' '}
                            <span className="text-slate-600">· {exp.levelTitle}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-amber-700">
                            {exp.totalXp} XP
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {exp.worldsCompletedCount} / 10
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular">
                            {exp.checkpointsCompletedCount}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">
                            {exp.earnedBadgeNames.length > 0
                              ? exp.earnedBadgeNames.join(', ')
                              : 'Belum ada lencana'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: LAPORAN INDIVIDU SISWA */}
      {report && subTab === 'individual' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Student Selector Sidebar */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 space-y-3 no-print">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900">
                Pilih Siswa
              </h3>
              <p className="text-[11px] text-slate-500">
                {report.studentReports.length} siswa memiliki riwayat pengerjaan
              </p>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentPickerSearch}
                onChange={(e) => setStudentPickerSearch(e.target.value)}
                placeholder="Cari nama atau kelas..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>

            {filteredStudentPickerList.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Tidak ada siswa yang sesuai.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredStudentPickerList.map((stu) => {
                  const selected = activeStudentReport?.studentKey === stu.studentKey;
                  return (
                    <button
                      key={stu.studentKey}
                      type="button"
                      onClick={() => setSelectedStudentKey(stu.studentKey)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-teal-50 border-teal-300 text-teal-950'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs truncate">
                          {stu.studentName}
                        </span>
                        <span className="font-mono-tabular text-xs font-bold text-teal-700">
                          {stu.averageScore}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Kelas {stu.gradeClass} · {stu.totalAttempted} asesmen
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Individual Student Card */}
          <div className="lg:col-span-8">
            {!activeStudentReport ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
                Belum ada data laporan individu siswa pada filter ini.
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-semibold text-teal-700">
                      Laporan Capaian Individu Siswa · {schoolName}
                    </p>
                    <h3 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                      {activeStudentReport.studentName}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Kelas {activeStudentReport.gradeClass}
                      {activeStudentReport.participantNumber
                        ? ` · No. Peserta ${activeStudentReport.participantNumber}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 no-print">
                    <button
                      type="button"
                      onClick={() => handleExport('pdf', 'student_individual')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Unduh Rapor PDF Siswa
                    </button>
                  </div>
                </div>

                {/* Student Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] text-slate-500">Asesmen Dikerjakan</p>
                    <p className="font-mono-tabular text-xl font-bold text-slate-900 mt-0.5">
                      {activeStudentReport.totalAttempted}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200">
                    <p className="text-[11px] text-teal-800">Rata-Rata Nilai</p>
                    <p className="font-mono-tabular text-xl font-bold text-teal-900 mt-0.5">
                      {activeStudentReport.finalizedCount > 0
                        ? activeStudentReport.averageScore
                        : '—'}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                    <p className="text-[11px] text-emerald-800">Tuntas KKM</p>
                    <p className="font-mono-tabular text-xl font-bold text-emerald-900 mt-0.5">
                      {activeStudentReport.passedCount} / {activeStudentReport.finalizedCount}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-[11px] text-amber-800">Progres Petualangan</p>
                    <p className="font-mono-tabular text-sm font-bold text-amber-950 mt-1">
                      {activeStudentReport.adventureSummary
                        ? `Lv.${activeStudentReport.adventureSummary.level} (${activeStudentReport.adventureSummary.totalXp} XP)`
                        : 'Belum terhubung'}
                    </p>
                  </div>
                </div>

                {/* Subject Mastery & Reinforcement Topics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                    <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <Award className="w-4 h-4" />
                      Mata Pelajaran yang Sudah Dikuasai
                    </p>
                    {activeStudentReport.masteredSubjects.length === 0 ? (
                      <p className="text-xs text-slate-600">
                        Belum ada mata pelajaran final mencapai KKM.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {activeStudentReport.masteredSubjects.map((ms) => (
                          <span
                            key={ms.subjectId}
                            className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-xs font-semibold text-emerald-900"
                          >
                            {ms.subjectName} ({ms.averageScore})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                    <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4" />
                      Topik yang Memerlukan Penguatan (&lt; 70%)
                    </p>
                    {activeStudentReport.reinforcementTopics.length === 0 ? (
                      <p className="text-xs text-slate-600">
                        Tidak ada topik dengan tingkat kesalahan tinggi terdeteksi.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-xs text-amber-950">
                        {activeStudentReport.reinforcementTopics.map((rt) => (
                          <li key={`${rt.subjectName}-${rt.topic}`}>
                            • <strong>{rt.topic}</strong> ({rt.subjectName}) — ketuntasan{' '}
                            {rt.masteryPercent}%
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Assessment History Table (NO answer keys or explanations exposed) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-2 px-3">Mata Pelajaran</th>
                        <th className="py-2 px-3">Asesmen</th>
                        <th className="py-2 px-3 text-right">Nilai</th>
                        <th className="py-2 px-3">Ketuntasan</th>
                        <th className="py-2 px-3">Durasi</th>
                        <th className="py-2 px-3">Waktu Kumpul</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeStudentReport.assessments.map((asm) => (
                        <tr key={asm.submissionId}>
                          <td className="py-2 px-3 font-medium text-slate-800">
                            {asm.subjectName}
                          </td>
                          <td className="py-2 px-3 text-slate-700">{asm.assessmentTitle}</td>
                          <td className="py-2 px-3 text-right font-mono-tabular font-bold text-slate-900">
                            {asm.finalScore}
                          </td>
                          <td className="py-2 px-3 text-xs">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-lg font-semibold ${
                                asm.statusKetuntasan === 'Tuntas'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : asm.statusKetuntasan === 'Menunggu Koreksi Uraian'
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {asm.statusKetuntasan}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono-tabular text-xs text-slate-600">
                            {formatDuration(asm.durationSeconds)}
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-500">
                            {formatDateTime(asm.submittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: ANALISIS BUTIR SOAL */}
      {report && subTab === 'item_analysis' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Analisis Butir Soal & Distribusi Jawaban
                </h3>
                <p className="text-xs text-slate-500">
                  {report.itemAnalysis.selectedAssessmentTitle
                    ? `${report.itemAnalysis.selectedAssessmentTitle} (${report.itemAnalysis.subjectName}) · ${report.itemAnalysis.respondentCount} responden`
                    : 'Pilih satu paket asesmen pada filter di atas untuk menganalisis tiap butir soal.'}
                </p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-slate-100 text-slate-700">
                Kategori Empiris: Mudah (≥75%), Sedang (40–74%), Sulit (&lt;40%)
              </span>
            </div>

            {/* Low Sample Warning (N < 15) */}
            {report.itemAnalysis.lowSampleWarning.active && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Catatan Jumlah Sampel Kecil (N &lt; 15)</p>
                  <p className="mt-0.5">{report.itemAnalysis.lowSampleWarning.message}</p>
                </div>
              </div>
            )}

            {/* Highlighted Summaries: Most Difficult & Review Needed */}
            {(report.itemAnalysis.mostDifficultQuestions.length > 0 ||
              report.itemAnalysis.reviewNeededQuestions.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                  <p className="text-xs font-bold text-rose-900">
                    Soal Paling Sering Dijawab Salah / Sulit
                  </p>
                  {report.itemAnalysis.mostDifficultQuestions.length === 0 ? (
                    <p className="text-xs text-slate-600">Tidak ada soal berkategori sulit.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs text-rose-950">
                      {report.itemAnalysis.mostDifficultQuestions.map((mq) => (
                        <li key={mq.questionId}>
                          <strong>Soal #{mq.number}</strong> ({mq.correctPercent}% benar ·{' '}
                          {mq.wrongPercent}% salah): {mq.prompt.slice(0, 90)}
                          {mq.prompt.length > 90 ? '...' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <p className="text-xs font-bold text-amber-900">
                    Butir Soal yang Perlu Ditinjau Guru
                  </p>
                  {report.itemAnalysis.reviewNeededQuestions.length === 0 ? (
                    <p className="text-xs text-slate-600">
                      Tidak ada indikasi kejanggalan distraktor atau tingkat kosong tinggi.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-xs text-amber-950">
                      {report.itemAnalysis.reviewNeededQuestions.map((rq) => (
                        <li key={rq.questionId}>
                          <strong>Soal #{rq.number}:</strong> {rq.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Question-by-Question Table & Option Distribution */}
            {report.itemAnalysis.questionStats.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                Belum ada butir soal atau pengerjaan untuk dianalisis pada pilihan saat ini.
              </p>
            ) : (
              <div className="space-y-4">
                {report.itemAnalysis.questionStats.map((qs) => (
                  <div
                    key={qs.questionId}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3 break-inside-avoid"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                            Soal #{qs.number}
                          </span>
                          <span className="text-xs font-semibold text-teal-800">
                            {qs.topic}
                          </span>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${
                              qs.empiricalDifficulty === 'Mudah'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : qs.empiricalDifficulty === 'Sedang'
                                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                  : qs.empiricalDifficulty === 'Sulit'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Tingkat Kesulitan Empiris: {qs.empiricalDifficulty}
                          </span>
                          {qs.needsReview && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900">
                              Perlu Ditinjau
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-slate-900 pt-1">
                          {qs.prompt}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs font-mono-tabular">
                        <span className="text-emerald-700 font-semibold">
                          Benar: {qs.correctCount} ({qs.correctPercent}%)
                        </span>
                        <span className="text-rose-700">
                          Salah: {qs.wrongCount} ({qs.wrongPercent}%)
                        </span>
                        <span className="text-slate-500">
                          Kosong: {qs.unansweredCount} ({qs.unansweredPercent}%)
                        </span>
                      </div>
                    </div>

                    {qs.reviewReason && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                        Catatan Peninjauan: {qs.reviewReason}
                      </p>
                    )}

                    {/* Option Distribution Bars */}
                    {qs.optionDistribution.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {qs.optionDistribution.map((opt) => (
                          <div
                            key={`${qs.questionId}-${opt.label}`}
                            className={`p-2 rounded-lg border text-xs ${
                              opt.isCorrectKey
                                ? 'bg-emerald-50/70 border-emerald-200'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex justify-between gap-2 mb-1">
                              <span className="font-semibold text-slate-800 truncate">
                                {opt.label}. {opt.text}
                                {opt.isCorrectKey ? ' (Kunci)' : ''}
                              </span>
                              <span className="font-mono-tabular text-slate-600 shrink-0">
                                {opt.count} ({opt.percent}%)
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  opt.isCorrectKey ? 'bg-emerald-600' : 'bg-slate-400'
                                }`}
                                style={{ width: `${Math.max(opt.count > 0 ? 3 : 0, opt.percent)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Topic & Indicator Mastery */}
            {(report.itemAnalysis.topicMastery.length > 0 ||
              report.itemAnalysis.indicatorMastery.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                  <p className="text-xs font-bold text-slate-900">
                    Ketuntasan per Topik Materi
                  </p>
                  {report.itemAnalysis.topicMastery.map((tm) => (
                    <div key={tm.topic} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-700">
                          {tm.topic} ({tm.questionCount} soal)
                        </span>
                        <span className="font-mono-tabular font-semibold">
                          {tm.masteryPercent}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            tm.masteryPercent >= 70 ? 'bg-emerald-600' : 'bg-amber-500'
                          }`}
                          style={{ width: `${tm.masteryPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                  <p className="text-xs font-bold text-slate-900">
                    Ketuntasan per Indikator Soal
                  </p>
                  {report.itemAnalysis.indicatorMastery.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Belum ada indikator terisi pada butir soal asesmen ini.
                    </p>
                  ) : (
                    report.itemAnalysis.indicatorMastery.map((im) => (
                      <div key={im.indicator} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700 truncate max-w-[75%]">
                            {im.indicator}
                          </span>
                          <span className="font-mono-tabular font-semibold">
                            {im.masteryPercent}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              im.masteryPercent >= 70 ? 'bg-teal-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${im.masteryPercent}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: REKOMENDASI TINDAK LANJUT */}
      {report && subTab === 'recommendations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Students Enrichment */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <Award className="w-4 h-4" />
              <h3 className="font-display font-bold text-base">
                Siswa Siap Pengayaan (Tuntas KKM)
              </h3>
            </div>
            {report.recommendations.studentsEnrichment.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                Belum ada siswa dengan hasil final mencapai KKM pada filter ini.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {report.recommendations.studentsEnrichment.map((st) => (
                  <div
                    key={st.studentKey}
                    className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-1"
                  >
                    <div className="flex justify-between font-semibold text-emerald-950">
                      <span>
                        {st.studentName} ({st.gradeClass})
                      </span>
                      <span className="font-mono-tabular">Rata-rata {st.averageScore}</span>
                    </div>
                    <p className="text-emerald-900">{st.suggestion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Students Remedial */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <Compass className="w-4 h-4" />
              <h3 className="font-display font-bold text-base">
                Siswa Perlu Pendampingan / Remedial
              </h3>
            </div>
            {report.recommendations.studentsRemedial.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                Belum ada siswa yang memerlukan remedial pada filter saat ini.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {report.recommendations.studentsRemedial.map((st) => (
                  <div
                    key={st.studentKey}
                    className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-1"
                  >
                    <div className="flex justify-between font-semibold text-amber-950">
                      <span>
                        {st.studentName} ({st.gradeClass})
                      </span>
                      <span className="font-mono-tabular">Rata-rata {st.averageScore}</span>
                    </div>
                    {st.weakTopics.length > 0 && (
                      <p className="text-amber-900 font-medium">
                        Topik penguatan: {st.weakTopics.join(', ')}
                      </p>
                    )}
                    <p className="text-amber-900">{st.suggestion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weak Topics */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <BookOpen className="w-4 h-4 text-teal-700" />
              <h3 className="font-display font-bold text-base">
                Topik Materi Perlu Penguatan Klasikal (&lt; 70%)
              </h3>
            </div>
            {report.recommendations.weakTopics.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                Belum ditemukan topik materi dengan ketuntasan di bawah 70%.
              </p>
            ) : (
              <div className="space-y-2">
                {report.recommendations.weakTopics.map((wt) => (
                  <div
                    key={`${wt.subjectName}-${wt.topic}`}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                  >
                    <div className="flex justify-between font-semibold text-slate-900">
                      <span>
                        {wt.topic} ({wt.subjectName})
                      </span>
                      <span className="font-mono-tabular text-amber-700">
                        Ketuntasan {wt.masteryPercent}%
                      </span>
                    </div>
                    <p className="text-slate-600">{wt.suggestion}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Questions to Review */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <Target className="w-4 h-4 text-rose-600" />
              <h3 className="font-display font-bold text-base">
                Butir Soal Disarankan untuk Ditinjau Ulang
              </h3>
            </div>
            {report.recommendations.questionsToReview.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                Tidak ada butir soal yang ditandai memerlukan peninjauan guru.
              </p>
            ) : (
              <div className="space-y-2">
                {report.recommendations.questionsToReview.map((qr) => (
                  <div
                    key={qr.questionId}
                    className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 text-xs space-y-1"
                  >
                    <p className="font-semibold text-rose-950">
                      Soal #{qr.number}: {qr.prompt.slice(0, 100)}
                      {qr.prompt.length > 100 ? '...' : ''}
                    </p>
                    <p className="text-rose-900">{qr.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
