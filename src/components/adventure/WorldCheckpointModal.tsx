import React, { useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Flag,
  HelpCircle,
  Loader2,
  MapPin,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import { getWorldConfig } from '../../data/worlds';
import { audioEngine } from '../../lib/audioEngine';
import type {
  AdventureCheckpointItem,
  AdventureWorldSummary,
} from '../../types/psas';
import { PrimaryButton, SecondaryButton } from './AdventureButtons';
import { WorldLandmarkArt } from './WorldLandmarkArt';

interface WorldCheckpointModalProps {
  open: boolean;
  world: AdventureWorldSummary | null;
  checkpoints: AdventureCheckpointItem[];
  loading: boolean;
  busyCheckpointId: string | null;
  onStartCheckpoint: (checkpointId: string) => Promise<void>;
  onCompleteCheckpoint: (checkpointId: string) => Promise<void>;
  onLaunchExamIfActive?: (world: AdventureWorldSummary) => void;
  onClose: () => void;
}

export const WorldCheckpointModal: React.FC<WorldCheckpointModalProps> = ({
  open,
  world,
  checkpoints,
  loading,
  busyCheckpointId,
  onStartCheckpoint,
  onCompleteCheckpoint,
  onLaunchExamIfActive,
  onClose,
}) => {
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string>('');
  const [showHint, setShowHint] = useState(false);

  if (!open || !world) return null;

  const worldMeta = getWorldConfig(world.subjectId);
  const selectedCheckpoint =
    checkpoints.find((c) => c.id === activeCheckpointId) ||
    checkpoints.find((c) => c.status !== 'selesai') ||
    checkpoints[0] ||
    null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Ekspedisi ${world.worldName}`}
    >
      <div className="bg-white border-2 border-teal-200 rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl space-y-6 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${worldMeta.surfaceBg} border ${worldMeta.borderClass} flex items-center justify-center shrink-0 p-2`}
            >
              <WorldLandmarkArt subjectId={worldMeta.id} className="w-14 h-12" />
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-bold ${worldMeta.textClass}`}>
                Dunia {world.number} · {world.subjectName} · Pemandu: {world.companionName}
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 truncate">
                {world.worldName}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {worldMeta.companionGreeting}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer shrink-0"
            aria-label="Tutup jendela dunia"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* World Progress Summary */}
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 tabular-nums">
              <span>
                Progres Pos Jelajah ({world.checkpointsCompleted}/{world.checkpointsTotal} selesai)
              </span>
              <span className="text-teal-700">{world.progressPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="w-full h-full block">
                <rect
                  x="0"
                  y="0"
                  width={Math.max(4, world.progressPercent)}
                  height="10"
                  rx="5"
                  fill="#0F766E"
                />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 tabular-nums">
              +{world.xpEarned} XP di dunia ini
            </div>
            {world.hasActiveAssessment && onLaunchExamIfActive && (
              <PrimaryButton
                onClick={() => onLaunchExamIfActive(world)}
                className="text-xs px-4 py-2.5"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Masuk Misi Soal</span>
              </PrimaryButton>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-teal-700" />
            <p className="text-sm font-medium">Menyiapkan peta pos petualangan...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Checkpoints List */}
            <div className="lg:col-span-5 space-y-2.5">
              <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-teal-700" />
                Daftar Pos Checkpoint ({checkpoints.length})
              </p>

              {checkpoints.map((cp) => {
                const isSelected = selectedCheckpoint?.id === cp.id;
                const isDone = cp.status === 'selesai';
                const isInProg = cp.status === 'sedang_dikerjakan';
                return (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => {
                      audioEngine.playSelect();
                      setActiveCheckpointId(cp.id);
                      setSelectedChoice('');
                      setShowHint(false);
                      if (cp.status === 'terbuka') {
                        void onStartCheckpoint(cp.id);
                      }
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/50'
                        : isDone
                          ? 'border-emerald-200 bg-emerald-50/35 hover:border-emerald-300'
                          : 'border-slate-200 bg-white hover:border-teal-300'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono-tabular font-bold text-xs shrink-0 mt-0.5 ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isInProg
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : cp.order}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display font-bold text-sm text-slate-900 truncate">
                          {cp.title}
                        </p>
                        <span className="text-[11px] font-bold text-amber-700 shrink-0 tabular-nums">
                          +{cp.xpReward} XP
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isDone
                          ? 'Selesai dijelajahi'
                          : isInProg
                            ? 'Sedang dibuka'
                            : 'Ketuk untuk mulai pos'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Checkpoint Interactive Explorer */}
            <div className="lg:col-span-7">
              {selectedCheckpoint ? (
                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 bg-teal-100 px-3 py-1 rounded-lg">
                        <Flag className="w-3.5 h-3.5" />
                        Pos {selectedCheckpoint.order} ·{' '}
                        {selectedCheckpoint.checkpointType === 'story'
                          ? 'Kisah Pembuka'
                          : selectedCheckpoint.checkpointType === 'mission_gate'
                            ? 'Gerbang Puncak'
                            : 'Eksplorasi Dunia'}
                      </span>
                      <span className="text-xs font-extrabold text-amber-700 tabular-nums">
                        Hadiah: +{selectedCheckpoint.xpReward} XP
                      </span>
                    </div>

                    <div>
                      <h3 className="font-display text-lg font-extrabold text-slate-900">
                        {selectedCheckpoint.title}
                      </h3>
                      <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                        {selectedCheckpoint.storyIntro}
                      </p>
                    </div>

                    {/* Interactive Exploration Clue (Zero XP deduction!) */}
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                      <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-teal-700" />
                        Aktivitas Penjelajah Cilik
                      </p>
                      <p className="text-sm font-medium text-slate-900">
                        {selectedCheckpoint.challengePrompt}
                      </p>

                      <div className="space-y-2">
                        {selectedCheckpoint.challengeOptions.map((option) => {
                          const chosen = selectedChoice === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                audioEngine.playSelect();
                                setSelectedChoice(option);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                                chosen
                                  ? 'border-teal-600 bg-teal-50 text-teal-950'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-1 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setShowHint((v) => !v)}
                          className="text-xs font-semibold text-teal-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          {showHint ? 'Sembunyikan Petunjuk' : 'Butuh Petunjuk Pemandu?'}
                        </button>
                        <span className="text-[11px] text-slate-500">
                          XP tidak pernah dikurangi
                        </span>
                      </div>

                      {showHint && (
                        <p className="text-xs text-teal-900 bg-teal-50 border border-teal-200 rounded-xl p-3">
                          <strong>Petunjuk {world.companionName}:</strong>{' '}
                          {selectedCheckpoint.helpfulHint}
                        </p>
                      )}
                    </div>

                    {selectedCheckpoint.status === 'selesai' && (
                      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-900 flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Pos Selesai (+{selectedCheckpoint.xpAwarded} XP)</p>
                          <p className="mt-0.5">{selectedCheckpoint.storyOutro}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <SecondaryButton onClick={onClose} className="text-xs">
                      Kembali ke Peta 10 Dunia
                    </SecondaryButton>

                    {selectedCheckpoint.status !== 'selesai' ? (
                      <PrimaryButton
                        onClick={() => void onCompleteCheckpoint(selectedCheckpoint.id)}
                        disabled={busyCheckpointId === selectedCheckpoint.id || !selectedChoice}
                        className="text-xs sm:text-sm"
                      >
                        {busyCheckpointId === selectedCheckpoint.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span>
                          {!selectedChoice
                            ? 'Pilih Jawaban Aktivitas Dulu'
                            : 'Selesaikan Pos & Raih XP'}
                        </span>
                      </PrimaryButton>
                    ) : (
                      <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5 justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                        XP Pos Sudah Diklaim
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
