# Task Index API Documentation

##

The task index, typically available at `index.taskcluster.net`, is
responsible for indexing tasks. The service ensures that tasks can be
located by recency and/or arbitrary strings. Common use-cases include:

 * Locate tasks by git or mercurial `<revision>`, or
 * Locate latest task from given `<branch>`, such as a release.

**Index hierarchy**, tasks are indexed in a dot (`.`) separated hierarchy
called a namespace. For example a task could be indexed with the index path
`some-app.<revision>.linux-64.release-build`. In this case the following
namespaces is created.

 1. `some-app`,
 1. `some-app.<revision>`, and,
 2. `some-app.<revision>.linux-64`

Inside the namespace `some-app.<revision>` you can find the namespace
`some-app.<revision>.linux-64` inside which you can find the indexed task
`some-app.<revision>.linux-64.release-build`. This is an example of indexing
builds for a given platform and revision.

**Task Rank**, when a task is indexed, it is assigned a `rank` (defaults
to `0`). If another task is already indexed in the same namespace with
lower or equal `rank`, the index for that task will be overwritten. For example
consider index path `mozilla-central.linux-64.release-build`. In
this case one might choose to use a UNIX timestamp or mercurial revision
number as `rank`. This way the latest completed linux 64 bit release
build is always available at `mozilla-central.linux-64.release-build`.

Note that this does mean index paths are not immutable: the same path may
point to a different task now than it did a moment ago.

**Indexed Data**, when a task is retrieved from the index the result includes
a `taskId` and an additional user-defined JSON blob that was indexed with
the task.

**Entry Expiration**, all indexed entries must have an expiration date.
Typically this defaults to one year, if not specified. If you are
indexing tasks to make it easy to find artifacts, consider using the
artifact's expiration date.

**Valid Characters**, all keys in a namespace `<key1>.<key2>` must be
in the form `/[a-zA-Z0-9_!~*'()%-]+/`. Observe that this is URL-safe and
that if you strictly want to put another character you can URL encode it.

**Indexing Routes**, tasks can be indexed using the API below, but the
most common way to index tasks is adding a custom route to `task.routes` of the
form `index.<namespace>`. In order to add this route to a task you'll
need the scope `queue:route:index.<namespace>`. When a task has
this route, it will be indexed when the task is **completed successfully**.
The task will be indexed with `rank`, `data` and `expires` as specified
in `task.extra.index`. See the example below:

```js
{
  payload:  { /* ... */ },
  routes: [
    // index.<namespace> prefixed routes, tasks CC'ed such a route will
    // be indexed under the given <namespace>
    "index.mozilla-central.linux-64.release-build",
    "index.<revision>.linux-64.release-build"
  ],
  extra: {
    // Optional details for indexing service
    index: {
      // Ordering, this taskId will overwrite any thing that has
      // rank <= 4000 (defaults to zero)
      rank:       4000,

      // Specify when the entries expire (Defaults to 1 year)
      expires:          new Date().toJSON(),

      // A little informal data to store along with taskId
      // (less 16 kb when encoded as JSON)
      data: {
        hgRevision:   "...",
        commitMessae: "...",
        whatever...
      }
    },
    // Extra properties for other services...
  }
  // Other task properties...
}
```

**Remark**, when indexing tasks using custom routes, it's also possible
to listen for messages about these tasks. For
example one could bind to `route.index.some-app.*.release-build`,
and pick up all messages about release builds. Hence, it is a
good idea to document task index hierarchies, as these make up extension
points in their own.

## Index Client

```js
// Create Index client instance:

const index = new taskcluster.Index(options);
```

## Methods in Index Client

```js
// index.findTask :: indexPath -> Promise Result
index.findTask(indexPath)
```

```js
// index.listNamespaces :: (namespace -> [options]) -> Promise Result
index.listNamespaces(namespace)
index.listNamespaces(namespace, options)
```

```js
// index.listTasks :: (namespace -> [options]) -> Promise Result
index.listTasks(namespace)
index.listTasks(namespace, options)
```

```js
// index.insertTask :: (namespace -> payload) -> Promise Result
index.insertTask(namespace, payload)
```

```js
// index.findArtifactFromTask :: (indexPath -> name) -> Promise Nothing
index.findArtifactFromTask(indexPath, name)
```

```js
// index.ping :: () -> Promise Nothing
index.ping()
```

