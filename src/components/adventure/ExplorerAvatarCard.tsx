import React from 'react';
import { motion } from 'motion/react';
import { Backpack, Footprints, Palette, Sparkles, Star } from 'lucide-react';
import {
  getBagStyle,
  getExplorerCharacter,
  getOutfitTheme,
  getShoeStyle,
} from '../../data/characters';
import type {
  BagStyleId,
  CharacterExpression,
  ExplorerCharacterId,
  OutfitThemeId,
  ShoeStyleId,
} from '../../types/psas';

interface ExplorerAvatarCardProps {
  characterId: ExplorerCharacterId;
  outfitTheme?: OutfitThemeId;
  bagStyle?: BagStyleId;
  shoeStyle?: ShoeStyleId;
  nickname?: string;
  expression?: CharacterExpression;
  animationsEnabled?: boolean;
  reducedMotion?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showGearBadges?: boolean;
}

const FRAME_BG_MAP: Record<OutfitThemeId, string> = {
  rimba_emerald: 'from-emerald-100 via-teal-50 to-amber-50 border-emerald-400',
  langit_biru: 'from-sky-100 via-blue-50 to-teal-50 border-sky-400',
  mentari_emas: 'from-amber-100 via-yellow-50 to-orange-50 border-amber-400',
  senja_merah: 'from-rose-100 via-orange-50 to-amber-50 border-rose-400',
};

const EXPRESSION_BADGE: Record<CharacterExpression, { label: string; badgeClass: string }> = {
  idle: {
    label: 'Siap Menjelajah',
    badgeClass: 'bg-white/95 text-teal-800 border-teal-200',
  },
  happy: {
    label: 'Bersemangat!',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  celebrate: {
    label: 'Hebat Sekali!',
    badgeClass: 'bg-emerald-500 text-white border-emerald-600',
  },
};

export const ExplorerAvatarCard: React.FC<ExplorerAvatarCardProps> = ({
  characterId,
  outfitTheme = 'rimba_emerald',
  bagStyle = 'ransel_kompas',
  shoeStyle = 'sepatu_rimba',
  nickname,
  expression = 'idle',
  animationsEnabled = true,
  reducedMotion = false,
  size = 'md',
  showGearBadges = true,
}) => {
  const explorer = getExplorerCharacter(characterId);
  const outfit = getOutfitTheme(outfitTheme);
  const bag = getBagStyle(bagStyle);
  const shoe = getShoeStyle(shoeStyle);
  const expMeta = EXPRESSION_BADGE[expression];

  const boxSizeClass =
    size === 'sm'
      ? 'w-20 h-20 rounded-2xl'
      : size === 'lg'
        ? 'w-32 h-32 sm:w-36 sm:h-36 rounded-3xl'
        : 'w-24 h-24 sm:w-28 sm:h-28 rounded-3xl';

  const shouldAnimate = animationsEnabled && !reducedMotion;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <motion.div
        animate={
          !shouldAnimate
            ? undefined
            : expression === 'celebrate'
              ? { y: [0, -8, 0], rotate: [0, -2, 2, 0] }
              : expression === 'happy'
                ? { scale: [1, 1.04, 1] }
                : { y: [0, -3, 0] }
        }
        transition={{
          duration: expression === 'celebrate' ? 0.9 : 2.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={`relative shrink-0 p-1.5 border-2 bg-gradient-to-br shadow-sm ${FRAME_BG_MAP[outfitTheme]} ${boxSizeClass}`}
      >
        <img
          src={explorer.avatarUrl}
          alt={explorer.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover rounded-2xl"
        />

        {expression !== 'idle' && (
          <span
            className={`absolute -top-2 -right-2 w-7 h-7 rounded-full border shadow-xs flex items-center justify-center ${
              expression === 'celebrate'
                ? 'bg-amber-400 text-slate-950 border-amber-500'
                : 'bg-teal-600 text-white border-teal-700'
            }`}
            aria-hidden="true"
          >
            {expression === 'celebrate' ? (
              <Star className="w-4 h-4 fill-current" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </span>
        )}
      </motion.div>

      <div className="space-y-2 text-center sm:text-left min-w-0">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-lg border ${expMeta.badgeClass}`}
          >
            <Sparkles className="w-3 h-3" />
            {expMeta.label}
          </span>
          {nickname && (
            <span className="text-xs font-extrabold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-lg">
              Julukan: {nickname}
            </span>
          )}
        </div>

        <div>
          <p className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
            {explorer.name}
          </p>
          <p className="text-xs text-slate-600">{explorer.tagline}</p>
        </div>

        {showGearBadges && (
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-0.5">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${outfit.badgeClass}`}
            >
              <Palette className="w-3 h-3" />
              {outfit.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${bag.badgeClass}`}
            >
              <Backpack className="w-3 h-3" />
              {bag.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${shoe.badgeClass}`}
            >
              <Footprints className="w-3 h-3" />
              {shoe.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
