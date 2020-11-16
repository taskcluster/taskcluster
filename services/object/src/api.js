const { APIBuilder } = require('taskcluster-lib-api');

/**
 * Known download methods, in order of preference (preferring earlier
 * methods)
 */
const DOWNLOAD_METHODS = [
  'HTTP:GET',
];

let builder = new APIBuilder({
  title: 'Taskcluster Object Service API Documentation',
  description: [
    'The object service provides HTTP-accessible storage for large blobs of data.',
  ].join('\n'),
  serviceName: 'object',
  apiVersion: 'v1',
  errorCodes: {
    NoMatchingMethod: 406,
  },
  context: ['cfg', 'db', 'backends'],
});

builder.declare({
  method: 'post',
  route: '/upload/:name',
  name: 'uploadObject',
  input: 'upload-object-request.yml',
  stability: 'experimental',
  category: 'Upload',
  scopes: 'object:upload:<name>',
  title: 'Upload backend data',
  description: [
    'Upload backend data.',
  ].join('\n'),
}, async function(req, res) {
  let { projectId, expires } = req.body;
  let { name } = req.params;
  const backend = this.backends.forUpload({ name, projectId });
  // Parse date string
  expires = new Date(expires);

  await this.db.fns.create_object(name, projectId, backend.backendId, {}, expires);
  return res.reply({});
});

builder.declare({
  method: 'put',
  route: '/download/:name',
  name: 'downloadObject',
  input: 'download-object-request.yml',
  output: 'download-object-response.yml',
  stability: 'experimental',
  category: 'Download',
  scopes: 'object:download:<name>',
  title: 'Download object data',
  description: [
    'Get information on how to download an object.  Call this endpoint with a list of acceptable',
    'download methods, and the server will select a method and return the corresponding payload.',
    'Returns a 406 error if none of the given download methods are available.',
    '',
    'See [Download Methods](https://docs.taskcluster.net/docs/reference/platform/object/upload-download-methods#download-methods) for more detail.',
  ].join('\n'),
}, async function(req, res) {
  let { name } = req.params;
  const { acceptDownloadMethods } = req.body;
  const [object] = await this.db.fns.get_object(name);

  if (!object) {
    return res.reportError('ResourceNotFound', 'Object "{{name}}" not found', { name });
  }

  const backend = this.backends.get(object.backend_id);

  const backendMethods = await backend.availableDownloadMethods(object);
  const matchingMethods = DOWNLOAD_METHODS.filter(
    m => backendMethods.includes(m) && acceptDownloadMethods.includes(m));

  if (matchingMethods.length < 1) {
    return res.reportError(
      'NoMatchingMethod',
      'Object supports methods {{methods}}',
      { methods: backendMethods.join(', ') });
  }

  const result = await backend.downloadObject(name, matchingMethods[0]);

  return res.reply(result);
});

module.exports = builder;
