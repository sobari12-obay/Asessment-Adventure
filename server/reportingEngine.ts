import {
  getAssessmentStateSnapshot,
  type ExamQuestionRecord,
  type ExamRecord,
  type ExamSessionRecord,
  type ExamSubmissionRecord,
  type QuestionOutcomeRecord,
} from './assessmentStore.js';
import { getAdventureStateSnapshot } from './adventureStore.js';

export type AttemptPolicy = 'best' | 'latest' | 'first' | 'all_attempts';
export type ReportScope = 'official' | 'practice' | 'all';
export type CompletionStatusFilter = 'all' | 'final' | 'waiting_essay';

export const ATTEMPT_POLICY_LABELS: Record<AttemptPolicy, string> = {
  best: 'Nilai Terbaik per Siswa & Asesmen (Terbaru jika seri)',
  latest: 'Percobaan Terbaru per Siswa & Asesmen',
  first: 'Percobaan Pertama per Siswa & Asesmen',
  all_attempts: 'Semua Percobaan Ditampilkan Tanpa Deduplikasi',
};

export const SUBJECT_NAME_MAP: Record<string, string> = {
  pai: 'PAI',
  pancasila: 'Pendidikan Pancasila',
  bahasa_indonesia: 'Bahasa Indonesia',
  matematika: 'Matematika',
  ipas: 'IPAS',
  seni_rupa: 'Seni Rupa',
  pjok: 'PJOK',
  bahasa_inggris: 'Bahasa Inggris',
  bahasa_sunda: 'Bahasa Sunda',
  bahasa_cirebon: 'Bahasa Cirebon',
};

export function getSubjectDisplayName(subjectId: string): string {
  return SUBJECT_NAME_MAP[subjectId] || subjectId || 'Umum';
}

export interface ClientRosterStudent {
  id: string;
  schoolId?: string;
  classId?: string;
  gradeClass: string;
  name: string;
  participantNumber?: string;
  isActive?: boolean;
}

export interface ClientClassRoom {
  id: string;
  schoolId?: string;
  name: string;
  grade?: string;
  isActive?: boolean;
}

export interface ClientAssessmentInput {
  id: string;
  schoolId?: string;
  title: string;
  subjectId: string;
  mode?: string;
  examType?: string;
  kkm?: number;
  status?: string;
}

export interface ClientQuestionInput {
  id: string;
  assessmentId?: string;
  schoolId?: string;
  order?: number;
  type: string;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  weight?: number;
  topic?: string;
  indicator?: string;
}

export interface ClientResultInput {
  id?: string;
  sessionId?: string;
  schoolId?: string;
  assessmentId: string;
  assessmentTitle?: string;
  subjectId?: string;
  classId?: string;
  studentId?: string;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  examMode?: string;
  examType?: string;
  attemptNumber?: number;
  isOfficialScore?: boolean;
  gradingStatus?:
    | 'auto_final'
    | 'waiting_essay_review'
    | 'auto_graded'
    | 'waiting_essay_grading'
    | 'finalized';
  objectiveScore?: number;
  finalScore: number;
  earnedPoints?: number;
  maxPoints?: number;
  correctCount?: number;
  wrongCount?: number;
  unansweredCount?: number;
  needsManualReview?: boolean;
  durationSeconds?: number;
  startedAt?: string;
  submittedAt?: string;
  questionOutcomes?: Record<string, QuestionOutcomeRecord>;
  answers?: Array<{ questionId: string; answerValue: string; isAnswered?: boolean }>;
}

export interface ClientSessionAnswerInput {
  sessionId: string;
  answers?: Record<string, { questionId: string; answerValue: string; isAnswered?: boolean }>;
}

export interface ReportingFilters {
  scope?: ReportScope;
  classFilter?: string;
  subjectFilter?: string;
  assessmentFilter?: string;
  completionStatus?: CompletionStatusFilter;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  attemptPolicy?: AttemptPolicy;
  defaultKkm?: number;
}

export interface NormalizedSubmissionRow {
  submissionId: string;
  sessionId: string;
  schoolId: string;
  assessmentId: string;
  assessmentTitle: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  studentId: string;
  studentIdentityKey: string;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  examMode: string;
  examType: string;
  isOfficialScore: boolean;
  attemptNumber: number;
  gradingStatus: 'auto_final' | 'waiting_essay_review' | 'finalized';
  isFinalized: boolean;
  objectiveScore: number;
  finalScore: number;
  earnedPoints: number;
  maxPoints: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  needsManualReview: boolean;
  durationSeconds: number;
  startedAt: string;
  submittedAt: string;
  submittedDateKey: string;
  kkm: number;
  passedKkm: boolean;
  statusKetuntasan: 'Tuntas' | 'Perlu Penguatan' | 'Menunggu Koreksi Uraian';
  questionOutcomes: Record<string, QuestionOutcomeRecord>;
  answersMap: Record<string, string>;
}

export interface ClassRecapRow {
  submissionId: string;
  sessionId: string;
  studentKey: string;
  studentId: string;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  subjectId: string;
  subjectName: string;
  assessmentId: string;
  assessmentTitle: string;
  examMode: string;
  examType: string;
  isOfficialScore: boolean;
  finalScore: number;
  objectiveScore: number;
  gradingStatus: 'auto_final' | 'waiting_essay_review' | 'finalized';
  kkm: number;
  passedKkm: boolean;
  statusKetuntasan: 'Tuntas' | 'Perlu Penguatan' | 'Menunggu Koreksi Uraian';
  attemptNumber: number;
  attemptCountForPair: number;
  durationSeconds: number;
  submittedAt: string;
}

export interface SubjectRecapRow {
  subjectId: string;
  subjectName: string;
  assessmentCount: number;
  studentCount: number;
  finalizedCount: number;
  avgScore: number;
  highestScore: number;
  lowestScore: number;
  passedCount: number;
  needsFollowUpCount: number;
  passRatePercent: number;
}

export interface AssessmentRecapRow {
  assessmentId: string;
  assessmentTitle: string;
  subjectId: string;
  subjectName: string;
  examMode: string;
  examType: string;
  isOfficialScore: boolean;
  kkm: number;
  submissionCount: number;
  finalizedCount: number;
  waitingEssayCount: number;
  avgScore: number;
  highestScore: number;
  lowestScore: number;
  passedCount: number;
  needsFollowUpCount: number;
  passRatePercent: number;
}

export interface StudentIndividualReport {
  studentKey: string;
  studentId: string;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  totalAttempted: number;
  finalizedCount: number;
  waitingEssayCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passedCount: number;
  masteredSubjects: Array<{ subjectId: string; subjectName: string; averageScore: number }>;
  reinforcementTopics: Array<{
    topic: string;
    subjectName: string;
    masteryPercent: number;
    missedCount: number;
  }>;
  assessments: Array<{
    submissionId: string;
    assessmentId: string;
    assessmentTitle: string;
    subjectId: string;
    subjectName: string;
    examMode: string;
    isOfficialScore: boolean;
    finalScore: number;
    gradingStatus: string;
    statusKetuntasan: 'Tuntas' | 'Perlu Penguatan' | 'Menunggu Koreksi Uraian';
    kkm: number;
    attemptNumber: number;
    durationSeconds: number;
    submittedAt: string;
  }>;
  adventureSummary?: {
    totalXp: number;
    level: number;
    levelTitle: string;
    badgesEarnedCount: number;
    worldsCompletedCount: number;
  };
}

export interface ItemOptionDistributionRow {
  label: string;
  text: string;
  count: number;
  percent: number;
  isCorrectKey?: boolean;
}

export interface EnhancedQuestionStat {
  questionId: string;
  number: number;
  prompt: string;
  type: string;
  topic: string;
  indicator: string;
  maxPoints: number;
  respondentCount: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  unansweredCount: number;
  manualPendingCount: number;
  correctPercent: number;
  wrongPercent: number;
  unansweredPercent: number;
  empiricalDifficulty: 'Mudah' | 'Sedang' | 'Sulit' | 'Belum Cukup Data';
  needsReview: boolean;
  reviewReason?: string;
  optionDistribution: ItemOptionDistributionRow[];
}

export interface ItemAnalysisReport {
  selectedAssessmentId: string | null;
  selectedAssessmentTitle: string | null;
  subjectName: string | null;
  respondentCount: number;
  lowSampleWarning: {
    active: boolean;
    threshold: number;
    message: string;
  };
  questionStats: EnhancedQuestionStat[];
  mostDifficultQuestions: Array<{
    questionId: string;
    number: number;
    prompt: string;
    topic: string;
    correctPercent: number;
    wrongPercent: number;
  }>;
  reviewNeededQuestions: Array<{
    questionId: string;
    number: number;
    prompt: string;
    reason: string;
    correctPercent: number;
    unansweredPercent: number;
  }>;
  topicMastery: Array<{ topic: string; questionCount: number; masteryPercent: number }>;
  indicatorMastery: Array<{ indicator: string; questionCount: number; masteryPercent: number }>;
}

export interface Stage5ReportPayload {
  schoolId: string;
  generatedAt: string;
  activeScope: ReportScope;
  activeAttemptPolicy: AttemptPolicy;
  attemptPolicyLabel: string;
  availableFilters: {
    classes: string[];
    subjects: Array<{ id: string; name: string }>;
    assessments: Array<{
      id: string;
      title: string;
      subjectId: string;
      subjectName: string;
      mode: string;
      isOfficialScore: boolean;
    }>;
  };
  kpis: {
    registeredStudentsCount: number;
    hasRosterData: boolean;
    attemptedStudentsCount: number;
    notYetAttemptedCount: number;
    totalSubmissionsRaw: number;
    deduplicatedRecapCount: number;
    finalizedCount: number;
    waitingEssayCount: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    passedKkmCount: number;
    needsFollowUpCount: number;
    passRatePercent: number;
    kkm: number;
  };
  notYetAttemptedStudents: Array<{
    id: string;
    name: string;
    gradeClass: string;
    participantNumber?: string;
  }>;
  charts: {
    scoreDistribution: Array<{ label: string; count: number; percent: number }>;
    classMastery: Array<{
      gradeClass: string;
      attemptedCount: number;
      finalizedCount: number;
      avgScore: number;
      passedCount: number;
      passRatePercent: number;
    }>;
    subjectComparison: Array<{
      subjectId: string;
      subjectName: string;
      attemptCount: number;
      avgScore: number;
      passRatePercent: number;
    }>;
    historicalTrend: Array<{
      date: string;
      attemptCount: number;
      avgScore: number;
      passRatePercent: number;
    }>;
  };
  classRecapRows: ClassRecapRow[];
  subjectRecapRows: SubjectRecapRow[];
  assessmentRecapRows: AssessmentRecapRow[];
  studentReports: StudentIndividualReport[];
  itemAnalysis: ItemAnalysisReport;
  recommendations: {
    studentsEnrichment: Array<{
      studentKey: string;
      studentName: string;
      gradeClass: string;
      averageScore: number;
      passedAssessments: number;
      suggestion: string;
    }>;
    studentsRemedial: Array<{
      studentKey: string;
      studentName: string;
      gradeClass: string;
      averageScore: number;
      weakTopics: string[];
      suggestion: string;
    }>;
    weakTopics: Array<{
      topic: string;
      subjectName: string;
      masteryPercent: number;
      questionCount: number;
      suggestion: string;
    }>;
    questionsToReview: Array<{
      questionId: string;
      number: number;
      prompt: string;
      reason: string;
    }>;
  };
}

function makeStudentIdentityKey(params: {
  studentId?: string;
  participantNumber?: string;
  studentName: string;
  gradeClass: string;
}): string {
  const cleanId = params.studentId?.trim();
  if (cleanId && !cleanId.startsWith('guest_')) {
    return `id:${cleanId}`;
  }
  const cleanPart = params.participantNumber?.trim();
  if (cleanPart) {
    return `num:${cleanPart.toLowerCase()}`;
  }
  return `name:${params.gradeClass.trim().toLowerCase()}::${params.studentName.trim().toLowerCase()}`;
}

function isRowOfficial(examMode?: string, examType?: string, explicitOfficial?: boolean): boolean {
  if (typeof explicitOfficial === 'boolean') return explicitOfficial;
  const m = String(examMode || '').toLowerCase();
  const t = String(examType || '').toLowerCase();
  if (m === 'latihan' || m === 'simulasi' || t === 'latihan' || t === 'simulasi') return false;
  return true;
}

export function classifyEmpiricalDifficulty(
  correctPercent: number,
  respondentCount: number
): 'Mudah' | 'Sedang' | 'Sulit' | 'Belum Cukup Data' {
  if (respondentCount <= 0) return 'Belum Cukup Data';
  if (correctPercent >= 75) return 'Mudah';
  if (correctPercent >= 40) return 'Sedang';
  return 'Sulit';
}

export function evaluateItemReviewFlag(params: {
  respondentCount: number;
  correctPercent: number;
  unansweredPercent: number;
  optionDistribution: ItemOptionDistributionRow[];
}): { needsReview: boolean; reason?: string } {
  if (params.respondentCount < 3) {
    return { needsReview: false };
  }
  if (params.unansweredPercent >= 35) {
    return {
      needsReview: true,
      reason: `Tingkat tidak dijawab tinggi (${params.unansweredPercent}%) — periksa kejelasan instruksi/durasi soal.`,
    };
  }
  if (params.correctPercent < 25) {
    return {
      needsReview: true,
      reason: `Tingkat benar sangat rendah (${params.correctPercent}%) — verifikasi kunci jawaban & tingkat keterbacaan soal.`,
    };
  }
  const nonKeyHighDistractor = params.optionDistribution.find(
    (opt) => opt.isCorrectKey === false && opt.percent >= 45
  );
  if (nonKeyHighDistractor) {
    return {
      needsReview: true,
      reason: `Banyak siswa memilih opsi ${nonKeyHighDistractor.label} (${nonKeyHighDistractor.percent}%) — cek kemungkinan pengecoh ambigu atau kunci tertukar.`,
    };
  }
  if (params.correctPercent >= 98 && params.respondentCount >= 10) {
    return {
      needsReview: true,
      reason: `Hampir semua responden (${params.correctPercent}%) menjawab benar — pertimbangkan variasi tingkat kesulitan jika diperlukan.`,
    };
  }
  return { needsReview: false };
}

export function buildEnhancedItemAnalysis(params: {
  assessmentId: string | null;
  assessmentTitle: string | null;
  subjectName: string | null;
  questions: Array<{
    id: string;
    order?: number;
    type: string;
    prompt: string;
    options?: string[];
    correctAnswer?: string;
    weight?: number;
    topic?: string;
    indicator?: string;
  }>;
  submissions: Array<{
    finalScore: number;
    questionOutcomes?: Record<string, QuestionOutcomeRecord>;
    answersMap?: Record<string, string>;
  }>;
}): ItemAnalysisReport {
  const respondentCount = params.submissions.length;
  const lowSampleThreshold = 15;
  const sortedQuestions = [...params.questions].sort((a, b) => (a.order || 0) - (b.order || 0));

  const questionStats: EnhancedQuestionStat[] = sortedQuestions.map((q, index) => {
    let correctCount = 0;
    let partialCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;
    let manualPendingCount = 0;

    const optionCounts = new Map<string, number>();
    const rawOptions = Array.isArray(q.options) ? q.options : [];
    const letterLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    for (const sub of params.submissions) {
      const outcome = sub.questionOutcomes?.[q.id];
      if (!outcome || outcome.status === 'unanswered') {
        unansweredCount++;
      } else if (outcome.status === 'correct') {
        correctCount++;
      } else if (outcome.status === 'partial') {
        partialCount++;
      } else if (outcome.status === 'manual_pending') {
        manualPendingCount++;
      } else {
        wrongCount++;
      }

      const rawAns = sub.answersMap?.[q.id];
      if (typeof rawAns === 'string' && rawAns.trim()) {
        const cleaned = rawAns.trim();
        optionCounts.set(cleaned, (optionCounts.get(cleaned) || 0) + 1);
      }
    }

    const denom = respondentCount > 0 ? respondentCount : 1;
    const effectiveCorrect = correctCount + partialCount * 0.5;
    const correctPercent = respondentCount > 0 ? Math.round((effectiveCorrect / denom) * 100) : 0;
    const wrongPercent = respondentCount > 0 ? Math.round((wrongCount / denom) * 100) : 0;
    const unansweredPercent = respondentCount > 0 ? Math.round((unansweredCount / denom) * 100) : 0;

    let optionDistribution: ItemOptionDistributionRow[] = [];
    if (rawOptions.length > 0 && (q.type === 'multiple_choice' || q.type === 'pg' || q.type === 'multiple_select' || q.type === 'image_choice')) {
      optionDistribution = rawOptions.map((optText, optIdx) => {
        const label = letterLabels[optIdx] || String(optIdx + 1);
        let matchCount = 0;
        for (const [ansVal, cnt] of optionCounts.entries()) {
          if (
            ansVal.toLowerCase() === optText.trim().toLowerCase() ||
            ansVal.toUpperCase() === label
          ) {
            matchCount += cnt;
          }
        }
        const isCorrectKey =
          typeof q.correctAnswer === 'string' && q.correctAnswer.trim()
            ? q.correctAnswer.trim().toLowerCase() === optText.trim().toLowerCase() ||
              q.correctAnswer.trim().toUpperCase() === label
            : undefined;
        return {
          label,
          text: optText,
          count: matchCount,
          percent: respondentCount > 0 ? Math.round((matchCount / denom) * 100) : 0,
          isCorrectKey,
        };
      });
    } else if (q.type === 'true_false') {
      const tfChoices = ['Benar', 'Salah'];
      optionDistribution = tfChoices.map((choice) => {
        let matchCount = 0;
        for (const [ansVal, cnt] of optionCounts.entries()) {
          const norm = ansVal.toLowerCase();
          if (
            (choice === 'Benar' && (norm === 'benar' || norm === 'true')) ||
            (choice === 'Salah' && (norm === 'salah' || norm === 'false'))
          ) {
            matchCount += cnt;
          }
        }
        const isCorrectKey =
          typeof q.correctAnswer === 'string' && q.correctAnswer.trim()
            ? q.correctAnswer.trim().toLowerCase() === choice.toLowerCase() ||
              (choice === 'Benar' && q.correctAnswer.trim().toLowerCase() === 'true') ||
              (choice === 'Salah' && q.correctAnswer.trim().toLowerCase() === 'false')
            : undefined;
        return {
          label: choice,
          text: choice,
          count: matchCount,
          percent: respondentCount > 0 ? Math.round((matchCount / denom) * 100) : 0,
          isCorrectKey,
        };
      });
    }

    const empiricalDifficulty = classifyEmpiricalDifficulty(correctPercent, respondentCount);
    const reviewEval = evaluateItemReviewFlag({
      respondentCount,
      correctPercent,
      unansweredPercent,
      optionDistribution,
    });

    return {
      questionId: q.id,
      number: index + 1,
      prompt: q.prompt || `Soal ${index + 1}`,
      type: q.type,
      topic: q.topic?.trim() || 'Umum',
      indicator: q.indicator?.trim() || '-',
      maxPoints: typeof q.weight === 'number' && q.weight > 0 ? q.weight : 1,
      respondentCount,
      correctCount,
      partialCount,
      wrongCount,
      unansweredCount,
      manualPendingCount,
      correctPercent,
      wrongPercent,
      unansweredPercent,
      empiricalDifficulty,
      needsReview: reviewEval.needsReview,
      reviewReason: reviewEval.reason,
      optionDistribution,
    };
  });

  const topicBuckets = new Map<string, { sumPercent: number; count: number }>();
  const indicatorBuckets = new Map<string, { sumPercent: number; count: number }>();

  for (const stat of questionStats) {
    const t = topicBuckets.get(stat.topic) || { sumPercent: 0, count: 0 };
    t.sumPercent += stat.correctPercent;
    t.count += 1;
    topicBuckets.set(stat.topic, t);

    if (stat.indicator && stat.indicator !== '-') {
      const ind = indicatorBuckets.get(stat.indicator) || { sumPercent: 0, count: 0 };
      ind.sumPercent += stat.correctPercent;
      ind.count += 1;
      indicatorBuckets.set(stat.indicator, ind);
    }
  }

  const mostDifficultQuestions = [...questionStats]
    .filter((q) => q.respondentCount > 0)
    .sort((a, b) => a.correctPercent - b.correctPercent || b.wrongPercent - a.wrongPercent)
    .slice(0, 5)
    .map((q) => ({
      questionId: q.questionId,
      number: q.number,
      prompt: q.prompt,
      topic: q.topic,
      correctPercent: q.correctPercent,
      wrongPercent: q.wrongPercent,
    }));

  const reviewNeededQuestions = questionStats
    .filter((q) => q.needsReview && q.reviewReason)
    .map((q) => ({
      questionId: q.questionId,
      number: q.number,
      prompt: q.prompt,
      reason: q.reviewReason!,
      correctPercent: q.correctPercent,
      unansweredPercent: q.unansweredPercent,
    }));

  const lowSampleActive = respondentCount > 0 && respondentCount < lowSampleThreshold;
  const lowSampleMessage =
    respondentCount === 0
      ? 'Belum ada responden tersimpan pada asesmen terpilih untuk dianalisis.'
      : lowSampleActive
        ? `Jumlah responden saat ini ${respondentCount} siswa (< ${lowSampleThreshold}). Tingkat kesulitan empiris dan distribusi jawaban bersifat indikatif awal dan belum cukup untuk kesimpulan daya pembeda atau validitas psikometrik.`
        : `Analisis didasarkan pada ${respondentCount} responden tersimpan.`;

  return {
    selectedAssessmentId: params.assessmentId,
    selectedAssessmentTitle: params.assessmentTitle,
    subjectName: params.subjectName,
    respondentCount,
    lowSampleWarning: {
      active: lowSampleActive,
      threshold: lowSampleThreshold,
      message: lowSampleMessage,
    },
    questionStats,
    mostDifficultQuestions,
    reviewNeededQuestions,
    topicMastery: Array.from(topicBuckets.entries()).map(([topic, val]) => ({
      topic,
      questionCount: val.count,
      masteryPercent: val.count > 0 ? Math.round(val.sumPercent / val.count) : 0,
    })),
    indicatorMastery: Array.from(indicatorBuckets.entries()).map(([indicator, val]) => ({
      indicator,
      questionCount: val.count,
      masteryPercent: val.count > 0 ? Math.round(val.sumPercent / val.count) : 0,
    })),
  };
}

export function buildStage5Report(params: {
  schoolId: string;
  filters?: ReportingFilters;
  clientAssessments?: ClientAssessmentInput[];
  clientQuestions?: ClientQuestionInput[];
  clientResults?: ClientResultInput[];
  clientSessions?: ClientSessionAnswerInput[];
  clientRoster?: ClientRosterStudent[];
  clientClasses?: ClientClassRoom[];
}): Stage5ReportPayload {
  const state = getAssessmentStateSnapshot();
  const adventureState = getAdventureStateSnapshot();
  const schoolId = params.schoolId;
  const filters = params.filters || {};

  const scope: ReportScope =
    filters.scope === 'practice' || filters.scope === 'all' ? filters.scope : 'official';
  const attemptPolicy: AttemptPolicy =
    filters.attemptPolicy === 'latest' ||
    filters.attemptPolicy === 'first' ||
    filters.attemptPolicy === 'all_attempts'
      ? filters.attemptPolicy
      : 'best';
  const completionStatus: CompletionStatusFilter =
    filters.completionStatus === 'final' || filters.completionStatus === 'waiting_essay'
      ? filters.completionStatus
      : 'all';
  const defaultKkm =
    typeof filters.defaultKkm === 'number' && filters.defaultKkm >= 10 && filters.defaultKkm <= 100
      ? Math.round(filters.defaultKkm)
      : 70;

  // 1. Merge Assessments (Server Stage 3 + Client Firestore mirror)
  const examMap = new Map<
    string,
    {
      id: string;
      title: string;
      subjectId: string;
      mode: string;
      examType: string;
      kkm: number;
      isOfficial: boolean;
    }
  >();

  for (const ca of params.clientAssessments || []) {
    if (!ca || !ca.id || (ca.schoolId && ca.schoolId !== schoolId)) continue;
    const mode = ca.mode || 'psas';
    const examType = ca.examType || mode;
    examMap.set(ca.id, {
      id: ca.id,
      title: ca.title || 'Asesmen',
      subjectId: ca.subjectId || 'umum',
      mode,
      examType,
      kkm: typeof ca.kkm === 'number' && ca.kkm > 0 ? ca.kkm : defaultKkm,
      isOfficial: isRowOfficial(mode, examType),
    });
  }

  for (const srvExam of Object.values(state.exams)) {
    if (srvExam.schoolId !== schoolId) continue;
    examMap.set(srvExam.id, {
      id: srvExam.id,
      title: srvExam.title,
      subjectId: srvExam.subjectId,
      mode: srvExam.mode,
      examType: srvExam.examType,
      kkm: typeof srvExam.kkm === 'number' && srvExam.kkm > 0 ? srvExam.kkm : defaultKkm,
      isOfficial: isRowOfficial(srvExam.mode, srvExam.examType),
    });
  }

  // 2. Merge Session Answers for option distribution
  const answersBySessionId = new Map<string, Record<string, string>>();
  for (const cs of params.clientSessions || []) {
    if (!cs || !cs.sessionId || !cs.answers) continue;
    const ansMap: Record<string, string> = {};
    for (const [qId, a] of Object.entries(cs.answers)) {
      if (a && typeof a.answerValue === 'string') {
        ansMap[qId] = a.answerValue;
      }
    }
    answersBySessionId.set(cs.sessionId, ansMap);
  }

  for (const ansRec of Object.values(state.answers)) {
    if (ansRec.schoolId !== schoolId) continue;
    const existing = answersBySessionId.get(ansRec.sessionId) || {};
    if (typeof ansRec.answerValue === 'string') {
      existing[ansRec.questionId] = ansRec.answerValue;
    }
    answersBySessionId.set(ansRec.sessionId, existing);
  }

  // 3. Merge Submissions (Deduplicate by sessionId, prioritizing authoritative Stage 3 submission)
  const rawSubmissionMap = new Map<string, NormalizedSubmissionRow>();

  const buildRow = (
    input: {
      submissionId: string;
      sessionId: string;
      assessmentId: string;
      assessmentTitle?: string;
      subjectId?: string;
      classId?: string;
      studentId?: string;
      studentName: string;
      gradeClass: string;
      participantNumber?: string;
      examMode?: string;
      examType?: string;
      attemptNumber?: number;
      isOfficialScore?: boolean;
      gradingStatus?:
        | 'auto_final'
        | 'waiting_essay_review'
        | 'auto_graded'
        | 'waiting_essay_grading'
        | 'finalized';
      objectiveScore?: number;
      finalScore: number;
      earnedPoints?: number;
      maxPoints?: number;
      correctCount?: number;
      wrongCount?: number;
      unansweredCount?: number;
      needsManualReview?: boolean;
      durationSeconds?: number;
      startedAt?: string;
      submittedAt?: string;
      questionOutcomes?: Record<string, QuestionOutcomeRecord>;
      answers?: Array<{ questionId: string; answerValue: string }>;
    }
  ): NormalizedSubmissionRow => {
    const examMeta = examMap.get(input.assessmentId);
    const subjectId = input.subjectId || examMeta?.subjectId || 'umum';
    const subjectName = getSubjectDisplayName(subjectId);
    const examMode = input.examMode || examMeta?.mode || 'psas';
    const examType = input.examType || examMeta?.examType || examMode;
    const official = isRowOfficial(examMode, examType, input.isOfficialScore);
    const kkm = examMeta?.kkm || defaultKkm;
    const needsReview = Boolean(input.needsManualReview);
    const normalizedStatus =
      input.gradingStatus === 'auto_graded'
        ? 'auto_final'
        : input.gradingStatus === 'waiting_essay_grading'
          ? 'waiting_essay_review'
          : input.gradingStatus || (needsReview ? 'waiting_essay_review' : 'auto_final');
    const gradingStatus = normalizedStatus;
    const isFinalized = gradingStatus !== 'waiting_essay_review' && !needsReview;
    const finalScore = Math.max(0, Math.min(100, Math.round(Number(input.finalScore) || 0)));
    const passedKkm = isFinalized && finalScore >= kkm;
    const statusKetuntasan: NormalizedSubmissionRow['statusKetuntasan'] = !isFinalized
      ? 'Menunggu Koreksi Uraian'
      : passedKkm
        ? 'Tuntas'
        : 'Perlu Penguatan';

    const submittedAt = input.submittedAt || input.startedAt || new Date().toISOString();
    const submittedDateKey = submittedAt.slice(0, 10);

    const ansMap: Record<string, string> = {
      ...(answersBySessionId.get(input.sessionId) || {}),
    };
    if (Array.isArray(input.answers)) {
      for (const a of input.answers) {
        if (a && typeof a.questionId === 'string' && typeof a.answerValue === 'string') {
          ansMap[a.questionId] = a.answerValue;
        }
      }
    }

    const gradeClass = (input.gradeClass || '-').trim();
    const studentName = (input.studentName || 'Siswa').trim();
    const studentId = (input.studentId || '').trim();

    return {
      submissionId: input.submissionId,
      sessionId: input.sessionId,
      schoolId,
      assessmentId: input.assessmentId,
      assessmentTitle: input.assessmentTitle || examMeta?.title || input.assessmentId,
      subjectId,
      subjectName,
      classId: input.classId || gradeClass.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      studentId,
      studentIdentityKey: makeStudentIdentityKey({
        studentId,
        participantNumber: input.participantNumber,
        studentName,
        gradeClass,
      }),
      studentName,
      gradeClass,
      participantNumber: input.participantNumber,
      examMode,
      examType,
      isOfficialScore: official,
      attemptNumber: typeof input.attemptNumber === 'number' && input.attemptNumber >= 1 ? input.attemptNumber : 1,
      gradingStatus,
      isFinalized,
      objectiveScore:
        typeof input.objectiveScore === 'number' ? Math.round(input.objectiveScore) : finalScore,
      finalScore,
      earnedPoints: Number(input.earnedPoints) || 0,
      maxPoints: Number(input.maxPoints) || 0,
      correctCount: Number(input.correctCount) || 0,
      wrongCount: Number(input.wrongCount) || 0,
      unansweredCount: Number(input.unansweredCount) || 0,
      needsManualReview: needsReview,
      durationSeconds: Math.max(0, Math.round(Number(input.durationSeconds) || 0)),
      startedAt: input.startedAt || submittedAt,
      submittedAt,
      submittedDateKey,
      kkm,
      passedKkm,
      statusKetuntasan,
      questionOutcomes: input.questionOutcomes || {},
      answersMap: ansMap,
    };
  };

  for (const cr of params.clientResults || []) {
    if (!cr || (cr.schoolId && cr.schoolId !== schoolId) || !cr.assessmentId) continue;
    const sesId = cr.sessionId || cr.id || `res_${cr.assessmentId}_${cr.studentName}`;
    rawSubmissionMap.set(
      sesId,
      buildRow({
        submissionId: cr.id || sesId,
        sessionId: sesId,
        assessmentId: cr.assessmentId,
        assessmentTitle: cr.assessmentTitle,
        subjectId: cr.subjectId,
        classId: cr.classId,
        studentId: cr.studentId,
        studentName: cr.studentName,
        gradeClass: cr.gradeClass,
        participantNumber: cr.participantNumber,
        examMode: cr.examMode,
        examType: cr.examType,
        attemptNumber: cr.attemptNumber,
        isOfficialScore: cr.isOfficialScore,
        gradingStatus: cr.gradingStatus,
        objectiveScore: cr.objectiveScore,
        finalScore: cr.finalScore,
        earnedPoints: cr.earnedPoints,
        maxPoints: cr.maxPoints,
        correctCount: cr.correctCount,
        wrongCount: cr.wrongCount,
        unansweredCount: cr.unansweredCount,
        needsManualReview: cr.needsManualReview,
        durationSeconds: cr.durationSeconds,
        startedAt: cr.startedAt,
        submittedAt: cr.submittedAt,
        questionOutcomes: cr.questionOutcomes,
        answers: cr.answers,
      })
    );
  }

  for (const sub of Object.values(state.submissions)) {
    if (sub.schoolId !== schoolId) continue;
    rawSubmissionMap.set(
      sub.sessionId,
      buildRow({
        submissionId: sub.submissionId,
        sessionId: sub.sessionId,
        assessmentId: sub.assessmentId,
        assessmentTitle: sub.assessmentTitle,
        subjectId: sub.subjectId,
        classId: sub.classId,
        studentId: sub.studentId,
        studentName: sub.studentName,
        gradeClass: sub.gradeClass,
        participantNumber: sub.participantNumber,
        examMode: sub.examMode,
        examType: sub.examType,
        attemptNumber: sub.attemptNumber,
        isOfficialScore: sub.isOfficialScore,
        gradingStatus: sub.gradingStatus,
        objectiveScore: sub.objectiveScore,
        finalScore: sub.finalScore,
        earnedPoints: sub.earnedPoints,
        maxPoints: sub.maxPoints,
        correctCount: sub.correctCount,
        wrongCount: sub.wrongCount,
        unansweredCount: sub.unansweredCount,
        needsManualReview: sub.needsManualReview,
        durationSeconds: sub.durationSeconds,
        startedAt: sub.startedAt,
        submittedAt: sub.submittedAt,
        questionOutcomes: sub.questionOutcomes,
      })
    );
  }

  const allSubmissions = Array.from(rawSubmissionMap.values());

  // 4. Available filter options (across school data)
  const classSet = new Set<string>();
  for (const cls of params.clientClasses || []) {
    if (cls.isActive !== false && (!cls.schoolId || cls.schoolId === schoolId) && cls.name) {
      classSet.add(cls.name.trim());
    }
  }
  for (const st of params.clientRoster || []) {
    if (st.isActive !== false && (!st.schoolId || st.schoolId === schoolId) && st.gradeClass) {
      classSet.add(st.gradeClass.trim());
    }
  }
  for (const sub of allSubmissions) {
    if (sub.gradeClass && sub.gradeClass !== '-') classSet.add(sub.gradeClass);
  }
  const availableClasses = Array.from(classSet).sort((a, b) => a.localeCompare(b));

  const subjectSet = new Map<string, string>();
  for (const exam of examMap.values()) {
    subjectSet.set(exam.subjectId, getSubjectDisplayName(exam.subjectId));
  }
  for (const sub of allSubmissions) {
    subjectSet.set(sub.subjectId, sub.subjectName);
  }
  const availableSubjects = Array.from(subjectSet.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const availableAssessmentsMap = new Map<
    string,
    {
      id: string;
      title: string;
      subjectId: string;
      subjectName: string;
      mode: string;
      isOfficialScore: boolean;
    }
  >();
  for (const ex of examMap.values()) {
    availableAssessmentsMap.set(ex.id, {
      id: ex.id,
      title: ex.title,
      subjectId: ex.subjectId,
      subjectName: getSubjectDisplayName(ex.subjectId),
      mode: ex.mode,
      isOfficialScore: ex.isOfficial,
    });
  }
  for (const sub of allSubmissions) {
    if (!availableAssessmentsMap.has(sub.assessmentId)) {
      availableAssessmentsMap.set(sub.assessmentId, {
        id: sub.assessmentId,
        title: sub.assessmentTitle,
        subjectId: sub.subjectId,
        subjectName: sub.subjectName,
        mode: sub.examMode,
        isOfficialScore: sub.isOfficialScore,
      });
    }
  }
  const availableAssessments = Array.from(availableAssessmentsMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  // 5. Filter Submissions
  const classFilterNorm = filters.classFilter?.trim().toLowerCase() || '';
  const subjectFilterNorm = filters.subjectFilter?.trim().toLowerCase() || '';
  const assessmentFilterNorm = filters.assessmentFilter?.trim() || '';
  const dateFrom = filters.dateFrom?.trim() || '';
  const dateTo = filters.dateTo?.trim() || '';
  const searchNorm = filters.search?.trim().toLowerCase() || '';

  const filteredRaw = allSubmissions.filter((sub) => {
    if (scope === 'official' && !sub.isOfficialScore) return false;
    if (scope === 'practice' && sub.isOfficialScore) return false;
    if (classFilterNorm && classFilterNorm !== 'all' && sub.gradeClass.toLowerCase() !== classFilterNorm) {
      return false;
    }
    if (subjectFilterNorm && subjectFilterNorm !== 'all' && sub.subjectId.toLowerCase() !== subjectFilterNorm) {
      return false;
    }
    if (assessmentFilterNorm && assessmentFilterNorm !== 'all' && sub.assessmentId !== assessmentFilterNorm) {
      return false;
    }
    if (completionStatus === 'final' && !sub.isFinalized) return false;
    if (completionStatus === 'waiting_essay' && sub.isFinalized) return false;
    if (dateFrom && sub.submittedDateKey < dateFrom) return false;
    if (dateTo && sub.submittedDateKey > dateTo) return false;
    if (
      searchNorm &&
      !sub.studentName.toLowerCase().includes(searchNorm) &&
      !sub.gradeClass.toLowerCase().includes(searchNorm) &&
      !(sub.participantNumber || '').toLowerCase().includes(searchNorm) &&
      !sub.assessmentTitle.toLowerCase().includes(searchNorm) &&
      !sub.subjectName.toLowerCase().includes(searchNorm)
    ) {
      return false;
    }
    return true;
  });

  // 6. Deduplicate Multi-Attempts per (studentIdentityKey, assessmentId)
  const pairGroups = new Map<string, NormalizedSubmissionRow[]>();
  for (const row of filteredRaw) {
    const pairKey = `${row.studentIdentityKey}__${row.assessmentId}`;
    const arr = pairGroups.get(pairKey) || [];
    arr.push(row);
    pairGroups.set(pairKey, arr);
  }

  const recapSubmissions: Array<{ row: NormalizedSubmissionRow; attemptCountForPair: number }> = [];
  for (const group of pairGroups.values()) {
    const count = group.length;
    if (attemptPolicy === 'all_attempts') {
      const sorted = [...group].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      for (const row of sorted) {
        recapSubmissions.push({ row, attemptCountForPair: count });
      }
      continue;
    }

    let chosen = group[0];
    if (attemptPolicy === 'best') {
      chosen = [...group].sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        return b.submittedAt.localeCompare(a.submittedAt);
      })[0];
    } else if (attemptPolicy === 'latest') {
      chosen = [...group].sort((a, b) => {
        const cmpTime = b.submittedAt.localeCompare(a.submittedAt);
        if (cmpTime !== 0) return cmpTime;
        return b.attemptNumber - a.attemptNumber;
      })[0];
    } else if (attemptPolicy === 'first') {
      chosen = [...group].sort((a, b) => {
        if (a.attemptNumber !== b.attemptNumber) return a.attemptNumber - b.attemptNumber;
        return a.submittedAt.localeCompare(b.submittedAt);
      })[0];
    }
    recapSubmissions.push({ row: chosen, attemptCountForPair: count });
  }

  recapSubmissions.sort(
    (a, b) =>
      a.row.gradeClass.localeCompare(b.row.gradeClass) ||
      a.row.studentName.localeCompare(b.row.studentName) ||
      b.row.submittedAt.localeCompare(a.row.submittedAt)
  );

  // 7. Roster & Registered vs Attempted Students
  const activeRoster = (params.clientRoster || []).filter((st) => {
    if (st.isActive === false) return false;
    if (st.schoolId && st.schoolId !== schoolId) return false;
    if (classFilterNorm && classFilterNorm !== 'all' && st.gradeClass.trim().toLowerCase() !== classFilterNorm) {
      return false;
    }
    if (
      searchNorm &&
      !st.name.toLowerCase().includes(searchNorm) &&
      !st.gradeClass.toLowerCase().includes(searchNorm) &&
      !(st.participantNumber || '').toLowerCase().includes(searchNorm)
    ) {
      return false;
    }
    return true;
  });

  const attemptedIdentitySet = new Set(recapSubmissions.map((r) => r.row.studentIdentityKey));
  const attemptedRosterKeys = new Set<string>();
  const notYetAttemptedStudents: Stage5ReportPayload['notYetAttemptedStudents'] = [];

  for (const st of activeRoster) {
    const keyById = st.id ? `id:${st.id}` : '';
    const keyByPart = st.participantNumber ? `num:${st.participantNumber.trim().toLowerCase()}` : '';
    const keyByName = `name:${st.gradeClass.trim().toLowerCase()}::${st.name.trim().toLowerCase()}`;
    const hasAttempted =
      (keyById && attemptedIdentitySet.has(keyById)) ||
      (keyByPart && attemptedIdentitySet.has(keyByPart)) ||
      attemptedIdentitySet.has(keyByName);
    if (hasAttempted) {
      attemptedRosterKeys.add(st.id || keyByName);
    } else {
      notYetAttemptedStudents.push({
        id: st.id,
        name: st.name,
        gradeClass: st.gradeClass,
        participantNumber: st.participantNumber,
      });
    }
  }

  const hasRosterData = activeRoster.length > 0;
  const attemptedStudentsCount = hasRosterData
    ? Math.max(attemptedRosterKeys.size, attemptedIdentitySet.size)
    : attemptedIdentitySet.size;
  const registeredStudentsCount = hasRosterData ? activeRoster.length : attemptedStudentsCount;
  const notYetAttemptedCount = hasRosterData ? notYetAttemptedStudents.length : 0;

  // 8. Summary KPIs
  const finalizedRows = recapSubmissions.filter((r) => r.row.isFinalized).map((r) => r.row);
  const waitingEssayCount = recapSubmissions.filter((r) => !r.row.isFinalized).length;
  const activeKkm =
    assessmentFilterNorm && assessmentFilterNorm !== 'all' && examMap.get(assessmentFilterNorm)?.kkm
      ? examMap.get(assessmentFilterNorm)!.kkm
      : defaultKkm;

  const scores = finalizedRows.map((r) => r.finalScore);
  const averageScore =
    scores.length > 0
      ? Math.round((scores.reduce((acc, s) => acc + s, 0) / scores.length) * 10) / 10
      : 0;
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
  const passedKkmCount = finalizedRows.filter((r) => r.passedKkm).length;
  const needsFollowUpCount = finalizedRows.filter((r) => !r.passedKkm).length;
  const passRatePercent =
    finalizedRows.length > 0 ? Math.round((passedKkmCount / finalizedRows.length) * 100) : 0;

  // 9. Charts
  const totalForDist = finalizedRows.length || 1;
  const distBuckets = [
    { label: '0-49', count: finalizedRows.filter((r) => r.finalScore < 50).length },
    { label: '50-69', count: finalizedRows.filter((r) => r.finalScore >= 50 && r.finalScore < 70).length },
    { label: '70-84', count: finalizedRows.filter((r) => r.finalScore >= 70 && r.finalScore < 85).length },
    { label: '85-100', count: finalizedRows.filter((r) => r.finalScore >= 85).length },
  ].map((b) => ({
    label: b.label,
    count: b.count,
    percent: finalizedRows.length > 0 ? Math.round((b.count / totalForDist) * 100) : 0,
  }));

  const classMap = new Map<string, NormalizedSubmissionRow[]>();
  for (const item of recapSubmissions) {
    const arr = classMap.get(item.row.gradeClass) || [];
    arr.push(item.row);
    classMap.set(item.row.gradeClass, arr);
  }
  const classMastery = Array.from(classMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([gradeClass, rows]) => {
      const fin = rows.filter((r) => r.isFinalized);
      const passed = fin.filter((r) => r.passedKkm).length;
      const avg =
        fin.length > 0
          ? Math.round((fin.reduce((s, r) => s + r.finalScore, 0) / fin.length) * 10) / 10
          : 0;
      return {
        gradeClass,
        attemptedCount: new Set(rows.map((r) => r.studentIdentityKey)).size,
        finalizedCount: fin.length,
        avgScore: avg,
        passedCount: passed,
        passRatePercent: fin.length > 0 ? Math.round((passed / fin.length) * 100) : 0,
      };
    });

  // 10. Subject & Assessment Recaps
  const subjectGroups = new Map<string, NormalizedSubmissionRow[]>();
  const assessmentGroups = new Map<string, NormalizedSubmissionRow[]>();
  const trendGroups = new Map<string, NormalizedSubmissionRow[]>();

  for (const item of recapSubmissions) {
    const r = item.row;
    const sList = subjectGroups.get(r.subjectId) || [];
    sList.push(r);
    subjectGroups.set(r.subjectId, sList);

    const aList = assessmentGroups.get(r.assessmentId) || [];
    aList.push(r);
    assessmentGroups.set(r.assessmentId, aList);

    const dList = trendGroups.get(r.submittedDateKey) || [];
    dList.push(r);
    trendGroups.set(r.submittedDateKey, dList);
  }

  const subjectRecapRows: SubjectRecapRow[] = Array.from(subjectGroups.entries())
    .map(([subjectId, rows]) => {
      const fin = rows.filter((r) => r.isFinalized);
      const finScores = fin.map((r) => r.finalScore);
      const passedCount = fin.filter((r) => r.passedKkm).length;
      return {
        subjectId,
        subjectName: getSubjectDisplayName(subjectId),
        assessmentCount: new Set(rows.map((r) => r.assessmentId)).size,
        studentCount: new Set(rows.map((r) => r.studentIdentityKey)).size,
        finalizedCount: fin.length,
        avgScore:
          finScores.length > 0
            ? Math.round((finScores.reduce((a, b) => a + b, 0) / finScores.length) * 10) / 10
            : 0,
        highestScore: finScores.length > 0 ? Math.max(...finScores) : 0,
        lowestScore: finScores.length > 0 ? Math.min(...finScores) : 0,
        passedCount,
        needsFollowUpCount: fin.length - passedCount,
        passRatePercent: fin.length > 0 ? Math.round((passedCount / fin.length) * 100) : 0,
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  const subjectComparison = subjectRecapRows.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    attemptCount: s.finalizedCount || s.studentCount,
    avgScore: s.avgScore,
    passRatePercent: s.passRatePercent,
  }));

  const assessmentRecapRows: AssessmentRecapRow[] = Array.from(assessmentGroups.entries())
    .map(([assessmentId, rows]) => {
      const first = rows[0];
      const fin = rows.filter((r) => r.isFinalized);
      const finScores = fin.map((r) => r.finalScore);
      const passedCount = fin.filter((r) => r.passedKkm).length;
      return {
        assessmentId,
        assessmentTitle: first.assessmentTitle,
        subjectId: first.subjectId,
        subjectName: first.subjectName,
        examMode: first.examMode,
        examType: first.examType,
        isOfficialScore: first.isOfficialScore,
        kkm: first.kkm,
        submissionCount: rows.length,
        finalizedCount: fin.length,
        waitingEssayCount: rows.length - fin.length,
        avgScore:
          finScores.length > 0
            ? Math.round((finScores.reduce((a, b) => a + b, 0) / finScores.length) * 10) / 10
            : 0,
        highestScore: finScores.length > 0 ? Math.max(...finScores) : 0,
        lowestScore: finScores.length > 0 ? Math.min(...finScores) : 0,
        passedCount,
        needsFollowUpCount: fin.length - passedCount,
        passRatePercent: fin.length > 0 ? Math.round((passedCount / fin.length) * 100) : 0,
      };
    })
    .sort((a, b) => a.assessmentTitle.localeCompare(b.assessmentTitle));

  const historicalTrend = Array.from(trendGroups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, rows]) => {
      const fin = rows.filter((r) => r.isFinalized);
      const passed = fin.filter((r) => r.passedKkm).length;
      return {
        date,
        attemptCount: rows.length,
        avgScore:
          fin.length > 0
            ? Math.round((fin.reduce((acc, r) => acc + r.finalScore, 0) / fin.length) * 10) / 10
            : 0,
        passRatePercent: fin.length > 0 ? Math.round((passed / fin.length) * 100) : 0,
      };
    });

  // 11. Merge Question Definitions for Item Analysis & Topic Reinforcement
  const questionsById = new Map<string, ClientQuestionInput>();
  const questionsByAssessment = new Map<string, ClientQuestionInput[]>();

  const registerQuestion = (q: ClientQuestionInput) => {
    if (!q || !q.id) return;
    questionsById.set(q.id, q);
    if (q.assessmentId) {
      const list = questionsByAssessment.get(q.assessmentId) || [];
      const existingIdx = list.findIndex((x) => x.id === q.id);
      if (existingIdx >= 0) list[existingIdx] = q;
      else list.push(q);
      questionsByAssessment.set(q.assessmentId, list);
    }
  };

  for (const cq of params.clientQuestions || []) {
    if (cq.schoolId && cq.schoolId !== schoolId) continue;
    registerQuestion(cq);
  }
  for (const eq of Object.values(state.examQuestions)) {
    if (eq.schoolId !== schoolId) continue;
    registerQuestion({
      id: eq.id,
      assessmentId: eq.assessmentId,
      schoolId: eq.schoolId,
      order: eq.order,
      type: eq.type,
      prompt: eq.prompt,
      options: eq.options,
      correctAnswer: eq.correctAnswer,
      weight: eq.weight,
      topic: eq.topic,
      indicator: eq.indicator,
    });
  }

  // 12. Student Individual Reports (NO answer keys or question explanations leaked!)
  const adventureByStudentId = new Map(
    Object.values(adventureState.profiles)
      .filter((p) => p.schoolId === schoolId)
      .map((p) => [p.studentId, p])
  );
  const adventureByNameClass = new Map(
    Object.values(adventureState.profiles)
      .filter((p) => p.schoolId === schoolId)
      .map((p) => [`${p.gradeClass.trim().toLowerCase()}::${p.displayName.trim().toLowerCase()}`, p])
  );

  const studentGroups = new Map<string, NormalizedSubmissionRow[]>();
  for (const item of recapSubmissions) {
    const arr = studentGroups.get(item.row.studentIdentityKey) || [];
    arr.push(item.row);
    studentGroups.set(item.row.studentIdentityKey, arr);
  }

  const studentReports: StudentIndividualReport[] = Array.from(studentGroups.entries())
    .map(([studentKey, rows]) => {
      const first = rows[0];
      const fin = rows.filter((r) => r.isFinalized);
      const finScores = fin.map((r) => r.finalScore);
      const avg =
        finScores.length > 0
          ? Math.round((finScores.reduce((a, b) => a + b, 0) / finScores.length) * 10) / 10
          : 0;

      // Group subjects for masteredSubjects
      const subjScores = new Map<string, { name: string; sum: number; count: number; kkm: number }>();
      for (const r of fin) {
        const cur = subjScores.get(r.subjectId) || {
          name: r.subjectName,
          sum: 0,
          count: 0,
          kkm: r.kkm,
        };
        cur.sum += r.finalScore;
        cur.count += 1;
        subjScores.set(r.subjectId, cur);
      }

      const masteredSubjects = Array.from(subjScores.entries())
        .map(([subjectId, v]) => ({
          subjectId,
          subjectName: v.name,
          averageScore: v.count > 0 ? Math.round((v.sum / v.count) * 10) / 10 : 0,
          kkm: v.kkm,
        }))
        .filter((s) => s.averageScore >= s.kkm)
        .map(({ subjectId, subjectName, averageScore }) => ({
          subjectId,
          subjectName,
          averageScore,
        }));

      // Topic reinforcement derived strictly from questionOutcomes < 70%
      const topicStats = new Map<string, { subjectName: string; earned: number; max: number; missedCount: number }>();
      for (const r of rows) {
        for (const [qId, outcome] of Object.entries(r.questionOutcomes || {})) {
          if (outcome.status === 'manual_pending') continue;
          const qMeta = questionsById.get(qId);
          const topicName = qMeta?.topic?.trim();
          if (!topicName) continue;
          const key = `${r.subjectName}::${topicName}`;
          const cur = topicStats.get(key) || {
            subjectName: r.subjectName,
            earned: 0,
            max: 0,
            missedCount: 0,
          };
          cur.earned += outcome.earnedPoints;
          cur.max += outcome.maxPoints || 1;
          if (outcome.status === 'wrong' || outcome.status === 'unanswered') {
            cur.missedCount += 1;
          }
          topicStats.set(key, cur);
        }
      }

      const reinforcementTopics = Array.from(topicStats.entries())
        .map(([key, val]) => {
          const [, topic] = key.split('::');
          const masteryPercent = val.max > 0 ? Math.round((val.earned / val.max) * 100) : 0;
          return {
            topic,
            subjectName: val.subjectName,
            masteryPercent,
            missedCount: val.missedCount,
          };
        })
        .filter((t) => t.masteryPercent < 70)
        .sort((a, b) => a.masteryPercent - b.masteryPercent);

      const advProfile =
        (first.studentId ? adventureByStudentId.get(first.studentId) : undefined) ||
        adventureByNameClass.get(
          `${first.gradeClass.trim().toLowerCase()}::${first.studentName.trim().toLowerCase()}`
        );

      return {
        studentKey,
        studentId: first.studentId,
        studentName: first.studentName,
        gradeClass: first.gradeClass,
        participantNumber: first.participantNumber,
        totalAttempted: rows.length,
        finalizedCount: fin.length,
        waitingEssayCount: rows.length - fin.length,
        averageScore: avg,
        highestScore: finScores.length > 0 ? Math.max(...finScores) : 0,
        lowestScore: finScores.length > 0 ? Math.min(...finScores) : 0,
        passedCount: fin.filter((r) => r.passedKkm).length,
        masteredSubjects,
        reinforcementTopics,
        assessments: [...rows]
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
          .map((r) => ({
            submissionId: r.submissionId,
            assessmentId: r.assessmentId,
            assessmentTitle: r.assessmentTitle,
            subjectId: r.subjectId,
            subjectName: r.subjectName,
            examMode: r.examMode,
            isOfficialScore: r.isOfficialScore,
            finalScore: r.finalScore,
            gradingStatus: r.gradingStatus,
            statusKetuntasan: r.statusKetuntasan,
            kkm: r.kkm,
            attemptNumber: r.attemptNumber,
            durationSeconds: r.durationSeconds,
            submittedAt: r.submittedAt,
          })),
        ...(advProfile
          ? {
              adventureSummary: {
                totalXp: advProfile.totalXp,
                level: advProfile.level,
                levelTitle: advProfile.levelTitle,
                badgesEarnedCount: advProfile.badgesEarnedCount,
                worldsCompletedCount: advProfile.worldsCompletedCount,
              },
            }
          : {}),
      };
    })
    .sort((a, b) => a.gradeClass.localeCompare(b.gradeClass) || a.studentName.localeCompare(b.studentName));

  // 13. Item Analysis on target assessment
  const targetAssessmentId =
    assessmentFilterNorm && assessmentFilterNorm !== 'all'
      ? assessmentFilterNorm
      : assessmentRecapRows[0]?.assessmentId || availableAssessments[0]?.id || null;

  const targetAssessmentMeta = targetAssessmentId
    ? availableAssessmentsMap.get(targetAssessmentId) || null
    : null;
  const targetQuestions = targetAssessmentId
    ? questionsByAssessment.get(targetAssessmentId) || []
    : [];
  const targetSubmissions = targetAssessmentId
    ? recapSubmissions
        .filter((r) => r.row.assessmentId === targetAssessmentId)
        .map((r) => ({
          finalScore: r.row.finalScore,
          questionOutcomes: r.row.questionOutcomes,
          answersMap: r.row.answersMap,
        }))
    : [];

  // Fallback: if question list wasn't attached directly, reconstruct IDs from questionOutcomes
  const effectiveTargetQuestions =
    targetQuestions.length > 0
      ? targetQuestions
      : Array.from(
          new Set(targetSubmissions.flatMap((s) => Object.keys(s.questionOutcomes || {})))
        ).map((qId, idx) => {
          const fromId = questionsById.get(qId);
          return (
            fromId || {
              id: qId,
              order: idx + 1,
              type: 'multiple_choice',
              prompt: `Soal ${idx + 1}`,
              topic: 'Umum',
              indicator: '-',
            }
          );
        });

  const itemAnalysis = buildEnhancedItemAnalysis({
    assessmentId: targetAssessmentId,
    assessmentTitle: targetAssessmentMeta?.title || null,
    subjectName: targetAssessmentMeta?.subjectName || null,
    questions: effectiveTargetQuestions,
    submissions: targetSubmissions,
  });

  // 14. Deterministic Follow-Up Recommendations (Strict Real Data)
  const studentsEnrichment = studentReports
    .filter((st) => st.finalizedCount > 0 && st.averageScore >= activeKkm)
    .map((st) => ({
      studentKey: st.studentKey,
      studentName: st.studentName,
      gradeClass: st.gradeClass,
      averageScore: st.averageScore,
      passedAssessments: st.passedCount,
      suggestion:
        st.averageScore >= 85
          ? 'Tuntas sangat baik — siap diberikan tantangan pengayaan HOTS / proyek kreatif.'
          : 'Mencapai ketuntasan — pertahankan pemahaman dengan latihan pengayaan ringan.',
    }));

  const studentsRemedial = studentReports
    .filter((st) => st.finalizedCount > 0 && st.averageScore < activeKkm)
    .map((st) => ({
      studentKey: st.studentKey,
      studentName: st.studentName,
      gradeClass: st.gradeClass,
      averageScore: st.averageScore,
      weakTopics: st.reinforcementTopics.slice(0, 3).map((t) => `${t.topic} (${t.masteryPercent}%)`),
      suggestion:
        st.reinforcementTopics.length > 0
          ? `Perlu penguatan konsep pada topik: ${st.reinforcementTopics
              .slice(0, 3)
              .map((t) => t.topic)
              .join(', ')}.`
          : `Nilai rata-rata (${st.averageScore}) masih di bawah KKM (${activeKkm}) — jadwalkan pendampingan remedial.`,
    }));

  const weakTopics = itemAnalysis.topicMastery
    .filter((t) => itemAnalysis.respondentCount > 0 && t.masteryPercent < 70)
    .sort((a, b) => a.masteryPercent - b.masteryPercent)
    .map((t) => ({
      topic: t.topic,
      subjectName: itemAnalysis.subjectName || 'Asesmen Terpilih',
      masteryPercent: t.masteryPercent,
      questionCount: t.questionCount,
      suggestion:
        t.masteryPercent < 45
          ? `Penguasaan rendah (${t.masteryPercent}%) — ulangi penjelasan inti dan contoh konkret di kelas.`
          : `Penguasaan perlu penguatan (${t.masteryPercent}%) — berikan latihan terbimbing sebelum asesmen berikutnya.`,
    }));

  const classRecapRows: ClassRecapRow[] = recapSubmissions.map(({ row, attemptCountForPair }) => ({
    submissionId: row.submissionId,
    sessionId: row.sessionId,
    studentKey: row.studentIdentityKey,
    studentId: row.studentId,
    studentName: row.studentName,
    gradeClass: row.gradeClass,
    participantNumber: row.participantNumber,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    assessmentId: row.assessmentId,
    assessmentTitle: row.assessmentTitle,
    examMode: row.examMode,
    examType: row.examType,
    isOfficialScore: row.isOfficialScore,
    finalScore: row.finalScore,
    objectiveScore: row.objectiveScore,
    gradingStatus: row.gradingStatus,
    kkm: row.kkm,
    passedKkm: row.passedKkm,
    statusKetuntasan: row.statusKetuntasan,
    attemptNumber: row.attemptNumber,
    attemptCountForPair,
    durationSeconds: row.durationSeconds,
    submittedAt: row.submittedAt,
  }));

  return {
    schoolId,
    generatedAt: new Date().toISOString(),
    activeScope: scope,
    activeAttemptPolicy: attemptPolicy,
    attemptPolicyLabel: ATTEMPT_POLICY_LABELS[attemptPolicy],
    availableFilters: {
      classes: availableClasses,
      subjects: availableSubjects,
      assessments: availableAssessments,
    },
    kpis: {
      registeredStudentsCount,
      hasRosterData,
      attemptedStudentsCount,
      notYetAttemptedCount,
      totalSubmissionsRaw: filteredRaw.length,
      deduplicatedRecapCount: recapSubmissions.length,
      finalizedCount: finalizedRows.length,
      waitingEssayCount,
      averageScore,
      highestScore,
      lowestScore,
      passedKkmCount,
      needsFollowUpCount,
      passRatePercent,
      kkm: activeKkm,
    },
    notYetAttemptedStudents,
    charts: {
      scoreDistribution: distBuckets,
      classMastery,
      subjectComparison,
      historicalTrend,
    },
    classRecapRows,
    subjectRecapRows,
    assessmentRecapRows,
    studentReports,
    itemAnalysis,
    recommendations: {
      studentsEnrichment,
      studentsRemedial,
      weakTopics,
      questionsToReview: itemAnalysis.reviewNeededQuestions.map((q) => ({
        questionId: q.questionId,
        number: q.number,
        prompt: q.prompt,
        reason: q.reason,
      })),
    },
  };
}
