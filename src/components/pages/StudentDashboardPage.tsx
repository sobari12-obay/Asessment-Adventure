import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Award,
  BookOpen,
  Compass,
  Crown,
  Flame,
  History,
  Lock,
  LogOut,
  Map as MapIcon,
  Palette,
  Play,
  Shield,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  resolveAllWorldStatuses,
  type CompletedWorldRecord,
  type ResolvedWorldState,
} from '../../data/worldStatusConfig';
import { getWorldConfig } from '../../data/worlds';
import { audioEngine } from '../../lib/audioEngine';
import {
  completeAdventureCheckpoint,
  fetchAdventureWorldDetail,
  fetchStudentBaseCamp,
  fetchStudentResults,
  openAdventureWorld,
  saveStudentAdventureCharacter,
  startAdventureCheckpoint,
  type StudentBaseCampResponse,
  type StudentSubmissionSummary,
} from '../../services/apiClient';
import {
  DEFAULT_SCHOOL_NAME,
  type AccessibilityPreferences,
  type AdventureCelebrationDelta,
  type AdventureCheckpointItem,
  type AdventureWorldSummary,
  type AssessmentSession,
  type BagStyleId,
  type CharacterExpression,
  type ExplorerCharacterId,
  type OutfitThemeId,
  type PublicAssessment,
  type ShoeStyleId,
} from '../../types/psas';
import {
  AdventureBackdrop,
  AdventureCelebrationOverlay,
  AdventureHeader,
  AdventureLoading,
  AdventureNotice,
  AdventureWorldMap,
  BackNavButton,
  CharacterCustomizerModal,
  ConfirmModal,
  ExplorerAvatarCard,
  PrimaryButton,
  SecondaryButton,
  WorldCheckpointModal,
} from '../adventure';

export interface ActiveStudentProfile {
  studentId: string;
  studentName: string;
  classId: string;
  gradeClass: string;
  participantNumber?: string;
  characterId: ExplorerCharacterId;
}

interface StudentDashboardPageProps {
  student: ActiveStudentProfile;
  studentToken?: string | null;
  publicAssessments: PublicAssessment[];
  completedWorlds: CompletedWorldRecord[];
  activeAssessment?: PublicAssessment | null;
  activeSession?: AssessmentSession | null;
  recoverableSession?: AssessmentSession | null;
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  onUpdateCharacter?: (nextCharId: ExplorerCharacterId) => void;
  onContinueActiveAdventure: () => void;
  onEnterWorldFromMap: (item: ResolvedWorldState) => void;
  onOpenGuide: () => void;
  onBackHome: () => void;
  onLogoutStudent: () => void;
}

type BaseCampTab = 'map' | 'badges' | 'results' | 'history';

const LEVEL_TABLE_INFO = [
  { level: 1, title: 'Penjelajah Pemula', range: '0–99 XP' },
  { level: 2, title: 'Penjelajah Muda', range: '100–249 XP' },
  { level: 3, title: 'Penjelajah Aktif', range: '250–449 XP' },
  { level: 4, title: 'Penjelajah Hebat', range: '450–699 XP' },
  { level: 5, title: 'Petualang Cerdas', range: '700–999 XP' },
  { level: 6, title: 'Petualang Tangguh', range: '1000–1399 XP' },
  { level: 7, title: 'Penjelajah Andal', range: '1400–1799 XP' },
  { level: 8, title: 'Penjelajah Istimewa', range: '1800–2299 XP' },
  { level: 9, title: 'Master Petualangan', range: '2300–2899 XP' },
  { level: 10, title: 'Legenda Penjelajah', range: '2900+ XP' },
];

export const StudentDashboardPage: React.FC<StudentDashboardPageProps> = ({
  student,
  studentToken,
  publicAssessments,
  completedWorlds,
  activeAssessment,
  activeSession,
  recoverableSession,
  prefs,
  onUpdatePrefs,
  onUpdateCharacter,
  onContinueActiveAdventure,
  onEnterWorldFromMap,
  onOpenGuide,
  onBackHome,
  onLogoutStudent,
}) => {
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [mapNotice, setMapNotice] = useState('');
  const [activeTab, setActiveTab] = useState<BaseCampTab>('map');

  // Stage 2 Base Camp Authoritative State
  const [baseCamp, setBaseCamp] = useState<StudentBaseCampResponse | null>(null);
  const [loadingBaseCamp, setLoadingBaseCamp] = useState(Boolean(studentToken));
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [savingCharacter, setSavingCharacter] = useState(false);
  const [characterError, setCharacterError] = useState('');
  const [characterExpression, setCharacterExpression] = useState<CharacterExpression>('idle');

  // Celebration overlay state
  const [celebration, setCelebration] = useState<AdventureCelebrationDelta | null>(null);

  // World & Checkpoint explorer modal state
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [modalWorld, setModalWorld] = useState<AdventureWorldSummary | null>(null);
  const [modalCheckpoints, setModalCheckpoints] = useState<AdventureCheckpointItem[]>([]);
  const [loadingWorldModal, setLoadingWorldModal] = useState(false);
  const [busyCheckpointId, setBusyCheckpointId] = useState<string | null>(null);

  const triggerCelebration = useCallback(
    (delta: AdventureCelebrationDelta | null) => {
      if (!delta) return;
      if (
        delta.xpGranted > 0 ||
        delta.leveledUp ||
        delta.unlockedBadges.length > 0 ||
        Boolean(delta.completedWorldName)
      ) {
        setCharacterExpression('celebrate');
        if (prefs.soundEffectsEnabled) {
          if (delta.leveledUp || delta.unlockedBadges.length > 0 || delta.completedWorldName) {
            audioEngine.playComplete();
          } else {
            audioEngine.playCheckpoint();
          }
        }
        setCelebration(delta);
      }
    },
    [prefs.soundEffectsEnabled]
  );

  const refreshBaseCamp = useCallback(async () => {
    if (!studentToken) {
      setLoadingBaseCamp(false);
      return;
    }
    try {
      const data = await fetchStudentBaseCamp(studentToken);
      setBaseCamp(data);
      if (!data.profile.characterSelected) {
        setCustomizerOpen(true);
      } else if (data.celebration) {
        triggerCelebration(data.celebration);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingBaseCamp(false);
    }
  }, [studentToken, triggerCelebration]);

  // Stage 3 Student Results History
  const [studentResults, setStudentResults] = useState<StudentSubmissionSummary[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const loadStudentResults = useCallback(async () => {
    if (!studentToken) return;
    setLoadingResults(true);
    try {
      const res = await fetchStudentResults(studentToken);
      setStudentResults(Array.isArray(res.items) ? res.items : []);
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingResults(false);
    }
  }, [studentToken]);

  useEffect(() => {
    void refreshBaseCamp();
    void loadStudentResults();
  }, [refreshBaseCamp, loadStudentResults]);

  const animationsOn = prefs.animationsEnabled && !prefs.reducedMotion;

  const { items: worldStates, hasLiveFirebaseAssessments } = useMemo(
    () =>
      resolveAllWorldStatuses({
        publicAssessments,
        completedWorlds,
        activeAssessment,
        activeSession,
        recoverableSession,
        activeStudentId: student.studentId,
      }),
    [
      publicAssessments,
      completedWorlds,
      activeAssessment,
      activeSession,
      recoverableSession,
      student.studentId,
    ]
  );

  const adventureWorldsMap = useMemo(() => {
    if (!baseCamp?.worlds) return undefined;
    const map: Record<string, AdventureWorldSummary> = {};
    for (const w of baseCamp.worlds) {
      map[w.id] = w;
    }
    return map;
  }, [baseCamp]);

  const profile = baseCamp?.profile;
  const levelInfo = baseCamp?.levelInfo;

  async function handleSaveCharacterCustomization(payload: {
    characterId: ExplorerCharacterId;
    outfitTheme: OutfitThemeId;
    bagStyle: BagStyleId;
    shoeStyle: ShoeStyleId;
    accentColor: string;
    nickname: string;
  }) {
    if (!studentToken) return;
    setSavingCharacter(true);
    setCharacterError('');
    try {
      const res = await saveStudentAdventureCharacter(studentToken, payload);
      onUpdateCharacter?.(res.profile.characterId);
      setCustomizerOpen(false);
      setCharacterExpression('happy');
      await refreshBaseCamp();
      triggerCelebration(res.celebration);
    } catch (err) {
      setCharacterError(
        err instanceof Error ? err.message : 'Gagal menyimpan pilihan karakter.'
      );
    } finally {
      setSavingCharacter(false);
    }
  }

  async function handleOpenWorldExplorer(item: ResolvedWorldState) {
    setMapNotice('');
    if (!studentToken) {
      if (item.status === 'terkunci') {
        setMapNotice(item.lockReason || 'Dunia ini belum dibuka oleh Bapak/Ibu Guru.');
        return;
      }
      onEnterWorldFromMap(item);
      return;
    }

    const advWorld = adventureWorldsMap?.[item.world.id];
    if (advWorld && !advWorld.isAvailable) {
      setMapNotice(advWorld.availabilityReason);
      return;
    }

    setWorldModalOpen(true);
    setLoadingWorldModal(true);
    setModalWorld(advWorld || null);
    setModalCheckpoints([]);

    try {
      const opened = await openAdventureWorld(studentToken, item.world.id);
      setModalWorld(opened.world);
      setModalCheckpoints(opened.checkpoints);
      if (opened.celebration) {
        triggerCelebration(opened.celebration);
      }
      await refreshBaseCamp();
    } catch (err) {
      setWorldModalOpen(false);
      setMapNotice(
        err instanceof Error
          ? err.message
          : 'Dunia ini belum dibuka oleh pengaturan guru.'
      );
    } finally {
      setLoadingWorldModal(false);
    }
  }

  async function handleStartCheckpoint(checkpointId: string) {
    if (!studentToken || !modalWorld) return;
    try {
      await startAdventureCheckpoint(studentToken, checkpointId);
      const detail = await fetchAdventureWorldDetail(studentToken, modalWorld.id);
      setModalWorld(detail.world);
      setModalCheckpoints(detail.checkpoints);
    } catch {
      // Ignore transient start glitch
    }
  }

  async function handleCompleteCheckpoint(checkpointId: string) {
    if (!studentToken) return;
    setBusyCheckpointId(checkpointId);
    try {
      const completed = await completeAdventureCheckpoint(studentToken, checkpointId);
      setModalWorld(completed.world);
      const detail = await fetchAdventureWorldDetail(studentToken, completed.world.id);
      setModalCheckpoints(detail.checkpoints);
      await refreshBaseCamp();
      triggerCelebration(completed.celebration);
    } catch (err) {
      setMapNotice(err instanceof Error ? err.message : 'Gagal menyelesaikan checkpoint.');
    } finally {
      setBusyCheckpointId(null);
    }
  }

  const continueTargetWorld = useMemo(() => {
    if (activeAssessment) return getWorldConfig(activeAssessment.subjectId);
    if (profile?.lastWorldId) return getWorldConfig(profile.lastWorldId);
    const firstAvailable = baseCamp?.worlds.find(
      (w) => w.isAvailable && w.status !== 'selesai'
    );
    return firstAvailable ? getWorldConfig(firstAvailable.subjectId) : null;
  }, [activeAssessment, profile?.lastWorldId, baseCamp?.worlds]);

  const earnedBadgesCount = baseCamp?.badges.filter((b) => b.earned).length || 0;
  const totalBadgesCount = baseCamp?.badges.length || 12;

  return (
    <div
      className={`min-h-screen relative flex flex-col text-slate-900 ${
        prefs.reducedMotion ? 'reduced-motion' : ''
      }`}
    >
      <AdventureBackdrop animationsEnabled={animationsOn} variant="portal" />

      <div className="relative z-10 flex-1 flex flex-col">
        <AdventureHeader
          onLogoClick={onBackHome}
          navItems={[
            { id: 'dashboard', label: 'Base Camp', active: true, onClick: () => setActiveTab('map') },
            { id: 'guide', label: 'Petunjuk', onClick: onOpenGuide },
            { id: 'home', label: 'Beranda Utama', onClick: onBackHome },
          ]}
          prefs={prefs}
          onUpdatePrefs={onUpdatePrefs}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-7">
          {/* Top Navigation Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BackNavButton label="Kembali ke Beranda" onClick={onBackHome} />

            <div className="flex items-center gap-2.5">
              {profile?.characterSelected && (
                <SecondaryButton onClick={() => setCustomizerOpen(true)}>
                  <Palette className="w-4 h-4 text-teal-700" />
                  <span>Ubah Karakter & Perlengkapan</span>
                </SecondaryButton>
              )}
              <SecondaryButton
                onClick={() => setConfirmLogoutOpen(true)}
                className="border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar Siswa</span>
              </SecondaryButton>
            </div>
          </div>

          {loadingBaseCamp ? (
            <div className="bg-white/95 border border-slate-200 rounded-3xl p-10 flex justify-center">
              <AdventureLoading
                label="Memasuki Base Camp Penjelajah..."
                sublabel="Menyiapkan karakter, level, lencana, dan peta 10 dunia."
              />
            </div>
          ) : (
            <>
              {/* BASE CAMP HERO HUB */}
              <motion.section
                initial={prefs.reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white/95 border-2 border-teal-100 rounded-3xl overflow-hidden shadow-sm"
              >
                {/* Cozy Base Camp Illustration Strip */}
                <div className="relative h-36 sm:h-44 w-full overflow-hidden bg-teal-900">
                  <img
                    src="/src/assets/images/base_camp_explorer_1795581891616.jpg"
                    alt="Base Camp Pusat Petualangan 10 Dunia Penjelajah Cilik"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-center opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/35 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 sm:left-7 sm:right-7 flex flex-wrap items-end justify-between gap-3 text-white">
                    <div>
                      <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Compass className="w-4 h-4" />
                        BASE CAMP PENJELAJAH · {DEFAULT_SCHOOL_NAME}
                      </p>
                      <h1 className="font-display text-xl sm:text-3xl font-extrabold leading-tight">
                        Selamat Datang, {student.studentName}!
                      </h1>
                    </div>
                    <span className="text-xs font-bold bg-white/15 backdrop-blur-xs border border-white/25 px-3 py-1.5 rounded-xl">
                      Kelas {student.gradeClass}
                      {student.participantNumber ? ` · No. ${student.participantNumber}` : ''}
                    </span>
                  </div>
                </div>

                {/* Character + Level Progress + Main CTAs */}
                <div className="p-5 sm:p-7 space-y-6">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                    <ExplorerAvatarCard
                      characterId={profile?.characterId || student.characterId}
                      outfitTheme={profile?.outfitTheme}
                      bagStyle={profile?.bagStyle}
                      shoeStyle={profile?.shoeStyle}
                      nickname={profile?.nickname}
                      expression={characterExpression}
                      animationsEnabled={animationsOn}
                      reducedMotion={prefs.reducedMotion}
                      size="lg"
                    />

                    {/* Level & XP Bar Card */}
                    <div className="flex-1 max-w-xl rounded-2xl bg-gradient-to-br from-amber-50/80 via-white to-teal-50/70 border border-amber-200/90 p-4 sm:p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-display font-extrabold text-lg flex items-center justify-center shadow-xs">
                            {levelInfo?.level || 1}
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                              Level {levelInfo?.level || 1} Penjelajah
                            </p>
                            <p className="font-display text-base sm:text-lg font-extrabold text-slate-900">
                              {levelInfo?.title || 'Penjelajah Pemula'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right tabular-nums">
                          <p className="font-mono-tabular text-xl font-extrabold text-teal-800">
                            {levelInfo?.totalXp ?? 0} XP
                          </p>
                          <p className="text-[11px] text-slate-600">
                            {levelInfo?.nextLevelXp !== null && levelInfo?.nextLevelXp !== undefined
                              ? `${levelInfo.xpToNextLevel} XP lagi ke Level ${(levelInfo.level || 1) + 1}`
                              : 'Level Tertinggi Tercapai!'}
                          </p>
                        </div>
                      </div>

                      <div className="w-full h-3 bg-amber-100 rounded-full overflow-hidden border border-amber-200/70">
                        <svg
                          viewBox="0 0 100 12"
                          preserveAspectRatio="none"
                          className="w-full h-full block"
                        >
                          <rect
                            x="0"
                            y="0"
                            width={Math.max(4, levelInfo?.progressPercent || 4)}
                            height="12"
                            rx="6"
                            fill="#D97706"
                          />
                        </svg>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        {continueTargetWorld ? (
                          <PrimaryButton
                            onClick={() => {
                              audioEngine.playStep();
                              const matchedItem = worldStates.find(
                                (w) => w.world.id === continueTargetWorld.id
                              );
                              if (activeAssessment && activeAssessment.subjectId === continueTargetWorld.id) {
                                onContinueActiveAdventure();
                              } else if (matchedItem) {
                                void handleOpenWorldExplorer(matchedItem);
                              }
                            }}
                            className="text-xs sm:text-sm"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>Lanjutkan: {continueTargetWorld.worldName}</span>
                          </PrimaryButton>
                        ) : (
                          <PrimaryButton
                            onClick={() => setActiveTab('map')}
                            className="text-xs sm:text-sm"
                          >
                            <Compass className="w-4 h-4" />
                            <span>Pilih Dunia Petualangan</span>
                          </PrimaryButton>
                        )}

                        <SecondaryButton
                          onClick={() => {
                            setActiveTab('map');
                            const mapEl = document.getElementById('basecamp-world-map');
                            mapEl?.scrollIntoView({ behavior: prefs.reducedMotion ? 'auto' : 'smooth' });
                          }}
                          className="text-xs sm:text-sm"
                        >
                          <MapIcon className="w-4 h-4 text-teal-700" />
                          <span>Pilih Dunia (10)</span>
                        </SecondaryButton>
                      </div>
                    </div>
                  </div>

                  {/* Base Camp 5 Honest Stat Tiles */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-4 border-t border-slate-100">
                    <div className="rounded-2xl bg-sky-50/70 border border-sky-200/80 p-3.5">
                      <p className="text-xs font-semibold text-sky-800">Dunia Dikunjungi</p>
                      <p className="font-mono-tabular text-2xl font-extrabold text-sky-900 mt-1">
                        {profile?.worldsExploredCount ?? 0} / 10
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5">
                      <p className="text-xs font-semibold text-slate-500">Dunia Selesai</p>
                      <p className="font-mono-tabular text-2xl font-extrabold text-slate-900 mt-1">
                        {profile?.worldsCompletedCount ?? 0} / 10
                      </p>
                    </div>
                    <div className="rounded-2xl bg-teal-50/70 border border-teal-200/80 p-3.5">
                      <p className="text-xs font-semibold text-teal-800">Pos Checkpoint</p>
                      <p className="font-mono-tabular text-2xl font-extrabold text-teal-800 mt-1">
                        {profile?.checkpointsCompletedCount ?? 0} Pos
                      </p>
                    </div>
                    <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-3.5">
                      <p className="text-xs font-semibold text-amber-800">Total Pengalaman</p>
                      <p className="font-mono-tabular text-2xl font-extrabold text-amber-700 mt-1">
                        {levelInfo?.totalXp ?? 0} XP
                      </p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200/80 p-3.5 col-span-2 lg:col-span-1">
                      <p className="text-xs font-semibold text-emerald-800">Lencana Penjelajah</p>
                      <p className="font-mono-tabular text-2xl font-extrabold text-emerald-700 mt-1">
                        {earnedBadgesCount} / {totalBadgesCount}
                      </p>
                    </div>
                  </div>

                  {/* Personal Non-Competitive Assessment Portal Readiness Summary */}
                  <div className="rounded-2xl bg-slate-50/90 border border-slate-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                    <span className="font-semibold text-slate-800">
                      Status Misi Asesmen Pribadi:
                    </span>
                    <div className="flex flex-wrap items-center gap-3 font-medium">
                      <span className="text-teal-800">
                        Siap Dikerjakan:{' '}
                        <strong className="font-mono-tabular">
                          {worldStates.filter((w) => w.status === 'tersedia').length}
                        </strong>
                      </span>
                      <span className="text-amber-700">
                        Sedang Berjalan:{' '}
                        <strong className="font-mono-tabular">
                          {worldStates.filter((w) => w.status === 'sedang_dikerjakan').length}
                        </strong>
                      </span>
                      <span className="text-emerald-700">
                        Sudah Tuntas:{' '}
                        <strong className="font-mono-tabular">
                          {worldStates.filter((w) => w.status === 'selesai').length}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </motion.section>

              {mapNotice && (
                <AdventureNotice
                  variant="info"
                  title="Info Gerbang Dunia"
                  message={mapNotice}
                />
              )}

              {/* Base Camp Navigation Tabs */}
              <div className="flex flex-wrap items-center gap-2 bg-white/90 border border-slate-200 rounded-2xl p-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('map')}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    activeTab === 'map'
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <MapIcon className="w-4 h-4" />
                  <span>Peta 10 Dunia</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('badges')}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    activeTab === 'badges'
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Trophy className="w-4 h-4" />
                  <span>Lemari Lencana ({earnedBadgesCount}/{totalBadgesCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('results');
                    void loadStudentResults();
                  }}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    activeTab === 'results'
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Hasil &amp; Riwayat Ujian ({studentResults.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    activeTab === 'history'
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Riwayat XP &amp; Jenjang Level</span>
                </button>
              </div>

              {/* TAB 1: INTERACTIVE 10-WORLD MAP */}
              {activeTab === 'map' && (
                <div id="basecamp-world-map">
                  <AdventureWorldMap
                    worldStates={worldStates}
                    adventureWorldsMap={adventureWorldsMap}
                    hasLiveFirebaseAssessments={hasLiveFirebaseAssessments}
                    animationsEnabled={animationsOn}
                    reducedMotion={prefs.reducedMotion}
                    isStudentLoggedIn
                    onSelectWorldAction={(item) => void handleOpenWorldExplorer(item)}
                  />
                </div>
              )}

              {/* TAB 2: 12-BADGE GALLERY */}
              {activeTab === 'badges' && (
                <section className="bg-white/95 border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-extrabold text-slate-900 flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-600" />
                        Lemari 12 Lencana Penjelajah Cilik
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Setiap lencana terbuka otomatis saat kamu menyelesaikan tantangan dan pos petualangan.
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-xl tabular-nums">
                      {earnedBadgesCount} / {totalBadgesCount} Lencana Diraih
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {(baseCamp?.badges || []).map((badge) => (
                      <div
                        key={badge.id}
                        className={`rounded-2xl border-2 p-4 flex items-start gap-3.5 transition-colors ${
                          badge.earned
                            ? 'border-amber-300 bg-amber-50/50'
                            : 'border-slate-200 bg-slate-50/70 opacity-80'
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                            badge.earned
                              ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-xs'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {badge.earned ? (
                            badge.category === 'consistency' ? (
                              <Flame className="w-6 h-6" />
                            ) : badge.id === 'penjelajah_10_dunia' ? (
                              <Crown className="w-6 h-6" />
                            ) : badge.id === 'si_pemberani' ? (
                              <Shield className="w-6 h-6" />
                            ) : (
                              <Trophy className="w-6 h-6" />
                            )
                          ) : (
                            <Lock className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-display font-bold text-sm text-slate-900">
                              {badge.name}
                            </p>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                            {badge.description}
                          </p>
                          <p
                            className={`text-[11px] font-bold mt-1.5 ${
                              badge.earned ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {badge.earned
                              ? `Terbuka (${badge.earnedAt?.slice(0, 10) || 'Hari ini'})`
                              : 'Belum terbuka'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* TAB 3: STUDENT RESULTS HISTORY */}
              {activeTab === 'results' && (
                <section className="bg-white/95 border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-extrabold text-slate-900 flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-teal-700" />
                        Riwayat &amp; Hasil Ujian Kamu
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Menampilkan status pengiriman ujian, penilaian uraian, dan nilai sesuai kebijakan guru.
                      </p>
                    </div>
                  </div>

                  {loadingResults ? (
                    <p className="text-sm text-slate-500 py-8 text-center">
                      Memuat riwayat ujian dari server...
                    </p>
                  ) : studentResults.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center space-y-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Belum ada riwayat misi ujian yang diselesaikan.
                      </p>
                      <p className="text-xs text-slate-500">
                        Pilih dunia yang tersedia di Peta 10 Dunia untuk memulai ujian atau latihan.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {studentResults.map((item) => {
                        const worldMeta = getWorldConfig(item.subjectId);
                        const waitingEssay =
                          item.gradingStatus === 'waiting_essay_grading' || item.needsManualReview;
                        return (
                          <div
                            key={item.submissionId}
                            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-semibold text-teal-800">
                                  {worldMeta.subjectName}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {item.examMode === 'latihan'
                                    ? 'Latihan (Non-Rapor)'
                                    : item.examMode === 'simulasi'
                                      ? 'Simulasi (Non-Rapor)'
                                      : 'Asesmen Resmi'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>Percobaan #{item.attemptNumber || 1}</span>
                              </div>
                              <p className="font-display font-bold text-base text-slate-900">
                                {item.assessmentTitle}
                              </p>
                              <p className="text-xs text-slate-500">
                                Dikirim: {new Date(item.submittedAt).toLocaleString('id-ID')}
                              </p>
                            </div>

                            <div className="sm:text-right shrink-0">
                              {item.scoreVisible && item.finalScore !== null ? (
                                <div>
                                  <p className="font-mono-tabular text-2xl font-extrabold text-teal-800">
                                    {item.finalScore}
                                  </p>
                                  {item.correctCount !== null && (
                                    <p className="text-xs text-slate-600 tabular-nums">
                                      Benar {item.correctCount} soal
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                                    waitingEssay ? 'text-amber-800' : 'text-emerald-800'
                                  }`}
                                >
                                  {waitingEssay ? (
                                    <Clock className="w-4 h-4" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                  )}
                                  {item.statusLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* TAB 4: XP HISTORY, EVENTS & LEVEL TABLE */}
              {activeTab === 'history' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <section className="lg:col-span-7 bg-white/95 border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-4">
                    <h2 className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-600" />
                      Catatan Pengalaman (XP) & Jejak Petualangan
                    </h2>

                    {(baseCamp?.recentXpHistory.length || 0) === 0 ? (
                      <p className="text-sm text-slate-500 py-6 text-center bg-slate-50 rounded-2xl">
                        Belum ada catatan XP. Buka dunia yang tersedia atau selesaikan pos checkpoint untuk mulai mengumpulkan XP!
                      </p>
                    ) : (
                      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                        {baseCamp?.recentXpHistory.map((tx) => (
                          <div
                            key={tx.transactionId}
                            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900">{tx.description}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Sumber: {tx.sourceType} · Total jadi {tx.newTotalXp} XP (Level{' '}
                                {tx.newLevel})
                              </p>
                            </div>
                            <span className="font-mono-tabular text-sm font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl shrink-0">
                              +{tx.amount} XP
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="lg:col-span-5 bg-white/95 border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-4">
                    <h2 className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-teal-700" />
                      Tangga 10 Level Penjelajah
                    </h2>
                    <div className="space-y-2">
                      {LEVEL_TABLE_INFO.map((row) => {
                        const isCurrent = (levelInfo?.level || 1) === row.level;
                        const unlocked = (levelInfo?.level || 1) >= row.level;
                        return (
                          <div
                            key={row.level}
                            className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between text-xs ${
                              isCurrent
                                ? 'border-amber-400 bg-amber-50 font-bold text-slate-950'
                                : unlocked
                                  ? 'border-emerald-200 bg-emerald-50/40 text-emerald-950'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            <span>
                              Level {row.level} · {row.title}
                            </span>
                            <span className="font-mono-tabular font-semibold">{row.range}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* First-Time Character Gate & Customization Modal */}
      <CharacterCustomizerModal
        key={`${profile?.characterId || student.characterId}_${profile?.outfitTheme || 'rimba_emerald'}_${customizerOpen ? 'open' : 'closed'}`}
        open={customizerOpen}
        isFirstTimeGate={!profile?.characterSelected}
        studentName={student.studentName}
        gradeClass={student.gradeClass}
        initialCharacterId={profile?.characterId || student.characterId}
        initialOutfitTheme={profile?.outfitTheme || 'rimba_emerald'}
        initialBagStyle={profile?.bagStyle || 'ransel_kompas'}
        initialShoeStyle={profile?.shoeStyle || 'sepatu_rimba'}
        initialAccentColor={profile?.accentColor || '#0F766E'}
        initialNickname={profile?.nickname || ''}
        animationsEnabled={animationsOn}
        reducedMotion={prefs.reducedMotion}
        isSaving={savingCharacter}
        errorMessage={characterError}
        onSave={(payload) => void handleSaveCharacterCustomization(payload)}
        onClose={profile?.characterSelected ? () => setCustomizerOpen(false) : undefined}
      />

      {/* World & Checkpoint Explorer Modal */}
      <WorldCheckpointModal
        open={worldModalOpen}
        world={modalWorld}
        checkpoints={modalCheckpoints}
        loading={loadingWorldModal}
        busyCheckpointId={busyCheckpointId}
        onStartCheckpoint={handleStartCheckpoint}
        onCompleteCheckpoint={handleCompleteCheckpoint}
        onLaunchExamIfActive={(w) => {
          setWorldModalOpen(false);
          const matched = worldStates.find((item) => item.world.id === w.subjectId);
          if (matched) onEnterWorldFromMap(matched);
        }}
        onClose={() => setWorldModalOpen(false)}
      />

      {/* Level-Up, Badge & XP Celebration */}
      <AdventureCelebrationOverlay
        celebration={celebration}
        reducedMotion={prefs.reducedMotion}
        onDismiss={() => {
          setCelebration(null);
          setCharacterExpression('idle');
        }}
      />

      <ConfirmModal
        open={confirmLogoutOpen}
        title="Keluar dari Akun Siswa?"
        message="Sesi petualangan aktif akan ditutup dari layar ini. Karakter, XP, level, dan lencana kamu tetap tersimpan aman."
        confirmLabel="Ya, Keluar"
        cancelLabel="Tetap di Sini"
        tone="primary"
        onConfirm={() => {
          setConfirmLogoutOpen(false);
          onLogoutStudent();
        }}
        onCancel={() => setConfirmLogoutOpen(false)}
      />
    </div>
  );
};
