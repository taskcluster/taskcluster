let debug   = require('debug')('app:artifacts');
let _       = require('lodash');
let assert  = require('assert');
let Promise = require('promise');
let API     = require('taskcluster-lib-api');
let urllib  = require('url');
let crypto  = require('crypto');
let api     = require('./api');

/** Post artifact */
api.declare({
  method:     'post',
  route:      '/task/:taskId/runs/:runId/artifacts/:name(*)',
  name:       'createArtifact',
  stability:  API.stability.stable,
  scopes: [
    [
      'queue:create-artifact:<name>',
      'assume:worker-id:<workerGroup>/<workerId>',
    ], [
      'queue:create-artifact:<taskId>/<runId>',
    ],
  ],
  deferAuth:  true,
  input:      'post-artifact-request.json#',
  output:     'post-artifact-response.json#',
  title:      'Create Artifact',
  description: [
    'This API end-point creates an artifact for a specific run of a task. This',
    'should **only** be used by a worker currently operating on this task, or',
    'from a process running within the task (ie. on the worker).',
    '',
    'All artifacts must specify when they `expires`, the queue will',
    'automatically take care of deleting artifacts past their',
    'expiration point. This features makes it feasible to upload large',
    'intermediate artifacts from data processing applications, as the',
    'artifacts can be set to expire a few days later.',
    '',
    'We currently support 3 different `storageType`s, each storage type have',
    'slightly different features and in some cases difference semantics.',
    'We also have 2 deprecated `storageType`s which are only maintained for',
    'backwards compatiability and should not be used in new implementations',
    '',
    '**Blob artifacts**, are useful for storing large files.  Currently, these',
    'are all stored in S3 but there are facilities for adding support for other',
    'backends in futre.  A call for this type of artifact must provide information',
    'about the file which will be uploaded.  This includes sha256 sums and sizes.',
    'This method will return a list of general form HTTP requests which are signed',
    'by AWS S3 credentials managed by the Queue.  Once these requests are completed',
    'the list of `ETag` values returned by the requests must be passed to the',
    'queue `completeArtifact` method',
    '',
    '**S3 artifacts**, DEPRECATED is useful for static files which will be',
    'stored on S3. When creating an S3 artifact the queue will return a',
    'pre-signed URL to which you can do a `PUT` request to upload your',
    'artifact. Note that `PUT` request **must** specify the `content-length`',
    'header and **must** give the `content-type` header the same value as in',
    'the request to `createArtifact`.',
    '',
    '**Azure artifacts**, DEPRECATED are stored in _Azure Blob Storage_ service',
    'which given the consistency guarantees and API interface offered by Azure',
    'is more suitable for artifacts that will be modified during the execution',
    'of the task. For example docker-worker has a feature that persists the',
    'task log to Azure Blob Storage every few seconds creating a somewhat',
    'live log. A request to create an Azure artifact will return a URL',
    'featuring a [Shared-Access-Signature]' +
    '(http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),',
    'refer to MSDN for further information on how to use these.',
    '**Warning: azure artifact is currently an experimental feature subject',
    'to changes and data-drops.**',
    '',
    '**Reference artifacts**, only consists of meta-data which the queue will',
    'store for you. These artifacts really only have a `url` property and',
    'when the artifact is requested the client will be redirect the URL',
    'provided with a `303` (See Other) redirect. Please note that we cannot',
    'delete artifacts you upload to other service, we can only delete the',
    'reference to the artifact, when it expires.',
    '',
    '**Error artifacts**, only consists of meta-data which the queue will',
    'store for you. These artifacts are only meant to indicate that you the',
    'worker or the task failed to generate a specific artifact, that you',
    'would otherwise have uploaded. For example docker-worker will upload an',
    'error artifact, if the file it was supposed to upload doesn\'t exists or',
    'turns out to be a directory. Clients requesting an error artifact will',
    'get a `403` (Forbidden) response. This is mainly designed to ensure that',
    'dependent tasks can distinguish between artifacts that were suppose to',
    'be generated and artifacts for which the name is misspelled.',
    '',
    '**Artifact immutability**, generally speaking you cannot overwrite an',
    'artifact when created. But if you repeat the request with the same',
    'properties the request will succeed as the operation is idempotent.',
    'This is useful if you need to refresh a signed URL while uploading.',
    'Do not abuse this to overwrite artifacts created by another entity!',
    'Such as worker-host overwriting artifact created by worker-code.',
    '',
    'As a special case the `url` property on _reference artifacts_ can be',
    'updated. You should only use this to update the `url` property for',
    'reference artifacts your process has created.',
  ].join('\n'),
}, async function(req, res) {
  var taskId      = req.params.taskId;
  var runId       = parseInt(req.params.runId, 10);
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
    return res.reportError('InputError',
      'Expires must be in the future',
      {});
  }

  // Load Task entity
  var task = await this.Task.load({taskId}, true);

  // Handle cases where the task doesn't exist
  if (!task) {
    return res.reportError('InputError',
      'Task not found',
      {});
  }

  // Check presence of the run
  var run = task.runs[runId];
  if (!run) {
    return res.reportError('InputError',
      'Run not found',
      {});
  }

  // Get workerGroup and workerId
  var workerGroup = run.workerGroup;
  var workerId    = run.workerId;

  // It is possible for these to be null if the task was
  // cancelled or otherwise never claimed
  if (!workerGroup || !workerId) {
    return res.reportError('InputError',
      'Run was not claimed by a worker and so no artifacts can exist',
      {});
  }

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    runId,
    workerGroup,
    workerId,
    name,
  })) {
    return;
  }

  // Validate expires <= task.expires
  if (expires.getTime() > task.expires.getTime()) {
    return res.reportError('InputError',
      'Artifact expires ({{expires}}) after the task expiration ' +
      '{{taskExpires}} (task.expires < expires) - this is not allowed, ' +
      'artifacts may not expire after the task they belong to expires', {
        taskExpires:      task.expires.toJSON(),
        expires:          expires.toJSON(),
      });
  }

  // Ensure that the run is running
  if (run.state !== 'running') {
    var allow = false;
    if (run.state === 'exception') {
      // If task was resolved exception, we'll allow artifacts to be uploaded
      // up to 25 min past resolution. This allows us to report exception as
      // soon as we know and then upload logs if possible.
      // Useful because exception usually implies something badly wrong.
      allow = new Date(run.resolved).getTime() > Date.now() - 25 * 60 * 1000;
    }
    if (!allow) {
      return res.reportError('RequestConflict',
        'Artifacts cannot be created for a task after it is ' +
        'resolved, unless it is resolved \'exception\', and even ' +
        'in this case only up to 25 min past resolution.' +
        'This to ensure that artifacts have been uploaded before ' +
        'a task is \'completed\' and output is consumed by a ' +
        'dependent task\n\nTask status: {{status}}', {
          status:   task.status(),
        });
    }
  }

  // Construct details for different storage types
  var isPublic = /^public\//.test(name);
  var details  = {};
  let present = false;
  let uploadId;
  switch (storageType) {
    case 'blob':
      // Generate the details that we'll be using.
      details.contentLength = input.contentLength;
      details.contentSha256 = input.contentSha256;
      if (input.transferLength) {
        details.transferLength = input.transferLength;
      }
      if (input.transferSha256) {
        details.transferSha256 = input.transferSha256;
      }
      // We want to ensure, for idempotency reasons, that any following
      // requests to createArtifact() use the same set of part information.
      // Instead of storing the entire parts list in the entity, we'll instead
      // store a hash of the JSON serialized version of the list.
      //
      // Note that this means that for loaded entities we'll need to use the
      // details.partsHash field to check whether we're multipart or not
      // instead of the details.parts list
      if (input.parts) {
        let partsHash = crypto.createHash('sha256');
        for (let part of input.parts) {
          partsHash.update(`${part.sha256}:${part.size}_`);
        }
        partsHash = partsHash.digest('hex');
        details.partsHash = partsHash;
      }

      details.provider = 's3';
      details.region = this.blobRegion;
      if (input.contentEncoding) {
        details.contentEncoding = input.contentEncoding;
      }

      if (isPublic) {
        details.bucket = this.publicBlobBucket;
      } else {
        details.bucket = this.privateBlobBucket;
      }

      details.key = `${taskId}/${runId}/${name}`;
      if (input.parts) {
        uploadId = await this.s3Controller.initiateMultipartUpload({
          bucket: details.bucket,
          key: details.key,
          sha256: details.contentSha256,
          size: details.contentLength,
          transferSha256: details.transferSha256 ? details.transferSha256 : details.contentSha256,
          transferSize: details.transferLength ? details.transferLength : details.contentLength,
          metadata: {taskId, runId, name},
          contentType: contentType,
          contentEncoding: details.contentEncoding || 'identity',
        });
        debug(`Multipart Artifact init ${details.bucket}/${details.key} ${uploadId}`);
        assert(uploadId);
        details.uploadId = uploadId;
      }
      break;
    case 's3':
      present = true;
      // TODO: Once we're deprecating this artifact type, we'll throw an error
      // here
      if (isPublic) {
        details.bucket  = this.publicBucket.bucket;
      } else {
        details.bucket  = this.privateBucket.bucket;
      }
      details.prefix    = [taskId, runId, name].join('/');
      break;

    case 'azure':
      present = true;
      // TODO: Once we're deprecating this artifact type, we'll throw an error
      // here
      details.container = this.blobStore.container;
      details.path      = [taskId, runId, name].join('/');
      break;

    case 'reference':
      present = true;
      details.url       = input.url;
      break;

    case 'error':
      present = true;
      details.message   = input.message;
      details.reason    = input.reason;
      break;

    default:
      throw new Error('Unknown storageType: ' + storageType);
  }

  let artifact;
  try {
    artifact = await this.Artifact.create({
      taskId,
      runId,
      name,
      storageType,
      contentType,
      details,
      expires,
      present,
    });
  } catch (err) {
    // Re-throw error if this isn't because the entity already exists
    if (!err || err.code !== 'EntityAlreadyExists') {
      throw err;
    }

    // Load existing Artifact entity
    artifact = await this.Artifact.load({taskId, runId, name});

    // Allow recreating of the same artifact, report conflict if it's not the
    // same artifact (allow for later expiration).
    // Note, we'll check `details` later
    if (artifact.storageType !== storageType ||
        artifact.contentType !== contentType ||
        artifact.expires.getTime() > expires.getTime()) {
      return res.reportError('RequestConflict',
        'Artifact already exists, with different type or later expiration\n\n' +
        'Existing artifact information: {{originalArtifact}}', {
          originalArtifact: {
            storageType:  artifact.storageType,
            contentType:  artifact.contentType,
            expires:      artifact.expires,
          },
        });
    }

    // Check that details match, unless this has storageType 'reference', we'll
    // workers to overwrite redirect artifacts.  We handle blob artifacts
    // differently than other all the other artifacts.  We consider a second
    // creation of the same blob a non-error.  If the blob is a multipart
    // upload we need to handle an already-existing uploadId gracefully.  In
    // the case of a conflict, we will cancel the uploadId created in *this*
    // request and will eventually return requests based on the existing
    // uploadId.
    if (storageType === 'blob') {
      let storedWithoutUploadId = _.omit(artifact.details, 'uploadId');
      let inputWithoutUploadId = _.omit(details, 'uploadId');

      // The two good conditions are that the details are identical or that
      // they're multipart uploads and the uploadId is the only differing
      // attribute.  In that case, we'll cancel the uploadId we just created
      if (_.isEqual(artifact.details, details)) {
        // Do nothing!
      } else if (input.parts && _.isEqual(storedWithoutUploadId, inputWithoutUploadId)) {
        if (artifact.details.uploadId !== details.uploadId) {
          await this.s3Controller.abortMultipartUpload({
            bucket: details.bucket,
            key: details.key,
            uploadId: details.uploadId,
          });
        }
      } else {
        return res.reportError('RequestConflict',
          'Artifact already exists, with different contentType or error message\n\n' +
          'Existing artifact information: {{originalArtifact}}', {
            originalArtifact: {
              storageType:  artifact.storageType,
              contentType:  artifact.contentType,
              expires:      artifact.expires,
            },
          });
      }
    } else if (storageType !== 'reference' &&
        !_.isEqual(artifact.details, details)) {
      return res.reportError('RequestConflict',
        'Artifact already exists, with different contentType or error message\n\n' +
        'Existing artifact information: {{originalArtifact}}', {
          originalArtifact: {
            storageType:  artifact.storageType,
            contentType:  artifact.contentType,
            expires:      artifact.expires,
          },
        });
    }

    // Update expiration and detail, which may have been modified
    await artifact.modify((artifact) => {
      artifact.expires = expires;
      // NOTE: the conditional here is only because I'm unsure of all the
      // ramifications of not doing the details update for other storage types.
      // If this is OK, feel free to remove the conditional
      //
      // The problem with this for blob storage type is that it ends up
      // overwriting the UploadId that we already had stored with one that we
      // don't want.  Since nothing in details should be mutable which would be
      // stored in the createArtifact routine, we shouldn't overwrite here.  In
      // fact, doing so overwrites the valid old UploadId with the just
      // cancelled one when running an idempotent operation
      if (storageType !== 'blob') {
        artifact.details = details;
      }
    });
  }

  // This event is *invalid* for s3/azure storage types so we'll stop sending it.
  // It's only valid for error, reference and blob, but we should only send it
  // here for error and reference storageTypes
  if (artifact.storageType === 'error' || artifact.storageType === 'reference') {
    // Publish message about artifact creation
    await this.publisher.artifactCreated({
      status:         task.status(),
      artifact:       artifact.json(),
      workerGroup,
      workerId,
      runId,
    }, task.routes);
  }

  switch (artifact.storageType) {
    case 'blob':
      var expiry = new Date(new Date().getTime() + 15 * 60 * 1000);
      let requests;
      // If we're supposed to do a multipart upload, we should generate an UploadId
      // if it doesn't already exist.  We should store that ID in the entity
      if (input.parts) {
        requests = await this.s3Controller.generateMultipartRequest({
          bucket: artifact.details.bucket,
          key: artifact.details.key,
          uploadId: artifact.details.uploadId,
          parts: input.parts,
        });
      } else {
        let singlePartRequest = await this.s3Controller.generateSinglepartRequest({
          bucket: artifact.details.bucket,
          key: artifact.details.key,
          sha256: artifact.details.contentSha256,
          size: artifact.details.contentLength,
          transferSha256: artifact.details.transferSha256,
          transferSize: artifact.details.transferLength,
          metadata: {taskId, runId, name},
          tags: {taskId, runId, name},
          contentType: artifact.contentType,
          contentEncoding: artifact.details.contentEncoding || 'identity',
        });
        requests = [singlePartRequest];
      }
      res.reply({
        storageType: 'blob',
        expires: expiry.toJSON(),
        requests: requests,
      });
      break;
    case 's3':
      // Reply with signed S3 URL
      var expiry = new Date(new Date().getTime() + 30 * 60 * 1000);
      var bucket = null;
      if (artifact.details.bucket === this.publicBucket.bucket) {
        bucket = this.publicBucket;
      }
      if (artifact.details.bucket === this.privateBucket.bucket) {
        bucket = this.privateBucket;
      }
      // Create put URL
      var putUrl = await bucket.createPutUrl(
        artifact.details.prefix, {
          contentType:      artifact.contentType,
          expires:          30 * 60 + 10, // Add 10 sec for clock drift
        },
      );
      return res.reply({
        storageType:  's3',
        contentType:  artifact.contentType,
        expires:      expiry.toJSON(),
        putUrl:       putUrl,
      });

    case 'azure':
      // Reply with SAS for azure
      var expiry = new Date(new Date().getTime() + 30 * 60 * 1000);
      // Generate SAS
      var putUrl = this.blobStore.generateWriteSAS(
        artifact.details.path, {expiry},
      );
      return res.reply({
        storageType:  'azure',
        contentType:  artifact.contentType,
        expires:      expiry.toJSON(),
        putUrl,
      });

    case 'reference':
    case 'error':
      // For 'reference' and 'error' the response is simple
      return res.reply({storageType});

    default:
      throw new Error('Unknown storageType: ' + artifact.storageType);
  }
});

/** Reply to an artifact request using taskId, runId, name and context */
var replyWithArtifact = async function(taskId, runId, name, req, res) {
  // Load artifact meta-data from table storage
  let artifact = await this.Artifact.load({taskId, runId, name}, true);

  // Give a 404, if the artifact couldn't be loaded
  if (!artifact) {
    return res.reportError('ResourceNotFound', 'Artifact not found', {});
  }

  if (artifact.storageType === 'blob') {
    // Most of the time, the same base options are used.
    let getOpts = {
      bucket: artifact.details.bucket,
      key: artifact.details.key,
    };

    // TODO: We should consider doing a HEAD on all resources and verifying that
    // the ETag they have matches the one that we received when creating the artifact.
    // This is a bit of extra overhead, but it's one more check of consistency

    if (artifact.details.bucket === this.privateBlobBucket) {
      // TODO: Make sure that we can set expiration of these signed urls
      getOpts.signed = true;
      // TODO: Figure out how to set the ETag as a header on this response
      return res.redirect(303, await this.s3Controller.generateGetUrl(getOpts));
    } else if (artifact.details.bucket === this.publicBlobBucket) {
      let region = this.regionResolver.getRegion(req);

      // Let's find and figure out whether to skip caches
      let skipCacheHeader = (req.headers['x-taskcluster-skip-cache'] || '').toLowerCase();
      if (skipCacheHeader === 'true' || skipCacheHeader === '1') {
        skipCacheHeader = true;
      } else {
        skipCacheHeader = false;
      }

      let canonicalUrl = await this.s3Controller.generateGetUrl(getOpts);

      if (region === artifact.details.region || skipCacheHeader) {
        return res.redirect(303, canonicalUrl);
      } else if (!region) {
        // TODO: Change this so we munge the URL into a cloud-front URL This is
        // not part of the following else if block because this is where the
        // cloud-front smarts might end up living
        return res.redirect(303, canonicalUrl);
      } else {
        let cloudMirrorPath = [
          'v1',
          'redirect',
          's3',
          region,
          encodeURIComponent(canonicalUrl),
        ].join('/');
        return res.redirect(303, urllib.format({
          protocol: 'https:',
          host: this.cloudMirrorHost,
          pathname: cloudMirrorPath,
        }));
      }
    } else {
      throw new Error('Using a bucket we should not');
    }
  }

  // Handle S3 artifacts
  if (artifact.storageType === 's3') {
    // Find url
    var url = null;

    // First, let's figure out which region the request is coming from
    var region = this.regionResolver.getRegion(req);
    var prefix = artifact.details.prefix;
    var bucket = artifact.details.bucket;

    if (bucket === this.publicBucket.bucket) {
      let skipCacheHeader = (req.headers['x-taskcluster-skip-cache'] || '').toLowerCase();
      if (!region) {
        debug('artifact from CDN for ip: %s', req.headers['x-forwarded-for']);
        url = this.publicBucket.createGetUrl(prefix);
      } else if (skipCacheHeader === 'true' || skipCacheHeader === '1') {
        // Skip cache and go to cloud-front
        url = this.publicBucket.createGetUrl(prefix);
      } else if (this.artifactRegion === region) {
        url = this.publicBucket.createGetUrl(prefix, true);
      } else {
        var canonicalArtifactUrl = this.publicBucket.createGetUrl(prefix, true);
        // We need to build our url path appropriately.  Note that we URL
        // encode the artifact URL as required by the cloud-mirror api
        var cloudMirrorPath = [
          'v1',
          'redirect',
          's3',
          region,
          encodeURIComponent(canonicalArtifactUrl),
        ].join('/');

        // Now generate the cloud-mirror redirect
        url = urllib.format({
          protocol: 'https:',
          host: this.cloudMirrorHost,
          pathname: cloudMirrorPath,
        });

      }
    } else if (bucket === this.privateBucket.bucket) {
      url = await this.privateBucket.createSignedGetUrl(prefix, {
        expires: 30 * 60,
      });
    }
    assert(url, 'Url should have been constructed!');
    return res.redirect(303, url);
  }

  // Handle azure artifacts
  if (artifact.storageType === 'azure') {
    if (artifact.details.container !== this.blobStore.container) {
      let err = new Error('Unknown container: ' +
                          artifact.details.container + ' for artifact');
      err.artifact = artifact.json();
      await this.monitor.reportError(err);
    }
    // Generate URL expiration time
    var expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 30);
    // Create and redirect to signed URL
    return res.redirect(303, this.blobStore.createSignedGetUrl(
      artifact.details.path, {expiry},
    ));
  }

  // Handle redirect artifacts
  if (artifact.storageType === 'reference') {
    return res.redirect(303, artifact.details.url);
  }

  // Handle error artifacts
  if (artifact.storageType === 'error') {
    // The caller is not expecting an API response, so send a JSON response
    return res.status(403).json({
      reason:     artifact.details.reason,
      message:    artifact.details.message,
    });
  }

  // We should never arrive here
  let err = new Error('Unknown artifact storageType: ' + artifacts.storageType);
  err.artifact = artifact.json();
  this.monitor.reportError(err);
};

/** Complete artifact */
api.declare({
  method:     'put',
  route:      '/task/:taskId/runs/:runId/artifacts/:name(*)',
  name:       'completeArtifact',
  stability:  API.stability.experimental,
  scopes: [
    [
      'queue:create-artifact:<name>',
      'assume:worker-id:<workerGroup>/<workerId>',
    ], [
      'queue:create-artifact:<taskId>/<runId>',
    ],
  ],
  deferAuth:  true,
  input:      'put-artifact-request.json#',
  title:      'Complete Artifact',
  description: 'tbd',
}, async function(req, res) {
  let taskId      = req.params.taskId;
  let runId       = parseInt(req.params.runId, 10);
  let name        = req.params.name;
  let input       = req.body;
  let isPublic    = /^public\//.test(name);

  let [artifact, task] = await Promise.all([
    this.Artifact.load({taskId, runId, name}, true),
    this.Task.load({taskId}, true),
  ]);

  let run = task.runs[runId];
  if (!run) {
    return res.reportError('InputError',
      'Run not found',
      {});
  }
  let workerGroup = run.workerGroup;
  let workerId = run.workerId;

  // Authenticate request by providing parameters
  if (!req.satisfies({
    taskId,
    runId,
    workerGroup,
    workerId,
    name,
  })) {
    return;
  }

  // Ensure that the run is running 
  if (run.state !== 'running') { 
    var allow = false; 
    if (run.state === 'exception') { 
      // If task was resolved exception, we'll allow artifacts to be uploaded 
      // up to 25 min past resolution. This allows us to report exception as 
      // soon as we know and then upload logs if possible. 
      // Useful because exception usually implies something badly wrong. 
      allow = new Date(run.resolved).getTime() > Date.now() - 25 * 60 * 1000; 
    } 
    if (!allow) { 
      return res.reportError('RequestConflict', 
        'Artifacts cannot be completed for a task after it is ' + 
        'resolved, unless it is resolved \'exception\', and even ' + 
        'in this case only up to 25 min past resolution.' + 
        'This to ensure that artifacts have been uploaded before ' + 
        'a task is \'completed\' and output is consumed by a ' + 
        'dependent task\n\nTask status: {{status}}', { 
          status:   task.status(), 
        }); 
    } 
  } 

  if (artifact.storageType !== 'blob') {
    return res.reportError('InputError',
      'Cannot mark this artifact type as completed');
  } else if (artifact.storageType === 'blob') {
    // If the artifact is present, we've already done what's required here
    if (artifact.present) {
      await this.publisher.artifactCreated({
        status: task.status(),
        artifact: artifact.json(),
        workerGroup,
        workerId,
        runId,
      }, task.routes);
      return res.status(204).send();
    }
    let etag;
    if (artifact.details.partsHash) {
      etag = await this.s3Controller.completeMultipartUpload({
        bucket: artifact.details.bucket,
        key: artifact.details.key,
        etags: input.etags,
        uploadId: artifact.details.uploadId,
        tags: {taskId, runId, name},
      });
    } else {
      let url = await this.s3Controller.generateGetUrl({
        bucket: artifact.details.bucket,
        key: artifact.details.key,
        signed: !isPublic,
      });

      if (urllib.parse(url).protocol !== 'https:') {
        throw new Error('Only HTTPS is allowed for artifacts');
      }

      let headRes = await this.s3Runner.run({
        req:{
          url,
          method: 'HEAD',
          headers: {},
        },
      });

      if (headRes.headers['x-amz-meta-content-sha256'] !== artifact.details.contentSha256) {
        throw new Error('S3 object does not have correct Content-Sha256 metadata');
      }

      etag = input.etags[0];
    }

    await artifact.modify((artifact) => {
      artifact.details.etag = etag;
      // Now that we're finished, we don't want to store the uploadId any longer
      artifact.details = _.omit(artifact.details, 'uploadId');
      artifact.present = true;
    });

    await this.publisher.artifactCreated({
      status: task.status(),
      artifact: artifact.json(),
      workerGroup,
      workerId,
      runId,
    }, task.routes);
    return res.status(204).send();
  }
});

/** Get artifact from run */
api.declare({
  method:     'get',
  route:      '/task/:taskId/runs/:runId/artifacts/:name(*)',
  name:       'getArtifact',
  stability:  API.stability.stable,
  scopes: [
    ['queue:get-artifact:<name>'],
  ],
  deferAuth:  true,
  title:      'Get Artifact from Run',
  description: [
    'Get artifact by `<name>` from a specific run.',
    '',
    '**Public Artifacts**, in-order to get an artifact you need the scope',
    '`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.',
    'But if the artifact `name` starts with `public/`, authentication and',
    'authorization is not necessary to fetch the artifact.',
    '',
    '**API Clients**, this method will redirect you to the artifact, if it is',
    'stored externally. Either way, the response may not be JSON. So API',
    'client users might want to generate a signed URL for this end-point and',
    'use that URL with a normal HTTP client.',
    '',
    '**Caching**, artifacts may be cached in data centers closer to the',
    'workers in-order to reduce bandwidth costs. This can lead to longer',
    'response times. Caching can be skipped by setting the header',
    '`x-taskcluster-skip-cache: true`, this should only be used for resources',
    'where request volume is known to be low, and caching not useful.',
    '(This feature may be disabled in the future, use is sparingly!)',
  ].join('\n'),
}, async function(req, res) {
  var taskId = req.params.taskId;
  var runId  = parseInt(req.params.runId, 10);
  var name   = req.params.name;

  // Check if this artifact is in the public/ folder, or require request
  // to be authenticated by providing parameters
  if (!/^public\//.test(name) && !req.satisfies({name})) {
    return;
  }

  return replyWithArtifact.call(this, taskId, runId, name, req, res);
});

/** Get latest artifact from task */
api.declare({
  method:     'get',
  route:      '/task/:taskId/artifacts/:name(*)',
  name:       'getLatestArtifact',
  stability:  API.stability.stable,
  scopes: [
    ['queue:get-artifact:<name>'],
  ],
  deferAuth:  true,
  title:      'Get Artifact from Latest Run',
  description: [
    'Get artifact by `<name>` from the last run of a task.',
    '',
    '**Public Artifacts**, in-order to get an artifact you need the scope',
    '`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.',
    'But if the artifact `name` starts with `public/`, authentication and',
    'authorization is not necessary to fetch the artifact.',
    '',
    '**API Clients**, this method will redirect you to the artifact, if it is',
    'stored externally. Either way, the response may not be JSON. So API',
    'client users might want to generate a signed URL for this end-point and',
    'use that URL with a normal HTTP client.',
    '',
    '**Remark**, this end-point is slightly slower than',
    '`queue.getArtifact`, so consider that if you already know the `runId` of',
    'the latest run. Otherwise, just us the most convenient API end-point.',
  ].join('\n'),
}, async function(req, res) {
  var taskId = req.params.taskId;
  var name   = req.params.name;

  // Check if this artifact is in the public/ folder, or require request
  // to be authenticated by providing parameterss
  if (!/^public\//.test(name) && !req.satisfies({name})) {
    return;
  }

  // Load task status structure from table
  var task = await this.Task.load({taskId}, true);

  // Give a 404 if not found
  if (!task) {
    return res.reportError('ResourceNotFound', 'Task not found', {});
  }

  // Check that we have runs
  if (task.runs.length === 0) {
    return res.reportError('ResourceNotFound', 'Task doesn\'t have any runs', {});
  }

  // Find highest runId
  var runId = task.runs.length - 1;

  // Reply
  return replyWithArtifact.call(this, taskId, runId, name, req, res);
});

/** Get artifacts from run */
api.declare({
  method:     'get',
  route:      '/task/:taskId/runs/:runId/artifacts',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  name:       'listArtifacts',
  stability:  API.stability.experimental,
  output:     'list-artifacts-response.json#',
  title:      'Get Artifacts from Run',
  description: [
    'Returns a list of artifacts and associated meta-data for a given run.',
    '',
    'As a task may have many artifacts paging may be necessary. If this',
    'end-point returns a `continuationToken`, you should call the end-point',
    'again with the `continuationToken` as the query-string option:',
    '`continuationToken`.',
    '',
    'By default this end-point will list up-to 1000 artifacts in a single page',
    'you may limit this with the query-string parameter `limit`.',
  ].join('\n'),
}, async function(req, res) {
  let taskId        = req.params.taskId;
  let runId         = parseInt(req.params.runId, 10);
  let continuation  = req.query.continuationToken || null;
  let limit         = parseInt(req.query.limit || 1000, 10);
  // TODO: Add support querying using prefix

  let [task, artifacts] = await Promise.all([
    this.Task.load({taskId}, true),
    this.Artifact.query({taskId, runId}, {continuation, limit}),
  ]);

  // Give a 404 if not found
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'No task with taskId: {{taskId}} found',
      {taskId},
    );
  }

  // Check that we have the run
  if (!task.runs[runId]) {
    return res.reportError(
      'ResourceNotFound',
      'Task with taskId: {{taskId}} run with runId: {{runId}}\n' +
      'task status: {{status}}', {
        taskId,
        runId,
        status: task.status(),
      },
    );
  }

  let result = {
    artifacts: artifacts.entries.map(artifact => artifact.json()),
  };
  if (artifacts.continuation) {
    result.continuationToken = artifacts.continuation;
  }

  return res.reply(result);
});

/** Get latest artifacts from task */
api.declare({
  method:     'get',
  route:      '/task/:taskId/artifacts',
  name:       'listLatestArtifacts',
  query: {
    continuationToken: /./,
    limit: /^[0-9]+$/,
  },
  stability:  API.stability.experimental,
  output:     'list-artifacts-response.json#',
  title:      'Get Artifacts from Latest Run',
  description: [
    'Returns a list of artifacts and associated meta-data for the latest run',
    'from the given task.',
    '',
    'As a task may have many artifacts paging may be necessary. If this',
    'end-point returns a `continuationToken`, you should call the end-point',
    'again with the `continuationToken` as the query-string option:',
    '`continuationToken`.',
    '',
    'By default this end-point will list up-to 1000 artifacts in a single page',
    'you may limit this with the query-string parameter `limit`.',
  ].join('\n'),
}, async function(req, res) {
  let taskId        = req.params.taskId;
  let continuation  = req.query.continuationToken || null;
  let limit         = parseInt(req.query.limit || 1000, 10);
  // TODO: Add support querying using prefix

  // Load task status structure from table
  let task = await this.Task.load({taskId}, true);

  // Give a 404 if not found
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'No task with taskId: {{taskId}} found',
      {taskId},
    );
  }

  // Check that we have runs
  if (task.runs.length === 0) {
    return res.reportError(
      'ResourceNotFound',
      'Task with taskId: {{taskId}} does not have any runs',
      {taskId},
    );
  }

  // Find highest runId
  let runId = task.runs.length - 1;

  let artifacts = await this.Artifact.query({
    taskId, runId,
  }, {continuation, limit});

  let result = {
    artifacts: artifacts.entries.map(artifact => artifact.json()),
  };
  if (artifacts.continuation) {
    result.continuationToken = artifacts.continuation;
  }

  return res.reply(result);
});
