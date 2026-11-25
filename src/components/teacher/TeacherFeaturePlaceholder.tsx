import React from 'react';
import { Construction, Info } from 'lucide-react';
import { SecondaryButton } from '../adventure';

interface TeacherFeaturePlaceholderProps {
  menuTitle: string;
  description: string;
  plannedScope: string;
  relatedAction?: {
    label: string;
    onClick: () => void;
  };
}

export const TeacherFeaturePlaceholder: React.FC<TeacherFeaturePlaceholderProps> = ({
  menuTitle,
  description,
  plannedScope,
  relatedAction,
}) => {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 max-w-3xl space-y-5">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
          <Construction className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">
            Fitur dalam tahap pengembangan
          </p>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            {menuTitle}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-start gap-3 text-xs sm:text-sm text-slate-700">
        <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900">Rencana Tahap Berikutnya</p>
          <p className="mt-0.5 leading-relaxed">{plannedScope}</p>
        </div>
      </div>

      {relatedAction && (
        <div>
          <SecondaryButton onClick={relatedAction.onClick}>
            {relatedAction.label}
          </SecondaryButton>
        </div>
      )}
    </section>
  );
};
