---
filename: design/namespaces.md
title: Namespaces
order: 30
---

Taskcluster has a number of namespaces defined to allow multiple users to get
along without interfering with one another.  The platform itself is agnostic to
the structure of these namespaces, but infrastructure that interacts with the
platform is dependent on the namespaces for security and correctness.

This document necessarily contains information that is specific to users of the
Taskcluster platform.  As such, it is open to contributions from all users who
wish to carve out a section of a namespace -- just [submit a pull
request](https://github.com/taskcluster/taskcluster-docs).

---

## Projects

Most work at Mozilla falls into "projects", and these provide a nice
organizational boundary for controlling access.  We use a consistent name for
each project in the various namespaces below -- something simple and without
punctuation.  The known projects can be seen by looking for scopes containing
`project-admin:` using the [scope-explorer](https://tools.taskcluster.net/auth/scopes).

To obtain a project file a _service request_ with your taskcluster administrator.

---

## Scopes

Many scopes reflect the namespaces given elsewhere in this document, as described in the API documentation for the service.

* `<service>:<action>:<details>` -
   Scopes for most Taskcluster services follow this pattern.
   For example, the `queue.defineTask` call is governed by a scope beginning with `queue:define-task:<details>`, where the details describe a hierarchy of task attributes.
   In cases where an action may be limited along any of several dimensions, each of those dimensions should be a separate scope.

* `project:<project>:…` -
   Individual projects should use scopes with this prefix.
   Projects are free to document the contained namespace in this document, link to another document, or leave it undocumented.

---

## Clients

Client names describe the entity making an API call.
They are used for logging and auditing, but not for access control -- all access control is performed with scopes.
Client IDs have the following forms:

 * `static/*`, Clients with names prefixed `static/` are statically configured in the taskcluster deployment.
   They cannot be created, modified or deleted at runtime. These are used for bootstrapping services and creating
   initial clients and roles.

 * `static/taskcluster/*`, Clients with the prefix `static/taskcluster/` are reserved for taskcluster services.

 * `mozilla-ldap/<email>` -
   Clients with this name belong to users who have been authenticated against the Mozilla LDAP database.
   These are temporary credentials issued by [Taskcluster-Login](https://github.com/taskcluster/taskcluster-login).

 * `email/<email>` -
   Clients with this name belong to users who have been authenticated by email verification, conferring a lower level of trust than Mozilla LDAP.
   These are temporary credentials issued by [Taskcluster-Login](https://github.com/taskcluster/taskcluster-login).

 * `mozilla-ldap/<email>/*`,
   `email/<email>/*` -
   Clients with this form are managed by the user identified by the prefix.
   The portion of the name matching `*` is at the discretion of the user.

 * `project/taskcluster/<service>/<environment>` -
   Taskcluster services' own credentials have this form.

 * `task-client/<taskId>/<runId>/on/<workerGroup>/<workerId>/until/<expiration>` -
   Clients of this form represent specific tasks, and are issued by the queue in the form of temporary credentials.

 * `project/<project>/*` -
   Clients for a specific project have this prefix.
   Administrators for the project are granted control over this namespace, and may further subdivide it as they see fit.
   They are welcome to document those subdivisions here.

 * `garbage/*` -
   Playground for testing; clients here should not be active in the wild.
   Likewise, deleting or modifying clients with this prefix will not cause production failures.

---

## Roles

Most roles are defined by some kind of automatic usage in a Taskcluster service.
However, some are defined by convention.
Both are listed here:

* `everybody` -
   This role is granted to anyone who authenticates via the login service.

* `hook-id:<hookGroupId>/<hookId>` -
   Roles of this form give the scopes used to create tasks on behalf of hooks.

* `moz-tree:level:<level>` -
   Roles of this form include the basic scopes available to version-control trees at each of the three Mozilla source-code management levels.
   They are useful as shorthand to configure `repo:*` roles.
   See [Mozilla Commit Access Policy](https://www.mozilla.org/en-US/about/governance/policies/commit/access-policy/) for information on levels.

* `mozilla-group:<groupName>` -
   Roles of this form represent the scopes available to members of the given Mozilla LDAP group via the login service.

* `mozillians-group:<groupName>` -
   Roles of this form represent the scopes available to members of the given Mozillians group via the login service.

* `project:<project>:…` -
   Roles of this form are controlled by the corresponding project.

* `project-admin:<project>` -
   Roles of this form represent the scopes accorded to administrators of the given project.
   This role is then be assumed by the appropriate groups.
   See [administration](/docs/manual/using/administration) for more information.

* `project-grants:<project>/<grantName>` -
   Roles on this form is used to grant additional scopes to the administrators of a project,
   without creating a role the project administrators can modify.

* `repo:<host>/<path>:branch:<branch>`,
  `repo:<host>/<path>:pull-request` -
   Roles of this form represent scopes available to version-control pushes and pull requests.

* `repo:<host>/<path>:cron:<jobName>` -
   Roles of this form are used for cron jobs by the periodic task-graph generation support in Gecko.

* `worker-type:<provisionerId>/<workerType>` -
   Roles of this form represent scopes available to workers of the given type.

---

## Artifacts

Artifacts are named objects attached to tasks, and available from the queue service.
Artifact names are, by convention, slash-separated.

* `public/…` -
   The queue allows access to any artifact that begins with `public/` without any kind of authentication.
   Public names are not further namespaced: tasks can create any public artifacts they like.
   As such, users should not assume that an artifact with this prefix was created by a known process.
   In other words, any task can create an artifact named `public/build/firefox.exe` , so do not trust such a file without verifying the trustworthiness of the task.

* `private/…` -
   Artifact names with this prefix are considered non-public, but access to them is otherwise quite broadly allowed (e.g., to all Mozilla employees, contractors and community members under NDA).
   In general, users with narrower requirements than "not public" should select a different prefix and add it to this document.

* `private/docker-worker/…` -
   Artifact names with this prefix are considered non-public, but access to them is otherwise quite broadly allowed to everybody with commit-level 1 access, regardless of NDA state.

* `private/interactive/…` -
   Artifacts required to access interactive sessions, this prefix is considered non-public, but is made available to commit-level 1 users, contributors and community members.

* `repo/<host>/<path>/…` -
   Artifacts private to a specific repository, sub-scopes can be delegated through repository specific patterns.

* `project/<project>/…` -
   Artifact names with this prefix are the responsibility of the project, which may have further namespace conventions.

* `login-identity/<identity>/…`
   Artifact names with this prefix are the responsibility of the user with the given [login identity](/docs/reference/core/login).
   This namespace enables tasks to persist data that is only readable by a single user (typically the user that submitted it), such as loaner credentials.

Note, highly confidential data should not be stored in unencrpyted taskcluster
artifacts, since they are only protected by a single (fallible) system. If
highly sensitive data needs to be persisted, it is recommended to encrypt data
using the public key of a key-pair whose private key has been highly secured,
in order that at least two independent systems protect the data.

---

## Hooks

Hooks are divided into "hook groups", for which the namespace is defined here.
Within a hook group, the names are arbitrary (or defined by the project).

* `taskcluster` - hooks used internally for Taskcluster maintenance
* `project-<project>` - hooks for a specific project
* `garbage` - playground for testing; hooks can be created here, but anyone can modify or delete them!

---

## Worker Types

Worker types are broken down into `<provisionerId>` and `<workerType>`.
Provisioner IDs are issued individually, with no namespacing.
Worker types are specific to the provisioner ID, but provisioners that provide general services (currently that means `aws-provisioner-v1`) should follow the following guidelines:

* `<project>-*` - worker types designed for a specific project; the suffix is arbitrary and up to the project
* `gecko-t-*` - worker types for gecko tests; the suffix is arbitrary
* `gecko-L-b-*` - worker types for gecko builds, with `L` replaced with the SCM level; the suffix is arbitrary
* `ami-test*` - worker types for testing deployment of new AMIs
* `tutorial` - default worker type for the getting-started tutorial in this documentation
* `github-worker` - default worker type for Github-triggered jobs
* `hg-worker` - default worker type for Mercurial-triggered jobs

Note that there are many worker types not following this convention, as worker types must be kept around for a long time to run old jobs.

---

## Worker IDs

Worker IDs are broken down into `<workerGroup>` and `<workerId>`.
In the present implementation, both of these are arbitrary strings.
For workers started by the AWS provisioner, they are avaiability zone and instance ID, respectively.
For other worker types, anything goes.

---

## Provisioner IDs

Provisioner IDs are limited to 22 characters.
We do not subdivide namespaces; instead, they are enumerated here:

 * `aws-provisioner-v1` -- the AWS provisioner
 * `buildbot-bridge` -- the AWS provisioner
 * `scriptworker-prov-v1` -- the scriptworker provisioner
 * `proj-<name>` -- pattern for projects with custom hardware workers.

---

## Scheduler IDs

Scheduler IDs are limited to 22 characters.
We do not subdivide namespaces; instead, they are enumerated here:

 * `tc-diagnostics` -- the Taskcluster diagnostics tool
 * `taskcluster-github` -- the Taskcluster Github integration
 * `gecko-level-<level>` -- Gecko tasks
 * `canary-harvester` -- Used by [canary harvester](https://github.com/mozilla/canary-harvester) [hooks](/docs/reference/core/taskcluster-hooks)

---

## Docker-Worker Caches

Docker-worker caches are located on individual worker instances, and thus may be shared among tasks with the same workerType.
The namespaces for these caches help to avoid collisions and prevent cache-poisoning attacks.

Cache names do not contain directory separators.

* `gaia-…` -
  Caches with this prefix are used by gaia builds, limited to the https://github.com/mozilla-b2g/gaia repository

* `tooltool-cache` -
  This cache contains cached downloads from tooltool.
  Since tooltool is content-addressible, and verifies hashes on files in the cache, there is no risk of cache poisoning or collisions.

* `level-<level>-<tree>-…` -
  Caches with these prefixes correspond to tasks at the corresponding SCM levels.
  See [Mozilla Commit Access Policy](https://www.mozilla.org/en-US/about/governance/policies/commit/access-policy/) for information on levels.
  The rest of this namespace is free-form and generally divided by task type, with the following common cases:

  * `level-<level>-<tree>-decision` - decision task workspace
  * `level-<level>-<tree>-tc-vcs` `level-<level>-<tree>-tc-vcs-public-sources` - Taskcluster-vcs caches
  * `level-<level>-<tree>-linux-cache` - cache of `~/.cache`, containing Python packages among other things
  * `level-<level>-<tree>-build-<platform>` - workspace cache for builds for the given platform

---

## Secrets

Secrets provide key-value storage governed by scopes.
As such, it's very important that secrets not be unexpectedly made accessible to users who should not see them.
Secret names have the following structure:

* `garbage/<ircnick>/` -
  Secrets with this prefix are not actually secret - lots of people have access to them.
  This is a place to test out interfaces to the secrets API, but do not store anything important here.

* `project/<project>/` -
  Secrets with this prefix are the exclusive domain of the given project.
  Users not associated with a project should not be given scopes associated with the project's secrets!

* absolute name `repo:<host>/<path>:branch:<branch>` or prefix `repo:<host>/<path>:branch:<branch>:` -
  For secrets that should only be available to a single branch of a repository, and not other branches or forks of that repository.
  The first form is for a single secret object containing all secrets; the second form is for using multiple secret objects.
* `repo:<host>/<path>:pull-request` -
  Secrets named in this manner will be available to repository forks, branches, and pull requests via the corresponding roles.

---

## Indexes

The index provides a nice, dot-separated hierarchy of names. When using these as AMQP routes, they are prefixed with `index.`, so for example the project 'foo' might route messages about its level 3 repository tasks to routes starting with `index.project.foo.level-3.…`

* `buildbot` - the "old" index for Buildbot builds; do not use

* `funsize.v1` -
   Tasks indexed under this tree represent funsize tasks.
   These are the responsibility of the release engineering team.

* `gaia.npm_cache.<nodever>.<platform>.<revision>` -
   Tasks indexed here have generated the `node_modules` directory required for the given revision.
   These are the responsibility of the B2G automation team.

* `garbage.<ircnick>` -
   Anything goes under this index path.
   Use this for development and experimentation.

* `gecko.v1` - another "old" index for builds; do not use

* `gecko.v2.<tree>.revision.<revision>.<platform>.<build>`,
* `gecko.v2.<tree>.latest.<platform>.<build>` -
   Index for Gecko build jobs, either by revision or for the latest job with the given platform and build.
   These are the responsibility of the release engineering team.

* `gecko.cache.level-<level>.<kind>.v1.<name>.<hash>`, Index for cached objected used by gecko.
   Where `<level>` is the commit-level 1 through 3, `<kind>` is the kind of object cached (eg. 'toolchains'), and
   `<name>.<hash>` is a suggested pattern for how to organize cached objects.

* `tc-vcs.v1` -
   Tasks indexed under this prefix represent caches used by the Taskcluster VCS tool to avoid crushing version-control hosts.
   These are the responsibility of the Taskcluster team.

* `project.<project>.…` -
  Tasks indexed under this prefix are the domain of the respective project.

* `github.<organization>.<repository>.` prefix for github repository specific index namespaces.
