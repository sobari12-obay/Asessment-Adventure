import React from 'react';
import type { SubjectId } from '../../types/psas';

/**
 * Ilustrasi landmark kartun 2D unik untuk setiap dari 10 Dunia Petualangan.
 */
export const WorldLandmarkArt: React.FC<{
  subjectId: SubjectId;
  className?: string;
}> = ({ subjectId, className = 'w-16 h-14' }) => {
  switch (subjectId) {
    case 'pai':
      // Negeri Cahaya Kebaikan: Kubah masjid ramah & lentera bintang
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <rect x="8" y="54" width="72" height="10" rx="5" fill="#A7F3D0" />
          <path d="M24 54 V36 Q44 16 64 36 V54 Z" fill="#059669" />
          <circle cx="44" cy="14" r="5" fill="#FBBF24" />
          <rect x="38" y="40" width="12" height="14" rx="6" fill="#FEF3C7" />
          <circle cx="20" cy="24" r="4" fill="#FDE68A" />
          <circle cx="68" cy="22" r="3.5" fill="#FDE68A" />
        </svg>
      );
    case 'pancasila':
      // Negeri Sahabat: Jembatan persahabatan & perisai bintang emas
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <path d="M10 56 Q44 34 78 56" fill="none" stroke="#E11D48" strokeWidth="7" strokeLinecap="round" />
          <path d="M32 14 H56 V32 Q56 44 44 48 Q32 44 32 32 Z" fill="#FFE4E6" stroke="#BE123C" strokeWidth="3" />
          <polygon points="44,20 47,28 55,28 49,33 51,41 44,36 37,41 39,33 33,28 41,28" fill="#F59E0B" />
        </svg>
      );
    case 'bahasa_indonesia':
      // Hutan Kata: Pohon rimbun & buku cerita terbuka
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <rect x="39" y="36" width="10" height="24" rx="3" fill="#92400E" />
          <circle cx="44" cy="24" r="16" fill="#16A34A" />
          <circle cx="30" cy="30" r="11" fill="#22C55E" />
          <circle cx="58" cy="30" r="11" fill="#22C55E" />
          <path d="M22 50 L44 44 L66 50 V62 L44 56 L22 62 Z" fill="#FEF3C7" stroke="#15803D" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case 'matematika':
      // Pulau Angka: Peti harta karun & balok angka 1-2-3
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <rect x="14" y="20" width="22" height="20" rx="5" fill="#DBEAFE" stroke="#2563EB" strokeWidth="2.5" />
          <text x="25" y="35" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1D4ED8">1</text>
          <rect x="52" y="18" width="22" height="20" rx="5" fill="#FEF3C7" stroke="#D97706" strokeWidth="2.5" />
          <text x="63" y="33" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#B45309">3</text>
          <rect x="26" y="40" width="36" height="22" rx="6" fill="#2563EB" />
          <rect x="26" y="40" width="36" height="8" rx="3" fill="#60A5FA" />
          <circle cx="44" cy="51" r="4" fill="#FBBF24" />
        </svg>
      );
    case 'ipas':
      // Ekspedisi Alam: Gunung hijau, air terjun & daun tropis
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <polygon points="14,58 38,18 62,58" fill="#0D9488" />
          <polygon points="40,58 60,24 78,58" fill="#14B8A6" />
          <polygon points="38,18 32,29 44,29" fill="#FFFFFF" />
          <path d="M36 42 Q40 50 38 62" stroke="#7DD3FC" strokeWidth="5" strokeLinecap="round" fill="none" />
          <ellipse cx="20" cy="46" rx="8" ry="12" transform="rotate(-25 20 46)" fill="#84CC16" />
        </svg>
      );
    case 'seni_rupa':
      // Galeri Kreativitas: Palet warna pelangi & kuas
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <ellipse cx="42" cy="40" rx="26" ry="20" fill="#FCE7F3" stroke="#DB2777" strokeWidth="3" />
          <circle cx="30" cy="34" r="4.5" fill="#EF4444" />
          <circle cx="42" cy="28" r="4.5" fill="#F59E0B" />
          <circle cx="54" cy="34" r="4.5" fill="#3B82F6" />
          <circle cx="48" cy="48" r="4.5" fill="#10B981" />
          <path d="M56 16 L72 30" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    case 'pjok':
      // Arena Gerak Ceria: Lintasan olahraga & piala semangat
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <ellipse cx="44" cy="54" rx="30" ry="10" fill="#BAE6FD" stroke="#0284C7" strokeWidth="2.5" />
          <path d="M32 20 H56 V34 Q56 44 44 44 Q32 44 32 34 Z" fill="#F97316" />
          <rect x="41" y="44" width="6" height="8" fill="#EA580C" />
          <rect x="35" y="50" width="18" height="5" rx="2.5" fill="#0369A1" />
          <circle cx="64" cy="22" r="7" fill="#FFFFFF" stroke="#0284C7" strokeWidth="2.5" />
        </svg>
      );
    case 'bahasa_inggris':
      // English Quest: Menara jam/buku & burung hantu pintar
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <rect x="28" y="24" width="32" height="38" rx="8" fill="#E0E7FF" stroke="#4F46E5" strokeWidth="3" />
          <polygon points="24,26 44,10 64,26" fill="#4F46E5" />
          <circle cx="38" cy="40" r="6" fill="#FFFFFF" stroke="#4338CA" strokeWidth="2" />
          <circle cx="50" cy="40" r="6" fill="#FFFFFF" stroke="#4338CA" strokeWidth="2" />
          <circle cx="38" cy="40" r="2.2" fill="#1E1B4B" />
          <circle cx="50" cy="40" r="2.2" fill="#1E1B4B" />
          <polygon points="44,44 41,49 47,49" fill="#F59E0B" />
        </svg>
      );
    case 'bahasa_sunda':
      // Lembur Pangumbaraan: Saung bambu & angklung pusaka
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <polygon points="18,34 44,14 70,34" fill="#65A30D" />
          <rect x="24" y="34" width="40" height="24" rx="4" fill="#FEF9C3" stroke="#4D7C0F" strokeWidth="2.5" />
          <rect x="34" y="38" width="5" height="16" rx="2" fill="#B45309" />
          <rect x="42" y="36" width="5" height="18" rx="2" fill="#D97706" />
          <rect x="50" y="40" width="5" height="14" rx="2" fill="#B45309" />
        </svg>
      );
    case 'bahasa_cirebon':
    default:
      // Jelajah Tanah Cirebon: Gapura keraton & awan Mega Mendung
      return (
        <svg viewBox="0 0 88 72" className={className} aria-hidden="true">
          <path d="M14 54 Q20 42 30 46 Q38 36 50 42 Q64 38 74 52 Z" fill="#BAE6FD" stroke="#0E7490" strokeWidth="2.5" />
          <rect x="26" y="24" width="12" height="34" rx="3" fill="#EA580C" />
          <rect x="50" y="24" width="12" height="34" rx="3" fill="#EA580C" />
          <polygon points="22,26 38,26 32,14" fill="#0E7490" />
          <polygon points="50,26 66,26 56,14" fill="#0E7490" />
        </svg>
      );
  }
};
