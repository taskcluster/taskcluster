suite("Ping test", function() {
  var debug       = require('debug')('test:api:ping');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var helper      = require('./helper')();

  test("ping (async)", async () => {
    await helper.queue.ping();
  });
});