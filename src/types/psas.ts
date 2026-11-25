export const DEFAULT_SCHOOL_ID = 'sdn_pekiringan';
export const DEFAULT_SCHOOL_NAME = 'SDN Pekiringan';

export type SubjectId =
  | 'pai'
  | 'pancasila'
  | 'bahasa_indonesia'
  | 'matematika'
  | 'ipas'
  | 'seni_rupa'
  | 'pjok'
  | 'bahasa_inggris'
  | 'bahasa_sunda'
  | 'bahasa_cirebon';

export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'matching'
  | 'ordering'
  | 'drag_drop'
  | 'image_choice'
  | 'audio'
  | 'illustrated'
  | 'multiple_select'
  | 'essay';

export type NavigationMode = 'sequential' | 'free' | 'level' | 'checkpoint';
export type AssessmentMode = 'psas' | 'latihan' | 'simulasi';
export type AssessmentType = 'latihan' | 'ulangan_harian' | 'sumatif' | 'psas' | 'simulasi';
export type AssessmentStatus = 'draft' | 'scheduled' | 'active' | 'closed' | 'completed' | 'archived';
export type IdentityMode = 'code_free' | 'roster_select' | 'roster_verify';
export type DifficultyLevel = 'mudah' | 'sedang' | 'sulit';
export type ExplorerCharacterId = 'boy' | 'girl';
export type VerificationStatus = 'VERIFIED' | 'BELUM_DIVERIFIKASI';
export type UserRole = 'admin' | 'teacher';
export type ResultReleasePolicy =
  | 'immediately_after_submit'
  | 'after_manual_grading'
  | 'when_released_by_teacher'
  | 'score_hidden';

export interface ScoringPolicy {
  maxScore: number;
  multipleSelectScoring: 'exact' | 'partial_proportional';
  shortAnswerCaseSensitive: boolean;
  shortAnswerNumericTolerance?: number;
}

export interface ResultPolicy {
  showScoreToStudent: boolean;
  showCorrectAnswer: boolean;
  showExplanation: boolean;
  releasePolicy: ResultReleasePolicy;
}

export interface SchoolProfile {
  id: string;
  name: string;
  npsn?: string;
  address?: string;
  logoUrl?: string;
  academicYear?: string;
  activeSemester?: 'Ganjil' | 'Genap';
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserAccount {
  uid: string;
  schoolId: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClassRoom {
  id: string;
  schoolId: string;
  name: string;
  grade: string;
  academicYear?: string;
  homeroomTeacher?: string;
  isActive: boolean;
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SubjectRecord {
  id: SubjectId;
  schoolId: string;
  number: number;
  name: string;
  worldName: string;
  worldCode?: string;
  worldIcon?: string;
  worldColor?: string;
  description?: string;
  portalName: string;
  isActive: boolean;
  ownerId: string;
  updatedAt?: unknown;
}

export interface WorldConfig {
  id: SubjectId;
  number: number;
  subjectName: string;
  worldName: string;
  portalName: string;
  themeSummary: string;
  mechanics: string[];
  companionName: string;
  companionGreeting: string;
  artifactName: string;
  badgeTitle: string;
  primaryColor: string;
  secondaryColor: string;
  surfaceBg: string;
  accentHex: string;
  gradientClass: string;
  borderClass: string;
  textClass: string;
}

export interface ImageOptionItem {
  id: string;
  label: string;
  imageUrl?: string;
  motif?: string;
}

export interface DragItem {
  id: string;
  label: string;
}

export interface DragTarget {
  id: string;
  label: string;
}

export interface AssessmentConfig {
  id: string;
  schoolId: string;
  classIds?: string[];
  code: string;
  codeHash: string;
  title: string;
  description?: string;
  academicYear?: string;
  subjectId: SubjectId;
  worldThemeId: string;
  grade: string;
  semester: 'Ganjil' | 'Genap';
  date: string;
  startsAt?: string;
  endsAt?: string;
  durationMinutes: number;
  maxAttempts?: number;
  allowMultipleSessions?: boolean;
  mode: AssessmentMode;
  status: AssessmentStatus;
  isLocked: boolean;
  isVisibleOnMap: boolean;
  showScoreToStudent: boolean;
  introStory: string;
  totalQuestions: number;
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
  ownerId: string;
  examType?: AssessmentType;
  targetQuestionCount?: number;
  scoringPolicy?: ScoringPolicy;
  resultPolicy?: ResultPolicy;
  participantCount?: number;
  archivedAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// Student-safe portal metadata without plaintext exam code or teacher-only KKM/date
export type PublicAssessment = Omit<AssessmentConfig, 'date' | 'kkm' | 'createdAt' | 'code' | 'codeHash'>;

export interface AssessmentAccessRecord {
  codeHash: string;
  schoolId: string;
  assessmentId: string;
  subjectId: SubjectId;
  classIds?: string[];
  status: AssessmentStatus;
  isLocked: boolean;
  startsAt?: string;
  endsAt?: string;
  maxAttempts?: number;
  allowMultipleSessions?: boolean;
  identityMode: IdentityMode;
  ownerId: string;
  updatedAt?: unknown;
}

export interface PublicQuestion {
  id: string;
  schoolId?: string;
  assessmentId: string;
  subjectId: SubjectId;
  order: number;
  type: QuestionType;
  prompt: string;
  options?: string[];
  mediaUrl?: string;
  audioUrl?: string;
  audioText?: string;
  matchLeft?: string[];
  matchRight?: string[];
  orderingItems?: string[];
  dragItems?: DragItem[];
  dragTargets?: DragTarget[];
  imageOptions?: ImageOptionItem[];
  weight: number;
  topic?: string;
  indicator?: string;
  difficulty?: DifficultyLevel;
  practiceHint?: string;
  practiceExplanation?: string;
  practiceKey?: string;
  bankItemId?: string;
  numericTolerance?: number;
  allowPartialScoring?: boolean;
  isPublished: boolean;
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuestionKey {
  questionId: string;
  schoolId?: string;
  assessmentId: string;
  type: QuestionType;
  correctAnswer: string;
  acceptedVariations?: string[];
  numericTolerance?: number;
  rubric?: string;
  explanation?: string;
  weight: number;
  ownerId: string;
  updatedAt?: unknown;
}

export interface QuestionWithKey extends PublicQuestion {
  correctAnswer: string;
  acceptedVariations?: string[];
  rubric?: string;
  explanation?: string;
}

export interface QuestionBankItem {
  id: string;
  schoolId?: string;
  subjectId: SubjectId;
  grade: string;
  semester: 'Ganjil' | 'Genap';
  topic: string;
  competency: string;
  indicator: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  prompt: string;
  payload: Record<string, unknown>;
  correctAnswer: string;
  acceptedVariations?: string[];
  numericTolerance?: number;
  rubric?: string;
  explanation?: string;
  imageUrl?: string;
  tags?: string[];
  isActive?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  weight: number;
  verificationStatus?: VerificationStatus;
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
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RosterStudent {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  gradeClass: string;
  participantNumber?: string;
  studentNumber?: string;
  photoUrl?: string;
  isActive: boolean;
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentAccessKeyRecord {
  lookupId: string;
  schoolId: string;
  classId: string;
  requiresParticipantNumber: boolean;
  studentId?: string;
  displayName?: string;
  isActive: boolean;
  ownerId: string;
  updatedAt?: unknown;
}

export interface AssessmentSession {
  id: string;
  schoolId: string;
  assessmentId: string;
  subjectId: SubjectId;
  classId?: string;
  studentId?: string;
  mode: AssessmentMode;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  characterId?: ExplorerCharacterId;
  status: 'in_progress' | 'submitted' | 'graded';
  currentIndex: number;
  answeredIds: string[];
  questionOrder: string[];
  totalQuestions: number;
  progressPercent: number;
  checkpointsUnlocked: number;
  artifactsEarned: string[];
  starsEarned: number;
  attemptNumber?: number;
  deadlineAt?: string;
  serverNowAt?: string;
  flaggedIds?: string[];
  optionOrderMap?: Record<string, string[]>;
  lastSavedAt?: string;
  autoSubmittedByTimeout?: boolean;
  startedAt: string;
  lastActivityAt?: string;
  submittedAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudentAnswer {
  id: string;
  schoolId: string;
  sessionId: string;
  assessmentId?: string;
  questionId: string;
  questionPromptSnapshot?: string;
  questionWeightSnapshot?: number;
  answerValue: string;
  isAnswered: boolean;
  updatedAt?: unknown;
}

export interface QuestionOutcome {
  questionId: string;
  earnedPoints: number;
  maxPoints: number;
  status: 'correct' | 'partial' | 'wrong' | 'unanswered' | 'manual_pending';
}

export interface EssayGradingEntry {
  questionId: string;
  score: number;
  maxScore: number;
  comment: string;
  gradedBy: string;
  gradedByName?: string;
  gradedAt: string;
}

export interface ExamAuditTrailEntry {
  action: string;
  actorId: string;
  actorName?: string;
  detail: string;
  at: string;
}

export interface AssessmentResult {
  sessionId: string;
  schoolId: string;
  assessmentId: string;
  assessmentTitle: string;
  subjectId: SubjectId;
  classId?: string;
  studentId?: string;
  studentName: string;
  gradeClass: string;
  participantNumber?: string;
  examMode?: AssessmentMode;
  examType?: AssessmentType;
  attemptNumber?: number;
  isOfficialScore?: boolean;
  gradingStatus?: 'auto_graded' | 'waiting_essay_grading' | 'finalized';
  objectiveScore?: number;
  finalScore: number;
  earnedPoints: number;
  maxPoints: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  needsManualReview: boolean;
  manualScores?: Record<string, number>;
  essayGrading?: Record<string, EssayGradingEntry>;
  questionOutcomes?: Record<string, QuestionOutcome>;
  auditTrail?: ExamAuditTrailEntry[];
  durationSeconds: number;
  showToStudent: boolean;
  gradedBy: string;
  startedAt?: string;
  submittedAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppSettings {
  id: string;
  schoolId: string;
  schoolName: string;
  defaultIntroStory: string;
  defaultKkm: number;
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface AuditLogEntry {
  id: string;
  schoolId: string;
  actorType: 'admin' | 'teacher' | 'student' | 'system';
  actorId: string;
  actorName?: string;
  action: string;
  targetCollection?: string;
  targetId?: string;
  status: 'success' | 'denied' | 'warning';
  detail?: string;
  createdAt?: unknown;
}

export type SaveSyncStatus = 'idle' | 'saving' | 'saved' | 'offline_queued' | 'error';

export interface AccessibilityPreferences {
  animationsEnabled: boolean;
  soundEffectsEnabled: boolean;
  musicEnabled: boolean;
  reducedMotion: boolean;
}

// --- STAGE 2: ADVENTURE ENGINE TYPES ---

export type OutfitThemeId = 'rimba_emerald' | 'langit_biru' | 'mentari_emas' | 'senja_merah';
export type BagStyleId = 'ransel_kompas' | 'tas_peta' | 'tas_bintang';
export type ShoeStyleId = 'sepatu_rimba' | 'sepatu_kilat';
export type CharacterExpression = 'idle' | 'happy' | 'celebrate';

export type AdventureWorldStatus =
  | 'belum_tersedia'
  | 'tersedia'
  | 'sedang_dijelajahi'
  | 'selesai';

export type CheckpointProgressStatus = 'terkunci' | 'terbuka' | 'sedang_dikerjakan' | 'selesai';
export type CheckpointType = 'story' | 'exploration' | 'mission_gate';

export interface AdventureProfile {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  gradeClass: string;
  displayName: string;
  characterId: ExplorerCharacterId;
  characterSelected: boolean;
  nickname?: string;
  outfitTheme: OutfitThemeId;
  bagStyle: BagStyleId;
  shoeStyle: ShoeStyleId;
  accentColor: string;
  totalXp: number;
  level: number;
  levelTitle: string;
  worldsExploredCount: number;
  worldsCompletedCount: number;
  checkpointsCompletedCount: number;
  badgesEarnedCount: number;
  activeDaysCount: number;
  lastActivityDate: string;
  lastWorldId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComputedLevelInfo {
  level: number;
  title: string;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevelXp: number | null;
  xpIntoLevel: number;
  xpForLevelSpan: number;
  xpToNextLevel: number;
  progressPercent: number;
}

export interface StudentBadgeRecord {
  id: string;
  schoolId: string;
  studentId: string;
  badgeId: string;
  badgeName: string;
  badgeCategory: 'milestone' | 'world' | 'consistency';
  worldId?: string;
  eventId: string;
  earnedAt: string;
}

export interface BadgeCatalogViewItem {
  id: string;
  code: string;
  name: string;
  description: string;
  category: 'milestone' | 'world' | 'consistency';
  iconKey: string;
  targetWorldId?: string;
  order: number;
  targetCount?: number;
  xpThreshold?: number;
  isActive?: boolean;
  earned: boolean;
  earnedAt?: string;
}

export interface AdventureCelebrationDelta {
  xpGranted: number;
  previousTotalXp: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  newLevelTitle: string;
  leveledUp: boolean;
  unlockedBadges: StudentBadgeRecord[];
  reason?: string;
  completedWorldId?: string;
  completedWorldName?: string;
  milestoneReached?: string;
}

export interface AdventureWorldSummary {
  id: string;
  number: number;
  subjectId: string;
  subjectName: string;
  worldName: string;
  portalName: string;
  zoneTheme: string;
  themeSummary: string;
  companionName: string;
  artifactName: string;
  isAvailable: boolean;
  availabilityReason: string;
  scheduleLabel: string;
  status: AdventureWorldStatus;
  progressPercent: number;
  xpEarned: number;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  hasActiveAssessment: boolean;
  activeAssessmentId?: string;
  configSource: 'firestore' | 'teacher_override' | 'default_catalog';
  relatedBadgeId?: string;
  relatedBadgeName?: string;
  relatedBadgeEarned?: boolean;
  openedAt?: string;
  completedAt?: string;
}

export interface AdventureCheckpointItem {
  id: string;
  schoolId: string;
  worldId: string;
  order: number;
  title: string;
  storyIntro: string;
  storyOutro: string;
  challengePrompt: string;
  challengeOptions: string[];
  helpfulHint: string;
  checkpointType: CheckpointType;
  xpReward: number;
  isActive: boolean;
  status: CheckpointProgressStatus;
  xpAwarded: number;
  startedAt?: string;
  completedAt?: string;
}

export interface XpTransactionRecord {
  transactionId: string;
  schoolId: string;
  studentId: string;
  sourceType: 'BaseCampVisited' | 'CharacterSelected' | 'WorldOpened' | 'CheckpointCompleted' | 'ExamCompleted';
  sourceRefId: string;
  worldId?: string;
  amount: number;
  previousTotalXp: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  description: string;
  createdAt: string;
}

export interface AdventureEventRecord {
  eventId: string;
  schoolId: string;
  studentId: string;
  eventType:
    | 'CharacterSelected'
    | 'BaseCampVisited'
    | 'WorldOpened'
    | 'CheckpointOpened'
    | 'CheckpointCompleted'
    | 'XPGranted'
    | 'LevelUp'
    | 'BadgeEarned';
  worldId?: string;
  checkpointId?: string;
  badgeId?: string;
  xpAmount?: number;
  levelAfter?: number;
  detail: string;
  createdAt: string;
}

// --- STAGE 4: AI QUESTION IMPORT TYPES ---

export type ImportSourceMode = 'document' | 'photo' | 'camera';
export type ImportBatchStatus =
  | 'uploaded'
  | 'processing'
  | 'review_required'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type CandidateExtractionStatus = 'success' | 'needs_review' | 'failed';
export type ImportDetectedKind = 'docx' | 'pdf' | 'xlsx' | 'csv' | 'image';

export interface ImportFileMeta {
  id: string;
  originalName: string;
  sanitizedName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sourceMode: ImportSourceMode;
  detectedKind: ImportDetectedKind;
  uploadedAt: string;
  pageCount?: number;
  scannedPdf?: boolean;
}

export interface ImportTempAsset {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sourceFileName: string;
  pageOrIndex?: number;
}

export interface ExtractedQuestionCandidate {
  id: string;
  orderIndex: number;
  subjectId: SubjectId;
  grade: string;
  semester: 'Ganjil' | 'Genap';
  topic: string;
  competency: string;
  indicator: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  prompt: string;
  options?: string[];
  matchLeft?: string[];
  matchRight?: string[];
  orderingItems?: string[];
  dragItems?: DragItem[];
  dragTargets?: DragTarget[];
  imageOptions?: ImageOptionItem[];
  correctAnswer: string;
  hasExplicitKey: boolean;
  aiSuggestedAnswer?: string;
  aiSuggestionApproved: boolean;
  aiSuggestionConfidence?: number;
  aiSuggestionNote?: string;
  acceptedVariations?: string[];
  numericTolerance?: number;
  rubric?: string;
  explanation?: string;
  weight: number;
  imageUrl?: string;
  tempAssetId?: string;
  removeImage?: boolean;
  sourceFileName: string;
  sourceFileType: string;
  sourcePage?: number;
  sourceQuestionNumber?: string;
  extractionStatus: CandidateExtractionStatus;
  extractionConfidence: number;
  needsReview: boolean;
  uncertainSegments: string[];
  validationWarnings: string[];
  duplicateOfId?: string;
  duplicatePromptPreview?: string;
  duplicateSimilarity?: number;
  selectedForSave: boolean;
}

export interface ImportBatchSummaryStats {
  totalFiles: number;
  totalExtracted: number;
  readyCount: number;
  needsReviewCount: number;
  failedCount: number;
  missingKeyCount: number;
  duplicateCount: number;
  savedCount: number;
}

export interface ImportBatchRecord {
  id: string;
  schoolId: string;
  ownerId: string;
  ownerName: string;
  sourceMode: ImportSourceMode;
  defaultSubjectId: SubjectId;
  defaultGrade: string;
  defaultSemester: 'Ganjil' | 'Genap';
  defaultTopic: string;
  status: ImportBatchStatus;
  progressPercent: number;
  progressStage: string;
  progressMessage: string;
  errorMessage?: string;
  errorCode?: string;
  files: ImportFileMeta[];
  tempAssets: ImportTempAsset[];
  candidates: ExtractedQuestionCandidate[];
  stats: ImportBatchSummaryStats;
  savedQuestionIds: string[];
  duplicateSkippedIds?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ImportHistorySummary {
  id: string;
  sourceMode: ImportSourceMode;
  defaultSubjectId: SubjectId;
  defaultGrade: string;
  defaultSemester: 'Ganjil' | 'Genap';
  defaultTopic: string;
  status: ImportBatchStatus;
  fileNames: string[];
  stats: ImportBatchSummaryStats;
  savedQuestionIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// --- STAGE 5: REPORTING, ANALYTICS & GAMIFICATION CONFIG TYPES ---

export type AttemptPolicy = 'best' | 'latest' | 'first' | 'all_attempts';
export type ReportScope = 'official' | 'practice' | 'all';
export type CompletionStatusFilter = 'all' | 'final' | 'waiting_essay';

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
  gradingStatus: string;
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

export interface AdventureProgressExplorerRow {
  studentId: string;
  displayName: string;
  gradeClass: string;
  characterId: ExplorerCharacterId;
  characterSelected: boolean;
  totalXp: number;
  level: number;
  levelTitle: string;
  worldsExploredCount: number;
  worldsCompletedCount: number;
  checkpointsCompletedCount: number;
  badgesEarnedCount: number;
  earnedBadgeNames: string[];
  activeDaysCount: number;
  lastWorldId?: string;
  lastWorldName?: string;
  lastActivityDate: string;
  worldStatuses: Record<string, AdventureWorldStatus>;
}

export interface AdventureProgressReportResponse {
  ok: boolean;
  summary: {
    totalExplorers: number;
    characterSelectedCount: number;
    averageXp: number;
    averageLevel: number;
    totalWorldsCompleted: number;
    totalCheckpointsCompleted: number;
    totalBadgesEarned: number;
  };
  explorers: AdventureProgressExplorerRow[];
  worldsCatalog: Array<{ id: string; number: number; subjectName: string; worldName: string }>;
}

export interface BadgeRuleConfig {
  id: string;
  name?: string;
  description?: string;
  targetCount?: number;
  xpThreshold?: number;
  isActive?: boolean;
}

export interface GamificationConfig {
  schoolId: string;
  xpBaseCampVisit: number;
  xpCharacterSelect: number;
  xpWorldOpen: number;
  xpExamOfficial: number;
  xpExamPractice: number;
  xpExamSimulation: number;
  badgeOverrides: Record<string, BadgeRuleConfig>;
  updatedBy?: string;
  updatedAt?: string;
}

export interface LevelThreshold {
  level: number;
  title: string;
  minXp: number;
  nextMinXp: number | null;
}


