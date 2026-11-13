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
  AlertCircle,
  ArrowRight,
  PhoneCall,
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
}

export const GateQueueDashboard: React.FC<GateQueueDashboardProps> = ({
  tickets,
  settings,
  date,
  onCallTruck,
  onStartLoading,
  onCompleteLoading,
  onOpenLoadingSlip,
  onOpenWhatsApp,
}) => {
  const dayTickets = tickets.filter((t) => t.date === date);

  return (
    <div className="space-y-4">
      {/* Overview Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-2xl border border-neutral-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
              Total Vehicles Inward
            </span>
            <p className="text-2xl font-black text-neutral-800">{dayTickets.length}</p>
          </div>
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-neutral-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
              Under Loading
            </span>
            <p className="text-2xl font-black text-amber-600">
              {dayTickets.filter((t) => t.status === 'under_loading').length}
            </p>
          </div>
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-neutral-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
              Called to Gate (Next)
            </span>
            <p className="text-2xl font-black text-indigo-600">
              {dayTickets.filter((t) => t.status === 'called').length}
            </p>
          </div>
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Megaphone className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-neutral-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
              Completed & Dispatched
            </span>
            <p className="text-2xl font-black text-emerald-600">
              {dayTickets.filter((t) => t.status === 'completed').length}
            </p>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Gate Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {settings.gates.map((gateName) => {
          const gateTickets = dayTickets.filter((t) => t.gateNumber === gateName);
          const currentLoading = gateTickets.find((t) => t.status === 'under_loading');
          const calledTruck = gateTickets.find((t) => t.status === 'called');
          const waitingTrucks = gateTickets
            .filter((t) => t.status === 'waiting')
            .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
          const completedCount = gateTickets.filter((t) => t.status === 'completed').length;

          return (
            <div
              key={gateName}
              className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col justify-between"
            >
              {/* Gate Header */}
              <div className="bg-gradient-to-r from-neutral-800 to-neutral-900 text-white p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/20 rounded-lg">
                    <DoorOpen className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base tracking-wide">{gateName}</h3>
                    <p className="text-[11px] text-neutral-300">
                      {currentLoading ? 'Active (Loading)' : 'Empty (Available)'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block">Today Done</span>
                  <span className="text-sm font-extrabold text-emerald-400">{completedCount} Dispatched</span>
                </div>
              </div>

              {/* Body */}
              <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                {/* 1. CURRENT UNDER LOADING TRUCK */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-black uppercase text-amber-700 tracking-wider flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Under Loading
                    </span>
                    {currentLoading && (
                      <span className="text-[10px] font-semibold text-neutral-500">
                        Started: {currentLoading.timeLoadingStarted || currentLoading.timeIn}
                      </span>
                    )}
                  </div>

                  {currentLoading ? (
                    <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="text-base font-black text-neutral-900 tracking-wide">
                            {currentLoading.truckNumber}
                          </p>
                          <p className="text-xs font-semibold text-neutral-700">
                            {currentLoading.driverName} ({formatSaudiPhoneNumber(currentLoading.driverPhone)})
                          </p>
                        </div>
                        <span className="text-[10px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                          {currentLoading.ticketNumber}
                        </span>
                      </div>

                      <div className="text-[11px] text-neutral-600 mb-2.5">
                        <span className="font-semibold text-neutral-800">Destination:</span> {currentLoading.destinationPlace || 'N/A'}
                        {currentLoading.loadingSlip ? (
                          <span className="ml-2 text-emerald-800 font-bold block mt-0.5">
                            ✓ Slip Prepared ({currentLoading.loadingSlip.totalQty} Qty | {currentLoading.loadingSlip.totalPallets} Pallets)
                          </span>
                        ) : (
                          <span className="ml-2 text-red-600 font-semibold block mt-0.5">! Slip pending</span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-amber-200">
                        <button
                          onClick={() => onOpenLoadingSlip(currentLoading)}
                          className="flex items-center justify-center gap-1 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 rounded-lg py-1.5 text-xs font-semibold shadow-sm transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-700" />
                          <span>Edit / Print Slip</span>
                        </button>
                        <button
                          onClick={() => onCompleteLoading(currentLoading)}
                          className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-1.5 text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-neutral-50 border border-dashed border-neutral-300 rounded-xl p-3 text-center text-xs text-neutral-500">
                      No vehicle currently under loading at this gate.
                    </div>
                  )}
                </div>

                {/* 2. CALLED TO GATE (AGLA NUMBER) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-black uppercase text-indigo-700 tracking-wider flex items-center gap-1">
                      <Megaphone className="w-3.5 h-3.5" />
                      Next In Queue (Called)
                    </span>
                  </div>

                  {calledTruck ? (
                    <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-2.5">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="text-sm font-extrabold text-neutral-900">{calledTruck.truckNumber}</p>
                          <p className="text-[11px] text-neutral-700">
                            {calledTruck.driverName} ({formatSaudiPhoneNumber(calledTruck.driverPhone)})
                          </p>
                        </div>
                        <span className="text-[10px] font-bold bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded">
                          At Gate
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-2">
                        <button
                          onClick={() => onStartLoading(calledTruck)}
                          className="flex-1 flex items-center justify-center gap-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg py-1.5 text-xs font-bold transition active:scale-95 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Loading</span>
                        </button>
                        <button
                          onClick={() => onOpenWhatsApp(calledTruck, 'gate_call')}
                          className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition cursor-pointer"
                          title="WhatsApp Reminder"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-neutral-50/60 border border-neutral-200 rounded-lg p-2 text-center text-[11px] text-neutral-400">
                      No vehicle called to this gate
                    </div>
                  )}
                </div>

                {/* 3. WAITING QUEUE */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase text-neutral-600">
                      Waiting Queue ({waitingTrucks.length} Trucks)
                    </span>
                  </div>

                  {waitingTrucks.length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {waitingTrucks.map((truck, idx) => (
                        <div
                          key={truck.id}
                          className="bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl p-2 flex items-center justify-between text-xs transition"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-800 font-black text-[10px] flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <div>
                              <p className="font-extrabold text-neutral-900 text-[11px]">{truck.truckNumber}</p>
                              <p className="text-[10px] text-neutral-500 truncate max-w-[100px]">{truck.driverName}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onOpenWhatsApp(truck, 'gate_call')}
                              className="p-1 text-emerald-700 hover:bg-emerald-100 rounded transition cursor-pointer"
                              title="Send WhatsApp Alert"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onCallTruck(truck)}
                              className="flex items-center gap-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg transition active:scale-95 cursor-pointer"
                            >
                              <span>Call</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-400 italic text-center py-1">Queue is empty</p>
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
