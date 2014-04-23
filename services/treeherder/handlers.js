var Project   = require('mozilla-treeherder/project');
var scheduler = require('taskcluster-client').scheduler;
var queue     = require('taskcluster-client').queue;
var request   = require('superagent-promise');
var nconf     = require('nconf');
var Promise   = require('promise');
var _         = require('lodash');
var debug     = require('debug')('handlers');

var handlers = {};

// Mapping from branches to mozilla-treeherder Project object
var branches = {};

// Load branches
nconf.get('treeherder:branches').split(' ').forEach(function(branch) {
  branches[branch] = new Project(branch, {
    consumerKey:          nconf.get('treeherder:consumerKey'),
    consumerSecret:       nconf.get('treeherder:consumerSecret')
  });
});

debug("Loaded with branches: ", _.keys(branches));

// TODO:
//  - Listen for task-pending (and report rerun, if this is the case)
//    - Need way to know if new run is rerun or retry
//  - Fix things in treeherder so we can report a task running if it's rerun
//    after being reported completed

/**
 * Handle message for the `queue/v1/task-running` exchange.
 * by
 */
handlers['queue/v1/task-running'] = function(message) {
  var taskGraphId = message.status.routing.split('.')[1];
  var taskId      = message.status.taskId;

  // Fetch taskGraph info and post job info update
  return Promise.all(
    scheduler.getTaskGraphInfo(taskGraphId),
    request
      .get('http://tasks.taskcluster.net/' + taskId + '/task.json')
      .end().then(function(res) {
        if (!res.ok) throw new Error(res.text);
        return res.body;
      })
  ).then(function(values) {
    var taskGraphInfo = values.shift();
    var task          = values.shift();
    var project = branches[taskGraphInfo.tags.treeherderRepository];
    if (!project) {
      debug("No project for %s", taskGraphInfo.tags.treeherderRepository);
      return;
    }
    var job = {
      project:                taskGraphInfo.tags.treeherderRepository,
      revision_hash:          taskGraphId,
      job: {
        job_guid:             taskId,
        build_platform: {
            platform:         task.workerType,
            os_name:          '-',
            architecture:     '-'
        },
        machine_platform: {
            platform:         task.workerType,
            os_name:          '-',
            architecture:     '-'
        },
        //machine:              "taskcluster:workerId",
        name:                 task.metadata.name,
        reason:               'scheduled',
        job_symbol:           task.tags.treeherderSymbol,
        group_name:           task.tags.treeherderGroupName,
        group_symbol:         task.tags.treeherderGroupSymbol,
        product_name:         task.tags.treeherderProductName,
        submit_timestamp:     (new Date(task.created)).getTime(),
        start_timestamp:      undefined,
        end_timestamp:        undefined,
        state:                'running',
        result:               'unknown',
        who:                  task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        }
      }
    };
    debug("postJobs-data-running", job);
    return project.postJobs([job]);
  });
};

/**
 * Handle message for the `queue/v1/task-completed` exchange.
 * by
 */
handlers['queue/v1/task-completed'] = function(message) {
  var taskGraphId = message.status.routing.split('.')[1];
  var taskId      = message.status.taskId;

  // Fetch taskGraph info and post job info update
  return Promise.all(
    scheduler.getTaskGraphInfo(taskGraphId),
    request
      .get('http://tasks.taskcluster.net/' + taskId + '/task.json')
      .end().then(function(res) {
        if (!res.ok) throw new Error(res.text);
        return res.body;
      }),
    request
      .get(message.logsUrl)
      .end().then(function(res) {
      if (!res.ok) throw new Error('Unable to load logs.json from:' + taskId);
      return res.body.logs;
    }),
    request
      .get(message.resultUrl)
      .end().then(function(res) {
      if (!res.ok) throw new Error('Unable to load result.json from:' + taskId);
      return res.body;
    })
  ).then(function(values) {
    var taskGraphInfo = values.shift();
    var task          = values.shift();
    var logs          = values.shift();
    var result        = values.shift();
    var project = branches[taskGraphInfo.tags.treeherderRepository];
    if (!project) {
      debug("No project for %s", taskGraphInfo.tags.treeherderRepository);
      return;
    }
    var job = {
      project:                taskGraphInfo.tags.treeherderRepository,
      revision_hash:          taskGraphId,
      job: {
        job_guid:             taskId,
        build_platform: {
            platform:         task.workerType,
            os_name:          '-',
            architecture:     '-'
        },
        machine_platform: {
            platform:         task.workerType,
            os_name:          '-',
            architecture:     '-'
        },
        //machine:              "taskcluster:workerId",
        name:                 task.metadata.name,
        reason:               'scheduled',
        job_symbol:           task.tags.treeherderSymbol,
        group_name:           task.tags.treeherderGroupName,
        group_symbol:         task.tags.treeherderGroupSymbol,
        product_name:         task.tags.treeherderProductName,
        submit_timestamp:     (new Date(task.created)).getTime(),
        start_timestamp:      (new Date(result.statistics.started)).getTime(),
        end_timestamp:        (new Date(result.statistics.finished)).getTime(),
        state:                'completed',
        result:               (message.success ? 'success' : 'testfailed'),
        who:                  task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        },
        log_references: _.keys(logs).map(function(logName) {
          return {
            name: logName,
            url:  logs[logName]
          };
        })
      }
    };
    debug("postJobs-data-completed", job);
    return project.postJobs([job]);
  });
};

/**
 * Handle message for the `queue/v1/task-failed` exchange.
 * by
 */
handlers['queue/v1/task-failed'] = function(message) {
  var taskGraphId = message.status.routing.split('.')[1];
  var taskId      = message.status.taskId;

  // Fetch taskGraph info and post job info update
  return Promise.all(
    scheduler.getTaskGraphInfo(taskGraphId),
    request
      .get('http://tasks.taskcluster.net/' + taskId + '/task.json')
      .end().then(function(res) {
        if (!res.ok) throw new Error(res.text);
        return res.body;
      })
  ).then(function(values) {
    var taskGraphInfo = values.shift();
    var task          = values.shift();
    var project = branches[taskGraphInfo.tags.treeherderRepository];
    if (!project) {
      debug("No project for %s", taskGraphInfo.tags.treeherderRepository);
      return;
    }
    var job = {
      project:                taskGraphInfo.tags.treeherderRepository,
      revision_hash:          taskGraphId,
      job: {
        job_guid:             taskId,
        build_platform: {
            platform:         task.workerType,
            os_name:          '-',
            architecture:     '-'
        },
        machine_platform: {
            platform:         task.workerType,
            os_name:          '-',
            architecture:     '-'
        },
        //machine:              "taskcluster:workerId",
        name:                 task.metadata.name,
        reason:               'scheduled',
        job_symbol:           task.tags.treeherderSymbol,
        group_name:           task.tags.treeherderGroupName,
        group_symbol:         task.tags.treeherderGroupSymbol,
        product_name:         task.tags.treeherderProductName,
        submit_timestamp:     (new Date(task.created)).getTime(),
        start_timestamp:      (new Date(task.created)).getTime(),
        end_timestamp:        (new Date()).getTime(),
        state:                'completed',
        result:               'exception',
        who:                  task.metadata.owner,
        // You _must_ pass option collection until
        // https://github.com/mozilla/treeherder-service/issues/112
        option_collection: {
          opt:    true
        }
      }
    };
    debug("postJobs-data-failed", job);
    return project.postJobs([job]);
  });
};


/**
 * Handle message for the `scheduler/v1/task-graph-running` exchange.
 * by creating the appropriate resultset and posting all jobs
 */
handlers['scheduler/v1/task-graph-running'] = function(message) {
  // Find taskGraphId
  var taskGraphId = message.status.taskGraphId;

  // InspectTaskGraph
  var task_graph_inspection = scheduler.inspectTaskGraph(taskGraphId);

  // Post resultset for the task-graph
  var taskGraph = null;
  var project   = null;
  var resultset_created = task_graph_inspection.then(function(taskGraph_) {
    // Store taskGraph information for later use
    taskGraph = taskGraph_;

    // Find project
    project = branches[taskGraph.tags.treeherderRepository];
    if (!project) {
      debug("No project for %s", taskGraph.tags.treeherderRepository);
      return;
    }

    var resultset = {
      revision_hash:          taskGraphId,
      author:                 taskGraph.metadata.owner,
      push_timestamp:         (new Date()).getTime(),
      type:                   'push',
      revisions: [{
        comment:              taskGraph.tags.treeherderComment,
        files:                [],
        revision:             taskGraph.tags.treeherderRevision,
        repository:           taskGraph.tags.treeherderRepository,
        author:               taskGraph.metadata.owner
      }]
    };
    debug("postResultset-data", jobs);

    // Post result set
    return project.postResultset([resultset]);
  });

  // Post jobs
  return resultset_created.then(function() {
    return Promise.all(_.keys(taskGraph.tasks).map(function(taskLabel) {
      var taskInfo = taskGraph.tasks[taskLabel];
      return request
      .get(taskInfo.taskUrl)
      .end()
      .then(function(res) {
        if (!res.ok) {
          throw new Error('Failed to load task: ' + taskInfo.taskId);
        }
        var task = res.body;
        return {
          project:                taskGraph.tags.treeherderRepository,
          revision_hash:          taskGraphId,
          job: {
            job_guid:             taskInfo.taskId,
            build_platform: {
                platform:         task.workerType,
                os_name:          '-',
                architecture:     '-'
            },
            machine_platform: {
                platform:         task.workerType,
                os_name:          '-',
                architecture:     '-'
            },
            //machine:              "taskcluster:workerId",
            name:                 task.metadata.name,
            reason:               'scheduled',
            job_symbol:           task.tags.treeherderSymbol,
            group_name:           task.tags.treeherderGroupName,
            group_symbol:         task.tags.treeherderGroupSymbol,
            product_name:         task.tags.treeherderProductName,
            submit_timestamp:     (new Date(task.created)).getTime(),
            start_timestamp:      undefined,
            end_timestamp:        undefined,
            state:                'pending',
            result:               'unknown',
            who:                  task.metadata.owner,
            artifact: {
              type:               "json",
              name:               "Job Info",
              blob: {
                tinderbox_printlines: [
                  "task inspector link: http://docs.taskcluster.net/tools/task-inspector/#" + taskInfo.taskId,
                  "task-graph inspector link: http://docs.taskcluster.net/tools/task-graph-inspector/#" + taskGraphId
                ]
              }
            },
            // You _must_ pass option collection until
            // https://github.com/mozilla/treeherder-service/issues/112
            option_collection: {
              opt:    true
            }
          }
        };
      });
    })).then(function(jobs) {
      if (!project) {
        debug("No project for %s", taskGraph.tags.treeherderRepository);
        return;
      }
      debug("postJobs-data-create", jobs);
      return project.postJobs(jobs);
    });
  })

  return resultset_created;
};

module.exports = handlers;