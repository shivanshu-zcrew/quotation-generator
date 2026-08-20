export const numberToWords = (() => {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
  ];

  const teens = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];

  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  const convertLessThanThousand = (n) => {
    if (!n) return '';

    if (n < 10) return ones[n];

    if (n < 20) return teens[n - 10];

    if (n < 100) {
      return (
        tens[Math.floor(n / 10)] +
        (n % 10 ? ' ' + ones[n % 10] : '')
      );
    }

    return (
      ones[Math.floor(n / 100)] +
      ' Hundred' +
      (n % 100
        ? ' ' + convertLessThanThousand(n % 100)
        : '')
    );
  };

  const convertInternationalNumber = (num) => {
    if (num === 0) return 'Zero';

    let result = '';

    // Billion
    if (num >= 1000000000) {
      const billion = Math.floor(num / 1000000000);

      result +=
        convertLessThanThousand(billion) +
        ' Billion ';

      num %= 1000000000;
    }

    // Million
    if (num >= 1000000) {
      const million = Math.floor(num / 1000000);

      result +=
        convertLessThanThousand(million) +
        ' Million ';

      num %= 1000000;
    }

    // Thousand
    if (num >= 1000) {
      const thousand = Math.floor(num / 1000);

      result +=
        convertLessThanThousand(thousand) +
        ' Thousand ';

      num %= 1000;
    }

    // Remaining hundreds, tens and ones
    if (num > 0) {
      result += convertLessThanThousand(num);
    }

    return result.trim();
  };

  return (num) => {
    if (num === null || num === undefined || num === '') {
      return 'Zero';
    }

    const number = Number(num);

    if (Number.isNaN(number) || number === 0) {
      return 'Zero';
    }

    const wholeNumber = Math.floor(number);

    return convertInternationalNumber(wholeNumber) + ' Only';
  };
})();