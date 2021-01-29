const { APIBuilder } = require('taskcluster-lib-api');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const taskcluster = require('taskcluster-client');

/**
 * Known download methods, in order of preference (preferring earlier
 * methods)
 */
const DOWNLOAD_METHODS = [
  'simple',
  'HTTP:GET',
];

let builder = new APIBuilder({
  title: 'Object Service',
  description: [
    'The object service provides HTTP-accessible storage for large blobs of data.',
  ].join('\n'),
  serviceName: 'object',
  apiVersion: 'v1',
  errorCodes: {
    NoMatchingMethod: 406,
  },
  context: ['cfg', 'db', 'backends', 'middleware'],
});

builder.declare({
  method: 'put',
  route: '/upload/:name',
  name: 'createUpload',
  input: 'create-upload-request.yml',
  output: 'create-upload-response.yml',
  stability: 'experimental',
  category: 'Upload',
  scopes: 'object:upload:<projectId>:<name>',
  title: 'Begin upload of a new object',
  description: [
    'Create a new object by initiating upload of its data.',
    '',
    'This endpoint implements negotiation of upload methods.  It can be called',
    'multiple times if necessary, either to propose new upload methods or to',
    'renew credentials for an already-agreed upload.',
    '',
    'The `uploadId` must be supplied by the caller, and any attempts to upload',
    'an object with the same name but a different `uploadId` will fail.',
    'Thus the first call to this method establishes the `uploadId` for the',
    'object, and as long as that value is kept secret, no other caller can',
    'upload an object of that name, regardless of scopes.  Object expiration',
    'cannot be changed after the initial call, either.  It is possible to call',
    'this method with no proposed upload methods, which hsa the effect of "locking',
    'in" the `expiration` and `uploadId` properties.',
    '',
    'Unfinished uploads expire after 1 day.',
  ].join('\n'),
}, async function(req, res) {
  let { projectId, uploadId, expires, proposedUploadMethods } = req.body;
  let { name } = req.params;
  const uploadExpires = taskcluster.fromNow('1 day');

  await req.authorize({ projectId, name });

  const backend = this.backends.forUpload({ name, projectId });

  // mark the beginning of the upload..
  try {
    await this.db.fns.create_object_for_upload({
      name_in: name,
      project_id_in: projectId,
      backend_id_in: backend.backendId,
      upload_id_in: uploadId,
      upload_expires_in: uploadExpires,
      data_in: {},
      expires_in: new Date(expires),
    });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      return res.reportError(
        'RequestConflict',
        'Object already exists',
        { name, projectId, backendId: backend.backendId });
    }

    throw err;
  }

  const [object] = await this.db.fns.get_object_with_upload(name);
  if (!object) {
    // "this should not happen"
    throw new Error("newly created object row not found");
  }

  // default uploadMethod to an empty object, meaning no matching methods
  let uploadMethod = await backend.createUpload(object, proposedUploadMethods);

  // XXX temporary - until we have a finishUpload endpoint, and an upload method that does
  // not finish immediately, finish uploads automatically when they succeed
  if (Object.keys(uploadMethod).length !== 0) {
    await this.db.fns.object_upload_complete({ name_in: name, upload_id_in: uploadId });
  }

  return res.reply({
    projectId,
    uploadId,
    expires,
    uploadMethod,
  });
});

builder.declare({
  method: 'put',
  route: '/start-download/:name(*)',
  name: 'startDownload',
  input: 'download-object-request.yml',
  output: 'download-object-response.yml',
  stability: 'experimental',
  category: 'Download',
  scopes: 'object:download:<name>',
  title: 'Download object data',
  description: [
    'Start the process of downloading an object\'s data.  Call this endpoint with a list of acceptable',
    'download methods, and the server will select a method and return the corresponding payload.',
    '',
    'Returns a 406 error if none of the given download methods are available.',
    '',
    'See [Download Methods](https://docs.taskcluster.net/docs/reference/platform/object/download-methods) for more detail.',
  ].join('\n'),
}, async function(req, res) {
  let { name } = req.params;
  const { acceptDownloadMethods } = req.body;
  const [object] = await this.db.fns.get_object_with_upload(name);

  if (!object || object.upload_id !== null) {
    return res.reportError('ResourceNotFound', 'Object "{{name}}" not found', { name });
  }

  const backend = this.backends.get(object.backend_id);

  const callerMethods = Object.keys(acceptDownloadMethods);
  const backendMethods = await backend.availableDownloadMethods(object);
  const matchingMethods = DOWNLOAD_METHODS.filter(
    m => backendMethods.includes(m) && callerMethods.includes(m));

  if (matchingMethods.length < 1) {
    return res.reportError(
      'NoMatchingMethod',
      'Object supports methods {{methods}}',
      { methods: backendMethods.join(', ') });
  }

  // DOWNLOAD_METHODS is ordered by preference, so "the best" is just the first matching method
  const method = matchingMethods[0];
  const params = acceptDownloadMethods[method];

  // apply middleware
  if (!await this.middleware.startDownloadRequest(req, res, object, method, params)) {
    return;
  }

  const result = await backend.startDownload(object, method, params);

  return res.reply(result);
});

builder.declare({
  method: 'get',
  route: '/download/:name(*)',
  name: 'download',
  stability: 'experimental',
  category: 'Download',
  scopes: 'object:download:<name>',
  title: 'Get an object\'s data',
  description: [
    'Get the data in an object directly.  This method does not return a JSON body, but',
    'redirects to a location that will serve the object content directly.',
    '',
    'URLs for this endpoint, perhaps with attached authentication (`?bewit=..`),',
    'are typically used for downloads of objects by simple HTTP clients such as',
    'web browsers, curl, or wget.',
    '',
    'This method is limited by the common capabilities of HTTP, so it may not be',
    'the most efficient, resilient, or featureful way to retrieve an artifact.',
    'Situations where such functionality is required should ues the',
    '`startDownload` API endpoint.',
    '',
    'See [Simple Downloads](https://docs.taskcluster.net/docs/reference/platform/object/simple-downloads) for more detail.',
  ].join('\n'),
}, async function(req, res) {
  const { name } = req.params;
  const method = 'simple';
  const [object] = await this.db.fns.get_object_with_upload(name);

  if (!object || object.upload_id !== null) {
    return res.reportError('ResourceNotFound', 'Object "{{name}}" not found', { name });
  }

  const backend = this.backends.get(object.backend_id);

  const backendMethods = await backend.availableDownloadMethods(object);
  if (!backendMethods.includes(method)) {
    // all backends should support 'simple', but just in case..
    return res.reportError(
      'NoMatchingMethod',
      'Object supports methods {{methods}}',
      { methods: backendMethods.join(', ') });
  }

  // apply middleware
  if (!await this.middleware.downloadRequest(req, res, object)) {
    return;
  }

  const result = await backend.startDownload(object, method, true);

  return res.redirect(303, result.url);
});

module.exports = builder;
