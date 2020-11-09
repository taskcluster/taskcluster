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
  route: '/upload/:name/:projectId',
  name: 'uploadObject',
  input: 'upload-object-request.yml',
  output: undefined,
  stability: 'experimental',
  category: 'Backend',
  scopes: 'object:upload:<name>/<projectId>',
  title: 'Upload backend data',
  description: [
    'Upload backend data.',
  ].join('\n'),
}, async function(req, res) {
  let input = req.body;
  let { name, projectId } = req.params;
  const backend = this.backends.forUpload({ name, projectId });
  // Parse date string
  input.expires = new Date(input.expires);
  await this.db.fns.create_object(name, projectId, backend.backendId, {}, input.expires);
  return res.reply({});
});

module.exports = builder;
