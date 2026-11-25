import React from 'react';
import { GraduationCap, Volume2, VolumeX } from 'lucide-react';
import { audioEngine } from '../../lib/audioEngine';
import type { AccessibilityPreferences } from '../../types/psas';
import { AdventureLogo } from './AdventureLogo';

export type PublicNavItem = {
  id: string;
  label: string;
  active?: boolean;
  onClick: () => void;
};

interface AdventureHeaderProps {
  onLogoClick: () => void;
  navItems?: PublicNavItem[];
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export const AdventureHeader: React.FC<AdventureHeaderProps> = ({
  onLogoClick,
  navItems = [],
  prefs,
  onUpdatePrefs,
  primaryAction,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Brand Logo */}
        <AdventureLogo onClick={onLogoClick} />

        {/* Zone 2: Concise single-line navigation links */}
        {navItems.length > 0 && (
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600" aria-label="Navigasi Utama">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  audioEngine.playSelect();
                  item.onClick();
                }}
                className={`whitespace-nowrap shrink-0 py-1.5 transition-colors cursor-pointer ${
                  item.active
                    ? 'text-teal-700 font-semibold border-b-2 border-teal-700'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {/* Zone 3: Sound toggle + 1 Primary Action */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              const nextSound = !prefs.soundEffectsEnabled;
              onUpdatePrefs({
                ...prefs,
                soundEffectsEnabled: nextSound,
                musicEnabled: nextSound ? prefs.musicEnabled : false,
              });
            }}
            className="min-h-[44px] min-w-[44px] px-2 sm:px-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            title={prefs.soundEffectsEnabled ? 'Matikan Suara' : 'Nyalakan Suara'}
            aria-label={prefs.soundEffectsEnabled ? 'Matikan Suara' : 'Nyalakan Suara'}
            aria-pressed={prefs.soundEffectsEnabled}
          >
            {prefs.soundEffectsEnabled ? (
              <Volume2 className="w-4 h-4 text-teal-700" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
            <span className="hidden sm:inline text-xs font-semibold">
              {prefs.soundEffectsEnabled ? 'Suara Aktif' : 'Suara Hening'}
            </span>
          </button>

          {primaryAction && (
            <button
              type="button"
              onClick={() => {
                audioEngine.playSelect();
                primaryAction.onClick();
              }}
              className="min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-teal-700 text-white text-xs sm:text-sm font-semibold hover:bg-teal-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span>{primaryAction.label}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
