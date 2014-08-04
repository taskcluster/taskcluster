var api     = require('./v1');
var debug   = require('debug')('queue:routes:resources');
var _       = require('lodash');
var assert  = require('assert');
var Promise = require('promise');

// Common schema prefix
var SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/queue/v1/';


/** Post artifact */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/artifacts/:name(*)',
  name:       'createArtifact',
  scopes: [
    [
      'queue:create-artifact:<name>',
      'assume:worker-id:<workerGroup>/<workerId>'
    ]
  ],
  deferAuth:  true,
  input:      SCHEMA_PREFIX_CONST + 'post-artifact-request.json',
  output:     SCHEMA_PREFIX_CONST + 'post-artifact-response.json',
  title:      "Create Artifact",
  description: [
    "TODO: document this method"
  ].join('\n')
}, function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);
  var name   = req.params.name;

  var input  = req.body;

  // Find expiration date
  var expires = new Date(input.expires);

  // Validate expires it is in the future
  var past = new Date();
  past.setMinutes(past.getMinutes() - 15);
  if (expires < past) {
    return res.json(400, {
      message:  "Expires must be in the future",
      error: {
        now:      new Date().toJSON(),
        expires:  expires.toJSON()
      }
    });
  }

  return ctx.Task.load(taskId).then(function(task) {
    // if no task is found, we return 404
    if (!task || !task.runs[runId]) {
      return res.json(404, {
        message:  "Task not found or already resolved"
      });
    }

    var workerGroup = task.runs[runId].workerGroup;
    var workerId    = task.runs[runId].workerId;

    // Authenticate request by providing parameters
    if(!req.satisfies({
      workerGroup:  workerGroup,
      workerId:     workerId,
      name:         name
    })) {
      return;
    }

    // Create details for the artifact, depending on `kind`
    var details = _.pick(input, 'kind', 'contentType');
    // Create return value
    var reply = null;

    if (input.kind === 's3') {
      var prefix = [taskId, runId, name].join('/');
      // Create details
      details.bucket    = ctx.artifactBucket.bucket;
      details.prefix    = prefix;
      // Give 20 minutes to execute the signed URL
      var urlExpiration = new Date();
      urlExpiration.setMinutes(urlExpiration.getMinutes() + 20);
      // Create reply
      reply = ctx.artifactBucket.createPutUrl(prefix, {
        contentType:    input.contentType,
        expires:        20 * 60 + 10 // Add 10 sec for clock skrew
      }).then(function(putUrl) {
        // Return reply
        return {
          kind:         's3',
          contentType:  input.contentType,
          expires:      urlExpiration.toJSON(),
          putUrl:       putUrl
        };
      });

    } else if (input.kind === 'azure') {
      var path = [taskId, runId, name].join('/');
      // Create details
      details.container = ctx.artifactStore.container;
      details.path      = path;
      // Give 30 minutes before the signature expires
      var writeExpiration = new Date();
      writeExpiration.setMinutes(writeExpiration.getMinutes() + 30);
      // Generate SAS
      var putUrl = ctx.artifactStore.generateWriteSAS(path, {
        expiry:       writeExpiration
      });
      // Create reply
      reply = Promise.resolve({
        kind:         'azure',
        contentType:  input.contentType,
        expires:      writeExpiration.toJSON(),
        putUrl:       putUrl
      });

    } else if (input.kind === 'redirect') {
      details.url       = input.url;
      reply = Promise.resolve({
        kind:         'redirect'
      });

    } else if (input.kind === 'error') {
      details.reason    = input.reason;
      details.message   = input.message;
      reply = Promise.resolve({
        kind:         'error'
      });

    } else {
      debug("ERROR: Unknown kind %s", input.kind);
      assert(false, "Unknown kind should be handle by JSON schema validation");
    }

    // Create artifact (and load if it exists)
    return ctx.Artifact.create({
      taskId:       taskId,
      runId:        runId,
      name:         name,
      version:      1,
      kind:         input.kind,
      details:      details,
      expires:      expires,
      contentType:  input.contentType || ''
    }).catch(function(err) {
      if (!err || err.code !== 'EntityAlreadyExists') {
        throw err;
      }
      // Load artifact if it exists
      return ctx.Artifact.load(taskId, runId, name);
    }).then(function(artifact) {
      // Check that it is created as we expected it
      // Just, in case it already existed and we're retrying the
      // request, this allows the operation to be idempotent
      if (artifact.version !== 1 ||
          artifact.kind    !== input.kind ||
          artifact.expires > expires ||
          !_.isEqual(artifact.details, details)) {
        return res.json(409, {
          message:  "Artifact already exists with other properties"
        });
      }

      // Wait for the reply promise to resolve and return it
      return reply.then(function(retval) {
        return res.reply(retval);
      });
    });
  });
});

/** Reply to an artifact request using taskId, runId, name and context */
var replyWithArtifact = function(taskId, runId, name, res) {
  var ctx = this;

  // Load artifact meta-data from table storage
  return ctx.Artifact.load(taskId, runId, name).then(function(artifact) {
    // Handle S3 artifacts
    if(artifact.kind === 's3') {
      // Find prefix
      var prefix = [taskId, runId, name].join('/');
      return ctx.artifactBucket.createGetUrl(prefix, {
        expires:      20 * 60
      }).then(function(url) {
        return res.redirect(303, url);
      });
    }

    // Handle azure artifacts
    if(artifact.kind === 'azure') {
      // Find path
      var path = [taskId, runId, name].join('/');
      // Generate URL expiration time
      var expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 20);
      // Create and redirect to signed URL
      return res.redirect(303, ctx.artifactStore.createSignedGetUrl(path, {
        expiry:   expiry
      }));
    }

    // Handle redirect artifacts
    if (artifact.kind === 'redirect') {
      return res.redirect(303, artifact.details.url);
    }

    // Handle error artifacts
    if (artifact.kind === 'error') {
      return res.json(403, {
        reason:     artifact.details.reason,
        message:    artifact.details.message
      });
    }

    // We should never arrive here
    assert(false, "Unknown artifact kind from table storage: %s", artifact.kind);
  }, function(err) {
    // In case we failed to load the artifact, we check it's because it was
    // missing

    // Catch error if it's a resource not found error
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }
    // Give a 404
    return res.json(404, {
      message:  "Artifact not found or declared as error"
    });
  });
};

/** Get artifact from run */
api.declare({
  method:     'get',
  route:      '/task/:taskId/runs/:runId/artifacts/:name(*)',
  name:       'getArtifactFromRun',
  scopes: [
    'queue:get-artifact:<name>'
  ],
  deferAuth:  true,
  title:      "Get Artifact from Run",
  description: [
    "TODO: document this method"
  ].join('\n')
}, function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);
  var name   = req.params.name;

  // Check if this artifact is in the public/ folder, or require request
  // to be authenticated by providing parameters
  if(!/^public\//.test(name) && !req.satisfies({
    name:         name
  })) {
    return;
  }

  return replyWithArtifact.call(ctx, taskId, runId, name, res);
});

/** Get latest artifact from task */
api.declare({
  method:     'get',
  route:      '/task/:taskId/artifacts/:name(*)',
  name:       'getLatestArtifact',
  scopes: [
    'queue:get-artifact:<name>'
  ],
  deferAuth:  true,
  title:      "Get Artifact from Latest Run",
  description: [
    "TODO: document this method"
  ].join('\n')
}, function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId = req.params.taskId;
  var name   = req.params.name;

  // Check if this artifact is in the public/ folder, or require request
  // to be authenticated by providing parameterss
  if(!/^public\//.test(name) && !req.satisfies({
    name:         name
  })) {
    return;
  }

  // Try to load task status structure from database
  return ctx.Task.load(taskId).then(function(task) {
    if (!task) {
      // Try to load status from blob storage
      return ctx.taskstore.get(
        taskId + '/status.json',
        true    // Return null if doesn't exists
      ).then(function(taskData) {
        if (taskData) {
          return ctx.Task.deserialize(taskData);
        }
      });
    }
    return task;
  }).then(function(task) {
    // Give a 404 if not found
    if (!task) {
      return res.json(404, {
        message:  "Task not found"
      });
    }

    // Check that we have runs
    if (task.runs.length === 0) {
      return res.json(404, {
        message:  "Task doesn't have any runs"
      });
    }

    // Find highest runId
    var runId = _.last(task.runs).runId;

    // Reply
    return replyWithArtifact.call(ctx, taskId, runId, name, res);
  });
});


/** Reply to a list artifact request */
var replyWithArtifacts = function(taskId, runId, res) {
  var ctx = this;
  return ctx.Artifact.list(taskId, runId).then(function(artifacts) {
    // Extra artifacts as JSON
    var artifactsAsJSON = artifacts.map(function(artifact) {
      // Handle S3 artifacts
      if (artifact.kind === 's3') {
        return {
          kind:         's3',
          name:         artifact.name,
          expires:      artifact.expires.toJSON(),
          contentType:  artifact.details.contentType
        };
      }

      // Handle azure artifacts
      if (artifact.kind === 'azure') {
        return {
          kind:         'azure',
          name:         artifact.name,
          expires:      artifact.expires.toJSON(),
          contentType:  artifact.details.contentType
        };
      }

      // Handle redirect artifacts
      if (artifact.kind === 'redirect') {
        return {
          kind:         'redirect',
          name:         artifact.name,
          expires:      artifact.expires.toJSON(),
          contentType:  artifact.details.contentType
          // Note, we cannot expose the url to which this artifact will redirect
          // here, as this will be a security concern. Especially, if someone
          // decides to rely on secret URLs for security
        };
      }

      // Handle error artifacts
      if (artifact.kind === 'error') {
        return {
          kind:         'error',
          name:         artifact.name,
          expires:      artifact.expires.toJSON()
          // Note, we cannot expose message or reason here as would be a
          // security concern.
        };
      }

      // We should never arrive here
      assert(false, "Unknown artifact kind: %s", artifact.kind);
    });
    // Reply with artifacts as extracted above
    res.reply({
      artifacts: artifactsAsJSON
    });
  });
};


/** Get artifacts from run */
api.declare({
  method:     'get',
  route:      '/task/:taskId/runs/:runId/artifacts',
  name:       'getArtifactsFromRun',
  title:      "Get Artifacts from Run",
  description: [
    "TODO: document this method"
  ].join('\n')
}, function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var ctx = this;

  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);
  // TODO: Add support querying using kind and prefix
  //var kind   = req.body.kind;
  //var prefix = req.body.prefix;

  return replyWithArtifacts.call(ctx, taskId, runId, res);
});


/** Get latest artifacts from task */
api.declare({
  method:     'get',
  route:      '/task/:taskId/artifacts',
  name:       'getLatestArtifacts',
  title:      "Get Artifacts from Latest Run",
  description: [
    "TODO: document this method"
  ].join('\n')
}, function(req ,res) {
  var ctx = this;

  var taskId = req.params.taskId;

  // Try to load task status structure from database
  return ctx.Task.load(taskId).then(function(task) {
    if (!task) {
      // Try to load status from blob storage
      return ctx.taskstore.get(
        taskId + '/status.json',
        true    // Return null if doesn't exists
      ).then(function(taskData) {
        if (taskData) {
          return ctx.Task.deserialize(taskData);
        }
      });
    }
    return task;
  }).then(function(task) {
    // Give a 404 if not found
    if (!task) {
      return res.json(404, {
        message:  "Task not found"
      });
    }

    // Check that we have runs
    if (task.runs.length === 0) {
      return res.json(404, {
        message:  "Task doesn't have any runs"
      });
    }

    // Find highest runId
    var runId = _.last(task.runs).runId;

    // Reply
    return replyWithArtifacts.call(ctx, taskId, runId, res);
  });
});
