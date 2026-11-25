import type {
  BagStyleId,
  ExplorerCharacterId,
  OutfitThemeId,
  ShoeStyleId,
} from '../types/psas';

export interface ExplorerCharacterOption {
  id: ExplorerCharacterId;
  name: string;
  title: string;
  tagline: string;
  avatarUrl: string;
}

export const EXPLORER_CHARACTERS: ExplorerCharacterOption[] = [
  {
    id: 'boy',
    name: 'Raka Penjelajah',
    title: 'Petualang Cilik Putra',
    tagline: 'Siap menembus teka-teki peta dan membawa kompas cahaya!',
    avatarUrl: '/src/assets/images/char_penjelajah_cilik_1795448998153.jpg',
  },
  {
    id: 'girl',
    name: 'Laras Penjelajah',
    title: 'Petualang Cilik Putri',
    tagline: 'Teliti membaca petunjuk dan siap mengumpulkan semua artefak!',
    avatarUrl: '/src/assets/images/char_penjelajah_putri_1795450514948.jpg',
  },
];

export interface CharacterCustomizationOption<T extends string> {
  id: T;
  label: string;
  description: string;
  badgeClass: string;
  hex: string;
}

export const OUTFIT_THEMES: CharacterCustomizationOption<OutfitThemeId>[] = [
  {
    id: 'rimba_emerald',
    label: 'Seragam Rimba Hijau',
    description: 'Jaket penjelajah hutan segar',
    badgeClass: 'bg-emerald-600 text-white border-emerald-700',
    hex: '#059669',
  },
  {
    id: 'langit_biru',
    label: 'Jaket Langit Biru',
    description: 'Setelan penjelajah samudra & awan',
    badgeClass: 'bg-sky-600 text-white border-sky-700',
    hex: '#0284C7',
  },
  {
    id: 'mentari_emas',
    label: 'Rompi Mentari Emas',
    description: 'Warna ceria penuh semangat pagi',
    badgeClass: 'bg-amber-500 text-slate-950 border-amber-600',
    hex: '#D97706',
  },
  {
    id: 'senja_merah',
    label: 'Jubah Senja Pemberani',
    description: 'Tegas dan hangat menjelajahi gunung',
    badgeClass: 'bg-rose-600 text-white border-rose-700',
    hex: '#E11D48',
  },
];

export const BAG_STYLES: CharacterCustomizationOption<BagStyleId>[] = [
  {
    id: 'ransel_kompas',
    label: 'Ransel Kompas',
    description: 'Dilengkapi penunjuk arah utama',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    hex: '#0F766E',
  },
  {
    id: 'tas_peta',
    label: 'Tas Peta Nusantara',
    description: 'Menyimpan gulungan peta rahasia',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    hex: '#B45309',
  },
  {
    id: 'tas_bintang',
    label: 'Tas Bintang Ceria',
    description: 'Tas bercahaya penyimpan artefak',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    hex: '#4338CA',
  },
];

export const SHOE_STYLES: CharacterCustomizationOption<ShoeStyleId>[] = [
  {
    id: 'sepatu_rimba',
    label: 'Sepatu Rimba Tangguh',
    description: 'Nyaman melintasi jembatan dan bukit',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    hex: '#047857',
  },
  {
    id: 'sepatu_kilat',
    label: 'Sepatu Kilat Lincah',
    description: 'Ringan untuk melompati pos misi',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    hex: '#0369A1',
  },
];

export const CHARACTER_ACCENTS: Array<{ label: string; hex: string }> = [
  { label: 'Zamrud Rimba', hex: '#0F766E' },
  { label: 'Biru Samudra', hex: '#0284C7' },
  { label: 'Emas Mentari', hex: '#D97706' },
  { label: 'Koral Ceria', hex: '#E11D48' },
  { label: 'Indigo Nusantara', hex: '#4F46E5' },
];

export function getExplorerCharacter(id?: ExplorerCharacterId): ExplorerCharacterOption {
  return EXPLORER_CHARACTERS.find((c) => c.id === id) || EXPLORER_CHARACTERS[0];
}

export function getOutfitTheme(id?: OutfitThemeId) {
  return OUTFIT_THEMES.find((o) => o.id === id) || OUTFIT_THEMES[0];
}

export function getBagStyle(id?: BagStyleId) {
  return BAG_STYLES.find((b) => b.id === id) || BAG_STYLES[0];
}

export function getShoeStyle(id?: ShoeStyleId) {
  return SHOE_STYLES.find((s) => s.id === id) || SHOE_STYLES[0];
}
