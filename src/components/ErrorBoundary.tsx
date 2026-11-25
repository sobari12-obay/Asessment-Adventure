import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Terjadi kendala yang tidak terduga.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.message;
      if (friendlyMsg.startsWith('{') && friendlyMsg.includes('operationType')) {
        friendlyMsg = 'Terjadi kendala izin akses data di server. Pastikan Anda masuk dengan akun guru yang berwenang atau muat ulang halaman.';
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Ups, Perjalanan Terhenti Sebentar
            </h2>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              {friendlyMsg}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 text-white font-semibold text-sm hover:bg-teal-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
