import React, { useRef } from 'react';
import { TicketRecord, CompanySettings } from '../types';
import { StorageService } from '../services/storage';
import { formatSaudiPhoneNumber } from '../utils/whatsapp';
import { FileSpreadsheet, Printer, Download, Upload, X, CheckCircle2, Clock, Calendar, BarChart3 } from 'lucide-react';

interface DailyReportModalProps {
  tickets: TicketRecord[];
  settings: CompanySettings;
  date: string;
  onClose: () => void;
  onDataRestored?: () => void;
}

export const DailyReportModal: React.FC<DailyReportModalProps> = ({
  tickets,
  settings,
  date,
  onClose,
  onDataRestored,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dayTickets = tickets.filter((t) => t.date === date);

  const completed = dayTickets.filter((t) => t.status === 'completed');
  const underLoading = dayTickets.filter((t) => t.status === 'under_loading');
  const called = dayTickets.filter((t) => t.status === 'called');
  const waiting = dayTickets.filter((t) => t.status === 'waiting');

  const totalQty = dayTickets.reduce((acc, t) => acc + (t.loadingSlip?.totalQty || 0), 0);
  const totalPallets = dayTickets.reduce((acc, t) => acc + (t.loadingSlip?.totalPallets || 0), 0);
  const totalLooseRolls = dayTickets.reduce((acc, t) => acc + (t.loadingSlip?.totalLooseRolls || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    StorageService.exportToCSV(dayTickets, date);
  };

  const handleBackupDatabase = () => {
    const allData = {
      tickets: StorageService.getTickets(),
      drivers: StorageService.getDrivers(),
      settings: StorageService.getSettings(),
      defaultSettings: StorageService.getDefaultSettings(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Loading_Database_Backup_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRestoreDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.tickets) StorageService.saveTickets(json.tickets);
        if (json.drivers) StorageService.saveDrivers(json.drivers);
        if (json.defaultSettings) StorageService.saveAsDefaultSettings(json.defaultSettings);
        if (json.settings) StorageService.saveSettings(json.settings);
        if (onDataRestored) onDataRestored();
        onClose();
      } catch {
        // Invalid backup JSON ignored
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:max-w-none">
        {/* Header (Hidden in Print) */}
        <div className="print:hidden bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Daily Dispatch Report & Database Backup</h2>
              <p className="text-xs text-neutral-300">
                Daily Material Loading Summary & Reporting for {date}
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

        {/* Content */}
        <div className="daily-report-printable p-4 sm:p-6 space-y-5 max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-2">
          {/* Company Title on Print */}
          <div className="text-center pb-2 border-b-2 border-black">
            <h1 className="text-lg font-black uppercase text-neutral-900">{settings.companyName}</h1>
            <p className="text-xs text-neutral-600">{settings.address} | Ph: {settings.phone}</p>
            <div className="mt-1 inline-block bg-neutral-900 text-white text-xs font-bold px-3 py-0.5 rounded">
              DAILY MATERIAL LOADING & DISPATCH REPORT: {date}
            </div>
          </div>

          {/* Action Bar (CSV & Print & Backup) - hidden on print */}
          <div className="print:hidden flex flex-wrap items-center justify-between gap-2.5 bg-neutral-50 p-3 rounded-xl border border-neutral-200">
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export Daily CSV / Excel</span>
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Report / Save PDF</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBackupDatabase}
                className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-white border border-neutral-300 px-3 py-1.5 rounded-lg shadow-sm hover:bg-neutral-50 transition cursor-pointer"
              >
                💾 JSON Backup
              </button>

              <label className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-white border border-neutral-300 px-3 py-1.5 rounded-lg shadow-sm hover:bg-neutral-50 transition cursor-pointer flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                <span>Restore Backup</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleRestoreDatabase}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
              <span className="text-[10px] font-bold text-neutral-500 uppercase block">Total Inward Vehicles</span>
              <span className="text-2xl font-black text-neutral-900">{dayTickets.length}</span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-800 uppercase block">Completed & Dispatched</span>
              <span className="text-2xl font-black text-emerald-700">{completed.length}</span>
            </div>
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
              <span className="text-[10px] font-bold text-amber-800 uppercase block">Active / In Queue</span>
              <span className="text-2xl font-black text-amber-700">{underLoading.length + waiting.length}</span>
            </div>
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
              <span className="text-[10px] font-bold text-blue-800 uppercase block">Total Pallets & Rolls</span>
              <span className="text-base font-black text-blue-900 mt-1 block">
                {totalPallets} Pallets | {totalLooseRolls} Rolls
              </span>
            </div>
          </div>

          {/* Table of all tickets */}
          <div className="border border-black/80 rounded-lg overflow-hidden">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-neutral-200 text-black font-extrabold text-[10px] uppercase border-b border-black">
                  <th className="py-2 px-2 text-center w-8">Seq</th>
                  <th className="py-2 px-2">Ticket No</th>
                  <th className="py-2 px-2">Gate</th>
                  <th className="py-2 px-2">Truck No</th>
                  <th className="py-2 px-2">Driver & Phone</th>
                  <th className="py-2 px-2">Destination</th>
                  <th className="py-2 px-2">Del Note</th>
                  <th className="py-2 px-2 text-center">Qty / Pallet / Loose</th>
                  <th className="py-2 px-2 text-center">Status</th>
                  <th className="py-2 px-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/30 text-[11px]">
                {dayTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50">
                    <td className="py-1.5 px-2 text-center font-bold">#{t.sequenceNumber}</td>
                    <td className="py-1.5 px-2 font-extrabold">{t.ticketNumber}</td>
                    <td className="py-1.5 px-2 font-bold">{t.gateNumber}</td>
                    <td className="py-1.5 px-2 font-black">{t.truckNumber}</td>
                    <td className="py-1.5 px-2">
                      <span className="font-semibold">{t.driverName}</span>
                      <span className="text-[10px] text-neutral-600 block font-mono">{formatSaudiPhoneNumber(t.driverPhone)}</span>
                    </td>
                    <td className="py-1.5 px-2">{t.destinationPlace || '—'}</td>
                    <td className="py-1.5 px-2 font-bold text-blue-900">
                      {t.loadingSlip?.delNoteNumber || '—'}
                    </td>
                    <td className="py-1.5 px-2 text-center font-semibold">
                      {t.loadingSlip ? (
                        <span>
                          {t.loadingSlip.totalQty} Qty | {t.loadingSlip.totalPallets} P | {t.loadingSlip.totalLooseRolls} R
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-center font-bold">
                      {t.status.toUpperCase()}
                    </td>
                    <td className="py-1.5 px-2 text-[10px]">
                      {t.timeIn} {t.timeCompleted ? `-> ${t.timeCompleted}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Daily Totals Footer */}
          <div className="bg-neutral-100 p-3 rounded-lg border border-black/40 flex justify-between items-center text-xs font-bold text-neutral-800">
            <span>TOTAL DISPATCHED TODAY</span>
            <span className="text-sm font-black text-black">
              Total Quantity: {totalQty} Units | Total Pallets: {totalPallets} | Total Loose Rolls: {totalLooseRolls}
            </span>
          </div>

          {/* Signatures on print */}
          <div className="hidden print:grid grid-cols-3 gap-4 pt-8 text-center text-xs font-bold">
            <div className="border-t border-black pt-1">Security Officer</div>
            <div className="border-t border-black pt-1">Dispatch Manager</div>
            <div className="border-t border-black pt-1">Plant Head</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .daily-report-printable, .daily-report-printable * {
            visibility: visible;
          }
          .daily-report-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            padding: 10mm !important;
          }
        }
      `}</style>
    </div>
  );
};
