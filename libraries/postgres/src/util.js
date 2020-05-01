const fs = require('fs');
const path = require('path');
const {SYNTAX_ERROR} = require('./constants');

exports.ignorePgErrors = async (promise, ...codes) => {
  try {
    await promise;
  } catch (err) {
    if (!codes.includes(err.code)) {
      throw err;
    }
  }
};

exports.dollarQuote = str => {
  let i = '';
  while (true) {
    const quote = `$${i}$`;
    if (str.indexOf(quote) === -1) {
      return quote + str + quote;
    }
    i = i + 'x';
  }
};

exports.loadSql = (value, dir) => {
  // sql values are optional
  if (!value) {
    return value;
  }

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

/**
 * Annotate a postgres error message with additional useful information,
 * including some additional attributes usually hidden as error properties and,
 * for the common case of a syntax error, a nice caret highlighting the error
 * location.
 */
exports.annotateError = (query, err) => {
  if (err.code === SYNTAX_ERROR && err.position) {
    const msgLines = err.message.split('\n');

    const queryLines = query.split('\n');
    let position = err.position;
    let line = 0;
    while (line < queryLines.length && position > queryLines[line].length + 1) {
      position -= queryLines[line].length + 1;
      line++;
    }
    if (line < queryLines.length) {
      const caret = " ".repeat(position) + "^";
      queryLines.splice(line + 1, 0, caret);
    }

    err.message = [msgLines[0]]
      .concat(queryLines)
      .concat(msgLines.slice(1)).join('\n');
  }

  // show hints or details from this error in the debug log, to help
  // debugging issues..
  for (let p of ['hint', 'detail', 'where', 'code']) {
    if (err[p]) {
      err.message += `\n${p.toUpperCase()}: ${err[p]}`;
    }
  }
};
