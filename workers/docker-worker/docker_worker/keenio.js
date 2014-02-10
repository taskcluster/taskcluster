var KeenIO = require('keen.io');
var Promise = require('promise');
var ProxyPromise = require('proxied-promise-object');

// Configure instance. Only projectId and writeKey are required to send data.
var keen = KeenIO.configure({
  projectId: process.env.KEENIO_PROJECT_ID,
  writeKey: process.env.KEENIO_WRITE_KEY,
  readKey: process.env.KEENIO_READ_KEY,
  masterKey: process.env.KEENIO_READ_KEY
});

module.exports = new ProxyPromise(Promise, keen);
