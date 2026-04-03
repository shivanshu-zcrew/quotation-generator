export const numberToWords = (() => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const thou = ['', 'Thousand', 'Lakh', 'Crore'];
  
  const convertLessThanThousand = (n) => {
    if (!n) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanThousand(n % 100) : '');
  };
  
  return (num) => {
    if (!num || num === 0) return 'Zero Dirhams Only';
    let n = Math.floor(num);
    let res = '', i = 0;
    while (n > 0) {
      if (n % 1000) res = convertLessThanThousand(n % 1000) + (thou[i] ? ' ' + thou[i] + ' ' : '') + res;
      n = Math.floor(n / 1000);
      i++;
    }
    const fils = Math.round((num - Math.floor(num)) * 100);
    let result = res.trim() + ' Dirhams Only';
    if (fils > 0) result = result.replace('Dirhams Only', `Dirhams and ${convertLessThanThousand(fils)} Fils Only`);
    return result;
  };
})();