---
title: Debugging a Task
---

# Debugging a Task

Tasks which run in Docker can often be debugged locally, and any task can be
debugged through Taskcluster.

For failures that appear to originate within the task itself, consider
debugging locally. For failures that appear to come from Taskcluster's
features, debug with Taskcluster.

## Debugging locally

You can run a task on any computer with Docker installed.

First, navigate to your task in the Task Inspector and select the "task details" tab.

If the `payload` section of the task details specifies any
[features](/docs/reference/workers/docker-worker/docs/features)
or
[capabilities](/docs/reference/workers/docker-worker/docs/payload),
additional setup may be needed in order to successfully run the task locally.

Find the `image` section of the task details. If the image ID is a string, you
can run the image locally with `docker run --rm --ti your-image-string bash
-li`.

If the image is configured in another way, consult your project's
documentation for troubleshooting instructions.

## Debugging with Taskcluster

Taskcluster has an "interactive" mode with which you can get a terminal and/or
VNC connection to a running task execution environment.

There are two ways to access this mode. The easiest is to enter the task's ID
in the Task Inspector. Under
"actions", select "Create with SSH/VNC task". If you have permission to create
tasks directly (rather than by pushing to a version-control server) then you
can use this option. Some projects also provide
[actions](/docs/manual/using/actions) to create
interactive tasks. You will need to be signed in, of course!

Once the new task starts, click the big "shell" button, and there you are.

The slightly harder way is to re-create the task with
`task.payload.features.interactive` set to `true`.  You can do this directly
by calling the `queue.createTask` API method, or for a gecko task by adding
`--interactive` to your try invocation.

---

## Using the Shell

A few notes are in order before you get too excited about your newfound shell access:

 * The original task command executes anyway.  You can, of course, kill it manually.
 * The shell stays open until there are no active connections, but only until the task's `maxRunTime` expires, at which time it will be forcibly terminated.
 * Tasks generally run on EC2 spot instances which can be killed at any time.

All of which is to say, this is a good environment for poking around to see
what's going on, but you may find yourself disappointed if you try to use it as
a development environment.
