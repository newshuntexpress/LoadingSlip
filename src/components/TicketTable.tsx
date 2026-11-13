import React, { useState } from 'react';
import { TicketRecord, TruckStatus } from '../types';
import { formatSaudiPhoneNumber } from '../utils/whatsapp';
import {
  FileText,
  Printer,
  MessageSquare,
  CheckCircle2,
  Clock,
  Play,
  Megaphone,
  MoreVertical,
  Trash2,
  Edit,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';

interface TicketTableProps {
  tickets: TicketRecord[];
  onOpenLoadingSlip: (ticket: TicketRecord) => void;
  onPrintLoadingSlip: (ticket: TicketRecord) => void;
  onPrintTicket: (ticket: TicketRecord) => void;
  onOpenWhatsApp: (ticket: TicketRecord) => void;
  onStatusChange: (ticket: TicketRecord, newStatus: TruckStatus) => void;
  onDeleteTicket: (ticketId: string) => void;
}

export const TicketTable: React.FC<TicketTableProps> = ({
  tickets,
  onOpenLoadingSlip,
  onPrintLoadingSlip,
  onPrintTicket,
  onOpenWhatsApp,
  onStatusChange,
  onDeleteTicket,
}) => {
  // Sequence Number Sorting: Ascending (1, 2, 3...) by default
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const sortedTickets = [...tickets].sort((a, b) => {
    const seqA = a.sequenceNumber || 0;
    const seqB = b.sequenceNumber || 0;
    return sortAsc ? seqA - seqB : seqB - seqA;
  });

  const getStatusBadge = (status: TruckStatus) => {
    switch (status) {
      case 'waiting':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-300">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
            Waiting in Queue
          </span>
        );
      case 'called':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
            <Megaphone className="w-3 h-3 text-indigo-600" />
            Called to Gate
          </span>
        );
      case 'under_loading':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
            <Clock className="w-3 h-3 text-amber-600" />
            Under Loading
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center text-neutral-500 shadow-sm">
        <p className="text-base font-bold text-neutral-700 mb-1">No vehicle loading records found for this date</p>
        <p className="text-xs text-neutral-500">
          Click "+ New Gate Ticket" to register a new loading vehicle.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-neutral-900 text-white text-[11px] uppercase tracking-wider font-bold">
              <th
                onClick={() => setSortAsc(!sortAsc)}
                className="py-3 px-3 text-center w-16 cursor-pointer hover:bg-neutral-800 transition select-none"
                title="Click to toggle Ascending (1, 2, 3...) or Descending"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Seq</span>
                  <span className="text-[10px] text-amber-400 font-mono font-bold">
                    {sortAsc ? '▲ #1' : '▼ #9'}
                  </span>
                </div>
              </th>
              <th className="py-3 px-3">Ticket Number</th>
              <th className="py-3 px-3">Gate & Pos</th>
              <th className="py-3 px-3">Vehicle & Driver</th>
              <th className="py-3 px-3">Destination</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-3">Loading Slip Summary</th>
              <th className="py-3 px-3">Timestamps</th>
              <th className="py-3 px-3 text-center min-w-[280px]">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 font-sans">
            {sortedTickets.map((t) => {
              const slip = t.loadingSlip;
              return (
                <tr
                  key={t.id}
                  className={`hover:bg-blue-50/40 transition ${
                    t.status === 'under_loading'
                      ? 'bg-amber-50/30'
                      : t.status === 'called'
                      ? 'bg-indigo-50/30'
                      : ''
                  }`}
                >
                  {/* Daily Sequence*/ }
                  <td className="py-3 px-3 text-center font-black text-sm text-neutral-700">
                    #{t.sequenceNumber}
                  </td>

                  {/* Ticket Number*/ }
                  <td className="py-3 px-3">
                    <span className="font-extrabold text-blue-900 block">{t.ticketNumber}</span>
                    <button
                      onClick={() => onPrintTicket(t)}
                      className="text-[10px] text-neutral-500 hover:text-blue-700 font-medium inline-flex items-center gap-0.5 cursor-pointer mt-0.5"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print Token</span>
                    </button>
                  </td>

                  {/* Gate Number & Gate Sequence Number*/ }
                  <td className="py-3 px-3">
                    <div className="inline-block bg-neutral-100 border border-neutral-300 px-2 py-0.5 rounded-lg text-neutral-800 font-black text-xs">
                      {t.gateNumber}
                    </div>
                    <p className="text-[11px] font-bold text-purple-700 mt-0.5">
                      {t.status === 'under_loading'
                        ? '🟢 In Progress'
                        : `Gate Pos: ${t.gateSequenceNumber}`}
                    </p>
                  </td>

                  {/* Truck & Driver */ }
                  <td className="py-3 px-3">
                    <p className="font-black text-neutral-900 tracking-wide text-xs">{t.truckNumber}</p>
                    <p className="text-[11px] text-neutral-600 font-medium">{t.driverName}</p>
                    <p className="text-[10.5px] text-emerald-800 font-mono font-bold flex items-center gap-1">
                      <span>{formatSaudiPhoneNumber(t.driverPhone)}</span>
                    </p>
                  </td>

                  {/* Destination */}
                  <td className="py-3 px-3">
                    <span className="font-semibold text-neutral-800 block text-[11px]">
                      {t.destinationPlace || 'N/A'}
                    </span>
                    <span className="text-[10px] text-neutral-500 truncate max-w-[120px] block">
                      {t.transporterName || 'Self Transport'}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {getStatusBadge(t.status)}
                      {/* Quick Status Toggle Dropdown */}
                      <select
                        value={t.status}
                        onChange={(e) => onStatusChange(t, e.target.value as TruckStatus)}
                        className="text-[10px] py-0.5 px-1.5 rounded border border-neutral-300 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="waiting">Waiting</option>
                        <option value="called">Called</option>
                        <option value="under_loading">Under Loading</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </td>

                  {/* Loading Slip details */}
                  <td className="py-3 px-3">
                    {slip || t.delNoteNumber ? (
                      <div className="space-y-0.5">
                        <span className="font-bold text-neutral-900 text-[11px] block font-mono">
                          {slip?.delNoteNumber || t.delNoteNumber}
                        </span>
                        {slip && (slip.totalQty > 0 || slip.totalPallets > 0) ? (
                          <div className="text-[10px] text-neutral-600 flex gap-1.5 font-medium">
                            <span className="bg-blue-50 text-blue-800 px-1 rounded font-bold">
                              {slip.totalQty} Qty
                            </span>
                            <span className="bg-amber-50 text-amber-900 px-1 rounded font-bold">
                              {slip.totalPallets} Pallets
                            </span>
                            <span className="bg-indigo-50 text-indigo-900 px-1 rounded font-bold">
                              {slip.totalLooseRolls} Loose
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-blue-600 font-semibold block">DN Assigned</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-neutral-400 italic">No slip created</span>
                    )}
                  </td>

                  {/* Time */}
                  <td className="py-3 px-3 text-[11px]">
                    <div className="text-neutral-600">
                      <span className="font-semibold text-neutral-800">In:</span> {t.timeIn}
                    </div>
                    {t.timeCompleted && (
                      <div className="text-emerald-700 font-bold">
                        <span>Done:</span> {t.timeCompleted}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {/* WhatsApp Button */}
                      <button
                        onClick={() => onOpenWhatsApp(t)}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
                        title="Send WhatsApp Alert to Driver"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>

                      {/* Loading Slip Button */}
                      <button
                        onClick={() => onOpenLoadingSlip(t)}
                        className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
                        title="Generate or edit 8-row loading slip"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{slip ? 'Edit Slip' : 'Create Slip'}</span>
                      </button>

                      {/* Print 2-Copy A4 Slip */}
                      {(slip || t.delNoteNumber) && (
                        <button
                          onClick={() => onPrintLoadingSlip(t)}
                          className="flex items-center gap-1 bg-neutral-800 hover:bg-neutral-900 text-white px-2 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
                          title="Print 2-Copy A4 Single Sheet Preview"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-300" />
                          <span>Print Slip</span>
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTicket(t.id);
                        }}
                        className="flex items-center gap-1 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 hover:border-red-600 px-2 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
                        title={`Delete Ticket #${t.sequenceNumber} (${t.truckNumber})`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
