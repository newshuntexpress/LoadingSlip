import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  db,
  getSafeUserById,
  logAudit,
  revokeAllUserSessions,
  cleanExpiredSessions,
  computeEffectivePermissions,
  FORKLIFT_ALLOWED_PERMISSION_KEYS,
} from './server/db.ts';
import {
  SESSION_COOKIE_NAME,
  DUMMY_BCRYPT_HASH,
  getClientIp,
  hashSessionToken,
  extractSessionToken,
  validateUsername,
  validatePasswordStrength,
  checkIpRateLimit,
  recordIpAttempt,
  clearIpAttempts,
  createSessionForUser,
  clearSessionCookie,
  noCacheHeaders,
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAdmin,
  requirePermission,
  requireAnyPermission,
} from './server/security.ts';

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1);

// Security headers (frameguard & CSP disabled so AI Studio preview iframe works safely)
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Prevent caching on all API routes
app.use('/api', noCacheHeaders);

// Periodic session cleanup (every 10 minutes)
setInterval(() => {
  try {
    cleanExpiredSessions();
  } catch (err) {
    console.error('Session cleanup failed:', err);
  }
}, 10 * 60 * 1000);

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

app.get('/api/auth/status', (req: Request, res: Response) => {
  const userCountRow = db.prepare(`SELECT COUNT(*) as cnt FROM users`).get() as { cnt: number };
  const needsSetup = userCountRow.cnt === 0;

  if (needsSetup) {
    res.json({ authenticated: false, needsSetup: true });
    return;
  }

  const rawToken = extractSessionToken(req);
  if (!rawToken) {
    res.json({ authenticated: false, needsSetup: false });
    return;
  }

  const sessionId = hashSessionToken(rawToken);
  const session = db
    .prepare(
      `SELECT id, user_id, csrf_token, created_at, expires_at, revoked_at
       FROM sessions WHERE id = ?`
    )
    .get(sessionId) as
    | {
        id: string;
        user_id: string;
        csrf_token: string;
        created_at: number;
        expires_at: number;
        revoked_at: number | null;
      }
    | undefined;

  const now = Date.now();
  if (!session || session.revoked_at !== null || now > session.expires_at || now - session.created_at > 12 * 3600 * 1000) {
    clearSessionCookie(req, res);
    res.json({ authenticated: false, needsSetup: false });
    return;
  }

  const user = getSafeUserById(session.user_id);
  if (!user || !user.isActive) {
    clearSessionCookie(req, res);
    res.json({ authenticated: false, needsSetup: false });
    return;
  }

  res.json({
    authenticated: true,
    needsSetup: false,
    user,
    csrfToken: session.csrf_token,
  });
});

// One-time Initial Admin Setup (permanently locked once at least 1 user exists)
app.post('/api/auth/setup', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (!checkIpRateLimit(ip)) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    return;
  }

  const userCountRow = db.prepare(`SELECT COUNT(*) as cnt FROM users`).get() as { cnt: number };
  if (userCountRow.cnt > 0) {
    res.status(403).json({ error: 'Initial setup is already completed. Please log in with an Admin account.' });
    return;
  }

  const { username, fullName, email, password } = req.body || {};
  const usernameErr = validateUsername(String(username || ''));
  if (usernameErr) {
    res.status(400).json({ error: usernameErr });
    return;
  }
  if (!fullName || String(fullName).trim().length < 2) {
    res.status(400).json({ error: 'Full Name is required (minimum 2 characters).' });
    return;
  }
  const passErr = validatePasswordStrength(String(password || ''));
  if (passErr) {
    res.status(400).json({ error: passErr });
    return;
  }

  const cleanUsername = String(username).trim();
  const cleanFullName = String(fullName).trim();
  const cleanEmail = String(email || '').trim();
  const passwordHash = bcrypt.hashSync(String(password), 12);
  const userId = `usr_${crypto.randomUUID()}`;
  const now = Date.now();

  db.prepare(
    `INSERT INTO users (id, username, full_name, email, password_hash, role_id, is_active, must_change_password, last_login_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'role_admin', 1, 0, ?, 'initial_setup', ?, ?)`
  ).run(userId, cleanUsername, cleanFullName, cleanEmail, passwordHash, now, now, now);

  const { rawToken, csrfToken } = createSessionForUser(req, res, userId);
  const safeUser = getSafeUserById(userId);

  logAudit({
    actorUserId: userId,
    actorUsername: cleanUsername,
    action: 'USER_CREATED',
    targetType: 'user',
    targetId: userId,
    details: `Initial Administrator account "${cleanUsername}" created`,
    ipAddress: ip,
  });

  logAudit({
    actorUserId: userId,
    actorUsername: cleanUsername,
    action: 'LOGIN_SUCCESS',
    targetType: 'session',
    targetId: userId,
    details: 'Initial Admin signed in upon setup',
    ipAddress: ip,
  });

  res.status(201).json({ user: safeUser, csrfToken, sessionToken: rawToken });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (!checkIpRateLimit(ip)) {
    logAudit({
      actorUsername: String(req.body?.username || '').slice(0, 32) || 'unknown',
      action: 'LOGIN_FAILED',
      targetType: 'session',
      details: 'IP rate limit exceeded on login endpoint',
      ipAddress: ip,
    });
    res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes and try again.' });
    return;
  }

  const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!rawUsername || !rawPassword) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  const userRow = db
    .prepare(
      `SELECT id, username, password_hash, is_active, failed_login_attempts, locked_until
       FROM users WHERE username = ? COLLATE NOCASE`
    )
    .get(rawUsername) as
    | {
        id: string;
        username: string;
        password_hash: string;
        is_active: number;
        failed_login_attempts: number;
        locked_until: number | null;
      }
    | undefined;

  const now = Date.now();

  // Always execute bcrypt compare to prevent timing-based account enumeration
  const hashToCheck = userRow ? userRow.password_hash : DUMMY_BCRYPT_HASH;
  const passwordMatches = await bcrypt.compare(rawPassword, hashToCheck);

  if (!userRow) {
    recordIpAttempt(ip);
    logAudit({
      actorUsername: rawUsername.slice(0, 32),
      action: 'LOGIN_FAILED',
      targetType: 'session',
      details: 'Invalid login credentials',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  // Check brute-force account lockout without revealing username status differently
  if (userRow.locked_until && now < userRow.locked_until) {
    recordIpAttempt(ip);
    logAudit({
      actorUserId: userRow.id,
      actorUsername: userRow.username,
      action: 'LOGIN_FAILED',
      targetType: 'session',
      details: 'Login attempt while account temporarily locked due to failed attempts',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'Invalid username or password. Please try again later.' });
    return;
  }

  // Check active status (anti-enumeration: generic error)
  if (userRow.is_active !== 1 || !passwordMatches) {
    recordIpAttempt(ip);
    const nextAttempts = (userRow.failed_login_attempts || 0) + 1;
    const lockUntil = nextAttempts >= 5 ? now + 15 * 60 * 1000 : null;
    db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`).run(
      lockUntil ? 0 : nextAttempts,
      lockUntil,
      userRow.id
    );

    logAudit({
      actorUserId: userRow.id,
      actorUsername: userRow.username,
      action: 'LOGIN_FAILED',
      targetType: 'session',
      details: userRow.is_active !== 1 ? 'Attempt on deactivated account' : `Incorrect password (attempt ${nextAttempts})`,
      ipAddress: ip,
    });

    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  // Successful authentication: reset brute-force counters & create fresh session (fixation prevention)
  clearIpAttempts(ip);
  db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?`).run(
    now,
    userRow.id
  );

  // Revoke previous token if one existed on this browser/tab (session fixation defense)
  const prevRawToken = extractSessionToken(req);
  if (prevRawToken) {
    db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(now, hashSessionToken(prevRawToken));
  }

  const { rawToken, csrfToken } = createSessionForUser(req, res, userRow.id);
  const safeUser = getSafeUserById(userRow.id);

  logAudit({
    actorUserId: userRow.id,
    actorUsername: userRow.username,
    action: 'LOGIN_SUCCESS',
    targetType: 'session',
    targetId: userRow.id,
    details: 'User logged in successfully',
    ipAddress: ip,
  });

  res.json({ user: safeUser, csrfToken, sessionToken: rawToken });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const rawToken = extractSessionToken(req);
  if (rawToken) {
    const sessionId = hashSessionToken(rawToken);
    const session = db.prepare(`SELECT user_id FROM sessions WHERE id = ?`).get(sessionId) as
      | { user_id: string }
      | undefined;
    db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(Date.now(), sessionId);
    if (session) {
      const user = getSafeUserById(session.user_id);
      logAudit({
        actorUserId: session.user_id,
        actorUsername: user?.username || 'unknown',
        action: 'LOGOUT',
        targetType: 'session',
        targetId: sessionId.slice(0, 12),
        details: 'User logged out securely',
        ipAddress: getClientIp(req),
      });
    }
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    user: req.auth!.user,
    csrfToken: req.auth!.csrfToken,
  });
});

app.post('/api/auth/change-password', requireAuth, requireCsrf, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  const userId = req.auth!.user.id;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required.' });
    return;
  }

  const row = db.prepare(`SELECT password_hash, username FROM users WHERE id = ?`).get(userId) as
    | { password_hash: string; username: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const currentValid = await bcrypt.compare(String(currentPassword), row.password_hash);
  if (!currentValid) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  const passErr = validatePasswordStrength(String(newPassword));
  if (passErr) {
    res.status(400).json({ error: passErr });
    return;
  }

  const isSameAsOld = await bcrypt.compare(String(newPassword), row.password_hash);
  if (isSameAsOld) {
    res.status(400).json({ error: 'New password must be different from your current password.' });
    return;
  }

  const newHash = await bcrypt.hash(String(newPassword), 12);
  const now = Date.now();
  db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`).run(
    newHash,
    now,
    userId
  );

  // Revoke all previous sessions & issue a fresh rotated session
  revokeAllUserSessions(userId);
  const { rawToken, csrfToken } = createSessionForUser(req, res, userId);
  const updatedUser = getSafeUserById(userId);

  logAudit({
    actorUserId: userId,
    actorUsername: row.username,
    action: 'PASSWORD_CHANGED',
    targetType: 'user',
    targetId: userId,
    details: 'User changed their own password securely',
    ipAddress: getClientIp(req),
  });

  res.json({ user: updatedUser, csrfToken, sessionToken: rawToken, message: 'Password updated successfully.' });
});

// ==========================================
// 2. ADMIN USER MANAGEMENT & AUDIT LOGS
// ==========================================

app.get('/api/admin/roles', requireAuth, requirePasswordChanged, requireAdmin, (_req: Request, res: Response) => {
  const roles = db.prepare(`SELECT id, name, display_name as displayName, description FROM roles ORDER BY id`).all();
  const permissions = db.prepare(`SELECT id, key, name, category FROM permissions ORDER BY category, id`).all();
  res.json({ roles, permissions });
});

app.get('/api/admin/users', requireAuth, requirePasswordChanged, requireAdmin, (_req: Request, res: Response) => {
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.role_id, u.is_active,
              u.must_change_password, u.last_login_at, u.created_by, u.created_at, u.updated_at,
              r.name as role_name, r.display_name as role_display_name,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?) as active_sessions
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at ASC`
    )
    .all(now) as Array<{
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
    active_sessions: number;
  }>;

  const users = rows.map((row) => ({
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
    activeSessionCount: row.active_sessions,
    permissions: computeEffectivePermissions(row.id, row.role_id, row.role_name),
  }));

  res.json({ users });
});

app.post('/api/admin/users', requireAuth, requirePasswordChanged, requireCsrf, requireAdmin, async (req: Request, res: Response) => {
  const { username, fullName, email, temporaryPassword, roleName, isActive, permissions } = req.body || {};

  const usernameErr = validateUsername(String(username || ''));
  if (usernameErr) {
    res.status(400).json({ error: usernameErr });
    return;
  }
  if (!fullName || String(fullName).trim().length < 2) {
    res.status(400).json({ error: 'Full Name is required (minimum 2 characters).' });
    return;
  }
  const passErr = validatePasswordStrength(String(temporaryPassword || ''));
  if (passErr) {
    res.status(400).json({ error: `Temporary Password invalid: ${passErr}` });
    return;
  }

  const cleanUsername = String(username).trim();
  const existing = db.prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`).get(cleanUsername);
  if (existing) {
    res.status(409).json({ error: 'Username already exists. Please choose another username.' });
    return;
  }

  const targetRoleName =
    roleName === 'admin' ? 'admin' : roleName === 'forklift_operator' ? 'forklift_operator' : 'user';
  const roleRow = db.prepare(`SELECT id FROM roles WHERE name = ?`).get(targetRoleName) as { id: string } | undefined;
  if (!roleRow) {
    res.status(400).json({ error: 'Invalid role selected.' });
    return;
  }

  const userId = `usr_${crypto.randomUUID()}`;
  const passwordHash = await bcrypt.hash(String(temporaryPassword), 12);
  const now = Date.now();
  const activeFlag = isActive === false ? 0 : 1;

  const createTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, username, full_name, email, password_hash, role_id, is_active, must_change_password, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      userId,
      cleanUsername,
      String(fullName).trim(),
      String(email || '').trim(),
      passwordHash,
      roleRow.id,
      activeFlag,
      req.auth!.user.username,
      now,
      now
    );

    if (targetRoleName === 'user' && Array.isArray(permissions)) {
      const insertPerm = db.prepare(
        `INSERT OR REPLACE INTO user_permissions (user_id, permission_key, granted) VALUES (?, ?, 1)`
      );
      const validUserPerms = new Set([
        'tickets.view',
        'tickets.create',
        'tickets.update',
        'forklift.operate',
        'tickets.delete',
        'slips.print',
        'drivers.manage',
        'reports.view',
      ]);
      for (const permKey of permissions) {
        if (typeof permKey === 'string' && validUserPerms.has(permKey)) {
          insertPerm.run(userId, permKey);
        }
      }
    } else if (targetRoleName === 'forklift_operator' && Array.isArray(permissions)) {
      const insertPerm = db.prepare(
        `INSERT OR REPLACE INTO user_permissions (user_id, permission_key, granted) VALUES (?, ?, 1)`
      );
      const validForkliftPerms = new Set(FORKLIFT_ALLOWED_PERMISSION_KEYS);
      const cleanForkliftPerms = permissions.filter(
        (permKey): permKey is string => typeof permKey === 'string' && validForkliftPerms.has(permKey)
      );
      for (const permKey of cleanForkliftPerms) {
        insertPerm.run(userId, permKey);
      }
      if (cleanForkliftPerms.length === 0) {
        db.prepare(`INSERT INTO user_permissions (user_id, permission_key, granted) VALUES (?, '__none__', 0)`).run(
          userId
        );
      }
    }
  });

  createTx();
  const createdUser = getSafeUserById(userId);

  logAudit({
    actorUserId: req.auth!.user.id,
    actorUsername: req.auth!.user.username,
    action: 'USER_CREATED',
    targetType: 'user',
    targetId: userId,
    details: `Created user "${cleanUsername}" with role "${targetRoleName}" (temporary password assigned)`,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ user: createdUser });
});

app.patch('/api/admin/users/:id', requireAuth, requirePasswordChanged, requireCsrf, requireAdmin, (req: Request, res: Response) => {
  const targetId = req.params.id;
  const target = getSafeUserById(targetId);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { fullName, email, roleName, isActive } = req.body || {};

  // Prevent self-lockout / self-demotion
  if (targetId === req.auth!.user.id) {
    if (isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own currently signed-in Admin account.' });
      return;
    }
    if (roleName && roleName !== 'admin') {
      res.status(400).json({ error: 'You cannot demote your own currently signed-in Admin account.' });
      return;
    }
  }

  const nextRoleName =
    roleName === 'admin' || roleName === 'user' || roleName === 'forklift_operator' ? roleName : target.roleName;
  const roleRow = db.prepare(`SELECT id FROM roles WHERE name = ?`).get(nextRoleName) as { id: string };
  const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : target.isActive ? 1 : 0;
  const nextFullName = typeof fullName === 'string' && fullName.trim().length >= 2 ? fullName.trim() : target.fullName;
  const nextEmail = typeof email === 'string' ? email.trim() : target.email;

  // Ensure at least 1 active Admin always remains
  if (target.roleName === 'admin' && (nextRoleName !== 'admin' || nextActive === 0)) {
    const otherActiveAdmins = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM users u
         INNER JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'admin' AND u.is_active = 1 AND u.id != ?`
      )
      .get(targetId) as { cnt: number };
    if (otherActiveAdmins.cnt === 0) {
      res.status(400).json({ error: 'At least one active Administrator account must remain in the system.' });
      return;
    }
  }

  db.transaction(() => {
    db.prepare(`UPDATE users SET full_name = ?, email = ?, role_id = ?, is_active = ?, updated_at = ? WHERE id = ?`).run(
      nextFullName,
      nextEmail,
      roleRow.id,
      nextActive,
      Date.now(),
      targetId
    );
    if (nextRoleName !== target.roleName) {
      db.prepare(`DELETE FROM user_permissions WHERE user_id = ?`).run(targetId);
    }
  })();

  // Immediately terminate active sessions if deactivated or role changed
  if (nextActive === 0 || nextRoleName !== target.roleName) {
    revokeAllUserSessions(targetId);
  }

  const actionType =
    nextActive === 0 && target.isActive
      ? 'USER_DEACTIVATED'
      : nextActive === 1 && !target.isActive
      ? 'USER_ACTIVATED'
      : 'USER_UPDATED';

  logAudit({
    actorUserId: req.auth!.user.id,
    actorUsername: req.auth!.user.username,
    action: actionType,
    targetType: 'user',
    targetId,
    details: `Updated user "${target.username}" (role: ${nextRoleName}, active: ${nextActive === 1})`,
    ipAddress: getClientIp(req),
  });

  res.json({ user: getSafeUserById(targetId) });
});

app.put(
  '/api/admin/users/:id/permissions',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAdmin,
  (req: Request, res: Response) => {
    const targetId = req.params.id;
    const target = getSafeUserById(targetId);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.roleName === 'admin') {
      res.status(400).json({ error: 'Administrators always retain full system permissions.' });
      return;
    }

    const { permissions } = req.body || {};
    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'Permissions array is required.' });
      return;
    }

    const validAllowedPerms =
      target.roleName === 'forklift_operator'
        ? new Set(FORKLIFT_ALLOWED_PERMISSION_KEYS)
        : new Set([
            'tickets.view',
            'tickets.create',
            'tickets.update',
            'forklift.operate',
            'tickets.delete',
            'slips.print',
            'drivers.manage',
            'reports.view',
          ]);

    const cleanPerms = permissions.filter((p): p is string => typeof p === 'string' && validAllowedPerms.has(p));

    const updateTx = db.transaction(() => {
      db.prepare(`DELETE FROM user_permissions WHERE user_id = ?`).run(targetId);
      const insertPerm = db.prepare(
        `INSERT INTO user_permissions (user_id, permission_key, granted) VALUES (?, ?, 1)`
      );
      for (const perm of cleanPerms) {
        insertPerm.run(targetId, perm);
      }
      // Always insert at least a sentinel marker if all revoked so empty overrides don't fall back to defaults
      if (cleanPerms.length === 0) {
        db.prepare(`INSERT INTO user_permissions (user_id, permission_key, granted) VALUES (?, '__none__', 0)`).run(
          targetId
        );
      }
    });

    updateTx();

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'PERMISSIONS_UPDATED',
      targetType: 'user',
      targetId,
      details: `Updated permissions for "${target.username}": ${cleanPerms.length ? cleanPerms.join(', ') : 'none'}`,
      ipAddress: getClientIp(req),
    });

    res.json({ user: getSafeUserById(targetId) });
  }
);

app.post(
  '/api/admin/users/:id/reset-password',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAdmin,
  async (req: Request, res: Response) => {
    const targetId = req.params.id;
    const target = getSafeUserById(targetId);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const { temporaryPassword } = req.body || {};
    const passErr = validatePasswordStrength(String(temporaryPassword || ''));
    if (passErr) {
      res.status(400).json({ error: passErr });
      return;
    }

    const newHash = await bcrypt.hash(String(temporaryPassword), 12);
    db.prepare(`UPDATE users SET password_hash = ?, must_change_password = 1, failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?`).run(
      newHash,
      Date.now(),
      targetId
    );

    // Force immediate re-login with new temporary password
    revokeAllUserSessions(targetId);

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'PASSWORD_RESET',
      targetType: 'user',
      targetId,
      details: `Admin reset temporary password for "${target.username}" (password change required on next login)`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true, user: getSafeUserById(targetId) });
  }
);

app.post(
  '/api/admin/users/:id/revoke-sessions',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAdmin,
  (req: Request, res: Response) => {
    const targetId = req.params.id;
    const target = getSafeUserById(targetId);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (targetId === req.auth!.user.id) {
      res.status(400).json({ error: 'Use Logout to end your own active session.' });
      return;
    }

    revokeAllUserSessions(targetId);

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'SESSION_REVOKED',
      targetType: 'user',
      targetId,
      details: `Admin terminated all active sessions for "${target.username}"`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

app.delete(
  '/api/admin/users/:id',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAdmin,
  (req: Request, res: Response) => {
    const targetId = req.params.id;
    const target = getSafeUserById(targetId);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (targetId === req.auth!.user.id) {
      res.status(400).json({ error: 'You cannot delete your own currently signed-in account.' });
      return;
    }

    if (target.roleName === 'admin') {
      const otherAdmins = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM users u
           INNER JOIN roles r ON r.id = u.role_id
           WHERE r.name = 'admin' AND u.is_active = 1 AND u.id != ?`
        )
        .get(targetId) as { cnt: number };
      if (otherAdmins.cnt === 0) {
        res.status(400).json({ error: 'Cannot delete the last remaining active Administrator account.' });
        return;
      }
    }

    revokeAllUserSessions(targetId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(targetId);

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'USER_DELETED',
      targetType: 'user',
      targetId,
      details: `Deleted user "${target.username}"`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

app.get('/api/admin/audit-logs', requireAuth, requirePasswordChanged, requireAdmin, (req: Request, res: Response) => {
  const actionFilter = typeof req.query.action === 'string' ? req.query.action.trim() : '';
  const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const limit = Math.min(500, Math.max(20, Number(req.query.limit) || 150));

  let query = `SELECT id, actor_user_id as actorUserId, actor_username as actorUsername, action, target_type as targetType, target_id as targetId, details, ip_address as ipAddress, created_at as createdAt FROM audit_logs WHERE 1=1`;
  const params: Array<string | number> = [];

  if (actionFilter && actionFilter !== 'ALL') {
    query += ` AND action = ?`;
    params.push(actionFilter);
  }
  if (searchFilter) {
    query += ` AND (actor_username LIKE ? OR details LIKE ? OR target_id LIKE ?)`;
    const like = `%${searchFilter}%`;
    params.push(like, like, like);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

app.get('/api/admin/sessions', requireAuth, requirePasswordChanged, requireAdmin, (_req: Request, res: Response) => {
  const now = Date.now();
  const sessions = db
    .prepare(
      `SELECT substr(s.id, 1, 12) as sessionRef, s.user_id as userId, u.username, u.full_name as fullName,
              r.name as roleName, s.ip_address as ipAddress, s.user_agent as userAgent,
              s.created_at as createdAt, s.last_activity_at as lastActivityAt, s.expires_at as expiresAt
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN roles r ON r.id = u.role_id
       WHERE s.revoked_at IS NULL AND s.expires_at > ?
       ORDER BY s.last_activity_at DESC`
    )
    .all(now);

  res.json({ sessions });
});

// ==========================================
// 3. PROTECTED APPLICATION DATA ENDPOINTS
// ==========================================

function upsertDriverMasterInternal(ticketData: {
  truckNumber?: string;
  driverName?: string;
  driverPhone?: string;
  transporterName?: string;
  destinationPlace?: string;
  iqamaNumber?: string;
  date?: string;
}) {
  const cleanTruck = String(ticketData.truckNumber || '').trim().toUpperCase();
  if (!cleanTruck) return;
  const now = Date.now();
  const existing = db
    .prepare(`SELECT id, data_json FROM drivers WHERE truck_number = ? COLLATE NOCASE`)
    .get(cleanTruck) as { id: string; data_json: string } | undefined;

  if (existing) {
    const prev = JSON.parse(existing.data_json);
    const updated = {
      ...prev,
      truckNumber: cleanTruck,
      driverName: String(ticketData.driverName || '').trim() || prev.driverName,
      driverPhone: String(ticketData.driverPhone || '').trim() || prev.driverPhone,
      iqamaNumber: String(ticketData.iqamaNumber || '').trim() || prev.iqamaNumber,
      transporterName: String(ticketData.transporterName || '').trim() || prev.transporterName,
      defaultDestination: String(ticketData.destinationPlace || '').trim() || prev.defaultDestination,
      lastVisited: ticketData.date || prev.lastVisited,
      tripCount: (prev.tripCount || 1) + 1,
    };
    db.prepare(`UPDATE drivers SET data_json = ?, updated_at = ? WHERE id = ?`).run(
      JSON.stringify(updated),
      now,
      existing.id
    );
  } else {
    const id = `drv-${now}-${crypto.randomBytes(3).toString('hex')}`;
    const created = {
      id,
      truckNumber: cleanTruck,
      driverName: String(ticketData.driverName || '').trim(),
      driverPhone: String(ticketData.driverPhone || '').trim(),
      iqamaNumber: String(ticketData.iqamaNumber || '').trim(),
      transporterName: String(ticketData.transporterName || '').trim(),
      defaultDestination: String(ticketData.destinationPlace || '').trim(),
      lastVisited: ticketData.date || new Date().toISOString().split('T')[0],
      tripCount: 1,
    };
    db.prepare(`INSERT INTO drivers (id, truck_number, data_json, updated_at) VALUES (?, ?, ?, ?)`).run(
      id,
      cleanTruck,
      JSON.stringify(created),
      now
    );
  }
}

const MIN_AUTO_LOADING_MINUTES = 30;
const MAX_AUTO_LOADING_MINUTES = 60;
const DEFAULT_AUTO_LOADING_MINUTES = 30;

function clampAutoLoadingMinutes(raw?: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AUTO_LOADING_MINUTES;
  return Math.min(MAX_AUTO_LOADING_MINUTES, Math.max(MIN_AUTO_LOADING_MINUTES, Math.round(n)));
}

function getConfiguredAutoLoadingMinutes(): number {
  try {
    const row = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'active'`).get() as
      | { value_json: string }
      | undefined;
    if (row) {
      const parsed = JSON.parse(row.value_json);
      if (parsed && parsed.autoLoadingMinutes !== undefined) {
        return clampAutoLoadingMinutes(parsed.autoLoadingMinutes);
      }
    }
  } catch {
    // Fallback to default
  }
  return DEFAULT_AUTO_LOADING_MINUTES;
}

function formatPlantTime(timestampMs: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

const PLANT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatPlantDateTime(timestampMs: number): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(timestampMs));
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    const month = parts.find((p) => p.type === 'month')?.value || '01';
    const year = parts.find((p) => p.type === 'year')?.value || '2026';
    const monthName = PLANT_MONTHS[parseInt(month, 10) - 1] || month;
    return `${day}-${monthName}-${year} ${formatPlantTime(timestampMs)}`;
  } catch {
    return `${new Date(timestampMs).toISOString().split('T')[0]} ${formatPlantTime(timestampMs)}`;
  }
}

export function processAutoLoadingTransitions(nowMs = Date.now()): number {
  const defaultDelayMin = getConfiguredAutoLoadingMinutes();
  const minElapsedMs = MIN_AUTO_LOADING_MINUTES * 60 * 1000;
  const maxEligibleCreatedAt = nowMs - minElapsedMs;

  const candidateRows = db
    .prepare(
      `SELECT id, ticket_number, data_json, version, created_at
       FROM tickets
       WHERE created_at <= ?`
    )
    .all(maxEligibleCreatedAt) as Array<{
    id: string;
    ticket_number: string;
    data_json: string;
    version: number;
    created_at: number;
  }>;

  if (candidateRows.length === 0) return 0;

  const transitioned: Array<{ ticketNumber: string; createdAt: number; delayMinutes: number }> = [];

  db.transaction(() => {
    const updateStmt = db.prepare(
      `UPDATE tickets SET data_json = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    );

    for (const row of candidateRows) {
      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(row.data_json);
      } catch {
        continue;
      }

      if (parsed.status !== 'waiting') continue;
      if (parsed.manualStatusOverride === true) continue;
      if (parsed.autoUnderLoadingApplied === true) continue;

      const createdMs = Number(parsed.createdAt || row.created_at || 0);
      if (!createdMs || !Number.isFinite(createdMs)) continue;

      const delayMinutes = clampAutoLoadingMinutes(parsed.autoLoadingMinutes ?? defaultDelayMin);
      const targetAt = Number(parsed.autoUnderLoadingAt) || createdMs + delayMinutes * 60 * 1000;

      if (nowMs < targetAt) continue;

      const updatedRecord = {
        ...parsed,
        createdAt: createdMs,
        status: 'under_loading',
        timeLoadingStarted: parsed.timeLoadingStarted || formatPlantTime(nowMs),
        autoLoadingMinutes: delayMinutes,
        autoUnderLoadingAt: targetAt,
        autoStatusUpdatedAt: nowMs,
        autoUnderLoadingApplied: true,
        updatedAt: nowMs,
      };

      updateStmt.run(
        JSON.stringify(updatedRecord),
        row.version + 1,
        'system-auto',
        nowMs,
        row.id
      );

      transitioned.push({
        ticketNumber: row.ticket_number,
        createdAt: createdMs,
        delayMinutes,
      });
    }
  })();

  for (const item of transitioned) {
    const elapsedMin = Math.round((nowMs - item.createdAt) / 60000);
    logAudit({
      actorUserId: null,
      actorUsername: 'system-auto',
      action: 'TICKET_AUTO_STATUS',
      targetType: 'ticket',
      targetId: item.ticketNumber,
      details: `Auto-changed status from Waiting in Queue to Under Loading after ${elapsedMin} min from creation (threshold: ${item.delayMinutes} min)`,
    });
  }

  return transitioned.length;
}

app.get(
  '/api/tickets',
  requireAuth,
  requirePasswordChanged,
  requirePermission('tickets.view'),
  (_req: Request, res: Response) => {
    processAutoLoadingTransitions();

    const rows = db
      .prepare(`SELECT data_json, version, created_by, updated_by FROM tickets ORDER BY date DESC, sequence_number ASC`)
      .all() as Array<{ data_json: string; version: number; created_by: string | null; updated_by: string | null }>;

    const tickets = rows.map((r) => ({
      ...JSON.parse(r.data_json),
      version: r.version,
      createdBy: r.created_by || undefined,
      updatedBy: r.updated_by || undefined,
    }));

    res.json({ tickets });
  }
);

app.post(
  '/api/tickets',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('tickets.create'),
  (req: Request, res: Response) => {
    const payload = req.body || {};
    if (!payload.delNoteNumber || !String(payload.delNoteNumber).trim()) {
      res.status(400).json({ error: 'Delivery Note Number (Del Note No.) is required.' });
      return;
    }
    if (!payload.truckNumber || !String(payload.truckNumber).trim()) {
      res.status(400).json({ error: 'Vehicle / Truck Number is required.' });
      return;
    }
    if (!payload.driverName || !String(payload.driverName).trim()) {
      res.status(400).json({ error: 'Driver Name is required.' });
      return;
    }

    const createTx = db.transaction(() => {
      const dateStr = String(payload.date || new Date().toISOString().split('T')[0]);
      const dayRows = db
        .prepare(`SELECT sequence_number, data_json FROM tickets WHERE date = ?`)
        .all(dateStr) as Array<{ sequence_number: number; data_json: string }>;

      const maxSeq = dayRows.reduce((acc, r) => Math.max(acc, r.sequence_number || 0), 0);
      const nextSeq = maxSeq + 1;

      const settingsRow = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'active'`).get() as
        | { value_json: string }
        | undefined;
      const prefix = settingsRow ? JSON.parse(settingsRow.value_json).ticketPrefix || 'TK' : 'TK';
      const ticketNumber = `${prefix}-${dateStr.replace(/-/g, '')}-${String(nextSeq).padStart(3, '0')}`;

      const gateNumber = String(payload.gateNumber || 'Gate 1');
      const activeAtGate = dayRows.filter((r) => {
        const parsed = JSON.parse(r.data_json);
        return (
          parsed.gateNumber === gateNumber &&
          (parsed.status === 'under_loading' || parsed.status === 'called' || parsed.status === 'waiting')
        );
      });
      const gateSeq = activeAtGate.length + 1;

      const now = Date.now();
      const autoLoadingMinutes = getConfiguredAutoLoadingMinutes();
      const autoUnderLoadingAt = now + autoLoadingMinutes * 60 * 1000;
      const id = `tkt-${now}-${crypto.randomBytes(3).toString('hex')}`;
      const record = {
        ...payload,
        id,
        ticketNumber,
        sequenceNumber: nextSeq,
        gateSequenceNumber: gateSeq,
        date: dateStr,
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
        autoLoadingMinutes,
        autoUnderLoadingAt,
        autoUnderLoadingApplied: false,
        manualStatusOverride: false,
      };

      db.prepare(
        `INSERT INTO tickets (id, ticket_number, sequence_number, date, data_json, version, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      ).run(
        id,
        ticketNumber,
        nextSeq,
        dateStr,
        JSON.stringify(record),
        req.auth!.user.username,
        req.auth!.user.username,
        now,
        now
      );

      upsertDriverMasterInternal(record);
      return { ...record, version: 1, createdBy: req.auth!.user.username, updatedBy: req.auth!.user.username };
    });

    const created = createTx();

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'TICKET_CREATED',
      targetType: 'ticket',
      targetId: created.ticketNumber,
      details: `Created ticket ${created.ticketNumber} (${created.truckNumber}) at ${created.gateNumber}`,
      ipAddress: getClientIp(req),
    });

    res.status(201).json({ ticket: created });
  }
);

app.patch(
  '/api/tickets/:id',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('tickets.update'),
  (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const updates = req.body || {};

    const result = db.transaction(() => {
      const existing = db
        .prepare(`SELECT data_json, version, created_by FROM tickets WHERE id = ?`)
        .get(ticketId) as { data_json: string; version: number; created_by: string | null } | undefined;

      if (!existing) {
        return { errorStatus: 404 as const, error: 'Ticket record not found.' };
      }

      if (typeof updates.version === 'number' && updates.version !== existing.version) {
        return {
          errorStatus: 409 as const,
          error: 'This ticket was updated by another user. Data has been refreshed—please retry your change.',
        };
      }

      const prev = JSON.parse(existing.data_json);
      const { version: _ignoreVer, createdBy: _ignoreCb, updatedBy: _ignoreUb, createdAt: _ignoreCa, ...cleanUpdates } = updates;

      if (prev.loadingSlip?.isLocked && cleanUpdates.loadingSlip) {
        const prevItemsJson = JSON.stringify(prev.loadingSlip.items || []);
        const nextItemsJson = JSON.stringify(cleanUpdates.loadingSlip.items || []);
        if (
          prevItemsJson !== nextItemsJson ||
          cleanUpdates.loadingSlip.delNoteNumber !== prev.loadingSlip.delNoteNumber ||
          cleanUpdates.loadingSlip.placeName !== prev.loadingSlip.placeName
        ) {
          return {
            errorStatus: 409 as const,
            error: 'This loading slip is locked because loading has been completed.',
          };
        }
      }

      const now = Date.now();
      const hasManualStatusChange =
        typeof cleanUpdates.status === 'string' && cleanUpdates.status !== prev.status;
      const merged = {
        ...prev,
        ...cleanUpdates,
        id: prev.id,
        ticketNumber: prev.ticketNumber,
        sequenceNumber: prev.sequenceNumber,
        createdAt: prev.createdAt || now,
        manualStatusOverride: hasManualStatusChange ? true : Boolean(prev.manualStatusOverride),
        updatedAt: now,
      };
      const nextVersion = existing.version + 1;

      db.prepare(
        `UPDATE tickets SET date = ?, data_json = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?`
      ).run(merged.date, JSON.stringify(merged), nextVersion, req.auth!.user.username, now, ticketId);

      if (cleanUpdates.truckNumber || cleanUpdates.driverName || cleanUpdates.driverPhone) {
        upsertDriverMasterInternal(merged);
      }

      return {
        ticket: {
          ...merged,
          version: nextVersion,
          createdBy: existing.created_by || undefined,
          updatedBy: req.auth!.user.username,
        },
        slipSaved: Boolean(cleanUpdates.loadingSlip),
      };
    })();

    if ('errorStatus' in result && result.errorStatus) {
      res.status(result.errorStatus).json({ error: result.error });
      return;
    }

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: result.slipSaved ? 'SLIP_SAVED' : 'TICKET_UPDATED',
      targetType: 'ticket',
      targetId: result.ticket.ticketNumber,
      details: `${result.slipSaved ? 'Saved loading slip for' : 'Updated'} ${result.ticket.ticketNumber} (${result.ticket.status})`,
      ipAddress: getClientIp(req),
    });

    res.json({ ticket: result.ticket });
  }
);

// Forklift Operator Loading Endpoints
app.post(
  '/api/tickets/:id/forklift/open',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAnyPermission(['forklift.operate', 'tickets.update']),
  (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const now = Date.now();

    const result = db.transaction(() => {
      const existing = db
        .prepare(`SELECT data_json, version, created_by FROM tickets WHERE id = ?`)
        .get(ticketId) as { data_json: string; version: number; created_by: string | null } | undefined;

      if (!existing) {
        return { errorStatus: 404 as const, error: 'Ticket record not found.' };
      }

      const prev = JSON.parse(existing.data_json);
      // Do not modify locked or completed slips
      if (prev.loadingSlip?.isLocked || prev.status === 'completed' || prev.status === 'cancelled') {
        return {
          ticket: {
            ...prev,
            version: existing.version,
            createdBy: existing.created_by || undefined,
          },
          changed: false,
        };
      }

      if (prev.status === 'under_loading') {
        return {
          ticket: {
            ...prev,
            version: existing.version,
            createdBy: existing.created_by || undefined,
          },
          changed: false,
        };
      }

      // Transition Waiting in Queue (or Called) -> Under Loading when Forklift Operator opens slip
      const nextSlip = prev.loadingSlip
        ? {
            ...prev.loadingSlip,
            checkedBy: prev.loadingSlip.checkedBy || req.auth!.user.fullName,
          }
        : undefined;

      const updated = {
        ...prev,
        ...(nextSlip ? { loadingSlip: nextSlip } : {}),
        status: 'under_loading',
        timeLoadingStarted: prev.timeLoadingStarted || formatPlantTime(now),
        manualStatusOverride: true,
        updatedAt: now,
      };
      const nextVersion = existing.version + 1;

      db.prepare(`UPDATE tickets SET data_json = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(updated),
        nextVersion,
        req.auth!.user.username,
        now,
        ticketId
      );

      return {
        ticket: {
          ...updated,
          version: nextVersion,
          createdBy: existing.created_by || undefined,
          updatedBy: req.auth!.user.username,
        },
        changed: true,
      };
    })();

    if ('errorStatus' in result && result.errorStatus) {
      res.status(result.errorStatus).json({ error: result.error });
      return;
    }

    if (result.changed) {
      logAudit({
        actorUserId: req.auth!.user.id,
        actorUsername: req.auth!.user.username,
        action: 'TICKET_UPDATED',
        targetType: 'ticket',
        targetId: result.ticket.ticketNumber,
        details: `Forklift operator "${req.auth!.user.fullName}" opened Loading Slip (Under Loading)`,
        ipAddress: getClientIp(req),
      });
    }

    res.json({ ticket: result.ticket });
  }
);

app.patch(
  '/api/tickets/:id/forklift/checklist',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAnyPermission(['forklift.operate', 'tickets.update']),
  (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const { itemUpdates, version } = req.body || {};

    if (!Array.isArray(itemUpdates) || itemUpdates.length === 0) {
      res.status(400).json({ error: 'Checklist updates are required.' });
      return;
    }

    const now = Date.now();
    const operatorName = req.auth!.user.fullName;

    const result = db.transaction(() => {
      const existing = db
        .prepare(`SELECT data_json, version, created_by FROM tickets WHERE id = ?`)
        .get(ticketId) as { data_json: string; version: number; created_by: string | null } | undefined;

      if (!existing) {
        return { errorStatus: 404 as const, error: 'Ticket record not found.' };
      }

      if (typeof version === 'number' && version !== existing.version) {
        return {
          errorStatus: 409 as const,
          error: 'This loading slip was updated by another user. Please refresh and retry.',
        };
      }

      const prev = JSON.parse(existing.data_json);
      if (prev.loadingSlip?.isLocked || prev.status === 'completed') {
        return {
          errorStatus: 409 as const,
          error: 'This loading slip is locked because loading has already been completed.',
        };
      }

      if (!prev.loadingSlip || !Array.isArray(prev.loadingSlip.items)) {
        return {
          errorStatus: 400 as const,
          error: 'No Loading Slip materials have been prepared for this ticket yet.',
        };
      }

      const nextItems = prev.loadingSlip.items.map((item: any) => ({ ...item }));
      for (const upd of itemUpdates) {
        const idx = Number(upd?.index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= nextItems.length) continue;
        const target = nextItems[idx];

        if (typeof upd.isLoaded === 'boolean') {
          target.isLoaded = upd.isLoaded;
          if (upd.isLoaded) {
            target.loadedAt = now;
            target.loadedByName = operatorName;
            if ((target.loadedQty === undefined || target.loadedQty === '') && target.qty) {
              target.loadedQty = String(target.qty);
            }
          } else {
            target.loadedAt = undefined;
            target.loadedByName = undefined;
          }
        }
        if (typeof upd.loadedQty === 'string') {
          target.loadedQty = upd.loadedQty.slice(0, 60);
        }
        // Only update remarks if explicitly supplied; preserve manual Production Date
        if (typeof upd.remarks === 'string') {
          target.remarks = upd.remarks.slice(0, 120);
        }
      }

      const nextSlip = {
        ...prev.loadingSlip,
        items: nextItems,
        checkedBy: prev.loadingSlip.checkedBy || operatorName,
        loadedBy: operatorName,
      };

      const nextStatus = prev.status === 'waiting' || prev.status === 'called' ? 'under_loading' : prev.status;
      const updated = {
        ...prev,
        status: nextStatus,
        timeLoadingStarted: prev.timeLoadingStarted || formatPlantTime(now),
        manualStatusOverride: true,
        loadingSlip: nextSlip,
        updatedAt: now,
      };

      const nextVersion = existing.version + 1;
      db.prepare(`UPDATE tickets SET data_json = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(updated),
        nextVersion,
        req.auth!.user.username,
        now,
        ticketId
      );

      return {
        ticket: {
          ...updated,
          version: nextVersion,
          createdBy: existing.created_by || undefined,
          updatedBy: req.auth!.user.username,
        },
      };
    })();

    if ('errorStatus' in result && result.errorStatus) {
      res.status(result.errorStatus).json({ error: result.error });
      return;
    }

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'FORKLIFT_CHECKLIST_UPDATED',
      targetType: 'ticket',
      targetId: result.ticket.ticketNumber,
      details: `Forklift operator "${operatorName}" updated loading checklist for ${result.ticket.ticketNumber}`,
      ipAddress: getClientIp(req),
    });

    res.json({ ticket: result.ticket });
  }
);

app.post(
  '/api/tickets/:id/forklift/complete',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requireAnyPermission(['forklift.operate', 'tickets.update']),
  (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const { version } = req.body || {};
    const now = Date.now();
    const operatorName = req.auth!.user.fullName;
    const completedTime = formatPlantTime(now);
    const completedDateTime = formatPlantDateTime(now);

    const result = db.transaction(() => {
      const existing = db
        .prepare(`SELECT data_json, version, created_by FROM tickets WHERE id = ?`)
        .get(ticketId) as { data_json: string; version: number; created_by: string | null } | undefined;

      if (!existing) {
        return { errorStatus: 404 as const, error: 'Ticket record not found.' };
      }

      if (typeof version === 'number' && version !== existing.version) {
        return {
          errorStatus: 409 as const,
          error: 'This loading slip was modified by another user. Data refreshed—please retry.',
        };
      }

      const prev = JSON.parse(existing.data_json);
      if (prev.loadingSlip?.isLocked || prev.status === 'completed') {
        return {
          errorStatus: 409 as const,
          error: 'Loading is already completed and locked for this ticket.',
        };
      }

      const items: any[] = Array.isArray(prev.loadingSlip?.items) ? prev.loadingSlip.items : [];
      const activeItems = items.filter(
        (it) => String(it?.description || '').trim() || String(it?.qty || '').trim() || String(it?.pack || '').trim()
      );

      if (activeItems.length === 0) {
        return {
          errorStatus: 400 as const,
          error: 'Cannot complete loading: no active materials are listed on this Loading Slip.',
        };
      }

      const pendingCount = activeItems.filter((it) => it.isLoaded !== true).length;
      if (pendingCount > 0) {
        return {
          errorStatus: 400 as const,
          error: `All materials must be checked/completed before clicking Loading Complete (${pendingCount} pending).`,
        };
      }

      const lockedSlip = {
        ...prev.loadingSlip,
        checkedBy: operatorName,
        loadedBy: operatorName,
        isLocked: true,
        loadingCompletedAt: now,
        loadingCompletedTime: completedDateTime,
        loadingCompletedBy: operatorName,
      };

      const updated = {
        ...prev,
        status: 'completed',
        timeLoadingStarted: prev.timeLoadingStarted || completedTime,
        timeCompleted: completedTime,
        manualStatusOverride: true,
        loadingSlip: lockedSlip,
        updatedAt: now,
      };

      const nextVersion = existing.version + 1;
      db.prepare(`UPDATE tickets SET data_json = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(updated),
        nextVersion,
        req.auth!.user.username,
        now,
        ticketId
      );

      const alertId = `alt-${now}-${crypto.randomBytes(3).toString('hex')}`;
      const delNoteNumber = lockedSlip.delNoteNumber || prev.delNoteNumber || '—';
      const truckNumber = prev.truckNumber || '—';
      const gateNumber = prev.gateNumber || '—';

      db.prepare(
        `INSERT INTO loading_alerts (id, ticket_id, ticket_number, del_note_number, truck_number, gate_number, completed_by, completed_time, created_at, dismissed_by_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`
      ).run(alertId, ticketId, prev.ticketNumber, delNoteNumber, truckNumber, gateNumber, operatorName, completedDateTime, now);

      const alert = {
        id: alertId,
        ticketId,
        ticketNumber: prev.ticketNumber,
        delNoteNumber,
        truckNumber,
        gateNumber,
        completedBy: operatorName,
        completedTime: completedDateTime,
        createdAt: now,
      };

      return {
        ticket: {
          ...updated,
          version: nextVersion,
          createdBy: existing.created_by || undefined,
          updatedBy: req.auth!.user.username,
        },
        alert,
      };
    })();

    if ('errorStatus' in result && result.errorStatus) {
      res.status(result.errorStatus).json({ error: result.error });
      return;
    }

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'FORKLIFT_LOADING_COMPLETED',
      targetType: 'ticket',
      targetId: result.ticket.ticketNumber,
      details: `Forklift operator "${operatorName}" completed & locked loading for ${result.ticket.ticketNumber} (DN: ${result.alert.delNoteNumber}, Truck: ${result.alert.truckNumber}, Gate: ${result.alert.gateNumber})`,
      ipAddress: getClientIp(req),
    });

    res.json({ ticket: result.ticket, alert: result.alert });
  }
);

app.get(
  '/api/loading-alerts',
  requireAuth,
  requirePasswordChanged,
  requirePermission('tickets.view'),
  (req: Request, res: Response) => {
    if (req.auth!.user.roleName === 'forklift_operator') {
      logAudit({
        actorUserId: req.auth!.user.id,
        actorUsername: req.auth!.user.username,
        action: 'UNAUTHORIZED_ACCESS',
        targetType: 'route',
        targetId: 'GET /api/loading-alerts',
        details: 'Forklift Operator denied access to main dashboard alerts',
        ipAddress: getClientIp(req),
      });
      res.status(403).json({ error: 'Access denied: Forklift Operators are restricted to the Forklift Operator Section.' });
      return;
    }
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const rows = db
      .prepare(
        `SELECT id, ticket_id, ticket_number, del_note_number, truck_number, gate_number, completed_by, completed_time, created_at, dismissed_by_json
         FROM loading_alerts
         WHERE created_at >= ?
         ORDER BY created_at DESC
         LIMIT 25`
      )
      .all(cutoff) as Array<{
      id: string;
      ticket_id: string;
      ticket_number: string;
      del_note_number: string;
      truck_number: string;
      gate_number: string;
      completed_by: string;
      completed_time: string;
      created_at: number;
      dismissed_by_json: string;
    }>;

    const userId = req.auth!.user.id;
    const alerts = rows
      .filter((r) => {
        try {
          const dismissed: string[] = JSON.parse(r.dismissed_by_json || '[]');
          return !dismissed.includes(userId);
        } catch {
          return true;
        }
      })
      .map((r) => ({
        id: r.id,
        ticketId: r.ticket_id,
        ticketNumber: r.ticket_number,
        delNoteNumber: r.del_note_number,
        truckNumber: r.truck_number,
        gateNumber: r.gate_number,
        completedBy: r.completed_by,
        completedTime: r.completed_time,
        createdAt: r.created_at,
      }));

    res.json({ alerts });
  }
);

app.post(
  '/api/loading-alerts/:id/dismiss',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('tickets.view'),
  (req: Request, res: Response) => {
    if (req.auth!.user.roleName === 'forklift_operator') {
      res.status(403).json({ error: 'Access denied: Forklift Operators are restricted to the Forklift Operator Section.' });
      return;
    }
    const alertId = req.params.id;
    const row = db.prepare(`SELECT dismissed_by_json FROM loading_alerts WHERE id = ?`).get(alertId) as
      | { dismissed_by_json: string }
      | undefined;

    if (!row) {
      res.json({ ok: true });
      return;
    }

    let list: string[] = [];
    try {
      list = JSON.parse(row.dismissed_by_json || '[]');
    } catch {
      list = [];
    }
    if (!list.includes(req.auth!.user.id)) {
      list.push(req.auth!.user.id);
      db.prepare(`UPDATE loading_alerts SET dismissed_by_json = ? WHERE id = ?`).run(JSON.stringify(list), alertId);
    }

    res.json({ ok: true });
  }
);

app.delete(
  '/api/tickets/:id',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('tickets.delete'),
  (req: Request, res: Response) => {
    const ticketId = req.params.id;
    const existing = db.prepare(`SELECT ticket_number, data_json FROM tickets WHERE id = ?`).get(ticketId) as
      | { ticket_number: string; data_json: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Ticket record not found.' });
      return;
    }

    db.prepare(`DELETE FROM tickets WHERE id = ?`).run(ticketId);
    const parsed = JSON.parse(existing.data_json);

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'TICKET_DELETED',
      targetType: 'ticket',
      targetId: existing.ticket_number,
      details: `Deleted ticket ${existing.ticket_number} (${parsed.truckNumber || ''})`,
      ipAddress: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

app.post(
  '/api/tickets/restore',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('tickets.delete'),
  (req: Request, res: Response) => {
    const payload = req.body || {};
    if (!payload.id || !payload.ticketNumber || !payload.date) {
      res.status(400).json({ error: 'Invalid ticket payload to restore.' });
      return;
    }

    const now = Date.now();
    const record = {
      ...payload,
      updatedAt: now,
    };

    db.prepare(
      `INSERT OR REPLACE INTO tickets (id, ticket_number, sequence_number, date, data_json, version, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.ticketNumber,
      Number(record.sequenceNumber) || 1,
      record.date,
      JSON.stringify(record),
      record.createdBy || req.auth!.user.username,
      req.auth!.user.username,
      record.createdAt || now,
      now
    );

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'TICKET_RESTORED',
      targetType: 'ticket',
      targetId: record.ticketNumber,
      details: `Restored deleted ticket ${record.ticketNumber} (${record.truckNumber || ''})`,
      ipAddress: getClientIp(req),
    });

    res.json({ ticket: { ...record, version: 1, updatedBy: req.auth!.user.username } });
  }
);

// Driver Master Endpoints
app.get(
  '/api/drivers',
  requireAuth,
  requirePasswordChanged,
  requirePermission('tickets.view'),
  (req: Request, res: Response) => {
    if (req.auth!.user.roleName === 'forklift_operator') {
      logAudit({
        actorUserId: req.auth!.user.id,
        actorUsername: req.auth!.user.username,
        action: 'UNAUTHORIZED_ACCESS',
        targetType: 'route',
        targetId: 'GET /api/drivers',
        details: 'Forklift Operator denied access to Driver Master directory',
        ipAddress: getClientIp(req),
      });
      res.status(403).json({ error: 'Access denied: Forklift Operators are restricted to the Forklift Operator Section.' });
      return;
    }
    const rows = db.prepare(`SELECT data_json FROM drivers ORDER BY updated_at DESC`).all() as Array<{
      data_json: string;
    }>;
    res.json({ drivers: rows.map((r) => JSON.parse(r.data_json)) });
  }
);

app.post(
  '/api/drivers',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('drivers.manage'),
  (req: Request, res: Response) => {
    const body = req.body || {};
    const cleanTruck = String(body.truckNumber || '').trim().toUpperCase();
    if (!cleanTruck || !String(body.driverName || '').trim() || !String(body.driverPhone || '').trim()) {
      res.status(400).json({ error: 'Vehicle Number, Driver Name, and Mobile Number are required.' });
      return;
    }

    const now = Date.now();
    const id = body.id || `drv-${now}-${crypto.randomBytes(3).toString('hex')}`;
    const record = {
      id,
      truckNumber: cleanTruck,
      driverName: String(body.driverName).trim(),
      driverPhone: String(body.driverPhone).trim(),
      iqamaNumber: String(body.iqamaNumber || '').trim(),
      transporterName: String(body.transporterName || '').trim(),
      defaultDestination: String(body.defaultDestination || '').trim(),
      lastVisited: body.lastVisited || new Date().toISOString().split('T')[0],
      tripCount: Number(body.tripCount) || 1,
    };

    const existing = db.prepare(`SELECT id FROM drivers WHERE truck_number = ? COLLATE NOCASE`).get(cleanTruck) as
      | { id: string }
      | undefined;

    if (existing) {
      db.prepare(`UPDATE drivers SET data_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify({ ...record, id: existing.id }),
        now,
        existing.id
      );
      res.json({ driver: { ...record, id: existing.id } });
      return;
    }

    db.prepare(`INSERT INTO drivers (id, truck_number, data_json, updated_at) VALUES (?, ?, ?, ?)`).run(
      id,
      cleanTruck,
      JSON.stringify(record),
      now
    );

    res.status(201).json({ driver: record });
  }
);

app.put(
  '/api/drivers/:id',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('drivers.manage'),
  (req: Request, res: Response) => {
    const id = req.params.id;
    const existing = db.prepare(`SELECT data_json FROM drivers WHERE id = ?`).get(id) as
      | { data_json: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Driver record not found.' });
      return;
    }
    const prev = JSON.parse(existing.data_json);
    const body = req.body || {};
    const cleanTruck = String(body.truckNumber || prev.truckNumber).trim().toUpperCase();
    const updated = {
      ...prev,
      ...body,
      id,
      truckNumber: cleanTruck,
    };
    db.prepare(`UPDATE drivers SET truck_number = ?, data_json = ?, updated_at = ? WHERE id = ?`).run(
      cleanTruck,
      JSON.stringify(updated),
      Date.now(),
      id
    );
    res.json({ driver: updated });
  }
);

app.delete(
  '/api/drivers/:id',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('drivers.manage'),
  (req: Request, res: Response) => {
    db.prepare(`DELETE FROM drivers WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  }
);

// Settings Endpoints
app.get('/api/settings', requireAuth, requirePasswordChanged, (_req: Request, res: Response) => {
  const activeRow = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'active'`).get() as
    | { value_json: string }
    | undefined;
  const defaultRow = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'default'`).get() as
    | { value_json: string }
    | undefined;

  res.json({
    settings: activeRow ? JSON.parse(activeRow.value_json) : null,
    defaultSettings: defaultRow ? JSON.parse(defaultRow.value_json) : null,
  });
});

app.put(
  '/api/settings',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('settings.manage'),
  (req: Request, res: Response) => {
    const newSettings = req.body || {};
    const now = Date.now();
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value_json, updated_by, updated_at) VALUES ('active', ?, ?, ?)`).run(
      JSON.stringify(newSettings),
      req.auth!.user.username,
      now
    );

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'SETTINGS_UPDATED',
      targetType: 'settings',
      targetId: 'active',
      details: `Updated Plant & System Settings (${newSettings.companyName || ''})`,
      ipAddress: getClientIp(req),
    });

    res.json({ settings: newSettings });
  }
);

app.put(
  '/api/settings/default',
  requireAuth,
  requirePasswordChanged,
  requireCsrf,
  requirePermission('settings.manage'),
  (req: Request, res: Response) => {
    const newSettings = req.body || {};
    const now = Date.now();
    db.transaction(() => {
      db.prepare(
        `INSERT OR REPLACE INTO app_settings (key, value_json, updated_by, updated_at) VALUES ('default', ?, ?, ?)`
      ).run(JSON.stringify(newSettings), req.auth!.user.username, now);
      db.prepare(
        `INSERT OR REPLACE INTO app_settings (key, value_json, updated_by, updated_at) VALUES ('active', ?, ?, ?)`
      ).run(JSON.stringify(newSettings), req.auth!.user.username, now);
    })();

    logAudit({
      actorUserId: req.auth!.user.id,
      actorUsername: req.auth!.user.username,
      action: 'SETTINGS_UPDATED',
      targetType: 'settings',
      targetId: 'default',
      details: `Saved current Plant & System Settings as system Default (${newSettings.companyName || ''})`,
      ipAddress: getClientIp(req),
    });

    res.json({ settings: newSettings, defaultSettings: newSettings });
  }
);

// One-time safe migration from legacy browser localStorage into empty SQLite DB
app.post('/api/bootstrap/migrate', requireAuth, requirePasswordChanged, requireCsrf, (req: Request, res: Response) => {
  if (req.auth!.user.roleName === 'forklift_operator') {
    res.status(403).json({ error: 'Access denied: Forklift Operators cannot run data migration.' });
    return;
  }
  const ticketCount = (db.prepare(`SELECT COUNT(*) as cnt FROM tickets`).get() as { cnt: number }).cnt;
  if (ticketCount > 0) {
    res.json({ migrated: false, reason: 'Database already populated.' });
    return;
  }

  const { tickets, drivers, settings, defaultSettings } = req.body || {};
  const now = Date.now();

  db.transaction(() => {
    if (Array.isArray(tickets)) {
      const insertTicket = db.prepare(
        `INSERT OR IGNORE INTO tickets (id, ticket_number, sequence_number, date, data_json, version, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      );
      for (const t of tickets) {
        if (t && t.id && t.ticketNumber && t.date) {
          insertTicket.run(
            t.id,
            t.ticketNumber,
            Number(t.sequenceNumber) || 1,
            t.date,
            JSON.stringify(t),
            req.auth!.user.username,
            req.auth!.user.username,
            t.createdAt || now,
            t.updatedAt || now
          );
        }
      }
    }

    if (Array.isArray(drivers)) {
      const insertDriver = db.prepare(
        `INSERT OR IGNORE INTO drivers (id, truck_number, data_json, updated_at) VALUES (?, ?, ?, ?)`
      );
      for (const d of drivers) {
        if (d && d.id && d.truckNumber) {
          insertDriver.run(d.id, String(d.truckNumber).toUpperCase(), JSON.stringify(d), now);
        }
      }
    }

    if (req.auth!.user.roleName === 'admin') {
      if (settings && typeof settings === 'object') {
        db.prepare(
          `INSERT OR REPLACE INTO app_settings (key, value_json, updated_by, updated_at) VALUES ('active', ?, ?, ?)`
        ).run(JSON.stringify(settings), req.auth!.user.username, now);
      }
      if (defaultSettings && typeof defaultSettings === 'object') {
        db.prepare(
          `INSERT OR REPLACE INTO app_settings (key, value_json, updated_by, updated_at) VALUES ('default', ?, ?, ?)`
        ).run(JSON.stringify(defaultSettings), req.auth!.user.username, now);
      }
    }
  })();

  logAudit({
    actorUserId: req.auth!.user.id,
    actorUsername: req.auth!.user.username,
    action: 'BACKUP_RESTORED',
    targetType: 'system',
    details: `Migrated ${Array.isArray(tickets) ? tickets.length : 0} existing records into shared server database`,
    ipAddress: getClientIp(req),
  });

  res.json({ migrated: true });
});

app.get(
  '/api/backup/export',
  requireAuth,
  requirePasswordChanged,
  requirePermission('reports.view'),
  (_req: Request, res: Response) => {
    const tickets = (db.prepare(`SELECT data_json FROM tickets ORDER BY date DESC, sequence_number ASC`).all() as Array<{
      data_json: string;
    }>).map((r) => JSON.parse(r.data_json));
    const drivers = (db.prepare(`SELECT data_json FROM drivers`).all() as Array<{ data_json: string }>).map((r) =>
      JSON.parse(r.data_json)
    );
    const activeRow = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'active'`).get() as
      | { value_json: string }
      | undefined;
    const defaultRow = db.prepare(`SELECT value_json FROM app_settings WHERE key = 'default'`).get() as
      | { value_json: string }
      | undefined;

    res.json({
      tickets,
      drivers,
      settings: activeRow ? JSON.parse(activeRow.value_json) : undefined,
      defaultSettings: defaultRow ? JSON.parse(defaultRow.value_json) : undefined,
      exportedAt: new Date().toISOString(),
    });
  }
);

app.post('/api/backup/restore', requireAuth, requirePasswordChanged, requireCsrf, requireAdmin, (req: Request, res: Response) => {
  const { tickets, drivers, settings, defaultSettings } = req.body || {};
  const now = Date.now();

  db.transaction(() => {
    if (Array.isArray(tickets)) {
      db.prepare(`DELETE FROM tickets`).run();
      const insertTicket = db.prepare(
        `INSERT INTO tickets (id, ticket_number, sequence_number, date, data_json, version, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      );
      for (const t of tickets) {
        if (t && t.id && t.ticketNumber && t.date) {
          insertTicket.run(
            t.id,
            t.ticketNumber,
            Number(t.sequenceNumber) || 1,
            t.date,
            JSON.stringify(t),
            req.auth!.user.username,
            req.auth!.user.username,
            t.createdAt || now,
            t.updatedAt || now
          );
        }
      }
    }
    if (Array.isArray(drivers)) {
      db.prepare(`DELETE FROM drivers`).run();
      const insertDriver = db.prepare(
        `INSERT OR REPLACE INTO drivers (id, truck_number, data_json, updated_at) VALUES (?, ?, ?, ?)`
      );
      for (const d of drivers) {
        if (d && d.id && d.truckNumber) {
          insertDriver.run(d.id, String(d.truckNumber).toUpperCase(), JSON.stringify(d), now);
        }
      }
    }
    if (settings && typeof settings === 'object') {
      db.prepare(
        `INSERT OR REPLACE INTO app_settings (key, value_json, updated_by, updated_at) VALUES ('active', ?, ?, ?)`
      ).run(JSON.stringify(settings), req.auth!.user.username, now);
    }
    if (defaultSettings && typeof defaultSettings === 'object') {
      db.prepare(
        `INSERT OR REPLACE INTO app_settings (key, value_json, updated_by, updated_at) VALUES ('default', ?, ?, ?)`
      ).run(JSON.stringify(defaultSettings), req.auth!.user.username, now);
    }
  })();

  logAudit({
    actorUserId: req.auth!.user.id,
    actorUsername: req.auth!.user.username,
    action: 'BACKUP_RESTORED',
    targetType: 'system',
    details: 'Admin restored database backup',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

// Reject any unknown /api route cleanly with JSON 404
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ==========================================
// 4. VITE DEV MIDDLEWARE / STATIC DIST SERVER
// ==========================================

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    try {
      processAutoLoadingTransitions();
    } catch (err) {
      console.error('Auto-loading transition check error:', err);
    }
    setInterval(() => {
      try {
        processAutoLoadingTransitions();
      } catch (err) {
        console.error('Auto-loading transition interval error:', err);
      }
    }, 30000);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
