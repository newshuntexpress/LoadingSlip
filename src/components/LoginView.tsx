import React, { useState } from 'react';
import { AuthUser } from '../types';
import { ApiClient } from '../services/api';
import {
  Building2,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Mail,
  Loader2,
} from 'lucide-react';

interface LoginViewProps {
  needsSetup: boolean;
  onAuthenticated: (user: AuthUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ needsSetup, onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const passwordValid = Object.values(checks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!username.trim() || !password) {
      setErrorMsg('Please enter both your username and password.');
      return;
    }

    if (needsSetup) {
      if (fullName.trim().length < 2) {
        setErrorMsg('Please enter your full name (at least 2 characters).');
        return;
      }
      if (!passwordValid) {
        setErrorMsg('Administrator password does not meet the required strength rules.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (needsSetup) {
        const res = await ApiClient.setupInitialAdmin({
          username: username.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        });
        onAuthenticated(res.user);
      } else {
        const res = await ApiClient.login(username.trim(), password);
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to sign in. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Top Industrial Header */}
        <div className="bg-gradient-to-r from-neutral-900 via-slate-900 to-blue-950 text-white px-6 py-6 border-b border-neutral-800">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-wide uppercase leading-tight">
                AWP Dispatch & Gate Control
              </h1>
              <p className="text-xs text-blue-200/80 mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  {needsSetup
                    ? 'Initial System Administrator Setup'
                    : 'Authorized Personnel Authentication'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-4">
          {needsSetup && (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-3.5 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Create Primary Administrator Account</span>
              </p>
              <p className="text-blue-800/90 leading-relaxed">
                No user accounts exist yet. Create the first Administrator account to lock the application and manage operator logins.
              </p>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Username */}
          <div>
            <label htmlFor="login-username" className="block text-xs font-bold text-neutral-700 mb-1.5">
              Username
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username (not email)"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-neutral-50 font-medium text-neutral-900"
              />
            </div>
          </div>

          {/* Setup-only Full Name & Email */}
          {needsSetup && (
            <>
              <div>
                <label htmlFor="setup-fullname" className="block text-xs font-bold text-neutral-700 mb-1.5">
                  Full Name
                </label>
                <input
                  id="setup-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Plant Administrator"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-neutral-50 font-medium text-neutral-900"
                />
              </div>

              <div>
                <label htmlFor="setup-email" className="block text-xs font-bold text-neutral-700 mb-1.5">
                  Work Email <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    id="setup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-neutral-50 font-medium text-neutral-900"
                  />
                </div>
              </div>
            </>
          )}

          {/* Password */}
          <div>
            <label htmlFor="login-password" className="block text-xs font-bold text-neutral-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsSetup ? 'Create a strong password' : 'Enter your password'}
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-neutral-50 font-medium text-neutral-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-2.5 p-0.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {needsSetup && (
            <>
              <div>
                <label htmlFor="setup-confirm" className="block text-xs font-bold text-neutral-700 mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="setup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter administrator password"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-neutral-50 font-medium text-neutral-900"
                />
              </div>

              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-neutral-700">Password Requirements:</p>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  {[
                    { ok: checks.length, label: '8+ characters' },
                    { ok: checks.upper, label: '1 uppercase (A-Z)' },
                    { ok: checks.lower, label: '1 lowercase (a-z)' },
                    { ok: checks.digit, label: '1 number (0-9)' },
                    { ok: checks.special, label: '1 symbol (!@#$...)' },
                  ].map((rule) => (
                    <div
                      key={rule.label}
                      className={`flex items-center gap-1 ${rule.ok ? 'text-emerald-700 font-semibold' : 'text-neutral-500'}`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${rule.ok ? 'text-emerald-600' : 'text-neutral-300'}`} />
                      <span>{rule.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-60 text-white font-extrabold text-sm py-3 rounded-xl shadow-lg shadow-blue-700/25 transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{needsSetup ? 'Creating Admin Account...' : 'Signing In...'}</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>{needsSetup ? 'Initialize Admin & Sign In' : 'Sign In to System'}</span>
              </>
            )}
          </button>

          {!needsSetup && (
            <p className="text-[11px] text-center text-neutral-500 pt-1">
              Access is restricted to authorized plant personnel. Need an account or password reset? Contact your system Administrator.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
