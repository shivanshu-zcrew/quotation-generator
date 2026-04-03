export const createAuthSlice = (set, get) => ({

    user: null,
  
    handleLogin: async (email, password) => {
      try {
        const res = await authAPI.login({ email, password });
  
        const userData = res.data.user || res.data;
        const token = res.data.token || userData.token;
  
        const user = {
          _id: userData._id || userData.id,
          name: userData.name,
          email: userData.email,
          role: userData.role,
          token
        };
  
        setAuthData(user);
  
        set({ user });
  
        await get().fetchAllData();
  
        return { success: true, role: user.role };
  
      } catch (error) {
        const appError = AppError.from(error);
        set({ lastError: appError });
        return { success: false, error: getErrorMessage(error) };
      }
    },
  
    handleLogout: () => {
      clearAuthData();
      set({ user: null });
    }
  
  });