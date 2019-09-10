# Index Service

The index service provides a service that indexes successfully completed tasks.

Tasks are indexed either based on pulse messages from the queue with routing keys of the format `route.index.<namespace>` or (less frequently) via calls to the `insertTask` API method.

## Index Hierarchy

Tasks are indexed in a dot (`.`) separated hierarchy called a namespace.
For example, a task could be indexed with the index path `some-app.<revision>.linux-64.release-build`.
In this case the following namespaces are created.

 1. `some-app`,
 1. `some-app.<revision>`, and,
 1. `some-app.<revision>.linux-64`

Inside the namespace `some-app.<revision>` you can find the namespace `some-app.<revision>.linux-64` inside which you can find the indexed task `some-app.<revision>.linux-64.release-build`.
This is an example of indexing builds for a given platform and revision.

## Task Rank

When a task is indexed, it is assigned a `rank` (defaults to `0`).
If another task is already indexed in the same namespace with lower or equal `rank`, the index for that task will be overwritten.
For example consider index path `mozilla-central.linux-64.release-build`.
In this case one might choose to use a UNIX timestamp or mercurial revision number as `rank`.
This way the latest completed linux 64 bit release build is always available at `mozilla-central.linux-64.release-build`.

Note that this does mean index paths are not immutable: the same path may point to a different task now than it did a moment ago.

## Indexed Data

When a task is retrieved from the index the result includes a `taskId` and an additional user-defined JSON blob that was indexed with the task.

## Entry Expiration

all indexed entries must have an expiration date.
Typically this defaults to one year, if not specified.
If you are indexing tasks to make it easy to find artifacts, consider using the artifact's expiration date.
This is the default behavior when tasks are indexed in response to Pulse messages.

## Valid Characters

All keys in a namespace `<key1>.<key2>` must be in the form `/[a-zA-Z0-9_!~*'()%-]+/`.
Observe that this is URL-safe and that if you strictly want to put another character you can URL encode it.

## Indexing Routes

Tasks can be indexed using the `insertTask` API method, but the most common way to index tasks is adding a custom route to `task.routes` of the form `index.<namespace>`.
This will result in a Pulse message with routing-key `route.index.<namespace>`.
In order to add this route to a task you'll need the scope `queue:route:index.<namespace>`.
When a task has this route, it will be indexed when the task is **completed successfully**.
The task will be indexed with `rank`, `data` and `expires` as specified in `task.extra.index`.
For example:

```yaml
  payload:  { /* ... */ },
  routes:
    # index.<namespace> prefixed routes, tasks CC'ed such a route will be indexed
    # under the given namespace (note, that the namespace may contain spaces)
    - index.hg-mozilla-org.mozilla-central.nightly.linux64.debug-build
    - index.hg.<revision>.nightly.linux64.debug-build
  extra:
    # Optional details for indexing service
    index:
      # Ordering, this taskId will overwrite any thing that has
      # rank <= 4000, if not provided zero will always assumed and
      # paths will be overwritten with latest taskId and data if the were also
      # set with rank zero.
      rank: 4000

      # Specified when the entries expires. max 1 year, defaults to 1 year if not
      # provided
      expires: new Date().toJSON()

      # A little informal data to store along with taskId
      data: {
        hgRevision: "..."
        commitMessage: "..."
```

**Remark**: When indexing tasks using custom routes, it's also possible to listen for messages about these tasks.
For example one could bind to `route.index.some-app.*.release-build`, and pick up all messages about release builds.
Hence, it is a good idea to document task index hierarchies, as these make up extension points in their own.
