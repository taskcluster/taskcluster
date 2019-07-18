---
title: Task Logs
---

Tasks typically log their progress to an artifact named `public/logs/live.log`

The details of this artifact, such as its storage type and encoding, can differ from worker to worker.
You should not assume anything about it, as the implementation may change dynamically to optimize performance.
In particular, note that fetching the resource may involve following a sequence of redirects.

The Taskcluster UI assumes this convention and displays the `public/logs/live.log` artifact as the primary task log.

While a task is running, some workers can relay data to the client as it is produced, in a single HTTP request - a form of long polling.
Clients can parse and display this data as it arrives over the HTTP connection to present a "live log" to the user.

Not all tasks will have a log -- for example, the built-in `success` and `failure` workers produce no artifacts at all.
