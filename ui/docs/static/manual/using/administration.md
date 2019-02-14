---
filename: using/administration.md
title: Project Administration
order: 90
---

Most of the tools site is dedicated to what can be considered "administrative"
tasks.

The [namespaces document](/docs/manual/design/namespaces) describes "projects".
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
[Taskcluster-CLI](https://github.com/taskcluster/taskcluster-cli) and
[Taskcluster-Admin](https://github.com/taskcluster/taskcluster-admin) tools may
be helpful in this regard.

Bear in mind that configuration changes are far removed from your project's
source code. Best practice suggests putting as much of your logic as possible
into the source, and minimizing what must be configured via administrative
changes. In particular, try to keep hooks simple: check out the source and
invoke a script. Any more complexity may become difficult to manage in the
administrative UI.

# Access control management rules

Projects of various size and level of support make use Taskcluster and are managed in very different ways. The general rules below explain the responsibilities of various teams in managing access controls.

## Unmanaged projects (experiments, young products, etc.)

Unmanaged projects are self-serve and the developers are responsible for managing their own configuration, secrets, etc. They are often hosted on GitHub and need to be initially created by a member of the Taskcluster team before being handed off to the developers. The following rules apply:

* Developers are autonomous and responsible for managing access controls, scopes and permissions securely.
* Taskcluster team provides administrative support to bootstrap the project
* Release engineering is not involved until the project "graduate" and is moved to their purview

## Managed projects (core products, etc.)

* Taskcluster team manages the taskcluster service. It has permissions to create new projects and delegates permissions to
    - Developers for unmanaged projects
    - Release engineering team for managed projects
* Taskcluster team drops its privileges to managed projects once they are handed over to release engineering. At this point, making a change to a managed project requires releng sign off.
* Release engineering is responsible for reviewing and approving all permission changes to managed projects.
* Release engineering is responsible for maintaining tooling to manage, review and audit the scopes on projects it is responble for.
