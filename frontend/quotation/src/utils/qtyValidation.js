// utils/validation.js
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
    if (value === '' || value === null || value === undefined) {
      return { isValid: true, error: null }; // Allow empty for optional fields
    }
    
    const num = Number(value);
    if (isNaN(num)) {
      return { isValid: false, error: 'Must be a number' };
    }
    
    if (num < 0 || num > 100) {
      return { isValid: false, error: 'Must be between 0 and 100' };
    }
    
    return { isValid: true, error: null };
  };

  export const validateDate = (startDate, endDate) => {
    if (!startDate || !endDate) {
      return { isValid: true, error: null };
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Reset time part for date comparison
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