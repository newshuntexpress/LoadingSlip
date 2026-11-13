import React, { useState } from 'react';
import { CompanySettings } from '../types';
import { StorageService } from '../services/storage';
import { ApiClient } from '../services/api';
import { Settings, Plus, Trash2, Save, X, DoorOpen, RotateCcw, BookmarkCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  settings: CompanySettings;
  onSave: (newSettings: CompanySettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companySubtitle, setCompanySubtitle] = useState(settings.companySubtitle);
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [gstin, setGstin] = useState(settings.gstin);
  const [ticketPrefix, setTicketPrefix] = useState(settings.ticketPrefix || 'TK');
  const [autoPrintTokenAfterSave, setAutoPrintTokenAfterSave] = useState(settings.autoPrintTokenAfterSave ?? true);
  const [sessionIdleMinutes, setSessionIdleMinutes] = useState<number>(settings.sessionIdleMinutes || 30);
  const [gates, setGates] = useState<string[]>([...settings.gates]);
  const [newGateName, setNewGateName] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleAddGate = () => {
    const trimmed = newGateName.trim();
    if (!trimmed) return;
    if (gates.includes(trimmed)) {
      showFeedback('error', 'This gate already exists!');
      return;
    }
    setGates([...gates, trimmed]);
    setNewGateName('');
    setFeedback(null);
  };

  const handleRemoveGate = (gate: string) => {
    if (gates.length <= 1) {
      showFeedback('error', 'At least 1 gate must be configured!');
      return;
    }
    setGates(gates.filter((g) => g !== gate));
  };

  const buildCurrentSettings = (): CompanySettings => {
    const finalGates = [...gates];
    const pendingGate = newGateName.trim();
    if (pendingGate && !finalGates.includes(pendingGate)) {
      finalGates.push(pendingGate);
    }
    return {
      companyName: companyName.trim() || 'Factory / Plant Name',
      companySubtitle: companySubtitle.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      gstin: gstin.trim(),
      ticketPrefix: ticketPrefix.trim().toUpperCase() || 'TK',
      autoPrintTokenAfterSave,
      sessionIdleMinutes: Math.max(5, Math.min(720, Number(sessionIdleMinutes) || 30)),
      gates: finalGates,
    };
  };

  const handleSaveAsDefault = async () => {
    const updated = buildCurrentSettings();
    try {
      const saved = await ApiClient.saveAsDefaultSettings(updated);
      setGates(saved.gates);
      setNewGateName('');
      StorageService.saveAsDefaultSettings(saved);
      onSave(saved);
      showFeedback('success', 'Current settings saved as Default! All fields and loading gates are now saved as default.');
    } catch (err: any) {
      showFeedback('error', err?.message || 'Failed to save default settings.');
    }
  };

  const handleRestoreDefault = () => {
    const def = StorageService.getDefaultSettings();
    setCompanyName(def.companyName);
    setCompanySubtitle(def.companySubtitle);
    setAddress(def.address);
    setPhone(def.phone);
    setEmail(def.email);
    setGstin(def.gstin);
    setTicketPrefix(def.ticketPrefix || 'TK');
    setAutoPrintTokenAfterSave(def.autoPrintTokenAfterSave ?? true);
    setSessionIdleMinutes(def.sessionIdleMinutes || 30);
    setGates([...def.gates]);
    setNewGateName('');
    showFeedback('success', 'Loaded saved default settings into form. Click Save Settings to apply.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = buildCurrentSettings();
    try {
      const saved = await ApiClient.saveSettings(updated);
      StorageService.saveSettings(saved);
      onSave(saved);
      onClose();
    } catch (err: any) {
      showFeedback('error', err?.message || 'Failed to save settings.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Settings className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Plant & System Settings</h2>
              <p className="text-xs text-neutral-300">
                Print Header, Company Info & Loading Gates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="text-xs font-bold text-neutral-700 block mb-1">
              Company / Plant Name *
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-700 block mb-1">
              Subtitle / Tagline
            </label>
            <input
              type="text"
              value={companySubtitle}
              onChange={(e) => setCompanySubtitle(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-700 block mb-1">
              Plant / Factory Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">
                Helpdesk / Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">
                GSTIN / Tax ID
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono uppercase rounded-lg border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">
                Ticket Number Prefix
              </label>
              <input
                type="text"
                value={ticketPrefix}
                onChange={(e) => setTicketPrefix(e.target.value)}
                placeholder="e.g. TK"
                className="w-24 px-3 py-1.5 text-xs font-bold uppercase rounded-lg border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
              <span className="text-[11px] text-neutral-500 ml-2">
                (Preview: {ticketPrefix}-20261113-001)
              </span>
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">
                Auto-Logout Idle Timeout (Minutes)
              </label>
              <input
                type="number"
                min={5}
                max={720}
                value={sessionIdleMinutes}
                onChange={(e) => setSessionIdleMinutes(Math.max(5, Math.min(720, parseInt(e.target.value, 10) || 30)))}
                className="w-28 px-3 py-1.5 text-xs font-bold rounded-lg border border-neutral-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
              <span className="text-[11px] text-neutral-500 ml-2">(5–720 min)</span>
            </div>
          </div>

          {/* Auto-Print Token After Save Default Toggle */}
          <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-blue-950 block">
                Auto-Print Token After Save (Default)
              </span>
              <p className="text-[11px] text-blue-800">
                Immediately trigger ticket print view right after registering a new vehicle entry.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoPrintTokenAfterSave}
              onChange={(e) => setAutoPrintTokenAfterSave(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded border-blue-300 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          {/* Gate Management */}
          <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
            <label className="text-xs font-bold text-neutral-800 uppercase tracking-wide block mb-2 flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4 text-blue-700" />
              <span>Available Loading Gates:</span>
            </label>

            <div className="flex flex-wrap gap-2 mb-3">
              {gates.map((g) => (
                <div
                  key={g}
                  className="bg-white border border-neutral-300 px-3 py-1.5 rounded-xl shadow-sm text-xs font-bold text-neutral-800 flex items-center gap-2"
                >
                  <span>{g}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveGate(g)}
                    className="text-neutral-400 hover:text-red-500 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newGateName}
                onChange={(e) => setNewGateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddGate();
                  }
                }}
                placeholder="New gate name e.g. Gate 5"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddGate}
                className="bg-neutral-800 hover:bg-neutral-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Gate</span>
              </button>
            </div>
          </div>

          {feedback && (
            <div
              className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pt-3 border-t border-neutral-200">
            <div className="grid grid-cols-2 md:flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="app-btn w-full md:w-auto md:min-w-[110px] text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreDefault}
                className="app-btn w-full md:w-auto text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300"
                title="Load saved default settings"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Restore Default</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveAsDefault}
                className="app-btn w-full md:w-auto bg-emerald-700 hover:bg-emerald-600 text-white shadow"
                title="Save all current fields & loading gates as permanent default"
              >
                <BookmarkCheck className="w-4 h-4 shrink-0" />
                <span>Save as Default</span>
              </button>
              <button
                type="submit"
                className="app-btn w-full md:w-auto bg-blue-700 hover:bg-blue-600 text-white shadow-lg shadow-blue-700/30"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>Save Settings</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
