import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../../lib/firebase';
import { DEFAULT_SCHOOL_NAME, type AccessibilityPreferences } from '../../types/psas';
import {
  AdventureBackdrop,
  AdventureHeader,
  AdventureLoading,
  AdventureNotice,
  BackNavButton,
  PrimaryButton,
  SecondaryButton,
} from '../adventure';

interface TeacherLoginPageProps {
  currentUser: User | null;
  authStatus: 'checking' | 'authorized' | 'unauthorized';
  prefs: AccessibilityPreferences;
  onUpdatePrefs: (next: AccessibilityPreferences) => void;
  onBack: () => void;
  onBackHome: () => void;
  onOpenGuide: () => void;
}

export const TeacherLoginPage: React.FC<TeacherLoginPageProps> = ({
  currentUser,
  authStatus,
  prefs,
  onUpdatePrefs,
  onBack,
  onBackHome,
  onOpenGuide,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');

    const email = emailInput.trim();
    if (!email || !passwordInput) {
      setAuthError('Masukkan alamat email dan kata sandi dengan lengkap.');
      return;
    }

    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, passwordInput);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('operation-not-allowed')) {
        setAuthError(
          'Metode Email & Kata Sandi belum diaktifkan di Firebase Authentication Console. Gunakan "Masuk dengan Akun Google" atau aktifkan provider Email/Password terlebih dahulu.'
        );
      } else if (
        msg.includes('invalid-credential') ||
        msg.includes('wrong-password') ||
        msg.includes('user-not-found')
      ) {
        setAuthError('Email atau kata sandi belum sesuai. Periksa kembali atau gunakan tautan Lupa Kata Sandi.');
      } else if (msg.includes('too-many-requests')) {
        setAuthError('Terlalu banyak percobaan masuk. Tunggu beberapa saat sebelum mencoba lagi.');
      } else {
        setAuthError(msg || 'Gagal masuk dengan email dan kata sandi.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleGoogleLogin() {
    setAuthError('');
    setAuthNotice('');
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Gagal masuk menggunakan akun Google.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handlePasswordReset() {
    setAuthError('');
    setAuthNotice('');
    const email = emailInput.trim();
    if (!email) {
      setAuthError('Ketik alamat email Anda di kolom Email terlebih dahulu untuk mengirim tautan pemulihan.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setAuthNotice(`Tautan pemulihan kata sandi telah dikirim ke ${email}. Periksa kotak masuk atau folder spam.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('operation-not-allowed')) {
        setAuthError(
          'Pemulihan kata sandi membutuhkan provider Email/Password aktif di Firebase Authentication Console.'
        );
      } else {
        setAuthError(
          msg || 'Gagal mengirim email pemulihan kata sandi. Pastikan alamat email terdaftar.'
        );
      }
    }
  }

  return (
    <div
      className={`min-h-screen relative flex flex-col text-slate-900 ${
        prefs.reducedMotion ? 'reduced-motion' : ''
      }`}
    >
      <AdventureBackdrop animationsEnabled={prefs.animationsEnabled && !prefs.reducedMotion} />

      <div className="relative z-10 flex-1 flex flex-col">
        <AdventureHeader
          onLogoClick={onBackHome}
          navItems={[
            { id: 'home', label: 'Beranda', onClick: onBackHome },
            { id: 'guide', label: 'Petunjuk', onClick: onOpenGuide },
          ]}
          prefs={prefs}
          onUpdatePrefs={onUpdatePrefs}
        />

        <main className="flex-1 max-w-md w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col justify-center space-y-5">
          <div>
            <BackNavButton label="Kembali" onClick={onBack} />
          </div>

          <motion.section
            initial={prefs.reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/95 border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5"
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-teal-700">{DEFAULT_SCHOOL_NAME}</p>
              <h1 className="font-display text-2xl font-extrabold text-slate-900">
                Masuk Guru & Administrator
              </h1>
              <p className="text-xs sm:text-sm text-slate-600">
                Gunakan akun guru yang terdaftar pada sistem Firebase Authentication untuk mengakses dashboard asesmen.
              </p>
            </div>

            {authStatus === 'checking' && currentUser && (
              <AdventureLoading
                compact
                label="Memverifikasi Izin Akses Guru..."
                sublabel="Menunggu verifikasi peran dari Firestore."
              />
            )}

            {currentUser && authStatus === 'unauthorized' && (
              <AdventureNotice
                variant="warning"
                title="Akun Belum Terdaftar Sebagai Guru"
                message={`Akun ${currentUser.email || 'ini'} berhasil masuk ke Firebase Auth, namun belum memiliki hak akses guru atau administrator pada koleksi teachers/admins. Dashboard tetap dikunci demi keamanan data siswa.`}
              />
            )}

            {authError && (
              <AdventureNotice
                variant="error"
                title="Autentikasi Gagal"
                message={authError}
              />
            )}

            {authNotice && (
              <AdventureNotice
                variant="success"
                title="Email Pemulihan Terkirim"
                message={authNotice}
              />
            )}

            {currentUser ? (
              <SecondaryButton fullWidth onClick={() => void signOut(auth)}>
                <LogOut className="w-4 h-4" />
                <span>Keluar & Ganti Akun</span>
              </SecondaryButton>
            ) : (
              <>
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div>
                    <label htmlFor="teacher-email" className="block text-xs font-bold text-slate-700 mb-1.5">
                      Email Guru / Administrator
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="teacher-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          setAuthError('');
                        }}
                        placeholder="email@sekolah.sch.id"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="teacher-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                      Kata Sandi
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="teacher-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          setAuthError('');
                        }}
                        placeholder="Masukkan kata sandi"
                        className="w-full min-h-[44px] pl-10 pr-12 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handlePasswordReset()}
                      className="text-xs font-semibold text-teal-700 hover:underline py-1 cursor-pointer"
                    >
                      Lupa Kata Sandi?
                    </button>
                  </div>

                  <PrimaryButton type="submit" fullWidth disabled={isLoggingIn}>
                    <LogIn className="w-4 h-4" />
                    <span>{isLoggingIn ? 'Memeriksa Akun...' : 'Masuk'}</span>
                  </PrimaryButton>
                </form>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-white text-slate-500 font-medium">
                      atau masuk dengan akun terhubung
                    </span>
                  </div>
                </div>

                <SecondaryButton
                  type="button"
                  fullWidth
                  disabled={isLoggingIn}
                  onClick={() => void handleGoogleLogin()}
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Masuk dengan Google</span>
                </SecondaryButton>
              </>
            )}
          </motion.section>
        </main>
      </div>
    </div>
  );
};
