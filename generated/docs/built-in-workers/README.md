# Taskcluster Built-In Workers

This service implements the `built-in/succeed` and `built-in/fail` workerTypes, which simply succeed or fail immediately.
Such workerTypes are useful the same way the `true` and `false` commands are useful in UNIX.
For example, sometimes when testing a large combination of tasks, it's helpful to replace a task that's not relevant to your work with `built-in/succeed` to avoid wasting time and energy running that task.

# Service Owner

Service Owner: dustin@mozilla.com
