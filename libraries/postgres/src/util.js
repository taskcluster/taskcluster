const fs = require('fs');
const path = require('path');

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

exports.loadSql = (value, dir) => {
  // if this doesn't look like a filename, treat it literally
  if (value.includes('\n')) {
    return value;
  }
  const pathname = path.join(dir, value);
  if (!fs.existsSync(pathname)) {
    return value;
  }

  return fs.readFileSync(pathname, 'utf8');
};
