import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Play,
  RotateCcw,
  Settings,
  Star,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { EXPLORER_CHARACTERS, getExplorerCharacter } from '../../data/characters';
import {
  resolveAllWorldStatuses,
  type CompletedWorldRecord,
  type ResolvedWorldState,
} from '../../data/worldStatusConfig';
import { WORLDS, getWorldConfig } from '../../data/worlds';
import { audioEngine } from '../../lib/audioEngine';
import {
  DEFAULT_SCHOOL_NAME,
  type AccessibilityPreferences,
  type AssessmentSession,
  type ExplorerCharacterId,
  type PublicAssessment,
} from '../../types/psas';
import {
  AdventureBackdrop,
  AdventureHeader,
  AdventureWorldMap,
  ConfirmModal,
  PrimaryButton,
  SecondaryButton,
} from '../adventure';

interface LandingPageProps {
  publicAssessments: PublicAssessment[];
  completedWorlds: CompletedWorldRecord[];
  recoverableSession: { session: AssessmentSession; savedAt: string } | null;
  activeCharacterId: ExplorerCharacterId;
  activeStudentLabel?: { studentName: string; gradeClass: string } | null;
  isStudentLoggedIn?: boolean;
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  onChangeCharacter: (id: ExplorerCharacterId) => void;
  onStartAdventureChoice: () => void;
  onOpenStudentDashboard?: () => void;
  onEnterWorldDirectly: (item: ResolvedWorldState) => void;
  onOpenGuide: () => void;
  onOpenTeacherPortal: () => void;
  onResumeSession: () => void;
  onDiscardRecoverable: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  publicAssessments,
  completedWorlds,
  recoverableSession,
  activeCharacterId,
  activeStudentLabel,
  isStudentLoggedIn = false,
  prefs,
  onUpdatePrefs,
  onChangeCharacter,
  onStartAdventureChoice,
  onOpenStudentDashboard,
  onEnterWorldDirectly,
  onOpenGuide,
  onOpenTeacherPortal,
  onResumeSession,
  onDiscardRecoverable,
}) => {
  const [activeTab, setActiveTab] = useState<'worlds' | 'badges' | 'comfort'>('worlds');
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const selectedCharacter = getExplorerCharacter(activeCharacterId);
  const animationsOn = prefs.animationsEnabled && !prefs.reducedMotion;

  const { items: worldStates, hasLiveFirebaseAssessments } = useMemo(
    () =>
      resolveAllWorldStatuses({
        publicAssessments,
        completedWorlds: isStudentLoggedIn ? completedWorlds : [],
        recoverableSession: isStudentLoggedIn ? recoverableSession?.session || null : null,
      }),
    [publicAssessments, completedWorlds, isStudentLoggedIn, recoverableSession]
  );

  const completedCount = useMemo(
    () => worldStates.filter((w) => w.status === 'selesai').length,
    [worldStates]
  );

  const totalStars = useMemo(
    () =>
      isStudentLoggedIn
        ? completedWorlds.reduce((sum, w) => sum + (w.starsEarned || 0), 0)
        : 0,
    [isStudentLoggedIn, completedWorlds]
  );

  return (
    <div
      className={`min-h-screen relative flex flex-col text-slate-900 ${
        prefs.reducedMotion ? 'reduced-motion' : ''
      }`}
    >
      <AdventureBackdrop animationsEnabled={animationsOn} />

      <div className="relative z-10 flex-1 flex flex-col">
        <AdventureHeader
          onLogoClick={() => setActiveTab('worlds')}
          navItems={[
            {
              id: 'worlds',
              label: 'Peta 10 Dunia',
              active: activeTab === 'worlds',
              onClick: () => setActiveTab('worlds'),
            },
            {
              id: 'badges',
              label: 'Koleksi Lencana',
              active: activeTab === 'badges',
              onClick: () => setActiveTab('badges'),
            },
            {
              id: 'guide',
              label: 'Petunjuk',
              onClick: onOpenGuide,
            },
            {
              id: 'comfort',
              label: 'Suara & Gerak',
              active: activeTab === 'comfort',
              onClick: () => setActiveTab('comfort'),
            },
          ]}
          prefs={prefs}
          onUpdatePrefs={onUpdatePrefs}
          primaryAction={{ label: 'Masuk Guru', onClick: onOpenTeacherPortal }}
        />

        {/* Compact Mobile Navigation Strip */}
        <div className="lg:hidden bg-white/95 border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('worlds')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'worlds' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Peta 10 Dunia
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('badges')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'badges' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Koleksi Lencana
          </button>
          <button
            type="button"
            onClick={onOpenGuide}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Petunjuk
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comfort')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'comfort' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Suara & Gerak
          </button>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          {/* Session Recovery Banner */}
          {recoverableSession && recoverableSession.session.status === 'in_progress' && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-slate-900 text-base">
                    Lanjutkan Petualangan Terakhir?
                  </h2>
                  <p className="text-sm text-slate-700 mt-0.5">
                    {recoverableSession.session.studentName} · Kelas{' '}
                    {recoverableSession.session.gradeClass} ·{' '}
                    {getWorldConfig(recoverableSession.session.subjectId).worldName} ·{' '}
                    {recoverableSession.session.answeredIds.length} soal tersimpan
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <PrimaryButton onClick={onResumeSession} className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800">
                  Lanjutkan
                </PrimaryButton>
                <SecondaryButton onClick={() => setConfirmDiscardOpen(true)}>
                  Mulai Baru
                </SecondaryButton>
              </div>
            </section>
          )}

          {activeTab === 'worlds' && (
            <>
              {/* Hero Opening Stage */}
              <motion.section
                initial={prefs.reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
              >
                {/* Left Column: Title, Slogan, Primary CTAs, Explorer Duo */}
                <div className="lg:col-span-7 bg-white/95 border border-slate-200 rounded-3xl p-6 sm:p-8 flex flex-col justify-between gap-6 shadow-xs">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="text-teal-700">{DEFAULT_SCHOOL_NAME}</span>
                      <span aria-hidden="true">·</span>
                      <span>Kelas 3 Sekolah Dasar</span>
                      <span aria-hidden="true">·</span>
                      <span>Kurikulum Merdeka</span>
                    </div>

                    <div>
                      <p className="font-display text-sm sm:text-base font-bold text-teal-700">
                        PSAS ADVENTURE — 10 Dunia Penjelajah Cilik
                      </p>
                      <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-slate-900 tracking-tight leading-tight text-balance mt-1">
                        Jelajahi Dunia, Selesaikan Misi, Raih Pengalaman!
                      </h1>
                    </div>

                    <p className="text-slate-600 text-sm sm:text-base max-w-2xl leading-relaxed">
                      Ubah asesmen sekolah menjadi petualangan seru penuh cerita, peta Nusantara, dan pengumpulan artefak. Tidak perlu tegang, pilih karakter penjelajahmu dan melangkahlah dengan tenang!
                    </p>

                    {/* Primary & Secondary Action Buttons */}
                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 pt-1">
                      {isStudentLoggedIn && onOpenStudentDashboard ? (
                        <PrimaryButton
                          onClick={onOpenStudentDashboard}
                          className="px-7 py-3.5 text-base"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          <span>BUKA DASHBOARD SISWA</span>
                        </PrimaryButton>
                      ) : (
                        <PrimaryButton
                          onClick={onStartAdventureChoice}
                          className="px-7 py-3.5 text-base"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          <span>MULAI PETUALANGAN</span>
                        </PrimaryButton>
                      )}

                      <SecondaryButton onClick={onOpenTeacherPortal}>
                        <GraduationCap className="w-4 h-4 text-teal-700" />
                        <span>MASUK GURU</span>
                      </SecondaryButton>

                      <SecondaryButton onClick={onOpenGuide}>
                        <BookOpen className="w-4 h-4 text-amber-600" />
                        <span>PETUNJUK</span>
                      </SecondaryButton>
                    </div>
                  </div>

                  {/* Dual Explorer Characters Showcase (Raka & Laras) */}
                  <div className="pt-5 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-700">
                        Dua Penjelajah Utama (Pilih Favoritmu):
                      </p>
                      {isStudentLoggedIn && (
                        <span className="text-xs text-slate-500 tabular-nums">
                          {completedCount}/10 dunia · {totalStars} ★
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {EXPLORER_CHARACTERS.map((char) => {
                        const isSelected = char.id === activeCharacterId;
                        return (
                          <button
                            key={char.id}
                            type="button"
                            onClick={() => {
                              audioEngine.playSelect();
                              onChangeCharacter(char.id);
                            }}
                            className={`min-h-[76px] flex items-center gap-3.5 p-3 rounded-2xl border-2 text-left transition-all duration-150 cursor-pointer ${
                              isSelected
                                ? 'border-teal-600 bg-teal-50/75'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <img
                              src={char.avatarUrl}
                              alt={char.name}
                              referrerPolicy="no-referrer"
                              className={`w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0 ${
                                isSelected && animationsOn ? 'animate-float-slow' : ''
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-display font-bold text-sm text-slate-900">
                                {char.name}
                              </p>
                              <p className="text-xs text-slate-600">{char.title}</p>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Full-Bleed Illustrated Adventure World Visual */}
                <div className="lg:col-span-5 bg-white/95 border border-slate-200 rounded-3xl overflow-hidden flex flex-col shadow-xs">
                  <div className="relative flex-1 min-h-[260px] bg-gradient-to-br from-teal-700 to-sky-700">
                    <img
                      src="/src/assets/images/world_banner_adventure_1795448997744.jpg"
                      alt="Ilustrasi 10 Dunia Penjelajah Cilik dengan awan, pepohonan, lentera, dan pulau pengetahuan"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/90 via-slate-900/45 to-transparent p-5 sm:p-6 text-white">
                      <p className="text-xs font-semibold text-amber-300">
                        {activeStudentLabel
                          ? `${activeStudentLabel.studentName} · Kelas ${activeStudentLabel.gradeClass}`
                          : `${selectedCharacter.name} · ${DEFAULT_SCHOOL_NAME}`}
                      </p>
                      <p className="font-display text-lg sm:text-xl font-bold leading-snug mt-0.5">
                        10 Pulau Pengetahuan Siap Dijelajahi
                      </p>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">
                        Peta Nusantara Penjelajah
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        PAI, Pancasila, B. Indonesia, Matematika, IPAS, Seni, PJOK, B. Inggris, Sunda & Cirebon
                      </p>
                    </div>
                    <img
                      src="/src/assets/images/hero_explorer_map_1795448998319.jpg"
                      alt="Mini peta 10 dunia"
                      referrerPolicy="no-referrer"
                      className="w-16 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  </div>
                </div>
              </motion.section>

              {/* Interactive Winding 10-World Adventure Map */}
              <AdventureWorldMap
                worldStates={worldStates}
                hasLiveFirebaseAssessments={hasLiveFirebaseAssessments}
                animationsEnabled={animationsOn}
                reducedMotion={prefs.reducedMotion}
                isStudentLoggedIn={isStudentLoggedIn}
                onSelectWorldAction={onEnterWorldDirectly}
              />
            </>
          )}

          {activeTab === 'badges' && (
            <section className="bg-white/95 border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <img
                    src="/src/assets/images/badge_master_explorer_1795448997972.jpg"
                    alt="Lencana Penjelajah Utama"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border border-amber-200 shrink-0"
                  />
                  <div>
                    <h1 className="font-display text-2xl font-bold text-slate-900">
                      Lemari Artefak & Lencana Penjelajah
                    </h1>
                    <p className="text-sm text-slate-600">
                      {isStudentLoggedIn
                        ? 'Setiap dunia yang kamu selesaikan memberimu artefak unik dan bintang perjalanan!'
                        : 'Masuk sebagai Siswa untuk mulai mengumpulkan artefak dan lencana pribadimu.'}
                    </p>
                  </div>
                </div>
                {isStudentLoggedIn && (
                  <div className="text-left sm:text-right tabular-nums">
                    <p className="text-2xl font-display font-extrabold text-amber-600 flex items-center gap-1.5 sm:justify-end">
                      <Star className="w-6 h-6 fill-amber-400 text-amber-500" />
                      {totalStars} Bintang
                    </p>
                    <p className="text-xs text-slate-500">{completedWorlds.length} artefak terkumpul</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                {WORLDS.map((w) => {
                  const earned = isStudentLoggedIn
                    ? completedWorlds.find((c) => c.subjectId === w.id)
                    : undefined;
                  return (
                    <div
                      key={w.id}
                      className={`rounded-2xl border p-4 text-center ${
                        earned
                          ? 'bg-amber-50/60 border-amber-200'
                          : 'bg-slate-50 border-slate-200 opacity-75'
                      }`}
                    >
                      <div
                        className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3 ${
                          earned
                            ? `bg-gradient-to-br ${w.gradientClass} text-white`
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <Award className="w-6 h-6" />
                      </div>
                      <p className="font-display font-bold text-sm text-slate-900">
                        {w.artifactName}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">{w.badgeTitle}</p>
                      <p className="text-[11px] font-medium mt-2 text-slate-500">
                        {earned ? `Terkumpul · ${earned.starsEarned} ★` : w.subjectName}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'comfort' && (
            <section className="max-w-2xl bg-white/95 border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xs">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <Settings className="w-6 h-6 text-teal-700" />
                <div>
                  <h1 className="font-display text-xl font-bold text-slate-900">
                    Pengaturan Suara & Kenyamanan
                  </h1>
                  <p className="text-sm text-slate-600">
                    Atur efek suara, musik latar, dan gerakan animasi sesuai kenyamananmu.
                  </p>
                </div>
              </div>

              <div className="space-y-3.5">
                <label className="min-h-[64px] flex items-center justify-between p-4 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <div className="flex items-center gap-3 pr-3">
                    {prefs.soundEffectsEnabled ? (
                      <Volume2 className="w-5 h-5 text-teal-700 shrink-0" />
                    ) : (
                      <VolumeX className="w-5 h-5 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold text-sm text-slate-900">Efek Suara Lembut</p>
                      <p className="text-xs text-slate-500">
                        Nada ringan saat menekan tombol, memilih jawaban, atau membuka checkpoint
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.soundEffectsEnabled}
                    onChange={(e) =>
                      onUpdatePrefs({ ...prefs, soundEffectsEnabled: e.target.checked })
                    }
                    className="w-5 h-5 accent-teal-700 shrink-0"
                  />
                </label>

                <label className="min-h-[64px] flex items-center justify-between p-4 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <div className="pr-3">
                    <p className="font-semibold text-sm text-slate-900">Musik Latar Tenang</p>
                    <p className="text-xs text-slate-500">
                      Alunan melodi pelan selama kamu menjelajah dunia
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.musicEnabled}
                    onChange={(e) => onUpdatePrefs({ ...prefs, musicEnabled: e.target.checked })}
                    className="w-5 h-5 accent-teal-700 shrink-0"
                  />
                </label>

                <label className="min-h-[64px] flex items-center justify-between p-4 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <div className="pr-3">
                    <p className="font-semibold text-sm text-slate-900">Animasi Karakter & Awan</p>
                    <p className="text-xs text-slate-500">
                      Gerakan halus pada karakter Raka & Laras serta elemen peta
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.animationsEnabled}
                    onChange={(e) =>
                      onUpdatePrefs({ ...prefs, animationsEnabled: e.target.checked })
                    }
                    className="w-5 h-5 accent-teal-700 shrink-0"
                  />
                </label>

                <label className="min-h-[64px] flex items-center justify-between p-4 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <div className="pr-3">
                    <p className="font-semibold text-sm text-slate-900">
                      Kurangi Gerak (Reduced Motion)
                    </p>
                    <p className="text-xs text-slate-500">
                      Menonaktifkan seluruh transisi & gerakan untuk fokus maksimal
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={prefs.reducedMotion}
                    onChange={(e) => onUpdatePrefs({ ...prefs, reducedMotion: e.target.checked })}
                    className="w-5 h-5 accent-teal-700 shrink-0"
                  />
                </label>
              </div>
            </section>
          )}
        </main>
      </div>

      <ConfirmModal
        open={confirmDiscardOpen}
        title="Mulai Petualangan Baru?"
        message="Progres sesi terakhir yang tersimpan di perangkat ini akan dihapus dari layar awal. Jawaban yang sudah terkirim ke server tetap aman. Lanjutkan?"
        confirmLabel="Ya, Mulai Baru"
        cancelLabel="Batal"
        tone="danger"
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onDiscardRecoverable();
        }}
        onCancel={() => setConfirmDiscardOpen(false)}
      />
    </div>
  );
};
