import React, { useEffect } from "react";
import {
  Bell,
  X,
  CheckCircle,
  Award,
  UserPlus,
  RefreshCw,
  Clock,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import useNotificationStore from "../services/notificationStore";

const drawerStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    backdropFilter: "blur(4px)",
    zIndex: 1000,
    transition: "all 0.3s ease",
  },

  drawer: {
    position: "fixed",
    top: 0,
    right: 0,
    width: "420px",
    maxWidth: "100%",
    height: "100vh",
    background: "#ffffff",
    zIndex: 1001,
    boxShadow: "-10px 0 40px rgba(0,0,0,0.12)",
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s ease",
    overflow: "hidden",
  },

  header: {
    padding: "1.25rem",
    borderBottom: "1px solid #e2e8f0",
    background: "#ffffff",
  },

  headerTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  titleWrap: {
    display: "flex",
    alignItems: "center",
    gap: "0.9rem",
  },

  bellBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    background: "#eef2ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    background: "#ef4444",
    color: "#fff",
    fontSize: "11px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
  },

  title: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
  },

  subtitle: {
    fontSize: "0.82rem",
    color: "#64748b",
    marginTop: 2,
  },

  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "none",
    background: "#f8fafc",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  actionRow: {
    marginTop: "1rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  markAllBtn: {
    border: "none",
    background: "#eef2ff",
    color: "#4f46e5",
    padding: "0.5rem 0.85rem",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: "0.82rem",
    fontWeight: 600,
  },

  body: {
    flex: 1,
    overflowY: "auto",
    background: "#f8fafc",
    padding: "1rem",
  },

  notificationCard: (isRead) => ({
    background: isRead
      ? "#ffffff"
      : "linear-gradient(135deg,#eef2ff 0%, #ffffff 100%)",
    border: isRead
      ? "1px solid #e2e8f0"
      : "1px solid #c7d2fe",
    borderRadius: 18,
    padding: "1rem",
    marginBottom: "0.85rem",
    cursor: "pointer",
    transition: "all 0.2s ease",
    position: "relative",
    boxShadow: isRead
      ? "0 1px 3px rgba(0,0,0,0.04)"
      : "0 4px 12px rgba(79,70,229,0.08)",
  }),

  unreadDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#4f46e5",
  },

  cardContent: {
    display: "flex",
    gap: "0.9rem",
  },

  iconWrap: (bg, border, color) => ({
    width: 46,
    height: 46,
    borderRadius: 14,
    background: bg,
    border: `1px solid ${border}`,
    color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }),

  notifContent: {
    flex: 1,
    minWidth: 0,
  },

  notifHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.75rem",
  },

  notifTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.4,
  },

  notifTime: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
    fontSize: "0.72rem",
    color: "#94a3b8",
  },

  notifMessage: {
    fontSize: "0.84rem",
    color: "#475569",
    lineHeight: 1.6,
    marginTop: "0.7rem",
  },

  actionLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    marginTop: "0.9rem",
    background: "#eef2ff",
    color: "#4f46e5",
    padding: "0.4rem 0.7rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
  },

  emptyWrap: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "2rem",
  },

  emptyIcon: {
    width: 90,
    height: 90,
    borderRadius: "50%",
    background: "#e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "1rem",
  },

  loadingWrap: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },

  spinner: {
    width: 52,
    height: 52,
    border: "4px solid #c7d2fe",
    borderTop: "4px solid #4f46e5",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};

const NotificationDrawer = ({ isOpen, onClose }) => {
  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const getNotificationConfig = (type) => {
    switch (type) {
      case "quotation_approved":
        return {
          icon: <CheckCircle size={18} />,
          bg: "#ecfdf5",
          color: "#10b981",
          border: "#bbf7d0",
        };

      case "quotation_rejected":
        return {
          icon: <X size={18} />,
          bg: "#fef2f2",
          color: "#ef4444",
          border: "#fecaca",
        };

      case "quotation_awarded":
        return {
          icon: <Award size={18} />,
          bg: "#f5f3ff",
          color: "#8b5cf6",
          border: "#ddd6fe",
        };

      case "new_customer":
        return {
          icon: <UserPlus size={18} />,
          bg: "#fffbeb",
          color: "#f59e0b",
          border: "#fde68a",
        };

      case "sync_completed":
        return {
          icon: <RefreshCw size={18} />,
          bg: "#eff6ff",
          color: "#3b82f6",
          border: "#bfdbfe",
        };

      default:
        return {
          icon: <Bell size={18} />,
          bg: "#f8fafc",
          color: "#64748b",
          border: "#e2e8f0",
        };
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>

      {/* Overlay */}
      {isOpen && (
        <div style={drawerStyles.overlay} onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        style={{
          ...drawerStyles.drawer,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div style={drawerStyles.header}>
          <div style={drawerStyles.headerTop}>
            <div style={drawerStyles.titleWrap}>
              <div style={drawerStyles.bellBox}>
                <Bell size={22} color="#4f46e5" />

                {unreadCount > 0 && (
                  <div style={drawerStyles.unreadBadge}>
                    {unreadCount}
                  </div>
                )}
              </div>

              <div>
                <h2 style={drawerStyles.title}>Notifications</h2>
                <div style={drawerStyles.subtitle}>
                  Stay updated with activities
                </div>
              </div>
            </div>

            <button style={drawerStyles.closeBtn} onClick={onClose}>
              <X size={20} color="#64748b" />
            </button>
          </div>

          {unreadCount > 0 && (
            <div style={drawerStyles.actionRow}>
              <span
                style={{
                  fontSize: "0.82rem",
                  color: "#64748b",
                }}
              >
                {unreadCount} unread notifications
              </span>

              <button
                style={drawerStyles.markAllBtn}
                onClick={markAllAsRead}
              >
                Mark all read
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={drawerStyles.body}>
          {isLoading ? (
            <div style={drawerStyles.loadingWrap}>
              <div style={drawerStyles.spinner} />
              <p
                style={{
                  marginTop: "1rem",
                  color: "#64748b",
                }}
              >
                Loading notifications...
              </p>
            </div>
          ) : notifications.length === 0 ? (
            <div style={drawerStyles.emptyWrap}>
              <div style={drawerStyles.emptyIcon}>
                <Bell size={40} color="#94a3b8" />
              </div>

              <h3
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: "0.5rem",
                }}
              >
                No Notifications
              </h3>

              <p
                style={{
                  fontSize: "0.85rem",
                  color: "#64748b",
                  maxWidth: 260,
                  lineHeight: 1.6,
                }}
              >
                You're all caught up. New notifications will appear here.
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const config = getNotificationConfig(notif.type);

              return (
                <div
                  key={notif._id}
                  style={drawerStyles.notificationCard(notif.isRead)}
                  onClick={() => {
                    markAsRead(notif._id);

                    if (notif.actionUrl) {
                      window.location.href = notif.actionUrl;
                      onClose();
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform =
                      "translateY(-2px)";
                    e.currentTarget.style.boxShadow =
                      "0 10px 25px rgba(0,0,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform =
                      "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      notif.isRead
                        ? "0 1px 3px rgba(0,0,0,0.04)"
                        : "0 4px 12px rgba(79,70,229,0.08)";
                  }}
                >
                  {!notif.isRead && (
                    <div style={drawerStyles.unreadDot} />
                  )}

                  <div style={drawerStyles.cardContent}>
                    {/* Icon */}
                    <div
                      style={drawerStyles.iconWrap(
                        config.bg,
                        config.border,
                        config.color
                      )}
                    >
                      {config.icon}
                    </div>

                    {/* Content */}
                    <div style={drawerStyles.notifContent}>
                      <div style={drawerStyles.notifHeader}>
                        <div>
                          <div style={drawerStyles.notifTitle}>
                            {notif.title}
                          </div>

                          <div style={drawerStyles.notifTime}>
                            <Clock size={11} />

                            {formatDistanceToNow(
                              new Date(notif.createdAt),
                              {
                                addSuffix: true,
                              }
                            )}
                          </div>
                        </div>

                        <ChevronRight
                          size={16}
                          color="#94a3b8"
                        />
                      </div>

                      <div style={drawerStyles.notifMessage}>
                        {notif.message}
                      </div>

                      {notif.actionLabel && (
                        <div style={drawerStyles.actionLabel}>
                          {notif.actionLabel}
                          <ChevronRight size={12} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

export default NotificationDrawer;