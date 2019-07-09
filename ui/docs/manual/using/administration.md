---
filename: using/administration.md
title: Project Administration
order: 90
---

Most of the tools site is dedicated to what can be considered "administrative"
tasks.

The [namespaces document](/docs/manual/using/namespaces) describes "projects".
Project administrators are those with the `project-admin:<project>` role. With
this role comes great power:

 * Manage hooks with hookGroupId `project-<project>`
 * Manage Auth service clients with clientIds starting with `project/<project>/`
 * Manage Auth service roles with roelIds starting with `project/<project>/`
 * Manage the index namespace `project.<project>`
 * Manage the scope namespace `project:<project>:*`
 * Manage private artifacts beginning with `project/<project>/`
 * Manage secrets beginning with `project/<project>/`
 * Assume roles `project-grants:<project>/*`

Some other actions require help from the Taskcluster team; we are working on
making administration more self-serve, but we are not there yet. File a bug in
the Taskcluster :: Service Requests component for help.

Any administrative task you can perform with the Tools site is simply making
API calls to Taskcluster services, so it can be automated.  The
[Taskcluster-CLI](https://github.com/taskcluster/taskcluster-cli) tool may be
helpful in this regard.

Bear in mind that configuration changes are far removed from your project's
source code. Best practice suggests putting as much of your logic as possible
into the source, and minimizing what must be configured via administrative
changes. In particular, try to keep hooks simple: check out the source and
invoke a script. Any more complexity may become difficult to manage in the
administrative UI.
