import React, { useState, useEffect, useCallback, useMemo } from "react";
import { authAPI } from "../services/api";
import { useAppStore } from "../services/store";
import { useAuth } from "../hooks/customHooks";
import { PasswordResetModal } from "../components/PasswordResetModel";
import { Users, Search, X, RefreshCw, Shield, TrendingUp, AlertCircle, LogOut, Eye, CheckCircle, XCircle, Award, Calendar, Plus, UserPlus } from 'lucide-react';
import useToast, { ToastContainer } from '../hooks/useToast';

// ─── Role config ──────────────────────────────────────────────────────────
const ROLES = [
  { key: 'user', label: 'Creator', hint: 'Can create and manage their own quotations.', icon: '👤', color: '#10b981' },
  { key: 'ops_manager', label: 'Ops Manager', hint: 'Reviews and forwards quotations to admin for final approval.', icon: '📋', color: '#f59e0b' },
  { key: 'admin', label: 'Admin', hint: '⚠️ Full access to all features, final approval, and user management.', icon: '👑', color: '#667eea' },
];

const ROLE_COLOR = Object.fromEntries(ROLES.map((r) => [r.key, r.color]));
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

// ─── Add User Form Component ──────────────────────────────────────────────
function AddUserForm({ onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    name: "", email: "", password: "", confirmPassword: "", role: "user",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const validate = () => {
    const e = {};
    if (!formData.name.trim()) e.name = "Name is required";
    if (!formData.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = "Invalid email address";
    if (!formData.password) e.password = "Password is required";
    else if (formData.password.length < 6) e.password = "Minimum 6 characters";
    if (formData.password !== formData.confirmPassword) e.confirmPassword = "Passwords do not match";
    return e;
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setLoading(true);
    try {
      await authAPI.register({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
      });
      onSuccess(`User "${formData.name}" created successfully`);
    } catch (error) {
      setErrors({ submit: error.response?.data?.message || "Failed to create user" });
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = ROLES.find((r) => r.key === formData.role);

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div style={styles.modalHeaderLeft}>
            <div style={styles.modalIcon}>👥</div>
            <div>
              <h2 style={styles.modalTitle}>Add New User</h2>
              <p style={styles.modalSubtitle}>Create a new account with role assignment</p>
            </div>
          </div>
          <button onClick={onCancel} style={styles.closeBtn} disabled={loading}>✕</button>
        </div>

        {errors.submit && (
          <div style={styles.errorBanner}>
            <AlertCircle size={14} /> {errors.submit}
          </div>
        )}

        <div style={styles.modalBody}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. John Smith"
              style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }}
              disabled={loading}
            />
            {errors.name && <span style={styles.errorMsg}>{errors.name}</span>}
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="e.g. john@company.com"
              style={{ ...styles.input, ...(errors.email ? styles.inputError : {}) }}
              disabled={loading}
            />
            {errors.email && <span style={styles.errorMsg}>{errors.email}</span>}
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.fieldGroup, flex: 1 }}>
              <label style={styles.label}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  placeholder="Min. 6 characters"
                  style={{ ...styles.input, paddingRight: "2.5rem", ...(errors.password ? styles.inputError : {}) }}
                  disabled={loading}
                />
                <button onClick={() => setShowPwd((v) => !v)} style={styles.eyeBtn} type="button">
                  {showPwd ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
              {errors.password && <span style={styles.errorMsg}>{errors.password}</span>}
            </div>

            <div style={{ ...styles.fieldGroup, flex: 1 }}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type={showPwd ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => handleChange("confirmPassword", e.target.value)}
                placeholder="Repeat password"
                style={{ ...styles.input, ...(errors.confirmPassword ? styles.inputError : {}) }}
                disabled={loading}
              />
              {errors.confirmPassword && <span style={styles.errorMsg}>{errors.confirmPassword}</span>}
            </div>
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Role</label>
            <div style={styles.roleToggleGroup}>
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => handleChange("role", r.key)}
                  disabled={loading}
                  style={{
                    ...styles.roleToggleBtn,
                    ...(formData.role === r.key ? { borderColor: r.color, backgroundColor: r.color + '18', color: r.color, fontWeight: '700' } : {}),
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{r.icon}</span> {r.label}
                </button>
              ))}
            </div>
            {selectedRole && <p style={{ ...styles.roleHint, color: selectedRole.color }}>{selectedRole.hint}</p>}
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button onClick={onCancel} style={styles.cancelBtn} disabled={loading}>Cancel</button>
          <button onClick={handleSubmit} style={styles.submitBtn} disabled={loading}>
            {loading ? "Creating..." : "+ Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function UserManagementScreen({ onBack }) {
  const { user: currentUser } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState(null);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authAPI.getAllUsers();
      setUsers(response.data);
    } catch (error) {
      addToast("Error fetching users: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const handleToggleStatus = useCallback(async (userId, currentStatus) => {
    if (!window.confirm(`Are you sure you want to ${currentStatus ? "deactivate" : "activate"} this user?`)) return;
    try {
      setActionLoading(true);
      await authAPI.toggleUserStatus(userId);
      await fetchUsers();
      addToast(`User ${currentStatus ? "deactivated" : "activated"} successfully`, "success");
    } catch (error) {
      addToast("Error updating user status: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setActionLoading(false);
    }
  }, [fetchUsers, addToast]);

  const handleRoleChange = useCallback(async () => {
    if (!selectedUser || !newRole) return;
    try {
      setActionLoading(true);
      await authAPI.changeUserRole(selectedUser._id, { role: newRole });
      await fetchUsers();
      setShowRoleModal(false);
      setSelectedUser(null);
      setNewRole("");
      addToast("User role updated successfully", "success");
    } catch (error) {
      addToast("Error changing user role: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setActionLoading(false);
    }
  }, [selectedUser, newRole, fetchUsers, addToast]);

  const handleAddUserSuccess = useCallback(async (message) => {
    setShowAddForm(false);
    await fetchUsers();
    addToast(message, "success");
  }, [fetchUsers, addToast]);

  const openRoleModal = useCallback((user) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setShowRoleModal(true);
  }, []);

  const openPasswordResetModal = useCallback((user) => {
    setSelectedUserForPassword(user);
    setShowPasswordModal(true);
  }, []);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }, []);

  const filteredUsers = useMemo(() =>
    users.filter((user) => {
      const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === "all" || user.role === filterRole;
      const matchesStatus = filterStatus === "all" ||
                           (filterStatus === "active" && user.isActive) ||
                           (filterStatus === "inactive" && !user.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    }), [users, searchTerm, filterRole, filterStatus]
  );

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    admins: users.filter((u) => u.role === "admin").length,
    opsManagers: users.filter((u) => u.role === "ops_manager").length,
  }), [users]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p>Loading users...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Topbar */}
      <div style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <button onClick={onBack} style={styles.backButton}>← Back</button>
          <h1 style={styles.title}>👥 User Management</h1>
        </div>
        <div style={styles.topbarActions}>
          <button onClick={() => setShowAddForm(true)} style={styles.addUserButton}>+ Add User</button>
          <button onClick={fetchUsers} style={styles.refreshButton} disabled={actionLoading}>
            <RefreshCw size={14} style={actionLoading ? styles.spin : {}} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={styles.statsGrid}>
        {[
          { label: "Total Users", value: stats.total, color: "#667eea", icon: "👥" },
          { label: "Active", value: stats.active, color: "#10b981", icon: "✅" },
          { label: "Inactive", value: stats.inactive, color: "#ef4444", icon: "⭕" },
          { label: "Ops Managers", value: stats.opsManagers, color: "#f59e0b", icon: "📋" },
          { label: "Admins", value: stats.admins, color: "#8b5cf6", icon: "👑" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={styles.statCard}>
            <div style={{ ...styles.statIconContainer, backgroundColor: color + "20" }}>
              <span style={{ ...styles.statIcon, color }}>{icon}</span>
            </div>
            <div style={styles.statContent}>
              <h3 style={styles.statLabel}>{label}</h3>
              <p style={styles.statValue}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filtersContainer}>
        <div style={styles.searchBox}>
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} style={styles.clearSearchBtn}>
              <X size={13} />
            </button>
          )}
        </div>
        <div style={styles.filterGroup}>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={styles.filterSelect}>
            <option value="all">All Roles</option>
            <option value="user">Creator</option>
            <option value="ops_manager">Ops Manager</option>
            <option value="admin">Admin</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={styles.filterSelect}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table Card */}
      <div style={styles.tableCard}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>User</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Last Login</th>
                <th style={styles.th}>Joined</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const roleColor = ROLE_COLOR[user.role] || '#667eea';
                const roleLabel = ROLE_LABEL[user.role] || user.role;
                return (
                  <tr key={user._id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.userInfo}>
                        <div style={{ ...styles.userAvatar, backgroundColor: roleColor }}>{user.name?.charAt(0).toUpperCase()}</div>
                        <span style={styles.userName}>{user.name}</span>
                      </div>
                    </td>
                    <td style={styles.td}>{user.email}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.roleBadge, backgroundColor: roleColor + '20', color: roleColor }}>{roleLabel}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: user.isActive ? "#10b98120" : "#ef444420",
                        color: user.isActive ? "#10b981" : "#ef4444",
                      }}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={styles.td}>{formatDate(user.lastLogin)}</td>
                    <td style={styles.td}>{formatDate(user.createdAt)}</td>
                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        <button
                          onClick={() => openRoleModal(user)}
                          style={styles.roleButton}
                          title="Change Role"
                          disabled={actionLoading || user._id === currentUser?._id}
                        >
                          👤
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user._id, user.isActive)}
                          style={{
                            ...styles.statusButton,
                            backgroundColor: user.isActive ? "#ef444420" : "#10b98120",
                            color: user.isActive ? "#ef4444" : "#10b981",
                          }}
                          title={user.isActive ? "Deactivate" : "Activate"}
                          disabled={actionLoading || user._id === currentUser?._id}
                        >
                          {user.isActive ? "🔴" : "🟢"}
                        </button>
                        <button
                          onClick={() => openPasswordResetModal(user)}
                          style={styles.resetButton}
                          title="Reset Password"
                          disabled={actionLoading}
                        >
                          🔑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
           </table>

          {filteredUsers.length === 0 && (
            <div style={styles.emptyState}>
              <span style={styles.emptyIcon}>👥</span>
              <p>No users found</p>
            </div>
          )}
        </div>
      </div>

      {/* Change Role Modal */}
      {showRoleModal && selectedUser && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Change User Role</h3>
              <button onClick={() => setShowRoleModal(false)} style={styles.closeBtn}>✕</button>
            </div>
            <p style={styles.modalSubtitle}>Changing role for <strong>{selectedUser.name}</strong></p>
            <div style={styles.modalBody}>
              <label style={styles.label}>Select New Role</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ROLES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => !actionLoading && setNewRole(r.key)}
                    disabled={actionLoading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                      border: `1.5px solid ${newRole === r.key ? r.color : '#e2e8f0'}`,
                      borderRadius: '8px', backgroundColor: newRole === r.key ? r.color + '15' : 'white',
                      color: newRole === r.key ? r.color : '#334155', fontWeight: newRole === r.key ? '700' : '500',
                      fontSize: '13px', cursor: actionLoading ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>{r.icon}</span>
                    <div>
                      <div>{r.label}</div>
                      <div style={{ fontSize: '11px', color: newRole === r.key ? r.color : '#94a3b8', fontWeight: '400', marginTop: '1px' }}>{r.hint}</div>
                    </div>
                    {newRole === r.key && <span style={{ marginLeft: 'auto', fontSize: '16px' }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button onClick={() => { setShowRoleModal(false); setSelectedUser(null); setNewRole(""); }} style={styles.cancelBtn} disabled={actionLoading}>Cancel</button>
              <button onClick={handleRoleChange} style={styles.submitBtn} disabled={actionLoading || newRole === selectedUser.role}>Update Role</button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Form Modal */}
      {showAddForm && <AddUserForm onSuccess={handleAddUserSuccess} onCancel={() => setShowAddForm(false)} />}

      {/* Password Reset Modal */}
      {showPasswordModal && (
        <PasswordResetModal
          open={showPasswordModal}
          user={selectedUserForPassword}
          onClose={() => { setShowPasswordModal(false); setSelectedUserForPassword(null); }}
          onSuccess={(message) => { addToast(message, 'success'); fetchUsers(); }}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

// ─── Styles (Matching AdminDashboard) ─────────────────────────────────────
const PRIMARY_COLOR = 'rgb(15, 23, 42)';
const PRIMARY_DARK = '#0a0f1a';

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  loadingContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '16px' },
  spinner: { width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  
  topbar: { backgroundColor: PRIMARY_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: '60px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: '1rem' },
  topbarActions: { display: 'flex', gap: '0.625rem', alignItems: 'center' },
  backButton: { backgroundColor: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.45rem 0.875rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  title: { fontSize: '1.0625rem', fontWeight: 800, color: 'white', letterSpacing: '-0.01em', margin: 0 },
  addUserButton: { backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 8, padding: '0.45rem 0.875rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
  refreshButton: { backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: 8, padding: '0.45rem 0.875rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' },
  
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1rem', margin: '1.5rem 2rem 1rem 2rem' },
  statCard: { backgroundColor: '#fff', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  statIconContainer: { width: '44px', height: '44px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statIcon: { fontSize: '22px' },
  statContent: { flex: 1 },
  statLabel: { fontSize: '12px', color: '#64748b', marginBottom: '4px', margin: 0 },
  statValue: { fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: 0 },
  
  filtersContainer: { display: 'flex', gap: '16px', margin: '0 2rem 1rem 2rem', flexWrap: 'wrap' },
  searchBox: { flex: 2, minWidth: '250px', display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.4rem 0.75rem' },
  searchInput: { border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem', color: '#0f172a', flex: 1 },
  clearSearchBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' },
  filterGroup: { flex: 1, display: 'flex', gap: '12px', minWidth: '250px' },
  filterSelect: { flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.875rem', outline: 'none', backgroundColor: '#fff' },
  
  tableCard: { backgroundColor: '#fff', borderRadius: 14, margin: '0 2rem 2rem 2rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeader: { backgroundColor: '#fafafa', borderBottom: '1px solid #f1f5f9' },
  th: { padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '0.85rem 1rem', fontSize: '0.8rem', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' },
  tr: { transition: 'background-color 0.2s' },
  
  userInfo: { display: 'flex', alignItems: 'center', gap: '12px' },
  userAvatar: { width: '32px', height: '32px', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600, flexShrink: 0 },
  userName: { fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' },
  
  roleBadge: { padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' },
  statusBadge: { padding: '4px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 },
  
  actionButtons: { display: 'flex', gap: '8px' },
  roleButton: { padding: '6px 10px', backgroundColor: '#667eea20', color: '#667eea', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '14px' },
  statusButton: { padding: '6px 10px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '14px' },
  resetButton: { padding: '6px 10px', backgroundColor: '#f59e0b20', color: '#f59e0b', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '14px' },
  
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#94a3b8' },
  emptyIcon: { fontSize: '48px', marginBottom: '12px' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#fff', borderRadius: 12, width: '90%', maxWidth: 450, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', backgroundColor: PRIMARY_COLOR, color: '#fff' },
  modalHeaderLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  modalIcon: { width: '42px', height: '42px', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' },
  modalTitle: { fontSize: '18px', fontWeight: 700, margin: 0, color: 'white' },
  modalSubtitle: { fontSize: '13px', color: '#64748b', margin: '0 1.5rem 1rem 1.5rem' },
  modalBody: { padding: '0 1.5rem 1rem 1.5rem' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' },
  
  closeBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px', cursor: 'pointer', color: '#fff', fontSize: '16px', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  
  errorBanner: { display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 24px 0', padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: '13px' },
  
  fieldGroup: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  inputError: { borderColor: '#ef4444', backgroundColor: '#fff7f7' },
  errorMsg: { fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'block' },
  
  row: { display: 'flex', gap: '14px', marginBottom: '16px' },
  eyeBtn: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' },
  
  roleToggleGroup: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  roleToggleBtn: { flex: 1, minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '13px', fontWeight: 500, color: '#64748b', backgroundColor: '#fff', cursor: 'pointer', transition: 'all 0.15s' },
  roleHint: { fontSize: '11px', marginTop: '8px', fontWeight: 500 },
  
  cancelBtn: { padding: '8px 16px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  submitBtn: { padding: '8px 20px', backgroundColor: PRIMARY_COLOR, color: '#fff', border: 'none', borderRadius: 6, fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  
  spin: { animation: 'spin 0.8s linear infinite' },
};

// Add animations
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  tr:hover { background-color: #f8fafc; }
  button:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); transition: all 0.2s; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  input:focus, select:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.1); outline: none; }
`;
document.head.appendChild(styleSheet);