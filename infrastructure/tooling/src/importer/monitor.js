const assert = require('assert');
const _ = require('lodash');
const logUpdate = require('log-update');

const INTERVAL = 200;

/**
 * A monitor displays constantly-updated data on the console.
 */
class Monitor {
  constructor() {
    this.output_fns = [];

    this.timer = setInterval(() => this.update(), INTERVAL);
  }

  output_fn(order, fn) {
    this.output_fns.push([order, fn]);
    this.output_fns.sort((a, b) => {
      if (a[0] < b[0]) {
        return -1;
      } else if (a[0] > b[0]) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  update() {
    logUpdate(`\n` + this.output_fns.map(([i, fn]) => fn()).join(''));
  }
}

/**
 * Render an array of arrays into a textual grid, using the maximum width
 * of each column to align things properly.  Each cell should have {text,
 * formatter} where text is the underlying text (used to calculate the
 * width) and formatter is a function that will format that text (such
 * as adding color).
 */
const renderGrid = grid => {
  const lengths = new Set([...grid.map(row => row.length)]);
  assert(lengths.size === 1, "all grid rows must have same length");

  // normalize..
  grid = grid.map(row => row.map(cell => {
    if (!cell.text) {
      return {text: cell.toString(), formatter: x => x};
    } else if (!cell.formatter) {
      return {text: cell.text.toString(), formatter: x => x};
    } else {
      return {text: cell.text.toString(), formatter: cell.formatter};
    }
  }));

  const width = [...lengths][0];
  const colWidths = new Array(width);

  for (const row of grid) {
    let i = 0;
    for (const {text} of row) {
      colWidths[i] = Math.max(colWidths[i] || 0, text.length);
      i++;
    }
  }

  const lines = [];
  for (const row of grid) {
    const line = [];
    let i = 0;
    for (const {text, formatter} of row) {
      const cell = formatter(text);
      line.push(cell + _.repeat(' ', colWidths[i] - text.length));
      i++;
    }
    lines.push(line.join(' '));
  }
  return lines.join('\n');
};

exports.Monitor = Monitor;
exports.renderGrid = renderGrid;
