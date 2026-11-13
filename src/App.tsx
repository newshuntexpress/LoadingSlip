import React, { useState, useEffect } from 'react';
import { TicketRecord, CompanySettings, TruckStatus, DriverMasterRecord } from './types';
import { StorageService, getTodayDateString, getCurrentTimeString, formatDisplayDate } from './services/storage';
import { GateQueueDashboard } from './components/GateQueueDashboard';
import { TicketTable } from './components/TicketTable';
import { NewTicketModal } from './components/NewTicketModal';
import { LoadingSlipModal } from './components/LoadingSlipModal';
import { LoadingSlipPrintView } from './components/LoadingSlipPrintView';
import { TicketPrintView } from './components/TicketPrintView';
import { WhatsAppModal } from './components/WhatsAppModal';
import { DriverMasterModal } from './components/DriverMasterModal';
import { DailyReportModal } from './components/DailyReportModal';
import { SettingsModal } from './components/SettingsModal';
import {
  Truck,
  Plus,
  Calendar,
  FileSpreadsheet,
  Users,
  Settings,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  Table as TableIcon,
  ShieldCheck,
  Building2,
  RefreshCw,
  DoorOpen,
  Undo2,
  X,
  Trash2,
} from 'lucide-react';

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [settings, setSettings] = useState<CompanySettings>(() => StorageService.getSettings());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list'>('dashboard');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [gateFilter, setGateFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [activeTicketForSlip, setActiveTicketForSlip] = useState<TicketRecord | null>(null);
  const [activeTicketForPrintSlip, setActiveTicketForPrintSlip] = useState<TicketRecord | null>(null);
  const [activeTicketForPrintTicket, setActiveTicketForPrintTicket] = useState<TicketRecord | null>(null);
  const [activeTicketForWhatsApp, setActiveTicketForWhatsApp] = useState<{
    ticket: TicketRecord;
    templateId?: string;
  } | null>(null);
  const [showDriverMasterModal, setShowDriverMasterModal] = useState(false);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Deleted Ticket Undo Toast State
  const [deletedToast, setDeletedToast] = useState<{
    ticket: TicketRecord;
    message: string;
  } | null>(null);

  // Auto-dismiss undo toast after 6 seconds
  useEffect(() => {
    if (deletedToast) {
      const timer = setTimeout(() => {
        setDeletedToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [deletedToast]);

  // Load tickets on mount & reload when storage changes
  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setTickets(StorageService.getTickets());
    setSettings(StorageService.getSettings());
  };

  // Filtered tickets sorted by sequence number ascending (#1, #2, #3, ...)
  const dayTickets = tickets
    .filter((t) => t.date === selectedDate)
    .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

  const filteredTickets = dayTickets.filter((t) => {
    const matchesSearch =
      t.truckNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.driverPhone.includes(searchQuery) ||
      t.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.destinationPlace?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.loadingSlip?.delNoteNumber?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesGate = gateFilter === 'ALL' || t.gateNumber === gateFilter;
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

    return matchesSearch && matchesGate && matchesStatus;
  });

  // Action: Call Truck to Gate
  const handleCallTruck = (ticket: TicketRecord) => {
    const updated = StorageService.updateTicket(ticket.id, {
      status: 'called',
      timeCalled: getCurrentTimeString(),
    });
    if (updated) {
      loadData();
      // Prompt user to send WhatsApp to driver
      setActiveTicketForWhatsApp({ ticket: updated, templateId: 'gate_call' });
    }
  };

  // Action: Start Loading at Gate
  const handleStartLoading = (ticket: TicketRecord) => {
    const updated = StorageService.updateTicket(ticket.id, {
      status: 'under_loading',
      timeLoadingStarted: getCurrentTimeString(),
    });
    if (updated) {
      loadData();
      // Also offer to notify driver or fill slip
      setActiveTicketForWhatsApp({ ticket: updated, templateId: 'under_loading' });
    }
  };

  // Action: Complete Loading
  const handleCompleteLoading = (ticket: TicketRecord) => {
    // If loading slip doesn't exist, open slip modal first
    if (!ticket.loadingSlip) {
      setActiveTicketForSlip(ticket);
      return;
    }

    const updated = StorageService.updateTicket(ticket.id, {
      status: 'completed',
      timeCompleted: getCurrentTimeString(),
    });
    if (updated) {
      loadData();
      setActiveTicketForWhatsApp({ ticket: updated, templateId: 'completed_dispatch' });
    }
  };

  // Quick Status change from dropdown
  const handleStatusChange = (ticket: TicketRecord, newStatus: TruckStatus) => {
    const updates: Partial<TicketRecord> = { status: newStatus };
    if (newStatus === 'called' && !ticket.timeCalled) updates.timeCalled = getCurrentTimeString();
    if (newStatus === 'under_loading' && !ticket.timeLoadingStarted) updates.timeLoadingStarted = getCurrentTimeString();
    if (newStatus === 'completed' && !ticket.timeCompleted) updates.timeCompleted = getCurrentTimeString();

    StorageService.updateTicket(ticket.id, updates);
    loadData();
  };

  // Save new ticket handler
  const handleSaveNewTicket = (ticket: TicketRecord, nextAction?: 'print' | 'whatsapp') => {
    setShowNewTicketModal(false);
    loadData();
    if (nextAction === 'print') {
      setActiveTicketForPrintTicket(ticket);
    } else if (nextAction === 'whatsapp') {
      setActiveTicketForWhatsApp({ ticket, templateId: 'token_generated' });
    }
  };

  // Save loading slip handler
  const handleSaveLoadingSlip = (updatedTicket: TicketRecord, openPrintDirectly?: boolean) => {
    StorageService.updateTicket(updatedTicket.id, updatedTicket);
    setActiveTicketForSlip(null);
    loadData();

    if (openPrintDirectly) {
      setActiveTicketForPrintSlip(updatedTicket);
    }
  };

  // Delete ticket - Directly removes ticket and triggers undo toast (no iframe-blocked confirm dialog)
  const handleDeleteTicket = (id: string) => {
    const ticketToDelete = tickets.find((t) => t.id === id);
    if (!ticketToDelete) return;

    StorageService.deleteTicket(id);
    loadData();

    setDeletedToast({
      ticket: ticketToDelete,
      message: `Deleted Ticket #${ticketToDelete.sequenceNumber} (${ticketToDelete.truckNumber} • ${ticketToDelete.ticketNumber})`,
    });
  };

  // Undo delete ticket
  const handleUndoDelete = () => {
    if (deletedToast) {
      StorageService.restoreTicket(deletedToast.ticket);
      loadData();
      setDeletedToast(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans flex flex-col">
      {/* Top Banner Navigation Header */}
      <header className="bg-neutral-900 text-white shadow-xl sticky top-0 z-40 border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Company Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-wide uppercase text-white">
                  {settings.companyName}
                </h1>
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/80 text-blue-300 border border-blue-700">
                  Gate Queue & Dispatch
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate max-w-sm sm:max-w-md">
                {settings.companySubtitle}
              </p>
            </div>
          </div>

          {/* Quick Date Selector & Utility Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Date Switcher */}
            <div className="relative flex items-center bg-neutral-800 hover:bg-neutral-750 rounded-xl border border-neutral-700 px-2.5 py-1.5 gap-2">
              <Calendar className="w-4 h-4 text-amber-400 shrink-0 pointer-events-none" />
              <span className="text-xs font-black tracking-wide text-white pointer-events-none select-none">
                {formatDisplayDate(selectedDate)}
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                onClick={(e) => {
                  try {
                    (e.currentTarget as HTMLInputElement).showPicker?.();
                  } catch {
                    // Fallback to native browser input behavior
                  }
                }}
                aria-label="Select App Date"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              {selectedDate !== getTodayDateString() && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(getTodayDateString())}
                  className="relative z-10 text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded font-bold cursor-pointer transition"
                  title="Switch to Today"
                >
                  Today
                </button>
              )}
            </div>

            {/* Driver Master */}
            <button
              onClick={() => setShowDriverMasterModal(true)}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold px-3 py-2 rounded-xl border border-neutral-700 shadow-sm transition active:scale-95 cursor-pointer"
              title="Driver & Vehicle Master Directory"
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Driver Master</span>
            </button>

            {/* Daily Report */}
            <button
              onClick={() => setShowDailyReportModal(true)}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold px-3 py-2 rounded-xl border border-neutral-700 shadow-sm transition active:scale-95 cursor-pointer"
              title="Daily Reports & Data Backup"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Daily Report</span>
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl border border-neutral-700 transition cursor-pointer"
              title="Plant Settings & Gates"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* New Ticket Button - Primary CTA */}
            <button
              onClick={() => setShowNewTicketModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-lg shadow-blue-600/30 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Gate Ticket</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex-1 w-full space-y-4">
        {/* Navigation Tabs and Search / Filter Bar */}
        <div className="bg-white p-3 rounded-2xl border border-neutral-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center bg-neutral-100 p-1 rounded-xl w-full md:w-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-blue-700" />
              <span>Live Monitor</span>
            </button>

            <button
              onClick={() => setActiveTab('list')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <TableIcon className="w-4 h-4 text-indigo-700" />
              <span>All Tickets Ledger ({dayTickets.length})</span>
            </button>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-60">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search truck, driver, ticket..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-neutral-50"
              />
            </div>

            {/* Gate Filter */}
            <select
              value={gateFilter}
              onChange={(e) => setGateFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Gates</option>
              {settings.gates.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="waiting">Waiting in Queue</option>
              <option value="called">Called to Gate</option>
              <option value="under_loading">Under Loading</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Tab 1: Live Gate Queue Dashboard */}
        {activeTab === 'dashboard' && (
          <GateQueueDashboard
            tickets={filteredTickets}
            settings={settings}
            date={selectedDate}
            onCallTruck={handleCallTruck}
            onStartLoading={handleStartLoading}
            onCompleteLoading={handleCompleteLoading}
            onOpenLoadingSlip={(t) => setActiveTicketForSlip(t)}
            onOpenWhatsApp={(t, templateId) => setActiveTicketForWhatsApp({ ticket: t, templateId })}
          />
        )}

        {/* Tab 2: All Records Table */}
        {activeTab === 'list' && (
          <TicketTable
            tickets={filteredTickets}
            onOpenLoadingSlip={(t) => setActiveTicketForSlip(t)}
            onPrintLoadingSlip={(t) => setActiveTicketForPrintSlip(t)}
            onPrintTicket={(t) => setActiveTicketForPrintTicket(t)}
            onOpenWhatsApp={(t) => setActiveTicketForWhatsApp({ ticket: t, templateId: 'gate_call' })}
            onStatusChange={handleStatusChange}
            onDeleteTicket={handleDeleteTicket}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            {settings.companyName} • Material Loading Gate Queue & 2-Copy A4 Loading Slip Manager
          </p>
          <p className="text-[11px] text-neutral-400">
            Date: {formatDisplayDate(selectedDate)} | Total Entries: {dayTickets.length} | WhatsApp Driver Alerts Active
          </p>
        </div>
      </footer>

      {/* MODALS */}
      {/* 1. New Ticket Modal */}
      {showNewTicketModal && (
        <NewTicketModal
          date={selectedDate}
          settings={settings}
          onSave={handleSaveNewTicket}
          onClose={() => setShowNewTicketModal(false)}
        />
      )}

      {/* 2. Loading Slip 8-Rows Modal */}
      {activeTicketForSlip && (
        <LoadingSlipModal
          ticket={activeTicketForSlip}
          settings={settings}
          onSave={handleSaveLoadingSlip}
          onClose={() => setActiveTicketForSlip(null)}
        />
      )}

      {/* 3. 2-Copy A4 Loading Slip Print Preview Modal */}
      {activeTicketForPrintSlip && (
        <LoadingSlipPrintView
          ticket={activeTicketForPrintSlip}
          settings={settings}
          onClose={() => setActiveTicketForPrintSlip(null)}
        />
      )}

      {/* 4. Compact Gate Token Print View */}
      {activeTicketForPrintTicket && (
        <TicketPrintView
          ticket={activeTicketForPrintTicket}
          settings={settings}
          onClose={() => setActiveTicketForPrintTicket(null)}
        />
      )}

      {/* 5. WhatsApp Message Modal */}
      {activeTicketForWhatsApp && (
        <WhatsAppModal
          ticket={activeTicketForWhatsApp.ticket}
          settings={settings}
          initialTemplateId={activeTicketForWhatsApp.templateId}
          onClose={() => setActiveTicketForWhatsApp(null)}
          onStatusUpdate={(newStatus) => {
            handleStatusChange(activeTicketForWhatsApp.ticket, newStatus);
          }}
        />
      )}

      {/* 6. Driver Master Modal */}
      {showDriverMasterModal && (
        <DriverMasterModal onClose={() => setShowDriverMasterModal(false)} />
      )}

      {/* 7. Daily Report & Export Modal */}
      {showDailyReportModal && (
        <DailyReportModal
          tickets={tickets}
          settings={settings}
          date={selectedDate}
          onClose={() => setShowDailyReportModal(false)}
          onDataRestored={loadData}
        />
      )}

      {/* 8. Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onSave={(newSettings) => {
            setSettings(newSettings);
            loadData();
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Floating Undo Notification Toast */}
      {deletedToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-neutral-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-neutral-700">
          <div className="w-7 h-7 rounded-full bg-red-950 border border-red-700/50 flex items-center justify-center shrink-0">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-xs">
            <p className="font-bold text-white">{deletedToast.message}</p>
            <p className="text-[10px] text-neutral-400">Record removed from ledger</p>
          </div>
          <button
            onClick={handleUndoDelete}
            className="flex items-center gap-1 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-xs px-3 py-1.5 rounded-xl shadow transition active:scale-95 cursor-pointer ml-2"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
          <button
            onClick={() => setDeletedToast(null)}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer ml-1"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
