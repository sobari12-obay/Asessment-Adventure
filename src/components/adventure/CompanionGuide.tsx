import React, { useState } from 'react';
import { Compass } from 'lucide-react';
import { getExplorerCharacter } from '../../data/characters';
import type { ExplorerCharacterId } from '../../types/psas';

interface CompanionGuideProps {
  characterId: ExplorerCharacterId;
  title?: string;
  message: string;
  animationsEnabled?: boolean;
}

export const CompanionGuide: React.FC<CompanionGuideProps> = ({
  characterId,
  title,
  message,
  animationsEnabled = true,
}) => {
  const char = getExplorerCharacter(characterId);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="bg-white/95 border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-center gap-4">
      <div
        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-teal-200 bg-gradient-to-br from-teal-50 to-amber-50 flex items-center justify-center shrink-0 ${
          animationsEnabled ? 'animate-float-slow' : ''
        }`}
      >
        {!imgFailed ? (
          <img
            src={char.avatarUrl}
            alt={char.name}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <Compass className="w-8 h-8 text-teal-700" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-teal-700">
          {title || `${char.name} · Pemandu Petualangan`}
        </p>
        <p className="text-sm sm:text-base text-slate-800 font-medium leading-relaxed mt-0.5">
          {message}
        </p>
      </div>
    </div>
  );
};
