exports.dollarQuote = str => {
  let i = '';
  while (true) {
    const quote = `$${i}$`;
    if (str.indexOf(quote) === -1) {
      return quote + str + quote;
    }
    i = i + '-';
  }
};
