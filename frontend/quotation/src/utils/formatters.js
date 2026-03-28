import { CURRENCY_SYMBOLS } from './constants';

export const fmtCurrency = (n, currency = 'AED') => {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${symbol} ${(n || 0).toLocaleString('en-AE', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
};

export const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  } catch { 
    return '—'; 
  }
};

export const isExpired = (d) => {
  if (!d) return false;
  const dt = new Date(d);
  return !isNaN(dt.getTime()) && dt < new Date();
};

export const isExpiringSoon = (d) => {
  if (!d) return false;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return false;
  const days = Math.ceil((dt - new Date()) / 86400000);
  return days >= 0 && days <= 7;
};