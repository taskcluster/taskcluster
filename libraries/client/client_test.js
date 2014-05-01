var queue = require('./client').queue;

exports.test_getAMQPConnectionString = function(test) {
  test.expect(1);
  queue.getAMQPConnectionString().then(function(result) {
    test.ok(result.url);
    test.done();
  }).catch(function() {
    test.ok(false);
    test.done();
  });
};

exports.test_getAMQPConnectionString = function(test) {
  test.expect(1);
  queue.getAMQPConnectionString().then(function(result) {
    test.ok(result.url);
    test.done();
  }).catch(function() {
    test.ok(false);
    test.done();
  });
};