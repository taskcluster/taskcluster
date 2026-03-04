import _ from 'lodash';
import { APIBuilder, paginateResults } from '@taskcluster/lib-api';
import { UNIQUE_VIOLATION } from '@taskcluster/lib-postgres';
import { artifactUtils } from './utils.js';
import { Task } from './data.js';
import slugid from 'slugid';
import taskcluster from '@taskcluster/client';

// map from storage type to whether it needs a finishArtifact call
const STORAGE_TYPE_NEEDS_FINISH = {
  reference: false,
  link: false,
  error: false,
  s3: false,
  object: true,
};

/**
 * Get the latest taskId for the given run, or throw a ResourceNotFound.
 */
const getLatestRunId = async function({ taskId, res }) {
  // Load task status structure from table
  const task = await Task.get(this.db, taskId);

  // Give a 404 if not found
  if (!task) {
    return res.reportError('ResourceNotFound', 'Task not found', {});
  }

  // Check that we have runs
  if (task.runs.length === 0) {
    return res.reportError('ResourceNotFound', 'Task doesn\'t have any runs', {});
  }

  // Find highest runId
  return task.runs.length - 1;
};

/**
 * Return an Artifact instance, following any link artifacts while detecting cycles.
 * It calls `req.authorize({ names })` before fetching each artifact, and `res.reportError`
 * on error.
 */
const getArtifactFollowingLinks = async function({ taskId, runId, name, req, res }) {
  const names = [];

  while (true) {
    names.push(name);
    await req.authorize({ names: names });

    // Load artifact meta-data from table storage
    const artifact = artifactUtils.fromDbRows(await this.db.fns.get_queue_artifact_2(taskId, runId, name));

    if (!artifact || !artifact.present) {
      return res.reportError('ResourceNotFound', 'Artifact not found', {});
    }

    if (artifact.expires < new Date()) {
      return res.reportError('ResourceExpired', 'Artifact expired', {});
    }

    if (artifact.storageType !== 'link') {
      return artifact;
    }

    // this is a link to another artifact, so check permission on that target artifact,
    // and then iterate.  This iteration cannot go on indefinitely, as there are a finite
    // number of artifacts for a task.
    const targetName = artifact.details.artifact;
    if (names.indexOf(targetName) !== -1) {
      return res.reportError('InputError',
        'Artifact leads to a link cycle',
        {});
    }

    name = targetName;
  }
};

/**
 * Generate a URL for an artifact with storageType `s3`.  If skipCDN is true, then the URL
 * will point directly at the bucket and not a CDN.
 */
const generateS3Url = async function({ artifact, skipCDN, req }) {
  let url;

  // First, let's figure out which region the request is coming from
  let region = this.regionResolver.getRegion(req);
  let prefix = artifact.details.prefix;
  let bucket = artifact.details.bucket;

  if (this.signPublicArtifactUrls || bucket === this.privateBucket.bucket) {
    let bucketObject = (bucket === this.privateBucket.bucket) ?
      this.privateBucket : this.publicBucket;
    url = await bucketObject.createSignedGetUrl(prefix, {
      expires: 30 * 60,
    });
  } else if (bucket === this.publicBucket.bucket) {
    // When we're getting a request from the region we're serving artifacts
    // from, we want to skip the CDN and read it directly
    if (region && this.artifactRegion === region) {
      skipCDN = true;
    }

    url = await this.publicBucket.createGetUrl(prefix, skipCDN);
  }

  return url;
};

// Determine if two calls to createArtifact are compatible, allowing for the documented
// exceptions.
export const createArtifactCallsCompatible = (original, { storageType, contentType, expires, details }) => {
  // calls can never change the content type, but links do not have a content-type
  if (storageType !== 'link' && original.contentType !== contentType) {
    return false;
  }

  // Special case: Any artifact's `expires` can be extended, but not shortened
  if (original.expires.getTime() > expires.getTime()) {
    return false;
  }

  if (original.storageType === storageType) {
    // If the storage type matches, then the details must match as well, except for
    // reference artifacts, for which details can be updated
    if (!_.isEqual(original.details, details) && storageType !== 'reference') {
      return false;
    }
    // a link artifact can replace a reference artifact; other changes to storageType
    // are not allowed
  } else if (!(original.storageType === 'reference' && storageType === 'link')) {
    return false;
  }

  return true;
};

/**
 * Generate the name for an artifact in the object service.  This must not
 * change, as the name is not stored anywhere and instead re-calculated as needed.
 * Storing this name would be redundant and consume a substantial amount of space
 * in large Taskcluster deployments.
 */
const artifactToObjectName = (taskId, runId, name) => `t/${taskId}/${runId}/${name}`;

export const loadArtifactsRoutes = (builder) => {

  /** Post artifact */
  builder.declare({
    method: 'post',
    route: '/task/:taskId/runs/:runId/artifacts/:name(*)',
    name: 'createArtifact',
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    scopes: 'queue:create-artifact:<taskId>/<runId>',
    input: 'post-artifact-request.json#',
    output: 'post-artifact-response.json#',
    title: 'Create Artifact',
    description: [
      'This API end-point creates an artifact for a specific run of a task. This',
      'should **only** be used by a worker currently operating on this task, or',
      'from a process running within the task (ie. on the worker).',
      '',
      'All artifacts must specify when they expire. The queue will',
      'automatically take care of deleting artifacts past their',
      'expiration point. This feature makes it feasible to upload large',
      'intermediate artifacts from data processing applications, as the',
      'artifacts can be set to expire a few days later.',
    ].join('\n'),
  }, async function(req, res) {
    let taskId = req.params.taskId;
    let runId = parseInt(req.params.runId, 10);
    let name = req.params.name;
    let input = req.body;
    let storageType = input.storageType;
    let contentType = input.contentType || 'application/binary';
    let contentLength = input.contentLength ?? null;

    // Find expiration date
    let expires = new Date(input.expires);

    // Validate expires it is in the future
    let past = new Date();
    past.setMinutes(past.getMinutes() - 15);
    if (expires.getTime() < past.getTime()) {
      return res.reportError('InputError',
        'Expires must be in the future',
        {});
    }

    // Load Task entity
    let task = await Task.get(this.db, taskId);

    // Handle cases where the task doesn't exist
    if (!task) {
      return res.reportError('InputError',
        'Task not found',
        {});
    }

    // Check presence of the run
    let run = task.runs[runId];
    if (!run) {
      return res.reportError('InputError',
        'Run not found',
        {});
    }

    const projectId = task.projectId;
    const workerGroup = run.workerGroup;
    const workerId = run.workerId;

    // It is possible for these to be null if the task was
    // cancelled or otherwise never claimed
    if (!workerGroup || !workerId) {
      return res.reportError('InputError',
        'Run was not claimed by a worker and so no artifacts can exist',
        {});
    }

    await req.authorize({
      taskId,
      runId,
      workerGroup,
      workerId,
      name,
    });

    // Validate expires <= task.expires
    if (expires.getTime() > task.expires.getTime()) {
      return res.reportError('InputError',
        'Artifact expires ({{expires}}) after the task expiration ' +
        '{{taskExpires}} (task.expires < expires) - this is not allowed, ' +
        'artifacts may not expire after the task they belong to expires', {
          taskExpires: task.expires.toJSON(),
          expires: expires.toJSON(),
        });
    }

    // Ensure that the run is running
    if (run.state !== 'running') {
      let allow = false;
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
            status: task.status(),
          });
      }
    }

    // Construct details for different storage types

    // NOTE: isPublic is a relic from before RFC#165.  If signPublicArtifactUrls is set,
    // then this value has no effect.  With the advent of the Object service, this relic
    // will disappear.
    let isPublic = /^public\//.test(name);
    let details = {};
    let present = false;
    let uploadId, objectName;
    switch (storageType) {
      case 'object': {
        present = false; // object artifacts require a call to `finishArtifact`

        // we "lock in" the upload on the object service by making a
        // `createUpload` call with no proposed methods.
        uploadId = slugid.nice();
        objectName = artifactToObjectName(taskId, runId, name);
        const objectService = this.objectService.use({ authorizedScopes: `object:upload:${projectId}:t/${objectName}` });

        await objectService.createUpload(objectName, {
          expires,
          projectId,
          uploadId,
          proposedUploadMethods: {},
        });

        details.uploadId = uploadId;

        break;
      }

      case 's3':
        present = true;
        if (isPublic) {
          details.bucket = this.publicBucket.bucket;
        } else {
          details.bucket = this.privateBucket.bucket;
        }
        details.prefix = [taskId, runId, name].join('/');
        break;

      case 'reference':
        present = true;
        details.url = input.url;
        break;

      case 'link':
        present = true;
        details.artifact = input.artifact;
        break;

      case 'error':
        present = true;
        details.message = input.message;
        details.reason = input.reason;
        break;

      default:
        throw new Error('Unknown storageType: ' + storageType);
    }

    let artifact;
    try {
      artifact = artifactUtils.fromDbRows(await this.db.fns.create_queue_artifact_2(
        taskId,
        runId,
        name,
        storageType,
        contentType,
        details,
        present,
        expires,
        contentLength,
      ));
    } catch (err) {
      // Re-throw error if this isn't because the entity already exists
      if (!err || err.code !== UNIQUE_VIOLATION) {
        throw err;
      }

      // Load original Artifact entity
      const original = artifactUtils.fromDbRows(await this.db.fns.get_queue_artifact_2(taskId, runId, name));

      let ok = createArtifactCallsCompatible(original, { storageType, contentType, expires, details });

      if (!ok) {
        return res.reportError('RequestConflict',
          'Artifact already exists with different properties, and none of the ' +
          'allowed exceptions apply: {{originalArtifact}}', {
            originalArtifact: {
              storageType: original.storageType,
              contentType: original.contentType,
              expires: original.expires,
            },
          });
      }

      // This update is allowed, so modify the artifact in-place
      artifact = artifactUtils.fromDbRows(
        await this.db.fns.update_queue_artifact_2({
          task_id_in: taskId,
          run_id_in: runId,
          name_in: name,
          details_in: details,
          storage_type_in: storageType,
          expires_in: expires,
        }),
      );
    }

    // This event is *invalid* for s3 storage types so we do not send it at all.
    if (present && artifact.storageType !== 's3') {
      // Publish message about artifact creation
      await this.publisher.artifactCreated({
        status: task.status(),
        artifact: artifactUtils.serialize(artifact),
        workerGroup,
        workerId,
        runId,
      }, task.routes);
    }

    switch (artifact.storageType) {
      case 'object': {
        // use a generated clientId with useful information in it
        const clientId = `artifact-upload/${taskId}/${runId}/on/${workerGroup}/${workerId}`;
        // credentials expire at artifact expiration or after 24 hours, whichever is first
        const oneDay = taskcluster.fromNow('24 hours');
        const expiry = (expires < oneDay) ? expires : oneDay;

        // generate credentials with permission to upload (including finishUpload) this specific object
        const credentials = taskcluster.createTemporaryCredentials({
          clientId,
          start: new Date(),
          expiry,
          scopes: [
            `object:upload:${projectId}:${objectName}`,
          ],
          credentials: this.credentials,
        });

        return res.reply({
          storageType: 'object',
          name: objectName,
          projectId,
          uploadId,
          expires: expires.toJSON(),
          credentials,
        });
      }

      case 's3': {
      // Reply with signed S3 URL
        let expiry = new Date(new Date().getTime() + 45 * 60 * 1000);
        let bucket = null;
        if (artifact.details.bucket === this.publicBucket.bucket) {
          bucket = this.publicBucket;
        }
        if (artifact.details.bucket === this.privateBucket.bucket) {
          bucket = this.privateBucket;
        }
        // Create put URL
        let putUrl = await bucket.createPutUrl(
          artifact.details.prefix, {
            contentType: artifact.contentType,
            expires: 45 * 60 + 10, // Add 10 sec for clock drift
          },
        );
        return res.reply({
          storageType: 's3',
          contentType: artifact.contentType,
          expires: expiry.toJSON(),
          putUrl: putUrl,
        });
      }
      case 'reference':
      case 'link':
      case 'error':
      // For 'reference' and 'error' the response is simple
        return res.reply({ storageType });

      default:
        throw new Error('Unknown storageType: ' + artifact.storageType);
    }
  });

  builder.declare({
    method: 'put',
    route: '/task/:taskId/runs/:runId/artifacts/:name(*)',
    name: 'finishArtifact',
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    scopes: 'queue:create-artifact:<taskId>/<runId>',
    input: 'finish-artifact-request.json#',
    title: 'Finish Artifact',
    description: [
      'This endpoint marks an artifact as present for the given task, and',
      'should be called when the artifact data is fully uploaded.',
      '',
      'The storage types `reference`, `link`, and `error` do not need to',
      'be finished, as they are finished immediately by `createArtifact`.',
      'The storage type `s3` does not support this functionality and cannot',
      'be finished.  In all such cases, calling this method is an input error',
      '(400).',
    ].join('\n'),
  }, async function(req, res) {
    const taskId = req.params.taskId;
    const runId = parseInt(req.params.runId, 10);
    const name = req.params.name;
    const { uploadId } = req.body;

    const [[artifact_row], task] = await Promise.all([
      this.db.fns.get_queue_artifact_2(taskId, runId, name),
      Task.get(this.db, taskId),
    ]);

    if (!artifact_row || !task || !task.runs[runId]) {
      return res.reportError(
        'ResourceNotFound',
        'Artifact with taskId `{{taskId}}`, runId {{runId}}, name `{{name}}` not found',
        { taskId, runId, name },
      );
    }

    const artifact = artifactUtils.fromDb(artifact_row);
    const run = task.runs[runId]; // checked to exist above

    const publishCreatedMessage = async () => {
      await this.publisher.artifactCreated({
        status: task.status(),
        artifact: artifactUtils.serialize(artifact),
        workerGroup: run.workerGroup,
        workerId: run.workerId,
        runId,
      }, task.routes);
    };

    // if this is of a type that is already finished, that's not allowed
    if (!STORAGE_TYPE_NEEDS_FINISH[artifact.storageType]) {
      return res.resportError('InputError', 'Only object artifacts can be finished', {});
    }

    // If already marked present, this is an idempotent call, in which case
    // we send the Pulse message again (at-least-once semantics)
    if (artifact.present) {
      await publishCreatedMessage();
      return res.status(204).send();
    }

    if (uploadId !== artifact.details?.uploadId) {
      return res.reportError(
        'InputError',
        'given uploadId does not match that for the artifact',
        {});
    }

    // verify object is complete with object service, before allowing this
    // operation to complete
    try {
      await this.objectService.object(artifactToObjectName(taskId, runId, name));
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
      return res.reportError('InputError', 'Object storing artifact data does not exist', {});
    }
    await this.db.fns.queue_artifact_present(taskId, runId, name);
    await publishCreatedMessage();

    // clear out the details, since the uploadId is no longer relevant
    await this.db.fns.update_queue_artifact_2({
      task_id_in: taskId,
      run_id_in: runId,
      name_in: name,
      storage_type_in: null,
      details_in: {},
      expires_in: null,
    });

    return res.status(204).send();
  });

  /**
   * Reply to an artifact request using taskId, runId, name and context
   *
   * This checks for permission to access artifacts via `req.authorize({ names })`, where names is the
   * set of artifact names traversed by any link artifacts.
   *
   * names is used internally for tracking artifact names that have already been seen
   * when traversing links.
   */
  let replyWithArtifactDownload = async function({ taskId, runId, name, req, res, names }) {
    const artifact = await getArtifactFollowingLinks.call(this, { taskId, runId, name, req, res });

    const { storageType } = artifact;

    // Some downloading utilities need to know the artifact's storage type to be
    // able to handle their downloads most correctly.  We're going to set this
    // field on all artifact responses so that the downloading utilities can use
    // slightly different logic for each artifact type
    res.set('x-taskcluster-artifact-storage-type', storageType);

    if (storageType === 'object') {
      // get the "simple" download URL from the object service
      const name = artifactToObjectName(taskId, runId, artifact.name);
      const scope = `object:download:${name}`;
      const objectService = this.objectService.use({ authorizedScopes: [scope] });

      let dlRes;
      try {
        dlRes = await objectService.startDownload(name, {
          acceptDownloadMethods: {
            simple: true,
          },
        });
      } catch (err) {
        if (err.statusCode !== 404) {
          throw err;
        }
        return res.reportError('ResourceNotFound', 'Object does not exist.', {});
      }

      if (dlRes.method !== 'simple') {
        return res.reportError('ResourceNotFound', 'Object does not support simple downloads.', {});
      }
      const { url } = dlRes;

      res.set('location', url);
      res.reply({ storageType, url }, 303);
      return;
    }

    if (storageType === 's3') {
      // We have a header to skip the CDN (cloudfront) for those requests
      // which require it
      let skipCDNHeader = (req.headers['x-taskcluster-skip-cdn'] || '').toLowerCase();

      let skipCDN = false;
      if (skipCDNHeader === 'true' || skipCDNHeader === '1') {
        skipCDN = true;
      }

      const url = await generateS3Url.call(this, { artifact, skipCDN, req });

      res.set('location', url);
      res.reply({ storageType, url }, 303);
      return;
    }

    // Handle redirect/reference artifacts
    if (storageType === 'reference') {
      const url = artifact.details.url;
      res.set('location', url);
      res.reply({ storageType, url }, 303);
      return;
    }

    // handle link artifacts
    if (storageType === 'link') {
      // links should have been evaluated already!
      throw new Error('unexpected artifact with storageType `link`');
    }

    // Handle error artifacts
    if (storageType === 'error') {
      return res.status(424).json({
        reason: artifact.details.reason,
        message: artifact.details.message,
      });
    }

    // We should never arrive here
    let err = new Error('Unknown artifact storageType: ' + storageType);
    err.artifact = artifactUtils.serialize(artifact);
    this.monitor.reportError(err);
  };

  /** Get artifact from run */
  builder.declare({
    method: 'get',
    route: '/task/:taskId/runs/:runId/artifacts/:name(*)',
    name: 'getArtifact',
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    output: 'get-artifact-response.json#',
    scopes: { AllOf: [
      { for: 'name', in: 'names', each: 'queue:get-artifact:<name>' },
    ] },
    title: 'Get Artifact Data from Run',
    description: [
      'Get artifact by `<name>` from a specific run.',
      '',
      '**Artifact Access**, in order to get an artifact you need the scope',
      '`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.',
      'To allow access to fetch artifacts with a client like `curl` or a web',
      'browser, without using Taskcluster credentials, include a scope in the',
      '`anonymous` role.  The convention is to include',
      '`queue:get-artifact:public/*`.',
      '',
      '**Response**: the HTTP response to this method is a 303 redirect to the',
      'URL from which the artifact can be downloaded.  The body of that response',
      'contains the data described in the output schema, contianing the same URL.',
      'Callers are encouraged to use whichever method of gathering the URL is',
      'most convenient.  Standard HTTP clients will follow the redirect, while',
      'API client libraries will return the JSON body.',
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
      '',
      '**Headers**',
      'The following important headers are set on the response to this method:',
      '',
      '* location: the url of the artifact if a redirect is to be performed',
      '* x-taskcluster-artifact-storage-type: the storage type.  Example: s3',
    ].join('\n'),
  }, async function(req, res) {
    let taskId = req.params.taskId;
    let runId = parseInt(req.params.runId, 10);
    let name = req.params.name;

    return replyWithArtifactDownload.call(this, { taskId, runId, name, req, res, names: [name] });
  });

  /** Get latest artifact from task */
  builder.declare({
    method: 'get',
    route: '/task/:taskId/artifacts/:name(*)',
    name: 'getLatestArtifact',
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    output: 'get-artifact-response.json#',
    scopes: { AllOf: [
      { for: 'name', in: 'names', each: 'queue:get-artifact:<name>' },
    ] },
    title: 'Get Artifact Data from Latest Run',
    description: [
      'Get artifact by `<name>` from the last run of a task.',
      '',
      '**Artifact Access**, in order to get an artifact you need the scope',
      '`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.',
      'To allow access to fetch artifacts with a client like `curl` or a web',
      'browser, without using Taskcluster credentials, include a scope in the',
      '`anonymous` role.  The convention is to include',
      '`queue:get-artifact:public/*`.',
      '',
      '**Response**: the HTTP response to this method is a 303 redirect to the',
      'URL from which the artifact can be downloaded.  The body of that response',
      'contains the data described in the output schema, contianing the same URL.',
      'Callers are encouraged to use whichever method of gathering the URL is',
      'most convenient.  Standard HTTP clients will follow the redirect, while',
      'API client libraries will return the JSON body.',
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
      '',
      '**Headers**',
      'The following important headers are set on the response to this method:',
      '',
      '* location: the url of the artifact if a redirect is to be performed',
      '* x-taskcluster-artifact-storage-type: the storage type.  Example: s3',
      '',
      '**Remark**, this end-point is slightly slower than',
      '`queue.getArtifact`, so consider that if you already know the `runId` of',
      'the latest run. Otherwise, just use the most convenient API end-point.',
    ].join('\n'),
  }, async function(req, res) {
    let taskId = req.params.taskId;
    let name = req.params.name;

    // check permisison before possibly returning a 404 for the task or run
    await req.authorize({ names: [name] });

    let runId = await getLatestRunId.call(this, { taskId, res });

    return replyWithArtifactDownload.call(this, { taskId, runId, name, req, res, names: [name] });
  });

  const replyWithArtifactsList = async function({ query, taskId, runId, res }) {
    const artifacts = await paginateResults({
      query: query,
      indexColumns: ['task_id', 'run_id', 'name'],
      fetch: (page_size_in, after) => this.db.fns.get_queue_artifacts_paginated_2({
        task_id_in: taskId,
        run_id_in: runId,
        expires_in: null,
        page_size_in,
        ...after,
      }),
    });

    let result = {
      artifacts: artifacts.rows.map(r => artifactUtils.serialize(artifactUtils.fromDb(r))),
    };
    if (artifacts.continuationToken) {
      result.continuationToken = artifacts.continuationToken;
    }

    return res.reply(result);
  };

  /** Get artifacts from run */
  builder.declare({
    method: 'get',
    route: '/task/:taskId/runs/:runId/artifacts',
    query: paginateResults.query,
    name: 'listArtifacts',
    scopes: 'queue:list-artifacts:<taskId>:<runId>',
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
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
    let latestRunId = await getLatestRunId.call(this, { taskId, res });

    // Check that we have the run
    if (runId < 0 || runId > latestRunId) {
      return res.reportError(
        'ResourceNotFound',
        'Task with taskId: `{{taskId}}` has no run with runId: {{runId}}',
        { taskId, runId },
      );
    }

    return await replyWithArtifactsList.call(this, { query: req.query, taskId, runId, res });
  });

  /** Get latest artifacts from task */
  builder.declare({
    method: 'get',
    route: '/task/:taskId/artifacts',
    name: 'listLatestArtifacts',
    scopes: 'queue:list-artifacts:<taskId>',
    query: paginateResults.query,
    stability: APIBuilder.stability.stable,
    output: 'list-artifacts-response.json#',
    category: 'Artifacts',
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
    let runId = await getLatestRunId.call(this, { taskId, res });

    return await replyWithArtifactsList.call(this, { query: req.query, taskId, runId, res });
  });

  /**
   * Reply to an artifact info request using taskId, runId (or latest), name and context
   *
   * This assumes that permission to list the artifact has already been verified.  This
   * does not return information about the artifact's content (which would require a
   * `queue:get-artifact:..` scope).
   */
  const replyWithArtifactInfo = async function({ taskId, runId, name, req, res }) {
    const artifact = artifactUtils.fromDbRows(
      await this.db.fns.get_queue_artifact_2(taskId, runId, name));

    if (!artifact || !artifact.present) {
      return res.reportError('ResourceNotFound', 'Artifact not found', {});
    }

    return res.reply(artifactUtils.serialize(artifact));
  };

  builder.declare({
    method: 'get',
    route: '/task/:taskId/runs/:runId/artifact-info/:name(*)',
    name: 'artifactInfo',
    scopes: 'queue:list-artifacts:<taskId>:<runId>',
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    output: 'artifact-response.json#',
    title: 'Get Artifact Information From Run',
    description: [
      'Returns associated metadata for a given artifact, in the given task run.',
      'The metadata is the same as that returned from `listArtifacts`, and does',
      'not grant access to the artifact data.',
      '',
      'Note that this method does *not* automatically follow link artifacts.',
    ].join('\n'),
  }, async function(req, res) {
    const { taskId, runId, name } = req.params;
    return replyWithArtifactInfo.call(this, { taskId, runId, name, req, res });
  });

  builder.declare({
    method: 'get',
    route: '/task/:taskId/artifact-info/:name(*)',
    name: 'latestArtifactInfo',
    scopes: 'queue:list-artifacts:<taskId>',
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    output: 'artifact-response.json#',
    title: 'Get Artifact Information From Latest Run',
    description: [
      'Returns associated metadata for a given artifact, in the latest run of the',
      'task.  The metadata is the same as that returned from `listArtifacts`,',
      'and does not grant access to the artifact data.',
      '',
      'Note that this method does *not* automatically follow link artifacts.',
    ].join('\n'),
  }, async function(req, res) {
    const { taskId, name } = req.params;
    const runId = await getLatestRunId.call(this, { taskId, res });
    return replyWithArtifactInfo.call(this, { taskId, runId, name, req, res });
  });

  /**
   * Reply to an artifact request using taskId, runId (or latest), name and context
   *
   * This uses `names` similarly to `replyWithArtifactDownload`.
   * does not return information about the artifact's content (which would require a
   * `queue:get-artifact:..` scope).
   */
  const replyWithArtifactContent = async function({ taskId, runId, name, req, res }) {
    const artifact = await getArtifactFollowingLinks.call(this, { taskId, runId, name, req, res });

    const { storageType } = artifact;

    switch (storageType) {
      case 'object': {
        const name = artifactToObjectName(taskId, runId, artifact.name);
        // use a generated clientId with useful information in it
        const clientId = `artifact-download/${taskId}/${runId}/${artifact.name}`;
        const expiry = taskcluster.fromNow('1 hour');

        // generate credentials with permission to download this object
        const credentials = taskcluster.createTemporaryCredentials({
          clientId,
          start: new Date(),
          expiry,
          scopes: [`object:download:${name}`],
          credentials: this.credentials,
        });
        return res.reply({ storageType, name, credentials });
      }

      case 's3': {
        const skipCDN = false; // not supported for artifact-content
        const url = await generateS3Url.call(this, { artifact, skipCDN, req });
        return res.reply({ storageType, url });
      }

      case 'reference': {
        const url = artifact.details.url;
        return res.reply({ storageType, url });
      }

      case 'error': {
        return res.reply({
          storageType,
          reason: artifact.details.reason,
          message: artifact.details.message,
        });
      }

      default: {
        // (note: links should have been evaluated already)
        let err = new Error('Unknown artifact storageType: ' + storageType);
        err.artifact = artifactUtils.serialize(artifact);
        this.monitor.reportError(err);
      }
    }
  };

  builder.declare({
    method: 'get',
    route: '/task/:taskId/runs/:runId/artifact-content/:name(*)',
    name: 'artifact',
    scopes: { AllOf: [
      { for: 'name', in: 'names', each: 'queue:get-artifact:<name>' },
    ] },
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    output: 'artifact-content-response.json#',
    title: 'Get Artifact Content From Run',
    description: [
      'Returns information about the content of the artifact, in the given task run.',
      '',
      'Depending on the storage type, the endpoint returns the content of the artifact',
      'or enough information to access that content.',
      '',
      'This method follows link artifacts, so it will not return content',
      'for a link artifact.',
    ].join('\n'),
  }, async function(req, res) {
    const { taskId, runId, name } = req.params;
    return replyWithArtifactContent.call(this, { taskId, runId, name, req, res });
  });

  builder.declare({
    method: 'get',
    route: '/task/:taskId/artifact-content/:name(*)',
    name: 'latestArtifact',
    scopes: { AllOf: [
      { for: 'name', in: 'names', each: 'queue:get-artifact:<name>' },
    ] },
    stability: APIBuilder.stability.stable,
    category: 'Artifacts',
    output: 'artifact-content-response.json#',
    title: 'Get Artifact Content From Latest Run',
    description: [
      'Returns information about the content of the artifact, in the latest task run.',
      '',
      'Depending on the storage type, the endpoint returns the content of the artifact',
      'or enough information to access that content.',
      '',
      'This method follows link artifacts, so it will not return content',
      'for a link artifact.',
    ].join('\n'),
  }, async function(req, res) {
    const { taskId, name } = req.params;
    const runId = await getLatestRunId.call(this, { taskId, res });
    return replyWithArtifactContent.call(this, { taskId, runId, name, req, res });
  });
};

// export for testing
export default { createArtifactCallsCompatible, loadArtifactsRoutes };
