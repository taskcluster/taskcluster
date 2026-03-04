import { APIBuilder, paginateResults } from '@taskcluster/lib-api';
import helpers from './helpers.js';

/**
 * API end-point for version v1/
 *
 * In this API implementation we shall assume the following context:
 * {
 *   queue:             // taskcluster.Queue instance w. "queue:get-artifact:*"
 * }
 */
let builder = new APIBuilder({
  title: 'Index Service',
  description: [
    'The index service is responsible for indexing tasks. The service ensures that',
    'tasks can be located by user-defined names.',
    '',
    'As described in the service documentation, tasks are typically indexed via Pulse',
    'messages, so the most common use of API methods is to read from the index.',
    '',
    'Slashes (`/`) aren\'t allowed in index paths.',
  ].join('\n'),
  projectName: 'taskcluster-index',
  serviceName: 'index',
  apiVersion: 'v1',
  context: ['queue', 'db', 'isPublicArtifact'],
  params: {
    namespace: helpers.namespaceFormat,
    indexPath: helpers.namespaceFormat,
  },
});

export default builder;

/** Get specific indexed task */
builder.declare({
  method: 'get',
  route: '/task/:indexPath',
  name: 'findTask',
  scopes: 'index:find-task:<indexPath>',
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
  const task = helpers.taskUtils.fromDbRows(await this.db.fns.get_indexed_task(namespace, name));

  if (!task || task.expires <= new Date()) {
    return res.reportError('ResourceNotFound', 'Indexed task not found', {});
  }

  return res.reply(helpers.taskUtils.serialize(task));
});

/** List tasks from given task labels */
builder.declare({
  method: 'post',
  route: '/tasks/indexes',
  query: paginateResults.query,
  name: 'findTasksAtIndex',
  scopes: { AllOf: [{
    for: 'indexPath',
    in: 'indexPaths',
    each: 'index:find-task:<indexPath>',
  }] },
  input: 'list-tasks-at-index.yml',
  stability: APIBuilder.stability.experimental,
  category: 'Index Service',
  output: 'list-tasks-response.yml',
  title: 'Find tasks at indexes',
  description: [
    'List the tasks given their labels',
    '',
    'This endpoint',
    'lists up to 1000 tasks. If more tasks are present, a',
    '`continuationToken` will be returned, which can be given in the next',
    'request, along with the same input data. If the input data is different',
    'the continuationToken will have no effect.',
  ].join('\n'),
}, async function (req, res) {
  const indexes = req.body.indexes;
  await req.authorize({ indexPaths: indexes });
  const { continuationToken, tasks } = await helpers.taskUtils.findTasksAtIndexes(
    this.db,
    { indexes },
    { query: req.query },
  );

  res.reply({
    tasks: tasks.map(helpers.taskUtils.serialize),
    continuationToken,
  });
});

/** GET List namespaces inside another namespace */
builder.declare({
  method: 'get',
  route: '/namespaces/:namespace?',
  query: paginateResults.query,
  name: 'listNamespaces',
  scopes: 'index:list-namespaces:<namespace>',
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
  let namespace = req.params.namespace || '';

  await req.authorize({ namespace });

  // Query with given namespace
  const { continuationToken, rows } = await helpers.namespaceUtils.getNamespaces(
    this.db,
    { parent: namespace },
    { query: req.query },
  );

  res.reply({
    namespaces: rows.map(helpers.namespaceUtils.serialize),
    continuationToken,
  });
});

/** POST List namespaces inside another namespace */
builder.declare({
  method: 'post',
  route: '/namespaces/:namespace?',
  name: 'listNamespacesPost',
  scopes: 'index:list-namespaces:<namespace>',
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
  let namespace = req.params.namespace || '';
  await req.authorize({
    namespace,
  });

  // Query with given namespace
  const { continuationToken, rows } = await helpers.namespaceUtils.getNamespaces(
    this.db,
    { parent: namespace },
    { query: req.query },
  );

  res.reply({
    namespaces: rows.map(helpers.namespaceUtils.serialize),
    continuationToken,
  });
});

/** List tasks in namespace */
builder.declare({
  method: 'get',
  route: '/tasks/:namespace?',
  query: paginateResults.query,
  name: 'listTasks',
  scopes: 'index:list-tasks:<namespace>',
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
  const namespace = req.params.namespace || '';
  await req.authorize({
    namespace,
  });
  const { continuationToken, rows } = await helpers.taskUtils.getIndexedTasks(
    this.db,
    { namespace },
    { query: req.query },
  );

  res.reply({
    tasks: rows.map(helpers.taskUtils.serialize),
    continuationToken,
  });
});

builder.declare({
  method: 'post',
  route: '/tasks/:namespace?',
  name: 'listTasksPost',
  scopes: 'index:list-tasks:<namespace>',
  stability: 'deprecated',
  noPublish: true,
  output: 'list-tasks-response.yml',
  title: 'List Tasks',
  category: 'Index Service',
  description: [
    '(a version of listTasks with POST for backward compatibility; do not use)',
  ].join('\n'),
}, async function(req, res) {
  const namespace = req.params.namespace || '';
  await req.authorize({
    namespace,
  });
  const { continuationToken, rows } = await helpers.taskUtils.getIndexedTasks(
    this.db,
    { namespace },
    { query: req.query },
  );

  res.reply({
    tasks: rows.map(helpers.taskUtils.serialize),
    continuationToken,
  });
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
  let input = req.body;
  let namespace = req.params.namespace || '';

  // Authenticate request by providing parameters
  await req.authorize({ namespace });

  // Parse date string
  input.expires = new Date(input.expires);

  // Insert task
  return helpers.taskUtils.insertTask(
    this.db,
    namespace,
    input,
  ).then(function(task) {
    res.reply(helpers.taskUtils.serialize(task));
  });
});

builder.declare({
  method: 'delete',
  route: '/task/:namespace',
  name: 'deleteTask',
  stability: APIBuilder.stability.stable,
  scopes: 'index:delete-task:<namespace>',
  category: 'Index Service',
  title: 'Remove Task from Index',
  description: [
    'Remove a task from the index.  This is intended for administrative use,',
    'where an index entry is no longer appropriate.  The parent namespace is',
    'not automatically deleted.  Index entries with lower rank that were',
    'previously inserted will not re-appear, as they were never stored.',
  ].join('\n'),
}, async function(req, res) {
  await req.authorize({ namespace: req.params.namespace || '' });

  let [namespace, name] = helpers.splitNamespace(req.params.namespace || '');
  await this.db.fns.delete_indexed_task({
    namespace_in: namespace,
    name_in: name,
  });

  res.reply({});
});

/** Get artifact from indexed task */
builder.declare({
  method: 'get',
  route: '/task/:indexPath/artifacts/:name(*)',
  name: 'findArtifactFromTask',
  stability: APIBuilder.stability.stable,
  category: 'Index Service',
  scopes: 'queue:get-artifact:<name>',
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

  // Get indexPath and ensure that we have a least one dot
  indexPath = indexPath.split('.');

  // Find name and namespace
  let name = indexPath.pop() || '';
  let namespace = indexPath.join('.');

  // Load indexed task
  const task = helpers.taskUtils.fromDbRows(await this.db.fns.get_indexed_task(namespace, name));

  if (!task || task.expires <= new Date()) {
    return res.reportError('ResourceNotFound', 'Indexed task not found', {});
  }

  let isPublic = false;
  try {
    isPublic = await that.isPublicArtifact(artifactName);
  } catch {
    isPublic = false;
  }

  if (isPublic) {
    try {
      const artifact = await that.queue.latestArtifact(task.taskId, artifactName);
      if (artifact.url) {
        return res.redirect(303, artifact.url);
      }
    } catch {
      // fall through to queue redirect
    }
    const url = that.queue.externalBuildUrl(
      that.queue.getLatestArtifact,
      task.taskId,
      artifactName,
    );
    return res.redirect(303, url);
  }

  const url = that.queue.externalBuildSignedUrl(
    that.queue.getLatestArtifact,
    task.taskId,
    artifactName, {
      expiration: 15 * 60,
    },
  );
  return res.redirect(303, url);
});

builder.declare({
  method: 'get',
  route: '/__heartbeat__',
  name: 'heartbeat',
  scopes: null,
  category: 'Monitoring',
  stability: 'stable',
  title: 'Heartbeat',
  description: [
    'Respond with a service heartbeat.',
    '',
    'This endpoint is used to check on backing services this service',
    'depends on.',
  ].join('\n'),
}, function(_req, res) {
  // TODO: add implementation
  res.reply({});
});
