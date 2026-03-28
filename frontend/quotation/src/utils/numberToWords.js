export const numberToWords = (() => {
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
    const teens = ['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                   'Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const thou = ['','Thousand','Lakh','Crore'];
    
    const convertLessThanThousand = (n) => {
      if (!n) return '';
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanThousand(n % 100) : '');
    };
    
    const convertMain = (n) => {
      let res = '', i = 0;
      while (n > 0) {
        if (n % 1000) 
          res = convertLessThanThousand(n % 1000) + (thou[i] ? ' ' + thou[i] + ' ' : '') + res;
        n = Math.floor(n / 1000);
        i++;
      }
      return res.trim() + ' Dirhams Only';
    };
    
    return (num) => {
      if (!num || num === 0) return 'Zero Dirhams Only';
      const dirhams = Math.floor(num);
      const fils = Math.round((num - dirhams) * 100);
      let result = convertMain(dirhams);
      if (fils > 0) 
        result = result.replace('Dirhams Only', `Dirhams and ${convertLessThanThousand(fils)} Fils Only`);
      return result;
    };
  })();