describe('defaults test', function() {
  var defaults = require('./');
  var assert = require('assert');

  // ensure DOCKER_HOST is not defined
  delete process.env.DOCKER_HOST;
  afterEach(function() {
    // and make sure none of the tests leak it either
    delete process.env.DOCKER_HOST;
  });

  it('should not overide options if given', function() {
    var input = { host: 'x' };
    assert.deepEqual(
      defaults(input),
      input
    );
  });

  it('should try to detect DOCKER_HOST', function() {
    process.env.DOCKER_HOST = '127.0.0.1:4243';
    assert.deepEqual(
      // null should convert into a real value
      defaults(null),
      { host: 'http://127.0.0.1', port: 4243 }
    );
  });

  it('should fallback to socket path', function() {
    assert.deepEqual(
      // null should convert into a real value
      defaults(),
      { socketPath: '/var/run/docker.sock' }
    );
  });
});
