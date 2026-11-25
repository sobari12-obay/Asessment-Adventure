import React from 'react';
import {
  Award,
  BookOpen,
  Compass,
  Feather,
  Flame,
  Globe,
  Leaf,
  MapPin,
  Music,
  Palette,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { SubjectId } from '../types/psas';

export const WorldIcon: React.FC<{ subjectId: SubjectId; className?: string }> = ({
  subjectId,
  className = 'w-6 h-6',
}) => {
  switch (subjectId) {
    case 'pai':
      return <Flame className={className} />;
    case 'pancasila':
      return <ShieldCheck className={className} />;
    case 'bahasa_indonesia':
      return <BookOpen className={className} />;
    case 'matematika':
      return <Compass className={className} />;
    case 'ipas':
      return <Leaf className={className} />;
    case 'seni_rupa':
      return <Palette className={className} />;
    case 'pjok':
      return <Trophy className={className} />;
    case 'bahasa_inggris':
      return <Globe className={className} />;
    case 'bahasa_sunda':
      return <Music className={className} />;
    case 'bahasa_cirebon':
      return <Feather className={className} />;
    default:
      return <Sparkles className={className} />;
  }
};

export const ShapeMotifSvg: React.FC<{ motif?: string; label: string }> = ({ motif, label }) => {
  if (motif === 'circle') {
    return (
      <svg viewBox="0 0 120 90" className="w-24 h-20 mx-auto" aria-label={label}>
        <circle cx="60" cy="45" r="30" fill="#0EA5E9" stroke="#0369A1" strokeWidth="4" />
      </svg>
    );
  }
  if (motif === 'triangle') {
    return (
      <svg viewBox="0 0 120 90" className="w-24 h-20 mx-auto" aria-label={label}>
        <polygon points="60,12 96,76 24,76" fill="#F59E0B" stroke="#B45309" strokeWidth="4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (motif === 'square') {
    return (
      <svg viewBox="0 0 120 90" className="w-24 h-20 mx-auto" aria-label={label}>
        <rect x="30" y="15" width="60" height="60" rx="6" fill="#10B981" stroke="#047857" strokeWidth="4" />
      </svg>
    );
  }
  if (motif === 'star') {
    return (
      <svg viewBox="0 0 120 90" className="w-24 h-20 mx-auto" aria-label={label}>
        <polygon
          points="60,10 71,34 97,37 78,55 83,81 60,68 37,81 42,55 23,37 49,34"
          fill="#EC4899"
          stroke="#9D174D"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <div className="w-24 h-20 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
      <Award className="w-8 h-8" />
    </div>
  );
};

export const JourneyTrailBar: React.FC<{
  total: number;
  currentIndex: number;
  answeredIds: string[];
  questionIds: string[];
  checkpointInterval: number;
  accentHex: string;
  animationsEnabled: boolean;
}> = ({
  total,
  currentIndex,
  answeredIds,
  questionIds,
  checkpointInterval,
  accentHex,
  animationsEnabled,
}) => {
  if (total <= 0) return null;
  const progressRatio = total > 1 ? currentIndex / (total - 1) : 1;

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
        <span className="font-semibold flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-teal-700" />
          Jejak Petualangan
        </span>
        <span className="tabular-nums font-medium">
          Pos {Math.min(currentIndex + 1, total)} / {total} · {answeredIds.length} terjawab
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div
          className="relative h-8 flex items-center"
          style={total > 10 ? { minWidth: `${total * 34}px` } : undefined}
        >
          <div className="absolute inset-x-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(6, Math.round(progressRatio * 100))}%`,
                backgroundColor: accentHex,
              }}
            />
          </div>

          <div className="relative w-full flex items-center justify-between px-1 gap-1.5">
            {questionIds.map((qId, idx) => {
              const isCurrent = idx === currentIndex;
              const isAnswered = answeredIds.includes(qId);
              const isCheckpoint = (idx + 1) % checkpointInterval === 0 || idx === total - 1;

              return (
                <div key={qId} className="relative flex flex-col items-center shrink-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-transform ${
                      isCurrent
                        ? `scale-110 bg-amber-400 border-slate-900 text-slate-900 ${
                            animationsEnabled ? 'animate-walk-hop' : ''
                          }`
                        : isAnswered
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : isCheckpoint
                            ? 'bg-amber-50 border-amber-400 text-amber-800'
                            : 'bg-white border-slate-300 text-slate-500'
                    }`}
                    title={
                      isCheckpoint
                        ? `Pos ${idx + 1} (Checkpoint Harta Karun)`
                        : `Pos ${idx + 1}`
                    }
                  >
                    {isCheckpoint && !isCurrent && !isAnswered ? '★' : idx + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
