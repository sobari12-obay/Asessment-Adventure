import fs from 'fs';
import path from 'path';

export type AssessmentMode = 'psas' | 'latihan' | 'simulasi';
export type AssessmentType = 'latihan' | 'ulangan_harian' | 'sumatif' | 'psas' | 'simulasi';
export type AssessmentStatus = 'draft' | 'scheduled' | 'active' | 'closed' | 'completed' | 'archived';
export type NavigationMode = 'sequential' | 'free' | 'level' | 'checkpoint';
export type IdentityMode = 'code_free' | 'roster_select' | 'roster_verify';
export type DifficultyLevel = 'mudah' | 'sedang' | 'sulit';
export type ResultReleasePolicy =
  | 'immediately_after_submit'
  | 'after_manual_grading'
  | 'when_released_by_teacher'
  | 'score_hidden';

export interface ScoringPolicyRecord {
  maxScore: number;
  multipleSelectScoring: 'exact' | 'partial_proportional';
  shortAnswerCaseSensitive: boolean;
  shortAnswerNumericTolerance?: number;
}

export interface ResultPolicyRecord {
  showScoreToStudent: boolean;
  showCorrectAnswer: boolean;
  showExplanation: boolean;
  releasePolicy: ResultReleasePolicy;
}

export interface BankQuestionRecord {
  id: string;
  schoolId: string;
  subjectId: string;
  worldId: string;
  grade: string;
  semester: 'Ganjil' | 'Genap';
  topic: string;
  competency: string;
  indicator: string;
  type: string;
  difficulty: DifficultyLevel;
  prompt: string;
  payload: Record<string, unknown>;
  correctAnswer: string;
  acceptedVariations?: string[];
  numericTolerance?: number;
  rubric?: string;
  explanation?: string;
  imageUrl?: string;
  tags: string[];
  weight: number;
  isActive: boolean;
  archivedAt?: string;
  archivedBy?: string;
  verificationStatus?: 'VERIFIED' | 'BELUM_DIVERIFIKASI';
  importBatchId?: string;
  sourceFileName?: string;
  sourceFileType?: string;
  sourcePage?: number;
  sourceQuestionNumber?: string;
  extractionStatus?: 'success' | 'needs_review' | 'failed';
  extractionConfidence?: number;
  needsReview?: boolean;
  importedBy?: string;
  importedAt?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamRecord {
  id: string;
  schoolId: string;
  classIds: string[];
  code: string;
  codeHash: string;
  title: string;
  description?: string;
  academicYear?: string;
  subjectId: string;
  worldThemeId: string;
  grade: string;
  semester: 'Ganjil' | 'Genap';
  date?: string;
  startsAt?: string;
  endsAt?: string;
  durationMinutes: number;
  maxAttempts: number;
  allowMultipleSessions: boolean;
  examType: AssessmentType;
  mode: AssessmentMode;
  status: AssessmentStatus;
  isLocked: boolean;
  isVisibleOnMap: boolean;
  showScoreToStudent: boolean;
  introStory: string;
  totalQuestions: number;
  targetQuestionCount?: number;
  checkpointInterval: number;
  kkm: number;
  navigationMode: NavigationMode;
  allowBack: boolean;
  allowEditAfterAnswer: boolean;
  requireAnswerBeforeNext: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  identityMode: IdentityMode;
  audioEnabled: boolean;
  scoringPolicy: ScoringPolicyRecord;
  resultPolicy: ResultPolicyRecord;
  archivedAt?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamQuestionRecord {
  id: string;
  schoolId: string;
  assessmentId: string;
  subjectId: string;
  bankItemId?: string;
  order: number;
  type: string;
  prompt: string;
  options?: string[];
  mediaUrl?: string;
  audioUrl?: string;
  audioText?: string;
  matchLeft?: string[];
  matchRight?: string[];
  orderingItems?: string[];
  dragItems?: Array<{ id: string; label: string }>;
  dragTargets?: Array<{ id: string; label: string }>;
  imageOptions?: Array<{ id: string; label: string; imageUrl?: string; motif?: string }>;
  weight: number;
  topic?: string;
  indicator?: string;
  difficulty?: DifficultyLevel;
  correctAnswer: string;
  acceptedVariations?: string[];
  numericTolerance?: number;
  allowPartialScoring?: boolean;
  rubric?: string;
  explanation?: string;
  practiceHint?: string;
  isPublished: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSessionRecord {
  id: string;
  schoolId: string;
  assessmentId: string;
  subjectId: string;
  classId: string;
  studentId: string;
  mode: AssessmentMode;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  characterId: 'boy' | 'girl';
  status: 'in_progress' | 'submitted' | 'graded';
  attemptNumber: number;
  currentIndex: number;
  answeredIds: string[];
  flaggedIds: string[];
  questionOrder: string[];
  optionOrderMap: Record<string, string[]>;
  totalQuestions: number;
  progressPercent: number;
  checkpointsUnlocked: number;
  artifactsEarned: string[];
  starsEarned: number;
  startedAt: string;
  deadlineAt: string;
  lastActivityAt: string;
  lastSavedAt?: string;
  submittedAt?: string;
  autoSubmittedByTimeout?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentAnswerRecord {
  id: string;
  schoolId: string;
  sessionId: string;
  assessmentId: string;
  studentId: string;
  questionId: string;
  questionPromptSnapshot?: string;
  questionWeightSnapshot?: number;
  answerValue: string;
  isAnswered: boolean;
  answeredAt: string;
  updatedAt: string;
}

export interface QuestionOutcomeRecord {
  questionId: string;
  earnedPoints: number;
  maxPoints: number;
  status: 'correct' | 'partial' | 'wrong' | 'unanswered' | 'manual_pending';
}

export interface EssayGradingRecord {
  questionId: string;
  score: number;
  maxScore: number;
  comment: string;
  gradedBy: string;
  gradedByName?: string;
  gradedAt: string;
}

export interface ExamAuditTrailRecord {
  action: string;
  actorId: string;
  actorName?: string;
  detail: string;
  at: string;
}

export interface ExamSubmissionRecord {
  submissionId: string;
  sessionId: string;
  schoolId: string;
  assessmentId: string;
  assessmentTitle: string;
  subjectId: string;
  classId?: string;
  studentId: string;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  examMode: AssessmentMode;
  examType: AssessmentType;
  attemptNumber: number;
  isOfficialScore: boolean;
  gradingStatus: 'auto_graded' | 'waiting_essay_grading' | 'finalized';
  objectiveScore: number;
  finalScore: number;
  earnedPoints: number;
  maxPoints: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  needsManualReview: boolean;
  manualScores: Record<string, number>;
  essayGrading: Record<string, EssayGradingRecord>;
  questionOutcomes: Record<string, QuestionOutcomeRecord>;
  auditTrail: ExamAuditTrailRecord[];
  durationSeconds: number;
  showToStudent: boolean;
  gradedBy: string;
  startedAt: string;
  submittedAt: string;
  celebration?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ExamAuditLogRecord {
  logId: string;
  schoolId: string;
  examId?: string;
  sessionId?: string;
  studentId?: string;
  actorId: string;
  actorType: 'admin' | 'teacher' | 'student' | 'system';
  action: string;
  detail: string;
  timestamp: string;
}

export interface AssessmentStoreState {
  version: number;
  questionBank: Record<string, BankQuestionRecord>;
  exams: Record<string, ExamRecord>;
  examQuestions: Record<string, ExamQuestionRecord>;
  sessions: Record<string, ExamSessionRecord>;
  answers: Record<string, StudentAnswerRecord>;
  submissions: Record<string, ExamSubmissionRecord>;
  auditLogs: ExamAuditLogRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE_PATH = path.join(DATA_DIR, 'assessment-state.json');

function createEmptyAssessmentState(): AssessmentStoreState {
  return {
    version: 1,
    questionBank: {},
    exams: {},
    examQuestions: {},
    sessions: {},
    answers: {},
    submissions: {},
    auditLogs: [],
  };
}

function readAssessmentStateFromDisk(): AssessmentStoreState {
  try {
    if (!fs.existsSync(STATE_FILE_PATH)) {
      return createEmptyAssessmentState();
    }
    const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
    if (!raw.trim()) return createEmptyAssessmentState();
    const parsed = JSON.parse(raw) as Partial<AssessmentStoreState>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      questionBank:
        parsed.questionBank && typeof parsed.questionBank === 'object' ? parsed.questionBank : {},
      exams: parsed.exams && typeof parsed.exams === 'object' ? parsed.exams : {},
      examQuestions:
        parsed.examQuestions && typeof parsed.examQuestions === 'object' ? parsed.examQuestions : {},
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      answers: parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {},
      submissions:
        parsed.submissions && typeof parsed.submissions === 'object' ? parsed.submissions : {},
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch {
    return createEmptyAssessmentState();
  }
}

function writeAssessmentStateAtomic(state: AssessmentStoreState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STATE_FILE_PATH}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, STATE_FILE_PATH);
}

let inMemoryAssessmentState: AssessmentStoreState = readAssessmentStateFromDisk();
let writeQueue: Promise<unknown> = Promise.resolve();

export function getAssessmentStateSnapshot(): AssessmentStoreState {
  return inMemoryAssessmentState;
}

export async function mutateAssessmentState<T>(
  mutator: (state: AssessmentStoreState) => T | Promise<T>
): Promise<T> {
  const task = writeQueue.then(async () => {
    const result = await mutator(inMemoryAssessmentState);
    writeAssessmentStateAtomic(inMemoryAssessmentState);
    return result;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

export function makeBankKey(schoolId: string, questionId: string): string {
  return `${schoolId}__${questionId}`;
}

export function makeExamKey(schoolId: string, examId: string): string {
  return `${schoolId}__${examId}`;
}

export function makeExamQuestionKey(examId: string, questionId: string): string {
  return `${examId}__${questionId}`;
}

export function makeAnswerKey(sessionId: string, questionId: string): string {
  return `${sessionId}__${questionId}`;
}

export function appendExamAuditLog(
  state: AssessmentStoreState,
  entry: Omit<ExamAuditLogRecord, 'logId' | 'timestamp'>
): void {
  state.auditLogs.push({
    ...entry,
    logId: `alog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  });
  if (state.auditLogs.length > 2000) {
    state.auditLogs = state.auditLogs.slice(-2000);
  }
}
