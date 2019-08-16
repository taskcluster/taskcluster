const debug = require('debug')('app:artifacts');
const _ = require('lodash');
const assert = require('assert');
const APIBuilder = require('taskcluster-lib-api');
const urllib = require('url');
const crypto = require('crypto');
const builder = require('./api');
const Entity = require('azure-entities');

/** Post artifact */
/** Reply to an artifact request using taskId, runId, name and context */
let replyWithArtifact = async function(taskId, runId, name, req, res) {
  // Load artifact meta-data from table storage
  let artifact = await this.Artifact.load({taskId, runId, name}, true);

  // Give a 404, if the artifact couldn't be loaded
  if (!artifact) {
    return res.reportError('ResourceNotFound', 'Artifact not found', {});
  }

  // Some downloading utilities need to know the artifact's storage type to be
  // able to handle their downloads most correctly.  We're going to set this
  // field on all artifact responses so that the downloading utilities can use
  // slightly different logic for each artifact type
  res.set('x-taskcluster-artifact-storage-type', artifact.storageType);

  if (artifact.storageType === 'blob') {
    // Most of the time, the same base options are used.
    let getOpts = {
      bucket: artifact.details.bucket,
      key: artifact.details.key,
    };

    res.set('x-taskcluster-location-content-sha256', artifact.details.contentSha256);
    res.set('x-taskcluster-location-content-length', artifact.details.contentLength);
    res.set('x-taskcluster-location-transfer-sha256', artifact.details.transferSha256);
    res.set('x-taskcluster-location-transfer-length', artifact.details.transferLength);
    res.set('x-taskcluster-location-content-encoding', artifact.details.contentEncoding || 'identity');
    res.set('x-taskcluster-location-content-type', artifact.details.contentType);

    // TODO: We should consider doing a HEAD on all resources and verifying that
    // the ETag they have matches the one that we received when creating the artifact.
    // This is a bit of extra overhead, but it's one more check of consistency

    if (artifact.details.bucket === this.privateBlobBucket) {
      // TODO: Make sure that we can set expiration of these signed urls
      getOpts.signed = true;
      // TODO: Figure out how to set the ETag as a header on this response
      return res.redirect(303, await this.s3Controller.generateGetUrl(getOpts));
    } else if (artifact.details.bucket === this.publicBlobBucket) {
      return res.redirect(303, await this.s3Controller.generateGetUrl(getOpts));
    } else {
      throw new Error('Using a bucket we should not');
    }
  }

  // Handle S3 artifacts
  if (artifact.storageType === 's3') {
    // Find url
    let url = null;

    // First, let's figure out which region the request is coming from
    let region = this.regionResolver.getRegion(req);
    let prefix = artifact.details.prefix;
    let bucket = artifact.details.bucket;

    if (bucket === this.publicBucket.bucket) {

      // We have some headers to skip the Cache (cloud-mirror) and to skip the
      // CDN (cloudfront) for those requests which require it
      let skipCacheHeader = (req.headers['x-taskcluster-skip-cache'] || '').toLowerCase();
      let skipCDNHeader = (req.headers['x-taskcluster-skip-cdn'] || '').toLowerCase();

      let skipCache = false;
      if (skipCacheHeader === 'true' || skipCacheHeader === '1') {
        skipCache = true;
      }

      let skipCDN = false;
      if (skipCDNHeader === 'true' || skipCDNHeader === '1') {
        skipCDN = true;
      }

      // When we're getting a request from the region we're serving artifacts
      // from, we want to skip both CDN and Cache always
      if (region && this.artifactRegion === region) {
        skipCDN = true;
        skipCache = true;
      }

      if (!this.useCloudMirror) {
        skipCache = true;
      }

      if (skipCache && skipCDN) {
        url = this.publicBucket.createGetUrl(prefix, true);
      } else if (skipCache || !region) {
        url = this.publicBucket.createGetUrl(prefix, false);
      } else {
        let canonicalArtifactUrl = this.publicBucket.createGetUrl(prefix, true);
        // We need to build our url path appropriately.  Note that we URL
        // encode the artifact URL as required by the cloud-mirror api
        let cloudMirrorPath = [
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
    let expiry = new Date();
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
    return res.status(424).json({
      reason: artifact.details.reason,
      message: artifact.details.message,
    });
  }

  // We should never arrive here
  let err = new Error('Unknown artifact storageType: ' + artifact.storageType);
  err.artifact = artifact.json();
  this.monitor.reportError(err);
};

/** Complete artifact */
/** Get artifact from run */
builder.declare({
  method: 'get',
  route: '/task/:taskId/runs/:runId/artifacts/:name(*)',
  name: 'getArtifact',
  stability: APIBuilder.stability.stable,
  category: 'Queue Service',
  scopes: {
    if: 'private',
    then: {
      AllOf: ['queue:get-artifact:<name>'],
    },
  },
  title: 'Get Artifact from Run',
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
    'use that URL with an HTTP client that can handle responses correctly.',
    '',
    '**Downloading artifacts**',
    'There are some special considerations for those http clients which download',
    'artifacts.  This api endpoint is designed to be compatible with an HTTP 1.1',
    'compliant client, but has extra features to ensure the download is valid.',
    'It is strongly recommend that consumers use either taskcluster-lib-artifact (JS),',
    'taskcluster-lib-artifact-go (Go) or the CLI written in Go to interact with',
    'artifacts.',
    '',
    'In order to download an artifact the following must be done:',
    '',
    '1. Obtain queue url.  Building a signed url with a taskcluster client is',
    'recommended',
    '1. Make a GET request which does not follow redirects',
    '1. In all cases, if specified, the',
    'x-taskcluster-location-{content,transfer}-{sha256,length} values must be',
    'validated to be equal to the Content-Length and Sha256 checksum of the',
    'final artifact downloaded. as well as any intermediate redirects',
    '1. If this response is a 500-series error, retry using an exponential',
    'backoff.  No more than 5 retries should be attempted',
    '1. If this response is a 400-series error, treat it appropriately for',
    'your context.  This might be an error in responding to this request or',
    'an Error storage type body.  This request should not be retried.',
    '1. If this response is a 200-series response, the response body is the artifact.',
    'If the x-taskcluster-location-{content,transfer}-{sha256,length} and',
    'x-taskcluster-location-content-encoding are specified, they should match',
    'this response body',
    '1. If the response type is a 300-series redirect, the artifact will be at the',
    'location specified by the `Location` header.  There are multiple artifact storage',
    'types which use a 300-series redirect.',
    '1. For all redirects followed, the user must verify that the content-sha256, content-length,',
    'transfer-sha256, transfer-length and content-encoding match every further request.  The final',
    'artifact must also be validated against the values specified in the original queue response',
    '1. Caching of requests with an x-taskcluster-artifact-storage-type value of `reference`',
    'must not occur',
    '1. A request which has x-taskcluster-artifact-storage-type value of `blob` and does not',
    'have x-taskcluster-location-content-sha256 or x-taskcluster-location-content-length',
    'must be treated as an error',
    '',
    '**Headers**',
    'The following important headers are set on the response to this method:',
    '',
    '* location: the url of the artifact if a redirect is to be performed',
    '* x-taskcluster-artifact-storage-type: the storage type.  Example: blob, s3, error',
    '',
    'The following important headers are set on responses to this method for Blob artifacts',
    '',
    '* x-taskcluster-location-content-sha256: the SHA256 of the artifact',
    '*after* any content-encoding is undone.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})',
    '* x-taskcluster-location-content-length: the number of bytes *after* any content-encoding',
    'is undone',
    '* x-taskcluster-location-transfer-sha256: the SHA256 of the artifact',
    '*before* any content-encoding is undone.  This is the SHA256 of what is sent over',
    'the wire.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})',
    '* x-taskcluster-location-transfer-length: the number of bytes *after* any content-encoding',
    'is undone',
    '* x-taskcluster-location-content-encoding: the content-encoding used.  It will either',
    'be `gzip` or `identity` right now.  This is hardcoded to a value set when the artifact',
    'was created and no content-negotiation occurs',
    '* x-taskcluster-location-content-type: the content-type of the artifact',
    '',
    '**Caching**, artifacts may be cached in data centers closer to the',
    'workers in-order to reduce bandwidth costs. This can lead to longer',
    'response times. Caching can be skipped by setting the header',
    '`x-taskcluster-skip-cache: true`, this should only be used for resources',
    'where request volume is known to be low, and caching not useful.',
    '(This feature may be disabled in the future, use is sparingly!)',
  ].join('\n'),
}, async function(req, res) {
  let taskId = req.params.taskId;
  let runId = parseInt(req.params.runId, 10);
  let name = req.params.name;

  await req.authorize({
    private: !/^public\//.test(name),
    name,
  });

  return replyWithArtifact.call(this, taskId, runId, name, req, res);
});

/** Get latest artifact from task */
builder.declare({
  method: 'get',
  route: '/task/:taskId/artifacts/:name(*)',
  name: 'getLatestArtifact',
  stability: APIBuilder.stability.stable,
  category: 'Queue Service',
  scopes: {
    if: 'private',
    then: {
      AllOf: ['queue:get-artifact:<name>'],
    },
  },
  title: 'Get Artifact from Latest Run',
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
  let taskId = req.params.taskId;
  let name = req.params.name;

  await req.authorize({
    private: !/^public\//.test(name),
    name,
  });

  // Load task status structure from table
  let task = await this.Task.load({taskId}, true);

  // Give a 404 if not found
  if (!task) {
    return res.reportError('ResourceNotFound', 'Task not found', {});
  }

  // Check that we have runs
  if (task.runs.length === 0) {
    return res.reportError('ResourceNotFound', 'Task doesn\'t have any runs', {});
  }

  // Find highest runId
  let runId = task.runs.length - 1;

  // Reply
  return replyWithArtifact.call(this, taskId, runId, name, req, res);
});

/** Get artifacts from run */
builder.declare({
  method: 'get',
  route: '/task/:taskId/runs/:runId/artifacts',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'listArtifacts',
  stability: APIBuilder.stability.experimental,
  category: 'Queue Service',
  output: 'list-artifacts-response.json#',
  title: 'Get Artifacts from Run',
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
  let taskId = req.params.taskId;
  let runId = parseInt(req.params.runId, 10);
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);
  // TODO: Add support querying using prefix

  let [task, artifacts] = await Promise.all([
    this.Task.load({taskId}, true),
    this.Artifact.query({taskId, runId}, {continuation, limit}),
  ]);

  // Give a 404 if not found
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'No task with taskId: `{{taskId}}` found',
      {taskId},
    );
  }

  // Check that we have the run
  if (!task.runs[runId]) {
    return res.reportError(
      'ResourceNotFound',
      'Task with taskId: `{{taskId}}` run with runId: {{runId}}\n' +
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
builder.declare({
  method: 'get',
  route: '/task/:taskId/artifacts',
  name: 'listLatestArtifacts',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  stability: APIBuilder.stability.experimental,
  output: 'list-artifacts-response.json#',
  category: 'Queue Service',
  title: 'Get Artifacts from Latest Run',
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
  let taskId = req.params.taskId;
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);
  // TODO: Add support querying using prefix

  // Load task status structure from table
  let task = await this.Task.load({taskId}, true);

  // Give a 404 if not found
  if (!task) {
    return res.reportError(
      'ResourceNotFound',
      'No task with taskId: `{{taskId}}` found',
      {taskId},
    );
  }

  // Check that we have runs
  if (task.runs.length === 0) {
    return res.reportError(
      'ResourceNotFound',
      'Task with taskId: `{{taskId}}` does not have any runs',
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
