import React from 'react';
import { DEFAULT_SCHOOL_NAME } from '../../types/psas';

interface AdventureLogoProps {
  compact?: boolean;
  onClick?: () => void;
}

export const AdventureLogo: React.FC<AdventureLogoProps> = ({ compact = false, onClick }) => {
  const content = (
    <span className="inline-flex items-center gap-2 sm:gap-2.5 text-left">
      <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs">
        <svg viewBox="0 0 36 36" className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true">
          <circle cx="18" cy="18" r="13" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
          <polygon points="18,6 21.5,14.5 30,18 21.5,21.5 18,30 14.5,21.5 6,18 14.5,14.5" fill="#FDE68A" />
          <circle cx="18" cy="18" r="3" fill="#0F766E" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="font-display text-sm sm:text-lg font-extrabold tracking-tight text-slate-900 block leading-none whitespace-nowrap">
          PSAS ADVENTURE
        </span>
        {!compact && (
          <span className="text-[10px] sm:text-[11px] font-semibold text-teal-700 block mt-0.5 whitespace-nowrap">
            {DEFAULT_SCHOOL_NAME} · 10 Dunia
          </span>
        )}
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="min-h-[44px] flex items-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 rounded-xl shrink-0"
        aria-label="Beranda PSAS Adventure"
      >
        {content}
      </button>
    );
  }

  return <div className="flex items-center shrink-0">{content}</div>;
};
