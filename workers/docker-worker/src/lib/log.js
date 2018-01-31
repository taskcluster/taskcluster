const util = require('util');

module.exports = {
  /**
  Creates a json (newline delimited) logger.

  @param {Object} details fields sent in every log call.
  */
  createLogger(details) {
    return function(type, values) {
      var logObject = { type: type };
      for (let key in details) logObject[key] = details[key];
      if (values) {
        for (let key in values) logObject[key] = values[key];
      }
      process.stdout.write(JSON.stringify(logObject) + '\n');
    };
  },

  fmtLog() {
    let args = Array.prototype.slice.call(arguments);
    let ts = new Date().toISOString().replace('T', ' ');
    return '[taskcluster ' + ts + '] ' + util.format.apply(this, args) + '\n';
  },

  fmtErrorLog() {
    let args = Array.prototype.slice.call(arguments);
    // always include a newline before this string, so that it is at the beginning of the line
    // where treeherder expects it, even if the last output was not newline-terminated
    return '\n[taskcluster:error] ' + util.format.apply(this, args) + '\n';
  }
};
