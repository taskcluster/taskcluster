var createServer = require('http').createServer;
var addHawk = require('../');
var superagent = require('superagent');
var request = addHawk(superagent);
var hawk = require('hawk');
var test = require('tap').test;

var credential = require('./fixtures/credential.json');

function getBewit (url, credential) {
  return hawk.client.getBewit(url, {
    credentials: credential,
    ttlSec: 2
  });
}

function getCred (id, callback) {
  if (id === 'dh37fgj492je')
    return callback(null, credential);
  else
    return callback('credential not found', false);
}

var server = createServer(function (req, res) {
  hawk.server.authenticateBewit(req, getCred, {}, function (err, credentials, attributes) {
    res.writeHead(!err ? 200 : 401, {
      'Content-Type': 'text/plain'
    });
    res.end(!err ? 'Hello ' + credentials.user : 'Shoosh!');
  });
});

var bewit;
test('create a bewit', function (t) {
  bewit = getBewit('http://localhost:8080', credential);
  t.equal(typeof bewit, 'string', 'bewit is a string');
  t.ok(bewit.length > 0, 'with a positive length');
  t.end();
});

test('server starts', function (t) {
  server.listen(8080, function () {
    t.end();
  });
});

test('credential works', function (t) {
  request
    .get('http://localhost:8080')
    .bewit(bewit)
    .end(function (res) {
      t.equal(res.statusCode, 200, 'Responded 200');
      t.equal(res.text, 'Hello Steve', 'knows who I am');
      t.end();
    });
});

test('wrong bewit won\'t work', function (t) {
  request
    .get('http://localhost:8080')
    .bewit(bewit+'should_not_be_here')
    .end(function (res) {
      t.equal(res.statusCode, 401, 'Responded 401');
      t.equal(res.text, 'Shoosh!', 'Not authenticated');
      t.end();
    });
});

test('an expired bewit won\'t work', function (t) {
  setTimeout(function () {
    request
      .get('http://localhost:8080')
      .bewit(bewit)
      .end(function (res) {
        t.equal(res.statusCode, 401, 'Responded 401');
        t.equal(res.text, 'Shoosh!', 'Not authenticated');
        t.end();
      });
  }, 2000);
});

test('server ends', function (t) {
  server.close();
  t.end();
});