suite("API (context)", function() {
  var base            = require('taskcluster-base');
  var subject         = require('../../');
  var assert          = require('assert');
  var Promise         = require('promise');
  var request         = require('superagent-promise');
  var slugid          = require('slugid');

  test("Provides context", function() {
    // Create test api
    var api = new base.API({
      title:        "Test Api",
      description:  "Another test api"
    });

    api.declare({
      method:   'get',
      route:    '/context/',
      name:     'getContext',
      title:    "Test End-Point",
      description:  "Place we can call to test something",
    }, function(req, res) {
      res.status(200).json({myProp: this.myProp});
    });

    var value = slugid.v4();
    return base.validator().then(function(validator) {
      var router = api.router({
        validator:  validator,
        context: {
          myProp: value
        }
      });

      var app = base.app({
        port:       60872,
        env:        'development',
        forceSSL:   false,
        trustProxy: false,
      });

      app.use('/v1', router);

      return app.createServer();
    }).then(function(server) {

      return request
        .get('http://localhost:60872/v1/context')
        .end()
        .then(function(res) {
          assert(res.body.myProp === value);
        }).then(function () {
          return server.terminate();
        }, function(err) {
          return server.terminate().then(function() {
            throw err;
          });
        });
    });
  });

  test("Context properties can be required", function() {
    // Create test api
    var api = new base.API({
      title:        "Test Api",
      description:  "Another test api",
      context:      ['prop1', 'prop2']
    });

    var value = slugid.v4();
    return base.validator().then(function(validator) {
      try {
        api.router({
          validator:  validator,
          context: {
            prop1: "value1"
          }
        });
      } catch (err) {
        return; // expected error
      }
      assert(false, "Expected an error!");
    });
  });

  test("Context properties can provided", function() {
    // Create test api
    var api = new base.API({
      title:        "Test Api",
      description:  "Another test api",
      context:      ['prop1', 'prop2']
    });

    var value = slugid.v4();
    return base.validator().then(function(validator) {
      api.router({
        validator:  validator,
        context: {
          prop1: "value1",
          prop2: "value2"
        }
      });
    });
  });
});
