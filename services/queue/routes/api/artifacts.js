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
    "This API end-point creates an artifact for a specific run of a task. This",
    "should **only** be used by a worker currently operating on this task, or",
    "from a process running within the task (ie. on the worker).",
    "",
    "All artifacts must specify when they `expires`, the queue will",
    "automatically take care of deleting artifacts past their",
    "expiration point. This features makes it feasible to upload large",
    "intermediate artifacts from data processing applications, as the",
    "artifacts can be set to expire a few days later.",
    "",
    "We currently support 4 different `storageType`s, each storage type have",
    "slightly different features and in some cases difference semantics.",
    "",
    "**S3 artifacts**, is useful for static files which will be stored on S3.",
    "When creating an S3 artifact is create the queue will return a pre-signed",
    "URL to which you can do a `PUT` request to upload your artifact. Note",
    "that `PUT` request **must** specify the `content-length` header and",
    "**must** give the `content-type` header the same value as in the request",
    "to `createArtifact`.",
    "",
    "**Azure artifacts**, are stored in _Azure Blob Storage_ service, which",
    "given the consistency guarantees and API interface offered by Azure is",
    "more suitable for artifacts that will be modified during the execution",
    "of the task. For example docker-worker has a feature that persists the",
    "task log to Azure Blob Storage every few seconds creating a somewhat",
    "live log. A request to create an Azure artifact will return a URL",
    "featuring a [Shared-Access-Signature]" +
    "(http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),",
    "refer to MSDN for further information on how to use these.",
    "",
    "**Reference artifacts**, only consists of meta-data which the queue will",
    "store for you. These artifacts really only have a `url` property and",
    "when the artifact is requested the client will be redirect the URL",
    "provided with a `303` (See Other) redirect. Please note that we cannot",
    "delete artifacts you upload to other service, we can only delete the",
    "reference to the artifact, when it expires.",
    "",
    "**Error artifacts**, only consists of meta-data which the queue will",
    "store for you. These artifacts are only meant to indicate that you the",
    "worker or the task failed to generate a specific artifact, that you",
    "would otherwise have uploaded. For example docker-worker will upload an",
    "error artifact, if the file it was supposed to upload doesn't exists or",
    "turns out to be a directory. Clients requesting an error artifact will",
    "get a `403` (Forbidden) response. This is mainly designed to ensure that",
    "dependent tasks can distinguish between artifacts that were suppose to",
    "be generated and artifacts for which the name is misspelled.",
    "",
    "**Artifact immutability**, generally speaking you cannot overwrite an",
    "artifact when created. But if you repeat the request with the same",
    "properties the request will succeed as the operation is idempotent.",
    "This is useful if you need to refresh a signed URL while uploading.",
    "Do not abuse this to overwrite artifacts created by another entity!",
    "Such as worker-host overwriting artifact created by worker-code.",
    "",
    "As a special case the `url` property on _reference artifacts_ can be",
    "updated. You should only use this to update the `url` property for",
    "reference artifacts your process has created."
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
    return res.status(400).json({
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
      return res.status(404).json({
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

    // Create details for the artifact
    var details = {};
    // Create return value
    var reply = null;

    if (input.storageType === 's3') {
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
          storageType:  's3',
          contentType:  input.contentType,
          expires:      urlExpiration.toJSON(),
          putUrl:       putUrl
        };
      });

    } else if (input.storageType === 'azure') {
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
        storageType:  'azure',
        contentType:  input.contentType,
        expires:      writeExpiration.toJSON(),
        putUrl:       putUrl
      });

    } else if (input.storageType === 'reference') {
      details.url       = input.url;
      reply = Promise.resolve({
        storageType:  'reference'
      });

    } else if (input.storageType === 'error') {
      details.reason    = input.reason;
      details.message   = input.message;
      reply = Promise.resolve({
        storageType:  'error'
      });

    } else {
      debug("ERROR: Unknown storageType %s", input.storageType);
      assert(false, "Unknown storageType should be handle by JSON " +
                    "schema validation");
    }

    // Create artifact (and load if it exists)
    return ctx.Artifact.create({
      taskId:       taskId,
      runId:        runId,
      name:         name,
      version:      1,
      storageType:  input.storageType,
      details:      details,
      expires:      expires,
      contentType:  input.contentType || ''
    }).catch(function(err) {
      if (!err || err.code !== 'EntityAlreadyExists') {
        throw err;
      }
      // Load and update artifact if it exists
      return ctx.Artifact.load(taskId, runId, name).then(function(artifact) {
        // Update the artifact with new expires (assuming this allowed)
        return artifact.modify(function() {
          // Only modify if version, storage and expires are match
          // If they don't match a 409 will be returned later using the same
          // checks
          if (this.version === 1 &&
              this.storageType === input.storageType &&
              this.expires <= expires) {

            // Only reference artifacts can be updated
            if (this.storageType === 'reference') {
              this.details = _.defaults({}, details, this.details);
            }

            // Only update if details match, we'll handle 409 errors later with
            // what is the same test
            if (_.isEqual(this.details, details)) {
              this.expires = expires;
            }
          }
        });
      });
    }).then(function(artifact) {
      // Check that it is created as we expected it
      // Just, in case it already existed and we're retrying the
      // request, this allows the operation to be idempotent
      if (artifact.version !== 1 ||
          artifact.storageType !== input.storageType ||
          artifact.expires > expires ||
          !_.isEqual(artifact.details, details)) {
        return res.status(409).json({
          message:  "Artifact already exists with other properties"
        });
      }

      // Publish message about artifact creation
      return ctx.publisher.artifactCreated({
        status:         task.status(),
        artifact:       artifact.json(),
        workerGroup:    workerGroup,
        workerId:       workerId,
        runId:          runId
      }, task.routes).then(function() {
        // Wait for the reply promise to resolve and return it
        return reply.then(function(retval) {
          return res.reply(retval);
        });
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
    if(artifact.storageType === 's3') {
      // Find prefix
      var prefix = [taskId, runId, name].join('/');
      return ctx.artifactBucket.createGetUrl(prefix, {
        expires:      20 * 60
      }).then(function(url) {
        return res.redirect(303, url);
      });
    }

    // Handle azure artifacts
    if(artifact.storageType === 'azure') {
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
    if (artifact.storageType === 'reference') {
      return res.redirect(303, artifact.details.url);
    }

    // Handle error artifacts
    if (artifact.storageType === 'error') {
      return res.status(403).json({
        reason:     artifact.details.reason,
        message:    artifact.details.message
      });
    }

    // We should never arrive here
    assert(false, "Unknown artifact storageType from table storage: %s",
                  artifact.storageType);
  }, function(err) {
    // In case we failed to load the artifact, we check it's because it was
    // missing

    // Catch error if it's a resource not found error
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }
    // Give a 404
    return res.status(404).json({
      message:  "Artifact not found or declared as error"
    });
  });
};

/** Get artifact from run */
api.declare({
  method:     'get',
  route:      '/task/:taskId/runs/:runId/artifacts/:name(*)',
  name:       'getArtifact',
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
  name:       'getLastestArtifact',
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
      return res.status(404).json({
        message:  "Task not found"
      });
    }

    // Check that we have runs
    if (task.runs.length === 0) {
      return res.status(404).json({
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
    // Reply with artifacts as extracted above
    res.reply({
      artifacts: artifacts.map(function(artifact) {
        // Extra artifact as JSON
        return artifact.json();
      })
    });
  });
};


/** Get artifacts from run */
api.declare({
  method:     'get',
  route:      '/task/:taskId/runs/:runId/artifacts',
  name:       'listArtifacts',
  output:     SCHEMA_PREFIX_CONST + 'list-artifacts-response.json',
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
  // TODO: Add support querying using storageType and prefix
  //var storageType   = req.body.storageType;
  //var prefix = req.body.prefix;

  return replyWithArtifacts.call(ctx, taskId, runId, res);
});


/** Get latest artifacts from task */
api.declare({
  method:     'get',
  route:      '/task/:taskId/artifacts',
  name:       'listLatestArtifacts',
  output:     SCHEMA_PREFIX_CONST + 'list-artifacts-response.json',
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
      return res.status(404).json({
        message:  "Task not found"
      });
    }

    // Check that we have runs
    if (task.runs.length === 0) {
      return res.status(404).json({
        message:  "Task doesn't have any runs"
      });
    }

    // Find highest runId
    var runId = _.last(task.runs).runId;

    // Reply
    return replyWithArtifacts.call(ctx, taskId, runId, res);
  });
});
