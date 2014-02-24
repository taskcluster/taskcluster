var KeenIO = require('keen.io');
var Promise = require('promise');
var ProxyPromise = require('proxied-promise-object');

// Warn if KEENIO_PROJECT_ID credentials is missing from environment, but don't
// die on it... it's quiet useful to not need them for development
if (process.env.KEENIO_PROJECT_ID === undefined) {
  console.log("keen.io credentials is missing from environment variables!");
  module.exports = {addEvent: function() {
    return Promise.from(undefined);
  }};
} else {
  // Configure instance. Only projectId and writeKey are required to send data.
  var keen = KeenIO.configure({
    projectId:  process.env.KEENIO_PROJECT_ID,
    writeKey:   process.env.KEENIO_WRITE_KEY,
    readKey:    process.env.KEENIO_READ_KEY,
    masterKey:  process.env.KEENIO_READ_KEY
  });

  module.exports = new ProxyPromise(Promise, keen);
}

