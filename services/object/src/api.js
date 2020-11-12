const { APIBuilder } = require('taskcluster-lib-api');

let builder = new APIBuilder({
  title: 'Taskcluster Object Service API Documentation',
  description: [
    'The object service provides HTTP-accessible storage for large blobs of data.',
  ].join('\n'),
  serviceName: 'object',
  apiVersion: 'v1',
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
    'Download object data.',
  ].join('\n'),
}, async function(req, res) {
  let { name } = req.params;
  const { acceptProtocol } = req.body;
  const rows = await this.db.fns.get_object(name);

  if (!rows.length) {
    return res.reportError('ResourceNotFound', 'Object "{{name}}" not found', { name });
  }

  const [obj] = rows;
  const backend = this.backends.get(obj.backend_id);
  const result = backend.objectRetrievalDetails(name, acceptProtocol);

  return res.reply(result);
});

module.exports = builder;
