import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TicketRecord, CompanySettings, TruckStatus, AuthUser, LoadingAlertNotification } from './types';
import {
  StorageService,
  getTodayDateString,
  getCurrentTimeString,
  formatDisplayDate,
} from './services/storage';
import { ApiClient, ApiError, setAuthErrorHandlers, setCsrfToken, setSessionToken } from './services/api';
import { GateQueueDashboard } from './components/GateQueueDashboard';
import { TicketTable } from './components/TicketTable';
import { ForkliftLoadingView } from './components/ForkliftLoadingView';
import { NewTicketModal } from './components/NewTicketModal';
import { LoadingSlipModal } from './components/LoadingSlipModal';
import { LoadingSlipPrintView } from './components/LoadingSlipPrintView';
import { TicketPrintView } from './components/TicketPrintView';
import { WhatsAppModal } from './components/WhatsAppModal';
import { DriverMasterModal } from './components/DriverMasterModal';
import { DailyReportModal } from './components/DailyReportModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginView } from './components/LoginView';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import {
  Plus,
  Calendar,
  FileSpreadsheet,
  Users,
  Settings,
  Search,
  LayoutDashboard,
  Table as TableIcon,
  Building2,
  Undo2,
  X,
  Trash2,
  Shield,
  KeyRound,
  LogOut,
  AlertCircle,
  Loader2,
  User as UserIcon,
  PackageCheck,
  CheckCircle2,
  Printer,
} from 'lucide-react';

export default function App() {
  // Authentication & Session State
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);

  // App Data State
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState<LoadingAlertNotification[]>([]);
  const [settings, setSettings] = useState<CompanySettings>(() => StorageService.getSettings());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'forklift'>('dashboard');
  const [appError, setAppError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [gateFilter, setGateFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals State
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

  const migratedOnceRef = useRef(false);

  const isAdmin = currentUser?.roleName === 'admin';
  const isForkliftOperator = currentUser?.roleName === 'forklift_operator';
  const hasPerm = useCallback(
    (perm: string): boolean => {
      if (!currentUser) return false;
      if (currentUser.roleName === 'admin') return true;
      return currentUser.permissions.includes(perm);
    },
    [currentUser]
  );

  // Clear all sensitive state immediately upon logout or unauthorized error
  const clearSessionState = useCallback(() => {
    setCsrfToken(null);
    setSessionToken(null);
    StorageService.clearCache();
    setCurrentUser(null);
    setActiveTab('dashboard');
    setTickets([]);
    setLoadingAlerts([]);
    setShowNewTicketModal(false);
    setActiveTicketForSlip(null);
    setActiveTicketForPrintSlip(null);
    setActiveTicketForPrintTicket(null);
    setActiveTicketForWhatsApp(null);
    setShowDriverMasterModal(false);
    setShowDailyReportModal(false);
    setShowSettingsModal(false);
    setShowAdminModal(false);
    setShowChangePasswordModal(false);
    setDeletedToast(null);
  }, []);

  // Load shared application data from authenticated backend
  const loadData = useCallback(async () => {
    const forkliftOnly = currentUser?.roleName === 'forklift_operator';
    try {
      const [ticketsRes, driversRes, settingsRes, alertsRes] = await Promise.all([
        ApiClient.getTickets(),
        forkliftOnly ? Promise.resolve([]) : ApiClient.getDrivers(),
        ApiClient.getSettings(),
        forkliftOnly
          ? Promise.resolve([] as LoadingAlertNotification[])
          : ApiClient.getLoadingAlerts().catch(() => [] as LoadingAlertNotification[]),
      ]);
      StorageService.hydrateFromServer({
        tickets: ticketsRes,
        drivers: driversRes,
        settings: settingsRes.settings,
        defaultSettings: settingsRes.defaultSettings,
      });
      setTickets(ticketsRes);
      setLoadingAlerts(alertsRes);
      setSettings(StorageService.getSettings());
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 403 && err.code === 'PASSWORD_CHANGE_REQUIRED') {
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        return;
      }
      setAppError(err?.message || 'Unable to synchronize records from server.');
    }
  }, [currentUser?.roleName]);

  // Register global API auth interceptors
  useEffect(() => {
    setAuthErrorHandlers({
      onUnauthorized: () => {
        clearSessionState();
        setNeedsSetup(false);
      },
      onPasswordChangeRequired: () => {
        setCurrentUser((prev) => (prev ? { ...prev, mustChangePassword: true } : prev));
      },
    });
  }, [clearSessionState]);

  // Check session on initial boot
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await ApiClient.getAuthStatus();
        if (!active) return;
        setNeedsSetup(status.needsSetup);
        if (status.authenticated && status.user) {
          setCurrentUser(status.user);
          if (status.user.roleName === 'forklift_operator') {
            setActiveTab('forklift');
          }
        } else {
          setCurrentUser(null);
        }
      } catch {
        if (active) setCurrentUser(null);
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Redirect & lock Forklift Operators strictly inside the Forklift Operator Section
  useEffect(() => {
    if (!currentUser || currentUser.mustChangePassword) return;
    if (currentUser.roleName === 'forklift_operator') {
      setActiveTab('forklift');
      setSelectedDate(getTodayDateString());
      setShowNewTicketModal(false);
      setActiveTicketForSlip(null);
      setActiveTicketForPrintSlip(null);
      setActiveTicketForPrintTicket(null);
      setActiveTicketForWhatsApp(null);
      setShowDriverMasterModal(false);
      setShowDailyReportModal(false);
      setShowSettingsModal(false);
      setShowAdminModal(false);
      if (window.location.pathname !== '/' || window.location.hash !== '#forklift') {
        window.history.replaceState(null, '', '/#forklift');
      }
    }
  }, [currentUser]);

  // Hydrate server data once authenticated and password-compliant, + 15s multi-user live polling
  useEffect(() => {
    if (!currentUser || currentUser.mustChangePassword) return;

    let cancelled = false;
    (async () => {
      if (!migratedOnceRef.current && currentUser.roleName !== 'forklift_operator') {
        migratedOnceRef.current = true;
        await ApiClient.migrateLegacyLocalStorageIfNeeded();
      }
      if (!cancelled) {
        await loadData();
      }
    })();

    const pollInterval = setInterval(() => {
      loadData();
    }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser, loadData]);

  // Auto-dismiss undo toast after 6 seconds
  useEffect(() => {
    if (deletedToast) {
      const timer = setTimeout(() => {
        setDeletedToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [deletedToast]);

  const handleLogout = async () => {
    await ApiClient.logout();
    clearSessionState();
    setNeedsSetup(false);
    if (window.location.pathname !== '/' || window.location.hash) {
      window.history.replaceState(null, '', '/');
    }
  };

  // Show boot spinner while checking session cookie
  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white gap-3 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm font-semibold text-neutral-300">Verifying secure session...</p>
      </div>
    );
  }

  // Gate 1: Unauthenticated -> Login Page (or First-Time Admin Setup)
  if (!currentUser) {
    return (
      <LoginView
        needsSetup={needsSetup}
        onAuthenticated={(user) => {
          setNeedsSetup(false);
          setAppError(null);
          setCurrentUser(user);
          setActiveTab(user.roleName === 'forklift_operator' ? 'forklift' : 'dashboard');
        }}
      />
    );
  }

  // Gate 2: Temporary password must be changed before viewing any app data
  if (currentUser.mustChangePassword) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <ChangePasswordModal
          user={currentUser}
          forced
          onSuccess={(updatedUser) => {
            setCurrentUser(updatedUser);
            setActiveTab(updatedUser.roleName === 'forklift_operator' ? 'forklift' : 'dashboard');
          }}
          onLogout={handleLogout}
        />
      </div>
    );
  }

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
  const handleCallTruck = async (ticket: TicketRecord) => {
    setAppError(null);
    try {
      const updated = await ApiClient.updateTicket(ticket.id, {
        status: 'called',
        timeCalled: getCurrentTimeString(),
        version: ticket.version,
      });
      await loadData();
      setActiveTicketForWhatsApp({ ticket: updated, templateId: 'gate_call' });
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to call truck.');
    }
  };

  // Action: Start Loading at Gate
  const handleStartLoading = async (ticket: TicketRecord) => {
    setAppError(null);
    try {
      const updated = await ApiClient.updateTicket(ticket.id, {
        status: 'under_loading',
        timeLoadingStarted: getCurrentTimeString(),
        version: ticket.version,
      });
      await loadData();
      setActiveTicketForWhatsApp({ ticket: updated, templateId: 'under_loading' });
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to start loading.');
    }
  };

  // Action: Complete Loading
  const handleCompleteLoading = async (ticket: TicketRecord) => {
    if (!ticket.loadingSlip) {
      setActiveTicketForSlip(ticket);
      return;
    }

    setAppError(null);
    try {
      const updated = await ApiClient.updateTicket(ticket.id, {
        status: 'completed',
        timeCompleted: getCurrentTimeString(),
        version: ticket.version,
      });
      await loadData();
      setActiveTicketForWhatsApp({ ticket: updated, templateId: 'completed_dispatch' });
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to complete loading.');
    }
  };

  // Quick Status change from dropdown
  const handleStatusChange = async (ticket: TicketRecord, newStatus: TruckStatus) => {
    const updates: Partial<TicketRecord> = { status: newStatus, version: ticket.version };
    if (newStatus === 'called' && !ticket.timeCalled) updates.timeCalled = getCurrentTimeString();
    if (newStatus === 'under_loading' && !ticket.timeLoadingStarted) updates.timeLoadingStarted = getCurrentTimeString();
    if (newStatus === 'completed' && !ticket.timeCompleted) updates.timeCompleted = getCurrentTimeString();

    setAppError(null);
    try {
      await ApiClient.updateTicket(ticket.id, updates);
      await loadData();
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to update status.');
    }
  };

  // Save new ticket handler
  const handleSaveNewTicket = async (ticket: TicketRecord, nextAction?: 'print' | 'whatsapp') => {
    setShowNewTicketModal(false);
    await loadData();
    if (nextAction === 'print') {
      setActiveTicketForPrintTicket(ticket);
    } else if (nextAction === 'whatsapp') {
      setActiveTicketForWhatsApp({ ticket, templateId: 'token_generated' });
    }
  };

  // Save loading slip handler
  const handleSaveLoadingSlip = async (updatedTicket: TicketRecord, openPrintDirectly?: boolean) => {
    setAppError(null);
    try {
      const saved = await ApiClient.updateTicket(updatedTicket.id, updatedTicket);
      setActiveTicketForSlip(null);
      await loadData();
      if (openPrintDirectly) {
        setActiveTicketForPrintSlip(saved);
      }
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to save loading slip.');
    }
  };

  // Delete ticket - Directly removes ticket from server DB and triggers undo toast
  const handleDeleteTicket = async (id: string) => {
    const ticketToDelete = tickets.find((t) => t.id === id);
    if (!ticketToDelete) return;

    setAppError(null);
    try {
      await ApiClient.deleteTicket(id);
      await loadData();
      setDeletedToast({
        ticket: ticketToDelete,
        message: `Deleted Ticket #${ticketToDelete.sequenceNumber} (${ticketToDelete.truckNumber} • ${ticketToDelete.ticketNumber})`,
      });
    } catch (err: any) {
      setAppError(err?.message || 'Failed to delete ticket.');
    }
  };

  // Undo delete ticket
  const handleUndoDelete = async () => {
    if (!deletedToast) return;
    setAppError(null);
    try {
      await ApiClient.restoreTicket(deletedToast.ticket);
      await loadData();
      setDeletedToast(null);
    } catch (err: any) {
      setAppError(err?.message || 'Failed to restore deleted ticket.');
    }
  };

  const canCreateTickets = !isForkliftOperator && hasPerm('tickets.create');
  const canUpdateTickets = !isForkliftOperator && hasPerm('tickets.update');
  const canOperateForklift = hasPerm('forklift.operate') || (!isForkliftOperator && hasPerm('tickets.update'));
  const canDeleteTickets = !isForkliftOperator && hasPerm('tickets.delete');
  const canPrintSlips = !isForkliftOperator && hasPerm('slips.print');
  const canManageDrivers = !isForkliftOperator && hasPerm('drivers.manage');
  const canViewReports = !isForkliftOperator && hasPerm('reports.view');
  const canManageSettings = !isForkliftOperator && hasPerm('settings.manage');

  const pendingForkliftCount = dayTickets.filter(
    (t) => t.status !== 'completed' && t.status !== 'cancelled' && !t.loadingSlip?.isLocked
  ).length;

  const handleDismissAlert = async (alertId: string) => {
    setLoadingAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      await ApiClient.dismissLoadingAlert(alertId);
    } catch {
      // Best-effort dismiss
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 font-sans flex flex-col">
      {/* Top Banner Navigation Header */}
      <header className="bg-neutral-900 text-white shadow-xl sticky top-0 z-40 border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 space-y-2.5">
          {/* Upper Row: Company Brand Left + Account Badge, Admin Users, Password & Logout Right */}
          <div
            className={`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 ${
              !isForkliftOperator ? 'pb-2.5 border-b border-neutral-800/90' : ''
            }`}
          >
            {/* Logo & Company Title */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-sm sm:text-base font-black tracking-wide uppercase text-white truncate">
                    {settings.companyName}
                  </h1>
                  <span
                    className={`hidden md:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                      isForkliftOperator
                        ? 'bg-emerald-900/80 text-emerald-300 border-emerald-700'
                        : 'bg-blue-900/80 text-blue-300 border-blue-700'
                    }`}
                  >
                    {isForkliftOperator ? 'Forklift Operator Section' : 'Gate Queue & Dispatch'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 truncate max-w-xs sm:max-w-md">
                  {settings.companySubtitle}
                </p>
              </div>
            </div>

            {/* Upper-Right Account Info & Uniform Auth Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto lg:justify-end">
              <div className="flex items-center gap-2 bg-neutral-800/90 border border-neutral-700 rounded-xl h-9 px-3 shrink-0">
                <UserIcon className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                <span className="text-xs font-bold text-white truncate max-w-[140px]">
                  {currentUser.fullName}
                </span>
                <span className="text-[11px] text-neutral-400 whitespace-nowrap">
                  @{currentUser.username} • {currentUser.roleDisplayName}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAdminModal(true)}
                    className="app-btn w-full sm:w-auto sm:min-w-[120px] bg-indigo-900/85 hover:bg-indigo-800 text-indigo-100 border border-indigo-600/80 shadow-sm"
                    title="Admin Dashboard: Users, Permissions, Sessions & Audit Log"
                  >
                    <Shield className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                    <span>Admin Users</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(true)}
                  className="app-btn w-full sm:w-auto sm:min-w-[120px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 shadow-sm"
                  title="Change My Password"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>Password</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className={`app-btn w-full sm:w-auto sm:min-w-[110px] bg-red-900/70 hover:bg-red-700 text-red-100 border border-red-800/80 shadow-sm ${
                    isAdmin ? 'col-span-2 sm:col-span-1' : ''
                  }`}
                  title="Sign Out Securely"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>

          {/* Lower Toolbar Row: Date Picker & Uniform Autofit Action Buttons (Hidden for Forklift Operators) */}
          {!isForkliftOperator && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              {/* Date Switcher (Exact h-9 match) */}
              <div className="relative inline-flex items-center justify-between md:justify-start h-9 bg-neutral-800 hover:bg-neutral-750 rounded-xl border border-neutral-700 px-3 gap-2 w-full md:w-auto shrink-0">
                <div className="flex items-center gap-2 pointer-events-none">
                  <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-black tracking-wide text-white whitespace-nowrap select-none">
                    {formatDisplayDate(selectedDate)}
                  </span>
                </div>
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
                    className="relative z-10 h-6 px-2 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded-md font-bold cursor-pointer transition whitespace-nowrap"
                    title="Switch to Today"
                  >
                    Today
                  </button>
                )}
              </div>

              {/* Responsive Autofit Utility & Primary CTA Buttons */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-end gap-2 w-full md:w-auto">
                {/* Driver Master */}
                <button
                  type="button"
                  onClick={() => setShowDriverMasterModal(true)}
                  className="app-btn w-full sm:w-auto sm:min-w-[132px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 shadow-sm"
                  title="Driver & Vehicle Master Directory"
                >
                  <Users className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Driver Master</span>
                </button>

                {/* Daily Report */}
                {canViewReports && (
                  <button
                    type="button"
                    onClick={() => setShowDailyReportModal(true)}
                    className="app-btn w-full sm:w-auto sm:min-w-[132px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 shadow-sm"
                    title="Daily Reports & Data Backup"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Daily Report</span>
                  </button>
                )}

                {/* Plant Settings (Admin only) */}
                {canManageSettings && (
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="app-btn w-full sm:w-auto sm:min-w-[120px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 shadow-sm"
                    title="Plant Settings & Gates"
                  >
                    <Settings className="w-4 h-4 text-blue-300 shrink-0" />
                    <span>Settings</span>
                  </button>
                )}

                {/* New Ticket Button - Primary CTA */}
                {canCreateTickets && (
                  <button
                    type="button"
                    onClick={() => setShowNewTicketModal(true)}
                    className="app-btn w-full sm:w-auto sm:min-w-[148px] col-span-2 sm:col-span-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>New Gate Ticket</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex-1 w-full space-y-4">
        {appError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 shadow-sm"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{appError}</span>
            </span>
            <button
              type="button"
              onClick={() => setAppError(null)}
              className="p-1 text-red-600 hover:text-red-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Loading Completed Alerts Banner (Main Dashboard Notifications - Hidden for Forklift Operators) */}
        {!isForkliftOperator && loadingAlerts.length > 0 && (
          <div className="space-y-2">
            {loadingAlerts.slice(0, 3).map((alert) => {
              const matchedTicket = tickets.find((t) => t.id === alert.ticketId);
              return (
                <div
                  key={alert.id}
                  role="status"
                  className="bg-emerald-50 border-2 border-emerald-400 text-emerald-950 px-4 py-3 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="text-xs space-y-0.5 min-w-0">
                      <p className="font-black text-sm text-emerald-900 uppercase tracking-wide">
                        Loading Completed
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-emerald-900">
                        <span>
                          <strong>Delivery Number:</strong> {alert.delNoteNumber}
                        </span>
                        <span>
                          <strong>Truck Number:</strong> {alert.truckNumber}
                        </span>
                        <span>
                          <strong>Gate:</strong> {alert.gateNumber}
                        </span>
                        <span>
                          <strong>Completed By:</strong> {alert.completedBy}
                        </span>
                        <span>
                          <strong>Completed Time:</strong> {alert.completedTime}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    {canPrintSlips && matchedTicket && (
                      <button
                        type="button"
                        onClick={() => setActiveTicketForPrintSlip(matchedTicket)}
                        className="app-btn-sm bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300"
                      >
                        <Printer className="w-3.5 h-3.5 shrink-0" />
                        <span>Print Slip</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDismissAlert(alert.id)}
                      className="app-btn-sm bg-emerald-700 hover:bg-emerald-800 text-white"
                      title="Acknowledge and dismiss alert"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Navigation Tabs and Search / Filter Bar (Hidden for Forklift Operators) */}
        {!isForkliftOperator && (
          <div className="bg-white p-3 rounded-2xl border border-neutral-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Tabs */}
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center bg-neutral-100 p-1 rounded-xl gap-1 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`app-btn w-full sm:w-auto sm:min-w-[140px] !rounded-lg ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Live Monitor</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`app-btn w-full sm:w-auto sm:min-w-[160px] !rounded-lg ${
                  activeTab === 'list'
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <TableIcon className="w-4 h-4 text-indigo-700 shrink-0" />
                <span>All Tickets Ledger ({dayTickets.length})</span>
              </button>

              {canOperateForklift && (
                <button
                  type="button"
                  onClick={() => setActiveTab('forklift')}
                  className={`app-btn w-full sm:w-auto sm:min-w-[172px] !rounded-lg ${
                    activeTab === 'forklift'
                      ? 'bg-white text-emerald-900 shadow-sm'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <PackageCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Forklift Loading ({pendingForkliftCount})</span>
                </button>
              )}
            </div>

            {/* Search & Filters (for Monitor & Ledger tabs) */}
            {activeTab !== 'forklift' && (
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
            )}
          </div>
        )}

        {/* Tab 1: Live Gate Queue Dashboard (Hidden for Forklift Operators) */}
        {!isForkliftOperator && activeTab === 'dashboard' && (
          <GateQueueDashboard
            tickets={filteredTickets}
            settings={settings}
            date={selectedDate}
            onCallTruck={handleCallTruck}
            onStartLoading={handleStartLoading}
            onCompleteLoading={handleCompleteLoading}
            onOpenLoadingSlip={(t) => setActiveTicketForSlip(t)}
            onOpenWhatsApp={(t, templateId) => setActiveTicketForWhatsApp({ ticket: t, templateId })}
            canUpdate={canUpdateTickets}
            canPrint={canPrintSlips}
          />
        )}

        {/* Tab 2: All Records Table (Hidden for Forklift Operators) */}
        {!isForkliftOperator && activeTab === 'list' && (
          <TicketTable
            tickets={filteredTickets}
            onOpenLoadingSlip={(t) => setActiveTicketForSlip(t)}
            onPrintLoadingSlip={(t) => setActiveTicketForPrintSlip(t)}
            onPrintTicket={(t) => setActiveTicketForPrintTicket(t)}
            onOpenWhatsApp={(t) => setActiveTicketForWhatsApp({ ticket: t, templateId: 'gate_call' })}
            onStatusChange={handleStatusChange}
            onDeleteTicket={handleDeleteTicket}
            canUpdate={canUpdateTickets}
            canDelete={canDeleteTickets}
            canPrint={canPrintSlips}
          />
        )}

        {/* Tab 3: Forklift Operator Loading (Dedicated View for Forklift Operator Role) */}
        {(isForkliftOperator || (activeTab === 'forklift' && canOperateForklift)) &&
          (canOperateForklift && hasPerm('tickets.view') ? (
            <ForkliftLoadingView
              tickets={dayTickets}
              settings={settings}
              currentUser={currentUser}
              canPrint={canPrintSlips}
              onTicketsRefresh={loadData}
              onLoadingCompleted={(_updatedTicket, alert) => {
                if (!isForkliftOperator) {
                  setLoadingAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)]);
                }
              }}
              onPrintLoadingSlip={(t) => setActiveTicketForPrintSlip(t)}
            />
          ) : (
            <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center space-y-2 shadow-sm">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <h3 className="text-sm font-black text-neutral-900">Forklift Operator Permissions Required</h3>
              <p className="text-xs text-neutral-600">
                Your Forklift Operator account does not currently have active loading checklist permissions. Please contact your Administrator.
              </p>
            </div>
          ))}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            {settings.companyName} • Material Loading Gate Queue & 2-Copy A4 Loading Slip Manager
          </p>
          <p className="text-[11px] text-neutral-400">
            Date: {formatDisplayDate(selectedDate)} | Total Entries: {dayTickets.length} | Operator: {currentUser.fullName} ({currentUser.roleDisplayName})
          </p>
        </div>
      </footer>

      {/* MODALS (Restricted modals hidden for Forklift Operators) */}
      {/* 1. New Ticket Modal */}
      {!isForkliftOperator && showNewTicketModal && canCreateTickets && (
        <NewTicketModal
          date={selectedDate}
          settings={settings}
          onSave={handleSaveNewTicket}
          onClose={() => setShowNewTicketModal(false)}
        />
      )}

      {/* 2. Loading Slip 8-Rows Modal */}
      {!isForkliftOperator && activeTicketForSlip && (
        <LoadingSlipModal
          ticket={activeTicketForSlip}
          settings={settings}
          storeInchargeFullName={currentUser.fullName}
          onSave={handleSaveLoadingSlip}
          onClose={() => setActiveTicketForSlip(null)}
        />
      )}

      {/* 3. 2-Copy A4 Loading Slip Print Preview Modal */}
      {!isForkliftOperator && activeTicketForPrintSlip && (
        <LoadingSlipPrintView
          ticket={activeTicketForPrintSlip}
          settings={settings}
          storeInchargeFullName={currentUser.fullName}
          onClose={() => setActiveTicketForPrintSlip(null)}
        />
      )}

      {/* 4. Compact Gate Token Print View */}
      {!isForkliftOperator && activeTicketForPrintTicket && (
        <TicketPrintView
          ticket={activeTicketForPrintTicket}
          settings={settings}
          onClose={() => setActiveTicketForPrintTicket(null)}
        />
      )}

      {/* 5. WhatsApp Message Modal */}
      {!isForkliftOperator && activeTicketForWhatsApp && (
        <WhatsAppModal
          ticket={activeTicketForWhatsApp.ticket}
          settings={settings}
          initialTemplateId={activeTicketForWhatsApp.templateId}
          onClose={() => setActiveTicketForWhatsApp(null)}
          onStatusUpdate={(newStatus) => {
            if (canUpdateTickets) {
              handleStatusChange(activeTicketForWhatsApp.ticket, newStatus);
            }
          }}
        />
      )}

      {/* 6. Driver Master Modal */}
      {!isForkliftOperator && showDriverMasterModal && (
        <DriverMasterModal
          canManage={canManageDrivers}
          onClose={() => setShowDriverMasterModal(false)}
        />
      )}

      {/* 7. Daily Report & Export Modal */}
      {!isForkliftOperator && showDailyReportModal && canViewReports && (
        <DailyReportModal
          tickets={tickets}
          settings={settings}
          date={selectedDate}
          isAdmin={isAdmin}
          onClose={() => setShowDailyReportModal(false)}
          onDataRestored={loadData}
        />
      )}

      {/* 8. Settings Modal (Admin only) */}
      {!isForkliftOperator && showSettingsModal && canManageSettings && (
        <SettingsModal
          settings={settings}
          onSave={(newSettings) => {
            setSettings(newSettings);
            loadData();
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* 9. Self-Service Change Password Modal */}
      {showChangePasswordModal && (
        <ChangePasswordModal
          user={currentUser}
          onSuccess={(updatedUser) => {
            setCurrentUser(updatedUser);
            setShowChangePasswordModal(false);
          }}
          onClose={() => setShowChangePasswordModal(false)}
        />
      )}

      {/* 10. Admin User Management & Audit Dashboard */}
      {!isForkliftOperator && showAdminModal && isAdmin && (
        <AdminDashboardModal
          currentUser={currentUser}
          onClose={() => {
            setShowAdminModal(false);
            ApiClient.getAuthStatus()
              .then((status) => {
                if (status.authenticated && status.user) {
                  setCurrentUser(status.user);
                }
              })
              .catch(() => {});
          }}
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
