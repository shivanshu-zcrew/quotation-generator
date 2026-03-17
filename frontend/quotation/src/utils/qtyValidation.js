 export const validateQuantity = (value) => {
    if (value === '' || value === null || value === undefined) {
      return { isValid: false, error: 'Quantity is required' };
    }
    
    const num = Number(value);
    if (isNaN(num)) {
      return { isValid: false, error: 'Quantity must be a number' };
    }
    
    if (num <= 0) {
      return { isValid: false, error: 'Quantity must be greater than 0' };
    }
    
    if (!Number.isInteger(num)) {
      return { isValid: false, error: 'Quantity must be a whole number' };
    }
    
    return { isValid: true, error: null };
  };
  
  export const validatePrice = (value) => {
    if (value === '' || value === null || value === undefined) {
      return { isValid: false, error: 'Price is required' };
    }
    
    const num = Number(value);
    if (isNaN(num)) {
      return { isValid: false, error: 'Price must be a number' };
    }
    
    if (num < 0) {
      return { isValid: false, error: 'Price cannot be negative' };
    }
    
    return { isValid: true, error: null };
  };
  
  export const validatePercentage = (value) => {
    console.log("Validating percentage:", value, "type:", typeof value);
    
    // If it's a number, it's already valid
    if (typeof value === 'number') {
      if (value >= 0 && value <= 100) {
        return { isValid: true };
      } else {
        return { isValid: false, error: 'Percentage must be between 0 and 100' };
      }
    }
    
    // Empty string is valid during typing
    if (value === '' || value === null || value === undefined) {
      return { isValid: true };
    }
    
    // Handle string numbers
    // Remove leading zeros for validation but keep for display
    const cleanedValue = value.replace(/^0+/, '') || '0';
    const num = Number(cleanedValue);
    
    if (isNaN(num)) {
      return { isValid: false, error: 'Must be a valid number' };
    }
    
    if (num < 0 || num > 100) {
      return { isValid: false, error: 'Percentage must be between 0 and 100' };
    }
    
    return { isValid: true };
  };

  export const validateDate = (startDate, endDate) => {
    if (!startDate || !endDate) {
      return { isValid: true, error: null };
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
     start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    if (end < start) {
      return { 
        isValid: false, 
        error: 'Expiry date cannot be earlier than creation date' 
      };
    }
    
    return { isValid: true, error: null };
  };