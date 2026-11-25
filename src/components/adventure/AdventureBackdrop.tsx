import React from 'react';

interface AdventureBackdropProps {
  animationsEnabled?: boolean;
  variant?: 'sky' | 'portal';
}

export const AdventureBackdrop: React.FC<AdventureBackdropProps> = ({
  animationsEnabled = true,
  variant = 'sky',
}) => {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* Gentle atmospheric sky & terrain base */}
      <div
        className={
          variant === 'portal'
            ? 'absolute inset-0 bg-gradient-to-b from-sky-50 via-slate-50 to-emerald-50/50'
            : 'absolute inset-0 bg-gradient-to-b from-sky-50/90 via-slate-50 to-teal-50/40'
        }
      />

      {/* Topographic map curves & subtle stars */}
      <svg
        viewBox="0 0 1440 720"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full opacity-75"
      >
        <defs>
          <linearGradient id="hillBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CCFBF1" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#E2E8F0" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="hillFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D1FAE5" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#F8FAFC" stopOpacity="0.1" />
          </linearGradient>
          <radialGradient id="portalGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#FDE68A" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Warm Sun / Portal Halo */}
        <circle cx="1180" cy="145" r="140" fill="url(#portalGlow)" />
        <circle cx="1180" cy="145" r="46" fill="#FEF3C7" opacity="0.85" />

        {/* Subtle dotted explorer map trail */}
        <path
          d="M-40,560 C240,470 430,610 720,515 C990,425 1190,540 1500,455"
          fill="none"
          stroke="#99F6E4"
          strokeWidth="4"
          strokeDasharray="10 14"
          strokeLinecap="round"
        />

        {/* Rolling Adventure Hills */}
        <path
          d="M0,595 Q320,505 680,575 T1440,545 L1440,720 L0,720 Z"
          fill="url(#hillBack)"
        />
        <path
          d="M0,635 Q420,575 820,630 T1440,600 L1440,720 L0,720 Z"
          fill="url(#hillFront)"
        />

        {/* Stylized Foreground 2D Trees on Far Edges */}
        <g opacity="0.55">
          <rect x="64" y="558" width="10" height="46" rx="4" fill="#92400E" />
          <circle cx="69" cy="542" r="24" fill="#34D399" />
          <circle cx="54" cy="554" r="16" fill="#10B981" />

          <rect x="1352" y="535" width="10" height="50" rx="4" fill="#92400E" />
          <circle cx="1357" cy="520" r="26" fill="#2DD4BF" />
          <circle cx="1374" cy="532" r="18" fill="#14B8A6" />
        </g>

        {/* Drifting Cartoon Clouds */}
        <g className={animationsEnabled ? 'animate-cloud-drift' : ''}>
          <g fill="#FFFFFF" opacity="0.9">
            <rect x="130" y="96" width="110" height="32" rx="16" />
            <circle cx="165" cy="96" r="22" />
            <circle cx="202" cy="92" r="26" />
          </g>
          <g fill="#FFFFFF" opacity="0.85">
            <rect x="820" y="72" width="128" height="34" rx="17" />
            <circle cx="860" cy="72" r="24" />
            <circle cx="905" cy="68" r="28" />
          </g>
        </g>

        {/* Gentle Twinkling Stars */}
        <g className={animationsEnabled ? 'animate-star-twinkle' : ''} fill="#F59E0B">
          <polygon points="360,82 364,92 374,96 364,100 360,110 356,100 346,96 356,92" opacity="0.65" />
          <polygon points="1030,116 1033,124 1041,127 1033,130 1030,138 1027,130 1019,127 1027,124" opacity="0.55" />
          <polygon points="620,64 623,71 630,74 623,77 620,84 617,77 610,74 617,71" opacity="0.45" />
        </g>
      </svg>
    </div>
  );
};
