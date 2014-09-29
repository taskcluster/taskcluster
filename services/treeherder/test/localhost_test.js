suite('localhost', function() {
  var base        = require('taskcluster-base');
  var debug       = require('debug')('test:localhost');
  var taskcluster = require('taskcluster-client');
  var helper      = require('./helper');
  var request     = require('superagent-promise');
  var urljoin     = require('url-join');
  var Project     = require('mozilla-treeherder/project');
  var _           = require('lodash');
  var slugid      = require('slugid');
  var assert      = require('assert');
  var subject     = helper.setup({title: "localhost"});

  test('submit', function() {
    // it can take upwards 10 min to launch a worker
    this.timeout(10 * 60 * 1000);

    // Create treeherder project wrapper
    var projects = JSON.parse(subject.projects);
    var project = new Project('try', {
      consumerKey:          projects['try'].consumer_key,
      consumerSecret:       projects['try'].consumer_secret,
      baseUrl:              subject.treeherderBaseUrl
    });

    // Create revision and revision hash for treeherder
    var revisionHash = slugid.decode(slugid.v4());
    var revision     = slugid.decode(slugid.v4());


    // Post result set (this is normally done some where else)
    var postedResultSet = project.postResultset([{
      revision_hash:          revisionHash,
      author:                 "jonasfj@mozilla.com",
      push_timestamp:         Math.floor(new Date().getTime() / 1000),
      type:                   'push',
      revisions: [{
        comment:              "test of taskcluster-treeherder integration",
        files:                [],
        revision:             revision,
        repository:           "try",
        author:               "jonasfj@mozilla.com"
      }]
    }]);

    // Create a promise that the task we're about to make is completed
    var taskId = slugid.v4();
    var taskCompleted = subject.listenFor(subject.queueEvents.taskCompleted({
      taskId:     taskId
    }));

    // Useful info for local debugging...
    debug("revision for lookup in treeherder: %s", revision);
    debug("taskId for lookup in inspector: %s", taskId);

    // Create task
    var taskCreated = postedResultSet.then(function() {
      return subject.queue.createTask(taskId, {
        provisionerId:  "aws-provisioner",
        workerType:     "v2",
        created:        new Date().toJSON(),
        deadline:       new Date(new Date().getTime() + 60 * 60 * 1000).toJSON(),
        routes: [
          [subject.routePrefix, 'try', revisionHash].join('.')
        ],
        payload: {
          image:        "quay.io/mozilla/ubuntu:13.10",
          command: [
            "/bin/bash",
            "-c",
            "echo \"hi world\"; sleep 10; echo \"done\";"
          ],
          maxRunTime: 600
        },
        metadata: {
          name:         "Example Task",
          description:  "Markdown description of **what** this task does",
          owner:        "jonasfj@mozilla.com",
          source:       "http://docs.taskcluster.net/tools/task-creator/"
        },
        extra: {
          treeherder: {
            symbol:         "S",
            groupName:      "MyGroupName",
            groupSymbol:    "G",
            productName:    "MyProductName"
          }
        }
      });
    });

    // Wait for task to be completed
    var taskCompletionHandled = taskCreated.then(function() {
      return taskCompleted.then(function() {
        // Make sure the taskcluster-treeherder handler had time to report
        // the task completetion to treeherder
        return helper.sleep(5000);
      });
    });

    // Check that the task was actually reported
    return taskCompletionHandled.then(function() {
      return request
        .get(urljoin(subject.treeherderBaseUrl, 'project/try/resultset/'))
        .query({
          count:          10,
          format:         'json',
          full:           'true',
          revision_hash:  revisionHash,
          with_jobs:      'true'
        })
        .end()
        .then(function(res) {
          assert(res.ok, "Request should work");
          assert(res.body.results.length === 1, "Expected one result");
        });
    });
  });
});