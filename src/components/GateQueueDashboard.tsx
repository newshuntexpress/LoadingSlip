import React from 'react';
import { TicketRecord, CompanySettings } from '../types';
import { formatSaudiPhoneNumber } from '../utils/whatsapp';
import {
  DoorOpen,
  Truck,
  Clock,
  Play,
  CheckCircle2,
  Megaphone,
  MessageSquare,
  FileText,
  ArrowRight,
  Timer,
  Activity,
} from 'lucide-react';

interface GateQueueDashboardProps {
  tickets: TicketRecord[];
  settings: CompanySettings;
  date: string;
  onCallTruck: (ticket: TicketRecord) => void;
  onStartLoading: (ticket: TicketRecord) => void;
  onCompleteLoading: (ticket: TicketRecord) => void;
  onOpenLoadingSlip: (ticket: TicketRecord) => void;
  onOpenWhatsApp: (ticket: TicketRecord, templateId?: string) => void;
  canUpdate?: boolean;
  canPrint?: boolean;
}

function extractNum(val?: string | number | null): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const match = String(val).match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

function formatAfterPalletsSummary(slip: NonNullable<TicketRecord['loadingSlip']>): string {
  const items = slip.items || [];
  let looseRolls = 0;
  let cans = 0;
  let drums = 0;
  let boards = 0;
  let otherLoose = 0;

  for (const row of items) {
    const pack = (row.pack || '').trim().toLowerCase();
    const qty = extractNum(row.qty);
    const loose = extractNum(row.looseRolls);

    if (pack === 'can' || pack === 'cans') {
      cans += loose > 0 ? loose : qty;
    } else if (pack === 'drum' || pack === 'drums') {
      drums += loose > 0 ? loose : qty;
    } else if (pack === 'board' || pack === 'boards') {
      boards += loose > 0 ? loose : qty;
    } else if (pack === 'rolls' || pack === 'roll' || pack === '') {
      looseRolls += loose;
    } else {
      otherLoose += loose;
    }
  }

  const parts: string[] = [];
  const hasPackSpecific = cans > 0 || drums > 0 || boards > 0;
  const combinedLooseRolls = looseRolls + otherLoose;

  if (combinedLooseRolls > 0 || !hasPackSpecific) {
    const lr = hasPackSpecific ? combinedLooseRolls : (slip.totalLooseRolls ?? combinedLooseRolls);
    parts.push(`${lr} Loose Rolls`);
  }
  if (cans > 0) parts.push(`${cans} ${cans === 1 ? 'Can' : 'Cans'}`);
  if (drums > 0) parts.push(`${drums} ${drums === 1 ? 'Drum' : 'Drums'}`);
  if (boards > 0) parts.push(`${boards} ${boards === 1 ? 'Board' : 'Boards'}`);

  return parts.join(' | ');
}

function parseClockTimeMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const meridiem = match[4]?.toLowerCase();

  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59 || seconds > 59) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'am' && hours === 12) hours = 0;
    else if (meridiem === 'pm' && hours !== 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes + seconds / 60;
}

function formatDurationMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '—';
  if (totalMinutes < 1) {
    const secs = Math.max(1, Math.round(totalMinutes * 60));
    return secs < 60 ? `${secs}s` : '1m';
  }
  const rounded = Math.round(totalMinutes);
  if (rounded < 60) return `${rounded}m`;
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

const GATE_HEADER_GRADIENTS = [
  'from-[#354A5F] to-[#243647]',
  'from-[#0A6ED1] to-[#0854A0]',
  'from-[#244B73] to-[#1A3654]',
  'from-[#1E5968] to-[#143D48]',
  'from-[#2C3E50] to-[#1B2836]',
];

export const GateQueueDashboard: React.FC<GateQueueDashboardProps> = ({
  tickets,
  settings,
  date,
  onCallTruck,
  onStartLoading,
  onCompleteLoading,
  onOpenLoadingSlip,
  onOpenWhatsApp,
  canUpdate = true,
  canPrint = true,
}) => {
  const dayTickets = tickets.filter((t) => t.date === date);

  const underLoadingCount = dayTickets.filter((t) => t.status === 'under_loading').length;
  const calledCount = dayTickets.filter((t) => t.status === 'called').length;
  const waitingCount = dayTickets.filter((t) => t.status === 'waiting').length;
  const totalActiveTrucks = underLoadingCount + calledCount + waitingCount;

  const processedTickets = dayTickets.filter((t) => t.status === 'completed');
  const totalProcessedToday = processedTickets.length;
  const completionRate =
    dayTickets.length > 0 ? Math.round((totalProcessedToday / dayTickets.length) * 100) : 0;

  const loadingDurationsMin: number[] = [];
  for (const ticket of processedTickets) {
    const endMin = parseClockTimeMinutes(ticket.timeCompleted);
    if (endMin === null) continue;
    const startMin = parseClockTimeMinutes(ticket.timeLoadingStarted);
    if (startMin !== null && endMin >= startMin) {
      loadingDurationsMin.push(endMin - startMin);
      continue;
    }
    const inMin = parseClockTimeMinutes(ticket.timeIn);
    if (startMin === null && inMin !== null && endMin >= inMin) {
      loadingDurationsMin.push(endMin - inMin);
    }
  }

  const avgLoadingTimeLabel =
    loadingDurationsMin.length > 0
      ? formatDurationMinutes(
          loadingDurationsMin.reduce((sum, d) => sum + d, 0) / loadingDurationsMin.length
        )
      : '—';

  return (
    <div className="space-y-4">
      {/* Compact Live Monitor Summary Bar */}
      <div className="bg-white rounded-xl border border-[#D1DBE5] shadow-xs overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#0A6ED1] via-[#354A5F] to-[#F0AB00]" />
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E3EAF2] gap-2 sm:gap-0">
          <div className="flex items-center justify-between sm:pr-4 py-1 sm:py-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#FEF7F1] text-[#E9730C] border border-[#F9C99B]">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#354A5F] uppercase tracking-wide block">
                  Total Active Trucks
                </span>
                <span className="text-[11px] text-[#5B738B]">
                  {underLoadingCount} loading · {calledCount} called · {waitingCount} waiting
                </span>
              </div>
            </div>
            <span className="text-xl font-black text-[#C25900] tabular-nums">
              {totalActiveTrucks}
            </span>
          </div>

          <div className="flex items-center justify-between sm:px-4 py-1 sm:py-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#EBF5FF] text-[#0A6ED1] border border-[#B8DCFF]">
                <Timer className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#354A5F] uppercase tracking-wide block">
                  Average Loading Time
                </span>
                <span className="text-[11px] text-[#5B738B]">
                  {loadingDurationsMin.length > 0
                    ? `Across ${loadingDurationsMin.length} timed dispatch${loadingDurationsMin.length === 1 ? '' : 'es'}`
                    : 'No completed timings yet'}
                </span>
              </div>
            </div>
            <span className="text-xl font-black text-[#0A6ED1] tabular-nums">
              {avgLoadingTimeLabel}
            </span>
          </div>

          <div className="flex items-center justify-between sm:pl-4 py-1 sm:py-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#F1FDF6] text-[#107E3E] border border-[#ABE2C2]">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#354A5F] uppercase tracking-wide block">
                  Total Trucks Processed Today
                </span>
                <span className="text-[11px] text-[#5B738B]">
                  {totalProcessedToday} of {dayTickets.length} inward ({completionRate}%)
                </span>
              </div>
            </div>
            <span className="text-xl font-black text-[#107E3E] tabular-nums">
              {totalProcessedToday}
            </span>
          </div>
        </div>
      </div>

      {/* Overview Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-[#D1DBE5] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#5B738B] uppercase tracking-wide">
              Total Vehicles Inward
            </span>
            <p className="text-2xl font-black text-[#1C2833] tabular-nums mt-0.5">{dayTickets.length}</p>
          </div>
          <div className="p-2.5 bg-[#354A5F] text-[#F0AB00] rounded-lg shadow-xs">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-[#F9C99B] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#A64B00] uppercase tracking-wide">
              Under Loading
            </span>
            <p className="text-2xl font-black text-[#E9730C] tabular-nums mt-0.5">
              {underLoadingCount}
            </p>
          </div>
          <div className="p-2.5 bg-[#FEF7F1] text-[#E9730C] border border-[#F9C99B] rounded-lg">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-[#B8DCFF] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#0854A0] uppercase tracking-wide">
              Called to Gate (Next)
            </span>
            <p className="text-2xl font-black text-[#0A6ED1] tabular-nums mt-0.5">
              {calledCount}
            </p>
          </div>
          <div className="p-2.5 bg-[#EBF5FF] text-[#0A6ED1] border border-[#B8DCFF] rounded-lg">
            <Megaphone className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-[#ABE2C2] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#0D6B34] uppercase tracking-wide">
              Completed & Dispatched
            </span>
            <p className="text-2xl font-black text-[#107E3E] tabular-nums mt-0.5">
              {totalProcessedToday}
            </p>
          </div>
          <div className="p-2.5 bg-[#F1FDF6] text-[#107E3E] border border-[#ABE2C2] rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Gate Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {settings.gates.map((gateName, gateIndex) => {
          const normGate = gateName.trim().toUpperCase();
          const gateTickets = dayTickets.filter((t) => (t.gateNumber || '').trim().toUpperCase() === normGate);
          const currentLoading = gateTickets.find((t) => t.status === 'under_loading');
          const calledTruck = gateTickets.find((t) => t.status === 'called');
          const waitingTrucks = gateTickets
            .filter((t) => t.status === 'waiting')
            .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
          const completedCount = gateTickets.filter((t) => t.status === 'completed').length;
          const gateHeaderGradient = GATE_HEADER_GRADIENTS[gateIndex % GATE_HEADER_GRADIENTS.length];

          return (
            <div
              key={gateName}
              className="bg-white rounded-xl border border-[#D1DBE5] shadow-xs overflow-hidden flex flex-col justify-between"
            >
              {/* Gate Header */}
              <div className={`bg-gradient-to-r ${gateHeaderGradient} text-white p-3.5 flex items-center justify-between border-b border-[#223242]`}>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/15 rounded-lg border border-white/15">
                    <DoorOpen className="w-5 h-5 text-[#F0AB00]" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base tracking-wide">{gateName}</h3>
                    <p className="text-[11px] text-[#DCE7F2]">
                      {currentLoading ? 'Active (Loading)' : 'Empty (Available)'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-[#B8CAE0] block">Today Done</span>
                  <span className="text-sm font-extrabold text-[#7EE2A8] tabular-nums">{completedCount} Dispatched</span>
                </div>
              </div>

              {/* Body */}
              <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                {/* 1. CURRENT UNDER LOADING TRUCK */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-black uppercase text-[#C25900] tracking-wider flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#E9730C]" />
                      Under Loading
                    </span>
                    {currentLoading && (
                      <span className="text-[10px] font-semibold text-[#5B738B]">
                        Started: {currentLoading.timeLoadingStarted || currentLoading.timeIn}
                      </span>
                    )}
                  </div>

                  {currentLoading ? (
                    <div className="bg-[#FEF7F1] border border-[#F9C99B] rounded-lg p-3 shadow-xs">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="text-base font-black text-[#1C2833] tracking-wide">
                            {currentLoading.truckNumber}
                          </p>
                          <p className="text-xs font-semibold text-[#354A5F]">
                            {currentLoading.driverName} ({formatSaudiPhoneNumber(currentLoading.driverPhone)})
                          </p>
                        </div>
                        <span className="text-[10px] font-black bg-[#F0AB00]/25 text-[#7A3800] border border-[#F0AB00]/50 px-2 py-0.5 rounded">
                          {currentLoading.ticketNumber}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#475E75] mb-2.5">
                        <span className="font-semibold text-[#1C2833]">Destination:</span> {currentLoading.destinationPlace || 'N/A'}
                        {currentLoading.loadingSlip ? (
                          <span className="ml-2 text-[#107E3E] font-bold block mt-0.5">
                            ✓ Slip Prepared ({currentLoading.loadingSlip.totalQty} Qty | {currentLoading.loadingSlip.totalPallets} Pallets | {formatAfterPalletsSummary(currentLoading.loadingSlip)})
                          </span>
                        ) : (
                          <span className="ml-2 text-[#BB0000] font-semibold block mt-0.5">! Slip pending</span>
                        )}
                      </div>

                      {/* Action buttons */}
                      {(canUpdate || canPrint) && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F9C99B]">
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => onOpenLoadingSlip(currentLoading)}
                              className="app-btn-sm w-full bg-white hover:bg-[#EFF4F9] text-[#354A5F] border border-[#BCC8D4] shadow-xs"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#0A6ED1] shrink-0" />
                              <span>Edit / Print Slip</span>
                            </button>
                          )}
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => onCompleteLoading(currentLoading)}
                              className="app-btn-sm w-full bg-[#107E3E] hover:bg-[#0D6B34] text-white shadow-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Complete</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-[#F7F9FB] border border-dashed border-[#BCC8D4] rounded-lg p-3 text-center text-xs text-[#5B738B]">
                      No vehicle currently under loading at this gate.
                    </div>
                  )}
                </div>

                {/* 2. CALLED TO GATE (AGLA NUMBER) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-black uppercase text-[#0A6ED1] tracking-wider flex items-center gap-1">
                      <Megaphone className="w-3.5 h-3.5" />
                      Next In Queue (Called)
                    </span>
                  </div>

                  {calledTruck ? (
                    <div className="bg-[#EBF5FF] border border-[#B8DCFF] rounded-lg p-2.5">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="text-sm font-extrabold text-[#1C2833]">{calledTruck.truckNumber}</p>
                          <p className="text-[11px] text-[#354A5F]">
                            {calledTruck.driverName} ({formatSaudiPhoneNumber(calledTruck.driverPhone)})
                          </p>
                        </div>
                        <span className="text-[10px] font-bold bg-[#0A6ED1] text-white px-1.5 py-0.5 rounded">
                          At Gate
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => onStartLoading(calledTruck)}
                            className="app-btn-sm flex-1 bg-[#0A6ED1] hover:bg-[#085CAF] text-white shadow-xs"
                          >
                            <Play className="w-3.5 h-3.5 shrink-0" />
                            <span>Start Loading</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenWhatsApp(calledTruck, 'gate_call')}
                          className="app-btn-sm bg-[#107E3E] hover:bg-[#0D6B34] text-white shadow-xs"
                          title="WhatsApp Reminder"
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                          <span>Alert</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#F7F9FB] border border-[#E3EAF2] rounded-lg p-2 text-center text-[11px] text-[#7A8FA3]">
                      No vehicle called to this gate
                    </div>
                  )}
                </div>

                {/* 3. WAITING QUEUE */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase text-[#5B738B]">
                      Waiting Queue ({waitingTrucks.length} Trucks)
                    </span>
                  </div>

                  {waitingTrucks.length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {waitingTrucks.map((truck, idx) => (
                        <div
                          key={truck.id}
                          className="bg-[#F7F9FB] hover:bg-[#EFF4F9] border border-[#D1DBE5] rounded-lg p-2 flex items-center justify-between text-xs transition"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#354A5F] text-white font-black text-[10px] flex items-center justify-center tabular-nums">
                              #{idx + 1}
                            </span>
                            <div>
                              <p className="font-extrabold text-[#1C2833] text-[11px]">{truck.truckNumber}</p>
                              <p className="text-[10px] text-[#5B738B] truncate max-w-[100px]">{truck.driverName}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenWhatsApp(truck, 'gate_call')}
                              className="app-btn-sm !px-2 bg-[#F1FDF6] hover:bg-[#E0F9EA] text-[#107E3E] border border-[#ABE2C2]"
                              title="Send WhatsApp Alert"
                            >
                              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                            </button>
                            {canUpdate && (
                              <button
                                type="button"
                                onClick={() => onCallTruck(truck)}
                                className="app-btn-sm bg-[#0A6ED1] hover:bg-[#085CAF] text-white shadow-xs"
                              >
                                <span>Call</span>
                                <ArrowRight className="w-3 h-3 shrink-0" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#7A8FA3] italic text-center py-1">Queue is empty</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
