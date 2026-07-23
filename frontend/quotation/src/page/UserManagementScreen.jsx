import React, { useState, useEffect, useCallback, useMemo } from "react";
import { authAPI } from "../services/api";
import { useAppStore } from "../services/store";
import { useAuth } from "../hooks/customHooks";
import { PasswordResetModal } from "../components/PasswordResetModel";
import {
  Users, Search, X, RefreshCw, AlertCircle, Trash2, Eye,
  CheckCircle, XCircle, AlertTriangle, Calendar, Plus, UserPlus,
  Phone, Edit2, Save, UserCheck, UserX, Briefcase, Crown, Menu,
  ChevronLeft, Shield,
} from "lucide-react";
import useToast, { ToastContainer } from "../hooks/useToast";

// ============================================================
// DESIGN TOKENS — mirrors HomeScreen exactly
// ============================================================
const T = {
  canvas: "#f6f7f8",
  surface: "#ffffff",
  ink: "#1b1d1e",
  inkSoft: "#646a6e",
  inkFaint: "#9aa0a4",
  line: "#e8eaec",
  lineSoft: "#f0f1f3",
  accent: "#2563c4",
  accentSoft: "#e6f0fb",
  accentInk: "#1d63c4",
  shadow: "0 1px 2px rgba(20,22,24,0.04), 0 8px 24px -12px rgba(20,22,24,0.10)",
  radius: 16,
  radiusSm: 10,
};

const FONT_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ─── Responsive hook ──────────────────────────────────────────────────────
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== "undefined") return window.matchMedia(query).matches;
    return false;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);
  return matches;
};

// ─── Role config ──────────────────────────────────────────────────────────
const ROLES = [
  {
    key: "user",
    label: "Creator",
    hint: "Can create and manage their own quotations.",
    icon: "",
    color: "#0f7a52",
    bg: "#e3f5ee",
    border: "#c3ebda",
  },
  {
    key: "ops_manager",
    label: "Ops Manager",
    hint: "Reviews and forwards quotations to admin for final approval.",
    icon: "",
    color: "#b45309",
    bg: "#fff7e6",
    border: "#fde9c8",
  },
  {
    key: "admin",
    label: "Admin",
    hint: "⚠️ Full access to all features, final approval, and user management.",
    icon: "",
    color: "#6d28d9",
    bg: "#efe9fb",
    border: "#dccffa",
  },
];

const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.key, r]));

// ─── Header button styles matching HomeScreen exactly ─────────────────────
const makeHeaderBtn = (variant, isMobile) => {
  const variants = {
    ghost: {
      background: "transparent",
      color: "#c7cccf",
      border: "1px solid rgba(255,255,255,0.14)",
    },
    soft: {
      background: "rgba(255,255,255,0.08)",
      color: "#e6e9ea",
      border: "1px solid rgba(255,255,255,0.10)",
    },
    accent: {
      background: T.accent,
      color: "#fff",
      border: "1px solid transparent",
    },
  };
  return {
    ...variants[variant],
    borderRadius: T.radiusSm,
    padding: isMobile ? "0.4rem 0.7rem" : "0.5rem 0.95rem",
    fontSize: isMobile ? "0.72rem" : "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    fontFamily: FONT_STACK,
    transition: "all 0.18s ease",
  };
};

// ─── Role Badge ──────────────────────────────────────────────────────────
const RoleBadge = ({ roleKey }) => {
  const r = ROLE_MAP[roleKey];
  if (!r) return <span style={{ color: T.inkFaint, fontSize: "0.75rem" }}>{roleKey}</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.25rem 0.65rem",
        borderRadius: 999,
        fontSize: "0.73rem",
        fontWeight: 600,
        backgroundColor: r.bg,
        color: r.color,
        border: `1px solid ${r.border}`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: "0.65rem" }}>{r.icon}</span>
      {r.label}
    </span>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────
const StatusBadge = ({ isActive }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "0.3rem",
      padding: "0.25rem 0.65rem",
      borderRadius: 999,
      fontSize: "0.73rem",
      fontWeight: 600,
      backgroundColor: isActive ? "#e3f5ee" : "#fdeaf0",
      color: isActive ? "#0f7a52" : "#be185d",
      border: `1px solid ${isActive ? "#c3ebda" : "#f8d2e0"}`,
    }}
  >
    <span style={{ fontSize: "0.6rem" }}>{isActive ? "●" : "○"}</span>
    {isActive ? "Active" : "Inactive"}
  </span>
);

// ─── Stat Card ────────────────────────────────────────────────────────────
const StatCard = ({ label, value, Icon, color, bg, isMobile }) => (
  <div
    style={{
      backgroundColor: T.surface,
      borderRadius: T.radius,
      border: `1px solid ${T.line}`,
      boxShadow: T.shadow,
      padding: isMobile ? "0.9rem 1rem" : "1.1rem 1.25rem",
      display: "flex",
      alignItems: "center",
      gap: "0.85rem",
    }}
  >
    <div
      style={{
        width: isMobile ? 36 : 44,
        height: isMobile ? 36 : 44,
        borderRadius: 12,
        backgroundColor: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={isMobile ? 16 : 20} color={color} />
    </div>
    <div>
      <div
        style={{
          fontSize: isMobile ? "0.65rem" : "0.68rem",
          fontWeight: 600,
          color: T.inkFaint,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: isMobile ? "1.35rem" : "1.6rem",
          fontWeight: 700,
          color: T.ink,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  </div>
);

// ─── Shimmer skeleton ─────────────────────────────────────────────────────
const shimmerStyle = {
  background: `linear-gradient(90deg, ${T.lineSoft} 25%, ${T.line} 50%, ${T.lineSoft} 75%)`,
  backgroundSize: "200% 100%",
  animation: "um-shimmer 1.4s ease infinite",
  borderRadius: 6,
};

const SkeletonRow = () => (
  <tr>
    {[140, 180, 100, 100, 80, 70, 110, 110, 80].map((w, i) => (
      <td key={i} style={{ padding: "1rem", borderBottom: `1px solid ${T.lineSoft}` }}>
        <div style={{ ...shimmerStyle, width: w, height: 14 }} />
      </td>
    ))}
  </tr>
);

// ─── Mobile User Card ─────────────────────────────────────────────────────
function UserCard({ user, onEdit, onResetPassword, onDelete, actionLoading, formatDate }) {
  const [expanded, setExpanded] = useState(false);
  const r = ROLE_MAP[user.role];
  const currentUser = useAuth().user;
  const isSelf = currentUser?._id === user._id;

  return (
    <div
      style={{
        backgroundColor: T.surface,
        borderRadius: T.radius,
        border: `1px solid ${T.line}`,
        boxShadow: T.shadow,
        overflow: "hidden",
        transition: "box-shadow 0.2s",
      }}
    >
      {/* Card header (same as before) */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.9rem 1rem",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            backgroundColor: r?.bg || T.accentSoft,
            color: r?.color || T.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            fontWeight: 700,
            flexShrink: 0,
            border: `1px solid ${r?.border || T.line}`,
          }}
        >
          {user.name?.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: T.ink, fontSize: "0.875rem", marginBottom: 2 }}>
            {user.name}
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              color: T.inkFaint,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.email}
          </div>
        </div>
        <StatusBadge isActive={user.isActive} />
        <span
          style={{
            color: T.inkFaint,
            fontSize: "0.6rem",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            marginLeft: 2,
          }}
        >
          ▼
        </span>
      </div>

      {/* Expanded details (same as before, but with Delete button) */}
      {expanded && (
        <div
          style={{
            padding: "0.9rem 1rem",
            borderTop: `1px solid ${T.lineSoft}`,
            backgroundColor: T.canvas,
            display: "flex",
            flexDirection: "column",
            gap: "0.55rem",
          }}
        >
          {[
            { label: "Phone", value: user.phone || "—" },
            { label: "Designation", value: user.designation || "—" },
            { label: "Last Login", value: formatDate(user.lastLogin) },
            { label: "Joined", value: formatDate(user.createdAt) },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{ display: "flex", gap: "0.5rem", fontSize: "0.78rem", alignItems: "center" }}
            >
              <span
                style={{
                  color: T.inkFaint,
                  fontWeight: 600,
                  minWidth: 80,
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {label}
              </span>
              <span style={{ color: T.inkSoft }}>{value}</span>
            </div>
          ))}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: 2 }}>
            <RoleBadge roleKey={user.role} />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
            <button
              onClick={() => onEdit(user)}
              disabled={actionLoading}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.5rem",
                backgroundColor: T.accentSoft,
                color: T.accentInk,
                border: `1px solid #c9defa`,
                borderRadius: T.radiusSm,
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: FONT_STACK,
              }}
            >
              <Edit2 size={13} /> Edit
            </button>
            <button
              onClick={() => onResetPassword(user)}
              disabled={actionLoading}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.5rem",
                backgroundColor: "#fff7e6",
                color: "#b45309",
                border: "1px solid #fde9c8",
                borderRadius: T.radiusSm,
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: FONT_STACK,
              }}
            >
              🔑 Reset Pwd
            </button>
            {!isSelf && (
              <button
                onClick={() => onDelete(user)}
                disabled={actionLoading}
                style={{
                  flex: 0.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.35rem",
                  padding: "0.5rem",
                  backgroundColor: "#fdeceb",
                  color: "#c1352b",
                  border: "1px solid #f8d6d2",
                  borderRadius: T.radiusSm,
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONT_STACK,
                }}
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────────
function Modal({ title, subtitle, icon, onClose, closeDisabled, children, footer }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(20,22,24,0.45)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        backdropFilter: "blur(2px)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: T.surface,
          borderRadius: T.radius,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 24px 64px rgba(20,22,24,0.22)",
          overflow: "hidden",
          border: `1px solid ${T.line}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: T.ink,
            padding: "1.1rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: T.radiusSm,
                backgroundColor: "rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
              }}
            >
              {icon}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "#fff", fontSize: "1rem" }}>{title}</div>
              {subtitle && (
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.55)", marginTop: 1 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: 8,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.9rem",
              opacity: closeDisabled ? 0.5 : 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem 1.5rem 0.5rem" }}>{children}</div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.6rem",
              padding: "1rem 1.5rem",
              borderTop: `1px solid ${T.lineSoft}`,
              backgroundColor: T.canvas,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared field components ──────────────────────────────────────────────
const FieldGroup = ({ label, error, children }) => (
  <div style={{ marginBottom: "1rem" }}>
    <label
      style={{
        display: "block",
        fontSize: "0.72rem",
        fontWeight: 600,
        color: T.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: "0.4rem",
      }}
    >
      {label}
    </label>
    {children}
    {error && (
      <span style={{ fontSize: "0.72rem", color: "#c1352b", marginTop: 4, display: "block" }}>
        {error}
      </span>
    )}
  </div>
);

const inputStyle = (hasError) => ({
  width: "100%",
  padding: "0.55rem 0.85rem",
  border: `1.5px solid ${hasError ? "#f8a8a0" : T.line}`,
  borderRadius: T.radiusSm,
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box",
  backgroundColor: hasError ? "#fff8f7" : T.surface,
  color: T.ink,
  fontFamily: FONT_STACK,
  transition: "border-color 0.15s",
});

const ErrorBanner = ({ message }) =>
  message ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        backgroundColor: "#fdeceb",
        border: "1px solid #f8d6d2",
        borderRadius: T.radiusSm,
        padding: "0.6rem 0.875rem",
        marginBottom: "1rem",
        fontSize: "0.8rem",
        color: "#c1352b",
        fontWeight: 500,
      }}
    >
      <AlertCircle size={14} /> {message}
    </div>
  ) : null;

const CancelBtn = ({ onClick, disabled, label = "Cancel" }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: "0.5rem 1rem",
      backgroundColor: T.canvas,
      color: T.inkSoft,
      border: `1px solid ${T.line}`,
      borderRadius: T.radiusSm,
      fontSize: "0.82rem",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: FONT_STACK,
    }}
  >
    {label}
  </button>
);

const SubmitBtn = ({ onClick, disabled, label }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: "0.5rem 1.2rem",
      backgroundColor: disabled ? T.inkFaint : T.ink,
      color: "#fff",
      border: "none",
      borderRadius: T.radiusSm,
      fontSize: "0.82rem",
      fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: FONT_STACK,
      transition: "background 0.15s",
    }}
  >
    {label}
  </button>
);

// ─── Role toggle picker ───────────────────────────────────────────────────
const RolePicker = ({ value, onChange, disabled }) => (
  <div>
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {ROLES.map((r) => {
        const active = value === r.key;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            disabled={disabled}
            style={{
              flex: 1,
              minWidth: 90,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              padding: "0.55rem 0.6rem",
              border: `1.5px solid ${active ? r.border : T.line}`,
              borderRadius: T.radiusSm,
              backgroundColor: active ? r.bg : T.surface,
              color: active ? r.color : T.inkSoft,
              fontSize: "0.78rem",
              fontWeight: active ? 700 : 500,
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              fontFamily: FONT_STACK,
            }}
          >
            <span style={{ fontSize: "0.9rem" }}>{r.icon}</span> {r.label}
          </button>
        );
      })}
    </div>
    {value && (
      <p
        style={{
          fontSize: "0.72rem",
          color: ROLE_MAP[value]?.color || T.inkFaint,
          marginTop: "0.5rem",
          fontWeight: 500,
        }}
      >
        {ROLE_MAP[value]?.hint}
      </p>
    )}
  </div>
);

// ─── Status picker ────────────────────────────────────────────────────────
const StatusPicker = ({ value, onChange, disabled }) => (
  <div style={{ display: "flex", gap: "0.5rem" }}>
    {[
      { val: true, label: "Active", color: "#0f7a52", bg: "#e3f5ee", border: "#c3ebda", icon: CheckCircle },
      { val: false, label: "Inactive", color: "#be185d", bg: "#fdeaf0", border: "#f8d2e0", icon: XCircle },
    ].map(({ val, label, color, bg, border, icon: Icon }) => {
      const active = value === val;
      return (
        <button
          key={String(val)}
          type="button"
          onClick={() => onChange(val)}
          disabled={disabled}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.4rem",
            padding: "0.55rem",
            border: `1.5px solid ${active ? border : T.line}`,
            borderRadius: T.radiusSm,
            backgroundColor: active ? bg : T.surface,
            color: active ? color : T.inkSoft,
            fontSize: "0.8rem",
            fontWeight: active ? 700 : 500,
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            fontFamily: FONT_STACK,
          }}
        >
          <Icon size={14} /> {label}
        </button>
      );
    })}
  </div>
);

// ─── Edit User Modal ──────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSuccess, loading: parentLoading }) {
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    designation: user?.designation || "",
    role: user?.role || "user",
    isActive: user?.isActive ?? true,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Invalid email address";
    if (
      form.phone &&
      !/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{3,4}[-\s\.]?[0-9]{3,4}$/.test(
        form.phone
      )
    )
      e.phone = "Invalid phone number format";
    return e;
  };

  const set = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    try {
      await authAPI.updateUser(user._id, {
        name: form.name.trim(), email: form.email.trim(),
        phone: form.phone.trim(), designation: form.designation.trim(),
        role: form.role, isActive: form.isActive,
      });
      onSuccess("User updated successfully");
    } catch (err) {
      setErrors({ submit: err.response?.data?.message || "Failed to update user" });
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || parentLoading;

  return (
    <Modal
      title="Edit User"
      subtitle="Update information and permissions"
      icon="✏️"
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <>
          <CancelBtn onClick={onClose} disabled={busy} />
          <SubmitBtn onClick={handleSubmit} disabled={busy} label={busy ? "Saving…" : "Save Changes"} />
        </>
      }
    >
      <ErrorBanner message={errors.submit} />
      <FieldGroup label="Full Name" error={errors.name}>
        <input type="text" name="edit-user-name" autoComplete="off" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. John Smith" style={inputStyle(errors.name)} disabled={busy} />
      </FieldGroup>
      <FieldGroup label="Email Address" error={errors.email}>
        <input type="email" name="edit-user-email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="e.g. john@company.com" style={inputStyle(errors.email)} disabled={busy} />
      </FieldGroup>
      <FieldGroup label="Phone (Optional)" error={errors.phone}>
        <input type="tel" name="edit-user-phone" autoComplete="off" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+971 XX XXX XXXX" style={inputStyle(errors.phone)} disabled={busy} />
      </FieldGroup>
      <FieldGroup label="Designation (Optional)" error={errors.designation}>
        <input type="text" name="edit-user-designation" autoComplete="off" value={form.designation} onChange={(e) => set("designation", e.target.value)} placeholder="e.g. Sales Manager" style={inputStyle(errors.designation)} disabled={busy} />
      </FieldGroup>
      <FieldGroup label="Role">
        <RolePicker value={form.role} onChange={(v) => set("role", v)} disabled={busy} />
      </FieldGroup>
      <FieldGroup label="Account Status">
        <StatusPicker value={form.isActive} onChange={(v) => set("isActive", v)} disabled={busy} />
      </FieldGroup>
    </Modal>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────────────
function AddUserForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", designation: "", password: "", confirmPassword: "", role: "user",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Invalid email address";
    if (
      form.phone &&
      !/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{3,4}[-\s\.]?[0-9]{3,4}$/.test(
        form.phone
      )
    )
      e.phone = "Invalid phone number format";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 6) e.password = "Minimum 6 characters";
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    return e;
  };

  const set = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    try {
      await authAPI.register({
        name: form.name.trim(), email: form.email.trim(),
        phone: form.phone.trim(), designation: form.designation.trim(),
        password: form.password, role: form.role,
      });
      onSuccess(`User "${form.name}" created successfully`);
    } catch (err) {
      setErrors({ submit: err.response?.data?.message || "Failed to create user" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Add New User"
      subtitle="Create an account with role assignment"
      icon="👥"
      onClose={onCancel}
      closeDisabled={loading}
      footer={
        <>
          <CancelBtn onClick={onCancel} disabled={loading} />
          <SubmitBtn onClick={handleSubmit} disabled={loading} label={loading ? "Creating…" : "+ Create User"} />
        </>
      }
    >
      <ErrorBanner message={errors.submit} />
      <FieldGroup label="Full Name" error={errors.name}>
        <input type="text" name="new-user-name" autoComplete="off" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. John Smith" style={inputStyle(errors.name)} disabled={loading} />
      </FieldGroup>
      <FieldGroup label="Email Address" error={errors.email}>
        <input type="email" name="new-user-email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="e.g. john@company.com" style={inputStyle(errors.email)} disabled={loading} />
      </FieldGroup>
      <FieldGroup label="Phone (Optional)" error={errors.phone}>
        <input type="tel" name="new-user-phone" autoComplete="off" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+971 XX XXX XXXX" style={inputStyle(errors.phone)} disabled={loading} />
      </FieldGroup>
      <FieldGroup label="Designation (Optional)" error={errors.designation}>
        <input type="text" name="new-user-designation" autoComplete="off" value={form.designation} onChange={(e) => set("designation", e.target.value)} placeholder="e.g. Sales Manager" style={inputStyle(errors.designation)} disabled={loading} />
      </FieldGroup>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <FieldGroup label="Password" error={errors.password}>
          <div style={{ position: "relative" }}>
            <input type={showPwd ? "text" : "password"} name="new-user-password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Min. 6 characters" style={{ ...inputStyle(errors.password), paddingRight: "2.5rem" }} disabled={loading} />
            <button onClick={() => setShowPwd((v) => !v)} type="button" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}>
              {showPwd ? "👁️" : "👁️‍🗨️"}
            </button>
          </div>
        </FieldGroup>
        <FieldGroup label="Confirm Password" error={errors.confirmPassword}>
          <input type={showPwd ? "text" : "password"} name="new-user-confirm-password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} placeholder="Repeat password" style={inputStyle(errors.confirmPassword)} disabled={loading} />
        </FieldGroup>
      </div>
      <FieldGroup label="Role">
        <RolePicker value={form.role} onChange={(v) => set("role", v)} disabled={loading} />
      </FieldGroup>
    </Modal>
  );
}

// ─── Table header cell ────────────────────────────────────────────────────
const thStyle = {
  padding: "0.85rem 1rem",
  fontSize: "0.68rem",
  fontWeight: 600,
  color: T.inkFaint,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  textAlign: "left",
  borderBottom: `1px solid ${T.line}`,
  backgroundColor: T.surface,
  whiteSpace: "nowrap",
};

// ─── Main Component ───────────────────────────────────────────────────────
export default function UserManagementScreen({ onBack }) {
  const { user: currentUser } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
      addToast("Error changing role: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setActionLoading(false);
    }
  }, [selectedUser, newRole, fetchUsers, addToast]);

  const handleAddUserSuccess = useCallback(async (message) => {
    setShowAddForm(false);
    await fetchUsers();
    addToast(message, "success");
  }, [fetchUsers, addToast]);

  const handleEditUserSuccess = useCallback(async (message) => {
    setShowEditForm(false);
    setSelectedUser(null);
    await fetchUsers();
    addToast(message, "success");
  }, [fetchUsers, addToast]);

  const handleDeleteUser = useCallback(async (userId) => {
    try {
      setActionLoading(true);
      await authAPI.deleteUser(userId);
      await fetchUsers();
      addToast("User deleted successfully", "success");
    } catch (error) {
      addToast("Error deleting user: " + (error.response?.data?.message || error.message), "error");
    } finally {
      setActionLoading(false);
    }
  }, [fetchUsers, addToast]);

  const openDeleteModal = useCallback((user) => {
     if (currentUser?._id === user._id) {
      addToast("You cannot delete your own account", "error");
      return;
    }
    setSelectedUser(user);
    setShowDeleteModal(true);
  }, [currentUser, addToast]);

  const handleDeleteSuccess = useCallback(async (message) => {
    setShowDeleteModal(false);
    setSelectedUser(null);
    await fetchUsers();
    addToast(message, "success");
  }, [fetchUsers, addToast]);
  const openEditModal = useCallback((user) => { setSelectedUser(user); setShowEditForm(true); }, []);
  const openPasswordResetModal = useCallback((user) => { setSelectedUserForPassword(user); setShowPasswordModal(true); }, []);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }, []);

  const filteredUsers = useMemo(() =>
    users.filter((u) => {
      const s = searchTerm.toLowerCase();
      const matchSearch =
        u.name?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s) ||
        (u.phone && u.phone.toLowerCase().includes(s));
      const matchRole = filterRole === "all" || u.role === filterRole;
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && u.isActive) ||
        (filterStatus === "inactive" && !u.isActive);
      return matchSearch && matchRole && matchStatus;
    }),
    [users, searchTerm, filterRole, filterStatus]
  );

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    opsManagers: users.filter((u) => u.role === "ops_manager").length,
    admins: users.filter((u) => u.role === "admin").length,
  }), [users]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: T.canvas, fontFamily: FONT_STACK, color: T.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes um-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes um-spin { to{transform:rotate(360deg)} }
        @keyframes um-fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        .um-fade-in { animation: um-fade-in 0.32s cubic-bezier(0.22,1,0.36,1) both; }
        .um-row { transition: background 0.15s ease; }
        .um-row:hover td { background: #f9fafb !important; }
        input:focus, select:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 3px ${T.accentSoft}; outline: none; }
      `}</style>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── Header — identical structure to HomeScreen ── */}
      <div
        style={{
          backgroundColor: T.ink,
          padding: isMobile ? "0.75rem 1rem" : "0 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 64,
          position: "sticky",
          top: 0,
          zIndex: 50,
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: isMobile ? "100%" : "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button onClick={onBack} style={makeHeaderBtn("ghost", isMobile)}>
              <ChevronLeft size={14} />
              {!isMobile && "Back"}
            </button>
            <div
              style={{
                fontSize: isMobile ? "1rem" : "1.05rem",
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-0.01em",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, display: "inline-block" }} />
              User Management
            </div>
          </div>
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "0.4rem 0.7rem", color: "white", cursor: "pointer" }}
            >
              <Menu size={20} />
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
            ...(isMobile && !mobileMenuOpen ? { display: "none" } : { display: "flex" }),
            width: isMobile ? "100%" : "auto",
            justifyContent: isMobile ? "center" : "flex-end",
          }}
        >
          <button onClick={() => setShowAddForm(true)} style={makeHeaderBtn("accent", isMobile)}>
            <Plus size={isMobile ? 12 : 14} />
            {isMobile ? "Add" : "Add User"}
          </button>
          <button onClick={fetchUsers} disabled={actionLoading || loading} style={makeHeaderBtn("soft", isMobile)}>
            <RefreshCw
              size={isMobile ? 12 : 14}
              style={actionLoading || loading ? { animation: "um-spin 0.8s linear infinite" } : {}}
            />
            {!isMobile && "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "1.25rem 1rem" : "2.5rem 2rem" }}>

        {/* Stats grid */}
        <div
          className="um-fade-in"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
            gap: isMobile ? "0.75rem" : "1rem",
            marginBottom: "1.75rem",
          }}
        >
          {[
            { label: "Total Users", value: stats.total, Icon: Users, color: T.accent, bg: T.accentSoft },
            { label: "Active", value: stats.active, Icon: UserCheck, color: "#0f7a52", bg: "#e3f5ee" },
            { label: "Inactive", value: stats.inactive, Icon: UserX, color: "#be185d", bg: "#fdeaf0" },
            { label: "Ops Managers", value: stats.opsManagers, Icon: Briefcase, color: "#b45309", bg: "#fff7e6" },
            { label: "Admins", value: stats.admins, Icon: Crown, color: "#6d28d9", bg: "#efe9fb" },
          ].map((s) => (
            <StatCard key={s.label} {...s} isMobile={isMobile} />
          ))}
        </div>

        {/* Table/card container */}
        <div
          style={{
            backgroundColor: T.surface,
            borderRadius: T.radius,
            boxShadow: T.shadow,
            border: `1px solid ${T.line}`,
            overflow: "visible",
            position: "relative",
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              padding: isMobile ? "0.9rem 1rem" : "1.1rem 1.5rem",
              borderBottom: `1px solid ${T.lineSoft}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            {/* Role filter tabs — same pill style as HomeScreen tabs */}
            <div
              style={{
                display: "flex",
                gap: "0.15rem",
                padding: "0.3rem",
                backgroundColor: T.canvas,
                borderRadius: 12,
                border: `1px solid ${T.line}`,
                overflowX: isMobile ? "auto" : "visible",
                width: isMobile ? "100%" : "auto",
              }}
            >
              {[
                { key: "all", label: "All", count: stats.total },
                { key: "user", label: "Creators", count: users.filter((u) => u.role === "user").length },
                { key: "ops_manager", label: "Ops", count: stats.opsManagers },
                { key: "admin", label: "Admins", count: stats.admins },
              ].map(({ key, label, count }) => {
                const active = filterRole === key;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterRole(key)}
                    style={{
                      padding: isMobile ? "0.35rem 0.65rem" : "0.45rem 0.9rem",
                      borderRadius: 9,
                      border: "none",
                      cursor: "pointer",
                      fontSize: isMobile ? "0.72rem" : "0.8rem",
                      fontWeight: active ? 600 : 500,
                      backgroundColor: active ? T.surface : "transparent",
                      color: active ? T.ink : T.inkSoft,
                      boxShadow: active ? "0 1px 3px rgba(20,22,24,0.08)" : "none",
                      whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                      fontFamily: FONT_STACK,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    {label}
                    <span
                      style={{
                        backgroundColor: active ? T.ink : T.line,
                        color: active ? "#fff" : T.inkSoft,
                        borderRadius: 999,
                        padding: isMobile ? "1px 5px" : "1px 7px",
                        fontSize: isMobile ? "0.6rem" : "0.66rem",
                        fontWeight: 700,
                        minWidth: 16,
                        textAlign: "center",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + status filter */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                width: isMobile ? "100%" : "auto",
                flexWrap: "wrap",
              }}
            >
              {/* Status filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: "0.42rem 0.75rem",
                  border: `1px solid ${T.line}`,
                  borderRadius: T.radiusSm,
                  fontSize: "0.8rem",
                  backgroundColor: T.surface,
                  color: T.inkSoft,
                  cursor: "pointer",
                  fontFamily: FONT_STACK,
                  outline: "none",
                }}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {/* Search */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  backgroundColor: T.canvas,
                  border: `1px solid ${T.line}`,
                  borderRadius: T.radiusSm,
                  padding: isMobile ? "0.5rem 0.8rem" : "0.45rem 0.8rem",
                  flex: isMobile ? 1 : "auto",
                }}
              >
                <Search size={14} color={T.inkFaint} />
                <input
                  type="search"
                  name="user-search"
                  autoComplete="off"
                  style={{
                    border: "none",
                    background: "transparent",
                    outline: "none",
                    fontSize: "0.875rem",
                    color: T.ink,
                    width: isMobile ? "100%" : 200,
                    fontFamily: FONT_STACK,
                  }}
                  placeholder="Search users…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, padding: 0 }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["User", "Email", "Phone", "Designation", "Role", "Status", "Last Login", "Joined", "Actions"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : isMobile ? (
            /* Mobile card grid */
            <div className="um-fade-in" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredUsers.length === 0 ? (
                <EmptyState />
              ) : (
                filteredUsers.map((u) => (
                  <UserCard
                    key={u._id}
                    user={u}
                    onEdit={openEditModal}
                    onDelete={openDeleteModal}  
                    onResetPassword={openPasswordResetModal}
                    actionLoading={actionLoading}
                    formatDate={formatDate}
                  />
                ))
              )}
            </div>
          ) : (
            /* Desktop table */
            <div className="um-fade-in" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["User", "Email", "Phone", "Designation", "Role", "Status", "Last Login", "Joined", "Actions"].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState />
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const r = ROLE_MAP[u.role];
                      return (
                        <tr key={u._id} style={{ borderBottom: `1px solid ${T.lineSoft}` }} className="um-row">
                          {/* User */}
                          <td style={{ padding: "1rem", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: "50%",
                                  backgroundColor: r?.bg || T.accentSoft,
                                  color: r?.color || T.accent,
                                  border: `1px solid ${r?.border || T.line}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "0.875rem",
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}
                              >
                                {u.name?.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 600, color: T.ink, fontSize: "0.875rem" }}>{u.name}</span>
                            </div>
                          </td>
                          {/* Email */}
                          <td style={{ padding: "1rem", fontSize: "0.8rem", color: T.inkSoft, verticalAlign: "middle" }}>
                            {u.email}
                          </td>
                          {/* Phone */}
                          <td style={{ padding: "1rem", verticalAlign: "middle" }}>
                            {u.phone ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem", color: T.inkSoft }}>
                                <Phone size={12} color={T.inkFaint} /> {u.phone}
                              </span>
                            ) : (
                              <span style={{ color: T.inkFaint, fontSize: "0.78rem" }}>—</span>
                            )}
                          </td>
                          {/* Designation */}
                          <td style={{ padding: "1rem", fontSize: "0.8rem", color: T.inkSoft, verticalAlign: "middle" }}>
                            {u.designation || <span style={{ color: T.inkFaint }}>—</span>}
                          </td>
                          {/* Role */}
                          <td style={{ padding: "1rem", verticalAlign: "middle" }}>
                            <RoleBadge roleKey={u.role} />
                          </td>
                          {/* Status */}
                          <td style={{ padding: "1rem", verticalAlign: "middle" }}>
                            <StatusBadge isActive={u.isActive} />
                          </td>
                          {/* Last Login */}
                          <td style={{ padding: "1rem", fontSize: "0.78rem", color: T.inkSoft, verticalAlign: "middle", whiteSpace: "nowrap" }}>
                            {formatDate(u.lastLogin)}
                          </td>
                          {/* Joined */}
                          <td style={{ padding: "1rem", fontSize: "0.78rem", color: T.inkSoft, verticalAlign: "middle", whiteSpace: "nowrap" }}>
                            {formatDate(u.createdAt)}
                          </td>
                          {/* Actions */}
                          <td style={{ padding: "0.85rem 1rem", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", gap: "0.3rem", justifyContent: "center" }}>
                              <ActionBtn
                                bg={T.accentSoft}
                                color={T.accentInk}
                                border="#c9defa"
                                onClick={() => openEditModal(u)}
                                icon={Edit2}
                                label="Edit"
                                title="Edit user"
                                disabled={actionLoading}
                              />
                              <ActionBtn
                                bg="#fff7e6"
                                color="#b45309"
                                border="#fde9c8"
                                onClick={() => openPasswordResetModal(u)}
                                icon={null}
                                emoji="🔑"
                                label="Pwd"
                                title="Reset password"
                                disabled={actionLoading}
                              />
                              {currentUser?._id !== u._id && (
        <ActionBtn
          bg="#fdeceb"
          color="#c1352b"
          border="#f8d6d2"
          onClick={() => openDeleteModal(u)}
          icon={Trash2}
          label="Del"
          title="Delete user"
          disabled={actionLoading}
          danger
        />
      )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showRoleModal && selectedUser && (
        <Modal
          title="Change Role"
          subtitle={`Updating role for ${selectedUser.name}`}
          icon="🎭"
          onClose={() => { setShowRoleModal(false); setSelectedUser(null); setNewRole(""); }}
          closeDisabled={actionLoading}
          footer={
            <>
              <CancelBtn onClick={() => { setShowRoleModal(false); setSelectedUser(null); setNewRole(""); }} disabled={actionLoading} />
              <SubmitBtn onClick={handleRoleChange} disabled={actionLoading || newRole === selectedUser.role} label={actionLoading ? "Updating…" : "Update Role"} />
            </>
          }
        >
          <FieldGroup label="Select New Role">
            <RolePicker value={newRole} onChange={setNewRole} disabled={actionLoading} />
          </FieldGroup>
        </Modal>
      )}

      {showAddForm && <AddUserForm onSuccess={handleAddUserSuccess} onCancel={() => setShowAddForm(false)} />}

      {showEditForm && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => { setShowEditForm(false); setSelectedUser(null); }}
          onSuccess={handleEditUserSuccess}
          loading={actionLoading}
        />
      )}

      {showPasswordModal && (
        <PasswordResetModal
          open={showPasswordModal}
          user={selectedUserForPassword}
          onClose={() => { setShowPasswordModal(false); setSelectedUserForPassword(null); }}
          onSuccess={(msg) => { addToast(msg, "success"); fetchUsers(); }}
          loading={actionLoading}
        />
      )}

{showDeleteModal && selectedUser && (
        <DeleteUserModal
          user={selectedUser}
          onClose={() => { setShowDeleteModal(false); setSelectedUser(null); }}
          onSuccess={handleDeleteSuccess}
          loading={actionLoading}
        />
      )}

    </div>
  );
}

// ─── Small shared action button ───────────────────────────────────────────
function ActionBtn({ bg, color, border, onClick, icon: Icon, emoji, label, title, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.32rem 0.6rem",
        backgroundColor: danger ? "#fdeceb" : bg,
        color: danger ? "#c1352b" : color,
        border: `1px solid ${danger ? "#f8d6d2" : (border || bg)}`,
        borderRadius: 8,
        fontSize: "0.72rem",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        fontFamily: FONT_STACK,
        transition: "opacity 0.15s",
      }}
    >
      {Icon ? <Icon size={12} /> : <span style={{ fontSize: "0.8rem" }}>{emoji}</span>}
      {label}
    </button>
  );
}

function DeleteUserModal({ user, onClose, onSuccess, loading: parentLoading }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setLoading(true);
    setError("");

    try {
      await authAPI.deleteUser(user._id);
      onSuccess(`User "${user.name}" deleted successfully`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || parentLoading;
  const hasQuotationError = error && (error.includes('quotation') || error.includes('associated'));

  return (
    <Modal
      title="Delete User"
      subtitle="Permanently remove user account"
      icon="🗑️"
      onClose={onClose}
      closeDisabled={busy}
      footer={
        <>
          <CancelBtn onClick={onClose} disabled={busy} />
          {!hasQuotationError && (
            <SubmitBtn
              onClick={handleDelete}
              disabled={busy}
              label={busy ? "Deleting User..." : "Delete Permanently"}
              danger
            />
          )}
        </>
      }
    >
      <ErrorBanner message={error} />

      {hasQuotationError ? (
        // Show error when user has quotations
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "16px",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <AlertCircle size={48} color="#d97706" style={{ marginBottom: "1rem" }} />
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#92400e" }}>
            Cannot Delete User
          </h3>
          <p style={{ marginTop: "0.5rem", color: "#78350f", fontSize: "0.85rem" }}>
            This user is associated with existing quotations.
          </p>
        </div>
      ) : (
        // Show delete confirmation
        <div
          style={{
            background: "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(248,113,113,0.12) 100%)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "18px",
            padding: "1.5rem",
            textAlign: "center",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              margin: "0 auto 1rem",
              borderRadius: "50%",
              background: "#fee2e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trash2 size={38} color="#dc2626" />
          </div>

          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#991b1b" }}>
            Delete User Account
          </h3>

          <p style={{ marginTop: "0.5rem", color: "#7f1d1d", fontSize: "0.85rem" }}>
            This action cannot be undone.
          </p>
        </div>
      )}

      {/* User Details */}
      <div
        style={{
          border: `1px solid ${T.lineSoft}`,
          borderRadius: "16px",
          padding: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          background: "#fff",
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.25rem",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {user?.name?.charAt(0)?.toUpperCase() || "U"}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "1rem", fontWeight: 700, color: T.ink, marginBottom: "0.25rem" }}>
            {user.name}
          </div>
          <div style={{ fontSize: "0.85rem", color: T.inkSoft, marginBottom: "0.5rem" }}>
            {user.email}
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "5px 12px",
              borderRadius: "999px",
              background: "#eef2ff",
              color: "#4338ca",
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {user.role}
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "4rem 2rem",
        color: T.inkFaint,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: T.accentSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.25rem",
        }}
      >
        <Users size={28} color={T.accent} />
      </div>
      <p style={{ fontWeight: 600, fontSize: "1rem", color: T.ink, marginBottom: "0.4rem" }}>
        No users found
      </p>
      <p style={{ fontSize: "0.875rem", color: T.inkSoft }}>
        Try adjusting your filters or search term.
      </p>
    </div>
  );
}