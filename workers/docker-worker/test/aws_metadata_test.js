var app = require('./aws_metadata');
var co = require('co');
var http = require('http');
var request = require('superagent-promise');
var assert = require('assert');

suite('aws mock server', function() {

  var server, url;
  setup(function(done) {
    server = http.createServer(app.callback());
    server.listen(function () {
      url = 'http://localhost:' + server.address().port;
      done();
    })
  });

  teardown(function(done) {
    server.close(done);
  });

  function verify(path, expected) {
    test(path, co(function* () {
      var response = yield request.get(url + path).end();
      assert.equal(response.text, expected);
    }));
  }

  verify('/meta-data/ami-id', 'ami-333333');
  verify('/meta-data/instance-type', 'c3.xlarge');
  verify('/meta-data/placement/availability-zone', 'us-west-2');
  verify('/meta-data/instance-id', 'i-123456');

  test('user-data', co(function* () {
    var response = yield request.get(url + '/user-data').buffer(true).end();
    var body = JSON.parse(response.text);
    assert.deepEqual(body, { capacity: 1 });
  }));
});
