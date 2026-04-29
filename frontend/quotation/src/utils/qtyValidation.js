export const validateQuantity = (value) => {
  if (!value && value !== 0) return { isValid: false, error: 'Quantity is required' };
  const num = Number(value);
  if (isNaN(num)) return { isValid: false, error: 'Quantity must be a number' };
  if (num <= 0) return { isValid: false, error: 'Quantity must be greater than 0' };
  if (!Number.isInteger(num)) return { isValid: false, error: 'Quantity must be a whole number' };
  return { isValid: true, error: null };
};

export const validatePrice = (value) => {
  if (!value && value !== 0) return { isValid: false, error: 'Price is required' };
  const num = Number(value);
  if (isNaN(num)) return { isValid: false, error: 'Price must be a number' };
  if (num < 0) return { isValid: false, error: 'Price cannot be negative' };
  return { isValid: true, error: null };
};

 export const validatePercentage = (value) => {
   if (value === null || value === undefined || value === '') {
    return { isValid: true, error: null };
  }
  
   let num;
  if (typeof value === 'number') {
    num = value;
  } else {
     const cleaned = value.toString().replace(/[^0-9.-]/g, '');
    num = parseFloat(cleaned);
  }
  
   if (isNaN(num)) {
    return { isValid: false, error: 'Please enter a valid number' };
  }
  
   if (num < 0) {
    return { isValid: false, error: 'Percentage cannot be negative' };
  }
  if (num > 100) {
    return { isValid: false, error: 'Percentage cannot exceed 100' };
  }
  
  return { isValid: true, error: null };
};

export const validateDate = (startDate, endDate) => {
  if (!startDate || !endDate) return { isValid: true, error: null };
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end < start) return { isValid: false, error: 'Expiry date cannot be earlier than creation date' };
  return { isValid: true, error: null };
};