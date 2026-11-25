import React from 'react';
import { motion } from 'motion/react';
import { Award, Crown, Sparkles, Trophy, X } from 'lucide-react';
import type { AdventureCelebrationDelta } from '../../types/psas';
import { PrimaryButton } from './AdventureButtons';

interface AdventureCelebrationOverlayProps {
  celebration: AdventureCelebrationDelta | null;
  reducedMotion: boolean;
  onDismiss: () => void;
}

export const AdventureCelebrationOverlay: React.FC<AdventureCelebrationOverlayProps> = ({
  celebration,
  reducedMotion,
  onDismiss,
}) => {
  if (!celebration) return null;
  const hasContent =
    celebration.xpGranted > 0 ||
    celebration.leveledUp ||
    celebration.unlockedBadges.length > 0 ||
    Boolean(celebration.completedWorldName);
  if (!hasContent) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kabar Pencapaian Penjelajah"
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white border-2 border-amber-300 rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl relative"
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          aria-label="Tutup ucapan pencapaian"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white mx-auto flex items-center justify-center shadow-md relative">
          {!reducedMotion && (
            <Sparkles className="w-5 h-5 text-amber-400 absolute -top-2 -right-3 animate-star-twinkle" />
          )}
          {celebration.leveledUp ? (
            <Crown className="w-9 h-9" />
          ) : celebration.unlockedBadges.length > 0 || celebration.completedWorldName ? (
            <Trophy className="w-8 h-8" />
          ) : (
            <Sparkles className="w-8 h-8" />
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-extrabold uppercase tracking-wider text-amber-700">
            {celebration.leveledUp
              ? 'Naik Level Penjelajah!'
              : celebration.completedWorldName
                ? 'Dunia Petualangan Tuntas!'
                : celebration.unlockedBadges.length > 0
                  ? 'Lencana Baru Terbuka!'
                  : 'Pengalaman Bertambah!'}
          </p>
          <h3 className="font-display text-2xl font-extrabold text-slate-900">
            {celebration.leveledUp
              ? `Level ${celebration.newLevel}: ${celebration.newLevelTitle}`
              : celebration.completedWorldName
                ? `${celebration.completedWorldName} Selesai!`
                : celebration.reason || 'Selamat, Penjelajah Cilik!'}
          </h3>
          {celebration.completedWorldName && celebration.leveledUp && (
            <p className="text-xs font-semibold text-emerald-700">
              Dunia Tuntas: {celebration.completedWorldName}
            </p>
          )}
        </div>

        {celebration.xpGranted > 0 && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-amber-900">Hadiah XP Diterima</span>
            <span className="font-mono-tabular font-extrabold text-lg text-amber-700">
              +{celebration.xpGranted} XP
            </span>
          </div>
        )}

        {celebration.unlockedBadges.length > 0 && (
          <div className="space-y-2 text-left">
            <p className="text-xs font-bold text-slate-600">Lencana yang Kamu Raih:</p>
            {celebration.unlockedBadges.map((badge) => (
              <div
                key={badge.badgeId}
                className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-display font-bold text-sm text-emerald-950">
                    {badge.badgeName}
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    Tersimpan resmi di Lemari Lencana Base Camp!
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-slate-600 font-medium tabular-nums">
          Total XP saat ini: <strong>{celebration.newTotalXp} XP</strong> · Level{' '}
          <strong>{celebration.newLevel}</strong> ({celebration.newLevelTitle})
        </div>

        <PrimaryButton onClick={onDismiss} className="w-full">
          <span>Lanjutkan Petualangan</span>
        </PrimaryButton>
      </motion.div>
    </div>
  );
};
