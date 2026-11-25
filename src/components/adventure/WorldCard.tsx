import React from 'react';
import { CheckCircle2, Compass, Lock, Play, Sparkles } from 'lucide-react';
import { audioEngine } from '../../lib/audioEngine';
import type { PublicAssessment, WorldConfig } from '../../types/psas';
import { WorldIcon } from '../WorldVisuals';

interface WorldCardProps {
  world: WorldConfig;
  assessment?: PublicAssessment;
  isDone?: boolean;
  isInProgress?: boolean;
  onEnterWorld: (world: WorldConfig, assessment: PublicAssessment) => void;
}

export const WorldCard: React.FC<WorldCardProps> = ({
  world,
  assessment,
  isDone = false,
  isInProgress = false,
  onEnterWorld,
}) => {
  const isLocked = !assessment || assessment.isLocked || assessment.status === 'closed';

  const statusLabel = isDone
    ? 'Selesai'
    : isInProgress
      ? 'Berlangsung'
      : isLocked
        ? 'Terkunci'
        : 'Terbuka';

  return (
    <article
      className={`bg-white border ${world.borderClass} rounded-2xl p-4 flex flex-col justify-between transition-transform duration-150 ${
        !isLocked ? 'hover:-translate-y-0.5' : 'opacity-85'
      }`}
    >
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2.5 gap-2">
          <span className="font-semibold tabular-nums">Dunia {world.number}</span>
          <span
            className={`font-semibold inline-flex items-center gap-1 ${
              isDone
                ? 'text-emerald-700'
                : isInProgress
                  ? 'text-amber-700'
                  : isLocked
                    ? 'text-slate-400'
                    : 'text-teal-700'
            }`}
          >
            {isDone ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : isLocked ? (
              <Lock className="w-3.5 h-3.5 shrink-0" />
            ) : isInProgress ? (
              <Compass className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{statusLabel}</span>
          </span>
        </div>

        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${world.gradientClass} text-white flex items-center justify-center mb-3`}
        >
          <WorldIcon subjectId={world.id} className="w-6 h-6" />
        </div>

        <p className="text-xs font-semibold text-slate-500">{world.subjectName}</p>
        <h3 className="font-display text-base font-bold text-slate-900 leading-snug mt-0.5">
          {world.worldName}
        </h3>
        <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
          {world.themeSummary}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        {assessment ? (
          <div className="text-[11px] text-slate-500 mb-2.5 flex items-center justify-between tabular-nums">
            <span>{assessment.mode === 'latihan' ? 'Mode Latihan' : 'Mode PSAS'}</span>
            <span>{assessment.totalQuestions} Misi</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 mb-2.5">Menunggu aktivasi guru</div>
        )}

        <button
          type="button"
          disabled={isLocked}
          onClick={() => {
            if (!assessment || isLocked) return;
            audioEngine.playSelect();
            onEnterWorld(world, assessment);
          }}
          className={`min-h-[44px] w-full py-2.5 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
            isLocked
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : `${world.primaryColor} text-white hover:opacity-95 cursor-pointer`
          }`}
        >
          {isLocked ? (
            <>
              <Lock className="w-4 h-4 shrink-0" />
              <span>Belum Dibuka</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 shrink-0" />
              <span>{isDone ? 'Jelajahi Lagi' : 'Masuk Portal'}</span>
            </>
          )}
        </button>
      </div>
    </article>
  );
};
