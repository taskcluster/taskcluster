require('mocha')

suite('API', function() {
  var _           = require('lodash');
  var assume      = require('assume');
  var debug       = require('debug')('test:api');
  var helper      = require('./helper');

  helper.setup();

  suite("ping", function() {
    test("pings", async () => {
      await helper.login.ping();
    });
  });
});

