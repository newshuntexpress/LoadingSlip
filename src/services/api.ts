import {
  TicketRecord,
  DriverMasterRecord,
  CompanySettings,
  PublicBranding,
  AuthUser,
  UserRoleName,
  RoleOption,
  PermissionOption,
  AuditLogEntry,
  ActiveSessionInfo,
  LoadingAlertNotification,
  LiquidStoreState,
  LiquidStoreSettings,
  ExFactoryEntry,
  DriverLiveStatusResponse,
  DriverTokenStatusResponse,
  WhatsAppNotificationLog,
  WhatsAppDispatchOutcome,
} from '../types';

const SESSION_TOKEN_STORAGE_KEY = 'gp_tab_session_token';
let inMemoryCsrfToken: string | null = null;
let inMemorySessionToken: string | null = (() => {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
})();
let unauthorizedHandler: (() => void) | null = null;
let passwordChangeRequiredHandler: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function setSessionToken(token: string | null): void {
  inMemorySessionToken = token;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (token) {
        sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      }
    }
  } catch {
    // Fallback cleanly to in-memory only if sessionStorage is restricted
  }
}

export function setAuthErrorHandlers(handlers: {
  onUnauthorized: () => void;
  onPasswordChangeRequired: () => void;
}): void {
  unauthorizedHandler = handlers.onUnauthorized;
  passwordChangeRequiredHandler = handlers.onPasswordChangeRequired;
}

async function request<T>(url: string, options: RequestInit = {}, skipAuthHooks = false): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (inMemorySessionToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${inMemorySessionToken}`;
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && inMemoryCsrfToken) {
    headers['X-CSRF-Token'] = inMemoryCsrfToken;
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
    cache: 'no-store',
  });

  let data: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    const code = data?.code;

    if (!skipAuthHooks) {
      if (res.status === 401 && unauthorizedHandler) {
        inMemoryCsrfToken = null;
        setSessionToken(null);
        unauthorizedHandler();
      } else if (res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED' && passwordChangeRequiredHandler) {
        passwordChangeRequiredHandler();
      }
    }

    throw new ApiError(message, res.status, code);
  }

  return data as T;
}

export const ApiClient = {
  // Auth
  async getAuthStatus(): Promise<{
    authenticated: boolean;
    needsSetup: boolean;
    user?: AuthUser;
    csrfToken?: string;
    branding?: PublicBranding;
  }> {
    const res = await request<{
      authenticated: boolean;
      needsSetup: boolean;
      user?: AuthUser;
      csrfToken?: string;
      branding?: PublicBranding;
    }>('/api/auth/status', {}, true);
    if (res.csrfToken) setCsrfToken(res.csrfToken);
    if (!res.authenticated) setSessionToken(null);
    return res;
  },

  async lookupDriverStatus(truckNumber: string): Promise<DriverLiveStatusResponse> {
    return request<DriverLiveStatusResponse>(
      '/api/public/driver-status',
      {
        method: 'POST',
        body: JSON.stringify({ truckNumber }),
      },
      true
    );
  },

  async getTokenDriverLoadingStatus(token: string): Promise<DriverTokenStatusResponse> {
    const res = await fetch(`/api/public/driver-loading-status/${encodeURIComponent(token)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      throw new ApiError('Unable to reach server to check live loading status.', res.status);
    }
    if (res.status === 429) {
      throw new ApiError(data?.error || 'Too many requests. Please wait a moment.', 429);
    }
    return data as DriverTokenStatusResponse;
  },

  async setupInitialAdmin(payload: {
    username: string;
    fullName: string;
    email?: string;
    password: string;
  }): Promise<{ user: AuthUser; csrfToken: string }> {
    const res = await request<{ user: AuthUser; csrfToken: string; sessionToken?: string }>(
      '/api/auth/setup',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      true
    );
    setCsrfToken(res.csrfToken);
    if (res.sessionToken) setSessionToken(res.sessionToken);
    return res;
  },

  async login(username: string, password: string): Promise<{ user: AuthUser; csrfToken: string }> {
    const res = await request<{ user: AuthUser; csrfToken: string; sessionToken?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      true
    );
    setCsrfToken(res.csrfToken);
    if (res.sessionToken) setSessionToken(res.sessionToken);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' }, true);
    } finally {
      setCsrfToken(null);
      setSessionToken(null);
    }
  },

  async getMe(): Promise<{ user: AuthUser; csrfToken: string }> {
    const res = await request<{ user: AuthUser; csrfToken: string }>('/api/auth/me');
    if (res.csrfToken) setCsrfToken(res.csrfToken);
    return res;
  },

  async changeOwnPassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ user: AuthUser; csrfToken: string; message: string }> {
    const res = await request<{ user: AuthUser; csrfToken: string; sessionToken?: string; message: string }>(
      '/api/auth/change-password',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }
    );
    if (res.csrfToken) setCsrfToken(res.csrfToken);
    if (res.sessionToken) setSessionToken(res.sessionToken);
    return res;
  },

  // Admin User Management & Audit
  async getRolesAndPermissions(): Promise<{ roles: RoleOption[]; permissions: PermissionOption[] }> {
    return request('/api/admin/roles');
  },

  async getUsers(): Promise<{ users: AuthUser[] }> {
    return request('/api/admin/users');
  },

  async createUser(payload: {
    username: string;
    fullName: string;
    email?: string;
    temporaryPassword: string;
    roleName: UserRoleName;
    isActive: boolean;
    permissions?: string[];
    signatureDataUrl?: string;
  }): Promise<{ user: AuthUser }> {
    return request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateUser(
    userId: string,
    payload: {
      fullName?: string;
      email?: string;
      roleName?: UserRoleName;
      isActive?: boolean;
      signatureDataUrl?: string;
    }
  ): Promise<{ user: AuthUser }> {
    return request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async uploadUserSignature(userId: string, signatureDataUrl: string): Promise<{ user: AuthUser }> {
    return request(`/api/admin/users/${encodeURIComponent(userId)}/signature`, {
      method: 'PUT',
      body: JSON.stringify({ signatureDataUrl }),
    });
  },

  async deleteUserSignature(userId: string): Promise<{ user: AuthUser }> {
    return request(`/api/admin/users/${encodeURIComponent(userId)}/signature`, {
      method: 'DELETE',
    });
  },

  async updateUserPermissions(userId: string, permissions: string[]): Promise<{ user: AuthUser }> {
    return request(`/api/admin/users/${encodeURIComponent(userId)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    });
  },

  async resetUserPassword(userId: string, temporaryPassword: string): Promise<{ ok: boolean; user: AuthUser }> {
    return request(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ temporaryPassword }),
    });
  },

  async revokeUserSessions(userId: string): Promise<{ ok: boolean }> {
    return request(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
      method: 'POST',
    });
  },

  async deleteUser(userId: string): Promise<{ ok: boolean }> {
    return request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },

  async getAuditLogs(params?: { action?: string; search?: string; limit?: number }): Promise<{ logs: AuditLogEntry[] }> {
    const qs = new URLSearchParams();
    if (params?.action) qs.set('action', params.action);
    if (params?.search) qs.set('search', params.search);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request(`/api/admin/audit-logs${query ? `?${query}` : ''}`);
  },

  async getActiveSessions(): Promise<{ sessions: ActiveSessionInfo[] }> {
    return request('/api/admin/sessions');
  },

  // Application Data
  async getTickets(): Promise<TicketRecord[]> {
    const res = await request<{ tickets: TicketRecord[] }>('/api/tickets');
    return res.tickets;
  },

  async createTicket(payload: Omit<TicketRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<TicketRecord> {
    const res = await request<{ ticket: TicketRecord }>('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.ticket;
  },

  async updateTicket(id: string, updates: Partial<TicketRecord>): Promise<TicketRecord> {
    const res = await request<{ ticket: TicketRecord }>(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.ticket;
  },

  async updateTicketWithNotification(
    id: string,
    updates: Partial<TicketRecord>
  ): Promise<{ ticket: TicketRecord; whatsappNotification?: WhatsAppDispatchOutcome }> {
    return request<{ ticket: TicketRecord; whatsappNotification?: WhatsAppDispatchOutcome }>(
      `/api/tickets/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  },

  async getWhatsAppLogs(ticketId?: string): Promise<WhatsAppNotificationLog[]> {
    const qs = ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : '';
    const res = await request<{ logs: WhatsAppNotificationLog[] }>(`/api/whatsapp/logs${qs}`);
    return res.logs;
  },

  async retryWhatsAppNotification(
    ticketId: string
  ): Promise<{ outcome: WhatsAppDispatchOutcome; ticket: TicketRecord }> {
    return request<{ outcome: WhatsAppDispatchOutcome; ticket: TicketRecord }>(
      `/api/whatsapp/retry/${encodeURIComponent(ticketId)}`,
      { method: 'POST' }
    );
  },

  async deleteTicket(id: string): Promise<void> {
    await request(`/api/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async restoreTicket(ticket: TicketRecord): Promise<TicketRecord> {
    const res = await request<{ ticket: TicketRecord }>('/api/tickets/restore', {
      method: 'POST',
      body: JSON.stringify(ticket),
    });
    return res.ticket;
  },

  // Forklift Operator Loading
  async openTicketForForklift(ticketId: string): Promise<TicketRecord> {
    const res = await request<{ ticket: TicketRecord }>(`/api/tickets/${encodeURIComponent(ticketId)}/forklift/open`, {
      method: 'POST',
    });
    return res.ticket;
  },

  async updateForkliftChecklist(
    ticketId: string,
    payload: {
      itemUpdates: Array<{
        index: number;
        isLoaded?: boolean;
        loadedQty?: string;
        remarks?: string;
      }>;
      version?: number;
    }
  ): Promise<TicketRecord> {
    const res = await request<{ ticket: TicketRecord }>(
      `/api/tickets/${encodeURIComponent(ticketId)}/forklift/checklist`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
    return res.ticket;
  },

  async completeForkliftLoading(
    ticketId: string,
    version?: number
  ): Promise<{ ticket: TicketRecord; alert: LoadingAlertNotification }> {
    return request<{ ticket: TicketRecord; alert: LoadingAlertNotification }>(
      `/api/tickets/${encodeURIComponent(ticketId)}/forklift/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ version }),
      }
    );
  },

  async getLoadingAlerts(): Promise<LoadingAlertNotification[]> {
    const res = await request<{ alerts: LoadingAlertNotification[] }>('/api/loading-alerts');
    return res.alerts;
  },

  async dismissLoadingAlert(alertId: string): Promise<void> {
    await request(`/api/loading-alerts/${encodeURIComponent(alertId)}/dismiss`, {
      method: 'POST',
    });
  },

  async getDrivers(): Promise<DriverMasterRecord[]> {
    const res = await request<{ drivers: DriverMasterRecord[] }>('/api/drivers');
    return res.drivers;
  },

  async saveDriver(driver: Partial<DriverMasterRecord>): Promise<DriverMasterRecord> {
    if (driver.id) {
      const res = await request<{ driver: DriverMasterRecord }>(`/api/drivers/${encodeURIComponent(driver.id)}`, {
        method: 'PUT',
        body: JSON.stringify(driver),
      });
      return res.driver;
    }
    const res = await request<{ driver: DriverMasterRecord }>('/api/drivers', {
      method: 'POST',
      body: JSON.stringify(driver),
    });
    return res.driver;
  },

  async deleteDriver(id: string): Promise<void> {
    await request(`/api/drivers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getSettings(): Promise<{ settings: CompanySettings | null; defaultSettings: CompanySettings | null }> {
    return request('/api/settings');
  },

  async saveSettings(settings: CompanySettings): Promise<CompanySettings> {
    const res = await request<{ settings: CompanySettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return res.settings;
  },

  async saveAsDefaultSettings(settings: CompanySettings): Promise<CompanySettings> {
    const res = await request<{ settings: CompanySettings }>('/api/settings/default', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return res.settings;
  },

  async exportBackup(): Promise<Record<string, unknown>> {
    return request('/api/backup/export');
  },

  async restoreBackup(payload: Record<string, unknown>): Promise<void> {
    await request('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async migrateLegacyLocalStorageIfNeeded(): Promise<void> {
    try {
      const ticketsRaw = localStorage.getItem('mat_loading_tickets_v1');
      const driversRaw = localStorage.getItem('mat_loading_drivers_v1');
      const settingsRaw = localStorage.getItem('mat_loading_settings_v1');
      const defaultSettingsRaw = localStorage.getItem('mat_loading_default_settings_v1');
      if (!ticketsRaw && !driversRaw && !settingsRaw && !defaultSettingsRaw) return;

      await request('/api/bootstrap/migrate', {
        method: 'POST',
        body: JSON.stringify({
          tickets: ticketsRaw ? JSON.parse(ticketsRaw) : [],
          drivers: driversRaw ? JSON.parse(driversRaw) : [],
          settings: settingsRaw ? JSON.parse(settingsRaw) : undefined,
          defaultSettings: defaultSettingsRaw ? JSON.parse(defaultSettingsRaw) : undefined,
        }),
      });
    } catch {
      // Migration is best-effort for legacy local data
    }
  },

  // Liquid Material Camp Store
  async getLiquidState(): Promise<LiquidStoreState> {
    return request<LiquidStoreState>('/api/liquid/state');
  },

  async createLiquidTransaction(payload: {
    type: 'INWARD' | 'OUTWARD';
    txDate: string;
    tankId: number;
    materialName: string;
    quantityKg: number;
    referenceNumber: string;
    documentNumber?: string;
    partyName: string;
    vehicleNumber?: string;
    driverName?: string;
    remarks?: string;
  }): Promise<{ state: LiquidStoreState; txCode: string }> {
    return request<{ state: LiquidStoreState; txCode: string }>('/api/liquid/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateLiquidTransaction(
    id: number,
    payload: {
      type: 'INWARD' | 'OUTWARD';
      txDate: string;
      tankId: number;
      materialName: string;
      quantityKg: number;
      referenceNumber: string;
      documentNumber?: string;
      partyName: string;
      vehicleNumber?: string;
      driverName?: string;
      remarks?: string;
    }
  ): Promise<{ state: LiquidStoreState; txCode: string }> {
    return request<{ state: LiquidStoreState; txCode: string }>(`/api/liquid/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteLiquidTransaction(id: number): Promise<{ state: LiquidStoreState; txCode: string }> {
    return request<{ state: LiquidStoreState; txCode: string }>(`/api/liquid/transactions/${id}`, {
      method: 'DELETE',
    });
  },

  async createLiquidTank(payload: {
    name: string;
    totalCapacityKg: number;
    depthMeters: number;
    location: string;
    notes?: string;
  }): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>('/api/liquid/tanks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateLiquidTank(
    id: number,
    payload: {
      name: string;
      totalCapacityKg: number;
      depthMeters: number;
      location: string;
      notes?: string;
    }
  ): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>(`/api/liquid/tanks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteLiquidTank(id: number): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>(`/api/liquid/tanks/${id}`, {
      method: 'DELETE',
    });
  },

  async createLiquidMaterial(payload: {
    name: string;
    code?: string;
    description?: string;
  }): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>('/api/liquid/materials', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateLiquidMaterial(
    id: number,
    payload: {
      name: string;
      code?: string;
      description?: string;
    }
  ): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>(`/api/liquid/materials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteLiquidMaterial(id: number): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>(`/api/liquid/materials/${id}`, {
      method: 'DELETE',
    });
  },

  async updateLiquidSettings(payload: Partial<LiquidStoreSettings>): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>('/api/liquid/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async resetLiquidStore(): Promise<{ state: LiquidStoreState }> {
    return request<{ state: LiquidStoreState }>('/api/liquid/reset', {
      method: 'POST',
    });
  },

  // Ex-Factory Dispatch Entries
  async getExFactoryEntries(): Promise<ExFactoryEntry[]> {
    const res = await request<{ entries: ExFactoryEntry[] }>('/api/ex-factory');
    return res.entries;
  },

  async createExFactoryEntry(payload: {
    entryDate?: string;
    delNoteNumber: string;
    customerName: string;
    truckNumber: string;
    driverName?: string;
    mobileNumber?: string;
    iqamaNumber?: string;
  }): Promise<ExFactoryEntry> {
    const res = await request<{ entry: ExFactoryEntry }>('/api/ex-factory', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.entry;
  },

  async updateExFactoryEntry(
    id: string,
    payload: {
      entryDate?: string;
      delNoteNumber: string;
      customerName: string;
      truckNumber: string;
      driverName?: string;
      mobileNumber?: string;
      iqamaNumber?: string;
    }
  ): Promise<ExFactoryEntry> {
    const res = await request<{ entry: ExFactoryEntry }>(`/api/ex-factory/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.entry;
  },

  async deleteExFactoryEntry(id: string): Promise<void> {
    await request(`/api/ex-factory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
