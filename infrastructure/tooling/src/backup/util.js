const through = require('through');

exports.fail = msg => {
  console.error(msg);
  process.exit(1);
};

exports.parseResource = rsrc => {
  const match = /([^\/]*)\/(.*)/.exec(rsrc);
  if (!match) {
    throw new Error(`Invalid resource name ${rsrc}`);
  }
  const type = match[1];
  const name = match[2];
  return [type, name];
};

// --- copied from event-stream (MIT license), with eslint fixes applied ---
//
// parse
//
// must be used after es.split() to ensure that each chunk represents a line
// source.pipe(es.split()).pipe(es.parse())
exports.parse = function (options) {
  const emitError = !!(options ? options.error : false);
  return through(function (data) {
    let obj;
    try {
      if (data) { //ignore empty lines
        obj = JSON.parse(data.toString());
      }
    } catch (err) {
      if (emitError) {
        return this.emit('error', err);
      }
      return console.error(err, 'attempting to parse:', data);
    }
    //ignore lines that where only whitespace.
    if (obj !== undefined) {
      this.emit('data', obj);
    }
  });
};
//  --- end copy ---
