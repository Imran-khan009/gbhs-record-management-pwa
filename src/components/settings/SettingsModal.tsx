import React, { useState, useEffect } from 'react';
import {
  getSupabaseConfig,
  updateSupabaseConfig,
  getSupabaseSQLSchema,
  setNetworkSimulation,
  SupabaseConfig,
} from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Sliders,
  Database,
  Cloud,
  CheckCircle2,
  Copy,
  Check,
  Shield,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { session } = useAuth();
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [simulationMode, setSimulationMode] = useState<SupabaseConfig['simulationMode']>('none');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSQL, setCopiedSQL] = useState(false);
  const [showSQL, setShowSQL] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url || '');
      setAnonKey(cfg.anonKey || '');
      setSimulationMode(cfg.simulationMode || 'none');
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSupabaseConfig({
      url: url.trim(),
      anonKey: anonKey.trim(),
      simulationMode,
    });
    setNetworkSimulation(simulationMode);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const sqlSchema = getSupabaseSQLSchema();

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">System & Supabase Cloud Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Settings updated successfully!</span>
            </div>
          )}

          {/* School & Operator profile summary */}
          <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400">School Scope</span>
              <p className="font-bold text-white text-sm">Govt Boys High School (GBHS-MAIN)</p>
              <p className="text-slate-400 mt-0.5">Operator: {session?.user.fullName} ({session?.user.email})</p>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-sky-950 text-sky-400 border border-sky-800 font-semibold text-[11px]">
              Single Authorized User
            </div>
          </div>

          {/* Supabase Cloud Connection Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-sky-400" />
                <span>Supabase Cloud Database & Authentication</span>
              </h4>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                Enter your Supabase project credentials. When left empty, the built-in zero-setup mock cloud adapter is
                used for instantaneous offline/online sync verification.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Supabase Project URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Supabase Anon / Public Key (Never use Service Role Key)
              </label>
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            {/* Network Simulation Modes for Testing */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span>Network & Cloud Simulation Mode (For Test Verification)</span>
              </label>
              <select
                value={simulationMode}
                onChange={(e) => setSimulationMode(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="none">Normal (Active Online Cloud Sync)</option>
                <option value="offline">Simulate Network Disconnected (Offline)</option>
                <option value="server_error">Simulate HTTP 503 Server Error (Triggers Backoff)</option>
                <option value="auth_expired">Simulate Expired Session (Auth Required)</option>
                <option value="conflict_trigger">Simulate Remote Divergence (Conflict Review)</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowSQL(!showSQL)}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium underline cursor-pointer"
              >
                {showSQL ? 'Hide Supabase SQL Schema' : 'View Supabase RLS SQL Schema'}
              </button>

              <button
                type="submit"
                className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-5 py-2 rounded-xl transition cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </form>

          {/* Collapsible Supabase RLS SQL schema */}
          {showSQL && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">PostgreSQL Schema & RLS Policies</span>
                <button
                  onClick={handleCopySQL}
                  className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-mono bg-slate-800 px-2.5 py-1 rounded"
                >
                  {copiedSQL ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSQL ? 'Copied!' : 'Copy SQL'}</span>
                </button>
              </div>
              <pre className="text-[10px] text-slate-300 font-mono overflow-x-auto max-h-52 p-2 bg-slate-900 rounded">
                {sqlSchema}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
