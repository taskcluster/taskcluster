var createServer = require('http').createServer;
var addHawk = require('../');
var superagent = require('superagent');
var request = addHawk(superagent);
var hawk = require('hawk');
var test = require('tap').test;

var credential = require('./fixtures/credential.json');

function getCred (id, callback) {
  if (id === 'dh37fgj492je')
    return callback(null, credential);
  else
    return callback('credential not found', false);
}

var server = createServer(function (req, res) {
  hawk.server.authenticate(req, getCred, {}, function (err, credentials, attributes) {
    res.writeHead(!err ? 200 : 401, {
      'Content-Type': 'text/plain'
    });
    res.end(!err ? 'Hello ' + credentials.user : 'Shoosh!');
  });
});

test('server starts', function (t) {
  server.listen(8080, function () {
    t.end();
  });
});

test('credential works', function (t) {
  request
    .get('http://localhost:8080')
    .hawk(credential)
    .end(function (res) {
      t.equal(res.statusCode, 200, 'Responded 200');
      t.equal(res.text, 'Hello Steve', 'knows who I am');
      t.end();
    });
});

test('wrong id is not found', function (t) {
  credential.id = 'notInTheDB';

  request
    .get('http://localhost:8080')
    .hawk(credential)
    .end(function (res) {
      t.equal(401, res.statusCode, 'Responded 401');
      t.equal(res.text, 'Shoosh!', 'Not authenticated');
      t.end();
    });
});

test('wrong key won\'t work', function (t) {
  credential.key = 'wrong key';

  request
    .get('http://localhost:8080')
    .hawk(credential)
    .end(function (res) {
      t.equal(res.statusCode, 401, 'Responded 401');
      t.equal(res.text, 'Shoosh!', 'Not authenticated');
      t.end();
    });
});

test('server ends', function (t) {
  server.close();
  t.end();
});