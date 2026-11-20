import { useState, useEffect, useCallback, useRef } from 'react';
import { TicketRecord, CompanySettings, PublicBranding, TruckStatus, AuthUser, LoadingAlertNotification } from './types';
import {
  StorageService,
  getTodayDateString,
  getCurrentTimeString,
  formatDisplayDate,
} from './services/storage';
import { ApiClient, ApiError, setAuthErrorHandlers, setCsrfToken, setSessionToken, withBackgroundPoll } from './services/api';
import { GateQueueDashboard } from './components/GateQueueDashboard';
import { TicketTable } from './components/TicketTable';
import { ForkliftLoadingView } from './components/ForkliftLoadingView';
import { LiquidMaterialStoreView } from './components/LiquidMaterialStoreView';
import { ExFactoryView } from './components/ExFactoryView';
import { DispatchDetailsView } from './components/DispatchDetailsView';
import { NewTicketModal } from './components/NewTicketModal';
import { EditTicketModal } from './components/EditTicketModal';
import { LoadingSlipModal } from './components/LoadingSlipModal';
import { LoadingSlipPrintView } from './components/LoadingSlipPrintView';
import { TicketPrintView } from './components/TicketPrintView';
import { WhatsAppModal } from './components/WhatsAppModal';
import { DriverMasterModal } from './components/DriverMasterModal';
import { DailyReportModal } from './components/DailyReportModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginView } from './components/LoginView';
import { DriverStatusView } from './components/DriverStatusView';
import { DriverTokenStatusPage } from './components/DriverTokenStatusPage';
import { WhatsAppLogsModal } from './components/WhatsAppLogsModal';
import { WhatsAppTemplatesModal } from './components/WhatsAppTemplatesModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import {
  Plus,
  Calendar,
  FileSpreadsheet,
  ClipboardList,
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
  Droplets,
  Truck,
  MessageSquare,
  Send,
  ExternalLink,
  MoreVertical,
  FileText,
} from 'lucide-react';

export default function App() {
  // Authentication & Session State
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [driverStatusToken] = useState<string | null>(() => {
    try {
      const match = window.location.pathname.match(/^\/driver-loading-status\/([A-Za-z0-9_-]{16,128})\/?$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  });
  const [showDriverStatusView, setShowDriverStatusView] = useState<boolean>(() => {
    try {
      const hash = window.location.hash.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      const params = new URLSearchParams(window.location.search);
      return hash.startsWith('#driver-status') || path === '/driver-status' || params.get('driver') === '1';
    } catch {
      return false;
    }
  });

  // App Data State
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState<LoadingAlertNotification[]>([]);
  const [settings, setSettings] = useState<CompanySettings>(() => StorageService.getSettings());
  const [publicBranding, setPublicBranding] = useState<PublicBranding | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'dispatch' | 'material_register' | 'forklift' | 'liquid' | 'exfactory'>('dashboard');
  const [appError, setAppError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [gateFilter, setGateFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals State
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [activeTicketForEdit, setActiveTicketForEdit] = useState<TicketRecord | null>(null);
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
  const [showWhatsAppLogsModal, setShowWhatsAppLogsModal] = useState(false);
  const [showWhatsAppTemplatesModal, setShowWhatsAppTemplatesModal] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [waPendingRetryCount, setWaPendingRetryCount] = useState(0);
  const [waToast, setWaToast] = useState<{
    type: 'sent' | 'failed' | 'skipped';
    ticketId: string;
    ticketNumber: string;
    truckNumber: string;
    message: string;
    liveStatusUrl?: string;
    retrying?: boolean;
  } | null>(null);

  // Deleted Ticket Undo Toast State
  const [deletedToast, setDeletedToast] = useState<{
    ticket: TicketRecord;
    message: string;
  } | null>(null);

  const migratedOnceRef = useRef(false);

  const isAdmin = currentUser?.roleName === 'admin';
  const isForkliftOperator = currentUser?.roleName === 'forklift_operator';
  const isLiquidStoreRole = currentUser?.roleName === 'liquid_store_operator';
  const isExFactoryRole = currentUser?.roleName === 'ex_factory_operator';
  const hasPerm = useCallback(
    (perm: string): boolean => {
      if (!currentUser) return false;
      if (currentUser.roleName === 'admin') return true;
      return currentUser.permissions.includes(perm);
    },
    [currentUser]
  );

  const canViewTickets =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && (isAdmin || hasPerm('tickets.view'));
  const canCreateTickets =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && hasPerm('tickets.create');
  const canUpdateTickets =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && hasPerm('tickets.update');
  const canOperateForklift =
    !isLiquidStoreRole &&
    !isExFactoryRole &&
    (hasPerm('forklift.operate') || (!isForkliftOperator && hasPerm('tickets.update')));
  const canAccessLiquidStore =
    !isForkliftOperator && !isExFactoryRole && (isAdmin || hasPerm('liquid.store'));
  const canViewExFactory =
    !isForkliftOperator && !isLiquidStoreRole && (isAdmin || hasPerm('ex_factory.view'));
  const canCreateExFactory =
    !isForkliftOperator && !isLiquidStoreRole && (isAdmin || hasPerm('ex_factory.create'));
  const canUpdateExFactory =
    !isForkliftOperator && !isLiquidStoreRole && (isAdmin || hasPerm('ex_factory.update'));
  const canDeleteExFactory =
    !isForkliftOperator && !isLiquidStoreRole && (isAdmin || hasPerm('ex_factory.delete'));
  const canAccessExFactory =
    !isForkliftOperator &&
    !isLiquidStoreRole &&
    (isAdmin || canViewExFactory || canCreateExFactory || canUpdateExFactory || canDeleteExFactory);
  const canDeleteTickets =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && hasPerm('tickets.delete');
  const canPrintSlips =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && hasPerm('slips.print');
  const canManageDrivers =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && hasPerm('drivers.manage');
  const canViewReports =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && hasPerm('reports.view');
  const canManageSettings =
    !isForkliftOperator && !isLiquidStoreRole && !isExFactoryRole && hasPerm('settings.manage');

  const isLiquidStoreOnly =
    Boolean(currentUser) &&
    !isAdmin &&
    !isForkliftOperator &&
    !isExFactoryRole &&
    (isLiquidStoreRole ||
      (canAccessLiquidStore &&
        !canViewTickets &&
        !canCreateTickets &&
        !canUpdateTickets &&
        !canOperateForklift &&
        !canAccessExFactory &&
        !canDeleteTickets &&
        !canPrintSlips &&
        !canManageDrivers &&
        !canViewReports &&
        !canManageSettings));

  const isExFactoryOnly =
    Boolean(currentUser) &&
    !isAdmin &&
    !isForkliftOperator &&
    !isLiquidStoreRole &&
    (isExFactoryRole ||
      (canAccessExFactory &&
        !canViewTickets &&
        !canCreateTickets &&
        !canUpdateTickets &&
        !canOperateForklift &&
        !canAccessLiquidStore &&
        !canDeleteTickets &&
        !canPrintSlips &&
        !canManageDrivers &&
        !canViewReports &&
        !canManageSettings));

  const canViewDispatchDetails =
    !isForkliftOperator &&
    !isLiquidStoreOnly &&
    !isExFactoryOnly &&
    (canViewTickets || canViewReports || canAccessExFactory);

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
    setShowWhatsAppLogsModal(false);
    setShowWhatsAppTemplatesModal(false);
    setMobileHeaderMenuOpen(false);
    setWaPendingRetryCount(0);
    setWaToast(null);
    setShowAdminModal(false);
    setShowChangePasswordModal(false);
    setDeletedToast(null);
  }, []);

  const lastUserActivityRef = useRef<number>(Date.now());

  // Load shared application data from authenticated backend
  const loadData = useCallback(async (isBackgroundPoll = false) => {
    const forkliftOnly = currentUser?.roleName === 'forklift_operator';
    const userIsAdmin = currentUser?.roleName === 'admin';
    const userPerms = currentUser?.permissions || [];
    const userCanViewTickets =
      !forkliftOnly &&
      currentUser?.roleName !== 'liquid_store_operator' &&
      currentUser?.roleName !== 'ex_factory_operator' &&
      (userIsAdmin || userPerms.includes('tickets.view'));
    const userCanFetchTickets = forkliftOnly || userCanViewTickets;
    const userCanFetchDrivers =
      !forkliftOnly &&
      currentUser?.roleName !== 'liquid_store_operator' &&
      (userIsAdmin ||
        userPerms.includes('drivers.manage') ||
        userPerms.includes('tickets.view') ||
        userPerms.includes('ex_factory.view') ||
        userPerms.includes('ex_factory.create') ||
        userPerms.includes('ex_factory.update'));

    const markAsBackgroundPoll =
      isBackgroundPoll && Date.now() - lastUserActivityRef.current >= 60_000;

    try {
      const fetchAll = () =>
        Promise.all([
          userCanFetchTickets ? ApiClient.getTickets() : Promise.resolve([] as TicketRecord[]),
          userCanFetchDrivers ? ApiClient.getDrivers() : Promise.resolve([]),
          ApiClient.getSettings(),
          !forkliftOnly && userCanViewTickets
            ? ApiClient.getLoadingAlerts().catch(() => [] as LoadingAlertNotification[])
            : Promise.resolve([] as LoadingAlertNotification[]),
          !forkliftOnly && userCanViewTickets
            ? ApiClient.getWhatsAppLogs().catch(() => [])
            : Promise.resolve([]),
        ]);

      const [ticketsRes, driversRes, settingsRes, alertsRes, waLogsRes] = markAsBackgroundPoll
        ? await withBackgroundPoll(fetchAll)
        : await fetchAll();
      StorageService.hydrateFromServer({
        tickets: ticketsRes,
        drivers: driversRes,
        settings: settingsRes.settings,
        defaultSettings: settingsRes.defaultSettings,
      });
      setTickets(ticketsRes);
      setLoadingAlerts(alertsRes);
      setWaPendingRetryCount(
        waLogsRes.filter((l) => l.deliveryStatus === 'failed' || l.deliveryStatus === 'skipped').length
      );
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
  }, [currentUser?.roleName, currentUser?.permissions]);

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
        if (status.branding) {
          setPublicBranding(status.branding);
        }
        if (status.authenticated && status.user) {
          setCurrentUser(status.user);
          const u = status.user;
          if (u.roleName === 'forklift_operator') {
            setActiveTab('forklift');
          } else if (
            u.roleName === 'liquid_store_operator' ||
            (u.roleName !== 'admin' &&
              u.permissions.includes('liquid.store') &&
              !u.permissions.includes('tickets.view') &&
              !u.permissions.some((p) => p.startsWith('ex_factory.')))
          ) {
            setActiveTab('liquid');
          } else if (
            u.roleName === 'ex_factory_operator' ||
            (u.roleName !== 'admin' &&
              u.permissions.some((p) => p.startsWith('ex_factory.')) &&
              !u.permissions.includes('tickets.view') &&
              !u.permissions.includes('liquid.store'))
          ) {
            setActiveTab('exfactory');
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

  // Redirect & lock Forklift Operators, Liquid-Store-Only, or Ex-Factory-Only users strictly inside their section
  useEffect(() => {
    if (!currentUser || currentUser.mustChangePassword) return;
    if (isForkliftOperator) {
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
      return;
    }

    if (isLiquidStoreOnly) {
      setActiveTab('liquid');
      setShowNewTicketModal(false);
      setActiveTicketForSlip(null);
      setActiveTicketForPrintSlip(null);
      setActiveTicketForPrintTicket(null);
      setActiveTicketForWhatsApp(null);
      setShowDriverMasterModal(false);
      setShowDailyReportModal(false);
      setShowSettingsModal(false);
      setShowAdminModal(false);
      if (window.location.pathname !== '/' || window.location.hash !== '#liquid-store') {
        window.history.replaceState(null, '', '/#liquid-store');
      }
      return;
    }

    if (isExFactoryOnly) {
      setActiveTab('exfactory');
      setShowNewTicketModal(false);
      setActiveTicketForSlip(null);
      setActiveTicketForPrintSlip(null);
      setActiveTicketForPrintTicket(null);
      setActiveTicketForWhatsApp(null);
      setShowDriverMasterModal(false);
      setShowDailyReportModal(false);
      setShowSettingsModal(false);
      setShowAdminModal(false);
      if (window.location.pathname !== '/' || window.location.hash !== '#ex-factory') {
        window.history.replaceState(null, '', '/#ex-factory');
      }
      return;
    }

    // If custom user profile lacks tickets.view, redirect off dashboard/list onto their permitted tab
    if (!canViewTickets && (activeTab === 'dashboard' || activeTab === 'list')) {
      if (canAccessExFactory) {
        setActiveTab('exfactory');
      } else if (canAccessLiquidStore) {
        setActiveTab('liquid');
      } else if (canOperateForklift) {
        setActiveTab('forklift');
      }
    }
  }, [
    currentUser,
    isForkliftOperator,
    isLiquidStoreOnly,
    isExFactoryOnly,
    canViewTickets,
    canAccessExFactory,
    canAccessLiquidStore,
    canOperateForklift,
    activeTab,
  ]);

  // Hydrate server data once authenticated and password-compliant, + 15s multi-user live polling
  useEffect(() => {
    if (!currentUser || currentUser.mustChangePassword) return;

    let cancelled = false;
    (async () => {
      if (
        !migratedOnceRef.current &&
        currentUser.roleName !== 'forklift_operator' &&
        !isLiquidStoreOnly &&
        !isExFactoryOnly
      ) {
        migratedOnceRef.current = true;
        await ApiClient.migrateLegacyLocalStorageIfNeeded();
      }
      if (!cancelled) {
        await loadData();
      }
    })();

    const pollInterval = setInterval(() => {
      loadData(true);
    }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser, isLiquidStoreOnly, isExFactoryOnly, loadData]);

  // Auto-Logout Idle Timeout applies ONLY to non-admin users (Admins stay signed in)
  useEffect(() => {
    if (!currentUser || currentUser.mustChangePassword || currentUser.roleName === 'admin') {
      return;
    }

    lastUserActivityRef.current = Date.now();
    let lastRecorded = lastUserActivityRef.current;

    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRecorded >= 5000) {
        lastRecorded = now;
        lastUserActivityRef.current = now;
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];
    activityEvents.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    const idleMinutes = Math.max(5, Math.min(720, Number(settings.sessionIdleMinutes) || 30));
    const idleTimeoutMs = idleMinutes * 60 * 1000;

    const idleCheckTimer = setInterval(() => {
      if (Date.now() - lastUserActivityRef.current >= idleTimeoutMs) {
        clearInterval(idleCheckTimer);
        ApiClient.logout().catch(() => {});
        clearSessionState();
      }
    }, 10000);

    return () => {
      clearInterval(idleCheckTimer);
      activityEvents.forEach((evt) => window.removeEventListener(evt, recordActivity));
    };
  }, [currentUser, settings.sessionIdleMinutes, clearSessionState]);

  // Auto-dismiss undo toast after 6 seconds
  useEffect(() => {
    if (deletedToast) {
      const timer = setTimeout(() => {
        setDeletedToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [deletedToast]);

  // Keep browser tab favicon & branding synchronized with uploaded company logo
  useEffect(() => {
    const activeLogo = (currentUser ? settings.logoDataUrl : publicBranding?.logoDataUrl) || settings.logoDataUrl || publicBranding?.logoDataUrl;
    if (!activeLogo) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = activeLogo;
  }, [currentUser, settings.logoDataUrl, publicBranding?.logoDataUrl]);

  // Close mobile left 3-dots header menu on Escape key
  useEffect(() => {
    if (!mobileHeaderMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileHeaderMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileHeaderMenuOpen]);

  const handleLogout = async () => {
    await ApiClient.logout();
    clearSessionState();
    setNeedsSetup(false);
    if (window.location.pathname !== '/' || window.location.hash) {
      window.history.replaceState(null, '', '/');
    }
  };

  // Public tokenized Driver Live Loading Status link from WhatsApp (no login required)
  if (driverStatusToken) {
    return <DriverTokenStatusPage token={driverStatusToken} initialBranding={publicBranding} />;
  }

  // Show boot spinner while checking session cookie
  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white gap-3 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-sm font-semibold text-neutral-300">Verifying secure session...</p>
      </div>
    );
  }

  // Gate 1: Unauthenticated -> Driver Live Status Screen or Login Page
  if (!currentUser) {
    if (showDriverStatusView && !needsSetup) {
      return (
        <DriverStatusView
          branding={publicBranding}
          backLabel="Staff Login"
          onBack={() => {
            setShowDriverStatusView(false);
            if (window.location.hash.toLowerCase().startsWith('#driver-status') || window.location.pathname === '/driver-status') {
              window.history.replaceState(null, '', '/');
            }
          }}
        />
      );
    }

    return (
      <LoginView
        needsSetup={needsSetup}
        branding={publicBranding}
        onOpenDriverStatus={() => {
          setShowDriverStatusView(true);
          window.history.replaceState(null, '', '/#driver-status');
        }}
        onAuthenticated={(user) => {
          setShowDriverStatusView(false);
          setNeedsSetup(false);
          setAppError(null);
          setCurrentUser(user);
          if (user.roleName === 'forklift_operator') {
            setActiveTab('forklift');
          } else if (
            user.roleName === 'liquid_store_operator' ||
            (user.roleName !== 'admin' &&
              user.permissions.includes('liquid.store') &&
              !user.permissions.includes('tickets.view') &&
              !user.permissions.some((p) => p.startsWith('ex_factory.')))
          ) {
            setActiveTab('liquid');
          } else if (
            user.roleName === 'ex_factory_operator' ||
            (user.roleName !== 'admin' &&
              user.permissions.some((p) => p.startsWith('ex_factory.')) &&
              !user.permissions.includes('tickets.view') &&
              !user.permissions.includes('liquid.store'))
          ) {
            setActiveTab('exfactory');
          } else if (user.roleName !== 'admin' && !user.permissions.includes('tickets.view')) {
            if (user.permissions.some((p) => p.startsWith('ex_factory.'))) {
              setActiveTab('exfactory');
            } else if (user.permissions.includes('liquid.store')) {
              setActiveTab('liquid');
            } else if (user.permissions.includes('forklift.operate')) {
              setActiveTab('forklift');
            } else {
              setActiveTab('dashboard');
            }
          } else {
            setActiveTab('dashboard');
          }
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
            if (updatedUser.roleName === 'forklift_operator') {
              setActiveTab('forklift');
            } else if (
              updatedUser.roleName === 'liquid_store_operator' ||
              (updatedUser.roleName !== 'admin' &&
                updatedUser.permissions.includes('liquid.store') &&
                !updatedUser.permissions.includes('tickets.view') &&
                !updatedUser.permissions.some((p) => p.startsWith('ex_factory.')))
            ) {
              setActiveTab('liquid');
            } else if (
              updatedUser.roleName === 'ex_factory_operator' ||
              (updatedUser.roleName !== 'admin' &&
                updatedUser.permissions.some((p) => p.startsWith('ex_factory.')) &&
                !updatedUser.permissions.includes('tickets.view') &&
                !updatedUser.permissions.includes('liquid.store'))
            ) {
              setActiveTab('exfactory');
            } else if (updatedUser.roleName !== 'admin' && !updatedUser.permissions.includes('tickets.view')) {
              if (updatedUser.permissions.some((p) => p.startsWith('ex_factory.'))) {
                setActiveTab('exfactory');
              } else if (updatedUser.permissions.includes('liquid.store')) {
                setActiveTab('liquid');
              } else if (updatedUser.permissions.includes('forklift.operate')) {
                setActiveTab('forklift');
              } else {
                setActiveTab('dashboard');
              }
            } else {
              setActiveTab('dashboard');
            }
          }}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // Optional Driver Live Loading Status screen preview for dispatchers/admins
  if (showDriverStatusView && !isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly) {
    return (
      <DriverStatusView
        branding={{
          companyName: settings.companyName,
          companySubtitle: settings.companySubtitle,
          logoDataUrl: settings.logoDataUrl,
        }}
        backLabel="Back to Dispatch"
        onBack={() => {
          setShowDriverStatusView(false);
          if (window.location.hash.toLowerCase().startsWith('#driver-status') || window.location.pathname === '/driver-status') {
            window.history.replaceState(null, '', '/');
          }
        }}
      />
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
    if (newStatus === 'completed') {
      if (!ticket.timeLoadingStarted) updates.timeLoadingStarted = getCurrentTimeString();
      if (!ticket.timeCompleted) updates.timeCompleted = getCurrentTimeString();
    } else {
      updates.timeCompleted = '';
    }

    setAppError(null);
    try {
      await ApiClient.updateTicket(ticket.id, updates);
      await loadData();
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to update status.');
    }
  };

  // Quick Gate change from All Tickets Ledger dropdown
  const handleGateChange = async (ticket: TicketRecord, newGate: string) => {
    const cleanGate = newGate.trim();
    if (!cleanGate || cleanGate === ticket.gateNumber) return;

    setAppError(null);
    try {
      await ApiClient.updateTicket(ticket.id, {
        gateNumber: cleanGate,
        version: ticket.version,
      });
      await loadData();
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to change gate number.');
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

  // Save loading slip handler (auto-triggers WhatsApp notification on newly generated slip)
  const handleSaveLoadingSlip = async (updatedTicket: TicketRecord, openPrintDirectly?: boolean) => {
    setAppError(null);
    try {
      const { ticket: saved, whatsappNotification } = await ApiClient.updateTicketWithNotification(
        updatedTicket.id,
        updatedTicket
      );
      setActiveTicketForSlip(null);
      await loadData();

      if (whatsappNotification && whatsappNotification.triggered) {
        if (whatsappNotification.deliveryStatus === 'sent') {
          setWaToast({
            type: 'sent',
            ticketId: saved.id,
            ticketNumber: saved.ticketNumber,
            truckNumber: saved.truckNumber,
            message: `Auto WhatsApp sent to ${whatsappNotification.driverMobile} (${whatsappNotification.gateNumber} · Queue #${whatsappNotification.queueNumber}).`,
            liveStatusUrl: whatsappNotification.liveStatusUrl,
          });
        } else {
          setWaToast({
            type: whatsappNotification.deliveryStatus,
            ticketId: saved.id,
            ticketNumber: saved.ticketNumber,
            truckNumber: saved.truckNumber,
            message:
              whatsappNotification.warning ||
              whatsappNotification.errorMessage ||
              'Loading slip saved, but automatic WhatsApp delivery did not complete.',
            liveStatusUrl: whatsappNotification.liveStatusUrl,
          });
        }
      }

      if (openPrintDirectly) {
        setActiveTicketForPrintSlip(saved);
      }
    } catch (err: any) {
      await loadData();
      setAppError(err?.message || 'Failed to save loading slip.');
    }
  };

  const handleRetryWhatsAppToast = async () => {
    if (!waToast || waToast.type === 'sent' || waToast.retrying) return;
    setWaToast((prev) => (prev ? { ...prev, retrying: true } : null));
    try {
      const { outcome } = await ApiClient.retryWhatsAppNotification(waToast.ticketId);
      await loadData();
      if (outcome.deliveryStatus === 'sent') {
        setWaToast({
          type: 'sent',
          ticketId: waToast.ticketId,
          ticketNumber: waToast.ticketNumber,
          truckNumber: waToast.truckNumber,
          message: `WhatsApp delivered to ${outcome.driverMobile} (${outcome.gateNumber} · Queue #${outcome.queueNumber}).`,
          liveStatusUrl: outcome.liveStatusUrl,
        });
      } else {
        setWaToast((prev) =>
          prev
            ? {
                ...prev,
                type: outcome.deliveryStatus,
                message: outcome.warning || outcome.errorMessage || 'WhatsApp retry failed.',
                retrying: false,
              }
            : null
        );
      }
    } catch (err: any) {
      setWaToast((prev) =>
        prev
          ? {
              ...prev,
              message: err?.message || 'Failed to retry WhatsApp message.',
              retrying: false,
            }
          : null
      );
      await loadData();
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

  const activeSectionLabel =
    activeTab === 'list'
      ? `All Tickets Ledger (${dayTickets.length})`
      : activeTab === 'forklift'
      ? `Forklift Loading (${pendingForkliftCount})`
      : activeTab === 'liquid'
      ? 'Liquid Material Camp Store'
      : activeTab === 'exfactory'
      ? 'Ex-Factory Dispatch'
      : 'Live Monitor';

  return (
    <div className="min-h-screen text-[#1C2833] font-sans flex flex-col">
      {/* Top 3D Beveled Command Header */}
      <header className="print:hidden bg-gradient-to-b from-[#3E556D] via-[#354A5F] to-[#263748] text-white sticky top-0 z-40 border-b border-[#1A2836] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_0_#1D2B3A,0_10px_20px_-6px_rgba(15,23,42,0.3)]">
        <div className="h-1 w-full bg-gradient-to-r from-[#F0AB00] via-[#0A6ED1] to-[#107E3E]" />

        {/* Mobile Compact Header Bar (< md): Left 3-Dots Button + Company Brand & Current Section */}
        <div className="md:hidden px-3 py-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileHeaderMenuOpen(true)}
            aria-label="Open sections and tools menu"
            aria-expanded={mobileHeaderMenuOpen}
            className="btn-3d relative w-10 h-10 rounded-xl bg-gradient-to-b from-[#2B3E50] to-[#1F3040] hover:from-[#3A526A] hover:to-[#243647] border border-[#526E8A] text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <MoreVertical className="w-5 h-5 text-[#F0AB00]" />
            {waPendingRetryCount > 0 && !isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#BB0000] border border-white text-[10px] font-black text-white flex items-center justify-center tabular-nums">
                {waPendingRetryCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            {settings.logoDataUrl ? (
              <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 ring-1 ring-[#F0AB00]/80 overflow-hidden p-0.5 shadow-[0_2px_0_#1B2836]">
                <img
                  src={settings.logoDataUrl}
                  alt={settings.companyName}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1882EB] via-[#0A6ED1] to-[#00448E] flex items-center justify-center text-[#F0AB00] shrink-0 ring-1 ring-[#F0AB00]/70 shadow-[0_2px_0_#002E61]">
                <Building2 className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xs font-black tracking-wide text-white truncate">
                {settings.companyName}
              </h1>
              <p className="text-[10px] text-[#CBD8E6] truncate">
                <span className="text-[#F0AB00] font-extrabold">{activeSectionLabel}</span>
                {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly
                  ? ` · ${formatDisplayDate(selectedDate)}`
                  : ` · ${currentUser.fullName}`}
              </p>
            </div>
          </div>
        </div>

        {/* Desktop & Tablet Compact Centered Command Header (>= md) */}
        <div className="hidden md:block max-w-[1440px] mx-auto px-3 sm:px-5 py-1.5 space-y-1.5">
          {/* Upper Row: Compact Centered Brand + Account & Auth Controls */}
          <div
            className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 ${
              !isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly ? 'pb-1.5 border-b border-white/15' : ''
            }`}
          >
            {/* Compact Logo & Company Title */}
            <div className="flex items-center gap-2 min-w-0 max-w-full">
              {settings.logoDataUrl ? (
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 ring-1 ring-[#F0AB00]/80 overflow-hidden p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_0_#1B2836]">
                  <img
                    src={settings.logoDataUrl}
                    alt={settings.companyName}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1882EB] via-[#0A6ED1] to-[#00448E] flex items-center justify-center text-[#F0AB00] shrink-0 ring-1 ring-[#F0AB00]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#002E61]">
                  <Building2 className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xs sm:text-sm font-black tracking-wide text-white truncate drop-shadow-xs">
                    {settings.companyName}
                  </h1>
                  <span
                    className={`hidden lg:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold border whitespace-nowrap ${
                      isForkliftOperator
                        ? 'bg-[#1D3E35] text-[#68D391] border-[#2E6B5A]'
                        : isLiquidStoreOnly
                        ? 'bg-[#1E3B58] text-[#8AC4FF] border-[#356697]'
                        : isExFactoryOnly
                        ? 'bg-[#422D12] text-[#FCD34D] border-[#854D0E]'
                        : 'bg-[#223344] text-[#F0AB00] border-[#4A6580]'
                    }`}
                  >
                    {isForkliftOperator
                      ? 'Forklift Section'
                      : isLiquidStoreOnly
                      ? 'Liquid Store'
                      : isExFactoryOnly
                      ? 'Ex-Factory'
                      : 'Gate Queue & Dispatch'}
                  </span>
                </div>
                <p className="text-[10px] text-[#D5E1EE] truncate max-w-md leading-tight">
                  {settings.companySubtitle}
                </p>
              </div>
            </div>

            {/* Compact Account Info & Auth Action Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <div className="flex items-center gap-1.5 bg-[#1F3040] border border-[#45607A] rounded-lg h-7 px-2 shrink-0 shadow-[inset_0_1px_4px_rgba(0,0,0,0.28)]">
                <UserIcon className="w-3 h-3 text-[#F0AB00] shrink-0" />
                <span className="text-[11px] font-extrabold text-white truncate max-w-[130px]">
                  {currentUser.fullName}
                </span>
                <span className="text-[10.5px] text-[#B8CAE0] whitespace-nowrap hidden xl:inline">
                  @{currentUser.username} · {currentUser.roleDisplayName}
                </span>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminModal(true)}
                  className="app-btn-sm !h-7 !min-h-[28px] !px-2 !text-[11px] !gap-1 bg-[#0A6ED1] hover:bg-[#085CAF] text-white border border-[#3B93EE]"
                  title="Admin Dashboard: Users, Permissions, Sessions & Audit Log"
                >
                  <Shield className="w-3 h-3 text-white shrink-0" />
                  <span>Admin Users</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowChangePasswordModal(true)}
                className="app-btn-sm !h-7 !min-h-[28px] !px-2 !text-[11px] !gap-1 bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                title="Change My Password"
              >
                <KeyRound className="w-3 h-3 text-[#F0AB00] shrink-0" />
                <span>Password</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="app-btn-sm !h-7 !min-h-[28px] !px-2 !text-[11px] !gap-1 bg-[#BB0000] hover:bg-[#9E0000] text-white border border-[#E04F4F]"
                title="Sign Out Securely"
              >
                <LogOut className="w-3 h-3 shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          {/* Lower Centered Compact Toolbar Row: Date Picker & Quick Action Buttons */}
          {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {/* Compact Date Switcher */}
              <div className="relative inline-flex items-center h-7 bg-[#2B3E50] hover:bg-[#3A526A] rounded-lg border border-[#4F6B88] px-2 gap-1 shrink-0 transition shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_0_#192735]">
                <div className="flex items-center gap-1 pointer-events-none">
                  <Calendar className="w-3 h-3 text-[#F0AB00] shrink-0" />
                  <span className="text-[11px] font-black tracking-wide text-white whitespace-nowrap select-none font-mono">
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
                    className="relative z-10 h-5 px-1.5 text-[10px] bg-[#0A6ED1] hover:bg-[#085CAF] text-white rounded font-bold cursor-pointer transition whitespace-nowrap"
                    title="Switch to Today"
                  >
                    Today
                  </button>
                )}
              </div>

              {canManageDrivers && (
                <button
                  type="button"
                  onClick={() => setShowDriverMasterModal(true)}
                  className="app-btn-sm !h-7 !min-h-[28px] !px-2 !text-[11px] !gap-1 bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                  title="Driver & Vehicle Master Directory"
                >
                  <Users className="w-3 h-3 text-[#F0AB00] shrink-0" />
                  <span>Driver Master</span>
                </button>
              )}

              {canViewReports && (
                <button
                  type="button"
                  onClick={() => setShowDailyReportModal(true)}
                  className="app-btn-sm !h-7 !min-h-[28px] !px-2 !text-[11px] !gap-1 bg-[#107E3E] hover:bg-[#0D6B34] text-white border border-[#24A159]"
                  title="Daily Reports & Data Backup"
                >
                  <FileSpreadsheet className="w-3 h-3 text-white shrink-0" />
                  <span>Daily Report</span>
                </button>
              )}

              {canViewTickets && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDriverStatusView(true);
                    window.history.replaceState(null, '', '/#driver-status');
                  }}
                  className="app-btn-sm !h-7 !min-h-[28px] !px-2 !text-[11px] !gap-1 bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                  title="Driver Live Loading Status Screen (12-Hour Lookup)"
                >
                  <Truck className="w-3 h-3 text-[#F0AB00] shrink-0" />
                  <span>Driver Status</span>
                </button>
              )}

              {canManageSettings && (
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="app-btn-sm !h-7 !min-h-[28px] !px-2 !text-[11px] !gap-1 bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                  title="Plant Settings, Gates & WhatsApp Tools"
                >
                  <Settings className="w-3 h-3 text-[#68AEFF] shrink-0" />
                  <span>Settings</span>
                  {waPendingRetryCount > 0 && (
                    <span className="ml-0.5 px-1 py-0 text-[9.5px] font-black rounded-full bg-[#BB0000] text-white tabular-nums">
                      {waPendingRetryCount}
                    </span>
                  )}
                </button>
              )}

              {canCreateTickets && (
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(true)}
                  className="app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !gap-1 bg-[#F0AB00] hover:bg-[#FFC11E] text-[#1C2833] font-black border border-[#FFD154]"
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  <span>New Gate Ticket</span>
                </button>
              )}

              {/* Recessed Compact 3D Section Tab Dock in Header Toolbar */}
              <div className="w-full pt-1 flex justify-center">
                <div className="inset-3d inline-flex flex-wrap items-center justify-center bg-[#E4ECF5] p-1 rounded-xl gap-1 border border-[#C6D4E3]">
                  {canViewTickets && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('dashboard')}
                      className={`app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !rounded-lg ${
                        activeTab === 'dashboard'
                          ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-950'
                          : '!shadow-none bg-transparent text-[#354A5F] hover:text-red-900 hover:bg-white/80'
                      }`}
                    >
                      <LayoutDashboard
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === 'dashboard' ? 'text-white' : 'text-[#0A6ED1]'
                        }`}
                      />
                      <span>Live Monitor</span>
                    </button>
                  )}

                  {canViewTickets && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('list')}
                      className={`app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !rounded-lg ${
                        activeTab === 'list'
                          ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-950'
                          : '!shadow-none bg-transparent text-[#354A5F] hover:text-red-900 hover:bg-white/80'
                      }`}
                    >
                      <TableIcon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === 'list' ? 'text-white' : 'text-[#354A5F]'
                        }`}
                      />
                      <span>All Tickets Ledger ({dayTickets.length})</span>
                    </button>
                  )}

                  {canViewDispatchDetails && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('dispatch')}
                      className={`app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !rounded-lg ${
                        activeTab === 'dispatch'
                          ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-950'
                          : '!shadow-none bg-transparent text-[#354A5F] hover:text-red-900 hover:bg-white/80'
                      }`}
                    >
                      <ClipboardList
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === 'dispatch' ? 'text-white' : 'text-[#0A6ED1]'
                        }`}
                      />
                      <span>Dispatch Details</span>
                    </button>
                  )}

                  {canViewDispatchDetails && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('material_register')}
                      className={`app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !rounded-lg ${
                        activeTab === 'material_register'
                          ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-950'
                          : '!shadow-none bg-transparent text-[#354A5F] hover:text-red-900 hover:bg-white/80'
                      }`}
                    >
                      <FileText
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === 'material_register' ? 'text-white' : 'text-[#0A6ED1]'
                        }`}
                      />
                      <span>Material Register</span>
                    </button>
                  )}

                  {canOperateForklift && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('forklift')}
                      className={`app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !rounded-lg ${
                        activeTab === 'forklift'
                          ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-950'
                          : '!shadow-none bg-transparent text-[#354A5F] hover:text-red-900 hover:bg-white/80'
                      }`}
                    >
                      <PackageCheck
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === 'forklift' ? 'text-white' : 'text-[#107E3E]'
                        }`}
                      />
                      <span>Forklift Loading ({pendingForkliftCount})</span>
                    </button>
                  )}

                  {canAccessLiquidStore && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('liquid')}
                      className={`app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !rounded-lg ${
                        activeTab === 'liquid'
                          ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-950'
                          : '!shadow-none bg-transparent text-[#354A5F] hover:text-red-900 hover:bg-white/80'
                      }`}
                    >
                      <Droplets
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === 'liquid' ? 'text-white' : 'text-[#0070F2]'
                        }`}
                      />
                      <span>Liquid Store</span>
                    </button>
                  )}

                  {canAccessExFactory && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('exfactory')}
                      className={`app-btn-sm !h-7 !min-h-[28px] !px-2.5 !text-[11px] !rounded-lg ${
                        activeTab === 'exfactory'
                          ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white ring-1 ring-red-950'
                          : '!shadow-none bg-transparent text-[#354A5F] hover:text-red-900 hover:bg-white/80'
                      }`}
                    >
                      <Truck
                        className={`w-3.5 h-3.5 shrink-0 ${
                          activeTab === 'exfactory' ? 'text-white' : 'text-[#E9730C]'
                        }`}
                      />
                      <span>Ex-Factory</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Left-Side 3-Dots Slide-Out Drawer (Sections + Management Tools + Account) */}
      {mobileHeaderMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Sections and Tools Drawer"
          className="print:hidden fixed inset-0 z-50 md:hidden flex"
        >
          <div
            className="fixed inset-0 bg-[#0F172A]/70 backdrop-blur-xs"
            onClick={() => setMobileHeaderMenuOpen(false)}
          />

          <aside className="relative z-10 w-[86%] max-w-xs h-full bg-gradient-to-b from-[#34495E] via-[#263748] to-[#1B2836] text-white border-r border-[#4F6B88] shadow-[12px_0_32px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#F0AB00] via-[#0A6ED1] to-[#107E3E] shrink-0" />

            {/* Drawer Top Brand + Close */}
            <div className="px-4 py-3.5 border-b border-white/15 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {settings.logoDataUrl ? (
                  <div className="w-10 h-10 rounded-xl bg-white p-0.5 flex items-center justify-center shrink-0 ring-2 ring-[#F0AB00]/80 overflow-hidden">
                    <img
                      src={settings.logoDataUrl}
                      alt={settings.companyName}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1882EB] to-[#00448E] flex items-center justify-center text-[#F0AB00] shrink-0 ring-2 ring-[#F0AB00]/70">
                    <Building2 className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{settings.companyName}</p>
                  <p className="text-[11px] text-[#B8CAE0] truncate">
                    {isForkliftOperator
                      ? 'Forklift Operator Section'
                      : isLiquidStoreOnly
                      ? 'Liquid Material Camp Store'
                      : isExFactoryOnly
                      ? 'Ex-Factory Dispatch'
                      : 'Gate Queue & Dispatch'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileHeaderMenuOpen(false)}
                aria-label="Close menu"
                className="w-10 h-10 rounded-xl bg-[#1F3040] hover:bg-[#354A5F] border border-[#4F6B88] text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Menu Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Signed-In User Card */}
              <div className="bg-[#1B2A38] border border-[#45607A] rounded-2xl p-3.5 space-y-1 shadow-[inset_0_2px_5px_rgba(0,0,0,0.3)]">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-[#F0AB00] shrink-0" />
                  <span className="text-sm font-black text-white truncate">{currentUser.fullName}</span>
                </div>
                <p className="text-xs text-[#B8CAE0] pl-6">
                  @{currentUser.username} · {currentUser.roleDisplayName}
                </p>
              </div>

              {/* Section Links (Hidden for Single-Section Roles) */}
              {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && (
                <div className="space-y-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#9BB0C7] px-1">
                    App Sections
                  </p>
                  <div className="space-y-2">
                    {canViewTickets && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('dashboard');
                          setMobileHeaderMenuOpen(false);
                        }}
                        className={`app-btn w-full justify-start ${
                          activeTab === 'dashboard'
                            ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white border border-red-950'
                            : 'bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]'
                        }`}
                      >
                        <LayoutDashboard
                          className={`w-4 h-4 shrink-0 ${
                            activeTab === 'dashboard' ? 'text-white' : 'text-[#68AEFF]'
                          }`}
                        />
                        <span>Live Monitor</span>
                      </button>
                    )}

                    {canViewTickets && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('list');
                          setMobileHeaderMenuOpen(false);
                        }}
                        className={`app-btn w-full justify-between ${
                          activeTab === 'list'
                            ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white border border-red-950'
                            : 'bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <TableIcon className="w-4 h-4 shrink-0" />
                          <span>All Tickets Ledger</span>
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-black/25 text-white tabular-nums">
                          {dayTickets.length}
                        </span>
                      </button>
                    )}

                    {canViewDispatchDetails && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('dispatch');
                          setMobileHeaderMenuOpen(false);
                        }}
                        className={`app-btn w-full justify-start ${
                          activeTab === 'dispatch'
                            ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white border border-red-950'
                            : 'bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]'
                        }`}
                      >
                        <ClipboardList
                          className={`w-4 h-4 shrink-0 ${
                            activeTab === 'dispatch' ? 'text-white' : 'text-[#68AEFF]'
                          }`}
                        />
                        <span>Dispatch Details</span>
                      </button>
                    )}

                    {canViewDispatchDetails && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('material_register');
                          setMobileHeaderMenuOpen(false);
                        }}
                        className={`app-btn w-full justify-start ${
                          activeTab === 'material_register'
                            ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white border border-red-950'
                            : 'bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]'
                        }`}
                      >
                        <FileText
                          className={`w-4 h-4 shrink-0 ${
                            activeTab === 'material_register' ? 'text-white' : 'text-[#68AEFF]'
                          }`}
                        />
                        <span>Material Register</span>
                      </button>
                    )}

                    {canOperateForklift && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('forklift');
                          setMobileHeaderMenuOpen(false);
                        }}
                        className={`app-btn w-full justify-between ${
                          activeTab === 'forklift'
                            ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white border border-red-950'
                            : 'bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <PackageCheck
                            className={`w-4 h-4 shrink-0 ${
                              activeTab === 'forklift' ? 'text-white' : 'text-[#68D391]'
                            }`}
                          />
                          <span>Forklift Loading</span>
                        </span>
                        <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-black/25 text-white tabular-nums">
                          {pendingForkliftCount}
                        </span>
                      </button>
                    )}

                    {canAccessLiquidStore && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('liquid');
                          setMobileHeaderMenuOpen(false);
                        }}
                        className={`app-btn w-full justify-start ${
                          activeTab === 'liquid'
                            ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white border border-red-950'
                            : 'bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]'
                        }`}
                      >
                        <Droplets
                          className={`w-4 h-4 shrink-0 ${
                            activeTab === 'liquid' ? 'text-white' : 'text-[#68AEFF]'
                          }`}
                        />
                        <span className="truncate">Liquid Material Camp Store</span>
                      </button>
                    )}

                    {canAccessExFactory && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('exfactory');
                          setMobileHeaderMenuOpen(false);
                        }}
                        className={`app-btn w-full justify-start ${
                          activeTab === 'exfactory'
                            ? 'bg-gradient-to-b from-[#B91C1C] to-[#7F1D1D] text-white border border-red-950'
                            : 'bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]'
                        }`}
                      >
                        <Truck
                          className={`w-4 h-4 shrink-0 ${
                            activeTab === 'exfactory' ? 'text-white' : 'text-[#F0AB00]'
                          }`}
                        />
                        <span>Ex-Factory</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Date Switcher (Hidden for Single-Section Roles) */}
              {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && (
                <div className="space-y-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#9BB0C7] px-1">
                    Active Dispatch Date
                  </p>
                  <div className="relative flex items-center justify-between h-11 bg-[#2B3E50] hover:bg-[#3A526A] rounded-xl border border-[#4F6B88] px-3.5 gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_3px_0_#192735]">
                    <div className="flex items-center gap-2 pointer-events-none">
                      <Calendar className="w-4 h-4 text-[#F0AB00] shrink-0" />
                      <span className="text-sm font-black tracking-wide text-white font-mono">
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
                          // Fallback to native input behavior
                        }
                      }}
                      aria-label="Select App Date"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {selectedDate !== getTodayDateString() && (
                      <button
                        type="button"
                        onClick={() => setSelectedDate(getTodayDateString())}
                        className="relative z-10 h-7 px-2.5 text-[11px] bg-[#0A6ED1] hover:bg-[#085CAF] text-white rounded-lg font-bold cursor-pointer whitespace-nowrap"
                      >
                        Today
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Management Tools */}
              {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && (
                <div className="space-y-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#9BB0C7] px-1">
                    Management Tools
                  </p>
                  <div className="space-y-2">
                    {canCreateTickets && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileHeaderMenuOpen(false);
                          setShowNewTicketModal(true);
                        }}
                        className="app-btn w-full justify-start bg-[#F0AB00] hover:bg-[#FFC11E] text-[#1C2833] font-black border border-[#FFD154]"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span>New Gate Ticket</span>
                      </button>
                    )}

                    {canManageDrivers && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileHeaderMenuOpen(false);
                          setShowDriverMasterModal(true);
                        }}
                        className="app-btn w-full justify-start bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                      >
                        <Users className="w-4 h-4 text-[#F0AB00] shrink-0" />
                        <span>Driver Master</span>
                      </button>
                    )}

                    {canViewReports && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileHeaderMenuOpen(false);
                          setShowDailyReportModal(true);
                        }}
                        className="app-btn w-full justify-start bg-[#107E3E] hover:bg-[#0D6B34] text-white border border-[#24A159]"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-white shrink-0" />
                        <span>Daily Report</span>
                      </button>
                    )}

                    {canViewTickets && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileHeaderMenuOpen(false);
                          setShowDriverStatusView(true);
                          window.history.replaceState(null, '', '/#driver-status');
                        }}
                        className="app-btn w-full justify-start bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                      >
                        <Truck className="w-4 h-4 text-[#F0AB00] shrink-0" />
                        <span>Driver Status</span>
                      </button>
                    )}

                    {canManageSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileHeaderMenuOpen(false);
                          setShowSettingsModal(true);
                        }}
                        className="app-btn w-full justify-between bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Settings className="w-4 h-4 text-[#68AEFF] shrink-0" />
                          <span>Settings</span>
                        </span>
                        {waPendingRetryCount > 0 && (
                          <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-[#BB0000] text-white tabular-nums">
                            {waPendingRetryCount}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Account & Security */}
              <div className="space-y-2 pt-2 border-t border-white/15">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#9BB0C7] px-1">
                  Account &amp; Security
                </p>
                <div className="space-y-2">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileHeaderMenuOpen(false);
                        setShowAdminModal(true);
                      }}
                      className="app-btn w-full justify-start bg-[#0A6ED1] hover:bg-[#085CAF] text-white border border-[#3B93EE]"
                    >
                      <Shield className="w-4 h-4 text-white shrink-0" />
                      <span>Admin Users</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setMobileHeaderMenuOpen(false);
                      setShowChangePasswordModal(true);
                    }}
                    className="app-btn w-full justify-start bg-[#2B3E50] hover:bg-[#3A526A] text-[#F4F7FA] border border-[#4A6580]"
                  >
                    <KeyRound className="w-4 h-4 text-[#F0AB00] shrink-0" />
                    <span>Change Password</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileHeaderMenuOpen(false);
                      handleLogout();
                    }}
                    className="app-btn w-full justify-start bg-[#BB0000] hover:bg-[#9E0000] text-white border border-[#E04F4F]"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Centered Autofit 3D Content Area */}
      <main className="max-w-[1440px] mx-auto px-3 sm:px-6 py-4 sm:py-5 flex-1 w-full space-y-4">
        {appError && (
          <div
            role="alert"
            className="bg-[#FFF0F0] border border-[#F4B8B8] text-[#BB0000] px-5 py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-between gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_0_#E6B3B3,0_10px_22px_-6px_rgba(187,0,0,0.16)]"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#BB0000] shrink-0" />
              <span>{appError}</span>
            </span>
            <button
              type="button"
              onClick={() => setAppError(null)}
              className="p-1 text-[#BB0000] hover:text-red-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Automatic WhatsApp Notification Status & Retry Banner */}
        {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && waToast && (
          <div
            role="status"
            className={`px-4 py-3 rounded-xl border text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs ${
              waToast.type === 'sent'
                ? 'bg-[#F1FDF6] border-[#72C896] text-[#0D4A26]'
                : waToast.type === 'skipped'
                ? 'bg-[#FFFBEB] border-[#F3CC60] text-[#854D0E]'
                : 'bg-[#FFF0F0] border-[#F4B8B8] text-[#BB0000]'
            }`}
          >
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0">
                <p className="font-bold">
                  {waToast.truckNumber} ({waToast.ticketNumber}) — {waToast.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {waToast.liveStatusUrl && (
                <a
                  href={waToast.liveStatusUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-btn-sm bg-white hover:bg-[#EFF4F9] text-[#0A6ED1] border border-[#B8DCFF]"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>Open Driver Link</span>
                </a>
              )}
              {waToast.type !== 'sent' && canUpdateTickets && (
                <button
                  type="button"
                  onClick={handleRetryWhatsAppToast}
                  disabled={waToast.retrying}
                  className="app-btn-sm bg-[#0A6ED1] hover:bg-[#085CAF] text-white disabled:opacity-60"
                >
                  {waToast.retrying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Send className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>Retry WhatsApp Message</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowWhatsAppLogsModal(true)}
                className="app-btn-sm bg-white hover:bg-[#EFF4F9] text-[#354A5F] border border-[#BCC8D4]"
              >
                <span>View Logs</span>
              </button>
              <button
                type="button"
                onClick={() => setWaToast(null)}
                className="p-1 opacity-75 hover:opacity-100 cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Loading Completed Alerts Banner (Hidden for Restricted Single-Section Users) */}
        {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && canViewTickets && loadingAlerts.length > 0 && (
          <div className="space-y-2">
            {loadingAlerts.slice(0, 3).map((alert) => {
              const matchedTicket = tickets.find((t) => t.id === alert.ticketId);
              return (
                <div
                  key={alert.id}
                  role="status"
                  className="bg-[#F1FDF6] border border-[#72C896] text-[#0D4A26] px-4 py-3 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 bg-[#107E3E] text-white rounded-lg shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="text-xs space-y-0.5 min-w-0">
                      <p className="font-black text-sm text-[#0D4A26] tracking-wide">
                        Loading Completed
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#10572D]">
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
                        className="app-btn-sm bg-white hover:bg-[#E4F7EB] text-[#107E3E] border border-[#ABE2C2]"
                      >
                        <Printer className="w-3.5 h-3.5 shrink-0" />
                        <span>Print Slip</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDismissAlert(alert.id)}
                      className="app-btn-sm bg-[#107E3E] hover:bg-[#0D6B34] text-white"
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

        {/* Search & Filters Bar (for Monitor & Ledger tabs) */}
        {!isForkliftOperator &&
          !isLiquidStoreOnly &&
          !isExFactoryOnly &&
          activeTab !== 'dispatch' &&
          activeTab !== 'material_register' &&
          activeTab !== 'forklift' &&
          activeTab !== 'liquid' &&
          activeTab !== 'exfactory' && (
            <div className="surface-3d p-2.5 sm:p-3 rounded-2xl flex flex-wrap items-center justify-center gap-2">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#5B738B] pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search truck, driver, ticket..."
                  className="inset-3d w-full h-9 pl-8.5 pr-3 text-xs rounded-lg border border-[#C2D0DF] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] focus:border-[#0A6ED1] bg-[#F4F8FC] text-[#1C2833] font-medium"
                />
              </div>

              {/* Gate Filter */}
              <select
                value={gateFilter}
                onChange={(e) => setGateFilter(e.target.value)}
                className="inset-3d h-9 text-xs font-bold px-2.5 rounded-lg border border-[#C2D0DF] bg-[#F4F8FC] text-[#1C2833] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] cursor-pointer"
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
                className="inset-3d h-9 text-xs font-bold px-2.5 rounded-lg border border-[#C2D0DF] bg-[#F4F8FC] text-[#1C2833] focus:outline-none focus:ring-2 focus:ring-[#0A6ED1] cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="waiting">Waiting in Queue</option>
                <option value="called">Called to Gate</option>
                <option value="under_loading">Under Loading</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

        {/* Tab 1: Live Gate Queue Dashboard */}
        {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && canViewTickets && activeTab === 'dashboard' && (
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

        {/* Tab 2: All Records Table */}
        {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && canViewTickets && activeTab === 'list' && (
          <TicketTable
            tickets={filteredTickets}
            gates={settings.gates}
            onOpenLoadingSlip={(t) => setActiveTicketForSlip(t)}
            onPrintLoadingSlip={(t) => setActiveTicketForPrintSlip(t)}
            onPrintTicket={(t) => setActiveTicketForPrintTicket(t)}
            onOpenWhatsApp={(t) => setActiveTicketForWhatsApp({ ticket: t, templateId: 'gate_call' })}
            onStatusChange={handleStatusChange}
            onGateChange={handleGateChange}
            onEditTicket={(t) => setActiveTicketForEdit(t)}
            onDeleteTicket={handleDeleteTicket}
            canUpdate={canUpdateTickets}
            canDelete={canDeleteTickets}
            canPrint={canPrintSlips}
          />
        )}

        {/* Tab 2B: Dispatch Details Material-Wise Summary Sheet */}
        {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && canViewDispatchDetails && activeTab === 'dispatch' && (
          <DispatchDetailsView
            key="dispatch-summary"
            tickets={tickets}
            settings={settings}
            selectedDate={selectedDate}
            canAccessExFactory={canAccessExFactory}
            sectionMode="summary"
            onRefreshTickets={() => loadData(false)}
          />
        )}

        {/* Tab 2C: Separate Detailed Loading Slip Material Register Section */}
        {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && canViewDispatchDetails && activeTab === 'material_register' && (
          <DispatchDetailsView
            key="material-register"
            tickets={tickets}
            settings={settings}
            selectedDate={selectedDate}
            canAccessExFactory={canAccessExFactory}
            sectionMode="register"
            onRefreshTickets={() => loadData(false)}
          />
        )}

        {/* Tab 3: Forklift Operator Loading (Dedicated View for Forklift Operator Role) */}
        {(isForkliftOperator || (!isLiquidStoreOnly && !isExFactoryOnly && activeTab === 'forklift' && canOperateForklift)) &&
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

        {/* Tab 4: Liquid Material Camp Store (Exclusive Section when Liquid-Store-Only, or Tab when Multi-Access) */}
        {!isForkliftOperator && !isExFactoryOnly && (isLiquidStoreOnly || activeTab === 'liquid') &&
          (canAccessLiquidStore ? (
            <LiquidMaterialStoreView
              currentUser={currentUser}
              companyLogoUrl={settings.logoDataUrl}
            />
          ) : (
            <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center space-y-2 shadow-sm">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <h3 className="text-sm font-black text-neutral-900">Liquid Store Permissions Required</h3>
              <p className="text-xs text-neutral-600">
                Your Liquid Store Operator account does not currently have active store permissions. Please contact your Administrator.
              </p>
            </div>
          ))}

        {/* Tab 5: Ex-Factory Dispatch Section (Exclusive Section when Ex-Factory-Only, or Tab when Multi-Access) */}
        {!isForkliftOperator && !isLiquidStoreOnly && (isExFactoryOnly || activeTab === 'exfactory') &&
          (canViewExFactory ? (
            <ExFactoryView
              currentUser={currentUser}
              drivers={StorageService.getDrivers()}
              settings={settings}
              facilityName={settings.companyName}
              companyLogoUrl={settings.logoDataUrl}
              canCreate={canCreateExFactory}
              canUpdate={canUpdateExFactory}
              canDelete={canDeleteExFactory}
            />
          ) : (
            <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center space-y-2 shadow-sm">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <h3 className="text-sm font-black text-neutral-900">Ex-Factory Permissions Required</h3>
              <p className="text-xs text-neutral-600">
                Your account does not currently have permission to view the Ex-Factory Dispatch section. Please contact your Administrator.
              </p>
            </div>
          ))}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            {settings.companyName} •{' '}
            {isLiquidStoreOnly
              ? 'Liquid Material Camp Store'
              : isExFactoryOnly
              ? 'Ex-Factory Dispatch'
              : 'Material Loading Gate Queue & 2-Copy A4 Loading Slip Manager'}
          </p>
          <p className="text-[11px] text-neutral-400">
            {isLiquidStoreOnly || isExFactoryOnly
              ? `Operator: ${currentUser.fullName} (${currentUser.roleDisplayName})`
              : `Date: ${formatDisplayDate(selectedDate)} | Total Entries: ${dayTickets.length} | Operator: ${currentUser.fullName} (${currentUser.roleDisplayName})`}
          </p>
        </div>
      </footer>

      {/* MODALS (Restricted modals hidden for Forklift Operators, Liquid-Store-Only & Ex-Factory-Only Users) */}
      {/* 1. New Ticket Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && showNewTicketModal && canCreateTickets && (
        <NewTicketModal
          date={selectedDate}
          settings={settings}
          onSave={handleSaveNewTicket}
          onClose={() => setShowNewTicketModal(false)}
        />
      )}

      {/* 1b. Edit Ticket & Change Gate Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && activeTicketForEdit && canUpdateTickets && (
        <EditTicketModal
          ticket={activeTicketForEdit}
          settings={settings}
          onSave={async () => {
            setActiveTicketForEdit(null);
            await loadData();
          }}
          onClose={() => setActiveTicketForEdit(null)}
        />
      )}

      {/* 2. Loading Slip 8-Rows Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && activeTicketForSlip && (
        <LoadingSlipModal
          ticket={activeTicketForSlip}
          settings={settings}
          currentUserId={currentUser.id}
          storeInchargeFullName={currentUser.fullName}
          storeInchargeSignatureDataUrl={currentUser.signatureDataUrl}
          onSave={handleSaveLoadingSlip}
          onClose={() => setActiveTicketForSlip(null)}
        />
      )}

      {/* 3. 2-Copy A4 Loading Slip Print Preview Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && activeTicketForPrintSlip && (
        <LoadingSlipPrintView
          ticket={activeTicketForPrintSlip}
          settings={settings}
          currentUserId={currentUser.id}
          storeInchargeFullName={currentUser.fullName}
          storeInchargeSignatureDataUrl={currentUser.signatureDataUrl}
          onClose={() => setActiveTicketForPrintSlip(null)}
        />
      )}

      {/* 4. Compact Gate Token Print View */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && activeTicketForPrintTicket && (
        <TicketPrintView
          ticket={activeTicketForPrintTicket}
          settings={settings}
          onClose={() => setActiveTicketForPrintTicket(null)}
        />
      )}

      {/* 5. WhatsApp Message Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && activeTicketForWhatsApp && (
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
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && showDriverMasterModal && (
        <DriverMasterModal
          canManage={canManageDrivers}
          onClose={() => setShowDriverMasterModal(false)}
        />
      )}

      {/* 7. Daily Report & Export Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && showDailyReportModal && canViewReports && (
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
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && showSettingsModal && canManageSettings && (
        <SettingsModal
          settings={settings}
          isAdmin={isAdmin}
          canViewWhatsAppLogs={canViewTickets}
          waPendingRetryCount={waPendingRetryCount}
          onOpenWhatsAppLogs={() => {
            setShowSettingsModal(false);
            setShowWhatsAppLogsModal(true);
          }}
          onOpenWhatsAppTemplates={() => {
            setShowSettingsModal(false);
            setShowWhatsAppTemplatesModal(true);
          }}
          onSave={(newSettings) => {
            setSettings(newSettings);
            setPublicBranding({
              companyName: newSettings.companyName,
              companySubtitle: newSettings.companySubtitle,
              logoDataUrl: newSettings.logoDataUrl,
            });
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
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && showAdminModal && isAdmin && (
        <AdminDashboardModal
          currentUser={currentUser}
          onCurrentUserUpdated={(updatedUser) => setCurrentUser(updatedUser)}
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

      {/* 11. WhatsApp Notification Logs & Retry Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && showWhatsAppLogsModal && canViewTickets && (
        <WhatsAppLogsModal
          canRetry={canUpdateTickets}
          isAdmin={isAdmin}
          onOpenTemplates={() => {
            setShowWhatsAppLogsModal(false);
            setShowWhatsAppTemplatesModal(true);
          }}
          onRetrySuccess={() => {
            loadData();
          }}
          onClose={() => {
            setShowWhatsAppLogsModal(false);
            loadData();
          }}
        />
      )}

      {/* 12. Admin WhatsApp Message Templates Editor Modal */}
      {!isForkliftOperator && !isLiquidStoreOnly && !isExFactoryOnly && showWhatsAppTemplatesModal && isAdmin && (
        <WhatsAppTemplatesModal
          settings={settings}
          onSaved={(updatedSettings) => {
            setSettings(updatedSettings);
            loadData();
          }}
          onClose={() => setShowWhatsAppTemplatesModal(false)}
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
