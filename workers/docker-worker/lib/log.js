import util from 'util';

/**
Creates a json (newline delimited) logger.

@param {Object} details fields sent in every log call.
*/
export function createLogger(details) {
  return function(type, values) {
    var logObject = { type: type };
    for (var key in details) logObject[key] = details[key];
    if (values) {
      for (var key in values) logObject[key] = values[key];
    }
    process.stdout.write(JSON.stringify(logObject) + '\n');
  }
}

export function fmtLog() {
  let args = Array.prototype.slice.call(arguments);
  return '[taskcluster] ' + util.format.apply(this, args) + '\r\n';
}

export function fmtErrorLog() {
  let args = Array.prototype.slice.call(arguments);
  return '[taskcluster:error] ' + util.format.apply(this, args) + '\r\n';
}
