import React, { useState } from 'react';
import { AuthUser } from '../types';
import { ApiClient } from '../services/api';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  LogOut,
  X,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

interface ChangePasswordModalProps {
  user: AuthUser;
  forced?: boolean;
  onSuccess: (updatedUser: AuthUser) => void;
  onClose?: () => void;
  onLogout?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  user,
  forced = false,
  onSuccess,
  onClose,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    digit: /\d/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  };
  const passwordValid = Object.values(checks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentPassword || !newPassword) {
      setErrorMsg('Please fill out all password fields.');
      return;
    }
    if (!passwordValid) {
      setErrorMsg('New password does not meet the required security criteria.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMsg('New password must be different from your current password.');
      return;
    }

    setLoading(true);
    try {
      const res = await ApiClient.changeOwnPassword(currentPassword, newPassword);
      onSuccess(res.user);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-preserve-case="true" className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-neutral-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-neutral-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <KeyRound className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {forced ? 'Password Update Required' : 'Change Your Password'}
              </h2>
              <p className="text-[11px] text-neutral-300">
                Signed in as <span className="font-bold text-white">@{user.username}</span> ({user.roleDisplayName})
              </p>
            </div>
          </div>

          {!forced && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {forced && (
            <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl p-3.5 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Temporary Password Assigned</p>
                <p className="text-amber-900 mt-0.5">
                  For account security, you must replace your temporary password with a private personal password before accessing the system.
                </p>
              </div>
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

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              {forced ? 'Temporary / Current Password' : 'Current Password'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type={showPasswords ? 'text' : 'password'}
                data-preserve-case="true"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full pl-9 pr-10 py-2 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-neutral-50"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">New Password</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              data-preserve-case="true"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new strong password"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-neutral-50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Confirm New Password</label>
            <input
              type={showPasswords ? 'text' : 'password'}
              data-preserve-case="true"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-600 bg-neutral-50"
            />
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-1.5">
            <p className="text-[11px] font-bold text-neutral-700">Password Strength Rules:</p>
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

          <div className="flex items-center justify-between gap-2 pt-2">
            {forced && onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100 text-xs font-bold cursor-pointer transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100 text-xs font-bold cursor-pointer transition"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-extrabold text-xs sm:text-sm py-2.5 px-5 rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
