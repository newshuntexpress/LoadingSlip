import React, { useState } from 'react';
import { AuthUser, PublicBranding } from '../types';
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
  Truck,
} from 'lucide-react';

interface LoginViewProps {
  needsSetup: boolean;
  branding?: PublicBranding | null;
  onAuthenticated: (user: AuthUser) => void;
  onOpenDriverStatus?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  needsSetup,
  branding,
  onAuthenticated,
  onOpenDriverStatus,
}) => {
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
    <div
      data-preserve-case="true"
      className="min-h-screen bg-gradient-to-br from-[#1C2833] via-[#283B4E] to-[#354A5F] flex flex-col items-center justify-center p-4 sm:p-6"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#D1DBE5] overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#F0AB00] via-[#0A6ED1] to-[#0070F2]" />
        {/* Top Industrial Header */}
        <div className="bg-[#354A5F] text-white px-6 py-6 border-b border-[#223242]">
          <div className="flex items-center gap-3.5">
            {branding?.logoDataUrl ? (
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-md shrink-0 ring-1 ring-[#F0AB00]/60 overflow-hidden p-1">
                <img
                  src={branding.logoDataUrl}
                  alt={branding.companyName || 'Company Logo'}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0A6ED1] to-[#004A99] flex items-center justify-center shadow-md shrink-0 ring-1 ring-[#F0AB00]/60">
                <Building2 className="w-6 h-6 text-[#F0AB00]" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-wide leading-tight truncate">
                {branding?.companyName || 'AWP Dispatch & Gate Control'}
              </h1>
              <p className="text-xs text-[#CBD8E6] mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#7EE2A8] shrink-0" />
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
            <div className="bg-[#EBF5FF] border border-[#B8DCFF] text-[#0854A0] rounded-xl p-3.5 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-[#0A6ED1] shrink-0" />
                <span>Create Primary Administrator Account</span>
              </p>
              <p className="text-[#244B73] leading-relaxed">
                No user accounts exist yet. Create the first Administrator account to lock the application and manage operator logins.
              </p>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="bg-[#FFF0F0] border border-[#F4B8B8] text-[#BB0000] px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#BB0000]" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Username */}
          <div>
            <label htmlFor="login-username" className="block text-xs font-bold text-[#354A5F] mb-1.5">
              Username
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-[#5B738B] absolute left-3.5 top-3 pointer-events-none" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username (not email)"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-[#BCC8D4] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] focus:border-[#0A6ED1] bg-[#F7F9FB] font-medium text-[#1C2833]"
              />
            </div>
          </div>

          {/* Setup-only Full Name & Email */}
          {needsSetup && (
            <>
              <div>
                <label htmlFor="setup-fullname" className="block text-xs font-bold text-[#354A5F] mb-1.5">
                  Full Name
                </label>
                <input
                  id="setup-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Plant Administrator"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#BCC8D4] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] bg-[#F7F9FB] font-medium text-[#1C2833]"
                />
              </div>

              <div>
                <label htmlFor="setup-email" className="block text-xs font-bold text-[#354A5F] mb-1.5">
                  Work Email <span className="text-[#5B738B] font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#5B738B] absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    id="setup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-[#BCC8D4] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] bg-[#F7F9FB] font-medium text-[#1C2833]"
                  />
                </div>
              </div>
            </>
          )}

          {/* Password */}
          <div>
            <label htmlFor="login-password" className="block text-xs font-bold text-[#354A5F] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#5B738B] absolute left-3.5 top-3 pointer-events-none" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                data-preserve-case="true"
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsSetup ? 'Create a strong password' : 'Enter your password'}
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg border border-[#BCC8D4] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] focus:border-[#0A6ED1] bg-[#F7F9FB] font-medium text-[#1C2833]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-2.5 p-0.5 text-[#5B738B] hover:text-[#1C2833] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {needsSetup && (
            <>
              <div>
                <label htmlFor="setup-confirm" className="block text-xs font-bold text-[#354A5F] mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="setup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  data-preserve-case="true"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter administrator password"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#BCC8D4] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] bg-[#F7F9FB] font-medium text-[#1C2833]"
                />
              </div>

              <div className="bg-[#F7F9FB] border border-[#D1DBE5] rounded-lg p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-[#354A5F]">Password Requirements:</p>
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
                      className={`flex items-center gap-1 ${rule.ok ? 'text-[#107E3E] font-semibold' : 'text-[#5B738B]'}`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${rule.ok ? 'text-[#107E3E]' : 'text-[#BCC8D4]'}`} />
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
            className="w-full bg-[#0A6ED1] hover:bg-[#085CAF] disabled:opacity-60 text-white font-extrabold text-sm py-3 rounded-lg shadow-md transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-2"
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
            <>
              {onOpenDriverStatus && (
                <div className="pt-2 border-t border-[#E5ECF4]">
                  <button
                    type="button"
                    onClick={onOpenDriverStatus}
                    className="w-full min-h-[44px] bg-[#FEF7F1] hover:bg-[#FDECD8] border border-[#F9C99B] text-[#A64B00] font-extrabold text-xs sm:text-sm py-2.5 px-4 rounded-lg transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Truck className="w-4 h-4 text-[#E9730C] shrink-0" />
                    <span>Driver Live Loading Status (Check Turn)</span>
                  </button>
                </div>
              )}
              <p className="text-[11px] text-center text-[#5B738B] pt-1">
                Access is restricted to authorized plant personnel. Need an account or password reset? Contact your system Administrator.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
