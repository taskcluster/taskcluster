const APIBuilder = require('taskcluster-lib-api');

let builder = new APIBuilder({
  title: 'Taskcluster Worker Manager',
  description: [
    'This service manages workers, including provisioning',
  ].join('\n'),
  serviceName: 'worker-manager',
  apiVersion: 'v1',
  context: [
    'WorkerType',
  ],
});

module.exports = builder;

builder.declare({
  method: 'put',
  route: '/workertype/:name',
  name: 'createWorkerType',
  title: 'Create WorkerType',
  stability: APIBuilder.stability.experimental,
  input: 'workertype-definition.yml',
  output: 'workertype-full.yml',
  scopes: {AllOf: [
    'worker-manager:create-worker-type:<name>',
    'worker-manager:provider:<provider>',
  ]},
  description: [
    'TODO',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;
  const input = req.body;
  const provider = input.provider;

  await req.authorize({name, provider});

  const now = new Date();
  let workerType;

  try {
    workerType = await this.WorkerType.create({
      name,
      provider,
      description: input.description,
      configTemplate: input.configTemplate,
      renderedConfig: input.configTemplate, // TODO: render
      created: now,
      lastModified: now,
    });
  } catch (err) {
    if (err.code !== 'EntityAlreadyExists') {
      throw err;
    }
    workerType = await this.WorkerType.load({name});

    // TODO: Do this whole thing with deep compare and include config!
    if (workerType.provider !== provider ||
      workerType.description !== input.description ||
      workerType.created.getTime() !== now.getTime() ||
      workerType.lastModified.getTime() !== now.getTime()
    ) {
      return res.reportError('RequestConflict', 'WorkerType already exists', {});
    }
  }
  res.reply(workerType.serializable());
});

builder.declare({
  method: 'post',
  route: '/workertype/:name',
  name: 'updateWorkerType',
  title: 'Update WorkerType',
  stability: APIBuilder.stability.experimental,
  input: 'workertype-definition.yml',
  output: 'workertype-full.yml',
  scopes: {AllOf: [
    'worker-manager:update-worker-type:<name>',
    'worker-manager:provider:<provider>',
  ]},
  description: [
    'TODO',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;
  const input = req.body;
  const provider = input.provider;

  await req.authorize({name, provider});

  const workerType = await this.WorkerType.load({
    name,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }

  await workerType.modify(wt => {
    wt.configTemplate = input.configTemplate;
    wt.renderedTemplate = input.configTemplate; // TODO: Actually render
    wt.description = input.description;
    wt.provider = provider;
    wt.lastModifed = new Date().toJSON();
  });

  res.reply(workerType.serializable());
});

builder.declare({
  method: 'get',
  route: '/workertype/:name',
  name: 'workerType',
  title: 'Get WorkerType',
  stability: APIBuilder.stability.experimental,
  output: 'workertype-full.yml',
  description: [
    'TODO',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;

  const workerType = await this.WorkerType.load({
    name,
  }, true);
  if (!workerType) {
    return res.reportError('ResourceNotFound', 'WorkerType does not exist', {});
  }
  res.reply(workerType.serializable());
});

builder.declare({
  method: 'delete',
  route: '/workertype/:name',
  name: 'deleteWorkerType',
  title: 'Delete WorkerType',
  scopes: 'worker-manager:delete-worker-type:<name>',
  stability: APIBuilder.stability.experimental,
  description: [
    'TODO',
  ].join('\n'),
}, async function(req, res) {
  const {name} = req.params;

  await this.WorkerType.remove({name}, true);
  return res.reply();
});
