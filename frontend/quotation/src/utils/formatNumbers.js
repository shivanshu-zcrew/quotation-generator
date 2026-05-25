// utils/formatNumbers.js

/**
 * Format large numbers with abbreviations (K, M, B, T)
 * @param {number} num - The number to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted number with abbreviation
 */
export const formatLargeNumber = (num, decimals = 1) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    if (num === 0) return '0';
    
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (absNum >= 1_000_000_000_000) {
      return sign + (absNum / 1_000_000_000_000).toFixed(decimals) + 'T';
    }
    if (absNum >= 1_000_000_000) {
      return sign + (absNum / 1_000_000_000).toFixed(decimals) + 'B';
    }
    if (absNum >= 1_000_000) {
      return sign + (absNum / 1_000_000).toFixed(decimals) + 'M';
    }
    if (absNum >= 1_000) {
      return sign + (absNum / 1_000).toFixed(decimals) + 'K';
    }
    
    return sign + absNum.toString();
  };
  
  /**
   * Format number with commas (1,234,567)
   * @param {number} num - The number to format
   * @returns {string} Formatted number with commas
   */
  export const formatNumberWithCommas = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  
  /**
   * Format currency with abbreviation
   * @param {number} num - The amount
   * @param {string} currency - Currency code (AED, USD, etc.)
   * @returns {string} Formatted currency
   */
  export const formatCurrency = (num, currency = 'AED') => {
    if (num === null || num === undefined || isNaN(num)) return `${currency} 0`;
    
    const symbol = currency === 'AED' ? 'د.إ' : 
                   currency === 'USD' ? '$' : 
                   currency === 'EUR' ? '€' : 
                   currency === 'GBP' ? '£' : currency;
    
    if (num >= 1_000_000_000) {
      return `${symbol} ${(num / 1_000_000_000).toFixed(1)}B`;
    }
    if (num >= 1_000_000) {
      return `${symbol} ${(num / 1_000_000).toFixed(1)}M`;
    }
    if (num >= 1_000) {
      return `${symbol} ${(num / 1_000).toFixed(1)}K`;
    }
    
    return `${symbol} ${formatNumberWithCommas(num)}`;
  };
  
  /**
   * Format number with Indian numbering system (Lakh, Crore)
   * @param {number} num - The number to format
   * @returns {string} Formatted number
   */
  export const formatIndianNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (absNum >= 10_000_000) { // Crore
      return sign + (absNum / 10_000_000).toFixed(1) + ' Cr';
    }
    if (absNum >= 100_000) { // Lakh
      return sign + (absNum / 100_000).toFixed(1) + ' L';
    }
    if (absNum >= 1_000) {
      return sign + (absNum / 1_000).toFixed(1) + ' K';
    }
    
    return sign + absNum.toString();
  };
  
  /**
   * Smart formatting - chooses best format based on number size
   * @param {number} num - The number to format
   * @returns {object} { value, suffix, original }
   */
  export const getNumberParts = (num) => {
    if (num === null || num === undefined || isNaN(num)) return { value: 0, suffix: '', original: 0 };
    
    const absNum = Math.abs(num);
    const sign = num < 0 ? -1 : 1;
    
    if (absNum >= 1_000_000_000) {
      return { value: sign * (absNum / 1_000_000_000), suffix: 'B', original: num };
    }
    if (absNum >= 1_000_000) {
      return { value: sign * (absNum / 1_000_000), suffix: 'M', original: num };
    }
    if (absNum >= 1_000) {
      return { value: sign * (absNum / 1_000), suffix: 'K', original: num };
    }
    
    return { value: num, suffix: '', original: num };
  };