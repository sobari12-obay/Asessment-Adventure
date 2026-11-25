import type { AssessmentSession, PublicAssessment, WorldConfig } from '../types/psas';
import { WORLDS } from './worlds';

export type WorldAvailabilityStatus = 'terkunci' | 'tersedia' | 'sedang_dikerjakan' | 'selesai';

export interface CompletedWorldRecord {
  subjectId: string;
  assessmentId: string;
  sessionId: string;
  artifactName: string;
  badgeTitle: string;
  starsEarned: number;
  completedAt: string;
}

export interface ResolvedWorldState {
  world: WorldConfig;
  status: WorldAvailabilityStatus;
  assessment: PublicAssessment | null;
  lockReason?: string;
  scheduleLabel?: string;
  progressPercent: number;
  starsEarned: number;
  xpEarned: number;
}

export function resolveAllWorldStatuses(params: {
  publicAssessments: PublicAssessment[];
  completedWorlds: CompletedWorldRecord[];
  activeAssessment?: PublicAssessment | null;
  activeSession?: AssessmentSession | null;
  recoverableSession?: AssessmentSession | null;
  activeStudentId?: string;
}): { items: ResolvedWorldState[]; hasLiveFirebaseAssessments: boolean } {
  const { publicAssessments, completedWorlds, activeAssessment, activeSession, recoverableSession } =
    params;

  const visibleAssessments = publicAssessments.filter((a) => a.isVisibleOnMap !== false);
  const hasLiveFirebaseAssessments = visibleAssessments.length > 0;

  const items: ResolvedWorldState[] = WORLDS.map((world) => {
    const matchedAssessment =
      (activeAssessment && activeAssessment.subjectId === world.id ? activeAssessment : null) ||
      visibleAssessments.find(
        (a) => a.subjectId === world.id && a.status === 'active' && !a.isLocked
      ) ||
      visibleAssessments.find((a) => a.subjectId === world.id) ||
      null;

    const completedRecord = completedWorlds.find(
      (c) =>
        c.subjectId === world.id ||
        (matchedAssessment && c.assessmentId === matchedAssessment.id)
    );

    const runningSession =
      (activeSession &&
      activeSession.status === 'in_progress' &&
      activeSession.subjectId === world.id
        ? activeSession
        : null) ||
      (recoverableSession &&
      recoverableSession.status === 'in_progress' &&
      recoverableSession.subjectId === world.id
        ? recoverableSession
        : null);

    if (completedRecord) {
      return {
        world,
        status: 'selesai',
        assessment: matchedAssessment,
        scheduleLabel: matchedAssessment ? 'Selesai' : 'Tuntas',
        progressPercent: 100,
        starsEarned: completedRecord.starsEarned || 3,
        xpEarned: (completedRecord.starsEarned || 3) * 20,
      };
    }

    if (runningSession) {
      return {
        world,
        status: 'sedang_dikerjakan',
        assessment: matchedAssessment,
        scheduleLabel: 'Sedang Berlangsung',
        progressPercent: runningSession.progressPercent || 10,
        starsEarned: runningSession.starsEarned || 0,
        xpEarned: (runningSession.checkpointsUnlocked || 0) * 15,
      };
    }

    if (!matchedAssessment) {
      return {
        world,
        status: 'terkunci',
        assessment: null,
        lockReason: 'Menunggu jadwal & aktivasi asesmen oleh Bapak/Ibu Guru.',
        scheduleLabel: 'Belum Dibuka',
        progressPercent: 0,
        starsEarned: 0,
        xpEarned: 0,
      };
    }

    if (matchedAssessment.isLocked || matchedAssessment.status === 'scheduled') {
      return {
        world,
        status: 'terkunci',
        assessment: matchedAssessment,
        lockReason:
          matchedAssessment.status === 'scheduled'
            ? 'Asesmen dijadwalkan guru dan akan dibuka sesuai waktunya.'
            : 'Portal dunia ini sedang dikunci oleh Bapak/Ibu Guru.',
        scheduleLabel: matchedAssessment.status === 'scheduled' ? 'Terjadwal' : 'Terkunci',
        progressPercent: 0,
        starsEarned: 0,
        xpEarned: 0,
      };
    }

    if (matchedAssessment.status === 'closed' || matchedAssessment.status === 'completed') {
      return {
        world,
        status: 'terkunci',
        assessment: matchedAssessment,
        lockReason: 'Sesi asesmen untuk dunia ini telah ditutup oleh guru.',
        scheduleLabel: 'Ditutup',
        progressPercent: 0,
        starsEarned: 0,
        xpEarned: 0,
      };
    }

    return {
      world,
      status: 'tersedia',
      assessment: matchedAssessment,
      scheduleLabel: matchedAssessment.mode === 'latihan' ? 'Latihan Terbuka' : 'Aktif',
      progressPercent: 0,
      starsEarned: 0,
      xpEarned: 0,
    };
  });

  return { items, hasLiveFirebaseAssessments };
}
