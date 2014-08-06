/**
Creates a json (newline delimited) logger.

@param {Object} details fields sent in every log call.
*/
function createLogger(details) {
  return function(type, values) {
    var logObject = { type: type };
    for (var key in details) logObject[key] = details[key];
    if (values) {
      for (var key in values) logObject[key] = values[key];
    }
    process.stdout.write(JSON.stringify(logObject) + '\n');
  }
}

module.exports = createLogger;
