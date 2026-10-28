import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getCustomLogoUrl } from '../../services/logoService';
import { useSchoolProfile } from '../../services/schoolProfileService';
import { School, ShieldCheck, Lock, Mail, KeyRound, AlertCircle, UserPlus, LogIn, User, WifiOff, CheckCircle2, Sun, Moon } from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login, signUp } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { profile } = useSchoolProfile();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const isOnline = typeof navigator === 'undefined' || navigator.onLine;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const res = await signUp(email, password, fullName);
        if (res.success) {
          if (res.requiresConfirmation) {
            setInfoMessage('Registration successful! Please check your email for the confirmation link before signing in.');
            setIsSignUp(false);
          }
        } else {
          setError(res.error || 'Registration failed. Please try again.');
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          setError(res.error || 'Authentication failed. Please verify credentials.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 relative transition-colors duration-200">
      {/* Theme Toggle Button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-400 hover:border-slate-700 transition cursor-pointer shadow-md flex items-center gap-1.5"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          <span className="text-xs font-medium text-slate-400 hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
        </button>
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-8">
        {/* School Crest & Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-850 border-2 border-slate-700/80 ring-2 ring-sky-500/20 shadow-lg shadow-sky-950/60 mx-auto flex items-center justify-center">
            {!logoFailed ? (
              <img
                src={profile.logoUrl || getCustomLogoUrl()}
                alt={`${profile.schoolName} Crest`}
                className="w-full h-full object-cover rounded-full"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center">
                <School className="w-8 h-8" />
              </div>
            )}
          </div>
          <div>
            <span className="text-[10px] font-extrabold tracking-widest text-sky-400 uppercase bg-sky-950/60 px-3 py-0.5 rounded-full border border-sky-800/80">
              {profile.schoolShortName || profile.schoolName}
            </span>
            <h1 className="text-xl font-black text-white mt-2 tracking-tight">
              {isSignUp ? 'Create Operator Account' : 'Computer Operator Portal'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {profile.schoolName} • Class 7-9 Records & Attendance Register
            </p>
          </div>
        </div>

        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="mt-5 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 flex items-start gap-2">
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Device is Offline</p>
              <p className="text-[11px] text-amber-400/90 mt-0.5 leading-relaxed">
                Cloud authentication requires an internet connection. If you previously signed in on this device, launch the app while offline to resume your session.
              </p>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mt-5 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success / Info Notification */}
        {infoMessage && (
          <div className="mt-5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Full Name field (Only on Sign Up) */}
          {isSignUp && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Full Name</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Engr. Imran Tareen"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@gbhs.edu.pk"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              <span>Password</span>
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs py-3 rounded-xl shadow-md transition active:scale-98 cursor-pointer mt-2"
          >
            {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            <span>
              {isSubmitting
                ? isSignUp
                  ? 'Creating Account...'
                  : 'Authenticating...'
                : isSignUp
                ? 'Create Workspace Account'
                : 'Sign In to Workspace'}
            </span>
          </button>
        </form>

        {/* Toggle between Sign In and Sign Up */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setInfoMessage(null);
            }}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium transition cursor-pointer"
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Register new workspace'}
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800 text-[11px] text-slate-400 text-center space-y-2">
          <p className="flex items-center justify-center gap-1.5 text-slate-300 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Protected by Supabase Cloud Authentication</span>
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Active sessions persist safely across restarts. Offline work is stored in local encrypted database and syncs automatically upon reconnection.
          </p>
        </div>
      </div>
    </div>
  );
};
