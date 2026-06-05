import { CURRENCY_SYMBOLS } from './constants';

 export const fmtCurrency = (n, currency = 'AED') => {
  const amount = (n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount;
};

export const fmtCurrencyWithCode = (n, currency = 'AED') => {
  const amount = (n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    amount,
    code: currency
  };
};

export const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

export const isExpired = (d) => d && new Date(d) < new Date();

export const isExpiringSoon = (d) => {
  if (!d) return false;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return false;
  const days = Math.ceil((dt - new Date()) / 86400000);
  return days >= 0 && days <= 7;
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getTodayDate = () => new Date().toISOString().split('T')[0];

export const getDefaultExpiryDate = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

export const formatLargeCurrency = (num, currency) => {
  if (num === null || num === undefined || isNaN(num)) return `0 ${currency}`;
  if (num === 0) return `0 ${currency}`;
  
  const absNum = Math.abs(num);
  
  if (absNum >= 1_000_000_000) {
    return `${(absNum / 1_000_000_000).toFixed(1)}B ${currency}`;
  }
  if (absNum >= 1_000_000) {
    return `${(absNum / 1_000_000).toFixed(1)}M ${currency}`;
  }
  if (absNum >= 1_000) {
    return `${(absNum / 1_000).toFixed(1)}K ${currency}`;
  }
  
  return `${num.toLocaleString()} ${currency}`;
};