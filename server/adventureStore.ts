import fs from 'fs';
import path from 'path';

export type OutfitThemeId = 'rimba_emerald' | 'langit_biru' | 'mentari_emas' | 'senja_merah';
export type BagStyleId = 'ransel_kompas' | 'tas_peta' | 'tas_bintang';
export type ShoeStyleId = 'sepatu_rimba' | 'sepatu_kilat';

export type AdventureWorldStatus =
  | 'belum_tersedia'
  | 'tersedia'
  | 'sedang_dijelajahi'
  | 'selesai';

export type CheckpointProgressStatus = 'terbuka' | 'sedang_dikerjakan' | 'selesai';

export type CheckpointType = 'story' | 'exploration' | 'mission_gate';

export type XpSourceType =
  | 'BaseCampVisited'
  | 'CharacterSelected'
  | 'WorldOpened'
  | 'CheckpointCompleted'
  | 'ExamCompleted';

export type AdventureEventType =
  | 'CharacterSelected'
  | 'BaseCampVisited'
  | 'WorldOpened'
  | 'CheckpointOpened'
  | 'CheckpointCompleted'
  | 'XPGranted'
  | 'LevelUp'
  | 'BadgeEarned';

export interface AdventureProfileRecord {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string;
  gradeClass: string;
  displayName: string;
  characterId: 'boy' | 'girl';
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
  activeDays: string[];
  activeDaysCount: number;
  lastActivityDate: string;
  lastWorldId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorldProgressRecord {
  id: string;
  schoolId: string;
  studentId: string;
  worldId: string;
  status: AdventureWorldStatus;
  progressPercent: number;
  xpEarned: number;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  lastCheckpointId?: string;
  openedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface CheckpointProgressRecord {
  id: string;
  schoolId: string;
  studentId: string;
  worldId: string;
  checkpointId: string;
  status: CheckpointProgressStatus;
  xpAwarded: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
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

export interface XpTransactionRecord {
  transactionId: string;
  schoolId: string;
  studentId: string;
  sourceType: XpSourceType;
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
  eventType: AdventureEventType;
  worldId?: string;
  checkpointId?: string;
  badgeId?: string;
  xpAmount?: number;
  levelAfter?: number;
  detail: string;
  createdAt: string;
}

export interface WorldOverrideRecord {
  worldId: string;
  schoolId: string;
  isAvailable: boolean;
  availabilityReason?: string;
  scheduleLabel?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface CustomCheckpointRecord {
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
  ownerId: string;
  createdAt: string;
  updatedAt: string;
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

export const DEFAULT_GAMIFICATION_VALUES = {
  xpBaseCampVisit: 10,
  xpCharacterSelect: 10,
  xpWorldOpen: 15,
  xpExamOfficial: 50,
  xpExamPractice: 30,
  xpExamSimulation: 20,
} as const;

export function createDefaultGamificationConfig(schoolId: string): GamificationConfig {
  return {
    schoolId,
    ...DEFAULT_GAMIFICATION_VALUES,
    badgeOverrides: {},
  };
}

export function getGamificationConfigForSchool(
  state: AdventureStoreState,
  schoolId: string
): GamificationConfig {
  const existing = state.gamificationConfigs?.[schoolId];
  if (!existing) return createDefaultGamificationConfig(schoolId);
  return {
    schoolId,
    xpBaseCampVisit:
      typeof existing.xpBaseCampVisit === 'number'
        ? Math.max(0, Math.min(100, existing.xpBaseCampVisit))
        : DEFAULT_GAMIFICATION_VALUES.xpBaseCampVisit,
    xpCharacterSelect:
      typeof existing.xpCharacterSelect === 'number'
        ? Math.max(0, Math.min(100, existing.xpCharacterSelect))
        : DEFAULT_GAMIFICATION_VALUES.xpCharacterSelect,
    xpWorldOpen:
      typeof existing.xpWorldOpen === 'number'
        ? Math.max(0, Math.min(100, existing.xpWorldOpen))
        : DEFAULT_GAMIFICATION_VALUES.xpWorldOpen,
    xpExamOfficial:
      typeof existing.xpExamOfficial === 'number'
        ? Math.max(0, Math.min(100, existing.xpExamOfficial))
        : DEFAULT_GAMIFICATION_VALUES.xpExamOfficial,
    xpExamPractice:
      typeof existing.xpExamPractice === 'number'
        ? Math.max(0, Math.min(100, existing.xpExamPractice))
        : DEFAULT_GAMIFICATION_VALUES.xpExamPractice,
    xpExamSimulation:
      typeof existing.xpExamSimulation === 'number'
        ? Math.max(0, Math.min(100, existing.xpExamSimulation))
        : DEFAULT_GAMIFICATION_VALUES.xpExamSimulation,
    badgeOverrides:
      existing.badgeOverrides && typeof existing.badgeOverrides === 'object'
        ? existing.badgeOverrides
        : {},
    updatedBy: existing.updatedBy,
    updatedAt: existing.updatedAt,
  };
}

export interface AdventureStoreState {
  version: number;
  profiles: Record<string, AdventureProfileRecord>;
  worldProgress: Record<string, WorldProgressRecord>;
  checkpointProgress: Record<string, CheckpointProgressRecord>;
  studentBadges: Record<string, StudentBadgeRecord>;
  xpTransactions: Record<string, XpTransactionRecord>;
  adventureEvents: AdventureEventRecord[];
  worldOverrides: Record<string, WorldOverrideRecord>;
  customCheckpoints: Record<string, CustomCheckpointRecord>;
  gamificationConfigs: Record<string, GamificationConfig>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE_PATH = path.join(DATA_DIR, 'adventure-state.json');

function createEmptyState(): AdventureStoreState {
  return {
    version: 3,
    profiles: {},
    worldProgress: {},
    checkpointProgress: {},
    studentBadges: {},
    xpTransactions: {},
    adventureEvents: [],
    worldOverrides: {},
    customCheckpoints: {},
    gamificationConfigs: {},
  };
}

function readStateFromDisk(): AdventureStoreState {
  try {
    if (!fs.existsSync(STATE_FILE_PATH)) {
      return createEmptyState();
    }
    const raw = fs.readFileSync(STATE_FILE_PATH, 'utf8');
    if (!raw.trim()) return createEmptyState();
    const parsed = JSON.parse(raw) as Partial<AdventureStoreState>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 3,
      profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
      worldProgress:
        parsed.worldProgress && typeof parsed.worldProgress === 'object' ? parsed.worldProgress : {},
      checkpointProgress:
        parsed.checkpointProgress && typeof parsed.checkpointProgress === 'object'
          ? parsed.checkpointProgress
          : {},
      studentBadges:
        parsed.studentBadges && typeof parsed.studentBadges === 'object' ? parsed.studentBadges : {},
      xpTransactions:
        parsed.xpTransactions && typeof parsed.xpTransactions === 'object'
          ? parsed.xpTransactions
          : {},
      adventureEvents: Array.isArray(parsed.adventureEvents) ? parsed.adventureEvents : [],
      worldOverrides:
        parsed.worldOverrides && typeof parsed.worldOverrides === 'object'
          ? parsed.worldOverrides
          : {},
      customCheckpoints:
        parsed.customCheckpoints && typeof parsed.customCheckpoints === 'object'
          ? parsed.customCheckpoints
          : {},
      gamificationConfigs:
        parsed.gamificationConfigs && typeof parsed.gamificationConfigs === 'object'
          ? parsed.gamificationConfigs
          : {},
    };
  } catch {
    return createEmptyState();
  }
}

function writeStateToDiskAtomic(state: AdventureStoreState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STATE_FILE_PATH}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, STATE_FILE_PATH);
}

let inMemoryState: AdventureStoreState = readStateFromDisk();
let writeQueue: Promise<unknown> = Promise.resolve();

export function getAdventureStateSnapshot(): AdventureStoreState {
  return inMemoryState;
}

export async function mutateAdventureState<T>(
  mutator: (state: AdventureStoreState) => T | Promise<T>
): Promise<T> {
  const task = writeQueue.then(async () => {
    const result = await mutator(inMemoryState);
    writeStateToDiskAtomic(inMemoryState);
    return result;
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

export function makeProfileKey(schoolId: string, studentId: string): string {
  return `${schoolId}__${studentId}`;
}

export function makeWorldProgressKey(schoolId: string, studentId: string, worldId: string): string {
  return `${schoolId}__${studentId}__${worldId}`;
}

export function makeCheckpointProgressKey(
  schoolId: string,
  studentId: string,
  checkpointId: string
): string {
  return `${schoolId}__${studentId}__${checkpointId}`;
}

export function makeStudentBadgeKey(schoolId: string, studentId: string, badgeId: string): string {
  return `${schoolId}__${studentId}__${badgeId}`;
}

export function makeWorldOverrideKey(schoolId: string, worldId: string): string {
  return `${schoolId}__${worldId}`;
}
