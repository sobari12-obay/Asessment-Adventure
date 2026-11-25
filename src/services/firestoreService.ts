import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { DEFAULT_APP_SETTINGS } from '../data/starterSeed';
import { DEFAULT_INTRO_STORY, WORLDS, getWorldConfig } from '../data/worlds';
import {
  hashExamCode,
  hashStudentLookup,
  normalizeTextKey,
} from '../lib/cryptoHash';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  studentLoginViaApi,
  studentLogoutViaApi,
  syncExamMirrorToServer,
} from './apiClient';
import {
  DEFAULT_SCHOOL_ID,
  DEFAULT_SCHOOL_NAME,
  type AppSettings,
  type AssessmentAccessRecord,
  type AssessmentConfig,
  type AssessmentResult,
  type AssessmentSession,
  type AuditLogEntry,
  type ClassRoom,
  type ExplorerCharacterId,
  type PublicAssessment,
  type PublicQuestion,
  type QuestionBankItem,
  type QuestionKey,
  type QuestionWithKey,
  type RosterStudent,
  type StudentAccessKeyRecord,
  type StudentAnswer,
  type UserRole,
} from '../types/psas';

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
  return cleaned || `id_${Date.now()}`;
}

export function sanitizeCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  return cleaned.length >= 2 ? cleaned : `ASM${Date.now().toString().slice(-4)}`;
}

function clampStr(val: unknown, max: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.slice(0, max);
}

export function classNameToId(gradeClass: string): string {
  const slug = gradeClass
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitizeId(`kelas_${slug || '3a'}`);
}

// --- LOCAL OFFLINE QUEUE & SESSION RECOVERY (No sensitive HMAC tokens stored here) ---
const LOCAL_ACTIVE_SESSION_KEY = 'psas_active_session_id';
const LOCAL_COMPLETED_WORLDS_KEY = 'psas_completed_worlds';

interface PendingAnswerWrite {
  sessionId: string;
  assessmentId?: string;
  questionId: string;
  questionPromptSnapshot?: string;
  questionWeightSnapshot?: number;
  answerValue: string;
  isAnswered: boolean;
}

export function saveLocalSessionSnapshot(
  session: AssessmentSession,
  answersMap: Record<string, string>
) {
  try {
    localStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, session.id);
    localStorage.setItem(
      `psas_session_data_${session.id}`,
      JSON.stringify({ session, answersMap, savedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function getLocalSessionSnapshot(sessionId?: string): {
  session: AssessmentSession;
  answersMap: Record<string, string>;
  savedAt: string;
} | null {
  try {
    const id = sessionId || localStorage.getItem(LOCAL_ACTIVE_SESSION_KEY);
    if (!id) return null;
    const raw = localStorage.getItem(`psas_session_data_${id}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLocalActiveSession(sessionId?: string) {
  try {
    const id = sessionId || localStorage.getItem(LOCAL_ACTIVE_SESSION_KEY);
    localStorage.removeItem(LOCAL_ACTIVE_SESSION_KEY);
    if (id) {
      localStorage.removeItem(`psas_session_data_${id}`);
    }
  } catch {
    // Ignore
  }
}

export function recordCompletedWorldLocally(info: {
  subjectId: string;
  assessmentId: string;
  sessionId: string;
  artifactName: string;
  badgeTitle: string;
  starsEarned: number;
  completedAt: string;
}) {
  try {
    const existingRaw = localStorage.getItem(LOCAL_COMPLETED_WORLDS_KEY);
    const list: Array<typeof info> = existingRaw ? JSON.parse(existingRaw) : [];
    const filtered = list.filter((item) => item.assessmentId !== info.assessmentId);
    filtered.push(info);
    localStorage.setItem(LOCAL_COMPLETED_WORLDS_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore
  }
}

export function getCompletedWorldsLocally(): Array<{
  subjectId: string;
  assessmentId: string;
  sessionId: string;
  artifactName: string;
  badgeTitle: string;
  starsEarned: number;
  completedAt: string;
}> {
  try {
    const raw = localStorage.getItem(LOCAL_COMPLETED_WORLDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function enqueuePendingAnswer(write: PendingAnswerWrite) {
  try {
    const key = `psas_pending_answers_${write.sessionId}`;
    const raw = localStorage.getItem(key);
    const map: Record<string, PendingAnswerWrite> = raw ? JSON.parse(raw) : {};
    map[write.questionId] = write;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

function removePendingAnswer(sessionId: string, questionId: string) {
  try {
    const key = `psas_pending_answers_${sessionId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const map: Record<string, PendingAnswerWrite> = JSON.parse(raw);
    delete map[questionId];
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

export async function flushPendingOfflineAnswers(sessionId: string): Promise<number> {
  try {
    const key = `psas_pending_answers_${sessionId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const map: Record<string, PendingAnswerWrite> = JSON.parse(raw);
    const entries = Object.values(map);
    if (entries.length === 0) return 0;

    let synced = 0;
    for (const item of entries) {
      const answerId = sanitizeId(`${item.sessionId}__${item.questionId}`);
      const payload: Record<string, unknown> = {
        id: answerId,
        schoolId: DEFAULT_SCHOOL_ID,
        sessionId: item.sessionId,
        questionId: item.questionId,
        answerValue: clampStr(item.answerValue, 4000),
        isAnswered: item.isAnswered,
        updatedAt: serverTimestamp(),
      };
      if (item.assessmentId) payload.assessmentId = sanitizeId(item.assessmentId);
      if (item.questionPromptSnapshot) {
        payload.questionPromptSnapshot = clampStr(item.questionPromptSnapshot, 2000);
      }
      if (typeof item.questionWeightSnapshot === 'number') {
        payload.questionWeightSnapshot = Math.max(0, Math.min(100, item.questionWeightSnapshot));
      }
      await setDoc(doc(db, 'studentAnswers', answerId), payload);
      removePendingAnswer(item.sessionId, item.questionId);
      synced++;
    }
    return synced;
  } catch {
    return 0;
  }
}

// --- AUDIT LOGS ---
export async function logAuditEvent(params: {
  actorType: AuditLogEntry['actorType'];
  actorId: string;
  actorName?: string;
  action: string;
  targetCollection?: string;
  targetId?: string;
  status: AuditLogEntry['status'];
  detail?: string;
  schoolId?: string;
}): Promise<void> {
  try {
    const id = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const payload: Record<string, unknown> = {
      id,
      schoolId: params.schoolId || DEFAULT_SCHOOL_ID,
      actorType: params.actorType,
      actorId: clampStr(params.actorId || 'anonymous', 128, 'anonymous'),
      action: clampStr(params.action, 80, 'UNKNOWN_ACTION'),
      status: params.status,
      createdAt: serverTimestamp(),
    };
    if (params.actorName) payload.actorName = clampStr(params.actorName, 120);
    if (params.targetCollection) payload.targetCollection = clampStr(params.targetCollection, 64);
    if (params.targetId) payload.targetId = clampStr(params.targetId, 128);
    if (params.detail) payload.detail = clampStr(params.detail, 500);
    await setDoc(doc(db, 'auditLogs', id), payload);
  } catch {
    // Non-blocking audit logging
  }
}

export function subscribeAuditLogs(onUpdate: (logs: AuditLogEntry[]) => void): Unsubscribe {
  const q = query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as AuditLogEntry));
    },
    () => {
      // Fallback without orderBy if index not yet ready
      onUpdate([]);
    }
  );
}

// --- TEACHER, ADMIN & SETTINGS ---
export async function ensureTeacherProfile(
  user: User
): Promise<{ isAuthorized: boolean; role?: UserRole }> {
  const path = `teachers/${user.uid}`;
  try {
    const [teacherSnap, adminSnap] = await Promise.all([
      getDoc(doc(db, 'teachers', user.uid)),
      getDoc(doc(db, 'admins', user.uid)),
    ]);

    if (adminSnap.exists()) {
      return { isAuthorized: true, role: 'admin' };
    }
    if (teacherSnap.exists()) {
      const data = teacherSnap.data() as { role?: UserRole; isActive?: boolean };
      if (data.isActive === false) return { isAuthorized: false };
      return { isAuthorized: true, role: data.role || 'teacher' };
    }

    if (user.email === 'sobari12@guru.sd.belajar.id' && user.emailVerified) {
      const uid = sanitizeId(user.uid);
      const displayName = clampStr(user.displayName || 'Administrator SDN Pekiringan', 120);
      const email = clampStr(user.email, 200);
      const batch = writeBatch(db);
      batch.set(doc(db, 'teachers', uid), {
        uid,
        schoolId: DEFAULT_SCHOOL_ID,
        email,
        displayName,
        schoolName: DEFAULT_SCHOOL_NAME,
        role: 'admin',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', uid), {
        uid,
        schoolId: DEFAULT_SCHOOL_ID,
        email,
        displayName,
        role: 'admin',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      void logAuditEvent({
        actorType: 'admin',
        actorId: uid,
        actorName: displayName,
        action: 'TEACHER_BOOTSTRAP_LOGIN',
        targetCollection: 'teachers',
        targetId: uid,
        status: 'success',
        detail: `Login admin SDN Pekiringan (${email})`,
      });
      return { isAuthorized: true, role: 'admin' };
    }

    return { isAuthorized: false };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'app_config'));
    if (snap.exists()) {
      return snap.data() as AppSettings;
    }
    return { ...DEFAULT_APP_SETTINGS };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export async function saveAppSettings(
  settings: Omit<AppSettings, 'id' | 'updatedAt' | 'schoolId'> & { schoolId?: string },
  userId: string
): Promise<void> {
  const path = 'settings/app_config';
  const schoolId = sanitizeId(settings.schoolId || DEFAULT_SCHOOL_ID);
  const schoolName = clampStr(settings.schoolName, 160, DEFAULT_SCHOOL_NAME);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'settings', 'app_config'), {
      id: 'app_config',
      schoolId,
      schoolName,
      defaultIntroStory: clampStr(settings.defaultIntroStory, 2000, DEFAULT_INTRO_STORY),
      defaultKkm: Math.max(0, Math.min(100, Number(settings.defaultKkm) || 75)),
      updatedBy: sanitizeId(userId),
      updatedAt: serverTimestamp(),
    });
    const schoolSnap = await getDoc(doc(db, 'schools', schoolId));
    if (schoolSnap.exists()) {
      batch.update(doc(db, 'schools', schoolId), {
        name: schoolName,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, 'schools', schoolId), {
        id: schoolId,
        name: schoolName,
        academicYear: '2025/2026',
        activeSemester: 'Ganjil',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- CLASSES ---
export function subscribeClasses(onUpdate: (classes: ClassRoom[]) => void): Unsubscribe {
  const q = query(collection(db, 'classes'), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as ClassRoom)
        .sort((a, b) => a.name.localeCompare(b.name));
      onUpdate(items);
    },
    () => {
      onUpdate([]);
    }
  );
}

export async function saveClassRoom(
  cls: Omit<ClassRoom, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(cls.id || classNameToId(cls.name));
  const path = `classes/${id}`;
  try {
    const payload: Record<string, unknown> = {
      id,
      schoolId: sanitizeId(cls.schoolId || DEFAULT_SCHOOL_ID),
      name: clampStr(cls.name, 24),
      grade: clampStr(cls.grade || '3', 16),
      isActive: Boolean(cls.isActive),
      ownerId: sanitizeId(cls.ownerId),
      updatedAt: serverTimestamp(),
    };
    if (cls.homeroomTeacher) {
      payload.homeroomTeacher = clampStr(cls.homeroomTeacher, 120);
    }
    if (isNew) {
      payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'classes', id), payload);
    } else {
      await updateDoc(doc(db, 'classes', id), payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- ASSESSMENTS, ACCESS LOOKUPS & PORTALS ---
export function subscribePublicAssessments(
  onUpdate: (assessments: PublicAssessment[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'publicAssessments'),
    where('status', 'in', ['scheduled', 'active', 'closed', 'completed'])
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as PublicAssessment);
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'publicAssessments');
    }
  );
}

export function subscribeTeacherAssessments(
  onUpdate: (assessments: AssessmentConfig[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'assessments'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as AssessmentConfig);
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assessments');
    }
  );
}

export async function saveAssessment(
  assessment: Omit<AssessmentConfig, 'createdAt' | 'updatedAt' | 'codeHash' | 'schoolId'> & {
    schoolId?: string;
    codeHash?: string;
    previousCodeHash?: string;
  },
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(assessment.id);
  const schoolId = sanitizeId(assessment.schoolId || DEFAULT_SCHOOL_ID);
  const code = sanitizeCode(assessment.code);
  const codeHash = await hashExamCode(schoolId, code);
  const world = getWorldConfig(assessment.subjectId);

  const basePayload: Record<string, unknown> = {
    id,
    schoolId,
    code,
    codeHash,
    title: clampStr(assessment.title, 160, world.worldName),
    subjectId: assessment.subjectId,
    worldThemeId: clampStr(assessment.worldThemeId || assessment.subjectId, 40),
    grade: clampStr(assessment.grade || '3', 16),
    semester: assessment.semester || 'Ganjil',
    date: clampStr(assessment.date || new Date().toISOString().slice(0, 10), 32),
    durationMinutes: Math.max(0, Math.min(240, Number(assessment.durationMinutes) || 30)),
    mode: assessment.mode,
    status: assessment.status,
    isLocked: Boolean(assessment.isLocked),
    isVisibleOnMap: Boolean(assessment.isVisibleOnMap),
    showScoreToStudent: Boolean(assessment.showScoreToStudent),
    introStory: clampStr(assessment.introStory || DEFAULT_INTRO_STORY, 2000),
    totalQuestions: Math.max(0, Number(assessment.totalQuestions) || 0),
    checkpointInterval: Math.max(1, Math.min(20, Number(assessment.checkpointInterval) || 3)),
    kkm: Math.max(0, Math.min(100, Number(assessment.kkm) || 75)),
    navigationMode: assessment.navigationMode || 'checkpoint',
    allowBack: Boolean(assessment.allowBack),
    allowEditAfterAnswer: Boolean(assessment.allowEditAfterAnswer),
    requireAnswerBeforeNext: Boolean(assessment.requireAnswerBeforeNext),
    shuffleQuestions: Boolean(assessment.shuffleQuestions),
    shuffleOptions: Boolean(assessment.shuffleOptions),
    identityMode: assessment.identityMode || 'roster_verify',
    audioEnabled: Boolean(assessment.audioEnabled),
    allowMultipleSessions: Boolean(assessment.allowMultipleSessions),
    ownerId: sanitizeId(assessment.ownerId),
  };

  if (assessment.description) {
    basePayload.description = clampStr(assessment.description, 600);
  }
  if (assessment.academicYear) {
    basePayload.academicYear = clampStr(assessment.academicYear, 32);
  }
  if (assessment.examType) {
    basePayload.examType = assessment.examType;
  }
  if (typeof assessment.targetQuestionCount === 'number' && assessment.targetQuestionCount > 0) {
    basePayload.targetQuestionCount = Math.min(200, Math.round(assessment.targetQuestionCount));
  }
  if (assessment.scoringPolicy) {
    basePayload.scoringPolicy = assessment.scoringPolicy;
  }
  if (assessment.resultPolicy) {
    basePayload.resultPolicy = assessment.resultPolicy;
  }
  if (assessment.archivedAt) {
    basePayload.archivedAt = clampStr(assessment.archivedAt, 64);
  }
  if (assessment.classIds && assessment.classIds.length > 0) {
    basePayload.classIds = assessment.classIds.slice(0, 20);
  }
  if (assessment.startsAt) {
    basePayload.startsAt = clampStr(assessment.startsAt, 64);
  }
  if (assessment.endsAt) {
    basePayload.endsAt = clampStr(assessment.endsAt, 64);
  }
  if (typeof assessment.maxAttempts === 'number' && assessment.maxAttempts >= 1) {
    basePayload.maxAttempts = Math.min(50, Math.round(assessment.maxAttempts));
  }

  try {
    const batch = writeBatch(db);
    const asmRef = doc(db, 'assessments', id);
    if (isNew) {
      batch.set(asmRef, {
        ...basePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(asmRef, {
        ...basePayload,
        updatedAt: serverTimestamp(),
      });
    }

    // Public portal metadata intentionally omits plaintext exam code, codeHash, date, and KKM
    const pubPayload: Record<string, unknown> = {
      id,
      schoolId,
      title: basePayload.title,
      subjectId: basePayload.subjectId,
      worldThemeId: basePayload.worldThemeId,
      grade: basePayload.grade,
      semester: basePayload.semester,
      durationMinutes: basePayload.durationMinutes,
      mode: basePayload.mode,
      status: basePayload.status,
      isLocked: basePayload.isLocked,
      isVisibleOnMap: basePayload.isVisibleOnMap,
      showScoreToStudent: basePayload.showScoreToStudent,
      introStory: basePayload.introStory,
      totalQuestions: basePayload.totalQuestions,
      checkpointInterval: basePayload.checkpointInterval,
      navigationMode: basePayload.navigationMode,
      allowBack: basePayload.allowBack,
      allowEditAfterAnswer: basePayload.allowEditAfterAnswer,
      requireAnswerBeforeNext: basePayload.requireAnswerBeforeNext,
      shuffleQuestions: basePayload.shuffleQuestions,
      shuffleOptions: basePayload.shuffleOptions,
      identityMode: basePayload.identityMode,
      audioEnabled: basePayload.audioEnabled,
      allowMultipleSessions: basePayload.allowMultipleSessions,
      ownerId: basePayload.ownerId,
      updatedAt: serverTimestamp(),
    };
    if (basePayload.description) pubPayload.description = basePayload.description;
    if (basePayload.academicYear) pubPayload.academicYear = basePayload.academicYear;
    if (basePayload.examType) pubPayload.examType = basePayload.examType;
    if (basePayload.targetQuestionCount) pubPayload.targetQuestionCount = basePayload.targetQuestionCount;
    if (basePayload.scoringPolicy) pubPayload.scoringPolicy = basePayload.scoringPolicy;
    if (basePayload.resultPolicy) pubPayload.resultPolicy = basePayload.resultPolicy;
    if (basePayload.classIds) pubPayload.classIds = basePayload.classIds;
    if (basePayload.startsAt) pubPayload.startsAt = basePayload.startsAt;
    if (basePayload.endsAt) pubPayload.endsAt = basePayload.endsAt;
    if (basePayload.maxAttempts) pubPayload.maxAttempts = basePayload.maxAttempts;
    batch.set(doc(db, 'publicAssessments', id), pubPayload);

    // Hashed lookup entry for backend & exact-key student verification
    const accessPayload: Record<string, unknown> = {
      codeHash,
      schoolId,
      assessmentId: id,
      subjectId: basePayload.subjectId,
      status: basePayload.status,
      isLocked: basePayload.isLocked,
      allowMultipleSessions: basePayload.allowMultipleSessions,
      identityMode: basePayload.identityMode,
      ownerId: basePayload.ownerId,
      updatedAt: serverTimestamp(),
    };
    if (basePayload.classIds) accessPayload.classIds = basePayload.classIds;
    if (basePayload.startsAt) accessPayload.startsAt = basePayload.startsAt;
    if (basePayload.endsAt) accessPayload.endsAt = basePayload.endsAt;
    if (basePayload.maxAttempts) accessPayload.maxAttempts = basePayload.maxAttempts;
    batch.set(doc(db, 'assessmentAccess', codeHash), accessPayload);

    if (assessment.previousCodeHash && assessment.previousCodeHash !== codeHash) {
      batch.delete(doc(db, 'assessmentAccess', assessment.previousCodeHash));
    }

    await batch.commit();

    void syncExamMirrorToServer({
      assessment: {
        ...(basePayload as Partial<AssessmentConfig>),
        code,
        codeHash,
      },
    });

    void logAuditEvent({
      actorType: 'teacher',
      actorId: String(basePayload.ownerId),
      action: isNew ? 'ASSESSMENT_CREATED' : 'ASSESSMENT_UPDATED',
      targetCollection: 'assessments',
      targetId: id,
      status: 'success',
      detail: `${basePayload.title} (${code}) · status=${basePayload.status}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `assessments/${id}`);
  }
}

export async function deleteAssessmentAndQuestions(assessmentId: string): Promise<void> {
  const id = sanitizeId(assessmentId);
  try {
    const [qSnap, asmSnap] = await Promise.all([
      getDocs(query(collection(db, 'publicQuestions'), where('assessmentId', '==', id))),
      getDoc(doc(db, 'assessments', id)),
    ]);
    const batch = writeBatch(db);
    for (const d of qSnap.docs) {
      batch.delete(doc(db, 'questions', d.id));
      batch.delete(doc(db, 'publicQuestions', d.id));
      batch.delete(doc(db, 'questionKeys', d.id));
    }
    if (asmSnap.exists()) {
      const asmData = asmSnap.data() as AssessmentConfig;
      if (asmData.codeHash) {
        batch.delete(doc(db, 'assessmentAccess', asmData.codeHash));
      }
    }
    batch.delete(doc(db, 'assessments', id));
    batch.delete(doc(db, 'publicAssessments', id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `assessments/${id}`);
  }
}

// --- QUESTIONS & ANSWER KEYS ---
export async function getPublicQuestionsForAssessment(
  assessmentId: string
): Promise<PublicQuestion[]> {
  const id = sanitizeId(assessmentId);
  const path = 'publicQuestions';
  try {
    const q = query(
      collection(db, 'publicQuestions'),
      where('assessmentId', '==', id),
      where('isPublished', '==', true)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as PublicQuestion);
    return list.sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getTeacherQuestionsWithKeys(
  assessmentId: string
): Promise<QuestionWithKey[]> {
  const id = sanitizeId(assessmentId);
  try {
    const [qSnap, kSnap] = await Promise.all([
      getDocs(query(collection(db, 'publicQuestions'), where('assessmentId', '==', id))),
      getDocs(query(collection(db, 'questionKeys'), where('assessmentId', '==', id))),
    ]);
    const keyMap = new Map<string, QuestionKey>();
    for (const d of kSnap.docs) {
      const k = d.data() as QuestionKey;
      keyMap.set(k.questionId, k);
    }
    const items: QuestionWithKey[] = qSnap.docs.map((d) => {
      const pq = d.data() as PublicQuestion;
      const key = keyMap.get(pq.id);
      return {
        ...pq,
        correctAnswer: key?.correctAnswer || '',
        acceptedVariations: key?.acceptedVariations || [],
        rubric: key?.rubric || '',
        explanation: key?.explanation || '',
      };
    });
    return items.sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `publicQuestions?assessmentId=${id}`);
  }
}

export async function saveQuestionWithKey(params: {
  question: Omit<PublicQuestion, 'createdAt' | 'updatedAt'>;
  key: Omit<QuestionKey, 'updatedAt'>;
  assessmentMode: 'psas' | 'latihan' | 'simulasi';
  isNew: boolean;
}): Promise<void> {
  const qId = sanitizeId(params.question.id);
  const asmId = sanitizeId(params.question.assessmentId);
  const schoolId = sanitizeId(params.question.schoolId || DEFAULT_SCHOOL_ID);
  const ownerId = sanitizeId(params.question.ownerId);
  try {
    const batch = writeBatch(db);
    const publicPayload: Record<string, unknown> = {
      id: qId,
      schoolId,
      assessmentId: asmId,
      subjectId: params.question.subjectId,
      order: Number(params.question.order) || 1,
      type: params.question.type,
      prompt: clampStr(params.question.prompt, 2000),
      weight: Math.max(0, Math.min(100, Number(params.question.weight) || 10)),
      isPublished: Boolean(params.question.isPublished),
      ownerId,
      updatedAt: serverTimestamp(),
    };

    if (params.isNew) {
      publicPayload.createdAt = serverTimestamp();
    }
    if (params.question.options && params.question.options.length > 0) {
      publicPayload.options = params.question.options.slice(0, 10);
    }
    if (params.question.mediaUrl) {
      publicPayload.mediaUrl = clampStr(params.question.mediaUrl, 1000);
    }
    if (params.question.audioUrl) {
      publicPayload.audioUrl = clampStr(params.question.audioUrl, 1000);
    }
    if (params.question.audioText) {
      publicPayload.audioText = clampStr(params.question.audioText, 1000);
    }
    if (params.question.matchLeft && params.question.matchLeft.length > 0) {
      publicPayload.matchLeft = params.question.matchLeft.slice(0, 10);
    }
    if (params.question.matchRight && params.question.matchRight.length > 0) {
      publicPayload.matchRight = params.question.matchRight.slice(0, 10);
    }
    if (params.question.orderingItems && params.question.orderingItems.length > 0) {
      publicPayload.orderingItems = params.question.orderingItems.slice(0, 12);
    }
    if (params.question.dragItems && params.question.dragItems.length > 0) {
      publicPayload.dragItems = params.question.dragItems.slice(0, 12);
    }
    if (params.question.dragTargets && params.question.dragTargets.length > 0) {
      publicPayload.dragTargets = params.question.dragTargets.slice(0, 8);
    }
    if (params.question.imageOptions && params.question.imageOptions.length > 0) {
      publicPayload.imageOptions = params.question.imageOptions.slice(0, 8);
    }
    if (params.question.topic) {
      publicPayload.topic = clampStr(params.question.topic, 200);
    }
    if (params.question.indicator) {
      publicPayload.indicator = clampStr(params.question.indicator, 300);
    }
    if (params.question.difficulty) {
      publicPayload.difficulty = params.question.difficulty;
    }
    if (params.question.bankItemId) {
      publicPayload.bankItemId = sanitizeId(params.question.bankItemId);
    }
    if (typeof params.question.numericTolerance === 'number') {
      publicPayload.numericTolerance = Math.max(0, Math.min(1000, params.question.numericTolerance));
    }
    if (typeof params.question.allowPartialScoring === 'boolean') {
      publicPayload.allowPartialScoring = params.question.allowPartialScoring;
    }

    if (params.assessmentMode === 'latihan') {
      if (params.question.practiceHint) {
        publicPayload.practiceHint = clampStr(params.question.practiceHint, 500);
      }
      if (params.key.explanation) {
        publicPayload.practiceExplanation = clampStr(params.key.explanation, 1000);
      }
      if (params.key.correctAnswer) {
        publicPayload.practiceKey = clampStr(params.key.correctAnswer, 1000);
      }
    }

    const qRef = doc(db, 'publicQuestions', qId);
    if (params.isNew) {
      batch.set(qRef, publicPayload);
    } else {
      batch.update(qRef, publicPayload);
    }

    const masterPayload: Record<string, unknown> = {
      id: qId,
      schoolId,
      assessmentId: asmId,
      subjectId: params.question.subjectId,
      order: Number(params.question.order) || 1,
      type: params.question.type,
      prompt: clampStr(params.question.prompt, 2000),
      correctAnswer: clampStr(params.key.correctAnswer, 2000),
      weight: Math.max(0, Math.min(100, Number(params.key.weight) || 10)),
      verificationStatus: 'VERIFIED',
      isPublished: Boolean(params.question.isPublished),
      ownerId,
      updatedAt: serverTimestamp(),
    };
    const masterRef = doc(db, 'questions', qId);
    if (params.isNew) {
      masterPayload.createdAt = serverTimestamp();
      batch.set(masterRef, masterPayload);
    } else {
      const existingMaster = await getDoc(masterRef);
      if (existingMaster.exists()) {
        batch.update(masterRef, masterPayload);
      } else {
        masterPayload.createdAt = serverTimestamp();
        batch.set(masterRef, masterPayload);
      }
    }

    const keyPayload: Record<string, unknown> = {
      questionId: qId,
      schoolId,
      assessmentId: asmId,
      type: params.key.type,
      correctAnswer: clampStr(params.key.correctAnswer, 2000),
      weight: Math.max(0, Math.min(100, Number(params.key.weight) || 10)),
      ownerId,
      updatedAt: serverTimestamp(),
    };
    if (params.key.acceptedVariations && params.key.acceptedVariations.length > 0) {
      keyPayload.acceptedVariations = params.key.acceptedVariations.slice(0, 20);
    }
    if (typeof params.key.numericTolerance === 'number') {
      keyPayload.numericTolerance = Math.max(0, Math.min(1000, params.key.numericTolerance));
    }
    if (params.key.rubric) {
      keyPayload.rubric = clampStr(params.key.rubric, 2000);
    }
    if (params.key.explanation) {
      keyPayload.explanation = clampStr(params.key.explanation, 1000);
    }

    batch.set(doc(db, 'questionKeys', qId), keyPayload);

    await batch.commit();
    await syncAssessmentQuestionCount(asmId);

    void syncExamMirrorToServer({
      questions: [
        {
          ...params.question,
          id: qId,
          schoolId,
          assessmentId: asmId,
          correctAnswer: params.key.correctAnswer,
          acceptedVariations: params.key.acceptedVariations,
          numericTolerance: params.key.numericTolerance ?? params.question.numericTolerance,
          rubric: params.key.rubric,
          explanation: params.key.explanation,
        },
      ],
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `publicQuestions/${qId}`);
  }
}

export async function deleteQuestionWithKey(
  questionId: string,
  assessmentId: string
): Promise<void> {
  const qId = sanitizeId(questionId);
  const asmId = sanitizeId(assessmentId);
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'questions', qId));
    batch.delete(doc(db, 'publicQuestions', qId));
    batch.delete(doc(db, 'questionKeys', qId));
    await batch.commit();
    await syncAssessmentQuestionCount(asmId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `publicQuestions/${qId}`);
  }
}

export async function syncAssessmentQuestionCount(assessmentId: string): Promise<void> {
  const asmId = sanitizeId(assessmentId);
  try {
    const qSnap = await getDocs(
      query(collection(db, 'publicQuestions'), where('assessmentId', '==', asmId))
    );
    const total = qSnap.size;
    const batch = writeBatch(db);
    batch.update(doc(db, 'assessments', asmId), {
      totalQuestions: total,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'publicAssessments', asmId), {
      totalQuestions: total,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch {
    // Non-fatal if assessment doc isn't created yet
  }
}

// --- QUESTION BANK ---
export function subscribeQuestionBank(
  onUpdate: (items: QuestionBankItem[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'questionBanks'),
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as QuestionBankItem));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'questionBanks');
    }
  );
}

export async function saveQuestionBankItem(
  item: Omit<QuestionBankItem, 'createdAt' | 'updatedAt'>,
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(item.id);
  const schoolId = sanitizeId(item.schoolId || DEFAULT_SCHOOL_ID);
  try {
    const payload: Record<string, unknown> = {
      id,
      schoolId,
      subjectId: item.subjectId,
      grade: clampStr(item.grade || '3', 16),
      semester: item.semester || 'Ganjil',
      topic: clampStr(item.topic || 'Umum', 200),
      competency: clampStr(item.competency || '', 300),
      indicator: clampStr(item.indicator || '', 300),
      type: item.type,
      difficulty: item.difficulty || 'mudah',
      prompt: clampStr(item.prompt, 2000),
      payload: item.payload || {},
      correctAnswer: clampStr(item.correctAnswer, 2000),
      weight: Math.max(0, Math.min(100, Number(item.weight) || 10)),
      verificationStatus: item.verificationStatus || 'VERIFIED',
      isActive: typeof item.isActive === 'boolean' ? item.isActive : true,
      ownerId: sanitizeId(item.ownerId),
      updatedAt: serverTimestamp(),
    };
    if (Array.isArray(item.acceptedVariations) && item.acceptedVariations.length > 0) {
      payload.acceptedVariations = item.acceptedVariations.slice(0, 20);
    }
    if (typeof item.numericTolerance === 'number') {
      payload.numericTolerance = Math.max(0, Math.min(1000, item.numericTolerance));
    }
    if (item.rubric) payload.rubric = clampStr(item.rubric, 2000);
    if (item.explanation) payload.explanation = clampStr(item.explanation, 1000);
    if (item.imageUrl) payload.imageUrl = clampStr(item.imageUrl, 1000);
    if (Array.isArray(item.tags) && item.tags.length > 0) payload.tags = item.tags.slice(0, 20);
    if (item.archivedAt) payload.archivedAt = clampStr(item.archivedAt, 64);
    if (item.archivedBy) payload.archivedBy = clampStr(item.archivedBy, 128);
    if (item.importBatchId) payload.importBatchId = sanitizeId(item.importBatchId);
    if (item.sourceFileName) payload.sourceFileName = clampStr(item.sourceFileName, 200);
    if (item.sourceFileType) payload.sourceFileType = clampStr(item.sourceFileType, 40);
    if (typeof item.sourcePage === 'number' && item.sourcePage >= 1) {
      payload.sourcePage = Math.round(item.sourcePage);
    }
    if (item.sourceQuestionNumber) {
      payload.sourceQuestionNumber = clampStr(item.sourceQuestionNumber, 32);
    }
    if (item.extractionStatus) payload.extractionStatus = item.extractionStatus;
    if (typeof item.extractionConfidence === 'number') {
      payload.extractionConfidence = Math.max(0, Math.min(1, item.extractionConfidence));
    }
    if (typeof item.needsReview === 'boolean') payload.needsReview = item.needsReview;
    if (item.importedBy) payload.importedBy = sanitizeId(item.importedBy);
    if (item.importedAt) payload.importedAt = clampStr(item.importedAt, 64);

    if (isNew) {
      payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'questionBanks', id), payload);
    } else {
      await updateDoc(doc(db, 'questionBanks', id), payload);
    }

    void syncExamMirrorToServer({
      bankItems: [{ ...item, id, schoolId }],
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `questionBanks/${id}`);
  }
}

export async function deleteQuestionBankItem(id: string): Promise<void> {
  const cleanId = sanitizeId(id);
  try {
    await deleteDoc(doc(db, 'questionBanks', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `questionBanks/${cleanId}`);
  }
}

// --- STUDENTS & PRIVACY-PRESERVING ACCESS KEYS ---
export function subscribeRoster(onUpdate: (students: RosterStudent[]) => void): Unsubscribe {
  const q = query(collection(db, 'students'), where('isActive', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs
          .map((d) => d.data() as RosterStudent)
          .sort((a, b) => a.gradeClass.localeCompare(b.gradeClass) || a.name.localeCompare(b.name))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    }
  );
}

async function rebuildStudentAccessKeysForClassAndName(
  schoolId: string,
  classId: string,
  studentName: string,
  ownerId: string
): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'students'), where('classId', '==', classId), where('isActive', '==', true))
  );
  const normTarget = normalizeTextKey(studentName);
  const matches = snap.docs
    .map((d) => d.data() as RosterStudent)
    .filter((s) => normalizeTextKey(s.name) === normTarget);

  const nameLookupId = await hashStudentLookup(schoolId, classId, studentName);
  const batch = writeBatch(db);

  if (matches.length === 0) {
    batch.delete(doc(db, 'studentAccessKeys', nameLookupId));
    await batch.commit();
    return;
  }

  if (matches.length === 1) {
    const only = matches[0];
    batch.set(doc(db, 'studentAccessKeys', nameLookupId), {
      lookupId: nameLookupId,
      schoolId,
      classId,
      requiresParticipantNumber: false,
      studentId: only.id,
      displayName: only.name,
      isActive: true,
      ownerId,
      updatedAt: serverTimestamp(),
    });
    if (only.participantNumber) {
      const fullLookupId = await hashStudentLookup(
        schoolId,
        classId,
        only.name,
        only.participantNumber
      );
      batch.set(doc(db, 'studentAccessKeys', fullLookupId), {
        lookupId: fullLookupId,
        schoolId,
        classId,
        requiresParticipantNumber: false,
        studentId: only.id,
        displayName: only.name,
        isActive: true,
        ownerId,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return;
  }

  // Multiple students in the same class share this name -> force Nomor Peserta disambiguation
  batch.set(doc(db, 'studentAccessKeys', nameLookupId), {
    lookupId: nameLookupId,
    schoolId,
    classId,
    requiresParticipantNumber: true,
    isActive: true,
    ownerId,
    updatedAt: serverTimestamp(),
  });
  for (const stu of matches) {
    if (stu.participantNumber) {
      const fullLookupId = await hashStudentLookup(
        schoolId,
        classId,
        stu.name,
        stu.participantNumber
      );
      batch.set(doc(db, 'studentAccessKeys', fullLookupId), {
        lookupId: fullLookupId,
        schoolId,
        classId,
        requiresParticipantNumber: false,
        studentId: stu.id,
        displayName: stu.name,
        isActive: true,
        ownerId,
        updatedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

export async function saveRosterStudent(
  student: Omit<RosterStudent, 'createdAt' | 'updatedAt' | 'schoolId' | 'classId'> & {
    schoolId?: string;
    classId?: string;
  },
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(student.id);
  const schoolId = sanitizeId(student.schoolId || DEFAULT_SCHOOL_ID);
  const gradeClass = clampStr(student.gradeClass, 24, '3A');
  const classId = sanitizeId(student.classId || classNameToId(gradeClass));
  const ownerId = sanitizeId(student.ownerId);

  try {
    const payload: Record<string, unknown> = {
      id,
      schoolId,
      classId,
      name: clampStr(student.name, 120),
      gradeClass,
      isActive: Boolean(student.isActive),
      ownerId,
      updatedAt: serverTimestamp(),
    };
    if (student.participantNumber) {
      payload.participantNumber = clampStr(student.participantNumber, 40);
    }
    if (isNew) {
      payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'students', id), payload);
    } else {
      await updateDoc(doc(db, 'students', id), payload);
    }

    await rebuildStudentAccessKeysForClassAndName(schoolId, classId, student.name, ownerId);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `students/${id}`);
  }
}

export async function deleteRosterStudent(id: string, ownerId = 'teacher'): Promise<void> {
  const cleanId = sanitizeId(id);
  try {
    const snap = await getDoc(doc(db, 'students', cleanId));
    const existing = snap.exists() ? (snap.data() as RosterStudent) : null;
    await deleteDoc(doc(db, 'students', cleanId));
    if (existing) {
      if (existing.participantNumber) {
        const fullLookupId = await hashStudentLookup(
          existing.schoolId || DEFAULT_SCHOOL_ID,
          existing.classId || classNameToId(existing.gradeClass),
          existing.name,
          existing.participantNumber
        );
        await deleteDoc(doc(db, 'studentAccessKeys', fullLookupId));
      }
      await rebuildStudentAccessKeysForClassAndName(
        existing.schoolId || DEFAULT_SCHOOL_ID,
        existing.classId || classNameToId(existing.gradeClass),
        existing.name,
        existing.ownerId || ownerId
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `students/${cleanId}`);
  }
}

// --- BACKEND-VERIFIED STUDENT ENTRY ---
export interface ValidateStudentEntryResult {
  assessment: PublicAssessment;
  sessionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  gradeClass: string;
  participantNumber?: string;
  characterId: ExplorerCharacterId;
  characterSelected: boolean;
  token: string;
  tokenExpiresAt: string;
  resumingSession: AssessmentSession | null;
}

export class StudentEntryError extends Error {
  code: string;
  requiresParticipantNumber: boolean;

  constructor(message: string, code: string, requiresParticipantNumber = false) {
    super(message);
    this.name = 'StudentEntryError';
    this.code = code;
    this.requiresParticipantNumber = requiresParticipantNumber;
  }
}

export async function validateStudentAccessWithBackend(params: {
  schoolId?: string;
  classId: string;
  gradeClass: string;
  studentName: string;
  examCode: string;
  participantNumber?: string;
  characterId: ExplorerCharacterId;
}): Promise<ValidateStudentEntryResult> {
  const schoolId = params.schoolId || DEFAULT_SCHOOL_ID;
  const cleanCode = params.examCode.trim().toUpperCase();
  const cleanName = params.studentName.trim();
  const cleanPart = params.participantNumber?.trim() || '';

  const { ok, data: payload } = await studentLoginViaApi({
    schoolId,
    classId: params.classId,
    gradeClass: params.gradeClass,
    studentName: cleanName,
    examCode: cleanCode,
    participantNumber: cleanPart || undefined,
    characterId: params.characterId,
  });

  if (
    !ok ||
    !payload.valid ||
    !payload.assessment ||
    !payload.sessionId ||
    !payload.token
  ) {
    throw new StudentEntryError(
      payload.message || 'Tidak dapat masuk ke portal asesmen.',
      payload.code || 'VALIDATION_FAILED',
      Boolean(payload.requiresParticipantNumber)
    );
  }

  return {
    assessment: payload.assessment,
    sessionId: payload.sessionId,
    studentId: payload.studentId || '',
    studentName: payload.studentName || cleanName,
    classId: payload.classId || params.classId,
    gradeClass: payload.gradeClass || params.gradeClass,
    participantNumber: cleanPart || undefined,
    characterId: payload.characterId || params.characterId,
    characterSelected: Boolean(payload.characterSelected),
    token: payload.token,
    tokenExpiresAt: payload.tokenExpiresAt || '',
    resumingSession: payload.resumingExisting ? payload.resumingSession || null : null,
  };
}

export async function logoutStudentSessionWithBackend(token: string | null): Promise<void> {
  await studentLogoutViaApi(token);
}

// --- STUDENT SESSIONS & ANSWERS ---
export async function createStudentSession(
  session: Omit<AssessmentSession, 'createdAt' | 'updatedAt' | 'schoolId'> & { schoolId?: string }
): Promise<void> {
  const id = sanitizeId(session.id);
  const schoolId = sanitizeId(session.schoolId || DEFAULT_SCHOOL_ID);
  try {
    const payload: Record<string, unknown> = {
      id,
      schoolId,
      assessmentId: sanitizeId(session.assessmentId),
      subjectId: session.subjectId,
      mode: session.mode,
      studentName: clampStr(session.studentName, 120),
      gradeClass: clampStr(session.gradeClass, 24),
      characterId: session.characterId === 'girl' ? 'girl' : 'boy',
      status: 'in_progress',
      currentIndex: session.currentIndex,
      answeredIds: session.answeredIds.slice(0, 200),
      questionOrder: session.questionOrder.slice(0, 200),
      totalQuestions: session.totalQuestions,
      progressPercent: session.progressPercent,
      checkpointsUnlocked: session.checkpointsUnlocked,
      artifactsEarned: session.artifactsEarned.slice(0, 50),
      starsEarned: session.starsEarned,
      startedAt: session.startedAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (session.classId) payload.classId = sanitizeId(session.classId);
    if (session.studentId) payload.studentId = sanitizeId(session.studentId);
    if (session.participantNumber) {
      payload.participantNumber = clampStr(session.participantNumber, 40);
    }

    await setDoc(doc(db, 'assessmentSessions', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `assessmentSessions/${id}`);
  }
}

export async function getSessionById(sessionId: string): Promise<AssessmentSession | null> {
  const id = sanitizeId(sessionId);
  try {
    const snap = await getDoc(doc(db, 'assessmentSessions', id));
    return snap.exists() ? (snap.data() as AssessmentSession) : null;
  } catch {
    return null;
  }
}

export async function getSessionAnswersByIds(
  sessionId: string,
  questionIds: string[]
): Promise<Record<string, string>> {
  const id = sanitizeId(sessionId);
  const map: Record<string, string> = {};
  await Promise.all(
    questionIds.map(async (qId) => {
      try {
        const answerId = sanitizeId(`${id}__${qId}`);
        const snap = await getDoc(doc(db, 'studentAnswers', answerId));
        if (snap.exists()) {
          const data = snap.data() as StudentAnswer;
          map[qId] = data.answerValue;
        }
      } catch {
        // Ignore missing individual docs
      }
    })
  );
  return map;
}

export async function saveStudentAnswerWithAutosave(params: {
  sessionId: string;
  assessmentId?: string;
  questionId: string;
  questionPromptSnapshot?: string;
  questionWeightSnapshot?: number;
  answerValue: string;
  isAnswered: boolean;
}): Promise<'saved' | 'offline_queued'> {
  const sessionId = sanitizeId(params.sessionId);
  const questionId = sanitizeId(params.questionId);
  const answerId = sanitizeId(`${sessionId}__${questionId}`);
  const answerValue = clampStr(params.answerValue, 4000);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueuePendingAnswer({
      sessionId,
      assessmentId: params.assessmentId,
      questionId,
      questionPromptSnapshot: params.questionPromptSnapshot,
      questionWeightSnapshot: params.questionWeightSnapshot,
      answerValue,
      isAnswered: params.isAnswered,
    });
    return 'offline_queued';
  }

  try {
    const payload: Record<string, unknown> = {
      id: answerId,
      schoolId: DEFAULT_SCHOOL_ID,
      sessionId,
      questionId,
      answerValue,
      isAnswered: params.isAnswered,
      updatedAt: serverTimestamp(),
    };
    if (params.assessmentId) payload.assessmentId = sanitizeId(params.assessmentId);
    if (params.questionPromptSnapshot) {
      payload.questionPromptSnapshot = clampStr(params.questionPromptSnapshot, 2000);
    }
    if (typeof params.questionWeightSnapshot === 'number') {
      payload.questionWeightSnapshot = Math.max(0, Math.min(100, params.questionWeightSnapshot));
    }

    await setDoc(doc(db, 'studentAnswers', answerId), payload);
    removePendingAnswer(sessionId, questionId);
    return 'saved';
  } catch {
    enqueuePendingAnswer({
      sessionId,
      assessmentId: params.assessmentId,
      questionId,
      questionPromptSnapshot: params.questionPromptSnapshot,
      questionWeightSnapshot: params.questionWeightSnapshot,
      answerValue,
      isAnswered: params.isAnswered,
    });
    return 'offline_queued';
  }
}

export async function updateStudentSessionProgress(params: {
  sessionId: string;
  currentIndex: number;
  answeredIds: string[];
  progressPercent: number;
  checkpointsUnlocked: number;
  artifactsEarned: string[];
  starsEarned: number;
  status?: 'in_progress' | 'submitted';
  submittedAt?: string;
}): Promise<'saved' | 'offline_queued'> {
  const sessionId = sanitizeId(params.sessionId);
  const payload: Record<string, unknown> = {
    status: params.status || 'in_progress',
    currentIndex: Math.max(0, params.currentIndex),
    answeredIds: params.answeredIds.slice(0, 200),
    progressPercent: Math.max(0, Math.min(100, Math.round(params.progressPercent))),
    checkpointsUnlocked: Math.max(0, params.checkpointsUnlocked),
    artifactsEarned: params.artifactsEarned.slice(0, 50),
    starsEarned: Math.max(0, params.starsEarned),
    updatedAt: serverTimestamp(),
  };
  if (params.submittedAt) {
    payload.submittedAt = clampStr(params.submittedAt, 64);
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline_queued';
  }

  try {
    await updateDoc(doc(db, 'assessmentSessions', sessionId), payload);
    return 'saved';
  } catch {
    return 'offline_queued';
  }
}

// --- TEACHER RESULTS & ANALYTICS ---
export function subscribeTeacherSessions(
  onUpdate: (sessions: AssessmentSession[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'assessmentSessions'),
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as AssessmentSession));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assessmentSessions');
    }
  );
}

export function subscribeTeacherResults(
  onUpdate: (results: AssessmentResult[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'results'),
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as AssessmentResult));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'results');
    }
  );
}

export async function getSessionAnswersForTeacher(sessionId: string): Promise<StudentAnswer[]> {
  const id = sanitizeId(sessionId);
  try {
    const q = query(collection(db, 'studentAnswers'), where('sessionId', '==', id));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as StudentAnswer);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `studentAnswers?sessionId=${id}`);
  }
}

export async function saveTeacherResult(
  result: Omit<AssessmentResult, 'createdAt' | 'updatedAt' | 'schoolId'> & { schoolId?: string },
  isNew: boolean
): Promise<void> {
  const id = sanitizeId(result.sessionId);
  const schoolId = sanitizeId(result.schoolId || DEFAULT_SCHOOL_ID);
  try {
    const batch = writeBatch(db);
    const resRef = doc(db, 'results', id);
    const payload: Record<string, unknown> = {
      sessionId: id,
      schoolId,
      assessmentId: sanitizeId(result.assessmentId),
      assessmentTitle: clampStr(result.assessmentTitle, 160),
      subjectId: result.subjectId,
      studentName: clampStr(result.studentName, 120),
      gradeClass: clampStr(result.gradeClass, 24),
      finalScore: Math.max(0, Math.min(100, Number(result.finalScore) || 0)),
      earnedPoints: Number(result.earnedPoints) || 0,
      maxPoints: Number(result.maxPoints) || 0,
      correctCount: Math.max(0, Number(result.correctCount) || 0),
      wrongCount: Math.max(0, Number(result.wrongCount) || 0),
      unansweredCount: Math.max(0, Number(result.unansweredCount) || 0),
      needsManualReview: Boolean(result.needsManualReview),
      manualScores: result.manualScores || {},
      questionOutcomes: result.questionOutcomes || {},
      durationSeconds: Math.max(0, Number(result.durationSeconds) || 0),
      showToStudent: Boolean(result.showToStudent),
      gradedBy: sanitizeId(result.gradedBy),
      startedAt: clampStr(result.startedAt || '', 64),
      submittedAt: clampStr(result.submittedAt || '', 64),
      updatedAt: serverTimestamp(),
    };
    if (result.classId) payload.classId = sanitizeId(result.classId);
    if (result.studentId) payload.studentId = sanitizeId(result.studentId);
    if (result.participantNumber) {
      payload.participantNumber = clampStr(result.participantNumber, 40);
    }
    if (result.examMode) payload.examMode = result.examMode;
    if (result.examType) payload.examType = result.examType;
    if (typeof result.attemptNumber === 'number') payload.attemptNumber = result.attemptNumber;
    if (typeof result.isOfficialScore === 'boolean') payload.isOfficialScore = result.isOfficialScore;
    if (result.gradingStatus) payload.gradingStatus = result.gradingStatus;
    if (typeof result.objectiveScore === 'number') payload.objectiveScore = result.objectiveScore;
    if (result.essayGrading) payload.essayGrading = result.essayGrading;
    if (result.auditTrail) payload.auditTrail = result.auditTrail;

    if (isNew) {
      payload.createdAt = serverTimestamp();
      batch.set(resRef, payload);
    } else {
      batch.update(resRef, payload);
    }

    batch.update(doc(db, 'assessmentSessions', id), {
      status: 'graded',
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `results/${id}`);
  }
}

export async function getStudentVisibleResult(sessionId: string): Promise<AssessmentResult | null> {
  const id = sanitizeId(sessionId);
  try {
    const snap = await getDoc(doc(db, 'results', id));
    if (!snap.exists()) return null;
    const res = snap.data() as AssessmentResult;
    return res.showToStudent ? res : null;
  } catch {
    return null;
  }
}

// --- IDEMPOTENT FOUNDATION SEEDING (SDN PEKIRINGAN + 10 MAPEL RESMI + SETTINGS) ---
// Tidak membuat siswa fiktif, kelas karangan, atau nama guru karangan.
export async function seedSchoolFoundationToFirestore(adminUid: string): Promise<{
  schoolCreated: boolean;
  settingsCreated: boolean;
  subjectsSeeded: number;
}> {
  const uid = sanitizeId(adminUid);
  const schoolId = DEFAULT_SCHOOL_ID;
  try {
    const [schoolSnap, settingsSnap, existingSubjectsSnap] = await Promise.all([
      getDoc(doc(db, 'schools', schoolId)),
      getDoc(doc(db, 'settings', 'app_config')),
      getDocs(collection(db, 'subjects')),
    ]);

    const existingSubjectIds = new Set(existingSubjectsSnap.docs.map((d) => d.id));
    const batch = writeBatch(db);
    let schoolCreated = false;
    let settingsCreated = false;
    let subjectsSeeded = 0;

    if (!schoolSnap.exists()) {
      batch.set(doc(db, 'schools', schoolId), {
        id: schoolId,
        name: DEFAULT_SCHOOL_NAME,
        academicYear: '2025/2026',
        activeSemester: 'Ganjil',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      schoolCreated = true;
    }

    if (!settingsSnap.exists()) {
      batch.set(doc(db, 'settings', 'app_config'), {
        ...DEFAULT_APP_SETTINGS,
        schoolId,
        schoolName: DEFAULT_SCHOOL_NAME,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      settingsCreated = true;
    }

    for (const w of WORLDS) {
      if (!existingSubjectIds.has(w.id)) {
        batch.set(doc(db, 'subjects', w.id), {
          id: w.id,
          schoolId,
          number: w.number,
          name: w.subjectName,
          worldName: w.worldName,
          worldCode: w.id.toUpperCase(),
          worldIcon: `world_${w.number}`,
          worldColor: w.accentHex,
          description: clampStr(w.themeSummary, 600),
          portalName: w.portalName,
          isActive: true,
          ownerId: uid,
          updatedAt: serverTimestamp(),
        });
        subjectsSeeded++;
      }
    }

    if (schoolCreated || settingsCreated || subjectsSeeded > 0) {
      await batch.commit();
      await logAuditEvent({
        actorType: 'admin',
        actorId: uid,
        action: 'SEED_SCHOOL_FOUNDATION',
        targetCollection: 'schools',
        targetId: schoolId,
        status: 'success',
        detail: `Inisialisasi idempoten SDN Pekiringan (sekolah=${schoolCreated}, pengaturan=${settingsCreated}, mapelBaru=${subjectsSeeded})`,
      });
    }

    return { schoolCreated, settingsCreated, subjectsSeeded };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'schoolFoundationSeed');
  }
}
