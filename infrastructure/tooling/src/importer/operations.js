const fs = require('fs');
const chalk = require('chalk');
const spinners = require('cli-spinners');
const {renderGrid} = require('./monitor');
const {sleep} = require('./util');
const prettyMilliseconds = require('pretty-ms');

const SPINNER = spinners.bouncingBall;
const LOGFILE = './importer.json';

class Operations {
  constructor({monitor, config, order}) {
    this.monitor = monitor;
    this.config = config;

    this.operations = [];
    this.history = new History();

    monitor.output_fn(order, () => this.outputGrid());

    this.log = fs.createWriteStream(LOGFILE);
    setInterval(() => this.outputLog(), 1000);
  }

  add(op) {
    op.operations = this;
    this.operations.push(op);
  }

  outputGrid() {
    const frame = Math.round((+new Date()) / (SPINNER.interval * 2)) % SPINNER.frames.length;
    const spinner = SPINNER.frames[frame];
    const grid = [
      [
        {text: spinner, formatter: chalk.green},
        {text: 'Status', formatter: chalk.bold},
        {text: 'Rows Processed', formatter: chalk.bold},
        {text: 'Buffer Size', formatter: chalk.bold},
        {text: 'Elapsed Time', formatter: chalk.bold},
        {text: 'Rate (rps)', formatter: chalk.bold},
      ],
    ];

    for (let op of this.operations) {
      grid.push([
        {text: op.title, formatter: chalk.yellow},
        op.status,
        op.status === 'waiting' ? '-' : op.history.count,
        op.status === 'waiting' ? '-' : op.bufferSize,
        op.status === 'waiting' ? '-' : op.history.elapsedStr(),
        op.history.rateStr(),
      ]);
    }

    grid.push([
      {text: 'TOTAL:', formatter: chalk.bold},
      '',
      {text: this.history.count, formatter: chalk.yellowBright},
      '',
      {text: this.history.elapsedStr(), formatter: chalk.yellowBright},
      {text: this.history.rateStr(), formatter: chalk.yellowBright},
    ]);

    return `log in ${LOGFILE}\n` + renderGrid(grid);
  }

  outputLog() {
    const data = {
      when: new Date().toISOString(),
      operations: this.operations.map(op => ({
        title: op.title,
        status: op.status,
        count: op.history.count,
        bufferSize: op.bufferSize,
        elapsed: op.history.elapsedStr(),
        rate: op.history.rateStr(),
      })),
    };
    this.log.write(JSON.stringify(data));
  }

  rowsProcessed(count) {
    this.history.add(count);
  }

  async runAll() {
    let numRunning = 0;

    await Promise.all(this.operations.map(async op => {
      // This is a simple polling version of a lock.  It's fine for this purpose..
      while (1) {
        if (numRunning >= this.config.CONCURRENCY) {
          // wait 1s before polling again
          await sleep(1000);
          continue;
        }
        numRunning++;
        try {
          op.status = 'running';
          try {
            await op.run();
          } catch (err) {
            op.done();
            op.status = 'error';
            await sleep(500); // long enough to display..
            throw err;
          }
          op.done();
          op.status = 'done';
          break;
        } finally {
          numRunning--;
        }
      }
    }));
  }
}

class History {
  constructor() {
    this.count = 0;
    this.history = [];
    this.started = undefined;
    this.stopped = undefined;
  }

  // Indicate that COUNT things have been processed;  Call this with 0 to
  // indicate when processing begins
  add(count) {
    if (!this.started) {
      this.started = +new Date();
    }
    this.count += count;
    this.history.push([+new Date(), this.count]);
  }

  done() {
    this.stopped = +new Date();
  }

  // get the latest rate, per second, over the last minute, or undefined
  // if there is not enough data
  rate() {
    const now = +new Date();
    while (this.history.length > 0) {
      if (this.history[0][0] < now - 60000) {
        this.history.shift();
      } else {
        break;
      }
    }

    if (this.history.length < 2) {
      return undefined;
    }

    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    const rate = 1000 * (last[1] - first[1]) / (last[0] - first[0]);
    return rate;
  }

  rateStr() {
    const rate = this.rate();
    if (rate === undefined) {
      return '-';
    }
    if (rate < 10) {
      return (Math.floor(rate * 100) / 100).toString();
    } else {
      return Math.floor(rate).toString();
    }
  }

  elapsedStr() {
    if (!this.started) {
      return '-';
    }
    return prettyMilliseconds((this.stopped || +new Date()) - this.started);
  }
}

class Operation {
  constructor({title}) {
    this.title = title;
    this.status = 'waiting';
    this.history = new History();
    this.bufferSize = '-';
  }

  async run() {
  }

  // indicate that COUNT rows have been processed
  rowsProcessed(count) {
    this.history.add(count);
    this.operations.rowsProcessed(count);
  }

  done() {
    this.history.done();
  }
}

exports.Operations = Operations;
exports.Operation = Operation;
