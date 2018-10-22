let debug = require('debug')('taskcluster-lib-monitor');
let events = require('events');
let _ = require('lodash');
let Promise = require('bluebird');
let AWS = require('aws-sdk');

// This number comes from the Kinesis docs.
const MAX_RECORD_SIZE = 1000 * 1000;

// This is just a number I picked.
const MAX_RETRIES = 5;

// Consistent partition key for all records. This can be changed later if the volume of audit
// logs greatly increases.
const AUDITLOG_PARTITION_KEY = 'auditlog';

// Limit on number of records we send in one PutRecords call (max is 500)
const KINESIS_BATCH_SIZE = 500;

class KinesisLog extends events.EventEmitter {

  constructor({aws, logName, reportAuditLogErrors, resourceInterval, crashTimeout, statsum}) {
    super();
    if (!logName || !aws) {
      throw new Error('Must specify both aws credentials and stream name to have structured logs!');
    }

    this._flushInterval = resourceInterval * 1000;
    this._crashTimeout = crashTimeout;
    this._kinesis = new AWS.Kinesis(aws);
    this._logName = logName;
    this._records = [];
    this._flushTimer = setTimeout(this.flush.bind(this), this._flushInterval);
    this._reportErrors = reportAuditLogErrors;
    this._statsum = statsum;
  }

  async setup() {
    let stat = await this._kinesis.describeStream({
      StreamName: this._logName,
    }).promise();
    if (stat.StreamDescription.StreamStatus !== 'ACTIVE') {
      throw new Error(`Stream ${this._logName} is not yet active!`);
    }
  }

  log(record) {
    let line = JSON.stringify(record) + '\n';
    let size = Buffer.byteLength(line, 'utf-8');

    // Each line can have up to 1MB
    if (size > MAX_RECORD_SIZE) {
      let msg = `Tried to log too-long line! (${size} bytes > 1MB)`;
      console.error(msg);
      if (this._reportErrors) {
        this.emit('error', new Error(msg));
      }
      return;
    }
    this._statsum.count('auditlog.line', 1);
    this._records.push({line, retries: 0, size});
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(this.flush.bind(this), this._flushInterval);
    }
  }

  async flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }

    if (!this._records.length) {
      return;
    }

    let chunks = [{chunkSize: 0, records: []}];
    let c = 0;
    let totalSize = 0;

    // First break up the records into chunks that kinesis will accept
    this._records.forEach(rec => {
      if (chunks[c].chunkSize + rec.size > MAX_RECORD_SIZE || chunks[c].records.length === KINESIS_BATCH_SIZE) {
        chunks[++c] = {chunkSize: 0, records: []};
      }
      totalSize += rec.size;
      chunks[c].chunkSize += rec.size;
      chunks[c].records.push(rec);
    });
    this._statsum.count('auditlog.chunks', c+1);
    this._statsum.count('auditlog.size', totalSize);
    debug(`Audit log contained ${this._records.length} records with size of ${totalSize} bytes in ${c+1} chunks`);
    this._records = [];

    // Now submit the chunks
    let start = process.hrtime();
    await Promise.map(chunks, async chunk => {
      let {records} = chunk;
      let res;
      try {
        let krecords = records.map(line => {
          return {Data: line.line, PartitionKey: AUDITLOG_PARTITION_KEY};
        });
        res = await this._kinesis.putRecords({
          StreamName: this._logName,
          Records: krecords,
        }).promise();
      } catch (err) {
        if (!err.statusCode) {
          throw err;
        } else if (!err.retryable) {
          // We screwed up somehow and we should not attempt to resubmit these lines
          if (this._reportErrors) {
            this.emit('error', err);
          }
          return;
        }
        // If this was a server-side error, we'll queue these records back up
        // and try to submit them again
        records.forEach(record => {
          debug('Failed to write record ' + JSON.stringify(record) + '. Reason: ' + err.ErrorMessage);
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
        });
      }

      if (this._records.length) {
        this._scheduleFlush();
      }
    });
    let d = process.hrtime(start);
    this._statsum.measure('auditlog.report', d[0] * 1000 + d[1] / 1000000);
  }
}

class NoopLog extends events.EventEmitter {

  async setup() {
  }

  log(record) {
    console.log(record);
  }

  async flush() {
  }
}

module.exports = {NoopLog, KinesisLog};
