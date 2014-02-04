var server        = require('../../server'); // include for configuration
var data          = require('../../queue/data');
var debug         = require('debug')('tests:queue:data');

/** Setup server.js */
exports.setUp = function(callback)  {
  debug("Setting up database");
  data.setupDatabase().then(function(server) {
    debug("Connected to configured database");
    callback();
  });
}

/** Close server application */
exports.tearDown = function(callback) {
  debug("Closing database connection");
  data.disconnect();
  callback();
}


exports.testSetup = function(test) {
  test.expect(1);
  test.ok(true);
  test.done();
};




