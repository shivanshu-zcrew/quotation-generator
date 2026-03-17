import React, { useState, useEffect, useCallback, useMemo } from "react";
import { authAPI } from "../services/api";

// Import store hooks
import { useAppStore } from "../services/store";
import { useAuth } from "../hooks/customHooks";

// ─── Reusable Field — defined OUTSIDE AddUserForm to prevent remount on every keystroke ───
function Field({
  label,
  field,
  type = "text",
  placeholder,
  formData,
  errors,
  onChange,
  loading,
  children,
}) {
  return (
    <div style={formStyles.fieldWrapper}>
      <label style={formStyles.label}>{label}</label>
      {children || (
        <input
          type={type}
          value={formData[field]}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={placeholder}
          style={{
            ...formStyles.input,
            ...(errors[field] ? formStyles.inputError : {}),
          }}
          disabled={loading}
        />
      )}
      {errors[field] && (
        <span style={formStyles.errorMsg}>{errors[field]}</span>
      )}
    </div>
  );
}

// ─── Role config — single source of truth ─────────────────────────────────
const ROLES = [
  {
    key:   'user',
    label: 'Creator',
    hint:  'Can create and manage their own quotations.',
    icon: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    color: '#10b981',
  },
  {
    key:   'ops_manager',
    label: 'Ops Manager',
    hint:  'Reviews and forwards quotations to admin for final approval.',
    icon: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    color: '#f59e0b',
  },
  {
    key:   'admin',
    label: 'Admin',
    hint:  '⚠️ Full access to all features, final approval, and user management.',
    icon: (
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: '#667eea',
  },
];

const ROLE_COLOR = Object.fromEntries(ROLES.map((r) => [r.key, r.color]));
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

// ─── Add User Form Component ───────────────────────────────────────────────
function AddUserForm({ onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "user",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const validate = () => {
    const e = {};
    if (!formData.name.trim()) e.name = "Name is required";
    if (!formData.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email))
      e.email = "Invalid email address";
    if (!formData.password) e.password = "Password is required";
    else if (formData.password.length < 6) e.password = "Minimum 6 characters";
    if (formData.password !== formData.confirmPassword)
      e.confirmPassword = "Passwords do not match";
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
        name:     formData.name.trim(),
        email:    formData.email.trim(),
        password: formData.password,
        role:     formData.role,
      });
      onSuccess(`User "${formData.name}" created successfully`);
    } catch (error) {
      setErrors({
        submit: error.response?.data?.message || "Failed to create user",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = ROLES.find((r) => r.key === formData.role);

  return (
    <div style={formStyles.overlay}>
      <div style={formStyles.modal}>
        {/* Header */}
        <div style={formStyles.modalHeader}>
          <div style={formStyles.modalHeaderLeft}>
            <div style={formStyles.modalIcon}>
              <svg width="20" height="20" fill="none" stroke="white" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h2 style={formStyles.modalTitle}>Add New User</h2>
              <p style={formStyles.modalSubtitle}>Create a new account with role assignment</p>
            </div>
          </div>
          <button onClick={onCancel} style={formStyles.closeBtn} disabled={loading}>
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error banner */}
        {errors.submit && (
          <div style={formStyles.errorBanner}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {errors.submit}
          </div>
        )}

        {/* Form body */}
        <div style={formStyles.body}>
          {/* Name */}
          <Field label="Full Name" field="name" placeholder="e.g. John Smith"
            formData={formData} errors={errors} onChange={handleChange} loading={loading} />

          {/* Email */}
          <Field label="Email Address" field="email" type="email" placeholder="e.g. john@company.com"
            formData={formData} errors={errors} onChange={handleChange} loading={loading} />

          {/* Password row */}
          <div style={formStyles.row}>
            <div style={{ ...formStyles.fieldWrapper, flex: 1 }}>
              <label style={formStyles.label}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPwd ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  placeholder="Min. 6 characters"
                  style={{
                    ...formStyles.input,
                    paddingRight: "2.5rem",
                    ...(errors.password ? formStyles.inputError : {}),
                  }}
                  disabled={loading}
                />
                <button onClick={() => setShowPwd((v) => !v)} style={formStyles.eyeBtn} type="button">
                  {showPwd ? (
                    <svg width="16" height="16" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" fill="none" stroke="#9ca3af" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <span style={formStyles.errorMsg}>{errors.password}</span>}
            </div>

            <div style={{ ...formStyles.fieldWrapper, flex: 1 }}>
              <label style={formStyles.label}>Confirm Password</label>
              <input
                type={showPwd ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => handleChange("confirmPassword", e.target.value)}
                placeholder="Repeat password"
                style={{ ...formStyles.input, ...(errors.confirmPassword ? formStyles.inputError : {}) }}
                disabled={loading}
              />
              {errors.confirmPassword && <span style={formStyles.errorMsg}>{errors.confirmPassword}</span>}
            </div>
          </div>

          {/* Role — 3 options */}
          <div style={formStyles.fieldWrapper}>
            <label style={formStyles.label}>Role</label>
            <div style={formStyles.roleToggleGroup}>
              {ROLES.map((r) => {
                const active = formData.role === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => handleChange("role", r.key)}
                    disabled={loading}
                    style={{
                      ...formStyles.roleToggleBtn,
                      ...(active ? {
                        borderColor: r.color,
                        backgroundColor: r.color + '18',
                        color: r.color,
                        fontWeight: '700',
                      } : {}),
                    }}
                  >
                    {r.icon}
                    {r.label}
                  </button>
                );
              })}
            </div>
            {selectedRole && (
              <p style={{ ...formStyles.roleHint, color: selectedRole.color }}>
                {selectedRole.hint}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={formStyles.footer}>
          <button onClick={onCancel} style={formStyles.cancelBtn} disabled={loading}>Cancel</button>
          <button onClick={handleSubmit} style={formStyles.submitBtn} disabled={loading}>
            {loading ? (
              <><span style={formStyles.btnSpinner} />Creating...</>
            ) : (
              <>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create User
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export default function UserManagementScreen({ onBack }) {
  const { user: currentUser } = useAuth();

  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [searchTerm,   setSearchTerm]   = useState("");
  const [filterRole,   setFilterRole]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showRoleModal,setShowRoleModal]= useState(false);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [newRole,      setNewRole]      = useState("");
  const [actionLoading,setActionLoading]= useState(false);
  const [toast,        setToast]        = useState(null);

  useEffect(() => { fetchUsers(); }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await authAPI.getAllUsers();
      setUsers(response.data);
    } catch (error) {
      showToast("Error fetching users: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleToggleStatus = useCallback(async (userId, currentStatus) => {
    if (!window.confirm(`Are you sure you want to ${currentStatus ? "deactivate" : "activate"} this user?`)) return;
    try {
      setActionLoading(true);
      await authAPI.toggleUserStatus(userId);
      await fetchUsers();
      showToast(`User ${currentStatus ? "deactivated" : "activated"} successfully`);
    } catch (error) {
      showToast("Error updating user status: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setActionLoading(false);
    }
  }, [fetchUsers, showToast]);

  const handleRoleChange = useCallback(async () => {
    if (!selectedUser || !newRole) return;
    try {
      setActionLoading(true);
      await authAPI.changeUserRole(selectedUser._id, { role: newRole });
      await fetchUsers();
      setShowRoleModal(false);
      setSelectedUser(null);
      setNewRole("");
      showToast("User role updated successfully");
    } catch (error) {
      showToast("Error changing user role: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setActionLoading(false);
    }
  }, [selectedUser, newRole, fetchUsers, showToast]);

  const handleAddUserSuccess = useCallback(async (message) => {
    setShowAddForm(false);
    await fetchUsers();
    showToast(message);
  }, [fetchUsers, showToast]);

  const openRoleModal = useCallback((user) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setShowRoleModal(true);
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
      const matchesSearch =
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole   = filterRole   === "all" || user.role === filterRole;
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "active"   && user.isActive) ||
        (filterStatus === "inactive" && !user.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    }),
    [users, searchTerm, filterRole, filterStatus]
  );

  const stats = useMemo(() => ({
    total:       users.length,
    active:      users.filter((u) => u.isActive).length,
    inactive:    users.filter((u) => !u.isActive).length,
    admins:      users.filter((u) => u.role === "admin").length,
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
      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, ...(toast.type === "error" ? styles.toastError : styles.toastSuccess) }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            {toast.type === "error" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          <svg style={styles.backIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>
        <h1 style={styles.title}>User Management</h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setShowAddForm(true)} style={styles.addUserButton}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Add User
          </button>
          <button onClick={fetchUsers} style={styles.refreshButton} disabled={actionLoading}>
            <svg style={styles.refreshIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats — 5 cards now */}
      <div style={styles.statsGrid}>
        {[
          { label: "Total Users",   value: stats.total,       color: "#667eea", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
          { label: "Active",        value: stats.active,      color: "#10b981", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
          { label: "Inactive",      value: stats.inactive,    color: "#ef4444", icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" },
          { label: "Ops Managers",  value: stats.opsManagers, color: "#f59e0b", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
          { label: "Admins",        value: stats.admins,      color: "#8b5cf6", icon: "M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={styles.statCard}>
            <div style={{ ...styles.statIconContainer, backgroundColor: color + "20" }}>
              <svg style={{ ...styles.statIcon, color }} fill="none" stroke={color} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
              </svg>
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
          <svg style={styles.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
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

      {/* Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["User", "Email", "Role", "Status", "Last Login", "Joined", "Actions"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
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
                      <div style={{ ...styles.userAvatar, backgroundColor: roleColor }}>
                        {user.name?.charAt(0).toUpperCase()}
                      </div>
                      <span style={styles.userName}>{user.name}</span>
                    </div>
                  </td>
                  <td style={styles.td}>{user.email}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.roleBadge, backgroundColor: roleColor + '20', color: roleColor }}>
                      {roleLabel}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: user.isActive ? "#10b98120" : "#ef444420",
                      color:           user.isActive ? "#10b981"   : "#ef4444",
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
                        <svg style={styles.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleToggleStatus(user._id, user.isActive)}
                        style={{
                          ...styles.statusButton,
                          backgroundColor: user.isActive ? "#ef444420" : "#10b98120",
                          color:           user.isActive ? "#ef4444"   : "#10b981",
                        }}
                        title={user.isActive ? "Deactivate" : "Activate"}
                        disabled={actionLoading || user._id === currentUser?._id}
                      >
                        <svg style={styles.actionIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {user.isActive ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          )}
                        </svg>
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
            <svg style={styles.emptyIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p>No users found</p>
          </div>
        )}
      </div>

      {/* Change Role Modal — 3 options */}
      {showRoleModal && selectedUser && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Change User Role</h3>
            <p style={styles.modalSubtitle}>
              Changing role for <strong>{selectedUser.name}</strong>
            </p>
            <div style={styles.modalContent}>
              <label style={styles.modalLabel}>Select New Role</label>
              {/* Role cards instead of a plain select */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ROLES.map((r) => {
                  const active = newRole === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => !actionLoading && setNewRole(r.key)}
                      disabled={actionLoading}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 14px',
                        border: `1.5px solid ${active ? r.color : '#e5e7eb'}`,
                        borderRadius: '8px',
                        backgroundColor: active ? r.color + '15' : 'white',
                        color: active ? r.color : '#374151',
                        fontWeight: active ? '700' : '500',
                        fontSize: '14px',
                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span style={{ color: active ? r.color : '#9ca3af' }}>{r.icon}</span>
                      <div>
                        <div>{r.label}</div>
                        <div style={{ fontSize: '11px', color: active ? r.color : '#9ca3af', fontWeight: '400', marginTop: '1px' }}>
                          {r.hint}
                        </div>
                      </div>
                      {active && (
                        <span style={{ marginLeft: 'auto', fontSize: '16px' }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={styles.modalButtons}>
              <button
                onClick={() => { setShowRoleModal(false); setSelectedUser(null); setNewRole(""); }}
                style={styles.modalCancelButton}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                style={styles.modalConfirmButton}
                disabled={actionLoading || newRole === selectedUser.role}
              >
                {actionLoading ? "Updating..." : "Update Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Form Modal */}
      {showAddForm && (
        <AddUserForm
          onSuccess={handleAddUserSuccess}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = {
  container: { padding: "24px", maxWidth: "1400px", margin: "0 auto", backgroundColor: "#f0f9ff", minHeight: "100vh" },
  loadingContainer: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: "16px" },
  spinner: { width: "40px", height: "40px", border: "3px solid #f3f3f3", borderTop: "3px solid #667eea", borderRadius: "50%", animation: "spin 1s linear infinite" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
  backButton: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", backgroundColor: "white", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", fontWeight: "500", color: "#374151", cursor: "pointer" },
  backIcon: { width: "16px", height: "16px" },
  title: { fontSize: "24px", fontWeight: "bold", color: "#1a1a1a", margin: 0 },
  addUserButton: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 18px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" },
  refreshButton: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", backgroundColor: "#667eea", color: "white", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "500", cursor: "pointer" },
  refreshIcon: { width: "16px", height: "16px" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "24px" },
  statCard: { backgroundColor: "white", borderRadius: "12px", padding: "16px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" },
  statIconContainer: { width: "40px", height: "40px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statIcon: { width: "20px", height: "20px" },
  statContent: { flex: 1 },
  statLabel: { fontSize: "12px", color: "#666", marginBottom: "4px", margin: 0 },
  statValue: { fontSize: "20px", fontWeight: "bold", color: "#1a1a1a", margin: 0 },
  filtersContainer: { display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" },
  searchBox: { flex: 2, minWidth: "250px", position: "relative" },
  searchIcon: { position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "18px", height: "18px", color: "#9ca3af" },
  searchInput: { width: "100%", padding: "10px 12px 10px 38px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", outline: "none", boxSizing: "border-box" },
  filterGroup: { flex: 1, display: "flex", gap: "12px", minWidth: "250px" },
  filterSelect: { flex: 1, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", outline: "none", backgroundColor: "white" },
  tableContainer: { backgroundColor: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "12px", fontSize: "13px", fontWeight: "600", color: "#666", borderBottom: "2px solid #e5e7eb" },
  td: { padding: "12px", fontSize: "14px", borderBottom: "1px solid #e5e7eb" },
  tr: { transition: "background-color 0.2s" },
  userInfo: { display: "flex", alignItems: "center", gap: "12px" },
  userAvatar: { width: "32px", height: "32px", borderRadius: "50%", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "600", flexShrink: 0 },
  userName: { fontWeight: "500", color: "#1a1a1a" },
  roleBadge: { padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap" },
  statusBadge: { padding: "4px 8px", borderRadius: "20px", fontSize: "12px", fontWeight: "500" },
  actionButtons: { display: "flex", gap: "8px" },
  roleButton: { padding: "6px", backgroundColor: "#667eea20", color: "#667eea", border: "none", borderRadius: "6px", cursor: "pointer" },
  statusButton: { padding: "6px", border: "none", borderRadius: "6px", cursor: "pointer" },
  actionIcon: { width: "16px", height: "16px" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px", color: "#9ca3af" },
  emptyIcon: { width: "48px", height: "48px", marginBottom: "12px" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  modal: { backgroundColor: "white", borderRadius: "12px", padding: "24px", width: "90%", maxWidth: "420px" },
  modalTitle: { fontSize: "20px", fontWeight: "bold", color: "#1a1a1a", marginBottom: "8px" },
  modalSubtitle: { fontSize: "14px", color: "#666", marginBottom: "20px" },
  modalContent: { marginBottom: "20px" },
  modalLabel: { display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "10px" },
  modalButtons: { display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "20px" },
  modalCancelButton: { padding: "8px 16px", backgroundColor: "#e5e7eb", color: "#374151", border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: "500", cursor: "pointer" },
  modalConfirmButton: { padding: "8px 20px", backgroundColor: "#667eea", color: "white", border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: "600", cursor: "pointer" },
  toast: { position: "fixed", top: "20px", right: "20px", zIndex: 9999, display: "flex", alignItems: "center", gap: "10px", padding: "12px 18px", borderRadius: "10px", fontSize: "14px", fontWeight: "500", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", animation: "slideIn 0.3s ease" },
  toastSuccess: { backgroundColor: "#ecfdf5", color: "#065f46", border: "1px solid #6ee7b7" },
  toastError:   { backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fca5a5" },
};

const formStyles = {
  overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100, padding: "16px" },
  modal: { backgroundColor: "white", borderRadius: "16px", width: "100%", maxWidth: "520px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  modalHeaderLeft: { display: "flex", alignItems: "center", gap: "14px" },
  modalIcon: { width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: "18px", fontWeight: "700", color: "white", margin: 0 },
  modalSubtitle: { fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: "2px 0 0" },
  closeBtn: { background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", padding: "6px", cursor: "pointer", color: "white", display: "flex", alignItems: "center" },
  errorBanner: { display: "flex", alignItems: "center", gap: "10px", margin: "16px 24px 0", padding: "10px 14px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#991b1b", fontSize: "13px" },
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" },
  row: { display: "flex", gap: "14px", flexWrap: "wrap" },
  fieldWrapper: { display: "flex", flexDirection: "column", gap: "5px" },
  label: { fontSize: "13px", fontWeight: "600", color: "#374151" },
  input: { padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", outline: "none", color: "#111827", transition: "border-color 0.2s", boxSizing: "border-box", width: "100%" },
  inputError: { borderColor: "#f87171", backgroundColor: "#fff7f7" },
  errorMsg: { fontSize: "12px", color: "#ef4444", marginTop: "2px" },
  eyeBtn: { position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" },
  roleToggleGroup: { display: "flex", gap: "8px", flexWrap: "wrap" },
  roleToggleBtn: { flex: 1, minWidth: "100px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 10px", border: "1.5px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", fontWeight: "500", color: "#6b7280", backgroundColor: "white", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" },
  roleHint: { fontSize: "12px", margin: "4px 0 0", fontWeight: "500" },
  footer: { display: "flex", justifyContent: "flex-end", gap: "10px", padding: "16px 24px", borderTop: "1px solid #f3f4f6", backgroundColor: "#fafafa" },
  cancelBtn: { padding: "9px 20px", backgroundColor: "#f3f4f6", color: "#374151", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "500", cursor: "pointer" },
  submitBtn: { display: "flex", alignItems: "center", gap: "7px", padding: "9px 22px", backgroundColor: "#667eea", color: "white", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "600", cursor: "pointer" },
  btnSpinner: { width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" },
};

const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  tr:hover { background-color: #f9fafb; }
  button:hover:not(:disabled) { opacity: 0.88; }
  button:disabled { opacity: 0.5; cursor: not-allowed !important; }
`;
document.head.appendChild(styleSheet);