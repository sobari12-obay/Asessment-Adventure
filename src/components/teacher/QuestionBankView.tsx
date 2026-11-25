import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Archive,
  Copy,
  CopyPlus,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { WORLDS, getWorldConfig } from '../../data/worlds';
import { ConfirmModal } from '../adventure';
import { QuestionRenderer } from '../QuestionRenderer';
import { QuestionEditorModal } from './QuestionEditorModal';
import { ImportQuestionPage } from './import/ImportQuestionPage';
import {
  attachOrAddExamQuestions,
  deleteOrArchiveTeacherQuestion,
  duplicateTeacherQuestion,
  fetchTeacherQuestions,
  saveTeacherQuestion,
} from '../../services/apiClient';
import {
  deleteQuestionBankItem,
  sanitizeId,
  saveQuestionBankItem,
  saveQuestionWithKey,
} from '../../services/firestoreService';
import type {
  AssessmentConfig,
  DifficultyLevel,
  PublicQuestion,
  QuestionBankItem,
  QuestionType,
  QuestionWithKey,
  SubjectId,
} from '../../types/psas';

interface QuestionBankViewProps {
  bankItems: QuestionBankItem[];
  assessments: AssessmentConfig[];
  teacherUid: string;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Pilihan Ganda',
  true_false: 'Benar / Salah',
  short_answer: 'Isian Singkat',
  matching: 'Menjodohkan',
  ordering: 'Mengurutkan',
  drag_drop: 'Drag & Drop',
  image_choice: 'Pilihan Gambar',
  audio: 'Soal Audio',
  illustrated: 'Soal Ilustrasi',
  multiple_select: 'PG Kompleks',
  essay: 'Uraian',
};

function bankItemToQuestionWithKey(item: QuestionBankItem): QuestionWithKey {
  const payload = (item.payload || {}) as Record<string, unknown>;
  return {
    id: item.id,
    schoolId: item.schoolId,
    assessmentId: 'preview_bank',
    subjectId: item.subjectId,
    order: 1,
    type: item.type,
    prompt: item.prompt,
    options: Array.isArray(payload.options) ? (payload.options as string[]) : undefined,
    mediaUrl:
      item.imageUrl || (typeof payload.mediaUrl === 'string' ? payload.mediaUrl : undefined),
    audioUrl: typeof payload.audioUrl === 'string' ? payload.audioUrl : undefined,
    audioText: typeof payload.audioText === 'string' ? payload.audioText : undefined,
    matchLeft: Array.isArray(payload.matchLeft) ? (payload.matchLeft as string[]) : undefined,
    matchRight: Array.isArray(payload.matchRight) ? (payload.matchRight as string[]) : undefined,
    orderingItems: Array.isArray(payload.orderingItems)
      ? (payload.orderingItems as string[])
      : undefined,
    dragItems: Array.isArray(payload.dragItems)
      ? (payload.dragItems as Array<{ id: string; label: string }>)
      : undefined,
    dragTargets: Array.isArray(payload.dragTargets)
      ? (payload.dragTargets as Array<{ id: string; label: string }>)
      : undefined,
    imageOptions: Array.isArray(payload.imageOptions)
      ? (payload.imageOptions as Array<{
          id: string;
          label: string;
          motif?: string;
          imageUrl?: string;
        }>)
      : undefined,
    weight: item.weight || 10,
    topic: item.topic,
    indicator: item.indicator,
    difficulty: item.difficulty,
    numericTolerance: item.numericTolerance,
    correctAnswer: item.correctAnswer,
    acceptedVariations: item.acceptedVariations,
    rubric: item.rubric,
    explanation: item.explanation,
    isPublished: true,
    ownerId: item.ownerId,
  };
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  bankItems,
  assessments,
  teacherUid,
}) => {
  const [serverItems, setServerItems] = useState<QuestionBankItem[]>([]);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');

  const [targetAssessmentId, setTargetAssessmentId] = useState<string>(
    assessments[0]?.id || ''
  );
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');
  const [editorTarget, setEditorTarget] = useState<{
    mode: 'create' | 'edit';
    item?: QuestionBankItem;
    subjectId: SubjectId;
  } | null>(null);
  const [previewItem, setPreviewItem] = useState<QuestionBankItem | null>(null);
  const [previewAnswer, setPreviewAnswer] = useState('');
  const [pendingDeleteItem, setPendingDeleteItem] = useState<QuestionBankItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAiImport, setShowAiImport] = useState(false);

  const loadServerQuestions = useCallback(async () => {
    try {
      const res = await fetchTeacherQuestions({ status: 'all' });
      if (Array.isArray(res.items)) {
        setServerItems(res.items);
      }
    } catch {
      // Tetap gunakan snapshot Firestore bila offline
    }
  }, []);

  useEffect(() => {
    void loadServerQuestions();
  }, [loadServerQuestions]);

  const mergedItems = useMemo(() => {
    const map = new Map<string, QuestionBankItem>();
    for (const item of bankItems) {
      map.set(item.id, item);
    }
    for (const item of serverItems) {
      map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ta = typeof a.updatedAt === 'string' ? a.updatedAt : '';
      const tb = typeof b.updatedAt === 'string' ? b.updatedAt : '';
      return tb.localeCompare(ta);
    });
  }, [bankItems, serverItems]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const item of mergedItems) {
      if (item.topic && item.topic.trim()) set.add(item.topic.trim());
    }
    return Array.from(set).sort();
  }, [mergedItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mergedItems
      .filter((it) => {
        const isActive = it.isActive !== false;
        if (statusFilter === 'active') return isActive;
        if (statusFilter === 'archived') return !isActive;
        return true;
      })
      .filter((it) => subjectFilter === 'all' || it.subjectId === subjectFilter)
      .filter((it) => gradeFilter === 'all' || (it.grade || '3') === gradeFilter)
      .filter((it) => typeFilter === 'all' || it.type === typeFilter)
      .filter((it) => topicFilter === 'all' || (it.topic || '') === topicFilter)
      .filter((it) => difficultyFilter === 'all' || it.difficulty === difficultyFilter)
      .filter((it) => {
        if (!q) return true;
        return (
          it.prompt.toLowerCase().includes(q) ||
          (it.topic || '').toLowerCase().includes(q) ||
          (it.indicator || '').toLowerCase().includes(q) ||
          (Array.isArray(it.tags) && it.tags.some((t) => t.toLowerCase().includes(q)))
        );
      });
  }, [
    mergedItems,
    search,
    subjectFilter,
    gradeFilter,
    typeFilter,
    topicFilter,
    difficultyFilter,
    statusFilter,
  ]);

  async function handleSaveBankEditor(params: {
    question: Omit<PublicQuestion, 'createdAt' | 'updatedAt'>;
    key: {
      questionId: string;
      assessmentId: string;
      type: QuestionType;
      correctAnswer: string;
      acceptedVariations?: string[];
      numericTolerance?: number;
      rubric?: string;
      explanation?: string;
      weight: number;
      ownerId: string;
    };
    isNew: boolean;
  }) {
    setErrorNotice('');
    setNotice('');
    const existing = editorTarget?.item;
    const itemId = existing?.id || sanitizeId(`bank_${params.question.subjectId}_${Date.now()}`);
    const payloadObj: Record<string, unknown> = {
      options: params.question.options,
      mediaUrl: params.question.mediaUrl,
      audioUrl: params.question.audioUrl,
      audioText: params.question.audioText,
      matchLeft: params.question.matchLeft,
      matchRight: params.question.matchRight,
      orderingItems: params.question.orderingItems,
      dragItems: params.question.dragItems,
      dragTargets: params.question.dragTargets,
      imageOptions: params.question.imageOptions,
    };

    const bankPayload: Omit<QuestionBankItem, 'createdAt' | 'updatedAt'> = {
      id: itemId,
      subjectId: params.question.subjectId,
      grade: existing?.grade || (gradeFilter !== 'all' ? gradeFilter : '3'),
      semester: existing?.semester || 'Ganjil',
      topic: params.question.topic || 'Umum',
      competency:
        existing?.competency ||
        `Kurikulum Merdeka Kelas 3 — ${getWorldConfig(params.question.subjectId).subjectName}`,
      indicator: params.question.indicator || '-',
      type: params.question.type,
      difficulty: params.question.difficulty || 'sedang',
      prompt: params.question.prompt,
      payload: payloadObj,
      correctAnswer: params.key.correctAnswer,
      acceptedVariations: params.key.acceptedVariations,
      numericTolerance: params.key.numericTolerance,
      rubric: params.key.rubric,
      explanation: params.key.explanation,
      imageUrl: params.question.mediaUrl,
      tags: existing?.tags || [],
      isActive: existing?.isActive ?? true,
      weight: params.question.weight,
      verificationStatus: 'VERIFIED',
      ownerId: existing?.ownerId || teacherUid,
    };

    try {
      await saveTeacherQuestion(bankPayload, existing?.id);
    } catch {
      // Tetap lanjutkan ke Firestore bila backend sedang offline
    }
    await saveQuestionBankItem(bankPayload, !existing);
    await loadServerQuestions();
    setNotice(
      existing
        ? 'Perubahan butir soal di Bank Soal berhasil disimpan.'
        : 'Butir soal baru berhasil ditambahkan ke Bank Soal.'
    );
  }

  async function handleDuplicateItem(item: QuestionBankItem) {
    setBusyId(item.id);
    setErrorNotice('');
    setNotice('');
    try {
      const res = await duplicateTeacherQuestion(item.id);
      if (res.item) {
        await saveQuestionBankItem(res.item, true).catch(() => {});
        await loadServerQuestions();
        setNotice(`Soal berhasil diduplikasi (${res.item.id}).`);
      }
    } catch {
      // Fallback duplicate client-side jika item hanya ada di Firestore
      const copyId = sanitizeId(`bank_${item.subjectId}_${Date.now()}_copy`);
      const cloned: Omit<QuestionBankItem, 'createdAt' | 'updatedAt'> = {
        ...item,
        id: copyId,
        prompt: `${item.prompt} (Salinan)`,
        isActive: true,
        archivedAt: undefined,
        archivedBy: undefined,
        ownerId: teacherUid,
      };
      await saveQuestionBankItem(cloned, true);
      await loadServerQuestions();
      setNotice('Soal berhasil diduplikasi.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestoreItem(item: QuestionBankItem) {
    setBusyId(item.id);
    setErrorNotice('');
    try {
      const restored: Omit<QuestionBankItem, 'createdAt' | 'updatedAt'> = {
        ...item,
        isActive: true,
        archivedAt: undefined,
        archivedBy: undefined,
      };
      await saveTeacherQuestion(restored, item.id).catch(() => {});
      await saveQuestionBankItem(restored, false).catch(() => {});
      await loadServerQuestions();
      setNotice('Soal berhasil dipulihkan ke daftar Bank Soal aktif.');
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Gagal memulihkan soal.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDeleteOrArchive(item: QuestionBankItem) {
    setBusyId(item.id);
    setErrorNotice('');
    setNotice('');
    try {
      const res = await deleteOrArchiveTeacherQuestion(item.id, false);
      if (res.action === 'archived' && res.item) {
        await saveQuestionBankItem(res.item, false).catch(() => {});
        setNotice(res.message);
      } else {
        await deleteQuestionBankItem(item.id).catch(() => {});
        setNotice(res.message || 'Soal berhasil dihapus dari Bank Soal.');
      }
      await loadServerQuestions();
    } catch {
      await deleteQuestionBankItem(item.id);
      await loadServerQuestions();
      setNotice('Soal berhasil dihapus dari Bank Soal.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyToAssessment(item: QuestionBankItem) {
    setErrorNotice('');
    setNotice('');
    const asm = assessments.find((a) => a.id === targetAssessmentId) || assessments[0];
    if (!asm) {
      setNotice('Buat minimal 1 asesmen terlebih dahulu untuk menyalin soal.');
      return;
    }

    setBusyId(item.id);
    try {
      try {
        await attachOrAddExamQuestions(asm.id, { bankItemIds: [item.id] });
      } catch {
        // Fallback jika asesmen hanya ada di Firestore
      }
      const qId = sanitizeId(`q_${asm.id}_${Date.now()}`);
      const payload = item.payload || {};
      await saveQuestionWithKey({
        question: {
          id: qId,
          assessmentId: asm.id,
          subjectId: asm.subjectId,
          bankItemId: item.id,
          order: asm.totalQuestions + 1,
          type: item.type,
          prompt: item.prompt,
          options: Array.isArray(payload.options) ? (payload.options as string[]) : undefined,
          mediaUrl:
            item.imageUrl || (typeof payload.mediaUrl === 'string' ? payload.mediaUrl : undefined),
          audioText: typeof payload.audioText === 'string' ? payload.audioText : undefined,
          matchLeft: Array.isArray(payload.matchLeft) ? (payload.matchLeft as string[]) : undefined,
          matchRight: Array.isArray(payload.matchRight)
            ? (payload.matchRight as string[])
            : undefined,
          orderingItems: Array.isArray(payload.orderingItems)
            ? (payload.orderingItems as string[])
            : undefined,
          dragItems: Array.isArray(payload.dragItems)
            ? (payload.dragItems as Array<{ id: string; label: string }>)
            : undefined,
          dragTargets: Array.isArray(payload.dragTargets)
            ? (payload.dragTargets as Array<{ id: string; label: string }>)
            : undefined,
          imageOptions: Array.isArray(payload.imageOptions)
            ? (payload.imageOptions as Array<{ id: string; label: string; motif?: string }>)
            : undefined,
          weight: item.weight,
          topic: item.topic,
          indicator: item.indicator,
          difficulty: item.difficulty,
          numericTolerance: item.numericTolerance,
          isPublished: true,
          ownerId: teacherUid,
        },
        key: {
          questionId: qId,
          assessmentId: asm.id,
          type: item.type,
          correctAnswer: item.correctAnswer,
          acceptedVariations: item.acceptedVariations,
          numericTolerance: item.numericTolerance,
          rubric: item.rubric,
          explanation: item.explanation,
          weight: item.weight,
          ownerId: teacherUid,
        },
        assessmentMode: asm.mode,
        isNew: true,
      });
      setNotice(`Soal berhasil dipasang ke asesmen "${asm.title}".`);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Gagal menyalin soal ke asesmen.');
    } finally {
      setBusyId(null);
    }
  }

  function handleExportBankExcel() {
    const rows = filtered.map((item) => ({
      ID: item.id,
      Mata_Pelajaran: getWorldConfig(item.subjectId).subjectName,
      Kelas: item.grade,
      Semester: item.semester,
      Materi: item.topic,
      Indikator: item.indicator,
      Jenis: item.type,
      Kesulitan: item.difficulty,
      Status: item.isActive === false ? 'Diarsipkan' : 'Aktif',
      Pertanyaan: item.prompt,
      Kunci_Jawaban: item.correctAnswer,
      Bobot: item.weight,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bank_Soal');
    XLSX.writeFile(wb, 'Bank_Soal_PSAS_Kelas3.xlsx');
  }

  async function handleImportBankExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const prompt = String(r.Pertanyaan || r.pertanyaan || '').trim();
        const correct = String(r.Kunci_Jawaban || r.kunci_jawaban || '').trim();
        if (!prompt || !correct) continue;
        const id = sanitizeId(`bank_${Date.now()}_${i}`);
        const newItem: Omit<QuestionBankItem, 'createdAt' | 'updatedAt'> = {
          id,
          subjectId: (subjectFilter !== 'all' ? subjectFilter : 'matematika') as SubjectId,
          grade: String(r.Kelas || '3'),
          semester: String(r.Semester || 'Ganjil') === 'Genap' ? 'Genap' : 'Ganjil',
          topic: String(r.Materi || 'Umum'),
          competency: 'Kurikulum Merdeka Kelas 3',
          indicator: String(r.Indikator || '-'),
          type: 'multiple_choice',
          difficulty: 'mudah',
          prompt,
          payload: {},
          correctAnswer: correct,
          weight: Number(r.Bobot) || 10,
          isActive: true,
          ownerId: teacherUid,
        };
        await saveTeacherQuestion(newItem).catch(() => {});
        await saveQuestionBankItem(newItem, true);
        count++;
      }
      await loadServerQuestions();
      setNotice(`Berhasil mengimpor ${count} item ke Bank Soal.`);
    } catch {
      setErrorNotice('Gagal membaca file Excel Bank Soal.');
    } finally {
      e.target.value = '';
    }
  }

  if (showAiImport) {
    return (
      <ImportQuestionPage
        defaultSubjectId={(subjectFilter !== 'all' ? subjectFilter : 'matematika') as SubjectId}
        onBackToBank={() => {
          setShowAiImport(false);
          void loadServerQuestions();
        }}
        onImportSaved={(savedCount) => {
          void loadServerQuestions();
          if (savedCount > 0) {
            setNotice(`${savedCount} butir soal dari Impor AI berhasil ditambahkan ke Bank Soal.`);
          }
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar Search & Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pertanyaan, topik, indikator, tag..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAiImport(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Impor Soal dengan AI
          </button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Import Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportBankExcel} className="hidden" />
          </label>
          <button
            type="button"
            onClick={handleExportBankExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() =>
              setEditorTarget({
                mode: 'create',
                subjectId: (subjectFilter !== 'all' ? subjectFilter : 'matematika') as SubjectId,
              })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Buat Soal Bank
          </button>
        </div>
      </div>

      {/* Multi-filter Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
        >
          <option value="all">Semua Mapel</option>
          {WORLDS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.subjectName}
            </option>
          ))}
        </select>

        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
        >
          <option value="all">Semua Kelas</option>
          <option value="3">Kelas 3 SD</option>
          <option value="4">Kelas 4 SD</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
        >
          <option value="all">Semua Tipe Soal</option>
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((qt) => (
            <option key={qt} value={qt}>
              {QUESTION_TYPE_LABELS[qt]}
            </option>
          ))}
        </select>

        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
        >
          <option value="all">Semua Topik/Materi</option>
          {availableTopics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>

        <select
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
        >
          <option value="all">Semua Kesulitan</option>
          <option value="mudah">Mudah</option>
          <option value="sedang">Sedang</option>
          <option value="sulit">Sulit</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'archived' | 'all')}
          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium"
        >
          <option value="active">Status: Aktif</option>
          <option value="archived">Status: Diarsipkan</option>
          <option value="all">Status: Semua</option>
        </select>
      </div>

      {assessments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-600">
              Asesmen tujuan saat klik "Salin ke Asesmen":
            </span>
            <select
              value={targetAssessmentId || assessments[0]?.id}
              onChange={(e) => setTargetAssessmentId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-medium bg-slate-50"
            >
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.code}] {a.title}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Menampilkan {filtered.length} butir soal
          </span>
        </div>
      )}

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-900 font-medium">
          {notice}
        </div>
      )}

      {errorNotice && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm text-rose-900 font-medium">
          {errorNotice}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Tidak ada soal di Bank Soal yang cocok dengan filter.
          </div>
        ) : (
          filtered.map((item) => {
            const world = getWorldConfig(item.subjectId);
            const isArchived = item.isActive === false;
            return (
              <div
                key={item.id}
                className={`p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isArchived ? 'bg-slate-50/80 opacity-85' : ''
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-teal-700">{world.subjectName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-700">
                      {QUESTION_TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Kelas {item.grade || '3'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Kesulitan: {item.difficulty}</span>
                    <span aria-hidden="true">·</span>
                    <span>Materi: {item.topic || 'Umum'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Bobot: {item.weight}</span>
                    {isArchived && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
                        <Archive className="w-3 h-3" /> Diarsipkan
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{item.prompt}</p>
                  <p className="text-xs text-slate-600">
                    Indikator: {item.indicator || '-'} · Kunci:{' '}
                    {item.correctAnswer ? (
                      <span className="text-emerald-700 font-medium">{item.correctAnswer}</span>
                    ) : (
                      <span className="text-rose-700 font-semibold">
                        Belum ditetapkan (BELUM_DIVERIFIKASI)
                      </span>
                    )}
                    {item.sourceFileName ? (
                      <span className="text-slate-500"> · Sumber Impor: {item.sourceFileName}</span>
                    ) : null}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewAnswer('');
                      setPreviewItem(item);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                    title="Pratinjau Tampilan Siswa"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Pratinjau
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditorTarget({
                        mode: 'edit',
                        item,
                        subjectId: item.subjectId,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                    title="Edit Soal"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void handleDuplicateItem(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
                    title="Duplikat Soal"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                    Duplikat
                  </button>
                  {!isArchived ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleCopyToAssessment(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-xs font-semibold text-teal-800 cursor-pointer disabled:opacity-50"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Salin ke Asesmen
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteItem(item)}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Hapus atau Arsipkan Soal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleRestoreItem(item)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Pulihkan
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Question Modal (supports all 11 types + image upload) */}
      {editorTarget && (
        <QuestionEditorModal
          assessmentId="bank_soal"
          subjectId={editorTarget.item?.subjectId || editorTarget.subjectId}
          assessmentMode="latihan"
          ownerId={teacherUid}
          nextOrder={1}
          initialQuestion={
            editorTarget.mode === 'edit' && editorTarget.item
              ? bankItemToQuestionWithKey(editorTarget.item)
              : null
          }
          onSave={handleSaveBankEditor}
          onClose={() => setEditorTarget(null)}
        />
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Pratinjau Butir Bank Soal
                </h3>
                <p className="text-xs text-slate-500">
                  {getWorldConfig(previewItem.subjectId).subjectName} ·{' '}
                  {QUESTION_TYPE_LABELS[previewItem.type] || previewItem.type} · Bobot{' '}
                  {previewItem.weight}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <QuestionRenderer
                question={bankItemToQuestionWithKey(previewItem)}
                questionNumber={1}
                totalQuestions={1}
                answerValue={previewAnswer}
                mode="latihan"
                audioEnabled={true}
                lockedAfterAnswer={false}
                onChangeAnswer={setPreviewAnswer}
              />
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 space-y-1">
                <p>
                  <span className="font-bold">Kunci Jawaban Guru:</span> {previewItem.correctAnswer}
                </p>
                {previewItem.explanation && (
                  <p>
                    <span className="font-bold">Pembahasan:</span> {previewItem.explanation}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingDeleteItem)}
        tone="danger"
        title="Hapus atau Arsipkan Soal?"
        message="Jika soal ini sudah dipakai di asesmen aktif atau riwayat ujian siswa, sistem akan mengarsipkannya secara aman agar riwayat nilai tidak rusak. Jika belum pernah dipakai, soal akan dihapus permanen."
        confirmLabel="Ya, Lanjutkan"
        onCancel={() => setPendingDeleteItem(null)}
        onConfirm={() => {
          if (!pendingDeleteItem) return;
          const target = pendingDeleteItem;
          setPendingDeleteItem(null);
          void handleConfirmDeleteOrArchive(target);
        }}
      />
    </div>
  );
};
