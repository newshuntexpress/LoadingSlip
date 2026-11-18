import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DriverLiveStatusResponse, PublicBranding, TruckStatus } from '../types';
import { ApiClient } from '../services/api';
import { formatDisplayDate } from '../services/storage';
import {
  Building2,
  Search,
  RefreshCw,
  ArrowLeft,
  Clock,
  CheckCircle2,
  Megaphone,
  Truck,
  DoorOpen,
  AlertCircle,
  TimerOff,
  Loader2,
  X,
  FileText,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { LiveStatusQrCard } from './LiveStatusQrCard';

interface DriverStatusViewProps {
  branding?: PublicBranding | null;
  onBack: () => void;
  backLabel?: string;
}

function formatRemainingDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00h 00m 00s';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

function formatClockTimestamp(timestampMs?: number): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toLocaleString();
  }
}

function getStatusMeta(status: TruckStatus, trucksAhead: number, gateNumber: string) {
  switch (status) {
    case 'under_loading':
      return {
        label: 'Under Loading',
        headline: `Your truck is currently Under Loading at ${gateNumber || 'Gate'}`,
        subtext: 'Please follow plant safety rules (Safety Shoes & Helmet) until loading is marked complete.',
        toneBg: 'bg-[#FEF7F1]',
        toneBorder: 'border-[#F9C99B]',
        toneText: 'text-[#A64B00]',
        accentBg: 'bg-[#E9730C]',
        stepIndex: 2,
      };
    case 'called':
      return {
        label: 'Called to Gate',
        headline: `Your turn has been called! Proceed to ${gateNumber || 'Gate'} now`,
        subtext:
          trucksAhead > 0
            ? `${trucksAhead} truck${trucksAhead === 1 ? '' : 's'} currently finishing at ${gateNumber}. Drive to the gate waiting bay and report to the Forklift Operator.`
            : `Gate bay is ready for your truck. Move to ${gateNumber} immediately and report to Dispatch / Forklift Operator.`,
        toneBg: 'bg-[#EBF5FF]',
        toneBorder: 'border-[#90C5FC]',
        toneText: 'text-[#0854A0]',
        accentBg: 'bg-[#0A6ED1]',
        stepIndex: 1,
      };
    case 'completed':
      return {
        label: 'Loading Completed',
        headline: 'Loading is completed & ready for dispatch',
        subtext: 'Please collect your signed Delivery Note from the Dispatch Office before exiting the plant.',
        toneBg: 'bg-[#F1FDF6]',
        toneBorder: 'border-[#8AD7A8]',
        toneText: 'text-[#0D6B34]',
        accentBg: 'bg-[#107E3E]',
        stepIndex: 3,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        headline: 'This loading ticket has been cancelled',
        subtext: 'Please check with Gate Security or Dispatch Office for updated instructions.',
        toneBg: 'bg-[#FFF0F0]',
        toneBorder: 'border-[#F4B8B8]',
        toneText: 'text-[#BB0000]',
        accentBg: 'bg-[#BB0000]',
        stepIndex: 0,
      };
    case 'waiting':
    default:
      return {
        label: 'Waiting in Queue',
        headline:
          trucksAhead === 0
            ? `You are Next in Queue at ${gateNumber || 'Gate'}`
            : `${trucksAhead} truck${trucksAhead === 1 ? '' : 's'} ahead of you at ${gateNumber || 'Gate'}`,
        subtext:
          trucksAhead === 0
            ? 'Get ready! Your truck is next in line. Stay alert for the Gate Call or WhatsApp alert.'
            : `Please wait safely in the outside truck parking zone. This screen updates automatically every 15 seconds.`,
        toneBg: 'bg-[#FFFBEB]',
        toneBorder: 'border-[#F7D774]',
        toneText: 'text-[#854D0E]',
        accentBg: 'bg-[#D97706]',
        stepIndex: 0,
      };
  }
}

export const DriverStatusView: React.FC<DriverStatusViewProps> = ({
  branding,
  onBack,
  backLabel = 'Staff Login',
}) => {
  const [truckInput, setTruckInput] = useState<string>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const fromSearch = searchParams.get('truck');
      if (fromSearch) return fromSearch.toUpperCase();
      const hashParts = window.location.hash.split('?');
      if (hashParts[1]) {
        const fromHash = new URLSearchParams(hashParts[1]).get('truck');
        if (fromHash) return fromHash.toUpperCase();
      }
    } catch {
      // Ignore query parse failures
    }
    return '';
  });

  const [searchedTruck, setSearchedTruck] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DriverLiveStatusResponse | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  const autoCheckedInitialRef = useRef(false);

  const performLookup = useCallback(async (truckValue: string, silent = false) => {
    const trimmed = truckValue.trim().toUpperCase();
    if (!trimmed) {
      setErrorMsg('Please enter your Vehicle / Truck Number.');
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setErrorMsg(null);
    }

    try {
      const res = await ApiClient.lookupDriverStatus(trimmed);
      setResult(res);
      setSearchedTruck(trimmed);
      setServerOffsetMs(res.serverTimeMs - Date.now());
      setLastUpdatedAt(Date.now());
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to fetch live loading status. Please check your Vehicle / Truck Number and retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-lookup if opened with ?truck=...
  useEffect(() => {
    if (!autoCheckedInitialRef.current && truckInput.trim().replace(/[^A-Za-z0-9]/g, '').length >= 3) {
      autoCheckedInitialRef.current = true;
      performLookup(truckInput);
    }
  }, [truckInput, performLookup]);

  // 1-second timer for accurate 12-hour validity countdown
  useEffect(() => {
    if (!result?.found || result.expired || !result.expiresAt) return;
    const timer = setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [result?.found, result?.expired, result?.expiresAt]);

  // 15-second live polling while viewing a valid active ticket
  useEffect(() => {
    if (!searchedTruck || !result?.found || result.expired) return;
    const interval = setInterval(() => {
      performLookup(searchedTruck, true);
    }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        performLookup(searchedTruck, true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [searchedTruck, result?.found, result?.expired, performLookup]);

  const effectiveNowMs = nowTickMs + serverOffsetMs;
  const remainingMs =
    result?.found && !result.expired && result.expiresAt ? Math.max(0, result.expiresAt - effectiveNowMs) : 0;
  const isLocallyExpired = Boolean(result?.found && !result.expired && result.expiresAt && remainingMs <= 0);
  const showExpiredState = Boolean(result?.expired || isLocallyExpired);
  const effectiveBranding = result?.branding || branding;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(truckInput, false);
  };

  const handleClear = () => {
    setTruckInput('');
    setSearchedTruck('');
    setResult(null);
    setErrorMsg(null);
    setLastUpdatedAt(null);
  };

  const ticket = result?.ticket;
  const queue = result?.queue;
  const statusMeta =
    ticket && queue ? getStatusMeta(ticket.status, queue.trucksAhead, queue.gateNumber || ticket.gateNumber) : null;

  const timelineSteps = [
    { label: 'Ticket Issued', time: ticket?.timeIn || 'Registered' },
    { label: 'Called to Gate', time: ticket?.timeCalled || 'Awaiting Call' },
    { label: 'Under Loading', time: ticket?.timeLoadingStarted || 'In Queue' },
    { label: 'Completed', time: ticket?.timeCompleted || 'Pending' },
  ];

  return (
    <div className="min-h-screen bg-[#F3F6FA] text-[#1C2833] flex flex-col">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 bg-[#354A5F] text-white border-b border-[#223242] shadow-sm">
        <div className="h-1 w-full bg-gradient-to-r from-[#F0AB00] via-[#0A6ED1] to-[#0070F2]" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {effectiveBranding?.logoDataUrl ? (
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden p-0.5 ring-1 ring-[#F0AB00]/60">
                <img
                  src={effectiveBranding.logoDataUrl}
                  alt={effectiveBranding.companyName || 'Company Logo'}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0A6ED1] to-[#004A99] flex items-center justify-center text-[#F0AB00] shrink-0 ring-1 ring-[#F0AB00]/60">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            <span className="text-sm sm:text-base font-extrabold tracking-tight text-white truncate">
              {effectiveBranding?.companyName || 'AWP Dispatch & Gate Control'}
            </span>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-lg bg-[#243647] hover:bg-[#1B2A38] border border-[#4A6580] text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>{backLabel}</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-7 flex-1 space-y-5">
        {/* Search & Intro Card */}
        <section className="bg-white rounded-2xl border border-[#D1DBE5] shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5ECF4] pb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#1C2833] tracking-tight">
                Driver Live Loading Status
              </h1>
              <p className="text-xs sm:text-sm text-[#475E75] mt-1">
                Enter your Vehicle / Truck Number submitted when your gate ticket or loading slip was generated to check your live loading turn.
              </p>
            </div>
            <div className="text-xs text-[#5B738B] flex items-center gap-2 shrink-0">
              <Clock className="w-4 h-4 text-[#0A6ED1] shrink-0" />
              <span>Valid for 12 hours from slip generation</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Truck className="w-4 h-4 text-[#5B738B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="driver-truck-lookup"
                type="text"
                autoComplete="off"
                value={truckInput}
                onChange={(e) => setTruckInput(e.target.value.toUpperCase())}
                placeholder="Enter Vehicle / Truck Number (e.g. 5275 AXG)"
                className="w-full min-h-[48px] pl-10 pr-10 py-2.5 text-sm sm:text-base rounded-xl border border-[#BCC8D4] bg-[#F7F9FB] text-[#1C2833] font-semibold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] focus:border-[#0A6ED1]"
              />
              {truckInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear Vehicle / Truck Number"
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#5B738B] hover:text-[#1C2833] hover:bg-[#E5ECF4] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] px-6 rounded-xl bg-[#0A6ED1] hover:bg-[#085CAF] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition whitespace-nowrap shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 shrink-0" />
                  <span>Check Live Status</span>
                </>
              )}
            </button>
          </form>

          {errorMsg && (
            <div
              role="alert"
              className="bg-[#FFF0F0] border border-[#F4B8B8] text-[#BB0000] px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#BB0000]" />
              <span>{errorMsg}</span>
            </div>
          )}
        </section>

        {/* Empty Initial State */}
        {!result && !loading && (
          <section className="bg-white rounded-2xl border border-[#D1DBE5] p-6 sm:p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EBF5FF] border border-[#B8DCFF] flex items-center justify-center text-[#0A6ED1]">
              <Truck className="w-7 h-7" />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#1C2833]">
              Check Your Gate &amp; Loading Queue Turn
            </h2>
            <p className="text-xs sm:text-sm text-[#5B738B] max-w-xl mx-auto leading-relaxed">
              Once your gate entry slip is created, enter your Vehicle / Truck Number above to view your assigned gate, how many trucks are ahead of you, and live loading updates. For security, status links automatically expire 12 hours after ticket creation.
            </p>
          </section>
        )}

        {/* Not Found State */}
        {result && !result.found && (
          <section className="bg-white rounded-2xl border border-[#D1DBE5] p-6 sm:p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FEF7F1] border border-[#F9C99B] flex items-center justify-center text-[#E9730C]">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#1C2833]">
              No Active Slip Found
            </h2>
            <p className="text-xs sm:text-sm text-[#475E75] max-w-lg mx-auto leading-relaxed">
              {result.message ||
                'No loading ticket or slip matches this Vehicle / Truck Number. Please check the truck number entered during gate entry or confirm with Gate Security.'}
            </p>
          </section>
        )}

        {/* Expired (12 Hours Elapsed) State */}
        {result && result.found && showExpiredState && (
          <section className="bg-white rounded-2xl border border-[#F4B8B8] p-6 sm:p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FFF0F0] border border-[#F4B8B8] flex items-center justify-center text-[#BB0000]">
              <TimerOff className="w-7 h-7" />
            </div>
            <h2 className="text-lg sm:text-xl font-black text-[#BB0000]">
              Status Expired (12-Hour Limit)
            </h2>
            <p className="text-xs sm:text-sm text-[#475E75] max-w-lg mx-auto leading-relaxed">
              {result.message ||
                'Your live loading status was valid only for 12 hours from slip generation and has now expired.'}
            </p>
            {result.expiredAt && (
              <p className="text-xs font-semibold text-[#5B738B] tabular-nums">
                Expired at: {formatClockTimestamp(result.expiredAt)}
              </p>
            )}
            <p className="text-xs text-[#5B738B] pt-1">
              If a fresh gate ticket was issued today, re-check with your Vehicle / Truck Number or contact Dispatch Office.
            </p>
          </section>
        )}

        {/* Active Live Status State (Within 12 Hours) */}
        {result && result.found && !showExpiredState && ticket && queue && statusMeta && (
          <div className="space-y-4">
            {/* Hero Turn Banner */}
            <section className={`rounded-2xl border ${statusMeta.toneBorder} ${statusMeta.toneBg} p-5 sm:p-6 space-y-4`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#475E75]">
                    <span className={`${statusMeta.toneText} font-extrabold`}>{statusMeta.label}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{ticket.ticketNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatDisplayDate(ticket.date)}</span>
                  </div>
                  <h2 className={`text-xl sm:text-2xl font-black tracking-tight ${statusMeta.toneText}`}>
                    {statusMeta.headline}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#354A5F] leading-relaxed max-w-2xl">
                    {statusMeta.subtext}
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => performLookup(searchedTruck || truckInput, true)}
                    disabled={refreshing}
                    className="min-h-[44px] px-4 rounded-xl bg-white hover:bg-[#EFF4F9] border border-[#BCC8D4] text-xs font-bold text-[#1C2833] flex items-center gap-2 cursor-pointer transition shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#0A6ED1] ${refreshing ? 'animate-spin' : ''}`} />
                    <span>{refreshing ? 'Refreshing...' : 'Refresh Live'}</span>
                  </button>
                  {lastUpdatedAt && (
                    <span className="text-[11px] text-[#5B738B] tabular-nums">
                      Updated {new Date(lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* 4 Key Live Turn Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-black/10">
                <div className="bg-white rounded-xl border border-[#D1DBE5] p-3.5">
                  <span className="text-[11px] font-bold text-[#5B738B] block">Assigned Gate</span>
                  <div className="mt-1 flex items-center gap-2">
                    <DoorOpen className="w-5 h-5 text-[#0A6ED1] shrink-0" />
                    <span className="text-lg sm:text-xl font-black text-[#1C2833] truncate">
                      {queue.gateNumber || ticket.gateNumber || '—'}
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#D1DBE5] p-3.5">
                  <span className="text-[11px] font-bold text-[#5B738B] block">Trucks Ahead of You</span>
                  <div className="mt-1 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#E9730C] shrink-0" />
                    <span className="text-lg sm:text-xl font-black text-[#1C2833] tabular-nums">
                      {ticket.status === 'completed' || ticket.status === 'cancelled' ? '0' : queue.trucksAhead}
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#D1DBE5] p-3.5">
                  <span className="text-[11px] font-bold text-[#5B738B] block">Live Gate Position</span>
                  <div className="mt-1 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-[#107E3E] shrink-0" />
                    <span className="text-lg sm:text-xl font-black text-[#1C2833] tabular-nums">
                      {ticket.status === 'completed'
                        ? 'Done'
                        : ticket.status === 'cancelled'
                        ? 'Cancelled'
                        : ticket.status === 'under_loading'
                        ? 'On Seq 1'
                        : `#${queue.queuePosition} of ${queue.totalActiveAtGate}`}
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-[#D1DBE5] p-3.5">
                  <span className="text-[11px] font-bold text-[#5B738B] block">12-Hour Validity Left</span>
                  <div className="mt-1 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#0A6ED1] shrink-0" />
                    <span className="text-base sm:text-lg font-black text-[#0854A0] tabular-nums">
                      {formatRemainingDuration(remainingMs)}
                    </span>
                  </div>
                </div>
              </div>

              {queue.currentlyLoadingTruck && ticket.status !== 'under_loading' && ticket.status !== 'completed' && (
                <div className="text-xs text-[#354A5F] bg-white/80 border border-[#D1DBE5] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Currently loading at <strong>{queue.gateNumber}</strong>:{' '}
                    <strong className="text-[#1C2833] tabular-nums">{queue.currentlyLoadingTruck}</strong>
                  </span>
                  <span className="text-[#5B738B] tabular-nums">
                    Expires: {formatClockTimestamp(result.expiresAt)}
                  </span>
                </div>
              )}
            </section>

            {/* 4-Step Loading Progress + Slip Details Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
              {/* Loading Timeline */}
              <section className="lg:col-span-2 bg-white rounded-2xl border border-[#D1DBE5] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#E5ECF4] pb-3">
                  <h3 className="text-sm font-extrabold text-[#1C2833]">Loading Progress</h3>
                  <span className="text-xs text-[#5B738B] tabular-nums">Daily Seq #{ticket.sequenceNumber}</span>
                </div>

                <ol className="space-y-3.5">
                  {timelineSteps.map((step, idx) => {
                    const isDone = ticket.status === 'completed' ? true : idx < statusMeta.stepIndex;
                    const isCurrent = ticket.status !== 'cancelled' && ticket.status !== 'completed' && idx === statusMeta.stepIndex;
                    return (
                      <li key={step.label} className="flex items-start gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 border ${
                            isDone
                              ? 'bg-[#107E3E] text-white border-[#107E3E]'
                              : isCurrent
                              ? 'bg-[#0A6ED1] text-white border-[#0A6ED1]'
                              : 'bg-[#F3F6FA] text-[#5B738B] border-[#BCC8D4]'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-bold ${
                              isDone || isCurrent ? 'text-[#1C2833]' : 'text-[#5B738B]'
                            }`}
                          >
                            {step.label}
                          </p>
                          <p className="text-xs text-[#5B738B] tabular-nums">{step.time}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>

              {/* Vehicle & Slip Information */}
              <section className="lg:col-span-3 bg-white rounded-2xl border border-[#D1DBE5] p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#E5ECF4] pb-3">
                  <h3 className="text-sm font-extrabold text-[#1C2833]">Gate Ticket &amp; Slip Details</h3>
                  <span className="text-xs text-[#5B738B] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#0A6ED1]" />
                    <span>{ticket.hasLoadingSlip ? 'Slip Prepared' : 'Slip Pending'}</span>
                  </span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Driver Name</dt>
                    <dd className="font-extrabold text-[#1C2833] mt-0.5">{ticket.driverName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Truck / Vehicle Number</dt>
                    <dd className="font-extrabold text-[#1C2833] mt-0.5 tabular-nums">{ticket.truckNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Ticket Number</dt>
                    <dd className="font-bold text-[#0854A0] mt-0.5 tabular-nums">{ticket.ticketNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Delivery Note No.</dt>
                    <dd className="font-bold text-[#1C2833] mt-0.5 tabular-nums">{ticket.delNoteNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Registered Mobile</dt>
                    <dd className="font-semibold text-[#1C2833] mt-0.5 tabular-nums">{ticket.driverPhone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Destination Place</dt>
                    <dd className="font-semibold text-[#1C2833] mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#5B738B] shrink-0" />
                      <span>{ticket.destinationPlace || '—'}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Ticket Generated</dt>
                    <dd className="font-semibold text-[#1C2833] mt-0.5 tabular-nums">
                      {formatClockTimestamp(ticket.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-[#5B738B]">Status Valid Until (12 Hrs)</dt>
                    <dd className="font-semibold text-[#1C2833] mt-0.5 tabular-nums">
                      {formatClockTimestamp(result.expiresAt)}
                    </dd>
                  </div>
                </dl>

                <div className="pt-3 border-t border-[#E5ECF4] flex items-center gap-2 text-xs text-[#5B738B]">
                  <ShieldCheck className="w-4 h-4 text-[#107E3E] shrink-0" />
                  <span>
                    Status lookup stays active for 12 hours from slip/ticket generation and refreshes live every 15 seconds.
                  </span>
                </div>
              </section>
            </div>

            {/* Gate Guard Scan QR Pass */}
            <LiveStatusQrCard
              statusUrl={
                typeof window !== 'undefined'
                  ? `${window.location.origin}/driver-status?truck=${encodeURIComponent(ticket.truckNumber)}`
                  : `/driver-status?truck=${encodeURIComponent(ticket.truckNumber)}`
              }
              truckNumber={ticket.truckNumber}
              gateNumber={queue.gateNumber || ticket.gateNumber}
              delNoteNumber={ticket.delNoteNumber}
              statusLabel={statusMeta.label}
            />
          </div>
        )}
      </main>
    </div>
  );
};
