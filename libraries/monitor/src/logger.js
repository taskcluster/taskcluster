const os = require('os');
const assert = require('assert');
const stringify = require('fast-json-stable-stringify');

const LEVELS = {
  emerg: 0,
  alert: 1,
  crit: 2,
  err: 3,
  warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
};

const LEVELS_REVERSE = [
  'EMERGENCY',
  'ALERT',
  'CRITICAL',
  'ERROR',
  'WARNING',
  'NOTICE',
  'INFO',
  'DEBUG',
];

const ELIDED = new Set([
  'credentials',
  'accessToken',
  'password',
  'secretAccessKey',
  'secret',
  'secrets',
  'bewit',
]);

/*
 * We will never allow certain keys to be logged, no matter what the
 * actual value is. If a user wishes to log something with these names,
 * they should pick another one. This is not 100% safety but it does give
 * a bit of a nice fuzzy blanket.
 */
const elideSecrets = fields => {
  if (!fields) {
    // Do nothing
  } else if (Array.isArray(fields)) {
    fields.forEach(elideSecrets);
  } else if (fields.constructor === Object) { // Only plain objects, not strings, etc.
    Object.entries(fields).forEach(([key, val]) => {
      if (ELIDED.has(key)) {
        fields[key] = '...';
      } else {
        elideSecrets(val);
      }
    });
  }
};

/*
 * Implements the mozlog standard as defined in
 * https://wiki.mozilla.org/Firefox/Services/Logging
 *
 * We can consider supporting extra logging standards
 * later if we want.
 */
class Logger {
  constructor({
    name,
    service,
    level,
    destination = process.stdout,
    metadata = null,
    taskclusterVersion = undefined,
  }) {
    assert(name, 'Must specify Logger name.');

    this.name = name;
    this.service = service;
    this.destination = destination;
    this.pid = process.pid;
    this.hostname = os.hostname();
    this.taskclusterVersion = taskclusterVersion;

    if (metadata.traceId) {
      this.traceId = metadata.traceId;
      delete metadata.traceId;
    }
    if (metadata.requestId) {
      this.requestId = metadata.requestId;
      delete metadata.requestId;
    }
    this.metadata = null;
    if (Object.keys(metadata).length > 0) {
      this.metadata = metadata;
    }

    level = level.trim().toLowerCase();
    assert(LEVELS[level] !== undefined, `Error levels must correspond to syslog severity levels. ${level} is invalid.`);
    this.level = LEVELS[level];
  }

  _log(level, type, fields) {
    if (level > this.level) {
      return;
    }

    if (fields === undefined) {
      fields = type;
      type = 'monitor.generic';
    }
    if (Array.isArray(fields)) {
      fields = {values: fields};
    }
    if (typeof fields === 'string' || typeof fields === 'number') {
      fields = {message: fields.toString()};
    }

    if (fields === null || typeof fields === 'boolean') {
      level = LEVELS['err'];
      const origType = type;
      type = 'monitor.loggingError',
      fields = {
        error: 'Invalid field to be logged.',
        origType,
        orig: fields,
      };
    }
    if (fields.meta !== undefined) {
      level = LEVELS['err'];
      const origType = type;
      type = 'monitor.loggingError',
      fields = {
        error: 'You may not set meta fields on logs directly.',
        origType,
        orig: fields,
      };
    }

    elideSecrets(fields);

    if (this.metadata) {
      // include metadata, but prefer a value from fields if set in both places
      fields = {...this.metadata, fields};
    }

    // determine a top-level message for the log entry..
    let message;
    // if we have a stack, then we need to format it for StackDriver:
    // exactly one line of message, followed by the "   at" lines of
    // the stack
    if (fields.stack) {
      // capture just the first line of message and the stack frames:
      message = fields.stack
        .replace(/^([^\n]*)(?:\n[^\n]*)*?((?:\n {4}at[^\n]+)+)$/s, '$1$2');
    } else if (fields.message) {
      // include only the first line of a non-stack-bearing message
      message = fields.message.toString().split('\n', 1)[0];
    }

    let traceId = this.traceId;
    if (fields.traceId) {
      traceId = fields.traceId;
      delete fields.traceId;
    }

    let requestId = this.requestId;
    if (fields.requestId) {
      requestId = fields.requestId;
      delete fields.requestId;
    }

    this.destination.write(stringify({
      Timestamp: Date.now() * 1000000,
      Type: type,
      Logger: this.name,
      Hostname: this.hostname,
      EnvVersion: '2.0',
      Severity: level,
      Pid: this.pid,
      Fields: fields,
      message, // will be omitted if undefined
      traceId, // will be omitted if undefined
      requestId, // will be omitted if undefined
      severity: LEVELS_REVERSE[level], // for stackdriver
      serviceContext: { // for stackdriver
        service: this.service,
        version: this.taskclusterVersion,
      },
    }) + '\n');
  }

  emerg(type, fields) {
    this._log(LEVELS['emerg'], type, fields);
  }

  alert(type, fields) {
    this._log(LEVELS['alert'], type, fields);
  }

  crit(type, fields) {
    this._log(LEVELS['crit'], type, fields);
  }

  err(type, fields) {
    this._log(LEVELS['err'], type, fields);
  }

  warning(type, fields) {
    this._log(LEVELS['warning'], type, fields);
  }

  notice(type, fields) {
    this._log(LEVELS['notice'], type, fields);
  }

  info(type, fields) {
    this._log(LEVELS['info'], type, fields);
  }

  debug(type, fields) {
    this._log(LEVELS['debug'], type, fields);
  }
}

module.exports = {Logger, LEVELS};
