describe('options parsing', function() {
  var assert = require('assert');
  var subject = require('./defaults');

  it('should not parse objects but return them', function() {
    var input = {};
    assert.equal(
      subject(input),
      input
    );
  });

  it('should parse $IP:PORT', function() {
    assert.deepEqual(
      subject('127.0.0.1:4243'),
      { host: 'http://127.0.0.1', port: 4243 }
    );
  });

  it('should parse /var/socket/foo', function() {
    assert.deepEqual(
      subject('/var/socket/foo'),
      { socketPath: '/var/socket/foo' }
    );
  });

  it('it should coerce tcp:// protocol to http', function() {
    assert.deepEqual(
      // linking docker nodes will give you this kind of thing
      subject('tcp://127.0.0.1:4243'),
      { host: 'http://127.0.0.1', port: 4243 }
    );
  });
});

