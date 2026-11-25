import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  CheckCircle2,
  Compass,
  Info,
  Lock,
  MapPin,
  Play,
  Sparkles,
  Star,
} from 'lucide-react';
import { audioEngine } from '../../lib/audioEngine';
import type {
  ResolvedWorldState,
  WorldAvailabilityStatus,
} from '../../data/worldStatusConfig';
import type { AdventureWorldSummary } from '../../types/psas';
import { PrimaryButton } from './AdventureButtons';
import { WorldLandmarkArt } from './WorldLandmarkArt';

interface AdventureWorldMapProps {
  worldStates: ResolvedWorldState[];
  adventureWorldsMap?: Record<string, AdventureWorldSummary>;
  hasLiveFirebaseAssessments: boolean;
  animationsEnabled: boolean;
  reducedMotion: boolean;
  isStudentLoggedIn: boolean;
  onSelectWorldAction: (item: ResolvedWorldState) => void;
}

function getStatusMeta(status: WorldAvailabilityStatus) {
  switch (status) {
    case 'tersedia':
      return {
        label: 'Tersedia',
        badgeTextClass: 'text-teal-700',
        ringClass: 'border-teal-300 bg-white',
        actionLabel: 'Masuk Dunia',
        icon: Sparkles,
      };
    case 'sedang_dikerjakan':
      return {
        label: 'Sedang Dijelajahi',
        badgeTextClass: 'text-amber-700',
        ringClass: 'border-amber-400 bg-amber-50/40',
        actionLabel: 'Lanjutkan',
        icon: Play,
      };
    case 'selesai':
      return {
        label: 'Selesai',
        badgeTextClass: 'text-emerald-700',
        ringClass: 'border-emerald-300 bg-emerald-50/35',
        actionLabel: 'Jelajahi Lagi',
        icon: CheckCircle2,
      };
    case 'terkunci':
    default:
      return {
        label: 'Belum Tersedia',
        badgeTextClass: 'text-slate-500',
        ringClass: 'border-slate-200 bg-slate-50/85',
        actionLabel: 'Belum Dibuka',
        icon: Lock,
      };
  }
}

export const AdventureWorldMap: React.FC<AdventureWorldMapProps> = ({
  worldStates,
  adventureWorldsMap,
  hasLiveFirebaseAssessments,
  animationsEnabled,
  reducedMotion,
  isStudentLoggedIn,
  onSelectWorldAction,
}) => {
  const enrichedStates = useMemo(() => {
    if (!adventureWorldsMap) return worldStates;
    return worldStates.map((item) => {
      const adv = adventureWorldsMap[item.world.id];
      if (!adv) return item;
      let resolvedStatus: WorldAvailabilityStatus = item.status;
      if (!adv.isAvailable) {
        resolvedStatus = 'terkunci';
      } else if (adv.status === 'selesai') {
        resolvedStatus = 'selesai';
      } else if (adv.status === 'sedang_dijelajahi') {
        resolvedStatus = 'sedang_dikerjakan';
      } else if (adv.status === 'tersedia') {
        resolvedStatus = 'tersedia';
      }
      return {
        ...item,
        status: resolvedStatus,
        lockReason: !adv.isAvailable ? adv.availabilityReason : item.lockReason,
        scheduleLabel: adv.scheduleLabel || item.scheduleLabel,
        progressPercent: adv.progressPercent,
        xpEarned: adv.xpEarned,
      };
    });
  }, [worldStates, adventureWorldsMap]);

  const defaultSelectedId = useMemo(() => {
    const active = enrichedStates.find((w) => w.status === 'sedang_dikerjakan');
    if (active) return active.world.id;
    const available = enrichedStates.find((w) => w.status === 'tersedia');
    return available?.world.id || enrichedStates[0]?.world.id || 'pai';
  }, [enrichedStates]);

  const [selectedWorldId, setSelectedWorldId] = useState<string>(defaultSelectedId);

  const selectedState =
    enrichedStates.find((w) => w.world.id === selectedWorldId) || enrichedStates[0];
  const selectedAdv = selectedState ? adventureWorldsMap?.[selectedState.world.id] : undefined;

  const row1 = enrichedStates.slice(0, 5);
  const row2 = enrichedStates.slice(5, 10);

  return (
    <section className="space-y-6" aria-label="Peta 10 Dunia Petualangan">
      {/* Map Header & Honest Source Indicator */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-teal-700 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Jalur Ekspedisi Nusantara · 10 Mata Pelajaran Kelas 3 SD
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5">
            Peta 10 Dunia Petualangan
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Ketuk salah satu pulau dunia untuk melihat pos checkpoint, artefak, dan status pembukaannya.
          </p>
        </div>

        <div className="text-xs text-slate-600 bg-white border border-slate-200 rounded-xl px-3.5 py-2 inline-flex items-center gap-2 self-start md:self-auto">
          <Info className="w-4 h-4 text-teal-700 shrink-0" />
          <span>
            {adventureWorldsMap
              ? 'Progres, XP, dan ketersediaan dunia tersinkronisasi dengan Adventure Engine.'
              : hasLiveFirebaseAssessments
                ? 'Status dunia mengikuti pengaturan aktif Bapak/Ibu Guru.'
                : 'Status awal jadwal dunia (menunggu pembukaan asesmen guru).'}
          </span>
        </div>
      </div>

      {/* Interactive Winding Nusantara Map Stage */}
      <div className="relative bg-gradient-to-b from-sky-50/90 via-white to-emerald-50/70 border-2 border-teal-100 rounded-3xl p-4 sm:p-6 lg:p-8 overflow-hidden shadow-xs">
        {/* Decorative Fantasy Nusantara Landscape: Clouds, Mountains, River, Bridges & Winding Path */}
        <svg
          viewBox="0 0 1000 340"
          preserveAspectRatio="none"
          className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none opacity-75"
          aria-hidden="true"
        >
          {/* Soft Distant Hills & River */}
          <path d="M 0 320 Q 250 270 500 305 T 1000 285 L 1000 340 L 0 340 Z" fill="#D1FAE5" opacity="0.55" />
          <path d="M 0 175 C 220 150, 440 205, 680 170 C 830 150, 920 175, 1000 165" fill="none" stroke="#BAE6FD" strokeWidth="14" opacity="0.55" strokeLinecap="round" />
          {/* Winding Expedition Trail */}
          <path
            d="M 90 95 C 240 60, 380 130, 500 95 C 630 60, 790 120, 910 95 C 975 115, 975 215, 910 235 C 780 265, 640 200, 500 235 C 360 270, 220 210, 90 235"
            fill="none"
            stroke="#2DD4BF"
            strokeWidth="7"
            strokeDasharray="11 12"
            strokeLinecap="round"
          />
        </svg>

        <div className="relative z-10 space-y-5 lg:space-y-8">
          {/* Row 1: Dunia 1 → 5 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
            {row1.map((item, idx) => (
              <WorldMapNode
                key={item.world.id}
                item={item}
                advSummary={adventureWorldsMap?.[item.world.id]}
                isSelected={selectedState?.world.id === item.world.id}
                staggerOffset={idx % 2 === 1}
                animationsEnabled={animationsEnabled}
                reducedMotion={reducedMotion}
                onSelect={() => {
                  audioEngine.playSelect();
                  setSelectedWorldId(item.world.id);
                }}
                onEnterAction={() => onSelectWorldAction(item)}
              />
            ))}
          </div>

          {/* Row 2: Dunia 6 → 10 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
            {row2.map((item, idx) => (
              <WorldMapNode
                key={item.world.id}
                item={item}
                advSummary={adventureWorldsMap?.[item.world.id]}
                isSelected={selectedState?.world.id === item.world.id}
                staggerOffset={idx % 2 === 0}
                animationsEnabled={animationsEnabled}
                reducedMotion={reducedMotion}
                onSelect={() => {
                  audioEngine.playSelect();
                  setSelectedWorldId(item.world.id);
                }}
                onEnterAction={() => onSelectWorldAction(item)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Selected World Spotlight Panel (Shows Lock Reason / Achievement / Continue CTA) */}
      {selectedState && (
        <motion.div
          key={selectedState.world.id}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={`bg-white border-2 ${selectedState.world.borderClass} rounded-3xl p-5 sm:p-6 shadow-xs`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
              <div
                className={`w-24 h-20 rounded-2xl ${selectedState.world.surfaceBg} border ${selectedState.world.borderClass} flex items-center justify-center shrink-0 p-2`}
              >
                <WorldLandmarkArt subjectId={selectedState.world.id} className="w-20 h-16" />
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`font-bold ${selectedState.world.textClass}`}>
                    Dunia {selectedState.world.number} · {selectedState.world.subjectName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-bold ${getStatusMeta(selectedState.status).badgeTextClass}`}>
                    Status: {getStatusMeta(selectedState.status).label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Pemandu: {selectedState.world.companionName}</span>
                </div>

                <h3 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
                  {selectedState.world.worldName}
                </h3>

                <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                  {selectedState.world.themeSummary}
                </p>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-1">
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                    <Award className="w-4 h-4" />
                    Artefak: {selectedState.world.artifactName}
                  </span>
                  {selectedAdv && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-bold text-teal-800 tabular-nums">
                        Pos Jelajah: {selectedAdv.checkpointsCompleted}/{selectedAdv.checkpointsTotal} · +{selectedAdv.xpEarned} XP
                      </span>
                      {selectedAdv.relatedBadgeName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-semibold ${
                              selectedAdv.relatedBadgeEarned ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            Lencana: {selectedAdv.relatedBadgeName}
                            {selectedAdv.relatedBadgeEarned ? ' (Diraih)' : ''}
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {!selectedAdv && selectedState.status === 'selesai' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 tabular-nums">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                        Pencapaian: {selectedState.starsEarned} Bintang · {selectedState.xpEarned} XP
                      </span>
                    </>
                  )}
                  {!selectedAdv && selectedState.status === 'sedang_dikerjakan' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-bold text-amber-700 tabular-nums">
                        Progres: {selectedState.progressPercent}%
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-stretch sm:items-end gap-2.5 shrink-0">
              {selectedState.status === 'terkunci' ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 max-w-sm text-xs text-slate-700 flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-slate-900">Info Pembukaan Dunia</p>
                    <p className="mt-0.5 leading-relaxed">
                      {selectedState.lockReason ||
                        'Portal dunia ini belum dibuka oleh pengaturan guru.'}
                    </p>
                  </div>
                </div>
              ) : (
                <PrimaryButton
                  onClick={() => onSelectWorldAction(selectedState)}
                  className={`${selectedState.world.primaryColor} hover:opacity-95 w-full sm:w-auto`}
                >
                  {selectedState.status === 'sedang_dikerjakan' ? (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Lanjutkan Petualangan</span>
                    </>
                  ) : selectedState.status === 'selesai' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isStudentLoggedIn ? 'Jelajahi Lagi' : 'Masuk Dunia Ini'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Compass className="w-4 h-4" />
                      <span>
                        {isStudentLoggedIn ? 'Masuk ke Dunia' : 'Mulai di Dunia Ini'}
                      </span>
                    </>
                  )}
                </PrimaryButton>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
};

interface WorldMapNodeProps {
  item: ResolvedWorldState;
  advSummary?: AdventureWorldSummary;
  isSelected: boolean;
  staggerOffset: boolean;
  animationsEnabled: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onEnterAction: () => void;
}

const WorldMapNode: React.FC<WorldMapNodeProps> = ({
  item,
  advSummary,
  isSelected,
  staggerOffset,
  animationsEnabled,
  reducedMotion,
  onSelect,
  onEnterAction,
}) => {
  const { world, status, lockReason } = item;
  const meta = getStatusMeta(status);
  const StatusIcon = meta.icon;

  return (
    <motion.article
      whileHover={reducedMotion || status === 'terkunci' ? undefined : { y: -3 }}
      whileTap={reducedMotion ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className={`rounded-2xl border-2 p-4 flex flex-col justify-between gap-3 cursor-pointer transition-colors ${
        staggerOffset ? 'lg:mt-4' : ''
      } ${
        isSelected
          ? `${world.borderClass} ring-2 ring-teal-600/30 bg-white shadow-sm`
          : meta.ringClass
      } ${status === 'terkunci' ? 'opacity-90' : ''}`}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-mono-tabular font-bold text-slate-500">
            Dunia {world.number}
          </span>
          <span className={`inline-flex items-center gap-1 font-bold ${meta.badgeTextClass}`}>
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{meta.label}</span>
          </span>
        </div>

        {/* Distinct 2D Landmark Scene */}
        <div
          className={`rounded-2xl ${world.surfaceBg} border ${world.borderClass} py-3 px-2 flex items-center justify-center relative overflow-hidden`}
        >
          <div className={animationsEnabled && isSelected && !reducedMotion ? 'animate-float-slow' : ''}>
            <WorldLandmarkArt subjectId={world.id} className="w-20 h-16" />
          </div>
          {advSummary && advSummary.xpEarned > 0 && (
            <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-lg bg-white/95 border border-amber-200 text-[10px] font-extrabold text-amber-800 tabular-nums">
              +{advSummary.xpEarned} XP
            </span>
          )}
        </div>

        <div>
          <p className={`text-xs font-bold ${world.textClass}`}>{world.subjectName}</p>
          <h3 className="font-display text-sm sm:text-base font-extrabold text-slate-900 leading-snug mt-0.5">
            {world.worldName}
          </h3>
          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
            {status === 'terkunci' && lockReason ? lockReason : world.themeSummary}
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100">
        {status === 'selesai' && (
          <p className="text-[11px] font-bold text-emerald-700 mb-2 flex items-center gap-1 tabular-nums">
            <Award className="w-3.5 h-3.5 shrink-0" />
            <span>
              {advSummary
                ? `${advSummary.checkpointsCompleted}/${advSummary.checkpointsTotal} Pos · +${advSummary.xpEarned} XP${
                    advSummary.relatedBadgeEarned && advSummary.relatedBadgeName
                      ? ` · ${advSummary.relatedBadgeName}`
                      : ''
                  }`
                : `${world.artifactName} · ${item.starsEarned} ★`}
            </span>
          </p>
        )}
        {status === 'sedang_dikerjakan' && (
          <div className="mb-2">
            <div className="flex justify-between text-[11px] font-semibold text-amber-800 mb-1 tabular-nums">
              <span>
                {advSummary
                  ? `Pos ${advSummary.checkpointsCompleted}/${advSummary.checkpointsTotal}`
                  : 'Progres'}
              </span>
              <span>{item.progressPercent}%</span>
            </div>
            <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
              <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="w-full h-full block">
                <rect
                  x="0"
                  y="0"
                  width={Math.max(10, item.progressPercent)}
                  height="6"
                  rx="3"
                  fill="#F59E0B"
                />
              </svg>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            audioEngine.playSelect();
            if (status === 'terkunci') {
              onSelect();
            } else {
              onEnterAction();
            }
          }}
          className={`min-h-[44px] w-full py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
            status === 'terkunci'
              ? 'bg-slate-200/80 text-slate-600 hover:bg-slate-200'
              : status === 'sedang_dikerjakan'
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : `${world.primaryColor} text-white hover:opacity-95`
          }`}
        >
          <StatusIcon className="w-4 h-4 shrink-0" />
          <span>{meta.actionLabel}</span>
        </button>
      </div>
    </motion.article>
  );
};
