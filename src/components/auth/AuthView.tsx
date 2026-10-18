import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { School, ShieldCheck, Lock, Mail, KeyRound, AlertCircle, Sparkles } from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('s.engrimrantareen@gmail.com');
  const [passcode, setPasscode] = useState('gbhs2026');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, passcode);
      if (!res.success) {
        setError(res.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed unexpectedly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-8">
        {/* School Crest & Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white mx-auto flex items-center justify-center shadow-lg shadow-sky-950/60">
            <School className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-widest text-sky-400 uppercase bg-sky-950/60 px-2.5 py-0.5 rounded-full border border-sky-800/80">
              Govt Boys High School
            </span>
            <h1 className="text-xl font-black text-white mt-2 tracking-tight">
              Computer Operator Portal
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Class 7, 8, 9 Records & Offline-First Attendance Register
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>Authorized Operator Email</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="s.engrimrantareen@gmail.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              <span>Operator Passcode / PIN</span>
            </label>
            <input
              type="password"
              required
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode (min 4 chars)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs py-3 rounded-xl shadow-md transition active:scale-98 cursor-pointer mt-2"
          >
            <Lock className="w-4 h-4" />
            <span>{isSubmitting ? 'Authenticating...' : 'Access Records'}</span>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800 text-[11px] text-slate-400 text-center space-y-2">
          <p className="flex items-center justify-center gap-1.5 text-slate-300 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Offline-Ready Protected Storage</span>
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Authorized session persists safely on mobile and desktop devices. Work completely offline; changes sync
            automatically upon reconnection.
          </p>
        </div>
      </div>
    </div>
  );
};
