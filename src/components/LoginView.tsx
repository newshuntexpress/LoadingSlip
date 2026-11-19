import React, { useEffect, useRef, useState } from 'react';
import { AuthUser, PublicBranding } from '../types';
import { ApiClient } from '../services/api';
import {
  Building2,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
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

  // Subtle 3D tilt state for desktop fine-pointer users (locked flat while typing)
  const chassisRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 35 });
  const [formFocused, setFormFocused] = useState(false);
  const [canTilt, setCanTilt] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    const updateTiltSupport = () => {
      setCanTilt(!reduced.matches && finePointer.matches && window.innerWidth >= 1024);
    };
    updateTiltSupport();
    reduced.addEventListener('change', updateTiltSupport);
    finePointer.addEventListener('change', updateTiltSupport);
    window.addEventListener('resize', updateTiltSupport);
    return () => {
      reduced.removeEventListener('change', updateTiltSupport);
      finePointer.removeEventListener('change', updateTiltSupport);
      window.removeEventListener('resize', updateTiltSupport);
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canTilt || formFocused || !chassisRef.current) return;
    const rect = chassisRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * 4.2;
    const rx = (0.5 - py) * 3.4;
    setTilt({
      rx: Number(rx.toFixed(2)),
      ry: Number(ry.toFixed(2)),
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
    });
  };

  const resetTilt = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 35 });
  };

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

  const activeTransform =
    canTilt && !formFocused
      ? `perspective(1500px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`
      : 'none';

  return (
    <div
      data-preserve-case="true"
      className="login-3d-stage relative min-h-screen w-full overflow-x-hidden flex flex-col items-center justify-center p-4 sm:p-6 lg:p-10"
    >
      {/* 3D Perspective Floor Grid & Horizon Illumination */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-28 left-1/2 -translate-x-1/2 w-[780px] h-[360px] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(22,130,240,0.45) 0%, rgba(240,171,0,0.12) 48%, transparent 72%)',
          }}
        />
        <div className="login-3d-floor absolute bottom-[-14%] left-[-20%] right-[-20%] h-[62%]" />
      </div>

      {/* Main 3D Hardware Chassis */}
      <div
        ref={chassisRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        style={{ transform: activeTransform }}
        className="login-chassis-3d relative z-10 w-full max-w-lg rounded-3xl border border-[#3B556E] overflow-hidden bg-[#162331]"
      >
        {/* Specular 3D Rim & Top Architectural Accent */}
        <div className="h-2 w-full bg-gradient-to-r from-[#F0AB00] via-[#0A6ED1] to-[#107E3E]" />

        {/* TOP BAY: 3D Metallic Brand Header */}
        <div className="login-showcase-3d relative text-white px-6 py-6 sm:px-8 sm:py-7 border-b-2 border-[#121D29]">
          {/* Subtle interactive lighting sheen */}
          {canTilt && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-35 transition-opacity duration-200"
              style={{
                background: `radial-gradient(420px circle at ${tilt.gx}% ${tilt.gy}%, rgba(125, 190, 255, 0.2), transparent 65%)`,
              }}
            />
          )}

          <div className="relative flex items-center gap-4">
            {branding?.logoDataUrl ? (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white flex items-center justify-center shrink-0 ring-2 ring-[#F0AB00]/85 overflow-hidden p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_0_#101A24,0_14px_24px_rgba(0,0,0,0.45)]">
                <img
                  src={branding.logoDataUrl}
                  alt={branding.companyName || 'Company Logo'}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#1C8AF7] via-[#0A6ED1] to-[#064587] flex items-center justify-center shrink-0 ring-2 ring-[#F0AB00]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_6px_0_#042952,0_14px_24px_rgba(0,0,0,0.45)]">
                <Building2 className="w-7 h-7 sm:w-8 sm:h-8 text-[#F0AB00]" />
              </div>
            )}

            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8FBCE8]">
                Plant Gate &amp; Dispatch Terminal
              </p>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-white [text-wrap:balance] mt-0.5">
                {branding?.companyName || 'AWP Dispatch & Gate Control'}
              </h1>
            </div>
          </div>
        </div>

        {/* BOTTOM BAY: Tactile 3D Sign-In Console */}
        <div
          className="login-console-face p-6 sm:p-8 flex flex-col justify-center"
          onFocusCapture={() => setFormFocused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setFormFocused(false);
            }
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
              {needsSetup && (
                <div className="bg-[#EBF5FF] border border-[#B8DCFF] text-[#0854A0] rounded-xl p-3.5 text-xs space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-[#0A6ED1] shrink-0" />
                    <span>Primary Administrator Account Required</span>
                  </p>
                  <p className="text-[#244B73] leading-relaxed">
                    No user accounts exist yet. Complete this form to lock the workspace and manage operator logins.
                  </p>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="bg-[#FFF0F0] border border-[#F0B2B2] text-[#B30000] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-start gap-2 shadow-xs"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#B30000]" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Username */}
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs sm:text-sm font-bold text-[#2E4257] mb-1.5"
                >
                  Username
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#526A82] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username (not email)"
                    className="login-input-3d w-full h-12 pl-11 pr-4 text-base rounded-xl border border-[#B8C7D6] focus:outline-none focus:border-[#0A6ED1] bg-[#F2F7FC] font-semibold text-[#1C2833]"
                  />
                </div>
              </div>

              {/* Setup-only Full Name & Email */}
              {needsSetup && (
                <>
                  <div>
                    <label
                      htmlFor="setup-fullname"
                      className="block text-xs sm:text-sm font-bold text-[#2E4257] mb-1.5"
                    >
                      Full Name
                    </label>
                    <input
                      id="setup-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Plant Administrator"
                      className="login-input-3d w-full h-12 px-4 text-base rounded-xl border border-[#B8C7D6] focus:outline-none focus:border-[#0A6ED1] bg-[#F2F7FC] font-semibold text-[#1C2833]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="setup-email"
                      className="block text-xs sm:text-sm font-bold text-[#2E4257] mb-1.5"
                    >
                      Work Email <span className="text-[#5B738B] font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#526A82] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="setup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@company.com"
                        className="login-input-3d w-full h-12 pl-11 pr-4 text-base rounded-xl border border-[#B8C7D6] focus:outline-none focus:border-[#0A6ED1] bg-[#F2F7FC] font-semibold text-[#1C2833]"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Password */}
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs sm:text-sm font-bold text-[#2E4257] mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#526A82] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    data-preserve-case="true"
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={needsSetup ? 'Create a strong password' : 'Enter your password'}
                    className="login-input-3d w-full h-12 pl-11 pr-12 text-base rounded-xl border border-[#B8C7D6] focus:outline-none focus:border-[#0A6ED1] bg-[#F2F7FC] font-semibold text-[#1C2833]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg text-[#4A627A] hover:text-[#1C2833] focus-visible:outline-2 focus-visible:outline-[#0A6ED1] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {needsSetup && (
                <>
                  <div>
                    <label
                      htmlFor="setup-confirm"
                      className="block text-xs sm:text-sm font-bold text-[#2E4257] mb-1.5"
                    >
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
                      className="login-input-3d w-full h-12 px-4 text-base rounded-xl border border-[#B8C7D6] focus:outline-none focus:border-[#0A6ED1] bg-[#F2F7FC] font-semibold text-[#1C2833]"
                    />
                  </div>

                  <div className="bg-[#F4F8FC] border border-[#D1DBE5] rounded-xl p-3 space-y-1.5">
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
                          className={`flex items-center gap-1 ${
                            rule.ok ? 'text-[#107E3E] font-semibold' : 'text-[#526A82]'
                          }`}
                        >
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              rule.ok ? 'text-[#107E3E]' : 'text-[#BCC8D4]'
                            }`}
                          />
                          <span>{rule.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Tactile 3D Submit Push Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-3d w-full h-12 min-h-[48px] bg-gradient-to-b from-[#1A88F5] to-[#085CAF] hover:from-[#2693FF] hover:to-[#0A66C2] disabled:opacity-60 text-white font-black text-base rounded-xl border border-[#054485] whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-2.5 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                    <span>{needsSetup ? 'Creating Admin Account...' : 'Signing In...'}</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5 shrink-0" />
                    <span>{needsSetup ? 'Initialize Admin & Sign In' : 'Sign In to System'}</span>
                  </>
                )}
              </button>

              {!needsSetup && (
                <>
                  {onOpenDriverStatus && (
                    <div className="pt-4 mt-2 border-t border-[#DCE5F0] space-y-2">
                      <button
                        type="button"
                        onClick={onOpenDriverStatus}
                        aria-label="Driver Live Loading Status (Check Turn)"
                        className="btn-3d w-full h-12 min-h-[48px] bg-gradient-to-b from-[#FFF6EB] to-[#FADBB8] hover:from-[#FFF9F2] hover:to-[#F7CFA4] border border-[#EAB076] text-[#8A3B00] font-extrabold text-sm px-4 rounded-xl whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-2.5"
                      >
                        <Truck className="w-5 h-5 text-[#D96500] shrink-0" />
                        <span>Driver Live Loading Status</span>
                      </button>
                      <p className="text-[11px] text-center text-[#526A82]">
                        Drivers &amp; transporters: check live bay turn without signing in.
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-center text-[#526A82] pt-1 leading-relaxed">
                    Access is restricted to authorized plant personnel. Contact your system Administrator for account assistance.
                  </p>
                </>
              )}
          </form>
        </div>
      </div>
    </div>
  );
};
