import crypto from 'crypto';
import {
  appendExamAuditLog,
  getAssessmentStateSnapshot,
  makeAnswerKey,
  makeBankKey,
  makeExamKey,
  makeExamQuestionKey,
  mutateAssessmentState,
  type AssessmentMode,
  type AssessmentStatus,
  type AssessmentStoreState,
  type AssessmentType,
  type BankQuestionRecord,
  type DifficultyLevel,
  type EssayGradingRecord,
  type ExamAuditTrailRecord,
  type ExamQuestionRecord,
  type ExamRecord,
  type ExamSessionRecord,
  type ExamSubmissionRecord,
  type NavigationMode,
  type QuestionOutcomeRecord,
  type ResultPolicyRecord,
  type ScoringPolicyRecord,
} from './assessmentStore.js';
import {
  recordExamCompletedHook,
  WORLD_ADVENTURE_CATALOG,
  type StudentActorContext,
} from './adventureEngine.js';
import { fsGetDoc, fsListCollection } from './firestoreRest.js';

export interface StaffActor {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'teacher';
  schoolId: string;
  idToken?: string;
}

export function sanitizeEngineId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
  return cleaned || `id_${Date.now()}`;
}

export function hashExamCodeEngine(schoolId: string, code: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${schoolId.trim().toLowerCase()}:${code.trim().toUpperCase()}`)
    .digest('hex')
    .slice(0, 40);
  return `code_${digest}`;
}

function sha256Prefix(input: string, len = 28): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, len);
}

function normalizeText(value: unknown, caseSensitive = false): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function normalizeLooseText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tryParseLocaleNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function defaultScoringPolicy(raw?: Partial<ScoringPolicyRecord>): ScoringPolicyRecord {
  return {
    maxScore:
      typeof raw?.maxScore === 'number' && Number.isFinite(raw.maxScore) && raw.maxScore > 0
        ? Math.min(100, Math.round(raw.maxScore))
        : 100,
    multipleSelectScoring:
      raw?.multipleSelectScoring === 'partial_proportional' ? 'partial_proportional' : 'exact',
    shortAnswerCaseSensitive: raw?.shortAnswerCaseSensitive === true,
    shortAnswerNumericTolerance:
      typeof raw?.shortAnswerNumericTolerance === 'number' && raw.shortAnswerNumericTolerance >= 0
        ? Math.min(1000, raw.shortAnswerNumericTolerance)
        : 0,
  };
}

export function defaultResultPolicy(
  mode: AssessmentMode,
  showScoreFallback?: boolean,
  raw?: Partial<ResultPolicyRecord>
): ResultPolicyRecord {
  if (mode === 'latihan') {
    return {
      showScoreToStudent:
        typeof raw?.showScoreToStudent === 'boolean'
          ? raw.showScoreToStudent
          : showScoreFallback ?? true,
      showCorrectAnswer:
        typeof raw?.showCorrectAnswer === 'boolean' ? raw.showCorrectAnswer : true,
      showExplanation: typeof raw?.showExplanation === 'boolean' ? raw.showExplanation : true,
      releasePolicy: raw?.releasePolicy || 'immediately_after_submit',
    };
  }
  // Mode PSAS resmi & simulasi default menyembunyikan kunci & pembahasan
  return {
    showScoreToStudent:
      typeof raw?.showScoreToStudent === 'boolean'
        ? raw.showScoreToStudent
        : showScoreFallback ?? false,
    showCorrectAnswer:
      mode === 'psas' ? false : raw?.showCorrectAnswer === true,
    showExplanation:
      mode === 'psas' ? false : raw?.showExplanation === true,
    releasePolicy:
      raw?.releasePolicy ||
      (showScoreFallback ? 'after_manual_grading' : 'when_released_by_teacher'),
  };
}

export function isOfficialAssessmentType(examType: AssessmentType, mode: AssessmentMode): boolean {
  if (mode === 'latihan' || mode === 'simulasi') return false;
  if (examType === 'latihan' || examType === 'simulasi') return false;
  return true;
}

/**
 * Evaluates a single student answer against confidential question key & exam scoringPolicy.
 */
export function evaluateSingleQuestionStage3(
  q: {
    id: string;
    type: string;
    weight: number;
    correctAnswer: string;
    acceptedVariations?: string[];
    numericTolerance?: number;
    allowPartialScoring?: boolean;
  },
  ans: { answerValue: string; isAnswered: boolean } | undefined,
  manualScoreOverride: number | undefined,
  scoringPolicy: ScoringPolicyRecord
): QuestionOutcomeRecord {
  const maxPoints = typeof q.weight === 'number' && q.weight >= 0 ? q.weight : 10;

  if (!ans || !ans.isAnswered || !ans.answerValue || ans.answerValue.trim() === '') {
    return {
      questionId: q.id,
      earnedPoints: 0,
      maxPoints,
      status: 'unanswered',
    };
  }

  if (typeof manualScoreOverride === 'number' && Number.isFinite(manualScoreOverride)) {
    const clamped = Math.max(0, Math.min(maxPoints, Math.round(manualScoreOverride * 100) / 100));
    return {
      questionId: q.id,
      earnedPoints: clamped,
      maxPoints,
      status: clamped >= maxPoints ? 'correct' : clamped > 0 ? 'partial' : 'wrong',
    };
  }

  if (q.type === 'essay') {
    return {
      questionId: q.id,
      earnedPoints: 0,
      maxPoints,
      status: 'manual_pending',
    };
  }

  const studentRaw = ans.answerValue;
  const correctRaw = q.correctAnswer || '';

  if (
    q.type === 'multiple_choice' ||
    q.type === 'true_false' ||
    q.type === 'image_choice' ||
    q.type === 'audio' ||
    q.type === 'illustrated'
  ) {
    const isCorrect = normalizeText(studentRaw) === normalizeText(correctRaw);
    return {
      questionId: q.id,
      earnedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      status: isCorrect ? 'correct' : 'wrong',
    };
  }

  if (q.type === 'short_answer') {
    const caseSensitive = scoringPolicy.shortAnswerCaseSensitive === true;
    const tolerance =
      typeof q.numericTolerance === 'number' && q.numericTolerance >= 0
        ? q.numericTolerance
        : typeof scoringPolicy.shortAnswerNumericTolerance === 'number'
          ? scoringPolicy.shortAnswerNumericTolerance
          : 0;

    const candidatesRaw = [correctRaw, ...(Array.isArray(q.acceptedVariations) ? q.acceptedVariations : [])].filter(
      (v) => typeof v === 'string' && v.trim().length > 0
    );

    const normStudent = caseSensitive ? normalizeText(studentRaw, true) : normalizeLooseText(studentRaw);
    let isCorrect = candidatesRaw.some((cand) => {
      const normCand = caseSensitive ? normalizeText(cand, true) : normalizeLooseText(cand);
      return normCand.length > 0 && normCand === normStudent;
    });

    if (!isCorrect && tolerance > 0) {
      const stuNum = tryParseLocaleNumber(studentRaw);
      if (stuNum !== null) {
        isCorrect = candidatesRaw.some((cand) => {
          const candNum = tryParseLocaleNumber(cand);
          return candNum !== null && Math.abs(stuNum - candNum) <= tolerance;
        });
      }
    }

    return {
      questionId: q.id,
      earnedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      status: isCorrect ? 'correct' : 'wrong',
    };
  }

  if (q.type === 'multiple_select') {
    const studentArr = Array.from(
      new Set(safeParseJson<string[]>(studentRaw, []).map((s) => normalizeText(s)).filter(Boolean))
    ).sort();
    const correctArr = Array.from(
      new Set(safeParseJson<string[]>(correctRaw, []).map((s) => normalizeText(s)).filter(Boolean))
    ).sort();
    if (correctArr.length === 0) {
      return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
    }
    const exact =
      studentArr.length === correctArr.length && studentArr.every((v, idx) => v === correctArr[idx]);
    if (exact) {
      return { questionId: q.id, earnedPoints: maxPoints, maxPoints, status: 'correct' };
    }
    const usePartial =
      q.allowPartialScoring === true || scoringPolicy.multipleSelectScoring === 'partial_proportional';
    if (usePartial) {
      const correctSet = new Set(correctArr);
      let hits = 0;
      let wrongPicks = 0;
      for (const s of studentArr) {
        if (correctSet.has(s)) hits++;
        else wrongPicks++;
      }
      const ratio = Math.max(0, Math.min(1, (hits - wrongPicks * 0.5) / correctArr.length));
      const earned = Math.round(ratio * maxPoints * 100) / 100;
      return {
        questionId: q.id,
        earnedPoints: earned,
        maxPoints,
        status: earned > 0 ? 'partial' : 'wrong',
      };
    }
    return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
  }

  if (q.type === 'ordering') {
    const studentArr = safeParseJson<string[]>(studentRaw, []).map((s) => normalizeText(s));
    const correctArr = safeParseJson<string[]>(correctRaw, []).map((s) => normalizeText(s));
    if (correctArr.length === 0 || studentArr.length !== correctArr.length) {
      return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
    }
    let matchCount = 0;
    for (let i = 0; i < correctArr.length; i++) {
      if (studentArr[i] === correctArr[i]) matchCount++;
    }
    if (matchCount === correctArr.length) {
      return { questionId: q.id, earnedPoints: maxPoints, maxPoints, status: 'correct' };
    }
    const partial = Math.round((matchCount / correctArr.length) * maxPoints * 100) / 100;
    return {
      questionId: q.id,
      earnedPoints: partial,
      maxPoints,
      status: partial > 0 ? 'partial' : 'wrong',
    };
  }

  if (q.type === 'matching' || q.type === 'drag_drop') {
    const studentMap = safeParseJson<Record<string, string>>(studentRaw, {});
    const correctMap = safeParseJson<Record<string, string>>(correctRaw, {});
    const keys = Object.keys(correctMap);
    if (keys.length === 0) {
      return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
    }
    let matched = 0;
    for (const k of keys) {
      if (normalizeText(studentMap[k]) === normalizeText(correctMap[k])) {
        matched++;
      }
    }
    if (matched === keys.length) {
      return { questionId: q.id, earnedPoints: maxPoints, maxPoints, status: 'correct' };
    }
    const partial = Math.round((matched / keys.length) * maxPoints * 100) / 100;
    return {
      questionId: q.id,
      earnedPoints: partial,
      maxPoints,
      status: partial > 0 ? 'partial' : 'wrong',
    };
  }

  return { questionId: q.id, earnedPoints: 0, maxPoints, status: 'wrong' };
}

function computeSubmissionMetrics(
  questions: ExamQuestionRecord[],
  answersMap: Map<string, { answerValue: string; isAnswered: boolean }>,
  manualScores: Record<string, number>,
  scoringPolicy: ScoringPolicyRecord
) {
  let earnedPoints = 0;
  let maxPoints = 0;
  let objectiveEarned = 0;
  let objectiveMax = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let needsManualReview = false;
  const questionOutcomes: Record<string, QuestionOutcomeRecord> = {};

  for (const q of questions) {
    const outcome = evaluateSingleQuestionStage3(
      q,
      answersMap.get(q.id),
      manualScores[q.id],
      scoringPolicy
    );
    questionOutcomes[q.id] = outcome;
    earnedPoints += outcome.earnedPoints;
    maxPoints += outcome.maxPoints;

    if (q.type !== 'essay') {
      objectiveEarned += outcome.earnedPoints;
      objectiveMax += outcome.maxPoints;
    }

    if (outcome.status === 'correct' || outcome.status === 'partial') correctCount++;
    else if (outcome.status === 'unanswered') unansweredCount++;
    else if (outcome.status === 'manual_pending') {
      needsManualReview = true;
    } else {
      wrongCount++;
    }
  }

  const maxTarget = scoringPolicy.maxScore || 100;
  const finalScore =
    maxPoints > 0 ? Math.max(0, Math.min(maxTarget, Math.round((earnedPoints / maxPoints) * maxTarget))) : 0;
  const objectiveScore =
    objectiveMax > 0
      ? Math.max(0, Math.min(maxTarget, Math.round((objectiveEarned / objectiveMax) * maxTarget)))
      : 0;

  return {
    earnedPoints: Math.round(earnedPoints * 100) / 100,
    maxPoints: Math.round(maxPoints * 100) / 100,
    objectiveScore,
    finalScore,
    correctCount,
    wrongCount,
    unansweredCount,
    needsManualReview,
    gradingStatus: needsManualReview ? ('waiting_essay_grading' as const) : ('finalized' as const),
    questionOutcomes,
  };
}

// =========================================================================
// 1. QUESTION BANK (TEACHER / ADMIN)
// =========================================================================

export function listQuestionBankItemsEngine(
  schoolId: string,
  filters: {
    search?: string;
    subjectId?: string;
    grade?: string;
    type?: string;
    topic?: string;
    difficulty?: string;
    status?: 'active' | 'archived' | 'all';
  }
): BankQuestionRecord[] {
  const state = getAssessmentStateSnapshot();
  const statusFilter = filters.status || 'active';
  const search = (filters.search || '').trim().toLowerCase();

  return Object.values(state.questionBank)
    .filter((item) => item.schoolId === schoolId)
    .filter((item) => {
      if (statusFilter === 'active' && item.isActive === false) return false;
      if (statusFilter === 'archived' && item.isActive !== false) return false;
      if (filters.subjectId && filters.subjectId !== 'all' && item.subjectId !== filters.subjectId) {
        return false;
      }
      if (filters.grade && filters.grade !== 'all' && item.grade !== filters.grade) {
        return false;
      }
      if (filters.type && filters.type !== 'all' && item.type !== filters.type) {
        return false;
      }
      if (
        filters.topic &&
        filters.topic !== 'all' &&
        (item.topic || '').toLowerCase() !== filters.topic.toLowerCase()
      ) {
        return false;
      }
      if (filters.difficulty && filters.difficulty !== 'all' && item.difficulty !== filters.difficulty) {
        return false;
      }
      if (search) {
        const haystack = [
          item.prompt,
          item.topic,
          item.competency,
          item.indicator,
          ...(item.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getQuestionBankItemEngine(schoolId: string, questionId: string): BankQuestionRecord | null {
  const state = getAssessmentStateSnapshot();
  return state.questionBank[makeBankKey(schoolId, questionId)] || null;
}

export async function upsertQuestionBankItemEngine(
  staff: StaffActor,
  input: Partial<BankQuestionRecord> & { id?: string }
): Promise<{ ok: true; item: BankQuestionRecord } | { ok: false; status: number; code: string; message: string }> {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 2000) : '';
  const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : '';
  const type = typeof input.type === 'string' ? input.type.trim() : 'multiple_choice';
  if (!prompt) {
    return { ok: false, status: 400, code: 'INVALID_PROMPT', message: 'Teks soal tidak boleh kosong.' };
  }
  if (!subjectId || !/^[a-z0-9_]{1,40}$/.test(subjectId)) {
    return { ok: false, status: 400, code: 'INVALID_SUBJECT', message: 'Mata pelajaran wajib dipilih.' };
  }

  const nowIso = new Date().toISOString();
  const id =
    typeof input.id === 'string' && input.id.trim()
      ? sanitizeEngineId(input.id.trim())
      : sanitizeEngineId(`bank_${subjectId}_${Date.now().toString(36)}`);

  const item = await mutateAssessmentState((state) => {
    const key = makeBankKey(staff.schoolId, id);
    const prev = state.questionBank[key];
    const next: BankQuestionRecord = {
      id,
      schoolId: staff.schoolId,
      subjectId,
      worldId: typeof input.worldId === 'string' && input.worldId.trim() ? input.worldId.trim() : subjectId,
      grade: typeof input.grade === 'string' && input.grade.trim() ? input.grade.trim().slice(0, 16) : '3',
      semester: input.semester === 'Genap' ? 'Genap' : 'Ganjil',
      topic: typeof input.topic === 'string' ? input.topic.trim().slice(0, 200) : prev?.topic || 'Umum',
      competency: typeof input.competency === 'string' ? input.competency.trim().slice(0, 300) : prev?.competency || '',
      indicator: typeof input.indicator === 'string' ? input.indicator.trim().slice(0, 300) : prev?.indicator || '',
      type,
      difficulty:
        input.difficulty === 'mudah' || input.difficulty === 'sulit' ? input.difficulty : 'sedang',
      prompt,
      payload: input.payload && typeof input.payload === 'object' ? input.payload : prev?.payload || {},
      correctAnswer: typeof input.correctAnswer === 'string' ? input.correctAnswer.slice(0, 2000) : prev?.correctAnswer || '',
      acceptedVariations: Array.isArray(input.acceptedVariations)
        ? input.acceptedVariations.map(String).filter(Boolean).slice(0, 20)
        : prev?.acceptedVariations,
      numericTolerance:
        typeof input.numericTolerance === 'number' && input.numericTolerance >= 0
          ? input.numericTolerance
          : prev?.numericTolerance,
      rubric: typeof input.rubric === 'string' ? input.rubric.slice(0, 2000) : prev?.rubric,
      explanation:
        typeof input.explanation === 'string' ? input.explanation.slice(0, 1000) : prev?.explanation,
      imageUrl: typeof input.imageUrl === 'string' ? input.imageUrl.trim().slice(0, 1000) : prev?.imageUrl,
      tags: Array.isArray(input.tags)
        ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
        : prev?.tags || [],
      weight:
        typeof input.weight === 'number' && input.weight >= 0 && input.weight <= 100
          ? input.weight
          : prev?.weight ?? 10,
      isActive: typeof input.isActive === 'boolean' ? input.isActive : prev?.isActive ?? true,
      archivedAt: input.isActive === true ? undefined : input.archivedAt ?? prev?.archivedAt,
      archivedBy: input.isActive === true ? undefined : input.archivedBy ?? prev?.archivedBy,
      verificationStatus:
        input.verificationStatus === 'VERIFIED'
          ? 'VERIFIED'
          : input.verificationStatus === 'BELUM_DIVERIFIKASI'
            ? 'BELUM_DIVERIFIKASI'
            : prev?.verificationStatus || 'VERIFIED',
      importBatchId:
        typeof input.importBatchId === 'string' && input.importBatchId.trim()
          ? sanitizeEngineId(input.importBatchId.trim())
          : prev?.importBatchId,
      sourceFileName:
        typeof input.sourceFileName === 'string' && input.sourceFileName.trim()
          ? input.sourceFileName.trim().slice(0, 200)
          : prev?.sourceFileName,
      sourceFileType:
        typeof input.sourceFileType === 'string' && input.sourceFileType.trim()
          ? input.sourceFileType.trim().slice(0, 40)
          : prev?.sourceFileType,
      sourcePage:
        typeof input.sourcePage === 'number' && input.sourcePage >= 1
          ? Math.round(input.sourcePage)
          : prev?.sourcePage,
      sourceQuestionNumber:
        typeof input.sourceQuestionNumber === 'string' && input.sourceQuestionNumber.trim()
          ? input.sourceQuestionNumber.trim().slice(0, 32)
          : prev?.sourceQuestionNumber,
      extractionStatus:
        input.extractionStatus === 'success' ||
        input.extractionStatus === 'needs_review' ||
        input.extractionStatus === 'failed'
          ? input.extractionStatus
          : prev?.extractionStatus,
      extractionConfidence:
        typeof input.extractionConfidence === 'number'
          ? Math.max(0, Math.min(1, Number(input.extractionConfidence)))
          : prev?.extractionConfidence,
      needsReview:
        typeof input.needsReview === 'boolean' ? input.needsReview : prev?.needsReview,
      importedBy:
        typeof input.importedBy === 'string' && input.importedBy.trim()
          ? sanitizeEngineId(input.importedBy.trim())
          : prev?.importedBy,
      importedAt:
        typeof input.importedAt === 'string' && input.importedAt.trim()
          ? input.importedAt.trim().slice(0, 64)
          : prev?.importedAt,
      ownerId: prev?.ownerId || staff.uid,
      createdAt: prev?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    state.questionBank[key] = next;
    appendExamAuditLog(state, {
      schoolId: staff.schoolId,
      actorId: staff.uid,
      actorType: staff.role,
      action: prev ? 'BANK_QUESTION_UPDATED' : 'BANK_QUESTION_CREATED',
      detail: `${id} (${subjectId}/${type})`,
    });
    return next;
  });

  return { ok: true, item };
}

export async function duplicateQuestionBankItemEngine(
  staff: StaffActor,
  questionId: string
): Promise<{ ok: true; item: BankQuestionRecord } | { ok: false; status: number; code: string; message: string }> {
  const nowIso = new Date().toISOString();
  return mutateAssessmentState((state) => {
    const orig = state.questionBank[makeBankKey(staff.schoolId, questionId)];
    if (!orig) {
      return { ok: false, status: 404, code: 'QUESTION_NOT_FOUND', message: 'Soal tidak ditemukan di Bank Soal.' };
    }
    const copyId = sanitizeEngineId(`bank_${orig.subjectId}_${Date.now().toString(36)}_copy`);
    const cloned: BankQuestionRecord = {
      ...orig,
      id: copyId,
      prompt: `${orig.prompt} (Salinan)`,
      isActive: true,
      archivedAt: undefined,
      archivedBy: undefined,
      ownerId: staff.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.questionBank[makeBankKey(staff.schoolId, copyId)] = cloned;
    appendExamAuditLog(state, {
      schoolId: staff.schoolId,
      actorId: staff.uid,
      actorType: staff.role,
      action: 'BANK_QUESTION_DUPLICATED',
      detail: `${questionId} -> ${copyId}`,
    });
    return { ok: true, item: cloned };
  });
}

export async function deleteOrArchiveQuestionBankItemEngine(
  staff: StaffActor,
  questionId: string,
  forceArchive = false
): Promise<
  | { ok: true; action: 'deleted' | 'archived'; item?: BankQuestionRecord; message: string }
  | { ok: false; status: number; code: string; message: string }
> {
  const nowIso = new Date().toISOString();
  return mutateAssessmentState((state) => {
    const key = makeBankKey(staff.schoolId, questionId);
    const existing = state.questionBank[key];
    if (!existing) {
      return { ok: false, status: 404, code: 'QUESTION_NOT_FOUND', message: 'Soal tidak ditemukan.' };
    }

    const usedInQuestions = Object.values(state.examQuestions).filter(
      (q) => q.schoolId === staff.schoolId && q.bankItemId === questionId
    );
    const usedInActiveOrHistoricalExam = usedInQuestions.some((eq) => {
      const exam = state.exams[makeExamKey(staff.schoolId, eq.assessmentId)];
      if (!exam) return false;
      const hasSessions = Object.values(state.sessions).some((s) => s.assessmentId === exam.id);
      return hasSessions || exam.status === 'active' || exam.status === 'closed' || exam.status === 'completed';
    });

    if (forceArchive || usedInActiveOrHistoricalExam || usedInQuestions.length > 0) {
      existing.isActive = false;
      existing.archivedAt = nowIso;
      existing.archivedBy = staff.uid;
      existing.updatedAt = nowIso;
      appendExamAuditLog(state, {
        schoolId: staff.schoolId,
        actorId: staff.uid,
        actorType: staff.role,
        action: 'BANK_QUESTION_ARCHIVED',
        detail: `${questionId} (diarsipkan karena terhubung ke asesmen)`,
      });
      return {
        ok: true,
        action: 'archived',
        item: existing,
        message: 'Soal terhubung ke asesmen/riwayat siswa, sehingga diarsipkan secara aman (soft delete).',
      };
    }

    delete state.questionBank[key];
    appendExamAuditLog(state, {
      schoolId: staff.schoolId,
      actorId: staff.uid,
      actorType: staff.role,
      action: 'BANK_QUESTION_DELETED',
      detail: questionId,
    });
    return {
      ok: true,
      action: 'deleted',
      message: 'Soal berhasil dihapus permanen dari Bank Soal.',
    };
  });
}

// =========================================================================
// 2. EXAM BUILDER & MANAGEMENT (TEACHER / ADMIN)
// =========================================================================

export function listExamsForTeacherEngine(schoolId: string, statusFilter?: string) {
  const state = getAssessmentStateSnapshot();
  return Object.values(state.exams)
    .filter((e) => e.schoolId === schoolId)
    .filter((e) => (!statusFilter || statusFilter === 'all' ? true : e.status === statusFilter))
    .map((exam) => {
      const questions = Object.values(state.examQuestions).filter(
        (q) => q.assessmentId === exam.id && q.schoolId === schoolId
      );
      const sessions = Object.values(state.sessions).filter(
        (s) => s.assessmentId === exam.id && s.schoolId === schoolId
      );
      const submissions = Object.values(state.submissions).filter(
        (sub) => sub.assessmentId === exam.id && sub.schoolId === schoolId
      );
      const pendingEssayCount = submissions.filter((sub) => sub.needsManualReview).length;
      return {
        ...exam,
        questionCount: questions.length,
        totalWeight: questions.reduce((acc, q) => acc + (q.weight || 0), 0),
        participantCount: new Set(sessions.map((s) => s.studentId)).size,
        sessionCount: sessions.length,
        submissionCount: submissions.length,
        pendingEssayCount,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getExamDetailForTeacherEngine(schoolId: string, examId: string) {
  const state = getAssessmentStateSnapshot();
  const exam = state.exams[makeExamKey(schoolId, examId)];
  if (!exam) return null;
  const questions = Object.values(state.examQuestions)
    .filter((q) => q.assessmentId === examId && q.schoolId === schoolId)
    .sort((a, b) => a.order - b.order);
  const sessions = Object.values(state.sessions).filter(
    (s) => s.assessmentId === examId && s.schoolId === schoolId
  );
  const submissions = Object.values(state.submissions).filter(
    (sub) => sub.assessmentId === examId && sub.schoolId === schoolId
  );
  return {
    exam,
    questions,
    participantCount: new Set(sessions.map((s) => s.studentId)).size,
    sessionCount: sessions.length,
    submissionCount: submissions.length,
    sessions,
  };
}

export async function upsertExamEngine(
  staff: StaffActor,
  input: Partial<ExamRecord> & { confirmActiveEdit?: boolean }
): Promise<
  | { ok: true; exam: ExamRecord; warning?: string }
  | { ok: false; status: number; code: string; message: string }
> {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 160) : '';
  const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : '';
  const rawCode = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
  const cleanCode = rawCode.replace(/[^A-Z0-9_-]/g, '').slice(0, 32);

  if (!title) {
    return { ok: false, status: 400, code: 'INVALID_TITLE', message: 'Nama asesmen wajib diisi.' };
  }
  if (!subjectId || !/^[a-z0-9_]{1,40}$/.test(subjectId)) {
    return { ok: false, status: 400, code: 'INVALID_SUBJECT', message: 'Mata pelajaran tidak valid.' };
  }

  const nowIso = new Date().toISOString();
  const examId =
    typeof input.id === 'string' && input.id.trim()
      ? sanitizeEngineId(input.id.trim())
      : sanitizeEngineId(`asm_${subjectId}_${Date.now().toString(36)}`);

  return mutateAssessmentState((state) => {
    const key = makeExamKey(staff.schoolId, examId);
    const prev = state.exams[key];
    const code = cleanCode.length >= 2 ? cleanCode : prev?.code || `PSAS-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    const codeHash = hashExamCodeEngine(staff.schoolId, code);

    const existingSessions = Object.values(state.sessions).filter((s) => s.assessmentId === examId);
    const hasParticipants = existingSessions.length > 0;

    const requestedMode: AssessmentMode =
      input.mode === 'latihan' || input.mode === 'simulasi' ? input.mode : prev?.mode || 'psas';
    const requestedExamType: AssessmentType =
      input.examType === 'latihan' ||
      input.examType === 'ulangan_harian' ||
      input.examType === 'sumatif' ||
      input.examType === 'simulasi' ||
      input.examType === 'psas'
        ? input.examType
        : prev?.examType || (requestedMode === 'latihan' ? 'latihan' : requestedMode === 'simulasi' ? 'simulasi' : 'psas');

    if (prev && hasParticipants && !input.confirmActiveEdit) {
      const breakingChange =
        prev.mode !== requestedMode ||
        prev.examType !== requestedExamType ||
        (typeof input.shuffleQuestions === 'boolean' && prev.shuffleQuestions !== input.shuffleQuestions);
      if (breakingChange) {
        return {
          ok: false,
          status: 409,
          code: 'ACTIVE_PARTICIPANTS_GUARD',
          message:
            'Asesmen ini sudah memiliki peserta atau hasil pengerjaan. Konfirmasi perubahan atau hindari mengubah mode/pengacakan utama.',
        };
      }
    }

    const nextStatus: AssessmentStatus =
      input.status === 'draft' ||
      input.status === 'scheduled' ||
      input.status === 'active' ||
      input.status === 'closed' ||
      input.status === 'completed' ||
      input.status === 'archived'
        ? input.status
        : prev?.status || 'draft';

    const scoringPolicy = defaultScoringPolicy(input.scoringPolicy || prev?.scoringPolicy);
    const resultPolicy = defaultResultPolicy(
      requestedMode,
      input.showScoreToStudent ?? prev?.showScoreToStudent,
      input.resultPolicy || prev?.resultPolicy
    );

    const classIds = Array.isArray(input.classIds)
      ? input.classIds.map((c) => String(c).trim()).filter(Boolean).slice(0, 20)
      : prev?.classIds || ['kelas_3a', 'kelas_3b', 'kelas_3c', 'kelas_3d'];

    const questionCount = Object.values(state.examQuestions).filter(
      (q) => q.assessmentId === examId && q.schoolId === staff.schoolId
    ).length;

    const exam: ExamRecord = {
      id: examId,
      schoolId: staff.schoolId,
      classIds,
      code,
      codeHash,
      title,
      description:
        typeof input.description === 'string' ? input.description.trim().slice(0, 600) : prev?.description,
      academicYear:
        typeof input.academicYear === 'string' && input.academicYear.trim()
          ? input.academicYear.trim().slice(0, 32)
          : prev?.academicYear || '2025/2026',
      subjectId,
      worldThemeId:
        typeof input.worldThemeId === 'string' && input.worldThemeId.trim()
          ? input.worldThemeId.trim()
          : subjectId,
      grade: typeof input.grade === 'string' && input.grade.trim() ? input.grade.trim().slice(0, 16) : prev?.grade || '3',
      semester: input.semester === 'Genap' ? 'Genap' : prev?.semester || 'Ganjil',
      date: typeof input.date === 'string' ? input.date : prev?.date,
      startsAt: typeof input.startsAt === 'string' ? input.startsAt : prev?.startsAt,
      endsAt: typeof input.endsAt === 'string' ? input.endsAt : prev?.endsAt,
      durationMinutes: Math.max(
        5,
        Math.min(240, Number(input.durationMinutes) || prev?.durationMinutes || 30)
      ),
      maxAttempts: Math.max(
        1,
        Math.min(50, Number(input.maxAttempts) || prev?.maxAttempts || (requestedMode === 'latihan' ? 5 : 1))
      ),
      allowMultipleSessions:
        typeof input.allowMultipleSessions === 'boolean'
          ? input.allowMultipleSessions
          : (Number(input.maxAttempts) || prev?.maxAttempts || 1) > 1 || requestedMode === 'latihan',
      examType: requestedExamType,
      mode: requestedMode,
      status: nextStatus,
      isLocked: typeof input.isLocked === 'boolean' ? input.isLocked : nextStatus !== 'active',
      isVisibleOnMap: typeof input.isVisibleOnMap === 'boolean' ? input.isVisibleOnMap : prev?.isVisibleOnMap ?? true,
      showScoreToStudent: resultPolicy.showScoreToStudent,
      introStory:
        typeof input.introStory === 'string' && input.introStory.trim()
          ? input.introStory.trim().slice(0, 2000)
          : prev?.introStory || 'Bacalah setiap soal dengan tenang dan penuh semangat ya!',
      totalQuestions: questionCount || prev?.totalQuestions || 0,
      targetQuestionCount:
        typeof input.targetQuestionCount === 'number' && input.targetQuestionCount > 0
          ? Math.min(200, Math.round(input.targetQuestionCount))
          : prev?.targetQuestionCount,
      checkpointInterval: Math.max(1, Math.min(20, Number(input.checkpointInterval) || prev?.checkpointInterval || 3)),
      kkm: Math.max(0, Math.min(100, Number(input.kkm) ?? prev?.kkm ?? 75)),
      navigationMode:
        input.navigationMode === 'sequential' ||
        input.navigationMode === 'free' ||
        input.navigationMode === 'level' ||
        input.navigationMode === 'checkpoint'
          ? input.navigationMode
          : prev?.navigationMode || 'free',
      allowBack: typeof input.allowBack === 'boolean' ? input.allowBack : prev?.allowBack ?? true,
      allowEditAfterAnswer:
        typeof input.allowEditAfterAnswer === 'boolean'
          ? input.allowEditAfterAnswer
          : prev?.allowEditAfterAnswer ?? true,
      requireAnswerBeforeNext:
        typeof input.requireAnswerBeforeNext === 'boolean'
          ? input.requireAnswerBeforeNext
          : prev?.requireAnswerBeforeNext ?? false,
      shuffleQuestions:
        typeof input.shuffleQuestions === 'boolean' ? input.shuffleQuestions : prev?.shuffleQuestions ?? false,
      shuffleOptions:
        typeof input.shuffleOptions === 'boolean' ? input.shuffleOptions : prev?.shuffleOptions ?? false,
      identityMode:
        input.identityMode === 'code_free' ||
        input.identityMode === 'roster_select' ||
        input.identityMode === 'roster_verify'
          ? input.identityMode
          : prev?.identityMode || 'roster_verify',
      audioEnabled: typeof input.audioEnabled === 'boolean' ? input.audioEnabled : prev?.audioEnabled ?? true,
      scoringPolicy,
      resultPolicy,
      archivedAt: nextStatus === 'archived' ? prev?.archivedAt || nowIso : undefined,
      ownerId: prev?.ownerId || staff.uid,
      createdAt: prev?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    state.exams[key] = exam;
    appendExamAuditLog(state, {
      schoolId: staff.schoolId,
      examId,
      actorId: staff.uid,
      actorType: staff.role,
      action: prev ? 'EXAM_UPDATED' : 'EXAM_CREATED',
      detail: `${exam.title} (${exam.examType}/${exam.mode}/${exam.status})`,
    });

    return {
      ok: true,
      exam,
      warning: hasParticipants
        ? 'Perubahan disimpan. Sesi peserta yang sudah berjalan tetap mempertahankan urutan soalnya.'
        : undefined,
    };
  });
}

export async function addOrAttachQuestionsToExamEngine(
  staff: StaffActor,
  examId: string,
  payload: {
    bankItemIds?: string[];
    question?: Partial<ExamQuestionRecord>;
    saveToBank?: boolean;
    reorderIds?: string[];
    weightUpdates?: Array<{ questionId: string; weight: number }>;
  }
): Promise<
  | { ok: true; questions: ExamQuestionRecord[] }
  | { ok: false; status: number; code: string; message: string }
> {
  const nowIso = new Date().toISOString();
  return mutateAssessmentState((state) => {
    const exam = state.exams[makeExamKey(staff.schoolId, examId)];
    if (!exam) {
      return { ok: false, status: 404, code: 'EXAM_NOT_FOUND', message: 'Asesmen tidak ditemukan.' };
    }

    const currentQuestions = Object.values(state.examQuestions)
      .filter((q) => q.assessmentId === examId && q.schoolId === staff.schoolId)
      .sort((a, b) => a.order - b.order);

    let nextOrder = currentQuestions.length + 1;

    // Option 1: Attach from Bank Soal
    if (Array.isArray(payload.bankItemIds) && payload.bankItemIds.length > 0) {
      for (const bankId of payload.bankItemIds) {
        const bank = state.questionBank[makeBankKey(staff.schoolId, bankId)];
        if (!bank) continue;
        // Skip duplicate bank item already in same exam
        const already = currentQuestions.some((eq) => eq.bankItemId === bank.id);
        if (already) continue;

        const qId = sanitizeEngineId(`q_${examId}_${bank.id.slice(-12)}_${Date.now().toString(36).slice(-4)}`);
        const bankPayload = (bank.payload || {}) as Record<string, unknown>;
        const eq: ExamQuestionRecord = {
          id: qId,
          schoolId: staff.schoolId,
          assessmentId: examId,
          subjectId: exam.subjectId,
          bankItemId: bank.id,
          order: nextOrder++,
          type: bank.type,
          prompt: bank.prompt,
          options: Array.isArray(bankPayload.options) ? bankPayload.options.map(String) : undefined,
          mediaUrl:
            typeof bank.imageUrl === 'string' && bank.imageUrl
              ? bank.imageUrl
              : typeof bankPayload.mediaUrl === 'string'
                ? bankPayload.mediaUrl
                : undefined,
          audioUrl: typeof bankPayload.audioUrl === 'string' ? bankPayload.audioUrl : undefined,
          audioText: typeof bankPayload.audioText === 'string' ? bankPayload.audioText : undefined,
          matchLeft: Array.isArray(bankPayload.matchLeft) ? bankPayload.matchLeft.map(String) : undefined,
          matchRight: Array.isArray(bankPayload.matchRight) ? bankPayload.matchRight.map(String) : undefined,
          orderingItems: Array.isArray(bankPayload.orderingItems)
            ? bankPayload.orderingItems.map(String)
            : undefined,
          dragItems: Array.isArray(bankPayload.dragItems)
            ? (bankPayload.dragItems as Array<{ id: string; label: string }>)
            : undefined,
          dragTargets: Array.isArray(bankPayload.dragTargets)
            ? (bankPayload.dragTargets as Array<{ id: string; label: string }>)
            : undefined,
          imageOptions: Array.isArray(bankPayload.imageOptions)
            ? (bankPayload.imageOptions as Array<{ id: string; label: string; imageUrl?: string; motif?: string }>)
            : undefined,
          weight: bank.weight || 10,
          topic: bank.topic,
          indicator: bank.indicator,
          difficulty: bank.difficulty,
          correctAnswer: bank.correctAnswer,
          acceptedVariations: bank.acceptedVariations,
          numericTolerance: bank.numericTolerance,
          rubric: bank.rubric,
          explanation: bank.explanation,
          isPublished: true,
          ownerId: staff.uid,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        state.examQuestions[makeExamQuestionKey(examId, qId)] = eq;
      }
    }

    // Option 2: Direct inline question create/update
    if (payload.question && typeof payload.question.prompt === 'string' && payload.question.prompt.trim()) {
      const qInput = payload.question;
      const qId =
        typeof qInput.id === 'string' && qInput.id.trim()
          ? sanitizeEngineId(qInput.id.trim())
          : sanitizeEngineId(`q_${examId}_${Date.now().toString(36)}`);
      const existing = state.examQuestions[makeExamQuestionKey(examId, qId)];

      let linkedBankId = qInput.bankItemId || existing?.bankItemId;
      if (payload.saveToBank) {
        const bankId = linkedBankId || sanitizeEngineId(`bank_${exam.subjectId}_${Date.now().toString(36)}`);
        linkedBankId = bankId;
        state.questionBank[makeBankKey(staff.schoolId, bankId)] = {
          id: bankId,
          schoolId: staff.schoolId,
          subjectId: exam.subjectId,
          worldId: exam.subjectId,
          grade: exam.grade,
          semester: exam.semester,
          topic: qInput.topic || 'Umum',
          competency: '',
          indicator: qInput.indicator || '',
          type: qInput.type || 'multiple_choice',
          difficulty: qInput.difficulty || 'sedang',
          prompt: String(qInput.prompt || '').trim(),
          payload: {
            options: qInput.options,
            mediaUrl: qInput.mediaUrl,
            audioText: qInput.audioText,
            matchLeft: qInput.matchLeft,
            matchRight: qInput.matchRight,
            orderingItems: qInput.orderingItems,
            dragItems: qInput.dragItems,
            dragTargets: qInput.dragTargets,
            imageOptions: qInput.imageOptions,
          },
          correctAnswer: String(qInput.correctAnswer || ''),
          acceptedVariations: qInput.acceptedVariations,
          numericTolerance: qInput.numericTolerance,
          rubric: qInput.rubric,
          explanation: qInput.explanation,
          imageUrl: qInput.mediaUrl,
          tags: [],
          weight: typeof qInput.weight === 'number' ? qInput.weight : 10,
          isActive: true,
          verificationStatus: 'VERIFIED',
          ownerId: staff.uid,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      }

      const eq: ExamQuestionRecord = {
        id: qId,
        schoolId: staff.schoolId,
        assessmentId: examId,
        subjectId: exam.subjectId,
        bankItemId: linkedBankId,
        order: typeof qInput.order === 'number' ? qInput.order : existing?.order ?? nextOrder++,
        type: qInput.type || existing?.type || 'multiple_choice',
        prompt: String(qInput.prompt || '').trim().slice(0, 2000),
        options: Array.isArray(qInput.options) ? qInput.options.map(String) : existing?.options,
        mediaUrl: typeof qInput.mediaUrl === 'string' ? qInput.mediaUrl : existing?.mediaUrl,
        audioUrl: typeof qInput.audioUrl === 'string' ? qInput.audioUrl : existing?.audioUrl,
        audioText: typeof qInput.audioText === 'string' ? qInput.audioText : existing?.audioText,
        matchLeft: Array.isArray(qInput.matchLeft) ? qInput.matchLeft.map(String) : existing?.matchLeft,
        matchRight: Array.isArray(qInput.matchRight) ? qInput.matchRight.map(String) : existing?.matchRight,
        orderingItems: Array.isArray(qInput.orderingItems)
          ? qInput.orderingItems.map(String)
          : existing?.orderingItems,
        dragItems: Array.isArray(qInput.dragItems) ? qInput.dragItems : existing?.dragItems,
        dragTargets: Array.isArray(qInput.dragTargets) ? qInput.dragTargets : existing?.dragTargets,
        imageOptions: Array.isArray(qInput.imageOptions) ? qInput.imageOptions : existing?.imageOptions,
        weight:
          typeof qInput.weight === 'number' && qInput.weight >= 0 && qInput.weight <= 100
            ? qInput.weight
            : existing?.weight ?? 10,
        topic: typeof qInput.topic === 'string' ? qInput.topic : existing?.topic,
        indicator: typeof qInput.indicator === 'string' ? qInput.indicator : existing?.indicator,
        difficulty: qInput.difficulty || existing?.difficulty || 'sedang',
        correctAnswer:
          typeof qInput.correctAnswer === 'string' ? qInput.correctAnswer : existing?.correctAnswer || '',
        acceptedVariations: Array.isArray(qInput.acceptedVariations)
          ? qInput.acceptedVariations.map(String)
          : existing?.acceptedVariations,
        numericTolerance:
          typeof qInput.numericTolerance === 'number'
            ? qInput.numericTolerance
            : existing?.numericTolerance,
        allowPartialScoring:
          typeof qInput.allowPartialScoring === 'boolean'
            ? qInput.allowPartialScoring
            : existing?.allowPartialScoring,
        rubric: typeof qInput.rubric === 'string' ? qInput.rubric : existing?.rubric,
        explanation: typeof qInput.explanation === 'string' ? qInput.explanation : existing?.explanation,
        practiceHint:
          typeof qInput.practiceHint === 'string' ? qInput.practiceHint : existing?.practiceHint,
        isPublished: true,
        ownerId: existing?.ownerId || staff.uid,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      state.examQuestions[makeExamQuestionKey(examId, qId)] = eq;
    }

    // Option 3: Reorder & Weight updates
    if (Array.isArray(payload.reorderIds) && payload.reorderIds.length > 0) {
      payload.reorderIds.forEach((qid, idx) => {
        const rec = state.examQuestions[makeExamQuestionKey(examId, qid)];
        if (rec) {
          rec.order = idx + 1;
          rec.updatedAt = nowIso;
        }
      });
    }
    if (Array.isArray(payload.weightUpdates)) {
      for (const wu of payload.weightUpdates) {
        const rec = state.examQuestions[makeExamQuestionKey(examId, wu.questionId)];
        if (rec && typeof wu.weight === 'number' && wu.weight >= 0 && wu.weight <= 100) {
          rec.weight = wu.weight;
          rec.updatedAt = nowIso;
        }
      }
    }

    // Re-normalize orders 1..N
    const updatedList = Object.values(state.examQuestions)
      .filter((q) => q.assessmentId === examId && q.schoolId === staff.schoolId)
      .sort((a, b) => a.order - b.order);
    updatedList.forEach((q, idx) => {
      q.order = idx + 1;
    });
    exam.totalQuestions = updatedList.length;
    exam.updatedAt = nowIso;

    return { ok: true, questions: updatedList };
  });
}

export async function removeExamQuestionEngine(
  staff: StaffActor,
  examId: string,
  questionId: string
): Promise<{ ok: true; questions: ExamQuestionRecord[] } | { ok: false; status: number; code: string; message: string }> {
  const nowIso = new Date().toISOString();
  return mutateAssessmentState((state) => {
    const exam = state.exams[makeExamKey(staff.schoolId, examId)];
    if (!exam) {
      return { ok: false, status: 404, code: 'EXAM_NOT_FOUND', message: 'Asesmen tidak ditemukan.' };
    }
    const key = makeExamQuestionKey(examId, questionId);
    if (!state.examQuestions[key]) {
      return { ok: false, status: 404, code: 'QUESTION_NOT_FOUND', message: 'Soal tidak ditemukan pada asesmen ini.' };
    }

    const hasExistingAnswers = Object.values(state.answers).some(
      (a) => a.assessmentId === examId && a.questionId === questionId
    );
    if (hasExistingAnswers) {
      return {
        ok: false,
        status: 409,
        code: 'QUESTION_HAS_RESPONSES',
        message: 'Soal ini sudah dijawab oleh peserta ujian sehingga tidak dapat dihapus agar riwayat nilai tetap akurat.',
      };
    }

    delete state.examQuestions[key];
    const remaining = Object.values(state.examQuestions)
      .filter((q) => q.assessmentId === examId && q.schoolId === staff.schoolId)
      .sort((a, b) => a.order - b.order);
    remaining.forEach((q, idx) => {
      q.order = idx + 1;
    });
    exam.totalQuestions = remaining.length;
    exam.updatedAt = nowIso;
    return { ok: true, questions: remaining };
  });
}

export async function transitionExamStatusEngine(
  staff: StaffActor,
  examId: string,
  targetStatus: AssessmentStatus
): Promise<{ ok: true; exam: ExamRecord } | { ok: false; status: number; code: string; message: string }> {
  const nowIso = new Date().toISOString();
  return mutateAssessmentState((state) => {
    const exam = state.exams[makeExamKey(staff.schoolId, examId)];
    if (!exam) {
      return { ok: false, status: 404, code: 'EXAM_NOT_FOUND', message: 'Asesmen tidak ditemukan.' };
    }
    const questions = Object.values(state.examQuestions).filter(
      (q) => q.assessmentId === examId && q.schoolId === staff.schoolId
    );
    if (targetStatus === 'active' && questions.length === 0) {
      return {
        ok: false,
        status: 400,
        code: 'NO_QUESTIONS_ATTACHED',
        message: 'Tambahkan minimal 1 soal sebelum mengaktifkan asesmen.',
      };
    }

    exam.status = targetStatus;
    exam.isLocked = targetStatus !== 'active';
    if (targetStatus === 'archived') {
      exam.archivedAt = nowIso;
    }
    exam.updatedAt = nowIso;

    appendExamAuditLog(state, {
      schoolId: staff.schoolId,
      examId,
      actorId: staff.uid,
      actorType: staff.role,
      action: `EXAM_STATUS_${targetStatus.toUpperCase()}`,
      detail: `${exam.title} -> ${targetStatus}`,
    });

    return { ok: true, exam };
  });
}

/**
 * Mirrors teacher saves from Firestore client service into server assessmentStore
 * so student exam sessions & scoring always stay synchronized.
 */
export async function syncExamFromTeacherClient(
  staff: StaffActor,
  payload: {
    assessment?: Partial<ExamRecord>;
    questions?: Array<Partial<ExamQuestionRecord>>;
    bankItems?: Array<Partial<BankQuestionRecord>>;
  }
) {
  const nowIso = new Date().toISOString();
  return mutateAssessmentState((state) => {
    if (Array.isArray(payload.bankItems)) {
      for (const b of payload.bankItems) {
        if (!b.id || !b.prompt) continue;
        const bId = sanitizeEngineId(String(b.id));
        const key = makeBankKey(staff.schoolId, bId);
        const prev = state.questionBank[key];
        state.questionBank[key] = {
          id: bId,
          schoolId: staff.schoolId,
          subjectId: String(b.subjectId || prev?.subjectId || 'pai'),
          worldId: String(b.subjectId || prev?.worldId || 'pai'),
          grade: String(b.grade || prev?.grade || '3'),
          semester: b.semester === 'Genap' ? 'Genap' : prev?.semester || 'Ganjil',
          topic: String(b.topic || prev?.topic || 'Umum'),
          competency: String(b.competency || prev?.competency || ''),
          indicator: String(b.indicator || prev?.indicator || ''),
          type: String(b.type || prev?.type || 'multiple_choice'),
          difficulty:
            b.difficulty === 'mudah' || b.difficulty === 'sulit'
              ? b.difficulty
              : prev?.difficulty || 'sedang',
          prompt: String(b.prompt),
          payload: (b.payload as Record<string, unknown>) || prev?.payload || {},
          correctAnswer: String(b.correctAnswer ?? prev?.correctAnswer ?? ''),
          acceptedVariations: Array.isArray(b.acceptedVariations)
            ? b.acceptedVariations.map(String)
            : prev?.acceptedVariations,
          numericTolerance:
            typeof b.numericTolerance === 'number' ? b.numericTolerance : prev?.numericTolerance,
          rubric: typeof b.rubric === 'string' ? b.rubric : prev?.rubric,
          explanation: typeof b.explanation === 'string' ? b.explanation : prev?.explanation,
          imageUrl: typeof b.imageUrl === 'string' ? b.imageUrl : prev?.imageUrl,
          tags: Array.isArray(b.tags) ? b.tags.map(String) : prev?.tags || [],
          weight: typeof b.weight === 'number' ? b.weight : prev?.weight ?? 10,
          isActive: typeof b.isActive === 'boolean' ? b.isActive : prev?.isActive ?? true,
          archivedAt: typeof b.archivedAt === 'string' ? b.archivedAt : prev?.archivedAt,
          archivedBy: typeof b.archivedBy === 'string' ? b.archivedBy : prev?.archivedBy,
          verificationStatus:
            b.verificationStatus === 'VERIFIED' ? 'VERIFIED' : prev?.verificationStatus || 'VERIFIED',
          ownerId: prev?.ownerId || staff.uid,
          createdAt: prev?.createdAt || nowIso,
          updatedAt: nowIso,
        };
      }
    }

    if (payload.assessment && payload.assessment.id) {
      const a = payload.assessment;
      const examId = sanitizeEngineId(String(a.id));
      const key = makeExamKey(staff.schoolId, examId);
      const prev = state.exams[key];
      const mode: AssessmentMode =
        a.mode === 'latihan' || a.mode === 'simulasi' ? a.mode : prev?.mode || 'psas';
      const examType: AssessmentType =
        a.examType === 'latihan' ||
        a.examType === 'ulangan_harian' ||
        a.examType === 'sumatif' ||
        a.examType === 'simulasi' ||
        a.examType === 'psas'
          ? a.examType
          : prev?.examType || (mode === 'latihan' ? 'latihan' : mode === 'simulasi' ? 'simulasi' : 'psas');
      const rawCode = typeof a.code === 'string' ? a.code.trim().toUpperCase() : prev?.code || 'PSAS2025';
      const codeHash = hashExamCodeEngine(staff.schoolId, rawCode);

      state.exams[key] = {
        id: examId,
        schoolId: staff.schoolId,
        classIds: Array.isArray(a.classIds) ? a.classIds.map(String) : prev?.classIds || [],
        code: rawCode,
        codeHash,
        title: String(a.title || prev?.title || 'Asesmen SDN Pekiringan'),
        description: typeof a.description === 'string' ? a.description : prev?.description,
        academicYear: typeof a.academicYear === 'string' ? a.academicYear : prev?.academicYear || '2025/2026',
        subjectId: String(a.subjectId || prev?.subjectId || 'pai'),
        worldThemeId: String(a.worldThemeId || a.subjectId || prev?.worldThemeId || 'pai'),
        grade: String(a.grade || prev?.grade || '3'),
        semester: a.semester === 'Genap' ? 'Genap' : prev?.semester || 'Ganjil',
        date: typeof a.date === 'string' ? a.date : prev?.date,
        startsAt: typeof a.startsAt === 'string' ? a.startsAt : prev?.startsAt,
        endsAt: typeof a.endsAt === 'string' ? a.endsAt : prev?.endsAt,
        durationMinutes: Number(a.durationMinutes) || prev?.durationMinutes || 30,
        maxAttempts: Number(a.maxAttempts) || prev?.maxAttempts || 1,
        allowMultipleSessions:
          typeof a.allowMultipleSessions === 'boolean'
            ? a.allowMultipleSessions
            : prev?.allowMultipleSessions ?? false,
        examType,
        mode,
        status: (a.status as AssessmentStatus) || prev?.status || 'draft',
        isLocked: typeof a.isLocked === 'boolean' ? a.isLocked : prev?.isLocked ?? false,
        isVisibleOnMap: typeof a.isVisibleOnMap === 'boolean' ? a.isVisibleOnMap : prev?.isVisibleOnMap ?? true,
        showScoreToStudent:
          typeof a.showScoreToStudent === 'boolean' ? a.showScoreToStudent : prev?.showScoreToStudent ?? false,
        introStory: String(a.introStory || prev?.introStory || 'Selamat bertualang!'),
        totalQuestions: Number(a.totalQuestions) || prev?.totalQuestions || 0,
        targetQuestionCount:
          typeof a.targetQuestionCount === 'number' ? a.targetQuestionCount : prev?.targetQuestionCount,
        checkpointInterval: Number(a.checkpointInterval) || prev?.checkpointInterval || 3,
        kkm: Number(a.kkm) ?? prev?.kkm ?? 75,
        navigationMode: (a.navigationMode as NavigationMode) || prev?.navigationMode || 'free',
        allowBack: typeof a.allowBack === 'boolean' ? a.allowBack : prev?.allowBack ?? true,
        allowEditAfterAnswer:
          typeof a.allowEditAfterAnswer === 'boolean'
            ? a.allowEditAfterAnswer
            : prev?.allowEditAfterAnswer ?? true,
        requireAnswerBeforeNext:
          typeof a.requireAnswerBeforeNext === 'boolean'
            ? a.requireAnswerBeforeNext
            : prev?.requireAnswerBeforeNext ?? false,
        shuffleQuestions:
          typeof a.shuffleQuestions === 'boolean' ? a.shuffleQuestions : prev?.shuffleQuestions ?? false,
        shuffleOptions:
          typeof a.shuffleOptions === 'boolean' ? a.shuffleOptions : prev?.shuffleOptions ?? false,
        identityMode: (a.identityMode as ExamRecord['identityMode']) || prev?.identityMode || 'roster_verify',
        audioEnabled: typeof a.audioEnabled === 'boolean' ? a.audioEnabled : prev?.audioEnabled ?? true,
        scoringPolicy: defaultScoringPolicy(a.scoringPolicy || prev?.scoringPolicy),
        resultPolicy: defaultResultPolicy(mode, a.showScoreToStudent, a.resultPolicy || prev?.resultPolicy),
        ownerId: prev?.ownerId || staff.uid,
        createdAt: prev?.createdAt || nowIso,
        updatedAt: nowIso,
      };
    }

    if (Array.isArray(payload.questions)) {
      for (const q of payload.questions) {
        if (!q.id || !q.assessmentId) continue;
        const examId = sanitizeEngineId(String(q.assessmentId));
        const qId = sanitizeEngineId(String(q.id));
        const key = makeExamQuestionKey(examId, qId);
        const prev = state.examQuestions[key];
        state.examQuestions[key] = {
          id: qId,
          schoolId: staff.schoolId,
          assessmentId: examId,
          subjectId: String(q.subjectId || prev?.subjectId || 'pai'),
          bankItemId: q.bankItemId || prev?.bankItemId,
          order: typeof q.order === 'number' ? q.order : prev?.order || 1,
          type: String(q.type || prev?.type || 'multiple_choice'),
          prompt: String(q.prompt || prev?.prompt || ''),
          options: Array.isArray(q.options) ? q.options.map(String) : prev?.options,
          mediaUrl: typeof q.mediaUrl === 'string' ? q.mediaUrl : prev?.mediaUrl,
          audioUrl: typeof q.audioUrl === 'string' ? q.audioUrl : prev?.audioUrl,
          audioText: typeof q.audioText === 'string' ? q.audioText : prev?.audioText,
          matchLeft: Array.isArray(q.matchLeft) ? q.matchLeft.map(String) : prev?.matchLeft,
          matchRight: Array.isArray(q.matchRight) ? q.matchRight.map(String) : prev?.matchRight,
          orderingItems: Array.isArray(q.orderingItems) ? q.orderingItems.map(String) : prev?.orderingItems,
          dragItems: Array.isArray(q.dragItems) ? q.dragItems : prev?.dragItems,
          dragTargets: Array.isArray(q.dragTargets) ? q.dragTargets : prev?.dragTargets,
          imageOptions: Array.isArray(q.imageOptions) ? q.imageOptions : prev?.imageOptions,
          weight: typeof q.weight === 'number' ? q.weight : prev?.weight ?? 10,
          topic: typeof q.topic === 'string' ? q.topic : prev?.topic,
          indicator: typeof q.indicator === 'string' ? q.indicator : prev?.indicator,
          difficulty: q.difficulty || prev?.difficulty,
          correctAnswer: String(q.correctAnswer ?? prev?.correctAnswer ?? ''),
          acceptedVariations: Array.isArray(q.acceptedVariations)
            ? q.acceptedVariations.map(String)
            : prev?.acceptedVariations,
          numericTolerance:
            typeof q.numericTolerance === 'number' ? q.numericTolerance : prev?.numericTolerance,
          allowPartialScoring:
            typeof q.allowPartialScoring === 'boolean' ? q.allowPartialScoring : prev?.allowPartialScoring,
          rubric: typeof q.rubric === 'string' ? q.rubric : prev?.rubric,
          explanation: typeof q.explanation === 'string' ? q.explanation : prev?.explanation,
          practiceHint: typeof q.practiceHint === 'string' ? q.practiceHint : prev?.practiceHint,
          isPublished: true,
          ownerId: prev?.ownerId || staff.uid,
          createdAt: prev?.createdAt || nowIso,
          updatedAt: nowIso,
        };
      }
    }

    return { ok: true };
  });
}

// =========================================================================
// 3. STUDENT EXAM ENTRY, START, AUTOSAVE, FLAG, TIMER & SUBMISSION
// =========================================================================

function sanitizeQuestionForStudent(
  q: ExamQuestionRecord,
  exam: ExamRecord,
  frozenOptionOrder?: string[]
): Record<string, unknown> {
  const showPracticeAssist = exam.mode === 'latihan';
  let options = q.options ? [...q.options] : undefined;
  if (options && Array.isArray(frozenOptionOrder) && frozenOptionOrder.length === options.length) {
    options = [...frozenOptionOrder];
  }

  return {
    id: q.id,
    schoolId: q.schoolId,
    assessmentId: q.assessmentId,
    subjectId: q.subjectId,
    order: q.order,
    type: q.type,
    prompt: q.prompt,
    options,
    mediaUrl: q.mediaUrl,
    audioUrl: q.audioUrl,
    audioText: q.audioText,
    matchLeft: q.matchLeft,
    matchRight: q.matchRight,
    orderingItems: q.orderingItems,
    dragItems: q.dragItems,
    dragTargets: q.dragTargets,
    imageOptions: q.imageOptions,
    weight: q.weight,
    topic: q.topic,
    indicator: q.indicator,
    difficulty: q.difficulty,
    ...(showPracticeAssist && q.practiceHint ? { practiceHint: q.practiceHint } : {}),
    ...(showPracticeAssist && exam.resultPolicy.showExplanation && q.explanation
      ? { practiceExplanation: q.explanation }
      : {}),
    isPublished: q.isPublished,
  };
}

function validateExamEligibility(
  exam: ExamRecord,
  actor: StudentActorContext,
  existingSessions: ExamSessionRecord[]
): { ok: true; nextAttempt: number; activeSession?: ExamSessionRecord } | { ok: false; status: number; code: string; message: string } {
  if (exam.status !== 'active' || exam.isLocked) {
    return {
      ok: false,
      status: 403,
      code: 'EXAM_NOT_ACTIVE',
      message: 'Asesmen ini sedang tidak dibuka atau dikunci oleh guru.',
    };
  }
  const nowMs = Date.now();
  if (exam.startsAt) {
    const startMs = Date.parse(exam.startsAt);
    if (Number.isFinite(startMs) && nowMs < startMs) {
      return {
        ok: false,
        status: 403,
        code: 'EXAM_NOT_STARTED',
        message: 'Jadwal mulai ujian belum tiba. Tunggu arahan gurumu ya!',
      };
    }
  }
  if (exam.endsAt) {
    const endMs = Date.parse(exam.endsAt);
    if (Number.isFinite(endMs) && nowMs > endMs) {
      return {
        ok: false,
        status: 403,
        code: 'EXAM_SCHEDULE_ENDED',
        message: 'Jadwal pelaksanaan ujian ini sudah berakhir.',
      };
    }
  }

  if (Array.isArray(exam.classIds) && exam.classIds.length > 0) {
    const allowed = exam.classIds.some(
      (c) =>
        c.toLowerCase() === actor.classId.toLowerCase() ||
        c.toLowerCase() === actor.gradeClass.toLowerCase()
    );
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        code: 'CLASS_NOT_ALLOWED',
        message: `Asesmen ini tidak ditujukan untuk kelas ${actor.gradeClass}.`,
      };
    }
  }

  const activeSession = existingSessions.find((s) => s.status === 'in_progress');
  if (activeSession) {
    return { ok: true, nextAttempt: activeSession.attemptNumber, activeSession };
  }

  const maxAttempts = exam.maxAttempts || 1;
  if (existingSessions.length >= maxAttempts) {
    return {
      ok: false,
      status: 409,
      code: 'ATTEMPT_LIMIT_REACHED',
      message: `Kesempatan mengerjakan ujian ini sudah mencapai batas maksimal (${maxAttempts} kali).`,
    };
  }

  return { ok: true, nextAttempt: existingSessions.length + 1 };
}

/**
 * Fallback hydration if an assessment exists in Cloud Firestore publicAssessments
 * (e.g., seeded before Stage 3) and hasn't been synced into assessmentStore yet.
 */
async function ensureExamLoadedFromFirestoreIfMissing(
  schoolId: string,
  assessmentId: string
): Promise<ExamRecord | null> {
  const snapshot = getAssessmentStateSnapshot();
  const existing = snapshot.exams[makeExamKey(schoolId, assessmentId)];
  if (existing) return existing;

  try {
    const pubRes = await fsGetDoc<Record<string, unknown>>(`publicAssessments/${sanitizeEngineId(assessmentId)}`);
    if (!pubRes.exists || !pubRes.data) return null;
    const pub = pubRes.data;
    const pubQuestions = await fsListCollection<Record<string, unknown>>('publicQuestions', { pageSize: 300 }).catch(() => []);
    const matchedQs = pubQuestions.filter((q) => q.assessmentId === assessmentId);

    const nowIso = new Date().toISOString();
    const mode: AssessmentMode =
      pub.mode === 'latihan' || pub.mode === 'simulasi' ? pub.mode : 'psas';
    const examType: AssessmentType =
      pub.examType === 'latihan' ||
      pub.examType === 'ulangan_harian' ||
      pub.examType === 'sumatif' ||
      pub.examType === 'simulasi' ||
      pub.examType === 'psas'
        ? pub.examType
        : mode === 'latihan'
          ? 'latihan'
          : mode === 'simulasi'
            ? 'simulasi'
            : 'psas';

    return await mutateAssessmentState((state) => {
      const record: ExamRecord = {
        id: assessmentId,
        schoolId: String(pub.schoolId || schoolId),
        classIds: Array.isArray(pub.classIds) ? pub.classIds.map(String) : [],
        code: 'PORTAL',
        codeHash: `portal_${assessmentId}`,
        title: String(pub.title || 'Misi PSAS Adventure'),
        description: typeof pub.description === 'string' ? pub.description : undefined,
        academicYear: typeof pub.academicYear === 'string' ? pub.academicYear : '2025/2026',
        subjectId: String(pub.subjectId || 'pai'),
        worldThemeId: String(pub.worldThemeId || pub.subjectId || 'pai'),
        grade: String(pub.grade || '3'),
        semester: pub.semester === 'Genap' ? 'Genap' : 'Ganjil',
        startsAt: typeof pub.startsAt === 'string' ? pub.startsAt : undefined,
        endsAt: typeof pub.endsAt === 'string' ? pub.endsAt : undefined,
        durationMinutes: Number(pub.durationMinutes) || 30,
        maxAttempts: Number(pub.maxAttempts) || 1,
        allowMultipleSessions: pub.allowMultipleSessions === true,
        examType,
        mode,
        status: (pub.status as AssessmentStatus) || 'active',
        isLocked: pub.isLocked === true,
        isVisibleOnMap: pub.isVisibleOnMap !== false,
        showScoreToStudent: pub.showScoreToStudent === true,
        introStory: String(pub.introStory || 'Bacalah soal dengan teliti ya!'),
        totalQuestions: matchedQs.length || Number(pub.totalQuestions) || 0,
        targetQuestionCount:
          typeof pub.targetQuestionCount === 'number' ? pub.targetQuestionCount : undefined,
        checkpointInterval: Number(pub.checkpointInterval) || 3,
        kkm: 75,
        navigationMode: (pub.navigationMode as NavigationMode) || 'free',
        allowBack: pub.allowBack !== false,
        allowEditAfterAnswer: pub.allowEditAfterAnswer !== false,
        requireAnswerBeforeNext: pub.requireAnswerBeforeNext === true,
        shuffleQuestions: pub.shuffleQuestions === true,
        shuffleOptions: pub.shuffleOptions === true,
        identityMode: (pub.identityMode as ExamRecord['identityMode']) || 'roster_verify',
        audioEnabled: pub.audioEnabled !== false,
        scoringPolicy: defaultScoringPolicy(pub.scoringPolicy as Partial<ScoringPolicyRecord> | undefined),
        resultPolicy: defaultResultPolicy(
          mode,
          pub.showScoreToStudent === true,
          pub.resultPolicy as Partial<ResultPolicyRecord> | undefined
        ),
        ownerId: String(pub.ownerId || 'system'),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.exams[makeExamKey(schoolId, assessmentId)] = record;

      for (const pq of matchedQs) {
        const qId = sanitizeEngineId(String(pq.id));
        const key = makeExamQuestionKey(assessmentId, qId);
        if (!state.examQuestions[key]) {
          state.examQuestions[key] = {
            id: qId,
            schoolId: record.schoolId,
            assessmentId,
            subjectId: record.subjectId,
            order: Number(pq.order) || 1,
            type: String(pq.type || 'multiple_choice'),
            prompt: String(pq.prompt || ''),
            options: Array.isArray(pq.options) ? pq.options.map(String) : undefined,
            mediaUrl: typeof pq.mediaUrl === 'string' ? pq.mediaUrl : undefined,
            audioUrl: typeof pq.audioUrl === 'string' ? pq.audioUrl : undefined,
            audioText: typeof pq.audioText === 'string' ? pq.audioText : undefined,
            matchLeft: Array.isArray(pq.matchLeft) ? pq.matchLeft.map(String) : undefined,
            matchRight: Array.isArray(pq.matchRight) ? pq.matchRight.map(String) : undefined,
            orderingItems: Array.isArray(pq.orderingItems) ? pq.orderingItems.map(String) : undefined,
            dragItems: Array.isArray(pq.dragItems)
              ? (pq.dragItems as Array<{ id: string; label: string }>)
              : undefined,
            dragTargets: Array.isArray(pq.dragTargets)
              ? (pq.dragTargets as Array<{ id: string; label: string }>)
              : undefined,
            imageOptions: Array.isArray(pq.imageOptions)
              ? (pq.imageOptions as Array<{ id: string; label: string; imageUrl?: string; motif?: string }>)
              : undefined,
            weight: Number(pq.weight) || 10,
            topic: typeof pq.topic === 'string' ? pq.topic : undefined,
            indicator: typeof pq.indicator === 'string' ? pq.indicator : undefined,
            difficulty: (pq.difficulty as DifficultyLevel) || 'sedang',
            correctAnswer: typeof pq.practiceKey === 'string' ? pq.practiceKey : '',
            explanation: typeof pq.practiceExplanation === 'string' ? pq.practiceExplanation : undefined,
            practiceHint: typeof pq.practiceHint === 'string' ? pq.practiceHint : undefined,
            isPublished: pq.isPublished !== false,
            ownerId: String(pq.ownerId || 'system'),
            createdAt: nowIso,
            updatedAt: nowIso,
          };
        }
      }
      return record;
    });
  } catch {
    return null;
  }
}

export async function enterExamForStudentEngine(
  actor: StudentActorContext,
  requestedAssessmentId?: string
) {
  const examId = sanitizeEngineId(requestedAssessmentId || actor.assessmentId || '');
  const exam = await ensureExamLoadedFromFirestoreIfMissing(actor.schoolId, examId);
  if (!exam) {
    return {
      ok: false as const,
      status: 404,
      code: 'EXAM_NOT_FOUND',
      message: 'Data asesmen tidak ditemukan di server.',
    };
  }

  const state = getAssessmentStateSnapshot();
  const existingSessions = Object.values(state.sessions).filter(
    (s) => s.assessmentId === exam.id && s.studentId === actor.studentId && s.schoolId === actor.schoolId
  );

  const check = validateExamEligibility(exam, actor, existingSessions);
  if (check.ok === false) {
    return check;
  }

  const questionCount = Object.values(state.examQuestions).filter(
    (q) => q.assessmentId === exam.id && q.schoolId === actor.schoolId && q.isPublished !== false
  ).length;
  const effectiveCount =
    exam.targetQuestionCount && exam.targetQuestionCount > 0
      ? Math.min(exam.targetQuestionCount, questionCount)
      : questionCount;

  const worldMeta = WORLD_ADVENTURE_CATALOG.find((w) => w.subjectId === exam.subjectId);

  return {
    ok: true as const,
    examInfo: {
      examId: exam.id,
      title: exam.title,
      description: exam.description,
      subjectId: exam.subjectId,
      worldName: worldMeta?.worldName || exam.subjectId.toUpperCase(),
      subjectName: worldMeta?.subjectName || exam.subjectId,
      companionName: worldMeta?.companionName || 'Pemandu Petualangan',
      grade: exam.grade,
      semester: exam.semester,
      examType: exam.examType,
      mode: exam.mode,
      durationMinutes: exam.durationMinutes,
      questionCount: effectiveCount,
      navigationMode: exam.navigationMode,
      allowBack: exam.allowBack,
      maxAttempts: exam.maxAttempts,
      attemptNumber: check.nextAttempt,
      remainingAttempts: Math.max(0, exam.maxAttempts - existingSessions.filter((s) => s.status !== 'in_progress').length),
      hasInProgressSession: Boolean(check.activeSession),
      inProgressSessionId: check.activeSession?.id,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      introStory: exam.introStory,
      serverNowAt: new Date().toISOString(),
    },
  };
}

export async function startExamForStudentEngine(
  actor: StudentActorContext,
  requestedAssessmentId?: string,
  preferredSessionId?: string
) {
  const examId = sanitizeEngineId(requestedAssessmentId || actor.assessmentId || '');
  const exam = await ensureExamLoadedFromFirestoreIfMissing(actor.schoolId, examId);
  if (!exam) {
    return {
      ok: false as const,
      status: 404,
      code: 'EXAM_NOT_FOUND',
      message: 'Asesmen tidak ditemukan.',
    };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const res = await mutateAssessmentState((state) => {
    const existingSessions = Object.values(state.sessions).filter(
      (s) => s.assessmentId === exam.id && s.studentId === actor.studentId && s.schoolId === actor.schoolId
    );
    const check = validateExamEligibility(exam, actor, existingSessions);
    if (check.ok === false) return check;

    const allQuestions = Object.values(state.examQuestions)
      .filter((q) => q.assessmentId === exam.id && q.schoolId === actor.schoolId && q.isPublished !== false)
      .sort((a, b) => a.order - b.order);

    if (allQuestions.length === 0) {
      return {
        ok: false as const,
        status: 400,
        code: 'NO_QUESTIONS',
        message: 'Guru belum menambahkan soal ke asesmen ini.',
      };
    }

    // Resume existing active session WITHOUT resetting timer or reshuffling questions
    if (check.activeSession) {
      const ses = check.activeSession;
      if (nowMs > Date.parse(ses.deadlineAt)) {
        // Deadline elapsed while away -> auto-finalize cleanly
        return { ok: true as const, session: ses, expiredNeedsAutoSubmit: true, exam, allQuestions };
      }
      ses.lastActivityAt = nowIso;
      ses.updatedAt = nowIso;
      return { ok: true as const, session: ses, expiredNeedsAutoSubmit: false, exam, allQuestions };
    }

    let orderedQuestions = [...allQuestions];
    if (exam.shuffleQuestions) {
      orderedQuestions = shuffleArray(orderedQuestions);
    }
    if (exam.targetQuestionCount && exam.targetQuestionCount > 0 && orderedQuestions.length > exam.targetQuestionCount) {
      orderedQuestions = orderedQuestions.slice(0, exam.targetQuestionCount);
    }

    const questionOrder = orderedQuestions.map((q) => q.id);
    const optionOrderMap: Record<string, string[]> = {};
    if (exam.shuffleOptions) {
      for (const q of orderedQuestions) {
        if (
          (q.type === 'multiple_choice' || q.type === 'multiple_select') &&
          Array.isArray(q.options) &&
          q.options.length > 1
        ) {
          optionOrderMap[q.id] = shuffleArray(q.options);
        }
      }
    }

    const durationMs = Math.max(5, exam.durationMinutes) * 60 * 1000;
    let deadlineMs = nowMs + durationMs;
    if (exam.endsAt) {
      const scheduleEndMs = Date.parse(exam.endsAt);
      if (Number.isFinite(scheduleEndMs)) {
        deadlineMs = Math.min(deadlineMs, scheduleEndMs);
      }
    }
    const deadlineAt = new Date(deadlineMs).toISOString();

    const sessionId =
      check.nextAttempt === 1 && preferredSessionId
        ? sanitizeEngineId(preferredSessionId)
        : `ses_${sha256Prefix(`${exam.id}:${actor.studentId}:att${check.nextAttempt}`, 24)}`;

    const session: ExamSessionRecord = {
      id: sessionId,
      schoolId: actor.schoolId,
      assessmentId: exam.id,
      subjectId: exam.subjectId,
      classId: actor.classId,
      studentId: actor.studentId,
      mode: exam.mode,
      studentName: actor.studentName,
      gradeClass: actor.gradeClass,
      participantNumber: actor.participantNumber,
      characterId: actor.characterId,
      status: 'in_progress',
      attemptNumber: check.nextAttempt,
      currentIndex: 0,
      answeredIds: [],
      flaggedIds: [],
      questionOrder,
      optionOrderMap,
      totalQuestions: questionOrder.length,
      progressPercent: 0,
      checkpointsUnlocked: 0,
      artifactsEarned: [],
      starsEarned: 0,
      startedAt: nowIso,
      deadlineAt,
      lastActivityAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    state.sessions[sessionId] = session;
    appendExamAuditLog(state, {
      schoolId: actor.schoolId,
      examId: exam.id,
      sessionId,
      studentId: actor.studentId,
      actorId: actor.studentId,
      actorType: 'student',
      action: 'EXAM_SESSION_STARTED',
      detail: `Attempt #${check.nextAttempt}, ${questionOrder.length} soal, deadline ${deadlineAt}`,
    });

    return { ok: true as const, session, expiredNeedsAutoSubmit: false, exam, allQuestions };
  });

  if (res.ok === false) return res;

  if (res.expiredNeedsAutoSubmit) {
    const subRes = await submitStudentExamEngine(actor, res.session.id, {
      autoSubmittedByTimeout: true,
    });
    return {
      ok: false as const,
      status: 409,
      code: 'SESSION_EXPIRED_AUTO_SUBMITTED',
      message: 'Waktu ujian telah habis dan jawabanmu sudah dikumpulkan otomatis.',
      submission: subRes.ok ? subRes.result : undefined,
    };
  }

  return buildSessionPayloadResult(actor, res.session, res.exam, res.allQuestions);
}

function buildSessionPayloadResult(
  actor: StudentActorContext,
  session: ExamSessionRecord,
  exam: ExamRecord,
  allQuestions: ExamQuestionRecord[]
) {
  const state = getAssessmentStateSnapshot();
  const qMap = new Map(allQuestions.map((q) => [q.id, q]));
  const orderedSafeQuestions = session.questionOrder
    .map((qId) => qMap.get(qId))
    .filter((q): q is ExamQuestionRecord => Boolean(q))
    .map((q) => sanitizeQuestionForStudent(q, exam, session.optionOrderMap[q.id]));

  const savedAnswers: Record<string, string> = {};
  for (const qId of session.questionOrder) {
    const ans = state.answers[makeAnswerKey(session.id, qId)];
    if (ans && ans.answerValue) {
      savedAnswers[qId] = ans.answerValue;
    }
  }

  const nowMs = Date.now();
  const remainingSeconds = Math.max(0, Math.floor((Date.parse(session.deadlineAt) - nowMs) / 1000));

  return {
    ok: true as const,
    serverNowAt: new Date(nowMs).toISOString(),
    remainingSeconds,
    session: {
      ...session,
      serverNowAt: new Date(nowMs).toISOString(),
    },
    exam: {
      id: exam.id,
      title: exam.title,
      subjectId: exam.subjectId,
      examType: exam.examType,
      mode: exam.mode,
      durationMinutes: exam.durationMinutes,
      navigationMode: exam.navigationMode,
      allowBack: exam.allowBack,
      allowEditAfterAnswer: exam.allowEditAfterAnswer,
      requireAnswerBeforeNext: exam.requireAnswerBeforeNext,
      audioEnabled: exam.audioEnabled,
      resultPolicy: exam.resultPolicy,
    },
    questions: orderedSafeQuestions,
    savedAnswers,
    flaggedIds: session.flaggedIds || [],
  };
}

export async function getStudentSessionPayloadEngine(actor: StudentActorContext, sessionId: string) {
  const cleanId = sanitizeEngineId(sessionId);
  const state = getAssessmentStateSnapshot();
  const session = state.sessions[cleanId];
  if (!session) {
    return { ok: false as const, status: 404, code: 'SESSION_NOT_FOUND', message: 'Sesi ujian tidak ditemukan.' };
  }
  if (session.studentId !== actor.studentId || session.schoolId !== actor.schoolId) {
    return {
      ok: false as const,
      status: 403,
      code: 'CROSS_STUDENT_DENIED',
      message: 'Sesi ujian ini bukan milik akun siswa ini.',
    };
  }

  const exam = await ensureExamLoadedFromFirestoreIfMissing(actor.schoolId, session.assessmentId);
  if (!exam) {
    return { ok: false as const, status: 404, code: 'EXAM_NOT_FOUND', message: 'Data ujian tidak ditemukan.' };
  }

  if (session.status === 'in_progress' && Date.now() > Date.parse(session.deadlineAt)) {
    const submitted = await submitStudentExamEngine(actor, cleanId, { autoSubmittedByTimeout: true });
    return {
      ok: false as const,
      status: 409,
      code: 'SESSION_EXPIRED_AUTO_SUBMITTED',
      message: 'Waktu pengerjaan telah berakhir dan jawaban tersimpan sudah dikumpulkan otomatis.',
      submission: submitted.ok ? submitted.result : undefined,
    };
  }

  const latestState = getAssessmentStateSnapshot();
  const allQuestions = Object.values(latestState.examQuestions).filter(
    (q) => q.assessmentId === exam.id && q.schoolId === actor.schoolId
  );

  return buildSessionPayloadResult(actor, session, exam, allQuestions);
}

export async function saveStudentAnswerEngine(
  actor: StudentActorContext,
  sessionId: string,
  input: { questionId: string; answerValue: string; currentIndex?: number }
) {
  const cleanSessionId = sanitizeEngineId(sessionId);
  const cleanQuestionId = sanitizeEngineId(input.questionId);
  const answerValue = typeof input.answerValue === 'string' ? input.answerValue.slice(0, 4000) : '';
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Check if deadline expired cleanly first
  const snap = getAssessmentStateSnapshot();
  const preSes = snap.sessions[cleanSessionId];
  if (!preSes) {
    return { ok: false as const, status: 404, code: 'SESSION_NOT_FOUND', message: 'Sesi ujian tidak ditemukan.' };
  }
  if (preSes.studentId !== actor.studentId || preSes.schoolId !== actor.schoolId) {
    return { ok: false as const, status: 403, code: 'CROSS_STUDENT_DENIED', message: 'Akses sesi ditolak.' };
  }
  if (preSes.status !== 'in_progress') {
    return {
      ok: false as const,
      status: 409,
      code: 'SESSION_ALREADY_SUBMITTED',
      message: 'Ujian sudah dikumpulkan sehingga jawaban tidak dapat diubah lagi.',
    };
  }
  // Allow 3s network in-flight tolerance
  if (nowMs > Date.parse(preSes.deadlineAt) + 3000) {
    await submitStudentExamEngine(actor, cleanSessionId, { autoSubmittedByTimeout: true });
    return {
      ok: false as const,
      status: 409,
      code: 'DEADLINE_EXCEEDED',
      message: 'Batas waktu ujian sudah berakhir. Jawaban tersimpan sebelum batas waktu telah dikumpulkan.',
    };
  }

  return mutateAssessmentState((state) => {
    const ses = state.sessions[cleanSessionId];
    if (!ses || ses.status !== 'in_progress') {
      return {
        ok: false as const,
        status: 409,
        code: 'SESSION_ALREADY_SUBMITTED',
        message: 'Ujian sudah ditutup.',
      };
    }

    if (!ses.questionOrder.includes(cleanQuestionId)) {
      return {
        ok: false as const,
        status: 400,
        code: 'QUESTION_NOT_IN_SESSION',
        message: 'Soal tidak terdaftar dalam sesi ujian ini.',
      };
    }

    const q = state.examQuestions[makeExamQuestionKey(ses.assessmentId, cleanQuestionId)];
    const ansKey = makeAnswerKey(cleanSessionId, cleanQuestionId);
    const isAnswered = answerValue.trim().length > 0 && answerValue !== '[]' && answerValue !== '{}';

    state.answers[ansKey] = {
      id: ansKey,
      schoolId: actor.schoolId,
      sessionId: cleanSessionId,
      assessmentId: ses.assessmentId,
      studentId: actor.studentId,
      questionId: cleanQuestionId,
      questionPromptSnapshot: q?.prompt,
      questionWeightSnapshot: q?.weight,
      answerValue,
      isAnswered,
      answeredAt: state.answers[ansKey]?.answeredAt || nowIso,
      updatedAt: nowIso,
    };

    const answeredSet = new Set(ses.answeredIds || []);
    if (isAnswered) answeredSet.add(cleanQuestionId);
    else answeredSet.delete(cleanQuestionId);

    ses.answeredIds = Array.from(answeredSet);
    if (typeof input.currentIndex === 'number' && input.currentIndex >= 0) {
      ses.currentIndex = Math.min(Math.max(0, ses.totalQuestions - 1), Math.floor(input.currentIndex));
    }
    ses.progressPercent =
      ses.totalQuestions > 0 ? Math.min(100, Math.round((ses.answeredIds.length / ses.totalQuestions) * 100)) : 0;
    ses.lastActivityAt = nowIso;
    ses.lastSavedAt = nowIso;
    ses.updatedAt = nowIso;

    return {
      ok: true as const,
      savedAt: nowIso,
      serverNowAt: nowIso,
      answeredIds: ses.answeredIds,
      progressPercent: ses.progressPercent,
    };
  });
}

export async function toggleStudentQuestionFlagEngine(
  actor: StudentActorContext,
  sessionId: string,
  questionId: string,
  flagged?: boolean
) {
  const cleanSessionId = sanitizeEngineId(sessionId);
  const cleanQuestionId = sanitizeEngineId(questionId);
  const nowIso = new Date().toISOString();

  return mutateAssessmentState((state) => {
    const ses = state.sessions[cleanSessionId];
    if (!ses) {
      return { ok: false as const, status: 404, code: 'SESSION_NOT_FOUND', message: 'Sesi ujian tidak ditemukan.' };
    }
    if (ses.studentId !== actor.studentId || ses.schoolId !== actor.schoolId) {
      return { ok: false as const, status: 403, code: 'CROSS_STUDENT_DENIED', message: 'Akses sesi ditolak.' };
    }
    if (ses.status !== 'in_progress') {
      return { ok: false as const, status: 409, code: 'SESSION_ALREADY_SUBMITTED', message: 'Ujian sudah dikumpulkan.' };
    }

    const flagSet = new Set(ses.flaggedIds || []);
    const nextFlag = typeof flagged === 'boolean' ? flagged : !flagSet.has(cleanQuestionId);
    if (nextFlag) flagSet.add(cleanQuestionId);
    else flagSet.delete(cleanQuestionId);

    ses.flaggedIds = Array.from(flagSet);
    ses.lastActivityAt = nowIso;
    ses.updatedAt = nowIso;

    return { ok: true as const, flaggedIds: ses.flaggedIds };
  });
}

export async function getStudentSessionStatusEngine(actor: StudentActorContext, sessionId: string) {
  const cleanSessionId = sanitizeEngineId(sessionId);
  const state = getAssessmentStateSnapshot();
  const ses = state.sessions[cleanSessionId];
  if (!ses) {
    return { ok: false as const, status: 404, code: 'SESSION_NOT_FOUND', message: 'Sesi ujian tidak ditemukan.' };
  }
  if (ses.studentId !== actor.studentId || ses.schoolId !== actor.schoolId) {
    return { ok: false as const, status: 403, code: 'CROSS_STUDENT_DENIED', message: 'Akses sesi ditolak.' };
  }

  const nowMs = Date.now();
  const deadlineMs = Date.parse(ses.deadlineAt);
  let submissionSummary: unknown = undefined;

  if (ses.status === 'in_progress' && Number.isFinite(deadlineMs) && nowMs > deadlineMs) {
    const autoSub = await submitStudentExamEngine(actor, cleanSessionId, { autoSubmittedByTimeout: true });
    if (autoSub.ok) {
      submissionSummary = autoSub.result;
    }
  } else if (ses.status !== 'in_progress') {
    const existingSub = state.submissions[cleanSessionId];
    const exam = state.exams[makeExamKey(actor.schoolId, ses.assessmentId)];
    if (existingSub && exam) {
      submissionSummary = sanitizeSubmissionForStudent(existingSub, exam);
    }
  }

  const latestSes = getAssessmentStateSnapshot().sessions[cleanSessionId] || ses;
  return {
    ok: true as const,
    sessionId: cleanSessionId,
    status: latestSes.status,
    serverNowAt: new Date(Date.now()).toISOString(),
    deadlineAt: latestSes.deadlineAt,
    remainingSeconds: Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)),
    answeredCount: latestSes.answeredIds?.length || 0,
    flaggedCount: latestSes.flaggedIds?.length || 0,
    totalQuestions: latestSes.totalQuestions,
    autoSubmittedByTimeout: latestSes.autoSubmittedByTimeout === true,
    submissionSummary,
  };
}

function sanitizeSubmissionForStudent(sub: ExamSubmissionRecord, exam: ExamRecord) {
  const policy = exam.resultPolicy;
  const isWaitingEssay = sub.needsManualReview && sub.gradingStatus === 'waiting_essay_grading';

  // Wait for manual grading if essay still pending OR teacher hides score
  const canShowNumericScore =
    policy.showScoreToStudent &&
    policy.releasePolicy !== 'score_hidden' &&
    (!isWaitingEssay || policy.releasePolicy === 'immediately_after_submit');

  // Strict security: never leak numeric finalScore when essays are pending manual grading!
  const effectiveScoreAllowed = canShowNumericScore && !isWaitingEssay;

  const state = getAssessmentStateSnapshot();
  const reviewItems =
    exam.mode === 'latihan' && (policy.showCorrectAnswer || policy.showExplanation)
      ? Object.values(state.examQuestions)
          .filter((q) => q.assessmentId === exam.id)
          .sort((a, b) => a.order - b.order)
          .map((q) => ({
            questionId: q.id,
            prompt: q.prompt,
            outcome: sub.questionOutcomes[q.id],
            ...(policy.showCorrectAnswer ? { correctAnswer: q.correctAnswer } : {}),
            ...(policy.showExplanation && q.explanation ? { explanation: q.explanation } : {}),
          }))
      : undefined;

  return {
    submissionId: sub.submissionId,
    sessionId: sub.sessionId,
    assessmentId: sub.assessmentId,
    assessmentTitle: sub.assessmentTitle,
    subjectId: sub.subjectId,
    examMode: sub.examMode,
    examType: sub.examType,
    isOfficialScore: sub.isOfficialScore,
    attemptNumber: sub.attemptNumber,
    gradingStatus: sub.gradingStatus,
    needsManualReview: sub.needsManualReview,
    scoreVisible: effectiveScoreAllowed,
    finalScore: effectiveScoreAllowed ? sub.finalScore : null,
    objectiveScore: effectiveScoreAllowed ? sub.objectiveScore : null,
    correctCount: effectiveScoreAllowed ? sub.correctCount : null,
    wrongCount: effectiveScoreAllowed ? sub.wrongCount : null,
    unansweredCount: sub.unansweredCount,
    durationSeconds: sub.durationSeconds,
    submittedAt: sub.submittedAt,
    statusLabel: isWaitingEssay
      ? 'Menunggu Penilaian Uraian'
      : effectiveScoreAllowed
        ? 'Nilai Sudah Tersedia'
        : 'Jawaban Tersimpan oleh Guru',
    celebration: sub.celebration,
    ...(reviewItems ? { reviewItems } : {}),
  };
}

export async function submitStudentExamEngine(
  actor: StudentActorContext,
  sessionId: string,
  options?: {
    pendingAnswers?: Array<{ questionId: string; answerValue: string }>;
    autoSubmittedByTimeout?: boolean;
  }
) {
  const cleanSessionId = sanitizeEngineId(sessionId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // First check idempotency before mutating
  const snap = getAssessmentStateSnapshot();
  const existingSession = snap.sessions[cleanSessionId];
  if (!existingSession) {
    return { ok: false as const, status: 404, code: 'SESSION_NOT_FOUND', message: 'Sesi ujian tidak ditemukan.' };
  }
  if (existingSession.studentId !== actor.studentId || existingSession.schoolId !== actor.schoolId) {
    return { ok: false as const, status: 403, code: 'CROSS_STUDENT_DENIED', message: 'Akses sesi ditolak.' };
  }

  const exam = await ensureExamLoadedFromFirestoreIfMissing(actor.schoolId, existingSession.assessmentId);
  if (!exam) {
    return { ok: false as const, status: 404, code: 'EXAM_NOT_FOUND', message: 'Data ujian tidak ditemukan.' };
  }

  // Idempotent replay if already submitted
  if (snap.submissions[cleanSessionId] || existingSession.status !== 'in_progress') {
    const sub = snap.submissions[cleanSessionId];
    return {
      ok: true as const,
      alreadySubmitted: true,
      result: sub ? sanitizeSubmissionForStudent(sub, exam) : null,
      rawSubmission: sub || null,
    };
  }

  const mutationResult = await mutateAssessmentState((state) => {
    const ses = state.sessions[cleanSessionId];
    if (!ses) {
      return { ok: false as const, status: 404, code: 'SESSION_NOT_FOUND', message: 'Sesi tidak ditemukan.' };
    }
    if (state.submissions[cleanSessionId] || ses.status !== 'in_progress') {
      return {
        ok: true as const,
        alreadySubmitted: true,
        submission: state.submissions[cleanSessionId],
      };
    }

    const deadlineMs = Date.parse(ses.deadlineAt);
    const isTimeout = options?.autoSubmittedByTimeout === true || (Number.isFinite(deadlineMs) && nowMs > deadlineMs);

    // Accept final pending answers only if within 5s grace window of deadline
    if (Array.isArray(options?.pendingAnswers) && (!Number.isFinite(deadlineMs) || nowMs <= deadlineMs + 5000)) {
      const answeredSet = new Set(ses.answeredIds || []);
      for (const item of options.pendingAnswers) {
        if (!item?.questionId || !ses.questionOrder.includes(item.questionId)) continue;
        const ansKey = makeAnswerKey(cleanSessionId, item.questionId);
        const val = typeof item.answerValue === 'string' ? item.answerValue.slice(0, 4000) : '';
        const isAns = val.trim().length > 0 && val !== '[]' && val !== '{}';
        const q = state.examQuestions[makeExamQuestionKey(ses.assessmentId, item.questionId)];
        state.answers[ansKey] = {
          id: ansKey,
          schoolId: actor.schoolId,
          sessionId: cleanSessionId,
          assessmentId: ses.assessmentId,
          studentId: actor.studentId,
          questionId: item.questionId,
          questionPromptSnapshot: q?.prompt,
          questionWeightSnapshot: q?.weight,
          answerValue: val,
          isAnswered: isAns,
          answeredAt: state.answers[ansKey]?.answeredAt || nowIso,
          updatedAt: nowIso,
        };
        if (isAns) answeredSet.add(item.questionId);
      }
      ses.answeredIds = Array.from(answeredSet);
    }

    const orderedQuestions = ses.questionOrder
      .map((qId) => state.examQuestions[makeExamQuestionKey(ses.assessmentId, qId)])
      .filter((q): q is ExamQuestionRecord => Boolean(q));

    const answersMap = new Map<string, { answerValue: string; isAnswered: boolean }>();
    for (const q of orderedQuestions) {
      const a = state.answers[makeAnswerKey(cleanSessionId, q.id)];
      if (a) answersMap.set(q.id, { answerValue: a.answerValue, isAnswered: a.isAnswered });
    }

    const metrics = computeSubmissionMetrics(orderedQuestions, answersMap, {}, exam.scoringPolicy);
    const startMs = Date.parse(ses.startedAt);
    const durationSeconds = Number.isFinite(startMs) ? Math.max(0, Math.round((nowMs - startMs) / 1000)) : 0;

    ses.status = metrics.needsManualReview ? 'submitted' : 'graded';
    ses.submittedAt = nowIso;
    ses.autoSubmittedByTimeout = isTimeout;
    ses.progressPercent = 100;
    ses.lastActivityAt = nowIso;
    ses.updatedAt = nowIso;

    const submission: ExamSubmissionRecord = {
      submissionId: cleanSessionId,
      sessionId: cleanSessionId,
      schoolId: actor.schoolId,
      assessmentId: exam.id,
      assessmentTitle: exam.title,
      subjectId: exam.subjectId,
      classId: actor.classId,
      studentId: actor.studentId,
      studentName: ses.studentName,
      gradeClass: ses.gradeClass,
      participantNumber: ses.participantNumber,
      examMode: exam.mode,
      examType: exam.examType,
      attemptNumber: ses.attemptNumber,
      isOfficialScore: isOfficialAssessmentType(exam.examType, exam.mode),
      gradingStatus: metrics.gradingStatus,
      objectiveScore: metrics.objectiveScore,
      finalScore: metrics.finalScore,
      earnedPoints: metrics.earnedPoints,
      maxPoints: metrics.maxPoints,
      correctCount: metrics.correctCount,
      wrongCount: metrics.wrongCount,
      unansweredCount: metrics.unansweredCount,
      needsManualReview: metrics.needsManualReview,
      manualScores: {},
      essayGrading: {},
      questionOutcomes: metrics.questionOutcomes,
      auditTrail: [
        {
          action: isTimeout ? 'AUTO_SUBMITTED_TIMEOUT' : 'STUDENT_SUBMITTED',
          actorId: actor.studentId,
          actorName: ses.studentName,
          detail: `Objektif=${metrics.objectiveScore}, MenungguUraian=${metrics.needsManualReview}`,
          at: nowIso,
        },
      ],
      durationSeconds,
      showToStudent: exam.resultPolicy.showScoreToStudent && !metrics.needsManualReview,
      gradedBy: 'backend_scoring_engine',
      startedAt: ses.startedAt,
      submittedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    state.submissions[cleanSessionId] = submission;
    appendExamAuditLog(state, {
      schoolId: actor.schoolId,
      examId: exam.id,
      sessionId: cleanSessionId,
      studentId: actor.studentId,
      actorId: actor.studentId,
      actorType: 'student',
      action: isTimeout ? 'EXAM_AUTO_SUBMITTED' : 'EXAM_SUBMITTED',
      detail: `Attempt #${ses.attemptNumber}, objectiveScore=${metrics.objectiveScore}, official=${submission.isOfficialScore}`,
    });

    return { ok: true as const, alreadySubmitted: false, submission };
  });

  if (mutationResult.ok === false) return mutationResult;
  if (mutationResult.alreadySubmitted) {
    const sub = mutationResult.submission;
    return {
      ok: true as const,
      alreadySubmitted: true,
      result: sub ? sanitizeSubmissionForStudent(sub, exam) : null,
      rawSubmission: sub || null,
    };
  }

  // Stage 2 & 5 Adventure Integration: Idempotent XP, Level, Badge & World Progress update!
  // Only called once on genuine first submission. Never deducts XP or locks worlds on low scores.
  const celebration = await recordExamCompletedHook(actor, exam.id, exam.subjectId, exam.mode);

  await mutateAssessmentState((state) => {
    const sub = state.submissions[cleanSessionId];
    if (sub) {
      sub.celebration = celebration;
    }
  });

  const finalSub = getAssessmentStateSnapshot().submissions[cleanSessionId];
  return {
    ok: true as const,
    alreadySubmitted: false,
    result: sanitizeSubmissionForStudent(finalSub, exam),
    rawSubmission: finalSub,
  };
}

// =========================================================================
// 4. RESULTS, MANUAL ESSAY GRADING & STUDENT RESULTS VIEW
// =========================================================================

export function getTeacherExamResultsEngine(schoolId: string, examId: string) {
  const state = getAssessmentStateSnapshot();
  const exam = state.exams[makeExamKey(schoolId, examId)];
  const submissions = Object.values(state.submissions)
    .filter((sub) => sub.schoolId === schoolId && sub.assessmentId === examId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return {
    exam,
    isOfficialRecap: exam ? isOfficialAssessmentType(exam.examType, exam.mode) : true,
    submissions,
  };
}

export function getSubmissionDetailForTeacherEngine(schoolId: string, submissionId: string) {
  const state = getAssessmentStateSnapshot();
  const cleanId = sanitizeEngineId(submissionId);
  const sub = state.submissions[cleanId];
  if (!sub || sub.schoolId !== schoolId) return null;

  const exam = state.exams[makeExamKey(schoolId, sub.assessmentId)] || null;
  const session = state.sessions[sub.sessionId] || null;
  const questionOrder = session?.questionOrder || [];
  const questions = Object.values(state.examQuestions)
    .filter((q) => q.assessmentId === sub.assessmentId && q.schoolId === schoolId)
    .sort((a, b) => {
      const ia = questionOrder.indexOf(a.id);
      const ib = questionOrder.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      return a.order - b.order;
    });

  const answers: Record<string, { answerValue: string; isAnswered: boolean; updatedAt: string }> = {};
  for (const q of questions) {
    const a = state.answers[makeAnswerKey(sub.sessionId, q.id)];
    if (a) {
      answers[q.id] = { answerValue: a.answerValue, isAnswered: a.isAnswered, updatedAt: a.updatedAt };
    }
  }

  return {
    submission: sub,
    exam,
    session,
    questions,
    answers,
  };
}

export async function gradeEssaySubmissionEngine(
  staff: StaffActor,
  submissionId: string,
  grades: Array<{ questionId: string; score: number; comment?: string }>
): Promise<
  | { ok: true; submission: ExamSubmissionRecord }
  | { ok: false; status: number; code: string; message: string }
> {
  const cleanId = sanitizeEngineId(submissionId);
  const nowIso = new Date().toISOString();

  return mutateAssessmentState((state) => {
    const sub = state.submissions[cleanId];
    if (!sub || sub.schoolId !== staff.schoolId) {
      return { ok: false, status: 404, code: 'SUBMISSION_NOT_FOUND', message: 'Data pengiriman tidak ditemukan.' };
    }
    const exam = state.exams[makeExamKey(staff.schoolId, sub.assessmentId)];
    if (!exam) {
      return { ok: false, status: 404, code: 'EXAM_NOT_FOUND', message: 'Asesmen tidak ditemukan.' };
    }

    const ses = state.sessions[sub.sessionId];
    const qOrder = ses?.questionOrder || [];
    const orderedQuestions = Object.values(state.examQuestions)
      .filter((q) => q.assessmentId === sub.assessmentId && q.schoolId === staff.schoolId)
      .filter((q) => (qOrder.length > 0 ? qOrder.includes(q.id) : true))
      .sort((a, b) => a.order - b.order);

    const nextManualScores = { ...(sub.manualScores || {}) };
    const nextEssayGrading: Record<string, EssayGradingRecord> = { ...(sub.essayGrading || {}) };
    const newAuditEntries: ExamAuditTrailRecord[] = [];

    for (const g of grades) {
      const q = orderedQuestions.find((item) => item.id === g.questionId);
      if (!q) {
        return {
          ok: false,
          status: 400,
          code: 'QUESTION_NOT_FOUND',
          message: `Soal ${g.questionId} tidak ditemukan dalam asesmen.`,
        };
      }
      const maxWeight = typeof q.weight === 'number' && q.weight >= 0 ? q.weight : 10;
      if (typeof g.score !== 'number' || !Number.isFinite(g.score) || g.score < 0 || g.score > maxWeight) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_ESSAY_SCORE',
          message: `Skor uraian harus di antara 0 dan bobot maksimal (${maxWeight}).`,
        };
      }
      const cleanScore = Math.round(g.score * 100) / 100;
      const comment = typeof g.comment === 'string' ? g.comment.trim().slice(0, 1000) : '';
      nextManualScores[q.id] = cleanScore;
      nextEssayGrading[q.id] = {
        questionId: q.id,
        score: cleanScore,
        maxScore: maxWeight,
        comment,
        gradedBy: staff.uid,
        gradedByName: staff.displayName,
        gradedAt: nowIso,
      };
      newAuditEntries.push({
        action: 'ESSAY_GRADED',
        actorId: staff.uid,
        actorName: staff.displayName,
        detail: `Soal ${q.id}: skor ${cleanScore}/${maxWeight}${comment ? ` · Catatan: ${comment}` : ''}`,
        at: nowIso,
      });
    }

    const answersMap = new Map<string, { answerValue: string; isAnswered: boolean }>();
    for (const q of orderedQuestions) {
      const a = state.answers[makeAnswerKey(sub.sessionId, q.id)];
      if (a) answersMap.set(q.id, { answerValue: a.answerValue, isAnswered: a.isAnswered });
    }

    const metrics = computeSubmissionMetrics(
      orderedQuestions,
      answersMap,
      nextManualScores,
      exam.scoringPolicy
    );

    sub.manualScores = nextManualScores;
    sub.essayGrading = nextEssayGrading;
    sub.questionOutcomes = metrics.questionOutcomes;
    sub.earnedPoints = metrics.earnedPoints;
    sub.maxPoints = metrics.maxPoints;
    sub.objectiveScore = metrics.objectiveScore;
    sub.finalScore = metrics.finalScore;
    sub.correctCount = metrics.correctCount;
    sub.wrongCount = metrics.wrongCount;
    sub.unansweredCount = metrics.unansweredCount;
    sub.needsManualReview = metrics.needsManualReview;
    sub.gradingStatus = metrics.gradingStatus;
    sub.gradedBy = staff.uid;
    sub.showToStudent = exam.resultPolicy.showScoreToStudent && !metrics.needsManualReview;
    sub.auditTrail = [...(sub.auditTrail || []), ...newAuditEntries].slice(-100);
    sub.updatedAt = nowIso;

    if (ses) {
      ses.status = metrics.needsManualReview ? 'submitted' : 'graded';
      ses.updatedAt = nowIso;
    }

    appendExamAuditLog(state, {
      schoolId: staff.schoolId,
      examId: sub.assessmentId,
      sessionId: sub.sessionId,
      studentId: sub.studentId,
      actorId: staff.uid,
      actorType: staff.role,
      action: 'TEACHER_ESSAY_GRADED',
      detail: `Final=${sub.finalScore}, status=${sub.gradingStatus}`,
    });

    return { ok: true, submission: sub };
  });
}

export function getStudentResultsHistoryEngine(actor: StudentActorContext) {
  const state = getAssessmentStateSnapshot();
  const submissions = Object.values(state.submissions)
    .filter((sub) => sub.schoolId === actor.schoolId && sub.studentId === actor.studentId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return submissions.map((sub) => {
    const exam = state.exams[makeExamKey(actor.schoolId, sub.assessmentId)];
    if (!exam) {
      return {
        submissionId: sub.submissionId,
        assessmentId: sub.assessmentId,
        assessmentTitle: sub.assessmentTitle,
        subjectId: sub.subjectId,
        examMode: sub.examMode,
        examType: sub.examType,
        isOfficialScore: sub.isOfficialScore,
        gradingStatus: sub.gradingStatus,
        needsManualReview: sub.needsManualReview,
        scoreVisible: false,
        finalScore: null,
        submittedAt: sub.submittedAt,
        statusLabel: sub.needsManualReview ? 'Menunggu Penilaian Uraian' : 'Jawaban Tersimpan oleh Guru',
      };
    }
    return sanitizeSubmissionForStudent(sub, exam);
  });
}
