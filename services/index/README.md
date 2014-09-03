TaskCluster - Task Index
========================

The task _index_ provides a service that indexes successfully completed tasks.
To get a task indexed you must add routes on the form `index.<namespace>`, where
`<namespace>` is a dot separated hierarchy **without any slashes**.

**Example**, see the example below for how to specify routes and keys for
indexing.

```js
{
  payload:  { /* ... */ },
  routes: [
    // index.<namespace> prefixed routes, tasks CC'ed such a route will be indexed
    // under the given namespace (note, that the namespace may contain spaces)
    "index.hg-mozilla-org.mozilla-central.nightly.linux64.debug-build",
    "index.hg.<revision>.nightly.linux64.debug-build"
  ],
  extra: {
    // Optional details for indexing service
    index: {
      // Ordering, this taskId will overwrite any thing that has
      // rank <= 4000, if not provided zero will always assumed and
      // paths will be overwritten with latest taskId and data if the were also
      // set with rank zero.
      rank:       4000,

      // Specified when the entries expires. max 1 year, defaults to 1 year if not
      // provided
      expires:          new Date().toJSON(),

      // A little informal data to store along with taskId
      data: {
        hgRevision: "...",
        commitMessae: "...",
        whatever...
      }
    },
    // Extra properties for other services...
  }
  // Other task properties...
}
```

When a task is indexed you can browse the namespaces, list tasks within a
namespace. Or get the latest task from a fully qualified namespace.
See [API documentation](http://docs.taskcluster.net) for further details.
