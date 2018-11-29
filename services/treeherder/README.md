TaskCluster - Treeherder Integration
====================================


taskcluster-treeherder is a service that will respond to TaskCluster task events
(e.g. task completed, task failed, etc) and compose a Treeherder job pulse message
to report task status to Treeherder.

# Task Configuration

## Task Route

For a task to be reported to treeherder, it must have the custom route in the form of:
`<treeherder destination>.v2.<project>.<revision>.<push/pullrequest ID>`

For job messages to appear on Treeherder production, the destination of `tc-treeherder` should
be used.  Also, `tc-treeherder-staging` could be used for reporting jobs to the Treeherder
staging environment.

Note: Github repos should use the `project` form of `<user>/<project>` to be recognized
as a github source.

## Treeherder job configuration

All jobs that are reported to Treeherder must have some basic information about the job
itself, such as job symbol, job name, platform, etc.

This configuration needs to be declared in the task definition under `task.extra.treeherder`
and is validated against a [published schema](https://schemas.taskcluster.net/treeherder/v1/task-treeherder-config.json#).

## Example  Task

```js
{
  routes: [
    'tc-treeherder.v2.mozilla-inbound.8faa67ad6d0fda3ccf884c90acfd061d37e8558d.1246'
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


# Job Pulse Messages

Pulse messages are published to the exchange `exchange/taskcluster-treeherder/v1/jobs`.

Consumers, such as Treeherder, can subscribe to this exchange and receive job messages
as events occur.

## Routing Key

Routing keys for these job messages are in the form of `<destination>.<project>.<reserved>`.

Reserved is a space in the routing key that could be used later on for more information
to be included.  This could include revision, owner identifier, etc.

As an example, a job message destined for the Treeherder staging instance and for the project
mozilla-inbound might look like:

`treeherder-staging.mozilla-inbound._`

Consumers can subscribe to all messages by using a routing key pattern of `#`
when binding to the exchange.  Optionally, consumers could also narrow down the
messages that are concerned about, such as only a particular destination
(`<destination>.#`) or a project (`*.<project>`).

## Schema

All jobs messages must validate against a [published schema](https://schemas.taskcluster.net/treeherder/v1/pulse-job.json#).
Any jobs that do not match this schema will be reported in the application logs and
an administrator of the application can review the logs if a job is not appearing
on the pulse exchange.

In the future, these errors might be reported to Treeherder for end users to get
clearer feedback.

# Post-deployment Verification

Upon deploying a new version of this service, investigate heroku and/or papertrail
logs for any errors.  Also, the [pulse inspector](https://tools.taskcluster.net/pulse-inspector)
can be used to subsribe to the exchange and inspect the pulse messages that are being
produced.


# Service Owner

Service Owner: bstack@mozilla.com
