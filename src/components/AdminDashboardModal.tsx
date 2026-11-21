import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthUser, UserRoleName, PermissionOption, RoleOption, AuditLogEntry, ActiveSessionInfo } from '../types';
import { ApiClient } from '../services/api';
import { processSignatureFile } from '../utils/logo';
import {
  Shield,
  Users,
  History,
  Activity,
  UserPlus,
  Edit2,
  KeyRound,
  Trash2,
  Power,
  LogOut,
  X,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  PenTool,
  Upload,
  Loader2,
} from 'lucide-react';

interface AdminDashboardModalProps {
  currentUser: AuthUser;
  onClose: () => void;
  onCurrentUserUpdated?: (user: AuthUser) => void;
}

const USER_ASSIGNABLE_PERMISSIONS = [
  { key: 'tickets.view', label: 'View Gate Queue & Tickets' },
  { key: 'tickets.create', label: 'Register New Gate Tickets' },
  { key: 'tickets.update', label: 'Call Trucks, Update Status & Loading Slips' },
  { key: 'forklift.operate', label: 'Forklift Operator Loading Checklist' },
  { key: 'tickets.delete', label: 'Delete / Restore Tickets' },
  { key: 'slips.print', label: 'Print / Export PDF Slips & Tokens' },
  { key: 'drivers.manage', label: 'Manage Driver & Vehicle Master' },
  { key: 'reports.view', label: 'View & Export Daily Reports' },
  { key: 'dispatch.view', label: 'Dispatch Details: View & Export Summary' },
  { key: 'material_register.view', label: 'Material Register (Dispatch Items): View & Export' },
  { key: 'liquid.view', label: 'Liquid Material Camp Store: View Only (Tanks & Stock)' },
  { key: 'liquid.store', label: 'Liquid Material Camp Store: Inward / Outward & Tanks' },
  { key: 'liquid.materials', label: 'Material Master Data (Liquid Store): Create / Edit / Delete' },
  { key: 'ex_factory.view', label: 'Ex-Factory Dispatch: View & Export Records' },
  { key: 'ex_factory.create', label: 'Ex-Factory Dispatch: Create / Save Entries' },
  { key: 'ex_factory.update', label: 'Ex-Factory Dispatch: Edit / Update Entries' },
  { key: 'ex_factory.delete', label: 'Ex-Factory Dispatch: Delete Entries' },
];

const VIEW_ONLY_PERMS = [
  'tickets.view',
  'dispatch.view',
  'material_register.view',
  'reports.view',
  'liquid.view',
  'ex_factory.view',
];

const VIEW_ONLY_ASSIGNABLE_PERMISSIONS = [
  { key: 'tickets.view', label: 'Gate Queue & Tickets (View Only)' },
  { key: 'dispatch.view', label: 'Dispatch Details Summary (View Only)' },
  { key: 'material_register.view', label: 'Material Register (View Only)' },
  { key: 'reports.view', label: 'Daily Reports & Export (View Only)' },
  { key: 'liquid.view', label: 'Liquid Store & Material Master (View Only)' },
  { key: 'ex_factory.view', label: 'Ex-Factory Dispatch Records (View Only)' },
];

const DEFAULT_USER_PERMS = [
  'tickets.view',
  'tickets.create',
  'tickets.update',
  'slips.print',
  'reports.view',
  'dispatch.view',
  'material_register.view',
  'liquid.view',
  'liquid.store',
  'liquid.materials',
  'ex_factory.view',
  'ex_factory.create',
  'ex_factory.update',
];

const DEFAULT_MMD_MANAGER_PERMS = [
  'tickets.view',
  'tickets.create',
  'tickets.update',
  'forklift.operate',
  'slips.print',
  'drivers.manage',
  'reports.view',
  'dispatch.view',
  'material_register.view',
  'liquid.view',
  'liquid.store',
  'liquid.materials',
  'ex_factory.view',
  'ex_factory.create',
  'ex_factory.update',
];

const FORKLIFT_ASSIGNABLE_PERMISSIONS = [
  { key: 'tickets.view', label: 'View Assigned Loading Slips & Queue' },
  { key: 'forklift.operate', label: 'Forklift Operator Loading Checklist & Completion' },
];

const DEFAULT_FORKLIFT_PERMS = ['tickets.view', 'forklift.operate'];

const LIQUID_STORE_ASSIGNABLE_PERMISSIONS = [
  { key: 'liquid.view', label: 'View Liquid Material Camp Store (Stock, Tanks & Reports)' },
  { key: 'liquid.store', label: 'Manage Inward / Outward Entries & Tanks' },
  { key: 'liquid.materials', label: 'Manage Material Master Data (Create / Edit / Delete)' },
];

const DEFAULT_LIQUID_STORE_PERMS = ['liquid.view', 'liquid.store', 'liquid.materials'];

const EX_FACTORY_ASSIGNABLE_PERMISSIONS = [
  { key: 'ex_factory.view', label: 'View, Search & Export Ex-Factory Dispatch Entries' },
  { key: 'ex_factory.create', label: 'Create & Save New Ex-Factory Entries' },
  { key: 'ex_factory.update', label: 'Edit & Update Existing Ex-Factory Entries' },
  { key: 'ex_factory.delete', label: 'Delete Ex-Factory Entries' },
];

const DEFAULT_EX_FACTORY_PERMS = ['ex_factory.view', 'ex_factory.create', 'ex_factory.update'];

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  currentUser,
  onClose,
  onCurrentUserUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'sessions' | 'audit'>('users');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [permissionsMeta, setPermissionsMeta] = useState<PermissionOption[]>([]);
  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create User Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTempPassword, setNewTempPassword] = useState('');
  const [newRoleName, setNewRoleName] = useState<UserRoleName>('user');
  const [newIsActive, setNewIsActive] = useState(true);
  const [newPerms, setNewPerms] = useState<string[]>(DEFAULT_USER_PERMS);
  const [newSignatureDataUrl, setNewSignatureDataUrl] = useState('');
  const [newSigProcessing, setNewSigProcessing] = useState(false);
  const newSigInputRef = useRef<HTMLInputElement>(null);
  const [showNewPass, setShowNewPass] = useState(false);

  // Edit User Drawer/Modal State
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRoleName, setEditRoleName] = useState<UserRoleName>('user');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [editSignatureDataUrl, setEditSignatureDataUrl] = useState('');
  const [editSigProcessing, setEditSigProcessing] = useState(false);
  const editSigInputRef = useRef<HTMLInputElement>(null);

  // Quick Row Signature Upload State (Admin only)
  const [rowSigLoadingId, setRowSigLoadingId] = useState<string | null>(null);
  const [rowSigTargetUser, setRowSigTargetUser] = useState<AuthUser | null>(null);
  const rowSigInputRef = useRef<HTMLInputElement>(null);

  // Reset Password State
  const [resetTarget, setResetTarget] = useState<AuthUser | null>(null);
  const [resetTempPass, setResetTempPass] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);

  // Inline Delete Confirmation State
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AuthUser | null>(null);

  // Audit Filter State
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditSearch, setAuditSearch] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [usersRes, rolesRes, sessionsRes, auditRes] = await Promise.all([
        ApiClient.getUsers(),
        ApiClient.getRolesAndPermissions(),
        ApiClient.getActiveSessions(),
        ApiClient.getAuditLogs({ action: auditActionFilter, search: auditSearch, limit: 150 }),
      ]);
      setUsers(usersRes.users);
      setRoles(rolesRes.roles);
      setPermissionsMeta(rolesRes.permissions);
      setSessions(sessionsRes.sessions);
      setAuditLogs(auditRes.logs);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load administrative data.');
    } finally {
      setLoading(false);
    }
  }, [auditActionFilter, auditSearch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const formatDateTime = (ts: number | null) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const togglePerm = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, key: string) => {
    setList(list.includes(key) ? list.filter((p) => p !== key) : [...list, key]);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await ApiClient.createUser({
        username: newUsername.trim(),
        fullName: newFullName.trim(),
        email: newEmail.trim(),
        temporaryPassword: newTempPassword,
        roleName: newRoleName,
        isActive: newIsActive,
        permissions: newRoleName !== 'admin' ? newPerms : undefined,
        signatureDataUrl: newSignatureDataUrl || '',
      });
      setSuccessMsg(
        `User "${res.user.username}" created as ${res.user.roleDisplayName}. They must change their temporary password on first login.`
      );
      setShowCreateForm(false);
      setNewUsername('');
      setNewFullName('');
      setNewEmail('');
      setNewTempPassword('');
      setNewRoleName('user');
      setNewIsActive(true);
      setNewPerms(DEFAULT_USER_PERMS);
      setNewSignatureDataUrl('');
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create user.');
    }
  };

  const handleNewUserSignatureSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNewSigProcessing(true);
    setErrorMsg(null);
    try {
      const png = await processSignatureFile(file);
      setNewSignatureDataUrl(png);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to process signature image.');
    } finally {
      setNewSigProcessing(false);
    }
  };

  const handleEditUserSignatureSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEditSigProcessing(true);
    setErrorMsg(null);
    try {
      const png = await processSignatureFile(file);
      setEditSignatureDataUrl(png);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to process signature image.');
    } finally {
      setEditSigProcessing(false);
    }
  };

  const handleQuickRowSignatureSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = rowSigTargetUser;
    setRowSigTargetUser(null);
    if (!file || !target) return;
    setRowSigLoadingId(target.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const png = await processSignatureFile(file);
      const res = await ApiClient.uploadUserSignature(target.id, png);
      if (res.user.id === currentUser.id) {
        onCurrentUserUpdated?.(res.user);
      }
      setSuccessMsg(`Digital signature ${target.signatureDataUrl ? 'updated' : 'uploaded'} for "@${target.username}".`);
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to upload digital signature.');
    } finally {
      setRowSigLoadingId(null);
    }
  };

  const handleQuickRowSignatureDelete = async (u: AuthUser) => {
    setRowSigLoadingId(u.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await ApiClient.deleteUserSignature(u.id);
      if (res.user.id === currentUser.id) {
        onCurrentUserUpdated?.(res.user);
      }
      setSuccessMsg(`Digital signature deleted for "@${u.username}".`);
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete digital signature.');
    } finally {
      setRowSigLoadingId(null);
    }
  };

  const startEditUser = (u: AuthUser) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditEmail(u.email || '');
    setEditRoleName(
      u.roleName === 'admin'
        ? 'admin'
        : u.roleName === 'mmd_manager'
        ? 'mmd_manager'
        : u.roleName === 'view_only'
        ? 'view_only'
        : u.roleName === 'forklift_operator'
        ? 'forklift_operator'
        : u.roleName === 'liquid_store_operator'
        ? 'liquid_store_operator'
        : u.roleName === 'ex_factory_operator'
        ? 'ex_factory_operator'
        : 'user'
    );
    setEditIsActive(u.isActive);
    setEditPerms(u.permissions || []);
    setEditSignatureDataUrl(u.signatureDataUrl || '');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const updated = await ApiClient.updateUser(editingUser.id, {
        fullName: editFullName.trim(),
        email: editEmail.trim(),
        roleName: editRoleName,
        isActive: editIsActive,
        signatureDataUrl: editSignatureDataUrl,
      });

      if (editRoleName !== 'admin') {
        await ApiClient.updateUserPermissions(editingUser.id, editPerms);
      }

      if (updated.user && updated.user.id === currentUser.id) {
        onCurrentUserUpdated?.(updated.user);
      }

      setSuccessMsg(`Updated user "${editingUser.username}" successfully.`);
      setEditingUser(null);
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update user.');
    }
  };

  const handleToggleActive = async (u: AuthUser) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await ApiClient.updateUser(u.id, { isActive: !u.isActive });
      setSuccessMsg(
        `Account "${u.username}" ${u.isActive ? 'deactivated & signed out' : 'activated'}.`
      );
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to change user status.');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await ApiClient.resetUserPassword(resetTarget.id, resetTempPass);
      setSuccessMsg(
        `Temporary password assigned for "${resetTarget.username}". Active sessions revoked; user must update password on next sign-in.`
      );
      setResetTarget(null);
      setResetTempPass('');
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to reset password.');
    }
  };

  const handleRevokeSessions = async (u: { id: string; username: string }) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await ApiClient.revokeUserSessions(u.id);
      setSuccessMsg(`Terminated all active sessions for "${u.username}".`);
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to revoke sessions.');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteUser) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await ApiClient.deleteUser(confirmDeleteUser.id);
      setSuccessMsg(`Deleted user "${confirmDeleteUser.username}".`);
      setConfirmDeleteUser(null);
      await loadAll();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete user.');
    }
  };

  return (
    <div
      data-preserve-case="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-neutral-200 w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-neutral-900 via-slate-900 to-blue-950 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <Shield className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide">
                Administrator Security & User Management
              </h2>
              <p className="text-xs text-blue-200/80">
                Role-Based Access Control, Sessions & Audit Trail • Signed in as @{currentUser.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="app-btn bg-white/10 hover:bg-white/20 text-white border border-white/15"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="app-btn bg-white/10 hover:bg-white/20 text-white border border-white/15"
              aria-label="Close Admin Panel"
            >
              <X className="w-4 h-4 shrink-0" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="bg-neutral-100 border-b border-neutral-200 px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="grid grid-cols-3 sm:flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`app-btn w-full sm:w-auto ${
                activeTab === 'users'
                  ? 'bg-white text-blue-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Users className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Users ({users.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              className={`app-btn w-full sm:w-auto ${
                activeTab === 'sessions'
                  ? 'bg-white text-blue-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Activity className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Sessions ({sessions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`app-btn w-full sm:w-auto ${
                activeTab === 'audit'
                  ? 'bg-white text-blue-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <History className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Audit Logs ({auditLogs.length})</span>
            </button>
          </div>

          {activeTab === 'users' && (
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(!showCreateForm);
                setErrorMsg(null);
              }}
              className="app-btn w-full sm:w-auto bg-blue-700 hover:bg-blue-600 text-white shadow-sm"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>{showCreateForm ? 'Close Form' : 'Create New User'}</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </span>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB 1: USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Create User Form */}
              {showCreateForm && (
                <form
                  onSubmit={handleCreateUser}
                  className="bg-neutral-50 border border-neutral-300 rounded-2xl p-4 sm:p-5 space-y-4 shadow-inner"
                >
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-blue-700" />
                      <span>Create New User Account</span>
                    </h3>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                      First-login password change enforced automatically
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        Username *
                      </label>
                      <input
                        type="text"
                        required
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="e.g. operator1"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        placeholder="e.g. Ahmed Hassan"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        Temporary Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          data-preserve-case="true"
                          required
                          value={newTempPassword}
                          onChange={(e) => setNewTempPassword(e.target.value)}
                          placeholder="Min 8 chars, Aa1!"
                          className="w-full pl-3 pr-9 py-2 text-xs rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass(!showNewPass)}
                          className="absolute right-2.5 top-2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                        >
                          {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">Role *</label>
                      <select
                        value={newRoleName}
                        onChange={(e) => {
                          const nextRole = e.target.value as UserRoleName;
                          setNewRoleName(nextRole);
                          if (nextRole === 'forklift_operator') {
                            setNewPerms(DEFAULT_FORKLIFT_PERMS);
                          } else if (nextRole === 'liquid_store_operator') {
                            setNewPerms(DEFAULT_LIQUID_STORE_PERMS);
                          } else if (nextRole === 'ex_factory_operator') {
                            setNewPerms(DEFAULT_EX_FACTORY_PERMS);
                          } else if (nextRole === 'mmd_manager') {
                            setNewPerms(DEFAULT_MMD_MANAGER_PERMS);
                          } else if (nextRole === 'view_only') {
                            setNewPerms(VIEW_ONLY_PERMS);
                          } else if (nextRole === 'user') {
                            setNewPerms(DEFAULT_USER_PERMS);
                          }
                        }}
                        className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-neutral-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                      >
                        {roles.length > 0 ? (
                          roles.map((r) => (
                            <option key={r.id} value={r.name}>
                              {r.displayName} ({r.name})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="user">User / Operator (user)</option>
                            <option value="mmd_manager">MMD Manager (mmd_manager)</option>
                            <option value="view_only">View Only (view_only)</option>
                            <option value="forklift_operator">Forklift Operator (forklift_operator)</option>
                            <option value="liquid_store_operator">Liquid Store Operator (liquid_store_operator)</option>
                            <option value="ex_factory_operator">Ex-Factory Operator (ex_factory_operator)</option>
                            <option value="admin">Administrator (admin)</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 text-xs font-bold text-neutral-800 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newIsActive}
                          onChange={(e) => setNewIsActive(e.target.checked)}
                          className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Account Active Immediately</span>
                      </label>
                    </div>
                  </div>

                  {(newRoleName === 'user' || newRoleName === 'mmd_manager') && (
                    <div className="bg-white border border-neutral-200 rounded-xl p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-neutral-700">
                          {newRoleName === 'mmd_manager'
                            ? 'MMD Manager Section & Operation Permissions:'
                            : 'Assigned Section & Operation Permissions:'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setNewPerms(VIEW_ONLY_PERMS)}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 cursor-pointer"
                          >
                            View Only
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPerms(['liquid.view', 'liquid.store', 'liquid.materials'])}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 cursor-pointer"
                          >
                            Liquid Store Only
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPerms(DEFAULT_EX_FACTORY_PERMS)}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
                          >
                            Ex-Factory Only
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setNewPerms(newRoleName === 'mmd_manager' ? DEFAULT_MMD_MANAGER_PERMS : DEFAULT_USER_PERMS)
                            }
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200 cursor-pointer"
                          >
                            Reset Standard
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {USER_ASSIGNABLE_PERMISSIONS.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={newPerms.includes(perm.key)}
                              onChange={() => togglePerm(newPerms, setNewPerms, perm.key)}
                              className="w-3.5 h-3.5 rounded border-neutral-300 text-blue-600"
                            />
                            <span>{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {newRoleName === 'view_only' && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-bold text-purple-900">
                        View Only Access Scope (Read-Only Monitoring & Reporting — Create / Edit / Delete Disabled):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {VIEW_ONLY_ASSIGNABLE_PERMISSIONS.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 text-xs text-purple-950 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={newPerms.includes(perm.key)}
                              onChange={() => togglePerm(newPerms, setNewPerms, perm.key)}
                              className="w-3.5 h-3.5 rounded border-purple-400 text-purple-600"
                            />
                            <span>{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {newRoleName === 'forklift_operator' && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-bold text-emerald-900">
                        Forklift Operator Access Scope (Restricted to Forklift Operator Section Only):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {FORKLIFT_ASSIGNABLE_PERMISSIONS.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 text-xs text-emerald-950 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={newPerms.includes(perm.key)}
                              onChange={() => togglePerm(newPerms, setNewPerms, perm.key)}
                              className="w-3.5 h-3.5 rounded border-emerald-400 text-emerald-600"
                            />
                            <span>{perm.label}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-emerald-800">
                        All other dashboards, menus, reports, settings, and admin panels are completely hidden from Forklift Operator accounts.
                      </p>
                    </div>
                  )}

                  {newRoleName === 'liquid_store_operator' && (
                    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-bold text-sky-900">
                        Liquid Store Operator Access Scope (Restricted to Liquid Material Camp Store Only):
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {LIQUID_STORE_ASSIGNABLE_PERMISSIONS.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 text-xs text-sky-950 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={newPerms.includes(perm.key)}
                              onChange={() => togglePerm(newPerms, setNewPerms, perm.key)}
                              className="w-3.5 h-3.5 rounded border-sky-400 text-sky-600"
                            />
                            <span>{perm.label}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-sky-800">
                        All Gate Queue, Tickets, Forklift, Ex-Factory, Driver Master, Settings, and Admin panels are completely hidden from Liquid Store Operator accounts.
                      </p>
                    </div>
                  )}

                  {newRoleName === 'ex_factory_operator' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <p className="text-[11px] font-bold text-amber-900">
                        Ex-Factory Operator Access Scope (Restricted to Ex-Factory Dispatch Only):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {EX_FACTORY_ASSIGNABLE_PERMISSIONS.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 text-xs text-amber-950 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={newPerms.includes(perm.key)}
                              onChange={() => togglePerm(newPerms, setNewPerms, perm.key)}
                              className="w-3.5 h-3.5 rounded border-amber-400 text-amber-600"
                            />
                            <span>{perm.label}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-800">
                        All Gate Queue, Tickets, Forklift, Liquid Store, Driver Master, Settings, and Admin panels are completely hidden from Ex-Factory Operator accounts.
                      </p>
                    </div>
                  )}

                  {/* Per-User Digital Signature Upload (Create User - Admin Only) */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-neutral-800 flex items-center gap-1.5">
                        <PenTool className="w-3.5 h-3.5 text-blue-700" />
                        <span>User Digital Signature (Optional — Admin Only)</span>
                      </span>
                      <span className="text-[10px] text-neutral-500">PNG, JPG, WebP, SVG</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 h-14 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center px-3">
                        {newSignatureDataUrl ? (
                          <img
                            src={newSignatureDataUrl}
                            alt="New User Digital Signature"
                            className="max-h-11 max-w-[180px] object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-neutral-400 italic">No signature selected</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          ref={newSigInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                          onChange={handleNewUserSignatureSelect}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={newSigProcessing}
                          onClick={() => newSigInputRef.current?.click()}
                          className="app-btn-sm bg-blue-700 hover:bg-blue-600 text-white"
                        >
                          {newSigProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Upload className="w-3.5 h-3.5 shrink-0" />}
                          <span>{newSignatureDataUrl ? 'Change' : 'Upload Signature'}</span>
                        </button>
                        {newSignatureDataUrl && (
                          <button
                            type="button"
                            onClick={() => setNewSignatureDataUrl('')}
                            className="app-btn-sm bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-100 text-xs font-bold text-neutral-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-extrabold shadow-sm cursor-pointer"
                    >
                      Create User Account
                    </button>
                  </div>
                </form>
              )}

              {/* Hidden shared file input for quick per-row Admin signature upload/replace */}
              <input
                ref={rowSigInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                onChange={handleQuickRowSignatureSelect}
                className="hidden"
              />

              {/* Users Table (Desktop / Tablet) */}
              <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-neutral-900 text-white text-[11px] uppercase tracking-wider font-bold">
                        <th className="py-3 px-3.5">Username & Full Name</th>
                        <th className="py-3 px-3">Role</th>
                        <th className="py-3 px-3 text-center">Status</th>
                        <th className="py-3 px-3 text-center">Digital Signature</th>
                        <th className="py-3 px-3">Created</th>
                        <th className="py-3 px-3">Last Login</th>
                        <th className="py-3 px-3 text-center">Sessions</th>
                        <th className="py-3 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {users.map((u) => {
                        const isSelf = u.id === currentUser.id;
                        return (
                          <tr key={u.id} className="hover:bg-neutral-50 transition">
                            <td className="py-3 px-3.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-neutral-900 font-mono">@{u.username}</span>
                                {isSelf && (
                                  <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                    You
                                  </span>
                                )}
                                {u.mustChangePassword && (
                                  <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                                    Must Change PW
                                  </span>
                                )}
                              </div>
                              <p className="text-neutral-600 font-medium">{u.fullName}</p>
                              {u.email && <p className="text-[10px] text-neutral-400">{u.email}</p>}
                            </td>

                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                                  u.roleName === 'admin'
                                    ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                    : u.roleName === 'mmd_manager'
                                    ? 'bg-teal-50 text-teal-900 border-teal-200'
                                    : u.roleName === 'view_only'
                                    ? 'bg-purple-50 text-purple-900 border-purple-200'
                                    : u.roleName === 'forklift_operator'
                                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                    : u.roleName === 'liquid_store_operator'
                                    ? 'bg-sky-50 text-sky-900 border-sky-200'
                                    : u.roleName === 'ex_factory_operator'
                                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                                    : 'bg-neutral-100 text-neutral-800 border-neutral-200'
                                }`}
                              >
                                {u.roleDisplayName}
                              </span>
                              {u.roleName !== 'admin' && (
                                <p className="text-[10px] text-neutral-500 mt-1">
                                  {u.permissions.length} permission{u.permissions.length === 1 ? '' : 's'}
                                </p>
                              )}
                            </td>

                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                  u.isActive
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-red-50 text-red-800 border-red-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    u.isActive ? 'bg-emerald-500' : 'bg-red-500'
                                  }`}
                                />
                                {u.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                {u.signatureDataUrl ? (
                                  <div className="h-9 w-24 rounded-lg border border-neutral-200 bg-white flex items-center justify-center p-1 shadow-2xs">
                                    <img
                                      src={u.signatureDataUrl}
                                      alt={`Signature of ${u.fullName}`}
                                      className="max-h-7 max-w-[88px] object-contain"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-neutral-400 italic">Not uploaded</span>
                                )}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={rowSigLoadingId === u.id}
                                    onClick={() => {
                                      setRowSigTargetUser(u);
                                      rowSigInputRef.current?.click();
                                    }}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    title={u.signatureDataUrl ? 'Change user digital signature' : 'Upload user digital signature'}
                                  >
                                    {rowSigLoadingId === u.id ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : (
                                      <Upload className="w-2.5 h-2.5" />
                                    )}
                                    <span>{u.signatureDataUrl ? 'Edit' : 'Upload'}</span>
                                  </button>
                                  {u.signatureDataUrl && (
                                    <button
                                      type="button"
                                      disabled={rowSigLoadingId === u.id}
                                      onClick={() => handleQuickRowSignatureDelete(u)}
                                      className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 inline-flex items-center cursor-pointer disabled:opacity-50 transition"
                                      title="Delete user digital signature"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-3 text-[11px] text-neutral-600">
                              {formatDateTime(u.createdAt)}
                            </td>

                            <td className="py-3 px-3 text-[11px] text-neutral-600">
                              {formatDateTime(u.lastLoginAt)}
                            </td>

                            <td className="py-3 px-3 text-center">
                              <span className="font-mono font-bold text-neutral-800">
                                {u.activeSessionCount || 0}
                              </span>
                            </td>

                            <td className="py-3 px-3">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => startEditUser(u)}
                                  className="app-btn-sm bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200"
                                  title="Edit user details & permissions"
                                >
                                  <Edit2 className="w-3 h-3 shrink-0" />
                                  <span>Edit</span>
                                </button>

                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(u)}
                                    className={`app-btn-sm border ${
                                      u.isActive
                                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}
                                    title={u.isActive ? 'Disable user & revoke access' : 'Enable user'}
                                  >
                                    <Power className="w-3 h-3 shrink-0" />
                                    <span>{u.isActive ? 'Disable' : 'Enable'}</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setResetTarget(u);
                                    setResetTempPass('');
                                  }}
                                  className="app-btn-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300"
                                  title="Assign temporary password reset"
                                >
                                  <KeyRound className="w-3 h-3 shrink-0" />
                                  <span>Reset PW</span>
                                </button>

                                {!isSelf && (u.activeSessionCount || 0) > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeSessions(u)}
                                    className="app-btn-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-300"
                                    title="Force logout active sessions"
                                  >
                                    <LogOut className="w-3 h-3 shrink-0" />
                                    <span>Kick</span>
                                  </button>
                                )}

                                {!isSelf && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUser(u)}
                                    className="app-btn-sm bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200"
                                    title="Delete user account"
                                  >
                                    <Trash2 className="w-3 h-3 shrink-0" />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Edit User Modal Card */}
              {editingUser && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
                  <form
                    onSubmit={handleSaveEditUser}
                    className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-lg overflow-hidden"
                  >
                    <div className="bg-neutral-900 text-white px-5 py-3.5 flex items-center justify-between">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Edit2 className="w-4 h-4 text-blue-400" />
                        <span>Edit User: @{editingUser.username}</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditingUser(null)}
                        className="text-neutral-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-700 mb-1">Full Name *</label>
                          <input
                            type="text"
                            required
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-neutral-700 mb-1">Role</label>
                          <select
                            value={editRoleName}
                            disabled={editingUser.id === currentUser.id}
                            onChange={(e) => {
                              const nextRole = e.target.value as UserRoleName;
                              setEditRoleName(nextRole);
                              if (nextRole === 'forklift_operator') {
                                setEditPerms(DEFAULT_FORKLIFT_PERMS);
                              } else if (nextRole === 'liquid_store_operator') {
                                setEditPerms(DEFAULT_LIQUID_STORE_PERMS);
                              } else if (nextRole === 'ex_factory_operator') {
                                setEditPerms(DEFAULT_EX_FACTORY_PERMS);
                              } else if (nextRole === 'mmd_manager' && editingUser.roleName !== 'mmd_manager') {
                                setEditPerms(DEFAULT_MMD_MANAGER_PERMS);
                              } else if (nextRole === 'view_only') {
                                setEditPerms(
                                  editingUser.roleName === 'view_only'
                                    ? editingUser.permissions || VIEW_ONLY_PERMS
                                    : VIEW_ONLY_PERMS
                                );
                              } else if (nextRole === 'user' && editingUser.roleName !== 'user') {
                                setEditPerms(DEFAULT_USER_PERMS);
                              } else if (nextRole === 'user' || nextRole === 'mmd_manager') {
                                setEditPerms(
                                  editingUser.permissions ||
                                    (nextRole === 'mmd_manager' ? DEFAULT_MMD_MANAGER_PERMS : DEFAULT_USER_PERMS)
                                );
                              }
                            }}
                            className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-neutral-300 bg-white disabled:opacity-60"
                          >
                            {roles.length > 0 ? (
                              roles.map((r) => (
                                <option key={r.id} value={r.name}>
                                  {r.displayName} ({r.name})
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="user">User / Operator (user)</option>
                                <option value="mmd_manager">MMD Manager (mmd_manager)</option>
                                <option value="view_only">View Only (view_only)</option>
                                <option value="forklift_operator">Forklift Operator (forklift_operator)</option>
                                <option value="liquid_store_operator">Liquid Store Operator (liquid_store_operator)</option>
                                <option value="ex_factory_operator">Ex-Factory Operator (ex_factory_operator)</option>
                                <option value="admin">Administrator (admin)</option>
                              </>
                            )}
                          </select>
                        </div>

                        <div className="flex items-end pb-1">
                          <label className="flex items-center gap-2 text-xs font-bold text-neutral-800 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={editingUser.id === currentUser.id}
                              checked={editIsActive}
                              onChange={(e) => setEditIsActive(e.target.checked)}
                              className="w-4 h-4 rounded border-neutral-300 text-blue-600"
                            />
                            <span>Account Active</span>
                          </label>
                        </div>
                      </div>

                      {editRoleName === 'user' || editRoleName === 'mmd_manager' ? (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] font-bold text-neutral-800">
                              {editRoleName === 'mmd_manager'
                                ? 'MMD Manager Access Permissions'
                                : 'Granular Access Permissions'}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditPerms(VIEW_ONLY_PERMS)}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 cursor-pointer"
                              >
                                View Only
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditPerms(['liquid.view', 'liquid.store', 'liquid.materials'])}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 cursor-pointer"
                              >
                                Liquid Store Only
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditPerms(DEFAULT_EX_FACTORY_PERMS)}
                                className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
                              >
                                Ex-Factory Only
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditPerms(
                                    editRoleName === 'mmd_manager' ? DEFAULT_MMD_MANAGER_PERMS : DEFAULT_USER_PERMS
                                  )
                                }
                                className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 cursor-pointer"
                              >
                                Reset Standard
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {USER_ASSIGNABLE_PERMISSIONS.map((perm) => (
                              <label
                                key={perm.key}
                                className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={editPerms.includes(perm.key)}
                                  onChange={() => togglePerm(editPerms, setEditPerms, perm.key)}
                                  className="w-3.5 h-3.5 rounded border-neutral-300 text-blue-600"
                                />
                                <span>{perm.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : editRoleName === 'view_only' ? (
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                          <p className="text-[11px] font-bold text-purple-900">
                            View Only Permissions (Read-Only Monitoring — Create / Edit / Delete Disabled)
                          </p>
                          <div className="space-y-1.5">
                            {VIEW_ONLY_ASSIGNABLE_PERMISSIONS.map((perm) => (
                              <label
                                key={perm.key}
                                className="flex items-center gap-2 text-xs text-purple-950 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={editPerms.includes(perm.key)}
                                  onChange={() => togglePerm(editPerms, setEditPerms, perm.key)}
                                  className="w-3.5 h-3.5 rounded border-purple-400 text-purple-600"
                                />
                                <span>{perm.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : editRoleName === 'forklift_operator' ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                          <p className="text-[11px] font-bold text-emerald-900">
                            Forklift Operator Permissions (Restricted Section Only)
                          </p>
                          <div className="space-y-1.5">
                            {FORKLIFT_ASSIGNABLE_PERMISSIONS.map((perm) => (
                              <label
                                key={perm.key}
                                className="flex items-center gap-2 text-xs text-emerald-950 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={editPerms.includes(perm.key)}
                                  onChange={() => togglePerm(editPerms, setEditPerms, perm.key)}
                                  className="w-3.5 h-3.5 rounded border-emerald-400 text-emerald-600"
                                />
                                <span>{perm.label}</span>
                              </label>
                            ))}
                          </div>
                          <p className="text-[10px] text-emerald-800">
                            This user can only view and operate the Forklift Operator Section upon sign-in.
                          </p>
                        </div>
                      ) : editRoleName === 'liquid_store_operator' ? (
                        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
                          <p className="text-[11px] font-bold text-sky-900">
                            Liquid Store Operator Permissions (Restricted Section Only)
                          </p>
                          <div className="space-y-1.5">
                            {LIQUID_STORE_ASSIGNABLE_PERMISSIONS.map((perm) => (
                              <label
                                key={perm.key}
                                className="flex items-center gap-2 text-xs text-sky-950 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={editPerms.includes(perm.key)}
                                  onChange={() => togglePerm(editPerms, setEditPerms, perm.key)}
                                  className="w-3.5 h-3.5 rounded border-sky-400 text-sky-600"
                                />
                                <span>{perm.label}</span>
                              </label>
                            ))}
                          </div>
                          <p className="text-[10px] text-sky-800">
                            This user can only view and manage the Liquid Material Camp Store section upon sign-in.
                          </p>
                        </div>
                      ) : editRoleName === 'ex_factory_operator' ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                          <p className="text-[11px] font-bold text-amber-900">
                            Ex-Factory Operator Permissions (Restricted Section Only)
                          </p>
                          <div className="space-y-1.5">
                            {EX_FACTORY_ASSIGNABLE_PERMISSIONS.map((perm) => (
                              <label
                                key={perm.key}
                                className="flex items-center gap-2 text-xs text-amber-950 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={editPerms.includes(perm.key)}
                                  onChange={() => togglePerm(editPerms, setEditPerms, perm.key)}
                                  className="w-3.5 h-3.5 rounded border-amber-400 text-amber-600"
                                />
                                <span>{perm.label}</span>
                              </label>
                            ))}
                          </div>
                          <p className="text-[10px] text-amber-800">
                            This user can only view and manage the Ex-Factory Dispatch section upon sign-in.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900">
                          Administrators automatically have full permissions ({permissionsMeta.length || 20} capabilities) across all sections.
                        </div>
                      )}

                      {/* Per-User Digital Signature Management (Edit User - Admin Only) */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-neutral-800 flex items-center gap-1.5">
                            <PenTool className="w-3.5 h-3.5 text-blue-700" />
                            <span>Digital Signature for @{editingUser.username} (Admin Only)</span>
                          </span>
                          <span className="text-[10px] text-neutral-500">PNG, JPG, WebP, SVG</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 h-14 rounded-lg border border-neutral-300 bg-white flex items-center justify-center px-3">
                            {editSignatureDataUrl ? (
                              <img
                                src={editSignatureDataUrl}
                                alt={`Signature of ${editingUser.fullName}`}
                                className="max-h-11 max-w-[180px] object-contain"
                              />
                            ) : (
                              <span className="text-[10px] text-neutral-400 italic">No signature uploaded</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              ref={editSigInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                              onChange={handleEditUserSignatureSelect}
                              className="hidden"
                            />
                            <button
                              type="button"
                              disabled={editSigProcessing}
                              onClick={() => editSigInputRef.current?.click()}
                              className="app-btn-sm bg-blue-700 hover:bg-blue-600 text-white"
                            >
                              {editSigProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Upload className="w-3.5 h-3.5 shrink-0" />}
                              <span>{editSignatureDataUrl ? 'Change' : 'Upload'}</span>
                            </button>
                            {editSignatureDataUrl && (
                              <button
                                type="button"
                                onClick={() => setEditSignatureDataUrl('')}
                                className="app-btn-sm bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-neutral-50 border-t border-neutral-200 px-5 py-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(null)}
                        className="px-4 py-2 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-extrabold cursor-pointer"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Reset Password Modal Card */}
              {resetTarget && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
                  <form
                    onSubmit={handleResetPasswordSubmit}
                    className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-md overflow-hidden"
                  >
                    <div className="bg-neutral-900 text-white px-5 py-3.5 flex items-center justify-between">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400" />
                        <span>Reset Password: @{resetTarget.username}</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setResetTarget(null)}
                        className="text-neutral-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-5 space-y-3">
                      <p className="text-xs text-neutral-600">
                        Assign a new temporary password. All active sessions for this user will be immediately terminated and they will be forced to choose a new password upon sign-in.
                      </p>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                          New Temporary Password *
                        </label>
                        <div className="relative">
                          <input
                            type={showResetPass ? 'text' : 'password'}
                            data-preserve-case="true"
                            required
                            value={resetTempPass}
                            onChange={(e) => setResetTempPass(e.target.value)}
                            placeholder="Min 8 chars, upper, lower, digit, symbol"
                            className="w-full pl-3 pr-9 py-2 text-xs rounded-xl border border-neutral-300"
                          />
                          <button
                            type="button"
                            onClick={() => setShowResetPass(!showResetPass)}
                            className="absolute right-2.5 top-2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                          >
                            {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="bg-neutral-50 border-t border-neutral-200 px-5 py-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setResetTarget(null)}
                        className="px-4 py-2 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold cursor-pointer"
                      >
                        Reset Temporary Password
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Inline Delete Confirmation Modal */}
              {confirmDeleteUser && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl border border-red-200 w-full max-w-sm overflow-hidden">
                    <div className="bg-red-700 text-white px-5 py-3.5 flex items-center justify-between">
                      <h3 className="text-sm font-bold">Confirm User Deletion</h3>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteUser(null)}
                        className="text-red-100 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-5 text-xs text-neutral-700 space-y-2">
                      <p>
                        Are you sure you want to permanently delete user{' '}
                        <span className="font-bold text-neutral-900">@{confirmDeleteUser.username}</span> (
                        {confirmDeleteUser.fullName})?
                      </p>
                      <p className="text-neutral-500">
                        All active sessions for this user will be immediately terminated.
                      </p>
                    </div>
                    <div className="bg-neutral-50 border-t border-neutral-200 px-5 py-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteUser(null)}
                        className="px-4 py-2 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteConfirmed}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold cursor-pointer"
                      >
                        Delete User
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE SESSIONS */}
          {activeTab === 'sessions' && (
            <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-neutral-900 text-white text-[11px] uppercase tracking-wider font-bold">
                      <th className="py-3 px-3.5">User</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">IP Address</th>
                      <th className="py-3 px-3">Last Activity</th>
                      <th className="py-3 px-3">Expires</th>
                      <th className="py-3 px-3">Client / Browser</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-neutral-500">
                          No active sessions found.
                        </td>
                      </tr>
                    ) : (
                      sessions.map((s) => (
                        <tr key={s.sessionRef} className="hover:bg-neutral-50">
                          <td className="py-2.5 px-3.5">
                            <span className="font-bold font-mono text-neutral-900">@{s.username}</span>
                            <p className="text-[11px] text-neutral-500">{s.fullName}</p>
                          </td>
                          <td className="py-2.5 px-3 uppercase font-semibold">{s.roleName}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">{s.ipAddress || '—'}</td>
                          <td className="py-2.5 px-3 text-[11px]">{formatDateTime(s.lastActivityAt)}</td>
                          <td className="py-2.5 px-3 text-[11px]">{formatDateTime(s.expiresAt)}</td>
                          <td className="py-2.5 px-3 text-[10px] text-neutral-500 max-w-xs truncate">
                            {s.userAgent || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {s.userId !== currentUser.id ? (
                              <button
                                type="button"
                                onClick={() => handleRevokeSessions({ id: s.userId, username: s.username })}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 rounded-lg text-[11px] font-bold cursor-pointer transition"
                              >
                                Revoke
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-blue-700">Current</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search actor username, ticket, or event details..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-neutral-300 bg-neutral-50"
                  />
                </div>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-neutral-300 bg-neutral-50 cursor-pointer"
                >
                  <option value="ALL">All Event Types</option>
                  <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                  <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                  <option value="LOGOUT">LOGOUT</option>
                  <option value="USER_CREATED">USER_CREATED</option>
                  <option value="USER_UPDATED">USER_UPDATED</option>
                  <option value="USER_DEACTIVATED">USER_DEACTIVATED</option>
                  <option value="USER_ACTIVATED">USER_ACTIVATED</option>
                  <option value="USER_DELETED">USER_DELETED</option>
                  <option value="PASSWORD_CHANGED">PASSWORD_CHANGED</option>
                  <option value="PASSWORD_RESET">PASSWORD_RESET</option>
                  <option value="PERMISSIONS_UPDATED">PERMISSIONS_UPDATED</option>
                  <option value="USER_SIGNATURE_UPDATED">USER_SIGNATURE_UPDATED</option>
                  <option value="USER_SIGNATURE_DELETED">USER_SIGNATURE_DELETED</option>
                  <option value="SESSION_REVOKED">SESSION_REVOKED</option>
                  <option value="TICKET_CREATED">TICKET_CREATED</option>
                  <option value="TICKET_UPDATED">TICKET_UPDATED</option>
                  <option value="TICKET_AUTO_STATUS">TICKET_AUTO_STATUS</option>
                  <option value="FORKLIFT_CHECKLIST_UPDATED">FORKLIFT_CHECKLIST_UPDATED</option>
                  <option value="FORKLIFT_LOADING_COMPLETED">FORKLIFT_LOADING_COMPLETED</option>
                  <option value="TICKET_DELETED">TICKET_DELETED</option>
                  <option value="TICKET_RESTORED">TICKET_RESTORED</option>
                  <option value="SLIP_SAVED">SLIP_SAVED</option>
                  <option value="SETTINGS_UPDATED">SETTINGS_UPDATED</option>
                  <option value="UNAUTHORIZED_ACCESS">UNAUTHORIZED_ACCESS</option>
                </select>
              </div>

              <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0">
                      <tr className="bg-neutral-900 text-white text-[11px] uppercase tracking-wider font-bold">
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Actor</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">Details</th>
                        <th className="py-2.5 px-3">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-neutral-50">
                          <td className="py-2 px-3 text-[11px] text-neutral-500 whitespace-nowrap">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-neutral-900">
                            {log.actorUsername || 'system'}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.action === 'LOGIN_FAILED' || log.action === 'UNAUTHORIZED_ACCESS' || log.action === 'USER_DELETED'
                                  ? 'bg-red-100 text-red-800'
                                  : log.action === 'LOGIN_SUCCESS' || log.action === 'USER_CREATED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-neutral-100 text-neutral-800'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-neutral-700">{log.details}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-neutral-500">
                            {log.ipAddress || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
