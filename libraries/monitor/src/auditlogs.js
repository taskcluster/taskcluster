let debug = require('debug')('taskcluster-lib-monitor');
let events = require('events');
let _ = require('lodash');
let Promise = require('bluebird');
let AWS = require('aws-sdk');

// These numbers come from the Firehose docs.
const MAX_PUT_RECORDS = 500;
const MAX_PUT_SIZE = 4 * 1000 * 1000;
const MAX_RECORD_SIZE = 1000 * 1000;

// This is just a number I picked.
const MAX_RETRIES = 5;

class FirehoseLog extends events.EventEmitter {

  constructor({aws, logName, reportAuditLogErrors, resourceInterval, crashTimeout}) {
    super();
    if (!logName || !aws) {
      throw new Error('Must specify both aws credentials and stream name to have structured logs!');
    }

    this._flushInterval = resourceInterval * 1000;
    this._crashTimeout = crashTimeout;
    this._firehose = new AWS.Firehose(aws);
    this._logName = logName;
    this._records = [];
    this._flushTimer = null;
    this._done = false;
    this._flushTimer = setTimeout(this.flush.bind(this), this._flushInterval);
    this._reportErrors = reportAuditLogErrors;
  }

  async setup() {
    let stat = await this._firehose.describeDeliveryStream({
      DeliveryStreamName: this._logName,
    }).promise();
    if (stat.DeliveryStreamDescription.DeliveryStreamStatus !== 'ACTIVE') {
      throw new Error(`Delivery Stream ${this._logName} is not yet active!`);
    }
  }

  log(record) {
    if (this._done) {
      throw new Error('Cannot write to logs when logging is marked done!');
    }

    let line = JSON.stringify(record) + '\n';
    let length = Buffer.byteLength(line, 'utf-8');

    // Each line can have up to 1MB
    if (length > MAX_RECORD_SIZE) {
      let msg = `Tried to log too-long line! (${length} bytes > 1MB)`;
      console.error(msg);
      if (this._reportErrors) {
        this.emit('error', new Error(msg));
      }
      return;
    }
    this._records.push({line, retries: 0, length});
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (!this._flushTImer) {
      this._flushTimer = setTimeout(this.flush.bind(this), this._flushInterval);
    }
  }

  async flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }

    let chunks = [[]];
    let c = 0;

    // First break up the records into chunks that kinesis will accept
    this._records.forEach(rec => {
      if (chunks[c].length >= MAX_PUT_RECORDS ||
      chunks[c].reduce((a, r) => a + r.length, 0) + rec.length  > MAX_PUT_SIZE) {
        chunks[++c] = [];
      }
      chunks[c].push(rec);
    });
    this._records = [];

    // Now submit the chunks
    await Promise.map(chunks, async records => {
      let res;
      try {
        res = await this._firehose.putRecordBatch({
          DeliveryStreamName: this._logName,
          Records: records.map(line => ({Data: line.line})),
        }).promise();
      } catch (err) {
        if (err.statusCode < 500) {
          if (this._reportErrors) {
            this.emit('error', err);
          }
          return;
        }
        // If this was a server-side error, we'll construct a response similar to how
        // they normall reject specific records and pass that to the requeuing below
        res = {
          FailedPutCount: records.length,
          RequestResponses: records.map(() => ({ErrorCode: err.code, ErrorMessage: err.message})),
        };
      }
      if (res.FailedPutCount === 0) {
        return;
      }
      // Continue on here if we've failed to process any records.
      // We'll add them back to our records and try again next time
      let retries = [];
      res.RequestResponses.forEach((req, i) => {
        if (req.ErrorCode) {
          let record = records[i];
          debug('Failed to write record ' + JSON.stringify(record) + '. Reason: ' + req.ErrorMessage);
          if (record.retries > MAX_RETRIES) {
            let msg = `Record failed during submission more than ${MAX_RETRIES} times. Rejecting.`;
            console.error(msg);
            if (this._reportErrors) {
              this.emit('error', new Error(msg));
            }
            return;
          }
          record.retries += 1;
          this._records.push(record);
        }
      });
      if (this._records.length) {
        this._scheduleFlush();
      }
    });
  }
}

class NoopLog extends events.EventEmitter {

  async setup() {
  }

  async close() {
  }

  async drained() {
  }

  log(record) {
    throw new Error('Must give aws credentials and logName to lib-monitor to use auditlogs!');
  }

  async flush() {
  }
}

module.exports = {NoopLog, FirehoseLog};
