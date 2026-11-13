import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface DbRole {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  created_at: number;
}

export interface DbPermission {
  id: string;
  key: string;
  name: string;
  category: string;
}

export interface SafeUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  roleDisplayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: number | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  permissions: string[];
  activeSessionCount?: number;
}

const DEFAULT_APP_SETTINGS = {
  companyName: 'SHREE BALAJI LOGISTICS & INDUSTRIAL PLANT',
  companySubtitle: 'Material Dispatch, Gate Queue & Loading Slip Management System',
  address: 'Plot No. 48-52, Industrial Area, Sector 5, Transport District',
  phone: '+966 11 456 7890',
  email: 'dispatch@balajilogistics.com',
  gstin: '310123456700003',
  gates: ['Gate 1', 'Gate 2', 'Gate 3', 'Gate 4'],
  ticketPrefix: 'TK',
  autoPrintTokenAfterSave: true,
  sessionIdleMinutes: 30,
};

const dataDir = process.env.DB_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'app.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    full_name TEXT NOT NULL,
    email TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    role_id TEXT NOT NULL REFERENCES roles(id),
    is_active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    last_login_at INTEGER,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    granted INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, permission_key)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id TEXT,
    actor_username TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    ticket_number TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    date TEXT NOT NULL,
    data_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    updated_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_date ON tickets(date);

  CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    truck_number TEXT UNIQUE NOT NULL COLLATE NOCASE,
    data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_by TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loading_alerts (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    ticket_number TEXT NOT NULL,
    del_note_number TEXT NOT NULL,
    truck_number TEXT NOT NULL,
    gate_number TEXT NOT NULL,
    completed_by TEXT NOT NULL,
    completed_time TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    dismissed_by_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_loading_alerts_created_at ON loading_alerts(created_at DESC);
`);

const SEED_PERMISSIONS: Array<{ id: string; key: string; name: string; category: string }> = [
  { id: 'perm_tickets_view', key: 'tickets.view', name: 'View Tickets & Live Gate Monitor', category: 'Operations' },
  { id: 'perm_tickets_create', key: 'tickets.create', name: 'Create New Gate Tickets', category: 'Operations' },
  { id: 'perm_tickets_update', key: 'tickets.update', name: 'Update Gate Status & Loading Slips', category: 'Operations' },
  { id: 'perm_forklift_operate', key: 'forklift.operate', name: 'Forklift Operator Loading Checklist & Completion', category: 'Operations' },
  { id: 'perm_tickets_delete', key: 'tickets.delete', name: 'Delete Ticket Records', category: 'Operations' },
  { id: 'perm_slips_print', key: 'slips.print', name: 'Print & Export Loading Slips / Tokens', category: 'Documents' },
  { id: 'perm_drivers_manage', key: 'drivers.manage', name: 'Manage Driver & Vehicle Master Directory', category: 'Operations' },
  { id: 'perm_reports_view', key: 'reports.view', name: 'View Daily Reports & Export CSV', category: 'Reporting' },
  { id: 'perm_settings_manage', key: 'settings.manage', name: 'Manage Plant & System Settings', category: 'Administration' },
  { id: 'perm_users_manage', key: 'users.manage', name: 'Manage Users, Roles & Permissions', category: 'Administration' },
  { id: 'perm_audit_view', key: 'audit.view', name: 'View Security Audit Logs', category: 'Administration' },
];

const USER_DEFAULT_PERMISSION_KEYS = [
  'tickets.view',
  'tickets.create',
  'tickets.update',
  'forklift.operate',
  'slips.print',
  'drivers.manage',
  'reports.view',
];

export const FORKLIFT_ALLOWED_PERMISSION_KEYS = [
  'tickets.view',
  'forklift.operate',
];

function seedDatabase(): void {
  const now = Date.now();
  const insertRole = db.prepare(
    `INSERT OR IGNORE INTO roles (id, name, display_name, description, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  insertRole.run('role_admin', 'admin', 'Administrator', 'Full system authorization, user management, settings, and audit control.', now);
  insertRole.run('role_user', 'user', 'User / Operator', 'Authorized gate queue, loading slip, and operational access.', now);
  insertRole.run(
    'role_forklift_operator',
    'forklift_operator',
    'Forklift Operator',
    'Restricted access exclusively to the Forklift Operator Loading section.',
    now
  );

  const insertPerm = db.prepare(
    `INSERT OR IGNORE INTO permissions (id, key, name, category) VALUES (?, ?, ?, ?)`
  );
  const insertRolePerm = db.prepare(
    `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`
  );

  for (const perm of SEED_PERMISSIONS) {
    insertPerm.run(perm.id, perm.key, perm.name, perm.category);
    insertRolePerm.run('role_admin', perm.id);
    if (USER_DEFAULT_PERMISSION_KEYS.includes(perm.key)) {
      insertRolePerm.run('role_user', perm.id);
    }
    if (FORKLIFT_ALLOWED_PERMISSION_KEYS.includes(perm.key)) {
      insertRolePerm.run('role_forklift_operator', perm.id);
    }
  }

  const insertSettings = db.prepare(
    `INSERT OR IGNORE INTO app_settings (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)`
  );
  insertSettings.run('active', JSON.stringify(DEFAULT_APP_SETTINGS), 'system', now);
  insertSettings.run('default', JSON.stringify(DEFAULT_APP_SETTINGS), 'system', now);

  // Optionally auto-seed admin if ADMIN_INITIAL_PASSWORD env var is set and no users exist
  const userCountRow = db.prepare(`SELECT COUNT(*) as cnt FROM users`).get() as { cnt: number };
  if (userCountRow.cnt === 0 && process.env.ADMIN_INITIAL_PASSWORD) {
    const hash = bcrypt.hashSync(process.env.ADMIN_INITIAL_PASSWORD, 12);
    const adminId = `usr_${crypto.randomUUID()}`;
    db.prepare(
      `INSERT INTO users (id, username, full_name, email, password_hash, role_id, is_active, must_change_password, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'system', ?, ?)`
    ).run(adminId, 'admin', 'System Administrator', '', hash, 'role_admin', now, now);
  }
}

seedDatabase();

export function computeEffectivePermissions(userId: string, roleId: string, roleName: string): string[] {
  if (roleName === 'admin') {
    return SEED_PERMISSIONS.map((p) => p.key);
  }

  const rolePerms = db
    .prepare(
      `SELECT p.key FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?`
    )
    .all(roleId) as Array<{ key: string }>;

  const overrides = db
    .prepare(`SELECT permission_key, granted FROM user_permissions WHERE user_id = ?`)
    .all(userId) as Array<{ permission_key: string; granted: number }>;

  if (roleName === 'forklift_operator') {
    const forkliftAllowed = new Set(FORKLIFT_ALLOWED_PERMISSION_KEYS);
    if (overrides.length > 0) {
      return overrides
        .filter((o) => o.granted === 1 && forkliftAllowed.has(o.permission_key))
        .map((o) => o.permission_key);
    }
    return rolePerms.map((r) => r.key).filter((k) => forkliftAllowed.has(k));
  }

  if (overrides.length > 0) {
    // Explicit per-user permission matrix set by Admin (filter out admin-only keys for non-admin role)
    const adminOnly = new Set(['users.manage', 'audit.view', 'settings.manage']);
    return overrides
      .filter((o) => o.granted === 1 && !adminOnly.has(o.permission_key))
      .map((o) => o.permission_key);
  }

  return rolePerms.map((r) => r.key);
}

export function getSafeUserById(userId: string): SafeUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.role_id, u.is_active,
              u.must_change_password, u.last_login_at, u.created_by, u.created_at, u.updated_at,
              r.name as role_name, r.display_name as role_display_name
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: string;
        username: string;
        full_name: string;
        email: string;
        role_id: string;
        is_active: number;
        must_change_password: number;
        last_login_at: number | null;
        created_by: string | null;
        created_at: number;
        updated_at: number;
        role_name: string;
        role_display_name: string;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    email: row.email || '',
    roleId: row.role_id,
    roleName: row.role_name,
    roleDisplayName: row.role_display_name,
    isActive: row.is_active === 1,
    mustChangePassword: row.must_change_password === 1,
    lastLoginAt: row.last_login_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    permissions: computeEffectivePermissions(row.id, row.role_id, row.role_name),
  };
}

export function logAudit(entry: {
  actorUserId?: string | null;
  actorUsername?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  ipAddress?: string;
}): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (actor_user_id, actor_username, action, target_type, target_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.actorUserId || null,
      entry.actorUsername || null,
      entry.action,
      entry.targetType || null,
      entry.targetId || null,
      entry.details || null,
      entry.ipAddress || null,
      Date.now()
    );
  } catch (err) {
    console.error('Audit logging error:', err);
  }
}

export function revokeAllUserSessions(userId: string): void {
  db.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(Date.now(), userId);
}

export function cleanExpiredSessions(): void {
  const now = Date.now();
  db.prepare(`DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).run(
    now,
    now - 86400000
  );
}
