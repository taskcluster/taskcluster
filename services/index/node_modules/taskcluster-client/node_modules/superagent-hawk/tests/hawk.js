var createServer = require('http').createServer;
var addHawk = require('../');
var supertest = addHawk(require('supertest'));
var hawk = require('hawk');
var test = require('tap').test;
var extend = require('../lib/extend');

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

test('credential works', function (t) {
  supertest(server)
    .get('/')
    .hawk(credential)
    .expect(200)
    .expect('Content-Type', /plain/)
    .end(function (err, res) {
      t.notOk(err, 'error is empty: ' + err);
      t.ok(res, 'response received');
      t.end();
    });
});

test('wrong id not found', function (t) {
  supertest(server)
    .get('/')
    .hawk(extend({}, credential, { id: 'notInTheDB' }))
    .expect(401)
    .expect('Content-Type', /plain/)
    .end(function (err, res) {
      t.notOk(err, 'error is empty: ' + err);
      t.end();
    });
});

test('supertest wrong key won\'t work', function (t) {
  supertest(server)
    .get('/')
    .hawk(extend({}, credential, { key: 'invalid key' }))
    .expect(401)
    .expect('Content-Type', /plain/)
    .end(function (err, res) {
      t.notOk(err, 'error is empty: ' + err);
      t.end();
    });
});

test('unref let\'s the this exit', function (t) {
  server.unref();
  t.end();
});
