import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { audioEngine } from '../../lib/audioEngine';

interface AdventureButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  fullWidth?: boolean;
  withChime?: boolean;
}

export const PrimaryButton: React.FC<AdventureButtonProps> = ({
  children,
  className = '',
  fullWidth = false,
  withChime = true,
  onClick,
  ...rest
}) => {
  return (
    <button
      type={rest.type || 'button'}
      onClick={(e) => {
        if (withChime) audioEngine.playSelect();
        onClick?.(e);
      }}
      className={`min-h-[46px] px-6 py-3 rounded-2xl bg-teal-700 text-white font-display font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 shadow-sm hover:bg-teal-800 active:scale-[0.98] transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export const SecondaryButton: React.FC<AdventureButtonProps> = ({
  children,
  className = '',
  fullWidth = false,
  withChime = true,
  onClick,
  ...rest
}) => {
  return (
    <button
      type={rest.type || 'button'}
      onClick={(e) => {
        if (withChime) audioEngine.playSelect();
        onClick?.(e);
      }}
      className={`min-h-[44px] px-5 py-2.5 rounded-2xl border border-slate-300 bg-white text-slate-800 font-semibold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 hover:bg-slate-50 active:scale-[0.98] transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

export const BackNavButton: React.FC<{
  label?: string;
  onClick: () => void;
  className?: string;
}> = ({ label = 'Kembali', onClick, className = '' }) => {
  return (
    <button
      type="button"
      onClick={() => {
        audioEngine.playSelect();
        onClick();
      }}
      className={`min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white/95 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 active:scale-[0.98] transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${className}`}
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
};
