const assert = require('assert');
const helper = require('./helper');
const {Provider} = require('../src/providers/provider');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {

  let oldnow;
  setup(function() {
    oldnow = Date.now;
    Date.now = () => 100;
  });
  teardown(function() {
    Date.now = oldnow;
  });

  test('no lifecycle', async function() {
    assert.equal(null, Provider.interpretLifecycle({}).terminateAfter);
  });

  test('empty lifecycle', async function() {
    assert.equal(null, Provider.interpretLifecycle({lifecycle: {}}).terminateAfter);
  });

  test('only registrationTimeout', async function() {
    assert.equal(10100, Provider.interpretLifecycle({lifecycle: {registrationTimeout: 10}}).terminateAfter);
  });

  test('only reregisterTimeout', async function() {
    assert.equal(10100, Provider.interpretLifecycle({lifecycle: {reregisterTimeout: 10}}).terminateAfter);
  });

  test('greater registrationTimeout', async function() {
    assert.equal(10100, Provider.interpretLifecycle({lifecycle: {
      registrationTimeout: 100,
      reregisterTimeout: 10,
    }}).terminateAfter);
  });

  test('greater reregisterTimeout', async function() {
    assert.equal(10100, Provider.interpretLifecycle({lifecycle: {
      registrationTimeout: 10,
      reregisterTimeout: 100,
    }}).terminateAfter);
  });

});
