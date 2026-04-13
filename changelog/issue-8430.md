audience: users
level: minor
reference: issue 8430
---
The GitHub service now supports triggering Taskcluster hooks directly from
`.taskcluster.yml`. Add a `hooks` array to your config to trigger one or more
hooks on push, pull request, or other events:

```yaml
hooks:
  - name: taskgraph/decision
    context:
      project: myproject
```

Each hook is triggered via the `hooks.triggerHook` API with a payload
containing `event`, `now`, `taskcluster_root_url`, `tasks_for`, `taskId`, and
the user-defined `context`. `hooks` and `tasks` may be used together in the same
`.taskcluster.yml`. `autoCancelPreviousChecks` applies to hooks the same way it
does to tasks.
