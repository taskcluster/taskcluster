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

/*
 * Implements the mozlog standard as defined in
 * https://wiki.mozilla.org/Firefox/Services/Logging
 *
 * We can consider supporting extra logging standards
 * later if we want.
 */
class Logger {
  constructor({name, level, pretty=false, enable=true, destination=process.stdout, metadata=null}) {
    assert(name, 'Must specify Logger name.');

    this.name = name;
    this.destination = destination;
    this.pretty = pretty;
    this.enable = enable;
    this.metadata = metadata;
    this.pid = process.pid;
    this.hostname = os.hostname();

    // TODO: Do things with child-specific logging levels. perhaps this happens in index?
    assert(LEVELS[level] !== undefined, `Error levels must correspond to syslog severity levels. ${level} is invalid.`);
    this.level = LEVELS[level];
  }

  _log(level, type, fields) {
    if (!this.enable || level > this.level) {
      return;
    }

    if (fields === undefined) {
      fields = type;
      type = 'generic';
    }
    if (typeof fields === 'number') {
      fields = fields.toString();
    }
    if (typeof fields === 'string') {
      fields = {msg: fields};
    }

    if (fields.meta !== undefined) {
      level = LEVELS['alert'];
      fields = {
        err: 'You may not set meta fields on logs directly.',
        orig: fields,
      };
    }

    if (this.metadata) {
      fields.meta = this.metadata;
    }

    const event = {
      Timestamp: Date.now() * 1000000,
      Type: type,
      Logger: this.name,
      Hostname: this.hostname,
      EnvVersion: '2.0',
      Severity: level,
      Pid: this.pid,
      Fields: fields,
    };

    if (this.pretty) {
      this.destination.write(stringify(event)); // TODO: use chalk here
    } else {
      this.destination.write(stringify(event));
    }
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

module.exports = Logger;
