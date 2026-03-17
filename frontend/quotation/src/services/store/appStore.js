export const useAppStore = create(
    devtools(
     persist(
      (...a) => ({
   
        ...createAuthSlice(...a),
        ...createCustomerSlice(...a),
        ...createItemSlice(...a),
        ...createQuotationSlice(...a)
   
      }),
      { name: "app-store" }
     )
    )
   );