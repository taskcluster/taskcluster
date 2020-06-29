const {APIBuilder} = require('taskcluster-lib-api');
const helpers = require('./helpers');
const Entity = require('taskcluster-lib-entities');

/**
 * API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   queue:             // taskcluster.Queue instance w. "queue:get-artifact:*"
 *   IndexedTask:       // data.IndexedTask instance
 *   Namespace:         // data.Namespace instance
 * }
 */
let builder = new APIBuilder({
  title: 'Task Index API Documentation',
  description: [
    'The index service is responsible for indexing tasks. The service ensures that',
    'tasks can be located by user-defined names.',
    '',
    'As described in the service documentation, tasks are typically indexed via Pulse',
    'messages, so the most common use of API methods is to read from the index.',
  ].join('\n'),
  projectName: 'taskcluster-index',
  serviceName: 'index',
  apiVersion: 'v1',
  context: ['queue', 'IndexedTask', 'Namespace'],
  params: {
    namespace: helpers.namespaceFormat,
    indexPath: helpers.namespaceFormat,
  },
});

module.exports = builder;

/** Get specific indexed task */
builder.declare({
  method: 'get',
  route: '/task/:indexPath',
  name: 'findTask',
  stability: APIBuilder.stability.stable,
  category: 'Index Service',
  output: 'indexed-task-response.yml',
  title: 'Find Indexed Task',
  description: [
    'Find a task by index path, returning the highest-rank task with that path. If no',
    'task exists for the given path, this API end-point will respond with a 404 status.',
  ].join('\n'),
}, async function(req, res) {
  let indexPath = req.params.indexPath || '';

  // Get namespace and ensure that we have a least one dot
  indexPath = indexPath.split('.');

  // Find name and namespace
  let name = indexPath.pop() || '';
  let namespace = indexPath.join('.');

  // Load indexed task
  let tasks;
  try {
    tasks = await this.IndexedTask.query({
      namespace: namespace,
      name: name,
      expires: Entity.op.greaterThan(new Date()),
    });
  } catch (err) {
    // Re-throw the error, if it's not a 404
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }
    return res.reportError('ResourceNotFound', 'Indexed task not found', {});
  }
  if (!tasks.entries.length) {
    return res.reportError('ResourceNotFound', 'Indexed task not found', {});
  }
  let task = tasks.entries[0];
  return res.reply(task.json());
});

/** GET List namespaces inside another namespace */
builder.declare({
  method: 'get',
  route: '/namespaces/:namespace?',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'listNamespaces',
  stability: APIBuilder.stability.stable,
  output: 'list-namespaces-response.yml',
  category: 'Index Service',
  title: 'List Namespaces',
  description: [
    'List the namespaces immediately under a given namespace.',
    '',
    'This endpoint',
    'lists up to 1000 namespaces. If more namespaces are present, a',
    '`continuationToken` will be returned, which can be given in the next',
    'request. For the initial request, the payload should be an empty JSON',
    'object.',
  ].join('\n'),
}, async function(req, res) {
  let that = this;
  let namespace = req.params.namespace || '';
  let continuation = req.query.continuationToken || null;
  let limit = parseInt(req.query.limit || 1000, 10);
  let query = {
    parent: namespace,
    expires: Entity.op.greaterThan(new Date()),
  };

  // Query with given namespace
  let namespaces = await helpers.listTableEntries({
    query,
    limit,
    continuation,
    key: 'namespaces',
    Table: that.Namespace,
  });

  res.reply(namespaces);
});

/** POST List namespaces inside another namespace */
builder.declare({
  method: 'post',
  route: '/namespaces/:namespace?',
  name: 'listNamespacesPost',
  stability: 'deprecated',
  noPublish: true,
  input: 'list-namespaces-request.yml',
  output: 'list-namespaces-response.yml',
  category: 'Index Service',
  title: 'List Namespaces',
  description: [
    'List the namespaces immediately under a given namespace.',
    '',
    'This endpoint',
    'lists up to 1000 namespaces. If more namespaces are present, a',
    '`continuationToken` will be returned, which can be given in the next',
    'request. For the initial request, the payload should be an empty JSON',
    'object.',
  ].join('\n'),
}, async function(req, res) {
  let that = this;
  let namespace = req.params.namespace || '';
  let limit = req.body.limit;
  let continuation = req.body.continuationToken;
  let query = {
    parent: namespace,
    expires: Entity.op.greaterThan(new Date()),
  };

  // Query with given namespace
  let namespaces = await helpers.listTableEntries({
    query,
    limit,
    continuation,
    key: 'namespaces',
    Table: that.Namespace,
  });

  res.reply(namespaces);
});

/** List tasks in namespace */
builder.declare({
  method: 'get',
  route: '/tasks/:namespace?',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name: 'listTasks',
  stability: APIBuilder.stability.stable,
  category: 'Index Service',
  output: 'list-tasks-response.yml',
  title: 'List Tasks',
  description: [
    'List the tasks immediately under a given namespace.',
    '',
    'This endpoint',
    'lists up to 1000 tasks. If more tasks are present, a',
    '`continuationToken` will be returned, which can be given in the next',
    'request. For the initial request, the payload should be an empty JSON',
    'object.',
    '',
    '**Remark**, this end-point is designed for humans browsing for tasks, not',
    'services, as that makes little sense.',
  ].join('\n'),
}, async function(req, res) {
  let that = this;
  let namespace = req.params.namespace || '';
  let query = {
    namespace,
    expires: Entity.op.greaterThan(new Date()),
  };

  let limit = parseInt(req.query.limit || 1000, 10);
  let continuation = req.query.continuationToken || null;

  let tasks = await helpers.listTableEntries({
    query,
    limit,
    continuation,
    key: 'tasks',
    Table: that.IndexedTask,
  });

  res.reply(tasks);
});

builder.declare({
  method: 'post',
  route: '/tasks/:namespace?',
  name: 'listTasksPost',
  stability: 'deprecated',
  noPublish: true,
  output: 'list-tasks-response.yml',
  title: 'List Tasks',
  category: 'Index Service',
  description: [
    '(a version of listTasks with POST for backward compatibility; do not use)',
  ].join('\n'),
}, async function(req, res) {
  let that = this;
  let namespace = req.params.namespace || '';
  let query = {
    namespace,
    expires: Entity.op.greaterThan(new Date()),
  };

  let limit = req.body.limit;
  let continuation = req.body.continuationToken;

  let tasks = await helpers.listTableEntries({
    query,
    limit,
    continuation,
    key: 'tasks',
    Table: that.IndexedTask,
  });

  res.reply(tasks);
});

/** Insert new task into the index */
builder.declare({
  method: 'put',
  route: '/task/:namespace',
  name: 'insertTask',
  stability: APIBuilder.stability.stable,
  scopes: 'index:insert-task:<namespace>',
  input: 'insert-task-request.yml',
  output: 'indexed-task-response.yml',
  category: 'Index Service',
  title: 'Insert Task into Index',
  description: [
    'Insert a task into the index.  If the new rank is less than the existing rank',
    'at the given index path, the task is not indexed but the response is still 200 OK.',
    '',
    'Please see the introduction above for information',
    'about indexing successfully completed tasks automatically using custom routes.',
  ].join('\n'),
}, async function(req, res) {
  let that = this;
  let input = req.body;
  let namespace = req.params.namespace || '';

  // Authenticate request by providing parameters
  await req.authorize({namespace});

  // Parse date string
  input.expires = new Date(input.expires);

  // Insert task
  return helpers.insertTask(
    namespace,
    input,
    that,
  ).then(function(task) {
    res.reply(task.json());
  });
});

/** Get artifact from indexed task */
builder.declare({
  method: 'get',
  route: '/task/:indexPath/artifacts/:name(*)',
  name: 'findArtifactFromTask',
  stability: APIBuilder.stability.stable,
  category: 'Index Service',
  scopes: {if: 'private', then: 'queue:get-artifact:<name>'},
  title: 'Get Artifact From Indexed Task',
  description: [
    'Find a task by index path and redirect to the artifact on the most recent',
    'run with the given `name`.',
    '',
    'Note that multiple calls to this endpoint may return artifacts from differen tasks',
    'if a new task is inserted into the index between calls. Avoid using this method as',
    'a stable link to multiple, connected files if the index path does not contain a',
    'unique identifier.  For example, the following two links may return unrelated files:',
    '* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/installer.exe`',
    '* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/debug-symbols.zip`',
    '',
    'This problem be remedied by including the revision in the index path or by bundling both',
    'installer and debug symbols into a single artifact.',
    '',
    'If no task exists for the given index path, this API end-point responds with 404.',
  ].join('\n'),
}, async function(req, res) {
  let that = this;
  let indexPath = req.params.indexPath || '';
  let artifactName = req.params.name;

  await req.authorize({
    private: !/^public\//.test(artifactName),
    name: artifactName,
  });

  // Get indexPath and ensure that we have a least one dot
  indexPath = indexPath.split('.');

  // Find name and namespace
  let name = indexPath.pop() || '';
  let namespace = indexPath.join('.');

  // Load indexed task
  return that.IndexedTask.load({
    namespace: namespace,
    name: name,
    expires: Entity.op.greaterThan(new Date()),
  }).then(function(task) {
    // Build signed url for artifact
    let url = null;
    if (/^public\//.test(artifactName)) {
      url = that.queue.externalBuildUrl(
        that.queue.getLatestArtifact,
        task.taskId,
        artifactName,
      );
    } else {
      url = that.queue.externalBuildSignedUrl(
        that.queue.getLatestArtifact,
        task.taskId,
        artifactName, {
          expiration: 15 * 60,
        });
    }
    // Redirect to artifact
    return res.redirect(303, url);
  }, function(err) {
    // Re-throw the error, if it's not a 404
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }
    return res.reportError('ResourceNotFound', 'Indexed task not found', {});
  });
});
