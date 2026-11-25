import { getCurrentUserIdToken } from '../lib/firebase';
import type {
  AdventureCelebrationDelta,
  AdventureCheckpointItem,
  AdventureEventRecord,
  AdventureProfile,
  AdventureProgressReportResponse,
  AdventureWorldSummary,
  AppSettings,
  AssessmentConfig,
  AssessmentMode,
  AssessmentResult,
  AssessmentSession,
  AssessmentStatus,
  AssessmentType,
  BadgeCatalogViewItem,
  BadgeRuleConfig,
  BagStyleId,
  CheckpointType,
  ClassRoom,
  ComputedLevelInfo,
  DifficultyLevel,
  ExplorerCharacterId,
  ExtractedQuestionCandidate,
  GamificationConfig,
  ImportBatchRecord,
  ImportHistorySummary,
  ImportSourceMode,
  LevelThreshold,
  NavigationMode,
  OutfitThemeId,
  PublicAssessment,
  PublicQuestion,
  QuestionBankItem,
  QuestionOutcome,
  QuestionWithKey,
  ReportingFilters,
  ResultPolicy,
  RosterStudent,
  SchoolProfile,
  ScoringPolicy,
  ShoeStyleId,
  Stage5ReportPayload,
  SubjectId,
  SubjectRecord,
  UserRole,
  XpTransactionRecord,
} from '../types/psas';

export interface BackendHealthResponse {
  status: string;
  service: string;
  schoolId: string;
  schoolName: string;
  environment: string;
  firebaseConfigured: boolean;
  firebaseProjectId: string | null;
  firestoreDatabaseId: string | null;
  firestoreConnected: boolean;
  firestoreDetail: string | null;
  projectTier: string;
  adminSdkTokenVerifierReady: boolean;
  geminiConfigured: boolean;
  timestamp: string;
}

export interface StaffMeResponse {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  schoolId: string;
  schoolName: string;
  isActive: boolean;
}

export interface TeacherDashboardApiResponse {
  teacher: {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    schoolId: string;
  };
  school: SchoolProfile | null;
  settings: AppSettings | null;
  summary: {
    studentCount: number;
    classCount: number;
    totalAssessments: number;
    activeAssessmentCount: number;
    closedAssessmentCount: number;
    completedSessionCount: number;
    inProgressSessionCount: number;
    gradedResultCount: number;
    questionBankCount: number;
    averageScore: number | null;
  };
}

export interface AdminDashboardApiResponse {
  admin: {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    schoolId: string;
  };
  school: SchoolProfile | null;
  counts: {
    classes: number;
    subjects: number;
    students: number;
    assessments: number;
    teachers: number;
  };
  usageSummary?: {
    activeSessions: number;
    submittedSessions: number;
    officialSubmissions: number;
    practiceSubmissions: number;
    questionBankCount: number;
    importBatchesCount: number;
    adventureExplorersCount: number;
    totalXpGranted: number;
    totalBadgesEarned: number;
  };
  recentAuditLogs: Array<{
    id: string;
    action: string;
    actorName?: string;
    actorId: string;
    status: string;
    detail?: string;
  }>;
}

export interface StudentLoginApiResponse {
  valid: boolean;
  code?: string;
  message?: string;
  requiresParticipantNumber?: boolean;
  retryAfterSeconds?: number;
  sessionId?: string;
  studentId?: string;
  studentName?: string;
  classId?: string;
  gradeClass?: string;
  participantNumber?: string;
  characterId?: ExplorerCharacterId;
  characterSelected?: boolean;
  assessmentId?: string;
  assessment?: PublicAssessment;
  resumingSession?: AssessmentSession | null;
  resumingExisting?: boolean;
  token?: string;
  tokenExpiresAt?: string;
}

export interface StudentProfileApiResponse {
  studentId: string;
  studentName: string;
  classId: string;
  gradeClass: string;
  participantNumber: string | null;
  characterId: ExplorerCharacterId;
  schoolId: string;
  schoolName: string;
  sessionId: string;
  assessmentId: string;
  subjectId: string;
  tokenExpiresAt: string;
}

export interface StudentDashboardApiResponse {
  schoolId: string;
  schoolName: string;
  student: {
    studentId: string;
    studentName: string;
    classId: string;
    gradeClass: string;
    participantNumber: string | null;
    characterId: ExplorerCharacterId;
  };
  subjects: SubjectRecord[];
  publicAssessments: PublicAssessment[];
  activeSession: AssessmentSession | null;
}

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

async function fetchWithStaffAuth<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getCurrentUserIdToken();
  if (!token) {
    throw new ApiClientError('Sesi Google belum aktif untuk menghubungi server.', 401, 'NO_ID_TOKEN');
  }
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data?.error || `Permintaan gagal (${res.status})`,
      res.status,
      data?.code || `HTTP_${res.status}`
    );
  }
  return data;
}

async function fetchWithStudentAuth<T>(
  url: string,
  studentToken: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${studentToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data?.error || `Permintaan siswa gagal (${res.status})`,
      res.status,
      data?.code || `HTTP_${res.status}`
    );
  }
  return data;
}

export async function fetchBackendHealth(): Promise<BackendHealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new ApiClientError('Server backend belum merespons.', res.status, 'HEALTH_FAILED');
  }
  return (await res.json()) as BackendHealthResponse;
}

export async function fetchCurrentStaffMe(): Promise<StaffMeResponse> {
  return fetchWithStaffAuth<StaffMeResponse>('/api/me');
}

export async function fetchTeacherDashboardSummary(): Promise<TeacherDashboardApiResponse> {
  return fetchWithStaffAuth<TeacherDashboardApiResponse>('/api/teacher/dashboard');
}

export async function fetchAdminDashboardSummary(): Promise<AdminDashboardApiResponse> {
  return fetchWithStaffAuth<AdminDashboardApiResponse>('/api/admin/dashboard');
}

export async function fetchClassesFromApi(): Promise<ClassRoom[]> {
  const res = await fetch('/api/classes');
  const data = (await res.json().catch(() => ({}))) as { items?: ClassRoom[]; error?: string; code?: string };
  if (!res.ok) {
    throw new ApiClientError(data.error || 'Gagal memuat daftar kelas.', res.status, data.code);
  }
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchSubjectsFromApi(): Promise<SubjectRecord[]> {
  const res = await fetch('/api/subjects');
  const data = (await res.json().catch(() => ({}))) as { items?: SubjectRecord[]; error?: string; code?: string };
  if (!res.ok) {
    throw new ApiClientError(data.error || 'Gagal memuat daftar mata pelajaran.', res.status, data.code);
  }
  return Array.isArray(data.items) ? data.items : [];
}

export async function studentLoginViaApi(payload: {
  schoolId?: string;
  classId: string;
  gradeClass: string;
  studentName: string;
  examCode: string;
  participantNumber?: string;
  characterId: ExplorerCharacterId;
}): Promise<{ ok: boolean; status: number; data: StudentLoginApiResponse }> {
  const res = await fetch('/api/student/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({ valid: false }))) as StudentLoginApiResponse;
  return { ok: res.ok, status: res.status, data };
}

export async function studentLogoutViaApi(studentToken: string | null): Promise<void> {
  if (!studentToken) return;
  try {
    await fetch('/api/student/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ token: studentToken }),
    });
  } catch {
    // Non-blocking logout notification
  }
}

export async function fetchStudentProfileViaApi(
  studentToken: string
): Promise<StudentProfileApiResponse> {
  return fetchWithStudentAuth<StudentProfileApiResponse>('/api/student/profile', studentToken);
}

export async function fetchStudentDashboardViaApi(
  studentToken: string
): Promise<StudentDashboardApiResponse> {
  return fetchWithStudentAuth<StudentDashboardApiResponse>('/api/student/dashboard', studentToken);
}

// --- STAGE 2: ADVENTURE ENGINE API CLIENT ---

export interface StudentBaseCampResponse {
  ok: boolean;
  profile: AdventureProfile;
  levelInfo: ComputedLevelInfo;
  worlds: AdventureWorldSummary[];
  badges: BadgeCatalogViewItem[];
  recentXpHistory: XpTransactionRecord[];
  recentEvents: AdventureEventRecord[];
  celebration: AdventureCelebrationDelta | null;
}

export interface StudentWorldDetailResponse {
  ok: boolean;
  world: AdventureWorldSummary;
  checkpoints: AdventureCheckpointItem[];
  profile: AdventureProfile;
  levelInfo: ComputedLevelInfo;
  celebration?: AdventureCelebrationDelta;
}

export interface TeacherAdventureOverviewResponse {
  ok: boolean;
  summary: {
    totalActiveExplorers: number;
    characterSelectedCount: number;
    totalCheckpointsCompleted: number;
    totalBadgesEarned: number;
    totalXpGranted: number;
  };
  levelDistribution: Array<{ level: number; title: string; count: number }>;
  badgeSummary: Array<{ id: string; name: string; category: string; earnedCount: number }>;
  worlds: Array<{
    id: string;
    number: number;
    subjectName: string;
    worldName: string;
    isAvailable: boolean;
    availabilityReason: string;
    scheduleLabel: string;
    configSource: string;
    checkpoints: AdventureCheckpointItem[];
    explorersStartedCount: number;
    explorersCompletedCount: number;
  }>;
  recentExplorers: Array<{
    studentId: string;
    displayName: string;
    gradeClass: string;
    characterId: ExplorerCharacterId;
    characterSelected: boolean;
    level: number;
    levelTitle: string;
    totalXp: number;
    worldsCompletedCount: number;
    badgesEarnedCount: number;
    lastWorldId?: string;
    updatedAt: string;
  }>;
}

export async function fetchStudentAdventureCharacter(
  studentToken: string
): Promise<{ ok: boolean; profile: AdventureProfile }> {
  return fetchWithStudentAuth('/api/student/adventure/character', studentToken);
}

export async function saveStudentAdventureCharacter(
  studentToken: string,
  payload: {
    characterId: ExplorerCharacterId;
    outfitTheme?: OutfitThemeId;
    bagStyle?: BagStyleId;
    shoeStyle?: ShoeStyleId;
    accentColor?: string;
    nickname?: string;
  }
): Promise<{ ok: boolean; profile: AdventureProfile; celebration: AdventureCelebrationDelta }> {
  return fetchWithStudentAuth('/api/student/adventure/character', studentToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchStudentBaseCamp(
  studentToken: string
): Promise<StudentBaseCampResponse> {
  return fetchWithStudentAuth('/api/student/adventure/basecamp', studentToken);
}

export async function fetchAdventureWorldDetail(
  studentToken: string,
  worldId: string
): Promise<StudentWorldDetailResponse> {
  return fetchWithStudentAuth(
    `/api/student/adventure/world/${encodeURIComponent(worldId)}`,
    studentToken
  );
}

export async function openAdventureWorld(
  studentToken: string,
  worldId: string
): Promise<StudentWorldDetailResponse> {
  return fetchWithStudentAuth(
    `/api/student/adventure/world/${encodeURIComponent(worldId)}/open`,
    studentToken,
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function startAdventureCheckpoint(
  studentToken: string,
  checkpointId: string
): Promise<{ ok: boolean; checkpoint: AdventureCheckpointItem; profile: AdventureProfile }> {
  return fetchWithStudentAuth(
    `/api/student/adventure/checkpoint/${encodeURIComponent(checkpointId)}/start`,
    studentToken,
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function completeAdventureCheckpoint(
  studentToken: string,
  checkpointId: string
): Promise<{
  ok: boolean;
  checkpoint: AdventureCheckpointItem;
  world: AdventureWorldSummary;
  profile: AdventureProfile;
  levelInfo: ComputedLevelInfo;
  celebration: AdventureCelebrationDelta;
}> {
  return fetchWithStudentAuth(
    `/api/student/adventure/checkpoint/${encodeURIComponent(checkpointId)}/complete`,
    studentToken,
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function fetchStudentXpHistory(studentToken: string): Promise<{
  ok: boolean;
  levelInfo: ComputedLevelInfo;
  transactions: XpTransactionRecord[];
  events: AdventureEventRecord[];
}> {
  return fetchWithStudentAuth('/api/student/adventure/xp/history', studentToken);
}

export async function fetchStudentBadges(studentToken: string): Promise<{
  ok: boolean;
  earnedCount: number;
  totalCatalogCount: number;
  badges: BadgeCatalogViewItem[];
}> {
  return fetchWithStudentAuth('/api/student/adventure/badges', studentToken);
}

export async function recordAdventureExamCompletedHook(
  studentToken: string,
  payload: { sessionId: string; assessmentId: string; worldId: string }
): Promise<{ ok: boolean; celebration: AdventureCelebrationDelta }> {
  return fetchWithStudentAuth('/api/student/adventure/exam-completed', studentToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchTeacherAdventureOverview(): Promise<TeacherAdventureOverviewResponse> {
  return fetchWithStaffAuth('/api/teacher/adventure/overview');
}

export async function updateTeacherWorldConfig(
  worldId: string,
  payload: { isAvailable: boolean; availabilityReason?: string; scheduleLabel?: string }
): Promise<{ ok: boolean; firestoreSynced: boolean }> {
  return fetchWithStaffAuth(`/api/teacher/adventure/worlds/${encodeURIComponent(worldId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function saveTeacherCheckpoint(payload: {
  id?: string;
  worldId: string;
  order: number;
  title: string;
  storyIntro: string;
  storyOutro?: string;
  challengePrompt?: string;
  challengeOptions?: string[];
  helpfulHint?: string;
  checkpointType: CheckpointType;
  xpReward: number;
}): Promise<{ ok: boolean; firestoreSynced: boolean }> {
  return fetchWithStaffAuth('/api/teacher/adventure/checkpoints', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteTeacherCheckpoint(
  checkpointId: string
): Promise<{ ok: boolean; checkpointId: string }> {
  return fetchWithStaffAuth(
    `/api/teacher/adventure/checkpoints/${encodeURIComponent(checkpointId)}`,
    { method: 'DELETE' }
  );
}

export async function syncAdminAdventureDefaults(): Promise<{
  ok: boolean;
  worldsSynced: number;
  checkpointsSynced: number;
  badgesSynced: number;
}> {
  return fetchWithStaffAuth('/api/admin/adventure/sync-defaults', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// --- STAGE 3: ASSESSMENT ENGINE API CLIENT ---

export interface TeacherExamListItem extends AssessmentConfig {
  questionCount: number;
  totalWeight: number;
  participantCount: number;
  sessionCount: number;
  submissionCount: number;
  pendingEssayCount: number;
}

export interface StudentExamIntroInfo {
  examId: string;
  title: string;
  description?: string;
  subjectId: SubjectId;
  worldName: string;
  subjectName: string;
  companionName: string;
  grade: string;
  semester: 'Ganjil' | 'Genap';
  examType: AssessmentType;
  mode: AssessmentMode;
  durationMinutes: number;
  questionCount: number;
  navigationMode: NavigationMode;
  allowBack: boolean;
  maxAttempts: number;
  attemptNumber: number;
  remainingAttempts: number;
  hasInProgressSession: boolean;
  inProgressSessionId?: string;
  startsAt?: string;
  endsAt?: string;
  introStory: string;
  serverNowAt: string;
}

export interface StudentSessionPayloadResponse {
  ok: boolean;
  serverNowAt: string;
  remainingSeconds: number;
  session: AssessmentSession;
  exam: {
    id: string;
    title: string;
    subjectId: SubjectId;
    examType: AssessmentType;
    mode: AssessmentMode;
    durationMinutes: number;
    navigationMode: NavigationMode;
    allowBack: boolean;
    allowEditAfterAnswer: boolean;
    requireAnswerBeforeNext: boolean;
    audioEnabled: boolean;
    resultPolicy: ResultPolicy;
  };
  questions: PublicQuestion[];
  savedAnswers: Record<string, string>;
  flaggedIds: string[];
}

export interface StudentSubmissionSummary {
  submissionId: string;
  sessionId: string;
  assessmentId: string;
  assessmentTitle: string;
  subjectId: SubjectId;
  examMode: AssessmentMode;
  examType: AssessmentType;
  isOfficialScore: boolean;
  attemptNumber: number;
  gradingStatus: 'auto_graded' | 'waiting_essay_grading' | 'finalized';
  needsManualReview: boolean;
  scoreVisible: boolean;
  finalScore: number | null;
  objectiveScore: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number;
  durationSeconds: number;
  submittedAt: string;
  statusLabel: string;
  celebration?: AdventureCelebrationDelta;
  reviewItems?: Array<{
    questionId: string;
    prompt: string;
    outcome?: QuestionOutcome;
    correctAnswer?: string;
    explanation?: string;
  }>;
}

export interface StudentSessionStatusResponse {
  ok: boolean;
  sessionId: string;
  status: 'in_progress' | 'submitted' | 'graded';
  serverNowAt: string;
  deadlineAt: string;
  remainingSeconds: number;
  answeredCount: number;
  flaggedCount: number;
  totalQuestions: number;
  autoSubmittedByTimeout: boolean;
  submissionSummary?: StudentSubmissionSummary;
}

export async function fetchTeacherQuestions(filters?: {
  search?: string;
  subjectId?: string;
  grade?: string;
  type?: string;
  topic?: string;
  difficulty?: string;
  status?: 'active' | 'archived' | 'all';
}): Promise<{ ok: boolean; items: QuestionBankItem[]; total: number }> {
  const qs = new URLSearchParams();
  if (filters?.search) qs.set('search', filters.search);
  if (filters?.subjectId) qs.set('subjectId', filters.subjectId);
  if (filters?.grade) qs.set('grade', filters.grade);
  if (filters?.type) qs.set('type', filters.type);
  if (filters?.topic) qs.set('topic', filters.topic);
  if (filters?.difficulty) qs.set('difficulty', filters.difficulty);
  if (filters?.status) qs.set('status', filters.status);
  const query = qs.toString();
  return fetchWithStaffAuth(`/api/teacher/questions${query ? `?${query}` : ''}`);
}

export async function saveTeacherQuestion(
  item: Partial<QuestionBankItem>,
  existingId?: string
): Promise<{ ok: boolean; item: QuestionBankItem }> {
  if (existingId) {
    return fetchWithStaffAuth(`/api/teacher/questions/${encodeURIComponent(existingId)}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  }
  return fetchWithStaffAuth('/api/teacher/questions', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function deleteOrArchiveTeacherQuestion(
  questionId: string,
  forceArchive = false
): Promise<{ ok: boolean; action: 'deleted' | 'archived'; item?: QuestionBankItem; message: string }> {
  return fetchWithStaffAuth(
    `/api/teacher/questions/${encodeURIComponent(questionId)}${forceArchive ? '?archive=true' : ''}`,
    { method: 'DELETE' }
  );
}

export async function duplicateTeacherQuestion(
  questionId: string
): Promise<{ ok: boolean; item: QuestionBankItem }> {
  return fetchWithStaffAuth(`/api/teacher/questions/${encodeURIComponent(questionId)}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchTeacherExams(
  statusFilter?: AssessmentStatus | 'all'
): Promise<{ ok: boolean; items: TeacherExamListItem[] }> {
  const qs = statusFilter && statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
  return fetchWithStaffAuth(`/api/teacher/exams${qs}`);
}

export async function fetchTeacherExamDetail(examId: string): Promise<{
  ok: boolean;
  exam: AssessmentConfig;
  questions: QuestionWithKey[];
  participantCount: number;
  sessionCount: number;
  submissionCount: number;
  sessions: AssessmentSession[];
}> {
  return fetchWithStaffAuth(`/api/teacher/exams/${encodeURIComponent(examId)}`);
}

export async function saveTeacherExam(
  exam: Partial<AssessmentConfig> & { confirmActiveEdit?: boolean },
  existingId?: string
): Promise<{ ok: boolean; exam: AssessmentConfig; warning?: string }> {
  if (existingId) {
    return fetchWithStaffAuth(`/api/teacher/exams/${encodeURIComponent(existingId)}`, {
      method: 'PUT',
      body: JSON.stringify(exam),
    });
  }
  return fetchWithStaffAuth('/api/teacher/exams', {
    method: 'POST',
    body: JSON.stringify(exam),
  });
}

export async function attachOrAddExamQuestions(
  examId: string,
  payload: {
    bankItemIds?: string[];
    question?: Partial<QuestionWithKey>;
    saveToBank?: boolean;
    reorderIds?: string[];
    weightUpdates?: Array<{ questionId: string; weight: number }>;
  }
): Promise<{ ok: boolean; questions: QuestionWithKey[] }> {
  return fetchWithStaffAuth(`/api/teacher/exams/${encodeURIComponent(examId)}/questions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function removeExamQuestion(
  examId: string,
  questionId: string
): Promise<{ ok: boolean; questions: QuestionWithKey[] }> {
  return fetchWithStaffAuth(
    `/api/teacher/exams/${encodeURIComponent(examId)}/questions/${encodeURIComponent(questionId)}`,
    { method: 'DELETE' }
  );
}

export async function publishTeacherExam(
  examId: string
): Promise<{ ok: boolean; exam: AssessmentConfig }> {
  return fetchWithStaffAuth(`/api/teacher/exams/${encodeURIComponent(examId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function closeTeacherExam(
  examId: string
): Promise<{ ok: boolean; exam: AssessmentConfig }> {
  return fetchWithStaffAuth(`/api/teacher/exams/${encodeURIComponent(examId)}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function archiveTeacherExam(
  examId: string
): Promise<{ ok: boolean; exam: AssessmentConfig }> {
  return fetchWithStaffAuth(`/api/teacher/exams/${encodeURIComponent(examId)}/archive`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function syncExamMirrorToServer(payload: {
  assessment?: Partial<AssessmentConfig>;
  questions?: Array<Partial<QuestionWithKey>>;
  bankItems?: Array<Partial<QuestionBankItem>>;
}): Promise<void> {
  const token = await getCurrentUserIdToken();
  if (!token) return;
  try {
    await fetchWithStaffAuth('/api/teacher/exams/sync-mirror', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-fatal background mirror
  }
}

export async function fetchTeacherExamResults(examId: string): Promise<{
  ok: boolean;
  exam: AssessmentConfig | null;
  isOfficialRecap: boolean;
  submissions: AssessmentResult[];
}> {
  return fetchWithStaffAuth(`/api/teacher/exams/${encodeURIComponent(examId)}/results`);
}

export async function fetchTeacherSubmissionDetail(submissionId: string): Promise<{
  ok: boolean;
  submission: AssessmentResult;
  exam: AssessmentConfig | null;
  session: AssessmentSession | null;
  questions: QuestionWithKey[];
  answers: Record<string, { answerValue: string; isAnswered: boolean; updatedAt: string }>;
}> {
  return fetchWithStaffAuth(`/api/teacher/submissions/${encodeURIComponent(submissionId)}`);
}

export async function gradeSubmissionEssays(
  submissionId: string,
  grades: Array<{ questionId: string; score: number; comment?: string }>
): Promise<{ ok: boolean; submission: AssessmentResult }> {
  return fetchWithStaffAuth(`/api/teacher/submissions/${encodeURIComponent(submissionId)}/grade`, {
    method: 'POST',
    body: JSON.stringify({ grades }),
  });
}

export async function enterStudentExam(
  studentToken: string,
  assessmentId?: string
): Promise<{ ok: boolean; examInfo: StudentExamIntroInfo }> {
  return fetchWithStudentAuth('/api/student/exam/enter', studentToken, {
    method: 'POST',
    body: JSON.stringify({ assessmentId }),
  });
}

export async function startStudentExam(
  studentToken: string,
  assessmentId?: string
): Promise<StudentSessionPayloadResponse> {
  return fetchWithStudentAuth('/api/student/exam/start', studentToken, {
    method: 'POST',
    body: JSON.stringify({ assessmentId }),
  });
}

export async function fetchStudentExamSession(
  studentToken: string,
  sessionId?: string
): Promise<StudentSessionPayloadResponse> {
  const url = sessionId
    ? `/api/student/exam/session/${encodeURIComponent(sessionId)}`
    : '/api/student/exam/session';
  return fetchWithStudentAuth(url, studentToken);
}

export async function autosaveStudentAnswer(
  studentToken: string,
  sessionId: string,
  payload: { questionId: string; answerValue: string; currentIndex?: number }
): Promise<{
  ok: boolean;
  savedAt: string;
  serverNowAt: string;
  answeredIds: string[];
  progressPercent: number;
}> {
  return fetchWithStudentAuth(
    `/api/student/exam/session/${encodeURIComponent(sessionId)}/answer`,
    studentToken,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function toggleStudentQuestionFlag(
  studentToken: string,
  sessionId: string,
  questionId: string,
  flagged?: boolean
): Promise<{ ok: boolean; flaggedIds: string[] }> {
  return fetchWithStudentAuth(
    `/api/student/exam/session/${encodeURIComponent(sessionId)}/flag`,
    studentToken,
    {
      method: 'POST',
      body: JSON.stringify({ questionId, flagged }),
    }
  );
}

export async function fetchStudentExamStatus(
  studentToken: string,
  sessionId: string
): Promise<StudentSessionStatusResponse> {
  return fetchWithStudentAuth(
    `/api/student/exam/session/${encodeURIComponent(sessionId)}/status`,
    studentToken
  );
}

export async function submitStudentExam(
  studentToken: string,
  sessionId: string,
  options?: {
    pendingAnswers?: Array<{ questionId: string; answerValue: string }>;
    autoSubmittedByTimeout?: boolean;
  }
): Promise<{
  ok: boolean;
  alreadySubmitted: boolean;
  result: StudentSubmissionSummary | null;
}> {
  return fetchWithStudentAuth(
    `/api/student/exam/session/${encodeURIComponent(sessionId)}/submit`,
    studentToken,
    {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }
  );
}

export async function fetchStudentResults(studentToken: string): Promise<{
  ok: boolean;
  items: StudentSubmissionSummary[];
}> {
  return fetchWithStudentAuth('/api/student/results', studentToken);
}

// --- STAGE 4: AI QUESTION IMPORT API CLIENT ---

export interface ImportStatusResponse {
  ok: boolean;
  geminiConfigured: boolean;
  maxFileSizeBytes: number;
  maxFilesPerBatch: number;
  storageBucketConfigured: boolean;
}

export async function fetchImportStatus(): Promise<ImportStatusResponse> {
  return fetchWithStaffAuth('/api/teacher/import/status');
}

export async function fetchImportBatches(): Promise<{
  ok: boolean;
  items: ImportHistorySummary[];
}> {
  return fetchWithStaffAuth('/api/teacher/import/batches');
}

export async function createImportBatch(payload: {
  sourceMode: ImportSourceMode;
  defaultSubjectId: SubjectId;
  defaultGrade: string;
  defaultSemester: 'Ganjil' | 'Genap';
  defaultTopic: string;
}): Promise<{ ok: boolean; batch: ImportBatchRecord }> {
  return fetchWithStaffAuth('/api/teacher/import/batches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadImportFiles(
  batchId: string,
  files: File[],
  sourceMode: ImportSourceMode
): Promise<{ ok: boolean; batch: ImportBatchRecord }> {
  const formData = new FormData();
  formData.append('sourceMode', sourceMode);
  for (const file of files) {
    formData.append('files', file, file.name);
  }
  return fetchWithStaffAuth(`/api/teacher/import/batches/${encodeURIComponent(batchId)}/upload`, {
    method: 'POST',
    body: formData,
  });
}

export async function extractImportBatch(
  batchId: string
): Promise<{ ok: boolean; batch: ImportBatchRecord }> {
  return fetchWithStaffAuth(`/api/teacher/import/batches/${encodeURIComponent(batchId)}/extract`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchImportBatchDetail(
  batchId: string
): Promise<{ ok: boolean; batch: ImportBatchRecord }> {
  return fetchWithStaffAuth(`/api/teacher/import/batches/${encodeURIComponent(batchId)}`);
}

export async function updateImportBatchQuestions(
  batchId: string,
  candidates: ExtractedQuestionCandidate[]
): Promise<{ ok: boolean; batch: ImportBatchRecord }> {
  return fetchWithStaffAuth(`/api/teacher/import/batches/${encodeURIComponent(batchId)}/questions`, {
    method: 'PUT',
    body: JSON.stringify({ candidates }),
  });
}

export async function saveImportBatchToBank(
  batchId: string,
  options?: { selectedIds?: string[]; skipDuplicates?: boolean }
): Promise<{
  ok: boolean;
  alreadySaved: boolean;
  savedQuestionIds: string[];
  storageWarnings: string[];
  batch: ImportBatchRecord;
}> {
  return fetchWithStaffAuth(`/api/teacher/import/batches/${encodeURIComponent(batchId)}/save`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function cancelImportBatch(
  batchId: string
): Promise<{ ok: boolean; batch: ImportBatchRecord }> {
  return fetchWithStaffAuth(`/api/teacher/import/batches/${encodeURIComponent(batchId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchImportTempAssetBlobUrl(
  batchId: string,
  assetId: string
): Promise<string | null> {
  const token = await getCurrentUserIdToken();
  if (!token) return null;
  const res = await fetch(
    `/api/teacher/import/batches/${encodeURIComponent(batchId)}/assets/${encodeURIComponent(assetId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// --- STAGE 5: REPORTING, ANALYTICS & ADMIN GAMIFICATION CONFIG ---

export async function fetchTeacherStage5Report(payload: {
  filters?: ReportingFilters;
  clientAssessments?: AssessmentConfig[];
  clientQuestions?: PublicQuestion[];
  clientResults?: AssessmentResult[];
  clientSessions?: Array<{ sessionId: string; answers?: Record<string, { questionId: string; answerValue: string; isAnswered?: boolean }> }>;
  clientRoster?: RosterStudent[];
  clientClasses?: ClassRoom[];
}): Promise<{ ok: boolean; report: Stage5ReportPayload }> {
  return fetchWithStaffAuth('/api/teacher/reports/summary', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchTeacherAdventureProgressReport(filters?: {
  classFilter?: string;
  search?: string;
  level?: number;
}): Promise<AdventureProgressReportResponse> {
  const qs = new URLSearchParams();
  if (filters?.classFilter) qs.set('classFilter', filters.classFilter);
  if (filters?.search) qs.set('search', filters.search);
  if (typeof filters?.level === 'number' && filters.level >= 1) qs.set('level', String(filters.level));
  const query = qs.toString();
  return fetchWithStaffAuth(`/api/teacher/reports/adventure-progress${query ? `?${query}` : ''}`);
}

export async function fetchAdminGamificationConfig(): Promise<{
  ok: boolean;
  config: GamificationConfig;
  levelThresholds: LevelThreshold[];
  effectiveBadges: Array<BadgeCatalogViewItem & { targetCount?: number; xpThreshold?: number; isActive: boolean }>;
}> {
  return fetchWithStaffAuth('/api/admin/gamification/config');
}

export async function saveAdminGamificationConfig(payload: {
  xpBaseCampVisit: number;
  xpCharacterSelect: number;
  xpWorldOpen: number;
  xpExamOfficial: number;
  xpExamPractice: number;
  xpExamSimulation: number;
  badges?: BadgeRuleConfig[];
}): Promise<{
  ok: boolean;
  config: GamificationConfig;
  effectiveBadges: Array<BadgeCatalogViewItem & { targetCount?: number; xpThreshold?: number; isActive: boolean }>;
  firestoreSynced: boolean;
}> {
  return fetchWithStaffAuth('/api/admin/gamification/config', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export type { DifficultyLevel, ScoringPolicy };




