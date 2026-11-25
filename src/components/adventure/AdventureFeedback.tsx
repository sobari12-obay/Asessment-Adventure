import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { PrimaryButton, SecondaryButton } from './AdventureButtons';

export const AdventureNotice: React.FC<{
  variant: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  className?: string;
}> = ({ variant, title, message, className = '' }) => {
  const styles = {
    info: {
      wrap: 'bg-sky-50 border-sky-200 text-sky-900',
      icon: <Info className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />,
      label: title || 'Informasi',
    },
    success: {
      wrap: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />,
      label: title || 'Berhasil',
    },
    warning: {
      wrap: 'bg-amber-50 border-amber-200 text-amber-950',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />,
      label: title || 'Perhatian',
    },
    error: {
      wrap: 'bg-rose-50 border-rose-200 text-rose-900',
      icon: <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />,
      label: title || 'Perlu Diperiksa',
    },
  }[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl border p-3.5 sm:p-4 flex items-start gap-3 text-xs sm:text-sm leading-relaxed ${styles.wrap} ${className}`}
    >
      {styles.icon}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-xs uppercase tracking-wide opacity-80">{styles.label}</p>
        <p className="font-medium mt-0.5">{message}</p>
      </div>
    </div>
  );
};

export const AdventureLoading: React.FC<{
  label?: string;
  sublabel?: string;
  compact?: boolean;
}> = ({
  label = 'Menyiapkan Gerbang Petualangan...',
  sublabel = 'Kompas sedang memeriksa jalur dunia dan kode ujianmu.',
  compact = false,
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-4 px-3 gap-2' : 'py-10 px-6 gap-3'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="relative w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center">
        <Compass className="w-7 h-7 text-teal-700 animate-spin" style={{ animationDuration: '2.4s' }} />
      </div>
      <div>
        <p className="font-display font-bold text-slate-900 text-sm sm:text-base">{label}</p>
        {!compact && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
      </div>
    </div>
  );
};

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'primary',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    tone === 'danger'
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h2 id="confirm-modal-title" className="font-display text-lg font-bold text-slate-900">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">{message}</p>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-2">
              <SecondaryButton onClick={onCancel}>{cancelLabel}</SecondaryButton>
              <PrimaryButton
                onClick={onConfirm}
                className={tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : ''}
              >
                {confirmLabel}
              </PrimaryButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
