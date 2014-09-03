suite("config", function() {
  var assert  = require('assert');
  var base    = require('../');

  test("defaults", function() {
    var cfg = base.config({
      defaults: {test: {value: 42}}
    });

    assert(cfg.get('test:value') == 42);
  });

  test("profile", function() {
    var cfg = base.config({
      defaults: {test: {value: 41}},
      profile:  {test: {value: 42}}
    });

    assert(cfg.get('test:value') == 42);
  });

  test("env", function() {
    // Set environment variable
    process.env.test_value = '41';

    var cfg = base.config({
      defaults: {test: {value: 42}},
      envs: [
        'test_value'
      ]
    });

    assert(cfg.get('test:value') == '41');
    assert(cfg.get('HOME') == undefined);
  });

  test("fallback from env", function() {
    // Ensure that environment variable isn't set
    delete process.env.test_value;

    var cfg = base.config({
      defaults: {test: {value: 42}},
      envs: [
        'test_value'
      ]
    });

    assert(cfg.get('test:value') == 42);
  });

  test("filename", function() {
    var cfg = base.config({
      filename: 'test/taskcluster-base-test'
    });
    assert(cfg.get('test') == "ok it works", "Failed to load from file");
  });
});

