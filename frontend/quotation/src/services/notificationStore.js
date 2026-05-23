import { create } from 'zustand';
import { notificationAPI } from './api';

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isOpen: false,

  // Fetch notifications
  fetchNotifications: async (params = {}) => {
    set({ isLoading: true });
    try {
      const res = await notificationAPI.getAll(params);
      set({
        notifications: res.data.notifications || [],
        unreadCount: res.data.unreadCount || 0,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ isLoading: false });
    }
  },

  // Get unread count only (for bell)
  fetchUnreadCount: async () => {
    try {
      const res = await notificationAPI.getUnreadCount();
      set({ unreadCount: res.data.unreadCount || 0 });
    } catch (error) {
      console.error(error);
    }
  },

  // Mark single as read
  markAsRead: async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      set((state) => ({
        notifications: state.notifications.map(n =>
          n._id === id ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1)
      }));
    } catch (error) {
      console.error(error);
    }
  },

  // Mark all as read
  markAllAsRead: async () => {
    try {
      await notificationAPI.markAllAsRead();
      set((state) => ({
        notifications: state.notifications.map(n => ({ ...n, isRead: true })),
        unreadCount: 0
      }));
    } catch (error) {
      console.error(error);
    }
  },

  // Toggle notification panel
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  setOpen: (isOpen) => set({ isOpen }),

  // Add new notification (for real-time if using sockets later)
  addNotification: (notification) => set((state) => ({
    notifications: [notification, ...state.notifications],
    unreadCount: state.unreadCount + 1
  })),

  clearAll: () => set({ notifications: [], unreadCount: 0 })
}));

export default useNotificationStore;