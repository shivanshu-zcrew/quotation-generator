// components/NumberDisplay.jsx
import React from 'react';
import { Tooltip } from 'antd'; // or any tooltip library
import { formatNumberWithCommas, formatLargeNumber, getNumberParts } from '../utils/formatNumbers';

const NumberDisplay = ({ 
  value, 
  abbreviate = true, 
  showTooltip = true,
  decimals = 1,
  currency = null,
  className = ''
}) => {
  if (value === null || value === undefined || isNaN(value)) {
    return <span className={className}>0</span>;
  }

  const formatted = currency 
    ? formatCurrency(value, currency)
    : abbreviate 
      ? formatLargeNumber(value, decimals)
      : formatNumberWithCommas(value);
  
  const fullNumber = formatNumberWithCommas(value);
  const parts = getNumberParts(value);

  if (!showTooltip || !abbreviate || value < 10000) {
    return <span className={className}>{formatted}</span>;
  }

  return (
    <Tooltip title={`${fullNumber} ${currency ? currency : ''}`}>
      <span className={className}>
        {parts.value.toFixed(decimals)}{parts.suffix}
        {currency && ` ${currency}`}
      </span>
    </Tooltip>
  );
};

export default NumberDisplay;