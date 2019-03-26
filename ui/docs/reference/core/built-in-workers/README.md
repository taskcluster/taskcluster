# Built-In Workers Service

This service implements the `built-in/succeed` and `built-in/fail` workerTypes, which simply succeed or fail immediately.
Such workerTypes are useful the same way the `true` and `false` commands are useful in UNIX.
For example, sometimes when testing a large combination of tasks, it's helpful to replace a task that's not relevant to your work with `built-in/succeed` to avoid wasting time and energy running that task.

## Usage

To use this service, create a task with

```yaml
provisionerId: built-in
workerType: succeed  # or fail
payload: {}
```

That's it!
When the task executes (which may not be immediately, for example if it has dependencies), it will resolve immediately as successful or failed.
All other queue functionality is available as usual, routes and dependencies being the most useful features.
