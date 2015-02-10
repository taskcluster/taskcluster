var api     = require('./v1');
var debug   = require('debug')('queue:routes:resources');
var _       = require('lodash');
var assert  = require('assert');
var Promise = require('promise');

// Common schema prefix
const SCHEMA_PREFIX_CONST = 'http://schemas.taskcluster.net/queue/v1/';

// Maximum number of artifacts to list
const MAX_ARTIFACTS_LISTING = 10 * 1000;

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
}, async function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var taskId      = req.params.taskId;
  var runId       = parseInt(req.params.runId);
  var name        = req.params.name;
  var input       = req.body;
  var storageType = input.storageType;
  var contentType = input.contentType || 'application/json';

  // Find expiration date
  var expires = new Date(input.expires);

  // Validate expires it is in the future
  var past = new Date();
  past.setMinutes(past.getMinutes() - 15);
  if (expires.getTime() < past.getTime()) {
    return res.status(400).json({
      message:  "Expires must be in the future",
      error: {
        now:      new Date().toJSON(),
        expires:  expires.toJSON()
      }
    });
  }

  // Load Task entity
  var task = await this.Task.load({
    taskId:       taskId
  }, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  // Check presence of the run
  var run = task.runs[runId];
  if (!run) {
    return res.status(404).json({
      message: "Run not found"
    });
  }

  // Get workerGroup and workerId
  var workerGroup = run.workerGroup;
  var workerId    = run.workerId;

  // Authenticate request by providing parameters
  if(!req.satisfies({
    workerGroup:  workerGroup,
    workerId:     workerId,
    name:         name
  })) {
    return;
  }

  // Validate expires <= task.expires
  if (expires.getTime() > task.expires.getTime()) {
    return res.status(400).json({
      messages: "Artifact expires before the task (task.expires < expires)",
      error: {
        taskExpires:      task.expires.toJSON(),
        expires:          expires.toJSON()
      }
    });
  }

  // Ensure that the run is running
  if (run.state !== 'running') {
    return res.status(409).json({
      message:    "The given is not running",
      error: {
        status:   task.status(),
        runId:    runId
      }
    });
  }

  // Construct details for different storage types
  var isPublic = /^public\//.test(name);
  var details  = {};
  if (storageType === 's3') {
    if (isPublic) {
      details.bucket  = this.publicBucket.bucket;
    } else {
      details.bucket  = this.privateBucket.bucket;
    }
    details.prefix    = [taskId, runId, name].join('/');
  }
  if (storageType === 'azure') {
    details.container = this.blobStore.container;
    details.path      = [taskId, runId, name].join('/');
  }
  if (storageType === 'reference') {
    details.url       = input.url;
  }
  if (storageType === 'error') {
    details.message   = input.message;
    details.reason    = input.reason;
  }

  try {
    var artifact = await this.Artifact.create({
      taskId:           taskId,
      runId:            runId,
      name:             name,
      storageType:      storageType,
      contentType:      contentType,
      details:          details,
      expires:          expires
    });
  }
  catch (err) {
    // Re-throw error if this isn't because the entity already exists
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // Load existing Artifact entity
    artifact = await this.Artifact.load({
      taskId:           taskId,
      runId:            runId,
      name:             name
    });

    // Allow recreating of the same artifact, report conflict if it's not the
    // same artifact (allow for later expiration).
    // Note, we'll check `details` later
    if (artifact.storageType !== storageType ||
        artifact.contentType !== contentType ||
        artifact.expires.getTime() > expires.getTime()) {
      return res.status(409).json({
        message:  "Artifact already exists, with different type or " +
                  " later expiration"
      });
    }

    // Check that details match, unless this has storageType 'reference', we'll
    // workers to overwrite redirect artifacts
    if (storageType !== 'reference' &&
        !_.isEqual(artifact.details, details)) {
      return res.status(409).json({
        message:  "Artifact already exists with different contentType or " +
                  "error message"
      });
    }

    // Update expiration and detail, which may have been modified
    await artifact.modify((artifact) => {
      artifact.expires = expires;
      artifact.details = details;
    });
  }

  // Publish message about artifact creation
  await this.publisher.artifactCreated({
    status:         task.status(),
    artifact:       artifact.json(),
    workerGroup:    workerGroup,
    workerId:       workerId,
    runId:          runId
  }, task.routes);

  // Reply with signed S3 URL
  if (artifact.storageType === 's3') {
    var expiry = new Date(new Date().getTime() + 30 * 60 * 1000);
    var bucket = null;
    if (artifact.details.bucket === this.publicBucket.bucket) {
      bucket = this.publicBucket;
    }
    if (artifact.details.bucket === this.privateBucket.bucket) {
      bucket = this.privateBucket;
    }
    // Create put URL
    var putUrl = await this.privateBucket.createPutUrl(
      artifact.details.prefix, {
      contentType:      artifact.contentType,
      expires:          30 * 60 + 10 // Add 10 sec for clock drift
    });
    return res.reply({
      storageType:  's3',
      contentType:  artifact.contentType,
      expires:      expiry.toJSON(),
      putUrl:       putUrl
    });
  }

  // Reply with SAS for azure
  if (artifact.storageType === 'azure') {
    var expiry = new Date(new Date().getTime() + 30 * 60 * 1000);
    // Generate SAS
    var putUrl = this.blobStore.generateWriteSAS(
      artifact.details.path, {
      expiry:         expiry
    });
    return res.reply({
      storageType:  'azure',
      contentType:  artifact.contentType,
      expires:      expiry.toJSON(),
      putUrl:       putUrl
    });
  }

  // For 'reference' and 'error' the response is simple
  return res.reply({
    storageType:    storageType
  });
});

/** Reply to an artifact request using taskId, runId, name and context */
var replyWithArtifact = async function(taskId, runId, name, res) {
  // Load artifact meta-data from table storage
  var artifact = await this.Artifact.load({
    taskId:     taskId,
    runId:      runId,
    name:       name
  }, true);

  // Give a 404, if the artifact couldn't be loaded
  if (!artifact) {
    return res.status(404).json({
      message:  "Artifact not found"
    });
  }

  // Handle S3 artifacts
  if(artifact.storageType === 's3') {
    // Find url
    var url = null;
    var prefix = artifact.details.prefix;
    if (artifact.details.bucket === this.publicBucket.bucket) {
      url = this.publicBucket.createGetUrl(prefix);
    }
    if (artifact.details.bucket === this.privateBucket.bucket) {
      url = await this.privateBucket.createSignedGetUrl(prefix, {
        expires:    30 * 60
      });
    }
    assert(url, "Url should have been constructed!");
    return res.redirect(303, url);
  }

  // Handle azure artifacts
  if(artifact.storageType === 'azure') {
    if (artifact.details.container !== this.blobStore.container) {
      debug("[alert-operator], Unknown container: %s, for artifact: %j",
            artifact.details.container, artifact.json());
    }
    // Generate URL expiration time
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 30);
    // Create and redirect to signed URL
    return res.redirect(303, this.blobStore.createSignedGetUrl(
      artifact.details.path, {
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
  debug("[alert-operator] Unknown artifact storageType from table storage: %s",
        artifact.storageType);
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
    "Get artifact by `<name>` from a specific run.",
    "",
    "**Public Artifacts**, in-order to get an artifact you need the scope",
    "`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.",
    "But if the artifact `name` starts with `public/`, authentication and",
    "authorization is not necessary to fetch the artifact.",
    "",
    "**API Clients**, this method will redirect you to the artifact, if it is",
    "stored externally. Either way, the response may not be JSON. So API",
    "client users might want to generate a signed URL for this end-point and",
    "use that URL with a normal HTTP client."
  ].join('\n')
}, async function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

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

  return replyWithArtifact.call(this, taskId, runId, name, res);
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
    "Get artifact by `<name>` from the last run of a task.",
    "",
    "**Public Artifacts**, in-order to get an artifact you need the scope",
    "`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.",
    "But if the artifact `name` starts with `public/`, authentication and",
    "authorization is not necessary to fetch the artifact.",
    "",
    "**API Clients**, this method will redirect you to the artifact, if it is",
    "stored externally. Either way, the response may not be JSON. So API",
    "client users might want to generate a signed URL for this end-point and",
    "use that URL with a normal HTTP client.",
    "",
    "**Remark**, this end-point is slightly slower than",
    "`queue.getArtifact`, so consider that if you already know the `runId` of",
    "the latest run. Otherwise, just us the most convenient API end-point."
  ].join('\n')
}, async function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var taskId = req.params.taskId;
  var name   = req.params.name;

  // Check if this artifact is in the public/ folder, or require request
  // to be authenticated by providing parameterss
  if(!/^public\//.test(name) && !req.satisfies({
    name:         name
  })) {
    return;
  }

  // Load task status structure from table
  var task = await this.Task.load({taskId: taskId}, true);

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
  var runId = task.runs.length - 1;

  // Reply
  return replyWithArtifact.call(this, taskId, runId, name, res);
});


/** Get artifacts from run */
api.declare({
  method:     'get',
  route:      '/task/:taskId/runs/:runId/artifacts',
  name:       'listArtifacts',
  output:     SCHEMA_PREFIX_CONST + 'list-artifacts-response.json',
  title:      "Get Artifacts from Run",
  description: [
    "Returns a list of artifacts and associated meta-data for a given run."
  ].join('\n')
}, async function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId);
  // TODO: Add support querying using prefix

  // Warning: this doesn't employ continuation token and may take a while if
  // someone uploads more than MAX_ARTIFACTS_LISTING artifacts. We'll cut it
  // short at MAX_ARTIFACTS_LISTING tasks and return an error
  var artifacts = [];
  await this.Artifact.query({
    taskId: taskId,
    runId:  runId
  }, {
    handler:    (artifact) => {
      assert(artifacts.length <= MAX_ARTIFACTS_LISTING,
             "Won't list more than MAX_ARTIFACTS_LISTING artifacts");
      artifacts.push(artifact.json());
    }
  });

  // Refuse to list artifacts if there is more than MAX_ARTIFACTS_LISTING
  if (artifacts.length > MAX_ARTIFACTS_LISTING) {
    return res.status(412).json({
      message:    "Won't list artifacts for task with " +
                  MAX_ARTIFACTS_LISTING + " artifacts!"
    });
  }

  return res.reply({
    artifacts:      artifacts
  });
});


/** Get latest artifacts from task */
api.declare({
  method:     'get',
  route:      '/task/:taskId/artifacts',
  name:       'listLatestArtifacts',
  output:     SCHEMA_PREFIX_CONST + 'list-artifacts-response.json',
  title:      "Get Artifacts from Latest Run",
  description: [
    "Returns a list of artifacts and associated meta-data for the latest run",
    "from the given task."
  ].join('\n')
}, async function(req ,res) {
  // Validate parameters
  if (!api.checkParams(req, res)) {
    return;
  }

  var taskId = req.params.taskId;
  // TODO: Add support querying using prefix

  // Load task status structure from table
  var task = await this.Task.load({taskId: taskId}, true);

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
  var runId = task.runs.length - 1;

  // Warning: this doesn't employ continuation token and may take a while if
  // someone uploads more than MAX_ARTIFACTS_LISTING artifacts. We'll cut it
  // short at MAX_ARTIFACTS_LISTING tasks and return an error
  var artifacts = [];
  await this.Artifact.query({
    taskId: taskId,
    runId:  runId
  }, {
    handler:    (artifact) => {
      assert(artifacts.length <= MAX_ARTIFACTS_LISTING,
             "Won't list more than MAX_ARTIFACTS_LISTING artifacts");
      artifacts.push(artifact.json());
    }
  });

  // Refuse to list artifacts if there is more than MAX_ARTIFACTS_LISTING
  if (artifacts.length > MAX_ARTIFACTS_LISTING) {
    return res.status(412).json({
      message:    "Won't list artifacts for task with " +
                  MAX_ARTIFACTS_LISTING + " artifacts!"
    });
  }

  return res.reply({
    artifacts:      artifacts
  });
});
