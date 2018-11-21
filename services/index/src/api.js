const _           = require('lodash');
const APIBuilder  = require('taskcluster-lib-api');
const helpers     = require('./helpers');
const Entity      = require('azure-entities');

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
  title:        'Task Index API Documentation',
  description: [
    'The task index, typically available at `index.taskcluster.net`, is',
    'responsible for indexing tasks. The service ensures that tasks can be',
    'located by recency and/or arbitrary strings. Common use-cases include:',
    '',
    ' * Locate tasks by git or mercurial `<revision>`, or',
    ' * Locate latest task from given `<branch>`, such as a release.',
    '',
    '**Index hierarchy**, tasks are indexed in a dot (`.`) separated hierarchy',
    'called a namespace. For example a task could be indexed with the index path',
    '`some-app.<revision>.linux-64.release-build`. In this case the following',
    'namespaces is created.',
    '',
    ' 1. `some-app`,',
    ' 1. `some-app.<revision>`, and,',
    ' 2. `some-app.<revision>.linux-64`',
    '',
    'Inside the namespace `some-app.<revision>` you can find the namespace',
    '`some-app.<revision>.linux-64` inside which you can find the indexed task',
    '`some-app.<revision>.linux-64.release-build`. This is an example of indexing',
    'builds for a given platform and revision.',
    '',
    '**Task Rank**, when a task is indexed, it is assigned a `rank` (defaults',
    'to `0`). If another task is already indexed in the same namespace with',
    'lower or equal `rank`, the index for that task will be overwritten. For example',
    'consider index path `mozilla-central.linux-64.release-build`. In',
    'this case one might choose to use a UNIX timestamp or mercurial revision',
    'number as `rank`. This way the latest completed linux 64 bit release',
    'build is always available at `mozilla-central.linux-64.release-build`.',
    '',
    'Note that this does mean index paths are not immutable: the same path may',
    'point to a different task now than it did a moment ago.',
    '',
    '**Indexed Data**, when a task is retrieved from the index the result includes',
    'a `taskId` and an additional user-defined JSON blob that was indexed with',
    'the task.',
    '',
    '**Entry Expiration**, all indexed entries must have an expiration date.',
    'Typically this defaults to one year, if not specified. If you are',
    'indexing tasks to make it easy to find artifacts, consider using the',
    'artifact\'s expiration date.',
    '',
    '**Valid Characters**, all keys in a namespace `<key1>.<key2>` must be',
    'in the form `/[a-zA-Z0-9_!~*\'()%-]+/`. Observe that this is URL-safe and',
    'that if you strictly want to put another character you can URL encode it.',
    '',
    '**Indexing Routes**, tasks can be indexed using the API below, but the',
    'most common way to index tasks is adding a custom route to `task.routes` of the',
    'form `index.<namespace>`. In order to add this route to a task you\'ll',
    'need the scope `queue:route:index.<namespace>`. When a task has',
    'this route, it will be indexed when the task is **completed successfully**.',
    'The task will be indexed with `rank`, `data` and `expires` as specified',
    'in `task.extra.index`. See the example below:',
    '',
    '```js',
    '{',
    '  payload:  { /* ... */ },',
    '  routes: [',
    '    // index.<namespace> prefixed routes, tasks CC\'ed such a route will',
    '    // be indexed under the given <namespace>',
    '    "index.mozilla-central.linux-64.release-build",',
    '    "index.<revision>.linux-64.release-build"',
    '  ],',
    '  extra: {',
    '    // Optional details for indexing service',
    '    index: {',
    '      // Ordering, this taskId will overwrite any thing that has',
    '      // rank <= 4000 (defaults to zero)',
    '      rank:       4000,',
    '',
    '      // Specify when the entries expire (Defaults to 1 year)',
    '      expires:          new Date().toJSON(),',
    '',
    '      // A little informal data to store along with taskId',
    '      // (less 16 kb when encoded as JSON)',
    '      data: {',
    '        hgRevision:   "...",',
    '        commitMessae: "...",',
    '        whatever...',
    '      }',
    '    },',
    '    // Extra properties for other services...',
    '  }',
    '  // Other task properties...',
    '}',
    '```',
    '',
    '**Remark**, when indexing tasks using custom routes, it\'s also possible',
    'to listen for messages about these tasks. For',
    'example one could bind to `route.index.some-app.*.release-build`,',
    'and pick up all messages about release builds. Hence, it is a',
    'good idea to document task index hierarchies, as these make up extension',
    'points in their own.',
  ].join('\n'),
  projectName:        'taskcluster-index',
  serviceName:        'index',
  apiVersion:         'v1',
  context:            ['queue', 'IndexedTask', 'Namespace'],
  params: {
    namespace:        helpers.namespaceFormat,
    indexPath:        helpers.namespaceFormat,
  },
});

module.exports = builder;

/** Get specific indexed task */
builder.declare({
  method:         'get',
  route:          '/task/:indexPath',
  name:           'findTask',
  stability:      APIBuilder.stability.stable,
  output:         'indexed-task-response.yml',
  title:          'Find Indexed Task',
  description: [
    'Find a task by index path, returning the highest-rank task with that path. If no',
    'task exists for the given path, this API end-point will respond with a 404 status.',
  ].join('\n'),
}, function(req, res) {
  var that = this;
  var indexPath = req.params.indexPath || '';

  // Get namespace and ensure that we have a least one dot
  indexPath = indexPath.split('.');

  // Find name and namespace
  var name  = indexPath.pop() || '';
  var namespace = indexPath.join('.');

  // Load indexed task
  return that.IndexedTask.query({
    namespace:    namespace,
    name:         name,
    expires:      Entity.op.greaterThan(new Date()),
  }).then(function(tasks) {
    if (_.isEmpty(tasks.entries)) {
      return res.reportError('ResourceNotFound', 'Indexed task has expired', {});
    }
    let task = tasks.entries[0];
    return res.reply(task.json());
  }, function(err) {
    // Re-throw the error, if it's not a 404
    if (err.code !== 'ResourceNotFound') {
      throw err;
    }
    return res.reportError('ResourceNotFound', 'Indexed task not found', {});
  });
});

/** GET List namespaces inside another namespace */
builder.declare({
  method:         'get',
  route:          '/namespaces/:namespace?',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name:           'listNamespaces',
  stability:      APIBuilder.stability.stable,
  output:         'list-namespaces-response.yml',
  title:          'List Namespaces',
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
  var that       = this;
  var namespace = req.params.namespace || '';
  let continuation  = req.query.continuationToken || null;
  let limit         = parseInt(req.query.limit || 1000, 10);
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
  method:         'post',
  route:          '/namespaces/:namespace?',
  name:           'listNamespacesPost',
  stability:      'deprecated',
  noPublish:      true,
  input:          'list-namespaces-request.yml',
  output:         'list-namespaces-response.yml',
  title:          'List Namespaces',
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
  var that       = this;
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
  method:         'get',
  route:          '/tasks/:namespace?',
  query: {
    continuationToken: Entity.continuationTokenPattern,
    limit: /^[0-9]+$/,
  },
  name:           'listTasks',
  stability:      APIBuilder.stability.stable,
  output:         'list-tasks-response.yml',
  title:          'List Tasks',
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
  var that       = this;
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
  method:         'post',
  route:          '/tasks/:namespace?',
  name:           'listTasksPost',
  stability:      'deprecated',
  noPublish:      true,
  output:         'list-tasks-response.yml',
  title:          'List Tasks',
  description: [
    '(a version of listTasks with POST for backward compatibility; do not use)',
  ].join('\n'),
}, async function(req, res) {
  var that       = this;
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
  method:         'put',
  route:          '/task/:namespace',
  name:           'insertTask',
  stability:      APIBuilder.stability.stable,
  scopes:         'index:insert-task:<namespace>',
  input:          'insert-task-request.yml',
  output:         'indexed-task-response.yml',
  title:          'Insert Task into Index',
  description: [
    'Insert a task into the index.  If the new rank is less than the existing rank',
    'at the given index path, the task is not indexed but the response is still 200 OK.',
    '',
    'Please see the introduction above for information',
    'about indexing successfully completed tasks automatically using custom routes.',
  ].join('\n'),
}, async function(req, res) {
  var that   = this;
  var input = req.body;
  var namespace = req.params.namespace || '';

  // Authenticate request by providing parameters
  await req.authorize({namespace});

  // Parse date string
  input.expires = new Date(input.expires);

  // Insert task
  return helpers.insertTask(
    namespace,
    input,
    that
  ).then(function(task) {
    res.reply(task.json());
  });
});

/** Get artifact from indexed task */
builder.declare({
  method:         'get',
  route:          '/task/:indexPath/artifacts/:name(*)',
  name:           'findArtifactFromTask',
  stability:      APIBuilder.stability.stable,
  scopes:         {if: 'private', then: 'queue:get-artifact:<name>'},
  title:          'Get Artifact From Indexed Task',
  description: [
    'Find a task by index path and redirect to the artifact on the most recent',
    'run with the given `name`.',
    '',
    'Note that multiple calls to this endpoint may return artifacts from differen tasks',
    'if a new task is inserted into the index between calls. Avoid using this method as',
    'a stable link to multiple, connected files if the index path does not contain a',
    'unique identifier.  For example, the following two links may return unrelated files:',
    '* https://index.taskcluster.net/task/some-app.win64.latest.installer/artifacts/public/installer.exe`',
    '* https://index.taskcluster.net/task/some-app.win64.latest.installer/artifacts/public/debug-symbols.zip`',
    '',
    'This problem be remedied by including the revision in the index path or by bundling both',
    'installer and debug symbols into a single artifact.',
    '',
    'If no task exists for the given index path, this API end-point responds with 404.',
  ].join('\n'),
}, async function(req, res) {
  var that = this;
  var indexPath = req.params.indexPath || '';
  var artifactName = req.params.name;

  await req.authorize({
    private: !/^public\//.test(artifactName),
    name: artifactName,
  });

  // Get indexPath and ensure that we have a least one dot
  indexPath = indexPath.split('.');

  // Find name and namespace
  var name  = indexPath.pop() || '';
  var namespace = indexPath.join('.');

  // Load indexed task
  return that.IndexedTask.load({
    namespace:    namespace,
    name:         name,
    expires:      Entity.op.greaterThan(new Date()),
  }).then(function(task) {
    // Build signed url for artifact
    var url = null;
    if (/^public\//.test(artifactName)) {
      url = that.queue.buildUrl(
        that.queue.getLatestArtifact,
        task.taskId,
        artifactName
      );
    } else {
      url = that.queue.buildSignedUrl(
        that.queue.getLatestArtifact,
        task.taskId,
        artifactName, {
          expiration:     15 * 60,
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
