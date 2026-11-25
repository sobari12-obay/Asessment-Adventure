import React, { useState } from 'react';
import { Backpack, Check, Footprints, Palette, Sparkles, UserCheck, X } from 'lucide-react';
import {
  BAG_STYLES,
  CHARACTER_ACCENTS,
  EXPLORER_CHARACTERS,
  OUTFIT_THEMES,
  SHOE_STYLES,
} from '../../data/characters';
import { audioEngine } from '../../lib/audioEngine';
import type {
  BagStyleId,
  ExplorerCharacterId,
  OutfitThemeId,
  ShoeStyleId,
} from '../../types/psas';
import { PrimaryButton, SecondaryButton } from './AdventureButtons';
import { ExplorerAvatarCard } from './ExplorerAvatarCard';

interface CharacterCustomizerModalProps {
  open: boolean;
  isFirstTimeGate: boolean;
  studentName: string;
  gradeClass: string;
  initialCharacterId: ExplorerCharacterId;
  initialOutfitTheme: OutfitThemeId;
  initialBagStyle: BagStyleId;
  initialShoeStyle: ShoeStyleId;
  initialAccentColor: string;
  initialNickname?: string;
  animationsEnabled: boolean;
  reducedMotion: boolean;
  isSaving: boolean;
  errorMessage?: string;
  onSave: (payload: {
    characterId: ExplorerCharacterId;
    outfitTheme: OutfitThemeId;
    bagStyle: BagStyleId;
    shoeStyle: ShoeStyleId;
    accentColor: string;
    nickname: string;
  }) => void;
  onClose?: () => void;
}

export const CharacterCustomizerModal: React.FC<CharacterCustomizerModalProps> = ({
  open,
  isFirstTimeGate,
  studentName,
  gradeClass,
  initialCharacterId,
  initialOutfitTheme,
  initialBagStyle,
  initialShoeStyle,
  initialAccentColor,
  initialNickname = '',
  animationsEnabled,
  reducedMotion,
  isSaving,
  errorMessage,
  onSave,
  onClose,
}) => {
  const [characterId, setCharacterId] = useState<ExplorerCharacterId>(initialCharacterId);
  const [outfitTheme, setOutfitTheme] = useState<OutfitThemeId>(initialOutfitTheme);
  const [bagStyle, setBagStyle] = useState<BagStyleId>(initialBagStyle);
  const [shoeStyle, setShoeStyle] = useState<ShoeStyleId>(initialShoeStyle);
  const [accentColor, setAccentColor] = useState<string>(initialAccentColor || '#0F766E');
  const [nickname, setNickname] = useState<string>(initialNickname);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Pilih dan Kustomisasi Karakter Penjelajah"
    >
      <div className="bg-white border-2 border-teal-200 rounded-3xl max-w-3xl w-full p-5 sm:p-7 shadow-xl space-y-6 my-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-teal-700 inline-flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              {isFirstTimeGate
                ? 'Langkah Pertama Penjelajah Cilik'
                : 'Ubah Perlengkapan Penjelajah'}
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
              {isFirstTimeGate
                ? `Halo ${studentName}! Pilih Karakter Petualanganmu`
                : `Kustomisasi Karakter ${studentName}`}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Kelas {gradeClass} · Pilih tokoh, warna seragam, tas, dan sepatu kesukaanmu sebelum menjelajah 10 dunia!
            </p>
          </div>
          {!isFirstTimeGate && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Live Preview */}
        <div className="rounded-2xl bg-gradient-to-r from-teal-50/80 via-white to-amber-50/70 border border-teal-200 p-4 sm:p-5">
          <ExplorerAvatarCard
            characterId={characterId}
            outfitTheme={outfitTheme}
            bagStyle={bagStyle}
            shoeStyle={shoeStyle}
            nickname={nickname.trim() || undefined}
            expression="happy"
            animationsEnabled={animationsEnabled}
            reducedMotion={reducedMotion}
            size="md"
          />
        </div>

        {/* 1. Character Boy / Girl Selection */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-teal-700" />
            1. Pilih Karakter Utama
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXPLORER_CHARACTERS.map((char) => {
              const selected = characterId === char.id;
              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => {
                    audioEngine.playSelect();
                    setCharacterId(char.id);
                  }}
                  className={`flex items-center gap-3.5 p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    selected
                      ? 'border-teal-600 bg-teal-50/60 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-teal-300'
                  }`}
                >
                  <img
                    src={char.avatarUrl}
                    alt={char.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display font-extrabold text-sm text-slate-900">
                        {char.name}
                      </p>
                      {selected && (
                        <span className="w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-teal-700">{char.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{char.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Outfit, Bag, Shoe Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-teal-700" />
              2. Tema Seragam
            </label>
            <div className="grid grid-cols-2 gap-2">
              {OUTFIT_THEMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    audioEngine.playSelect();
                    setOutfitTheme(item.id);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    outfitTheme === item.id
                      ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-500'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900">{item.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Backpack className="w-4 h-4 text-teal-700" />
                3. Tas Petualang
              </label>
              <div className="grid grid-cols-3 gap-2">
                {BAG_STYLES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      audioEngine.playSelect();
                      setBagStyle(item.id);
                    }}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      bagStyle === item.id
                        ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">{item.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Footprints className="w-4 h-4 text-teal-700" />
                4. Sepatu Penjelajah
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SHOE_STYLES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      audioEngine.playSelect();
                      setShoeStyle(item.id);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      shoeStyle === item.id
                        ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">{item.label}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 5. Nickname & Accent */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label
              htmlFor="explorer-nickname"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              5. Nama Panggilan Penjelajah (Opsional)
            </label>
            <input
              id="explorer-nickname"
              type="text"
              maxLength={24}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Contoh: Bintang Cilik, Raka Hebat"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Jangan menulis nomor HP atau alamat rumah ya.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-700 mb-1.5">6. Warna Lencana Aksen</p>
            <div className="flex flex-wrap gap-2">
              {CHARACTER_ACCENTS.map((acc) => (
                <button
                  key={acc.hex}
                  type="button"
                  onClick={() => {
                    audioEngine.playSelect();
                    setAccentColor(acc.hex);
                  }}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                    accentColor === acc.hex
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {errorMessage && (
          <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
            {errorMessage}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2 border-t border-slate-100">
          {!isFirstTimeGate && onClose && (
            <SecondaryButton onClick={onClose} disabled={isSaving}>
              Batal
            </SecondaryButton>
          )}
          <PrimaryButton
            onClick={() =>
              onSave({
                characterId,
                outfitTheme,
                bagStyle,
                shoeStyle,
                accentColor,
                nickname: nickname.trim(),
              })
            }
            disabled={isSaving}
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {isSaving
                ? 'Menyimpan...'
                : isFirstTimeGate
                  ? 'Simpan Karakter & Masuk Base Camp'
                  : 'Simpan Kustomisasi Karakter'}
            </span>
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};
