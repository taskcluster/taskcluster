TaskCluster - Treeherder Integration
====================================

This component reports task progress to Treeherder. For a task to be reported
it must have the custom route `treeherder.<project>.<revisionHash>`, where
`<project>` is the Treeherder project name and `<revisionHash>` identifies the
Treeherder result-set that tasks should be reported to.

In addition to the custom route the task must also have an extra section
called `treeherder` with the keys: `symbol`, `groupName`, `groupSymbol` and
`productName`. A task that should be reported to treeherder must take a form
as follows:

```js
{
  routes: [
    'treeherder.<project>.<revisionHash>'
  ],
  ...,
  metadata: {
    // Name and who of task in Treeherder UI
    name:             "My Task",
    owner:            "nobody@localhost.local"
    ...
  }
  extra: {
    treeherder: {
      // Properties displayed in Treeherder UI
      symbol:         "SYM",
      groupName:      "MyGroupName",
      groupSymbol:    "GRP",
      productName:    "MyProductName"
    },
    ...
  }
}
```

For this to work, taskcluster-treeherder must be configured oauth credentials
for the Treeherder projects it should report to. See `config/defaults.json` for
details.


Development
===========

To run tests against localhost you must run a local instance of treeherder under
vagrant, this is unfortunately non-trivial, see Treeherder documentation for
details of how to configure your host environment.

When Treeherder is running on `local.treeherder.mozilla.org` locally you must
generate oauth credentials (see Treeherder documentation), and
copy the contents of `treeherder-services/treeherder/etl/data/credentials.json`
into the `treeherder.projects` property of `taskcluster-treeherder.conf.json`
as a JSON string.

To provide taskcluster credentials, influxdb connection string and AMQP
connection string, you also add provide these in
`taskcluster-treeherder.conf.json`, see `config/defaults.js` for details on
these values. You might also want to use a different route prefix, like
`treeherder-local`.
