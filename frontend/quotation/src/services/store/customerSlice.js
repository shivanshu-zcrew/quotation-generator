export const createCustomerSlice = (set) => ({

    customers: [],
  
    addCustomer: async (data) => {
      try {
        const res = await customerAPI.create(data);
  
        set((s) => ({
          customers: [...s.customers, res.data]
        }));
  
        return { success: true };
  
      } catch (error) {
        const appError = AppError.from(error);
        set({ lastError: appError });
        return { success: false, error: getErrorMessage(error) };
      }
    }
  
  });