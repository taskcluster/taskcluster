import fs from 'fs';
import path from 'path';
import { SYNTAX_ERROR } from './constants.js';

export const ignorePgErrors = async (promise, ...codes) => {
  try {
    await promise;
  } catch (err) {
    if (!codes.includes(err.code)) {
      throw err;
    }
  }
};

export const dollarQuote = str => {
  let i = '';
  while (true) {
    const quote = `$${i}$`;
    if (str.indexOf(quote) === -1) {
      return quote + str + quote;
    }
    i = i + 'x';
  }
};

export const loadSql = (value, dir) => {
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
export const annotateError = (query, err) => {
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

/**
 * Call the given fetch method with a given size and offset to fetch data, and
 * return an async iterator that will yield each row in turn.
 */
export const paginatedIterator = ({ fetch, indexColumns, size = 1000 }) => {
  return {
    [Symbol.asyncIterator]() {
      let done = false;
      let rows = [];

      let getRows;
      if (indexColumns) {
        // index-based pagination
        let after = Object.fromEntries(indexColumns.map(col => [`after_${col}_in`, null]));
        getRows = async () => {
          rows = await fetch(size, after);
          if (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            after = Object.fromEntries(indexColumns.map(col => [`after_${col}_in`, lastRow[col]]));
          } else {
            after = null; // getRows shouldn't be called after this!
          }
          return rows;
        };
      } else {
        // limit/offset based pagination
        let offset = 0;
        getRows = async () => {
          rows = await fetch(size, offset);
          offset += rows.length;
          return rows;
        };
      }

      const next = async () => {
        if (rows.length > 0) {
          return { value: rows.shift(), done: false };
        }
        if (done) {
          // If this iterator has already "finished", just return that status
          // without calling out to the DB again (and potentially returning more
          // results).
          return { done };
        }

        rows = await getRows();
        if (rows.length === 0) {
          done = true;
          return { done };
        }

        return { value: rows.shift(), done: false };
      };

      return { next };
    },
  };
};

/**
 * Calculate ETA and rate for an ongoing process.
 */
export class ETA {
  constructor({
    // end is the final value, for ETA; if not given, ETA is not available
    end,
    // the number of history elements to keep
    historyLength,
  }) {
    this.end = end;
    this.historyLength = historyLength;

    this.history = [];
  }

  // record a measurement at the current time; this is an absolute value, not a
  // delta
  measurement(val) {
    this.history.push([Date.now(), val]);
    while (this.history.length > this.historyLength) {
      this.history.shift();
    }
  }

  // return the rate in units of value per ms, or NaN if it cannot be calculated yet
  rate() {
    if (this.history.length < 2) {
      return NaN;
    }

    const [first, last] = [this.history[0], this.history[this.history.length - 1]];
    return (last[1] - first[1]) / (last[0] - first[0]);
  }

  // return the time the value will reach the end, or undefined if this cannot
  // be calculated.
  eta() {
    if (!this.end) {
      return undefined;
    }

    const rate = this.rate();
    if (isNaN(rate) || !rate) {
      return undefined;
    }

    const last = this.history[this.history.length - 1];
    const remainingCount = this.end - last[1];
    const remainingTime = remainingCount / rate;
    return new Date(Date.now() + remainingTime);
  }
}
