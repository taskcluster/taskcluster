suite("API", function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('index:test:api_test');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var subject     = helper.setup({title: "api test"});

  // Create expiration
  var expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 25);

  test('insert (and rank)', function() {
    var myns    = slugid.v4();
    var taskId  = slugid.v4();
    var taskId2  = slugid.v4();
    return subject.index.insert(myns + '.my-task', {
      taskId:     taskId,
      rank:       41,
      data:       {hello: "world"},
      expires:    expiry.toJSON()
    }).then(function() {
      return subject.index.find(myns + '.my-task').then(function(result) {
        assert(result.taskId === taskId, "Wrong taskId");
      });
    }).then(function() {
      return subject.index.insert(myns + '.my-task', {
        taskId:     taskId2,
        rank:       42,
        data:       {hello: "world - again"},
        expires:    expiry.toJSON()
      });
    }).then(function() {
      return subject.index.find(myns + '.my-task').then(function(result) {
        assert(result.taskId === taskId2, "Wrong taskId");
      });
    });
  });
});


