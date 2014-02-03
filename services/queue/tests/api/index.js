var nconf     = require('nconf');
var Promise   = require('promise');
var server    = require('../../server');
var events    = require('../../queue/events');
var debug     = require('debug')('tests:api');
var request   = require('request');

var _server = null;

/** Setup server.js */
exports.setUp = function(callback)  {
  debug("Launching server");
  server.launch().then(function(server) {
    _server = server;
    debug("Server is running");
    callback();
  });
}

/** Close server application */
exports.tearDown = function(callback) {
  debug("Closing server");
  _server.close(function() {
    debug("Server closed");
    events.disconnect().then(callback);
  });
}

/** Test message publication */
exports['POST new task to 0.2.0/task/new'] = function(test) {
  test.expect(1);

  // Create datetime for created and deadline as 3 days later
  var created = new Date();
  var deadline = new Date();
  deadline.setDate(created.getDate() + 3);

  // Post request to server
  debug("Posting task/new to server");
  request({
    method: 'POST',
    url:    'http://' + nconf.get('server:hostname') + ':' +
            nconf.get('server:port') + '/0.2.0/task/new',
    json:   {
      version:          '0.2.0',
      provisioner_id:   'jonasfj-provisioner',
      worker_type:      'my-ami',
      routing:          'jonasfj-test.what-a-hack',
      retries:          5,
      priority:         1,
      created:          created.toJSON(),
      deadline:         deadline.toJSON(),
      payload:          {},
      metadata: {
        name:           "Unit testing task",
        description:    "Task created during unit tests",
        owner:          'jonsafj@mozilla.com',
        maintainer:     'jonsafj@mozilla.com'
      },
      tags: {
        purpose:        'taskcluster-testing'
      }
    }
  }, function(err, response, body) {
    debug("Server replied: %j", body);
    test.equal(response.statusCode, 200, "Request failed");
    test.done();
  });
};

/** Test message publication */
exports['POST invalid task to 0.2.0/task/new'] = function(test) {
  test.expect(1);

  // Create datetime for created and deadline as 3 days later
  var created = new Date();
  var deadline = new Date();
  deadline.setDate(created.getDate() + 3);

  // Post request to server
  debug("Posting task/new to server");
  request({
    method: 'POST',
    url:    'http://' + nconf.get('server:hostname') + ':' +
            nconf.get('server:port') + '/0.2.0/task/new',
    json:   {
      version:          '0.0.0',
      provisioner_id:   'jonasfj-provisioner',
      worker_type:      'my-ami',
      routing:          'jonasfj-test.what-a-hack',
      retries:          5,
      priority:         1,
      created:          created.toJSON(),
      deadline:         deadline.toJSON(),
      payload:          {},
      metadata: {
        name:           "Unit testing task",
        description:    "Task created during unit tests",
        owner:          'jonsafj@mozilla.com',
        maintainer:     'jonsafj@mozilla.com'
      },
      tags: {
        purpose:        'taskcluster-testing'
      }
    }
  }, function(err, response, body) {
    debug("Server replied: %j", body);
    test.notEqual(response.statusCode, 200, "Request didn't fail as expected");
    test.done();
  });
};