export async function apiHandler(set, fn) {
    try {
      return await fn();
    } catch (error) {
      const appError = AppError.from(error);
      set({ lastError: appError });
      throw appError;
    }
  }