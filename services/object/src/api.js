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

module.exports = builder;
