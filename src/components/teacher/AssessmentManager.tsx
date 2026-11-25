import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Lock,
  Monitor,
  PlayCircle,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Unlock,
  X,
  XCircle,
} from 'lucide-react';
import { DEFAULT_INTRO_STORY, WORLDS, getWorldConfig } from '../../data/worlds';
import {
  archiveTeacherExam,
  attachOrAddExamQuestions,
  closeTeacherExam,
  fetchTeacherExamDetail,
  fetchTeacherQuestions,
  publishTeacherExam,
  removeExamQuestion,
  saveTeacherExam,
} from '../../services/apiClient';
import {
  deleteAssessmentAndQuestions,
  deleteQuestionWithKey,
  getTeacherQuestionsWithKeys,
  sanitizeCode,
  sanitizeId,
  saveAssessment,
  saveQuestionBankItem,
  saveQuestionWithKey,
} from '../../services/firestoreService';
import { ConfirmModal } from '../adventure';
import { QuestionRenderer } from '../QuestionRenderer';
import { QuestionEditorModal } from './QuestionEditorModal';
import {
  DEFAULT_SCHOOL_ID,
  type AssessmentConfig,
  type AssessmentMode,
  type AssessmentSession,
  type AssessmentStatus,
  type AssessmentType,
  type ClassRoom,
  type IdentityMode,
  type NavigationMode,
  type QuestionBankItem,
  type QuestionWithKey,
  type ResultPolicy,
  type ResultReleasePolicy,
  type ScoringPolicy,
  type SubjectId,
} from '../../types/psas';

interface AssessmentManagerProps {
  assessments: AssessmentConfig[];
  classes?: ClassRoom[];
  bankItems?: QuestionBankItem[];
  sessions?: AssessmentSession[];
  teacherUid: string;
}

const STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  active: 'Aktif',
  closed: 'Ditutup',
  completed: 'Selesai',
  archived: 'Diarsipkan',
};

const EXAM_TYPE_LABELS: Record<AssessmentType, string> = {
  psas: 'PSAS Resmi',
  sumatif: 'Asesmen Sumatif',
  ulangan_harian: 'Ulangan Harian',
  latihan: 'Latihan Mandiri',
  simulasi: 'Simulasi Ujian',
};

const DEFAULT_CLASS_OPTIONS: Array<{ id: string; name: string }> = [
  { id: 'kelas_3a', name: '3A' },
  { id: 'kelas_3b', name: '3B' },
  { id: 'kelas_3c', name: '3C' },
  { id: 'kelas_3d', name: '3D' },
];

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(val: string): string | undefined {
  if (!val || !val.trim()) return undefined;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export const AssessmentManager: React.FC<AssessmentManagerProps> = ({
  assessments,
  classes = [],
  bankItems = [],
  sessions = [],
  teacherUid,
}) => {
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [editingAsm, setEditingAsm] = useState<Partial<AssessmentConfig> | null>(null);
  const [isNewAsm, setIsNewAsm] = useState(false);
  const [isSavingAsm, setIsSavingAsm] = useState(false);
  const [pendingParticipantGuardConfirm, setPendingParticipantGuardConfirm] = useState(false);

  // Active assessment for managing questions
  const [managingQuestionsFor, setManagingQuestionsFor] = useState<AssessmentConfig | null>(null);
  const [questionsList, setQuestionsList] = useState<QuestionWithKey[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionWithKey | null>(null);
  const [showQuestionModal, setShowQuestionModal] = useState(false);

  // Bank selector modal
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankCatalog, setBankCatalog] = useState<QuestionBankItem[]>(bankItems);
  const [bankPickerSearch, setBankPickerSearch] = useState('');
  const [bankPickerSubject, setBankPickerSubject] = useState<string>('all');
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [attachingBank, setAttachingBank] = useState(false);

  // Exam Preview modal (Mobile / Desktop, non-mutating)
  const [previewExamData, setPreviewExamData] = useState<{
    exam: AssessmentConfig;
    questions: QuestionWithKey[];
  } | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});

  const [importNotice, setImportNotice] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingDeleteAssessment, setPendingDeleteAssessment] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pendingDeleteQuestionId, setPendingDeleteQuestionId] = useState<string | null>(null);

  useEffect(() => {
    setBankCatalog(bankItems);
  }, [bankItems]);

  const classOptions = useMemo(() => {
    if (classes.length > 0) {
      return classes.map((c) => ({ id: c.id, name: c.name }));
    }
    return DEFAULT_CLASS_OPTIONS;
  }, [classes]);

  const sessionCountByAssessment = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      map.set(s.assessmentId, (map.get(s.assessmentId) || 0) + 1);
    }
    return map;
  }, [sessions]);

  const filtered = useMemo(() => {
    return assessments
      .filter((a) => subjectFilter === 'all' || a.subjectId === subjectFilter)
      .filter((a) => statusFilter === 'all' || a.status === statusFilter)
      .filter(
        (a) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.code.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => a.subjectId.localeCompare(b.subjectId));
  }, [assessments, search, subjectFilter, statusFilter]);

  function getDefaultScoring(raw?: Partial<ScoringPolicy>): ScoringPolicy {
    return {
      maxScore: raw?.maxScore ?? 100,
      multipleSelectScoring: raw?.multipleSelectScoring || 'exact',
      shortAnswerCaseSensitive: raw?.shortAnswerCaseSensitive === true,
      shortAnswerNumericTolerance: raw?.shortAnswerNumericTolerance ?? 0,
    };
  }

  function getDefaultResult(
    mode: AssessmentMode,
    showScoreFallback: boolean,
    raw?: Partial<ResultPolicy>
  ): ResultPolicy {
    if (mode === 'latihan') {
      return {
        showScoreToStudent: raw?.showScoreToStudent ?? showScoreFallback,
        showCorrectAnswer: raw?.showCorrectAnswer ?? true,
        showExplanation: raw?.showExplanation ?? true,
        releasePolicy: raw?.releasePolicy || 'immediately_after_submit',
      };
    }
    return {
      showScoreToStudent: raw?.showScoreToStudent ?? showScoreFallback,
      showCorrectAnswer: mode === 'psas' ? false : raw?.showCorrectAnswer ?? false,
      showExplanation: mode === 'psas' ? false : raw?.showExplanation ?? false,
      releasePolicy:
        raw?.releasePolicy ||
        (showScoreFallback ? 'after_manual_grading' : 'when_released_by_teacher'),
    };
  }

  function openNewAssessmentModal() {
    setIsNewAsm(true);
    setActionError('');
    setPendingParticipantGuardConfirm(false);
    setEditingAsm({
      id: sanitizeId(`asm_${Date.now()}`),
      schoolId: DEFAULT_SCHOOL_ID,
      classIds: classOptions.map((c) => c.id),
      code: `PSAS${Date.now().toString().slice(-4)}`,
      title: 'Asesmen Baru Kelas 3',
      description: '',
      academicYear: '2025/2026',
      subjectId: 'matematika',
      worldThemeId: 'matematika',
      grade: '3',
      semester: 'Ganjil',
      date: new Date().toISOString().slice(0, 10),
      durationMinutes: 35,
      maxAttempts: 1,
      examType: 'psas',
      mode: 'psas',
      status: 'draft',
      isLocked: true,
      isVisibleOnMap: true,
      showScoreToStudent: false,
      introStory: DEFAULT_INTRO_STORY,
      totalQuestions: 0,
      targetQuestionCount: undefined,
      checkpointInterval: 3,
      kkm: 75,
      navigationMode: 'free',
      allowBack: true,
      allowEditAfterAnswer: true,
      requireAnswerBeforeNext: false,
      shuffleQuestions: false,
      shuffleOptions: false,
      identityMode: 'roster_verify',
      audioEnabled: true,
      allowMultipleSessions: false,
      scoringPolicy: getDefaultScoring(),
      resultPolicy: getDefaultResult('psas', false),
      ownerId: teacherUid,
    });
  }

  async function persistAssessmentConfig(confirmActiveEdit = false) {
    if (!editingAsm || !editingAsm.subjectId) return;
    setIsSavingAsm(true);
    setActionError('');
    setActionNotice('');

    const mode = (editingAsm.mode as AssessmentMode) || 'psas';
    const examType: AssessmentType =
      editingAsm.examType ||
      (mode === 'latihan' ? 'latihan' : mode === 'simulasi' ? 'simulasi' : 'psas');
    const resultPolicy = getDefaultResult(
      mode,
      Boolean(editingAsm.resultPolicy?.showScoreToStudent ?? editingAsm.showScoreToStudent),
      editingAsm.resultPolicy
    );
    const scoringPolicy = getDefaultScoring(editingAsm.scoringPolicy);
    const maxAttempts = Math.max(1, Math.min(50, Number(editingAsm.maxAttempts) || 1));

    const payload: Omit<AssessmentConfig, 'createdAt' | 'updatedAt' | 'codeHash' | 'schoolId'> & {
      schoolId?: string;
      codeHash?: string;
      previousCodeHash?: string;
    } = {
      id: editingAsm.id || sanitizeId(`asm_${Date.now()}`),
      schoolId: editingAsm.schoolId || DEFAULT_SCHOOL_ID,
      previousCodeHash: isNewAsm ? undefined : editingAsm.codeHash,
      code: sanitizeCode(editingAsm.code || 'PSAS3'),
      title: editingAsm.title || 'Asesmen Kelas 3',
      description: editingAsm.description || undefined,
      academicYear: editingAsm.academicYear || '2025/2026',
      subjectId: editingAsm.subjectId as SubjectId,
      worldThemeId: editingAsm.worldThemeId || editingAsm.subjectId,
      grade: editingAsm.grade || '3',
      semester: editingAsm.semester || 'Ganjil',
      date: editingAsm.date || new Date().toISOString().slice(0, 10),
      startsAt: editingAsm.startsAt || undefined,
      endsAt: editingAsm.endsAt || undefined,
      classIds:
        editingAsm.classIds && editingAsm.classIds.length > 0
          ? editingAsm.classIds
          : classOptions.map((c) => c.id),
      durationMinutes: Math.max(5, Number(editingAsm.durationMinutes) || 30),
      maxAttempts,
      allowMultipleSessions: maxAttempts > 1 || Boolean(editingAsm.allowMultipleSessions),
      examType,
      mode,
      status: (editingAsm.status as AssessmentStatus) || 'draft',
      isLocked:
        typeof editingAsm.isLocked === 'boolean'
          ? editingAsm.isLocked
          : editingAsm.status !== 'active',
      isVisibleOnMap: editingAsm.isVisibleOnMap ?? true,
      showScoreToStudent: resultPolicy.showScoreToStudent,
      introStory: editingAsm.introStory || DEFAULT_INTRO_STORY,
      totalQuestions: editingAsm.totalQuestions || 0,
      targetQuestionCount:
        typeof editingAsm.targetQuestionCount === 'number' && editingAsm.targetQuestionCount > 0
          ? editingAsm.targetQuestionCount
          : undefined,
      checkpointInterval: Number(editingAsm.checkpointInterval) || 3,
      kkm: Number(editingAsm.kkm) ?? 75,
      navigationMode: (editingAsm.navigationMode as NavigationMode) || 'free',
      allowBack: editingAsm.allowBack ?? true,
      allowEditAfterAnswer: editingAsm.allowEditAfterAnswer ?? true,
      requireAnswerBeforeNext: Boolean(editingAsm.requireAnswerBeforeNext),
      shuffleQuestions: Boolean(editingAsm.shuffleQuestions),
      shuffleOptions: Boolean(editingAsm.shuffleOptions),
      identityMode: (editingAsm.identityMode as IdentityMode) || 'roster_verify',
      audioEnabled: editingAsm.audioEnabled ?? true,
      scoringPolicy,
      resultPolicy,
      ownerId: editingAsm.ownerId || teacherUid,
    };

    try {
      let warningMsg = '';
      try {
        const res = await saveTeacherExam(
          { ...payload, confirmActiveEdit },
          isNewAsm ? undefined : payload.id
        );
        if (res.warning) warningMsg = res.warning;
      } catch (apiErr) {
        const msg = apiErr instanceof Error ? apiErr.message : '';
        if (
          msg.includes('ACTIVE_PARTICIPANTS_GUARD') ||
          msg.includes('sudah memiliki peserta')
        ) {
          setPendingParticipantGuardConfirm(true);
          setIsSavingAsm(false);
          return;
        }
      }

      await saveAssessment(payload, isNewAsm);
      setEditingAsm(null);
      setPendingParticipantGuardConfirm(false);
      setActionNotice(
        warningMsg ||
          (isNewAsm
            ? 'Asesmen baru berhasil dibuat.'
            : 'Pengaturan asesmen berhasil diperbarui.')
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan asesmen.');
    } finally {
      setIsSavingAsm(false);
    }
  }

  async function handleSaveAssessment(e: React.FormEvent) {
    e.preventDefault();
    const hasParticipants =
      !isNewAsm &&
      editingAsm?.id &&
      (sessionCountByAssessment.get(editingAsm.id) || editingAsm.participantCount || 0) > 0;
    if (hasParticipants && !pendingParticipantGuardConfirm) {
      // Allow server guard or proceed with notice
      await persistAssessmentConfig(false);
      return;
    }
    await persistAssessmentConfig(pendingParticipantGuardConfirm);
  }

  async function handleStatusTransition(
    asm: AssessmentConfig,
    target: 'active' | 'closed' | 'archived'
  ) {
    setActionError('');
    setActionNotice('');
    try {
      if (target === 'active') {
        await publishTeacherExam(asm.id);
      } else if (target === 'closed') {
        await closeTeacherExam(asm.id);
      } else {
        await archiveTeacherExam(asm.id);
      }
      await saveAssessment(
        {
          ...asm,
          previousCodeHash: asm.codeHash,
          status: target,
          isLocked: target !== 'active',
          archivedAt: target === 'archived' ? new Date().toISOString() : asm.archivedAt,
        },
        false
      );
      setActionNotice(
        target === 'active'
          ? `Asesmen "${asm.title}" sekarang AKTIF untuk siswa.`
          : target === 'closed'
            ? `Asesmen "${asm.title}" telah DITUTUP.`
            : `Asesmen "${asm.title}" diarsipkan (riwayat nilai siswa tetap aman).`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Gagal mengubah status asesmen ke ${target}.`
      );
    }
  }

  async function handleDuplicateAssessment(asm: AssessmentConfig) {
    setActionError('');
    try {
      const newId = sanitizeId(`asm_${Date.now()}`);
      await saveAssessment(
        {
          ...asm,
          id: newId,
          schoolId: asm.schoolId || DEFAULT_SCHOOL_ID,
          code: sanitizeCode(`${asm.code}COPY`),
          title: `${asm.title} (Salinan)`,
          status: 'draft',
          isLocked: true,
          totalQuestions: 0,
          ownerId: teacherUid,
        },
        true
      );
      setActionNotice(`Asesmen "${asm.title}" berhasil diduplikasi sebagai Draft.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menduplikasi asesmen.');
    }
  }

  async function handleToggleLock(asm: AssessmentConfig) {
    setActionError('');
    try {
      await saveAssessment(
        {
          ...asm,
          previousCodeHash: asm.codeHash,
          isLocked: !asm.isLocked,
        },
        false
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengubah status kunci portal.');
    }
  }

  async function loadExamQuestionsList(asm: AssessmentConfig): Promise<QuestionWithKey[]> {
    const fsQs = await getTeacherQuestionsWithKeys(asm.id);
    try {
      const srv = await fetchTeacherExamDetail(asm.id);
      if (srv.questions && srv.questions.length > 0) {
        const merged = new Map<string, QuestionWithKey>();
        for (const q of fsQs) merged.set(q.id, q);
        for (const q of srv.questions) merged.set(q.id, q);
        return Array.from(merged.values()).sort((a, b) => a.order - b.order);
      }
    } catch {
      // Fallback Firestore
    }
    return fsQs;
  }

  async function openQuestionManager(asm: AssessmentConfig) {
    setManagingQuestionsFor(asm);
    setImportNotice('');
    setActionError('');
    setLoadingQuestions(true);
    try {
      const qs = await loadExamQuestionsList(asm);
      setQuestionsList(qs);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memuat daftar soal.');
    } finally {
      setLoadingQuestions(false);
    }
  }

  async function openExamPreview(asm: AssessmentConfig) {
    setActionError('');
    try {
      const qs = await loadExamQuestionsList(asm);
      setPreviewIndex(0);
      setPreviewAnswers({});
      setPreviewViewport('desktop');
      setPreviewExamData({ exam: asm, questions: qs });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memuat pratinjau ujian.');
    }
  }

  async function refreshQuestions() {
    if (!managingQuestionsFor) return;
    const qs = await loadExamQuestionsList(managingQuestionsFor);
    setQuestionsList(qs);
  }

  async function openBankPickerModal() {
    if (!managingQuestionsFor) return;
    setBankPickerSubject(managingQuestionsFor.subjectId);
    setBankPickerSearch('');
    setSelectedBankIds([]);
    setShowBankPicker(true);
    try {
      const res = await fetchTeacherQuestions({ status: 'active' });
      if (res.items.length > 0) {
        const map = new Map<string, QuestionBankItem>();
        for (const b of bankItems) map.set(b.id, b);
        for (const b of res.items) map.set(b.id, b);
        setBankCatalog(Array.from(map.values()));
      }
    } catch {
      // Gunakan bankItems dari props
    }
  }

  async function handleAttachSelectedBankItems() {
    if (!managingQuestionsFor || selectedBankIds.length === 0) return;
    setAttachingBank(true);
    setActionError('');
    try {
      try {
        await attachOrAddExamQuestions(managingQuestionsFor.id, {
          bankItemIds: selectedBankIds,
        });
      } catch {
        // Fallback jika belum disinkron ke server
      }

      const selectedItems = bankCatalog.filter((b) => selectedBankIds.includes(b.id));
      let nextOrder = questionsList.length + 1;
      for (const item of selectedItems) {
        if (questionsList.some((q) => q.bankItemId === item.id)) continue;
        const qId = sanitizeId(`q_${managingQuestionsFor.id}_${item.id.slice(-10)}_${nextOrder}`);
        const payload = (item.payload || {}) as Record<string, unknown>;
        await saveQuestionWithKey({
          question: {
            id: qId,
            assessmentId: managingQuestionsFor.id,
            subjectId: managingQuestionsFor.subjectId,
            bankItemId: item.id,
            order: nextOrder++,
            type: item.type,
            prompt: item.prompt,
            options: Array.isArray(payload.options) ? (payload.options as string[]) : undefined,
            mediaUrl:
              item.imageUrl || (typeof payload.mediaUrl === 'string' ? payload.mediaUrl : undefined),
            audioText: typeof payload.audioText === 'string' ? payload.audioText : undefined,
            matchLeft: Array.isArray(payload.matchLeft)
              ? (payload.matchLeft as string[])
              : undefined,
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
            weight: item.weight || 10,
            topic: item.topic,
            indicator: item.indicator,
            difficulty: item.difficulty,
            numericTolerance: item.numericTolerance,
            isPublished: true,
            ownerId: teacherUid,
          },
          key: {
            questionId: qId,
            assessmentId: managingQuestionsFor.id,
            type: item.type,
            correctAnswer: item.correctAnswer,
            acceptedVariations: item.acceptedVariations,
            numericTolerance: item.numericTolerance,
            rubric: item.rubric,
            explanation: item.explanation,
            weight: item.weight || 10,
            ownerId: teacherUid,
          },
          assessmentMode: managingQuestionsFor.mode,
          isNew: true,
        });
      }

      setShowBankPicker(false);
      setImportNotice(`${selectedItems.length} soal dari Bank Soal berhasil dipasang ke asesmen.`);
      await refreshQuestions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memasang soal dari Bank Soal.');
    } finally {
      setAttachingBank(false);
    }
  }

  async function handleMoveQuestion(idx: number, direction: -1 | 1) {
    if (!managingQuestionsFor) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= questionsList.length) return;
    const reordered = [...questionsList];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);
    const updated = reordered.map((q, i) => ({ ...q, order: i + 1 }));
    setQuestionsList(updated);

    try {
      await attachOrAddExamQuestions(managingQuestionsFor.id, {
        reorderIds: updated.map((q) => q.id),
      }).catch(() => {});
      for (const q of updated) {
        await saveQuestionWithKey({
          question: q,
          key: {
            questionId: q.id,
            assessmentId: managingQuestionsFor.id,
            type: q.type,
            correctAnswer: q.correctAnswer,
            acceptedVariations: q.acceptedVariations,
            numericTolerance: q.numericTolerance,
            rubric: q.rubric,
            explanation: q.explanation,
            weight: q.weight,
            ownerId: q.ownerId || teacherUid,
          },
          assessmentMode: managingQuestionsFor.mode,
          isNew: false,
        });
      }
    } catch {
      // Keep local order if offline
    }
  }

  async function handleWeightChange(q: QuestionWithKey, newWeight: number) {
    if (!managingQuestionsFor) return;
    const clamped = Math.max(1, Math.min(100, newWeight || 10));
    setQuestionsList((prev) => prev.map((it) => (it.id === q.id ? { ...it, weight: clamped } : it)));
    try {
      await attachOrAddExamQuestions(managingQuestionsFor.id, {
        weightUpdates: [{ questionId: q.id, weight: clamped }],
      }).catch(() => {});
      await saveQuestionWithKey({
        question: { ...q, weight: clamped },
        key: {
          questionId: q.id,
          assessmentId: managingQuestionsFor.id,
          type: q.type,
          correctAnswer: q.correctAnswer,
          acceptedVariations: q.acceptedVariations,
          numericTolerance: q.numericTolerance,
          rubric: q.rubric,
          explanation: q.explanation,
          weight: clamped,
          ownerId: q.ownerId || teacherUid,
        },
        assessmentMode: managingQuestionsFor.mode,
        isNew: false,
      });
    } catch {
      // ignore transient error
    }
  }

  function handleDownloadQuestionTemplate() {
    const rows = [
      {
        urutan: 1,
        jenis: 'multiple_choice',
        pertanyaan: 'Hasil dari 125 + 150 adalah...',
        pilihan_a: '250',
        pilihan_b: '275',
        pilihan_c: '300',
        pilihan_d: '325',
        kunci_jawaban: '275',
        bobot: 10,
        materi: 'Penjumlahan',
        indikator: 'Menghitung penjumlahan bilangan tiga angka',
        kesulitan: 'mudah',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Soal');
    XLSX.writeFile(wb, 'Template_Import_Soal_PSAS.xlsx');
  }

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !managingQuestionsFor) return;
    setImportNotice('Mengimpor soal dari file...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      let imported = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const prompt = String(r.pertanyaan || r.prompt || '').trim();
        const key = String(r.kunci_jawaban || r.correctAnswer || '').trim();
        if (!prompt || !key) continue;

        const qId = sanitizeId(`q_${managingQuestionsFor.id}_${Date.now()}_${i}`);
        const options = [r.pilihan_a, r.pilihan_b, r.pilihan_c, r.pilihan_d]
          .map((x) => (x !== undefined && x !== null ? String(x).trim() : ''))
          .filter(Boolean);

        const typeRaw = String(r.jenis || 'multiple_choice').trim();
        const qType =
          typeRaw === 'true_false' || typeRaw === 'short_answer' || typeRaw === 'essay'
            ? typeRaw
            : 'multiple_choice';

        await saveQuestionWithKey({
          question: {
            id: qId,
            assessmentId: managingQuestionsFor.id,
            subjectId: managingQuestionsFor.subjectId,
            order: Number(r.urutan) || questionsList.length + imported + 1,
            type: qType,
            prompt,
            options: options.length > 0 ? options : undefined,
            weight: Number(r.bobot) || 10,
            topic: String(r.materi || 'Umum'),
            indicator: String(r.indikator || '-'),
            difficulty: 'mudah',
            isPublished: true,
            ownerId: teacherUid,
          },
          key: {
            questionId: qId,
            assessmentId: managingQuestionsFor.id,
            type: qType,
            correctAnswer: key,
            weight: Number(r.bobot) || 10,
            ownerId: teacherUid,
          },
          assessmentMode: managingQuestionsFor.mode,
          isNew: true,
        });
        imported++;
      }
      setImportNotice(`Berhasil mengimpor ${imported} soal!`);
      await refreshQuestions();
    } catch {
      setImportNotice('Gagal membaca file Excel/CSV. Gunakan template yang tersedia.');
    } finally {
      e.target.value = '';
    }
  }

  const totalQuestionWeight = useMemo(
    () => questionsList.reduce((acc, q) => acc + (Number(q.weight) || 0), 0),
    [questionsList]
  );

  // =========================================================================
  // VIEW A: MANAGE QUESTIONS INSIDE SELECTED EXAM
  // =========================================================================
  if (managingQuestionsFor) {
    const world = getWorldConfig(managingQuestionsFor.subjectId);
    const pickerFiltered = bankCatalog
      .filter((b) => b.isActive !== false)
      .filter((b) => bankPickerSubject === 'all' || b.subjectId === bankPickerSubject)
      .filter(
        (b) =>
          !bankPickerSearch.trim() ||
          b.prompt.toLowerCase().includes(bankPickerSearch.toLowerCase()) ||
          (b.topic || '').toLowerCase().includes(bankPickerSearch.toLowerCase())
      );

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setManagingQuestionsFor(null)}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-xs font-semibold text-teal-700">
                {world.subjectName} · Kode: {managingQuestionsFor.code} ·{' '}
                {EXAM_TYPE_LABELS[managingQuestionsFor.examType || managingQuestionsFor.mode]}
              </p>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Kelola Soal: {managingQuestionsFor.title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {questionsList.length} soal terpasang · Total bobot mentah: {totalQuestionWeight}{' '}
                (dinormalisasi otomatis ke skor maks{' '}
                {managingQuestionsFor.scoringPolicy?.maxScore || 100})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void openExamPreview(managingQuestionsFor)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              Pratinjau Ujian
            </button>
            <button
              type="button"
              onClick={() => void openBankPickerModal()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-300 bg-teal-50 text-xs font-semibold text-teal-800 hover:bg-teal-100 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Pilih dari Bank Soal
            </button>
            <button
              type="button"
              onClick={handleDownloadQuestionTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Template Excel
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportExcel}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setEditingQuestion(null);
                setShowQuestionModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Buat Soal Langsung
            </button>
          </div>
        </div>

        {importNotice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-900 font-medium">
            {importNotice}
          </div>
        )}

        {actionError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm text-rose-900 font-medium">
            {actionError}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {loadingQuestions ? (
            <div className="p-8 text-center text-sm text-slate-500">Memuat daftar soal...</div>
          ) : questionsList.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-slate-600">Belum ada soal pada asesmen ini.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void openBankPickerModal()}
                  className="px-4 py-2 rounded-xl border border-teal-300 bg-teal-50 text-teal-800 text-sm font-semibold cursor-pointer"
                >
                  Pilih dari Bank Soal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingQuestion(null);
                    setShowQuestionModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold cursor-pointer"
                >
                  Buat Soal Pertama
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {questionsList.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span className="font-bold text-slate-900">#{idx + 1}</span>
                      <span aria-hidden="true">·</span>
                      <span>{q.type}</span>
                      {q.bankItemId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 font-semibold">
                            Dari Bank Soal
                          </span>
                        </>
                      )}
                      {q.topic && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{q.topic}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 line-clamp-2">{q.prompt}</p>
                    <p className="text-xs text-emerald-700 font-medium truncate">
                      Kunci: {q.correctAnswer}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 mr-2">
                      <span className="text-xs text-slate-500">Bobot:</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={q.weight}
                        onChange={(e) => void handleWeightChange(q, Number(e.target.value))}
                        className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-center tabular-nums"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void handleMoveQuestion(idx, -1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      title="Naikkan Urutan"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === questionsList.length - 1}
                      onClick={() => void handleMoveQuestion(idx, 1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      title="Turunkan Urutan"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingQuestion(q);
                        setShowQuestionModal(true);
                      }}
                      className="p-2 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 cursor-pointer"
                      title="Edit Soal"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setActionError('');
                        try {
                          const copyId = sanitizeId(`q_${managingQuestionsFor.id}_${Date.now()}`);
                          await saveQuestionWithKey({
                            question: {
                              ...q,
                              id: copyId,
                              order: questionsList.length + 1,
                              ownerId: teacherUid,
                            },
                            key: {
                              questionId: copyId,
                              assessmentId: managingQuestionsFor.id,
                              type: q.type,
                              correctAnswer: q.correctAnswer,
                              acceptedVariations: q.acceptedVariations,
                              numericTolerance: q.numericTolerance,
                              rubric: q.rubric,
                              explanation: q.explanation,
                              weight: q.weight,
                              ownerId: teacherUid,
                            },
                            assessmentMode: managingQuestionsFor.mode,
                            isNew: true,
                          });
                          await refreshQuestions();
                        } catch (err) {
                          setActionError(
                            err instanceof Error ? err.message : 'Gagal menduplikasi soal.'
                          );
                        }
                      }}
                      className="p-2 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer"
                      title="Duplikasi Soal"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteQuestionId(q.id)}
                      className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="Hapus Soal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Question Editor with "Simpan juga ke Bank Soal" toggle */}
        {showQuestionModal && (
          <QuestionEditorModal
            assessmentId={managingQuestionsFor.id}
            subjectId={managingQuestionsFor.subjectId}
            assessmentMode={managingQuestionsFor.mode}
            ownerId={teacherUid}
            nextOrder={questionsList.length + 1}
            initialQuestion={editingQuestion}
            allowSaveToBankToggle={true}
            defaultSaveToBank={true}
            onSave={async ({ question, key, isNew, saveToBank }) => {
              let linkedBankId = question.bankItemId;
              if (isNew && saveToBank) {
                linkedBankId = sanitizeId(`bank_${managingQuestionsFor.subjectId}_${Date.now()}`);
                await saveQuestionBankItem(
                  {
                    id: linkedBankId,
                    subjectId: managingQuestionsFor.subjectId,
                    grade: managingQuestionsFor.grade || '3',
                    semester: managingQuestionsFor.semester || 'Ganjil',
                    topic: question.topic || 'Umum',
                    competency: '',
                    indicator: question.indicator || '',
                    type: question.type,
                    difficulty: question.difficulty || 'sedang',
                    prompt: question.prompt,
                    payload: {
                      options: question.options,
                      mediaUrl: question.mediaUrl,
                      audioUrl: question.audioUrl,
                      audioText: question.audioText,
                      matchLeft: question.matchLeft,
                      matchRight: question.matchRight,
                      orderingItems: question.orderingItems,
                      dragItems: question.dragItems,
                      dragTargets: question.dragTargets,
                      imageOptions: question.imageOptions,
                    },
                    correctAnswer: key.correctAnswer,
                    acceptedVariations: key.acceptedVariations,
                    numericTolerance: key.numericTolerance,
                    rubric: key.rubric,
                    explanation: key.explanation,
                    imageUrl: question.mediaUrl,
                    isActive: true,
                    weight: question.weight,
                    verificationStatus: 'VERIFIED',
                    ownerId: teacherUid,
                  },
                  true
                ).catch(() => {});
              }

              await saveQuestionWithKey({
                question: { ...question, bankItemId: linkedBankId },
                key,
                assessmentMode: managingQuestionsFor.mode,
                isNew,
              });
              await refreshQuestions();
            }}
            onClose={() => setShowQuestionModal(false)}
          />
        )}

        {/* Bank Soal Picker Modal */}
        {showBankPicker && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-xl">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Pilih Soal dari Bank Soal
                  </h3>
                  <p className="text-xs text-slate-500">
                    Centang soal yang ingin dilampirkan ke "{managingQuestionsFor.title}"
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBankPicker(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-2.5">
                <input
                  type="text"
                  value={bankPickerSearch}
                  onChange={(e) => setBankPickerSearch(e.target.value)}
                  placeholder="Cari soal atau topik..."
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <select
                  value={bankPickerSubject}
                  onChange={(e) => setBankPickerSubject(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  <option value="all">Semua Mapel</option>
                  {WORLDS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.subjectName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100">
                {pickerFiltered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">
                    Tidak ada soal aktif di Bank Soal untuk filter ini.
                  </p>
                ) : (
                  pickerFiltered.map((item) => {
                    const alreadyAttached = questionsList.some((q) => q.bankItemId === item.id);
                    const checked = selectedBankIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 py-3 px-2 rounded-xl cursor-pointer hover:bg-slate-50 ${
                          alreadyAttached ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={alreadyAttached}
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBankIds((prev) => [...prev, item.id]);
                            } else {
                              setSelectedBankIds((prev) => prev.filter((id) => id !== item.id));
                            }
                          }}
                          className="mt-1 accent-teal-700"
                        />
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="text-xs text-slate-500 flex flex-wrap gap-2">
                            <span className="font-semibold text-teal-700">
                              {getWorldConfig(item.subjectId).subjectName}
                            </span>
                            <span>· {item.type}</span>
                            <span>· {item.topic || 'Umum'}</span>
                            <span>· Bobot {item.weight}</span>
                            {alreadyAttached && (
                              <span className="text-emerald-700 font-semibold">
                                (Sudah terpasang)
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{item.prompt}</p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-600">
                  {selectedBankIds.length} soal dipilih
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBankPicker(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={selectedBankIds.length === 0 || attachingBank}
                    onClick={() => void handleAttachSelectedBankItems()}
                    className="px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                  >
                    {attachingBank ? 'Memasang...' : 'Pasang ke Asesmen'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          open={Boolean(pendingDeleteQuestionId)}
          tone="danger"
          title="Hapus Soal dari Asesmen?"
          message="Soal akan dilepas dari asesmen ini. Jika sudah dijawab siswa dalam sesi aktif/riwayat, penghapusan akan dicegah demi keutuhan nilai."
          confirmLabel="Ya, Hapus Soal"
          onCancel={() => setPendingDeleteQuestionId(null)}
          onConfirm={() => {
            if (!pendingDeleteQuestionId) return;
            const qId = pendingDeleteQuestionId;
            setPendingDeleteQuestionId(null);
            void (async () => {
              try {
                await removeExamQuestion(managingQuestionsFor.id, qId).catch(() => {});
                await deleteQuestionWithKey(qId, managingQuestionsFor.id);
                await refreshQuestions();
              } catch (err) {
                setActionError(err instanceof Error ? err.message : 'Gagal menghapus soal.');
              }
            })();
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // VIEW B: LIST ALL ASSESSMENTS & BUILDER CONFIG MODAL
  // =========================================================================
  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau kode asesmen..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
            />
          </div>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
          >
            <option value="all">Semua 10 Mapel</option>
            {WORLDS.map((w) => (
              <option key={w.id} value={w.id}>
                Dunia {w.number}: {w.subjectName}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
          >
            <option value="all">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Terjadwal</option>
            <option value="active">Aktif</option>
            <option value="closed">Ditutup</option>
            <option value="completed">Selesai</option>
            <option value="archived">Diarsipkan</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openNewAssessmentModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Buat Asesmen Baru
        </button>
      </div>

      {actionNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-900 font-medium">
          {actionNotice}
        </div>
      )}

      {actionError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm text-rose-900 font-medium">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((asm) => {
          const world = getWorldConfig(asm.subjectId);
          const sessionCount = sessionCountByAssessment.get(asm.id) || asm.participantCount || 0;
          const typeLabel = EXAM_TYPE_LABELS[asm.examType || asm.mode] || asm.mode.toUpperCase();
          return (
            <div
              key={asm.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span className="font-semibold text-teal-700">
                    Dunia {world.number} · {world.subjectName}
                  </span>
                  <span className="font-mono-tabular font-semibold text-slate-700">
                    Kode: {asm.code}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-bold text-base text-slate-900">{asm.title}</h3>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      asm.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : asm.status === 'archived'
                          ? 'bg-slate-200 text-slate-700'
                          : asm.status === 'closed'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {STATUS_LABELS[asm.status] || asm.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 tabular-nums">
                  {typeLabel} · Kelas {asm.grade} ({asm.semester}) · {asm.totalQuestions} soal ·{' '}
                  {asm.durationMinutes} menit · Maks {asm.maxAttempts || 1}x percobaan
                </p>
                {sessionCount > 0 && (
                  <p className="text-[11px] text-indigo-700 font-semibold mt-1">
                    {sessionCount} sesi siswa tercatat
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void openQuestionManager(asm)}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                  >
                    Kelola Soal ({asm.totalQuestions})
                  </button>
                  <button
                    type="button"
                    onClick={() => void openExamPreview(asm)}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 cursor-pointer"
                    title="Pratinjau Tampilan Siswa"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Pratinjau
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {asm.status !== 'active' && asm.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusTransition(asm, 'active')}
                      className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                      title="Aktifkan / Publikasikan Asesmen"
                    >
                      <PlayCircle className="w-4 h-4" />
                    </button>
                  )}
                  {asm.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusTransition(asm, 'closed')}
                      className="p-2 rounded-lg text-amber-700 hover:bg-amber-50 cursor-pointer"
                      title="Tutup Asesmen"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  {asm.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusTransition(asm, 'archived')}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                      title="Arsipkan (Riwayat Nilai Tetap Aman)"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleToggleLock(asm)}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                    title={asm.isLocked ? 'Buka Kunci Portal' : 'Kunci Portal'}
                  >
                    {asm.isLocked ? (
                      <Lock className="w-4 h-4 text-amber-600" />
                    ) : (
                      <Unlock className="w-4 h-4 text-emerald-600" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewAsm(false);
                      setPendingParticipantGuardConfirm(false);
                      setEditingAsm({
                        ...asm,
                        examType: asm.examType || (asm.mode === 'latihan' ? 'latihan' : 'psas'),
                        maxAttempts: asm.maxAttempts || 1,
                        academicYear: asm.academicYear || '2025/2026',
                        scoringPolicy: getDefaultScoring(asm.scoringPolicy),
                        resultPolicy: getDefaultResult(
                          asm.mode,
                          asm.showScoreToStudent,
                          asm.resultPolicy
                        ),
                      });
                    }}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                    title="Pengaturan Asesmen"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicateAssessment(asm)}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                    title="Duplikasi Asesmen"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteAssessment({ id: asm.id, title: asm.title })}
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Hapus Asesmen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Assessment Configuration Modal */}
      {editingAsm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveAssessment}
            className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-xl"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {isNewAsm ? 'Buat Asesmen Dunia Baru' : 'Pengaturan Lengkap Asesmen'}
                </h2>
                <p className="text-xs text-slate-500">
                  Atur jenis ujian, kelas target, jadwal, kebijakan nilai, dan hasil siswa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAsm(null)}
                className="text-sm text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {pendingParticipantGuardConfirm && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-900 space-y-2">
                  <p className="font-bold">
                    Perhatian: Asesmen ini sudah memiliki peserta atau hasil pengerjaan!
                  </p>
                  <p>
                    Mengubah mode ujian atau aturan pengacakan dapat memengaruhi peserta berikutnya
                    (peserta yang sedang berjalan tetap memakai urutan soal awalnya). Klik{' '}
                    <span className="font-bold">"Simpan Pengaturan"</span> lagi untuk mengonfirmasi.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dunia / Mata Pelajaran
                  </label>
                  <select
                    value={editingAsm.subjectId}
                    onChange={(e) =>
                      setEditingAsm({
                        ...editingAsm,
                        subjectId: e.target.value as SubjectId,
                        worldThemeId: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  >
                    {WORLDS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.number}. {w.subjectName} — {w.worldName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kode Akses Ujian (Huruf/Angka)
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAsm.code || ''}
                    onChange={(e) =>
                      setEditingAsm({ ...editingAsm, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm uppercase font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Asesmen
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAsm.title || ''}
                    onChange={(e) => setEditingAsm({ ...editingAsm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tahun Ajaran & Semester
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editingAsm.academicYear || '2025/2026'}
                      onChange={(e) =>
                        setEditingAsm({ ...editingAsm, academicYear: e.target.value })
                      }
                      className="px-2.5 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                    <select
                      value={editingAsm.semester || 'Ganjil'}
                      onChange={(e) =>
                        setEditingAsm({
                          ...editingAsm,
                          semester: e.target.value as 'Ganjil' | 'Genap',
                        })
                      }
                      className="px-2 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    >
                      <option value="Ganjil">Ganjil</option>
                      <option value="Genap">Genap</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Asesmen
                  </label>
                  <select
                    value={editingAsm.examType || 'psas'}
                    onChange={(e) => {
                      const nextType = e.target.value as AssessmentType;
                      const nextMode: AssessmentMode =
                        nextType === 'latihan'
                          ? 'latihan'
                          : nextType === 'simulasi'
                            ? 'simulasi'
                            : 'psas';
                      setEditingAsm({
                        ...editingAsm,
                        examType: nextType,
                        mode: nextMode,
                        resultPolicy: getDefaultResult(
                          nextMode,
                          nextMode === 'latihan',
                          editingAsm.resultPolicy
                        ),
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  >
                    <option value="psas">PSAS Resmi</option>
                    <option value="sumatif">Asesmen Sumatif</option>
                    <option value="ulangan_harian">Ulangan Harian</option>
                    <option value="latihan">Latihan Mandiri</option>
                    <option value="simulasi">Simulasi Ujian</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editingAsm.status}
                    onChange={(e) => {
                      const nextSt = e.target.value as AssessmentStatus;
                      setEditingAsm({
                        ...editingAsm,
                        status: nextSt,
                        isLocked: nextSt !== 'active',
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Terjadwal</option>
                    <option value="active">Aktif</option>
                    <option value="closed">Ditutup</option>
                    <option value="completed">Selesai</option>
                    <option value="archived">Diarsipkan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Durasi (Menit)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={editingAsm.durationMinutes ?? 30}
                    onChange={(e) =>
                      setEditingAsm({ ...editingAsm, durationMinutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Maks Percobaan
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={editingAsm.maxAttempts ?? 1}
                    onChange={(e) =>
                      setEditingAsm({
                        ...editingAsm,
                        maxAttempts: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm tabular-nums"
                  />
                </div>
              </div>

              {/* Target Classes & Schedule */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Kelas Peserta yang Diizinkan
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {classOptions.map((cls) => {
                      const active = (editingAsm.classIds || []).includes(cls.id);
                      return (
                        <label
                          key={cls.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                            active
                              ? 'bg-teal-50 border-teal-300 text-teal-900'
                              : 'bg-white border-slate-300 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              const prev = editingAsm.classIds || [];
                              const next = e.target.checked
                                ? [...prev, cls.id]
                                : prev.filter((id) => id !== cls.id);
                              setEditingAsm({ ...editingAsm, classIds: next });
                            }}
                            className="accent-teal-700"
                          />
                          Kelas {cls.name}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jadwal Mulai (Opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={toDatetimeLocalValue(editingAsm.startsAt)}
                      onChange={(e) =>
                        setEditingAsm({
                          ...editingAsm,
                          startsAt: fromDatetimeLocalValue(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jadwal Selesai / Tutup (Opsional)
                    </label>
                    <input
                      type="datetime-local"
                      value={toDatetimeLocalValue(editingAsm.endsAt)}
                      onChange={(e) =>
                        setEditingAsm({
                          ...editingAsm,
                          endsAt: fromDatetimeLocalValue(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Navigasi Soal
                  </label>
                  <select
                    value={editingAsm.navigationMode}
                    onChange={(e) =>
                      setEditingAsm({
                        ...editingAsm,
                        navigationMode: e.target.value as NavigationMode,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  >
                    <option value="free">Mode Bebas (Peta Soal)</option>
                    <option value="sequential">Mode Berurutan</option>
                    <option value="checkpoint">Mode Checkpoint</option>
                    <option value="level">Mode Per Level</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Jumlah Soal Tampil (Opsional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    placeholder="Kosong = tampilkan semua"
                    value={editingAsm.targetQuestionCount || ''}
                    onChange={(e) =>
                      setEditingAsm({
                        ...editingAsm,
                        targetQuestionCount: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    KKM (Nilai Ketuntasan)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editingAsm.kkm ?? 75}
                    onChange={(e) => setEditingAsm({ ...editingAsm, kkm: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm tabular-nums"
                  />
                </div>
              </div>

              {/* Scoring & Result Policy */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-800">Kebijakan Penilaian</p>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Penilaian PG Kompleks
                    </label>
                    <select
                      value={editingAsm.scoringPolicy?.multipleSelectScoring || 'exact'}
                      onChange={(e) =>
                        setEditingAsm({
                          ...editingAsm,
                          scoringPolicy: {
                            ...getDefaultScoring(editingAsm.scoringPolicy),
                            multipleSelectScoring: e.target.value as
                              | 'exact'
                              | 'partial_proportional',
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    >
                      <option value="exact">Harus Tepat Semua (Exact)</option>
                      <option value="partial_proportional">
                        Skor Sebagian Proporsional
                      </option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(editingAsm.scoringPolicy?.shortAnswerCaseSensitive)}
                      onChange={(e) =>
                        setEditingAsm({
                          ...editingAsm,
                          scoringPolicy: {
                            ...getDefaultScoring(editingAsm.scoringPolicy),
                            shortAnswerCaseSensitive: e.target.checked,
                          },
                        })
                      }
                      className="accent-teal-700"
                    />
                    Isian singkat peka huruf besar/kecil
                  </label>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-800">Kebijakan Rilis Nilai Siswa</p>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Waktu Tampil Nilai
                    </label>
                    <select
                      value={
                        editingAsm.resultPolicy?.releasePolicy || 'when_released_by_teacher'
                      }
                      onChange={(e) =>
                        setEditingAsm({
                          ...editingAsm,
                          resultPolicy: {
                            ...getDefaultResult(
                              (editingAsm.mode as AssessmentMode) || 'psas',
                              Boolean(editingAsm.showScoreToStudent),
                              editingAsm.resultPolicy
                            ),
                            releasePolicy: e.target.value as ResultReleasePolicy,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    >
                      <option value="immediately_after_submit">
                        Langsung Setelah Kumpulkan
                      </option>
                      <option value="after_manual_grading">
                        Setelah Uraian Dinilai Guru
                      </option>
                      <option value="when_released_by_teacher">
                        Saat Dirilis Guru
                      </option>
                      <option value="score_hidden">Sembunyikan Skor dari Siswa</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        editingAsm.resultPolicy?.showScoreToStudent ??
                          editingAsm.showScoreToStudent
                      )}
                      onChange={(e) =>
                        setEditingAsm({
                          ...editingAsm,
                          showScoreToStudent: e.target.checked,
                          resultPolicy: {
                            ...getDefaultResult(
                              (editingAsm.mode as AssessmentMode) || 'psas',
                              e.target.checked,
                              editingAsm.resultPolicy
                            ),
                            showScoreToStudent: e.target.checked,
                          },
                        })
                      }
                      className="accent-teal-700"
                    />
                    Tampilkan skor akhir ke siswa (jika sudah final)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                {[
                  ['allowBack', 'Boleh kembali ke soal sebelumnya'],
                  ['allowEditAfterAnswer', 'Boleh ubah jawaban'],
                  ['requireAnswerBeforeNext', 'Wajib jawab sebelum lanjut'],
                  ['shuffleQuestions', 'Acak urutan soal per sesi'],
                  ['shuffleOptions', 'Acak opsi pilihan ganda'],
                  ['isVisibleOnMap', 'Tampilkan di peta 10 dunia'],
                  ['isLocked', 'Kunci portal ujian'],
                  ['audioEnabled', 'Pembaca suara soal aktif'],
                ].map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean((editingAsm as Record<string, unknown>)[field])}
                      onChange={(e) =>
                        setEditingAsm({ ...editingAsm, [field]: e.target.checked })
                      }
                      className="accent-teal-700"
                    />
                    <span className="font-medium text-slate-700">{label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cerita Pengantar & Petunjuk Khusus
                </label>
                <textarea
                  rows={3}
                  value={editingAsm.introStory || ''}
                  onChange={(e) => setEditingAsm({ ...editingAsm, introStory: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingAsm(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSavingAsm}
                className="px-5 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
              >
                {isSavingAsm ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Exam Preview Modal (Non-mutating, Mobile/Desktop Toggle) */}
      {previewExamData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-100 border border-slate-300 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-indigo-900 text-white flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mode Pratinjau Guru — Tidak menyimpan sesi atau XP siswa
                </p>
                <h3 className="font-display text-base font-bold">
                  {previewExamData.exam.title} ({previewExamData.questions.length} Soal)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewViewport('desktop')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    previewViewport === 'desktop'
                      ? 'bg-white text-indigo-900'
                      : 'bg-indigo-800 text-indigo-100'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" /> Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('mobile')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    previewViewport === 'mobile'
                      ? 'bg-white text-indigo-900'
                      : 'bg-indigo-800 text-indigo-100'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile (390px)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewExamData(null)}
                  className="p-1.5 rounded-lg bg-indigo-800 text-white hover:bg-indigo-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 flex justify-center">
              <div
                className={`w-full transition-all ${
                  previewViewport === 'mobile'
                    ? 'max-w-[390px] bg-white rounded-3xl border-4 border-slate-800 p-4 shadow-lg'
                    : 'max-w-3xl bg-white rounded-2xl border border-slate-200 p-6 shadow-xs'
                }`}
              >
                {previewExamData.questions.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-500">
                    Belum ada soal yang dipasang di asesmen ini.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-600">
                        Soal {previewIndex + 1} dari {previewExamData.questions.length}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {previewExamData.questions.map((q, idx) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => setPreviewIndex(idx)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold cursor-pointer ${
                              idx === previewIndex
                                ? 'bg-indigo-700 text-white'
                                : previewAnswers[q.id]
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    <QuestionRenderer
                      question={previewExamData.questions[previewIndex]}
                      questionNumber={previewIndex + 1}
                      totalQuestions={previewExamData.questions.length}
                      answerValue={
                        previewAnswers[previewExamData.questions[previewIndex].id] || ''
                      }
                      mode={previewExamData.exam.mode}
                      audioEnabled={previewExamData.exam.audioEnabled}
                      lockedAfterAnswer={false}
                      onChangeAnswer={(val) =>
                        setPreviewAnswers((prev) => ({
                          ...prev,
                          [previewExamData.questions[previewIndex].id]: val,
                        }))
                      }
                    />

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        disabled={previewIndex === 0}
                        onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                      >
                        Sebelumnya
                      </button>
                      <button
                        type="button"
                        disabled={previewIndex >= previewExamData.questions.length - 1}
                        onClick={() =>
                          setPreviewIndex((i) =>
                            Math.min(previewExamData.questions.length - 1, i + 1)
                          )
                        }
                        className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingDeleteAssessment)}
        tone="danger"
        title="Hapus Asesmen & Seluruh Soalnya?"
        message={`Asesmen "${pendingDeleteAssessment?.title || ''}" beserta seluruh butir soal dan kunci jawabannya akan dihapus permanen. Gunakan tombol Arsipkan jika sudah memiliki riwayat nilai siswa.`}
        confirmLabel="Ya, Hapus Asesmen"
        onCancel={() => setPendingDeleteAssessment(null)}
        onConfirm={() => {
          if (!pendingDeleteAssessment) return;
          const targetId = pendingDeleteAssessment.id;
          setPendingDeleteAssessment(null);
          setActionError('');
          void deleteAssessmentAndQuestions(targetId).catch((err) =>
            setActionError(err instanceof Error ? err.message : 'Gagal menghapus asesmen.')
          );
        }}
      />
    </div>
  );
};
