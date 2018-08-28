---
title: .taskcluster.yml version 1
order: 20
---

Your main interface to Taskcluster-Github is via `.taskcluster.yml` in the root of your project. This is a YAML file that specifies the tasks to run and when.

The format of the file is:

```yaml
version: 1
policy:
  pullRequests: ..
tasks:
  - (task definition)
  - ...
```

The core of Taskcluster-Github's operation is this: when an event occurs on Github, such as a push or a pull request, it loads `.taskcluster.yml` from the commit specified in the event, renders it with JSON-e, and then calls `Queue.createTask` for each of the specified tasks.

# Policies

The `policy` property defines policies for what is allowed on the repository. Policies are always read from the default branch (generally `master`) of the repository. This prevents a malicious contributor from changing the policy applied to a pull request in the pull request itself.

Policies are not rendered as a part of a task.

## Pull Requests

Most projects prefer to run tasks for each pull request, so that the review process can take into account the task results. But if your project requires some secret data or uses some expensive service to test a pull request, then you probably do not want to run tasks for pull requests written by arbitrary contributors, but would still like to run tasks for PRs by project collaborators.

The `pullRequests` policy controls this behavior:

* `public` -- tasks are created for all pull requests.

* `collaborators` (the default) -- tasks are created if the user who made the pull request is a collaborator on the repository.
Github [defines
  collaborators](https://developer.github.com/v3/repos/collaborators/#list-collaborators) as "outside collaborators, organization members with access through team memberships, organization members with access through default organization permissions, and organization owners."

Example:
```yaml
policy:
  pullRequests: public
tasks: ...
```

# JSON-e Rendering

The `tasks` property in the YAML file is rendered using [JSON-e](https://github.com/taskcluster/json-e). You can view it as a *template*. The following *context* variables are provided:

* `tasks_for` - defines the type of event, one of `github-push`,
  `github-pull-request` or `github-release`.

* `event` - the raw Github Webhook event; see
  * [PushEvent](https://developer.github.com/v3/activity/events/types/#pushevent)
  * [PullRequestEvent](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
  * [ReleaseEvent](https://developer.github.com/v3/activity/events/types/#releaseevent)

* `now` - the current time, as a string; this is useful for reproducible `$fromNow` invocations (see JSON-e documentation)

* `as_slugid` - a function which, given a label, will generate a slugid. Multiple calls with the same label for the same event will generate the same slugid, but different slugids in different events.  Use this to generate taskIds, etc.

Although the Github documentation does not make it clear, each ref that is updated in a `git push` operation triggers a distinct event.

## Result

After rendering, the resulting data structure should have a `tasks` property containing a list of task definitions. Each task definition should match the [task
schema](https://docs.taskcluster.net/reference/platform/taskcluster-queue/docs/task-schema) as it will be passed nearly unchanged to `Queue.createTask`, The exception is that the provided task definition must contain a `taskId` field, which the service will remove and pass to `Queue.createTask` directly.

The result looks like this:

```
{
    "tasks": [
        {
            "taskId": "fOF8Cqj0QPKbvczC2dnXiQ", // probably generated with as_slugid(..)
            "provisionerId": "..",
            "workerType": "..",
            "payload": {
                // ..
            },
            // ...
        },
        // ...
    ]
}
```

Taskcluster-Github will set the schedulerId of each task, as is required for proper status tracking of the resulting task.

The `taskId` and `taskGroupId` properties can be set by the JSON-e template,
but default values are also available.  If the JSON-e rendering produces only
one task, then the default `taskGroupId` and `taskId` have the same value.
This makes the resulting task follow the convention for a [decision
task](/docs/manual/using/task-graph#conventions).  If the rendering process
produces multiple tasks, then the same default `taskGroupId` will apply to all
tasks, with each task getting a unique `taskId` distinct from the
`taskGroupId`.

## Task Definition and Examples
 
### Github Events

You can put a task definition inside an `$if` - `then` statement so that it will only run for specific Github events:

```yaml
version: 1
tasks:
  - $if: ' tasks_for == "github-push" '
    then:
      ...
      ...
```

NOTE: A well-designed template should produce `tasks: []` for any unrecognized `tasks_for` values; this allows later expansion of this service to handle more events.

### Branch Filtering

You can also add a branch clause to your `$if` - `then` statement so that the task will only run for events on certain branches. For example, the task defined below will only run for pushes to the master branch:

```yaml
version: 1
tasks:
  - $if: 'tasks_for == "github-push"'
    then:
      $if: 'event.ref == "refs/heads/master"'
      then:
        ...
        ...
```

Note that it is wise to always check `tasks_for` first in a conditional like this.
Other event types do not have `event.ref`, which would lead to a template error if not for the `tasks_for` check.

NOTE: Once JSON-e supports [short-circuit boolean operators](https://github.com/taskcluster/json-e/issues/244), these conditionals can be collapsed into one.

### Tags

Tag pushes can be identified as follows:

```yaml
version: 1
tasks:
  - $if: 'tasks_for == "github-push"'
    then:
      $if: 'event.ref[:10] == "refs/tags/"'
      then:
        ...
        ...
```

### Provisioner ID and Worker Type

You need to know which provisioner and which worker type you want to use to run your tasks. If you plan on using AWS provisioner, you can look up or create a worker type [here](https://tools.taskcluster.net/aws-provisioner/).

# Scopes and Roles

[Roles](https://docs.taskcluster.net/manual/design/apis/hawk/roles) are, in a nutshell, sets of [scopes](https://docs.taskcluster.net/reference/platform/taskcluster-auth/docs/scopes). Taskcluster-Github uses a very specific role to create tasks for each project.  That role has the form
* `assume:repo:github.com/<owner>/<repo>:branch:<branch>` for a push event
* `assume:repo:github.com/<owner>/<repo>:pull-request` for a pull request
* `assume:repo:github.com/<owner>/<repo>:release` for a release event
* `assume:repo:github.com/<organization>/<repository>:tag:<tag>` for a tag event

In the [role manager](https://tools.taskcluster.net/auth/roles/), you can set up roles however you like. To give permissions to every event in your repository, you can make a role `repo:github.com/<organization>/<repository>:*` or you can give fine-grained permissions to specific github events or specific branches.

Careful configuration of these roles and the related tasks can allow powerful behaviors such as binary uploads on push, without allowing pull requests access to those capabilities. There are lots of examples in the role manager for other repositories that have been set up. Look for roles that begin with `repo:github.com/` to see how they work.

# Example

```yaml
version: 1
policy:
  pullRequests: public
tasks:
  - $if: 'tasks_for == "github-pull-request" && event["action"] in ["opened", "reopened", "synchronize"]'
    then:
      taskId: {$eval: as_slugid("pr_task")}
      deadline: {$fromNow: '1 hour'}
      provisionerId: aws-provisioner-v1
      workerType: github-worker
      scopes:
        - secrets:get:project/taskcluster/testing/taskcluster-github
      payload:
        maxRunTime: 600
        image: "node:8"
        env:
          DEBUG: "* -mocha* -nock* -express* -body-parser* -eslint*"
        features:
          taskclusterProxy: true
        command:
          - "/bin/bash"
          - "-lc"
          - "git clone ${event.pull_request.head.repo.git_url} repo && cd repo && git checkout ${event.pull_request.head.sha} && yarn && yarn test"
      metadata:
        name: "Taskcluster GitHub Tests"
        description: "All tests"
        owner: ${event.pull_request.user.login}@users.noreply.github.com
        source: ${event.repository.url}
  - $if: 'tasks_for == "github-push"'
    then:
      taskId: {$eval: as_slugid("push_task")}
      deadline: {$fromNow: '1 hour'}
      provisionerId: aws-provisioner-v1
      workerType: github-worker
      scopes:
        - secrets:get:project/taskcluster/testing/taskcluster-github
      payload:
        maxRunTime: 600
        image: "node:8"
        env:
          DEBUG: "* -mocha* -nock* -express* -body-parser* -eslint*"
          NO_TEST_SKIP: true
        features:
          taskclusterProxy: true
        command:
          - "/bin/bash"
          - "-lc"
          - "git clone ${event.repository.url} repo && cd repo && git checkout ${event.after} && yarn && yarn test"
      metadata:
        name: "Taskcluster GitHub Tests"
        description: "All tests"
        owner: ${event.pusher.name}@users.noreply.github.com
        source: ${event.repository.url}
```

# Transitioning from v0
## Pull Request Metadata

```
  v1 reference                           | v0 equivalent                  | Example Value(s)
  ---------------------------------------+--------------------------------+-----------------------------------------
  event.action                           | GITHUB_EVENT                   | assigned
                                         | "{{ event.type }}"             | unassigned
                                         |                                | review_requested
                                         |                                | review_request_removed
                                         |                                | labeled
                                         |                                | unlabeled
                                         |                                | opened
                                         |                                | edited
                                         |                                | closed
                                         |                                | reopened
                                         |                                |
  event.number                           | GITHUB_PULL_REQUEST            | 18
                                         | "{{ event.pullNumber }}"       | 
  event.pull_request.title               | GITHUB_PULL_TITLE              | Update README.md
                                         | "{{ event.title }}"            |
  event.pull_request.head.ref            | GITHUB_BRANCH                  | master
                                         | "{{ event.head.repo.branch }}" |
  event.pull_request.base.user.login     | GITHUB_BASE_USER               | johndoe
                                         | "{{ event.base.user.login }}"  |
  event.pull_request.base.repo.name      | GITHUB_BASE_REPO_NAME          | somerepo
                                         | "{{ event.base.repo.name }}"   |
  event.pull_request.base.repo.clone_url | GITHUB_BASE_REPO_URL           | https://github.com/johndoe/somerepo
                                         | "{{ event.base.repo.url }}"    |
  event.pull_request.base.sha            | GITHUB_BASE_SHA                | ee6a2fc800cdab6a98bf24b5af1cd34bf36d41ec
                                         | "{{ event.base.sha }}"         |
  event.pull_request.base.ref            | GITHUB_BASE_BRANCH             | master
                                         | "{{ event.base.repo.branch }}" |
  -                                      | GITHUB_BASE_REF                | refs/heads/master
                                         | "{{ event.base.ref }}"         |
                                         |                                |
  event.sender.login                     | GITHUB_HEAD_USER               | maryscott
                                         | "{{ event.head.user.login }}"  |
  event.pull_request.head.repo.name      | GITHUB_HEAD_REPO_NAME          | somerepo
                                         | "{{ event.head.repo.name }}"   |
  event.pull_request.head.repo.clone_url | GITHUB_HEAD_REPO_URL           | https://github.com/maryscott/somerepo
                                         | "{{ event.head.repo.url }}"    |
  event.pull_request.head.sha            | GITHUB_HEAD_SHA                | e8f57659c7400e225d2f70f8d17ed11b7f914abb
                                         | "{{ event.head.sha }}"         |
  event.pull_request.head.ref            | GITHUB_HEAD_BRANCH             | bug1394856
                                         | "{{ event.head.repo.branch }}" |
  -                                      | GITHUB_HEAD_REF                | refs/heads/bug1394856
                                         | "{{ event.head.ref }}"         |
  -                                      | GITHUB_HEAD_USER_EMAIL         | mary.scott@buccleuch.co.uk
                                         | "{{ event.head.user.email }}"  |
```

## Push Metadata

```
  v1 reference                           | v0 equivalent                  | Example Value(s)
  ---------------------------------------+--------------------------------+-----------------------------------------
  -                                      | GITHUB_EVENT                   | push
                                         | "{{ event.type }}"             |
  -                                      | GITHUB_BRANCH                  | simple-branch
                                         | "{{ event.base.repo.branch }}" |
  event.ref                              | GITHUB_BASE_REF                | refs/heads/simple-branch
                                         | "{{ event.base.ref }}"         |
                                         | GITHUB_HEAD_REF                |
                                         | "{{ event.head.ref }}"         |
                                         |                                |
  event.sender.login                     | GITHUB_BASE_USER               | maryscott
                                         | "{{ event.base.user.login }}"  |
                                         | GITHUB_HEAD_USER               |
                                         | "{{ event.head.user.login }}"  |
  event.repository.name                  | GITHUB_BASE_REPO_NAME          | somerepo
                                         | "{{ event.base.repo.name }}"   |
  event.repository.clone_url             | GITHUB_BASE_REPO_URL           | https://github.com/maryscott/somerepo
                                         | "{{ event.base.repo.url }}"    |
                                         | GITHUB_HEAD_REPO_URL           |
                                         | "{{ event.head.repo.url }}"    |
  event.before                           | GITHUB_BASE_SHA                | ee6a2fc800cdab6a98bf24b5af1cd34bf36d41ec
                                         | "{{ event.base.sha }}"         |
  -                                      | GITHUB_BASE_BRANCH             | bug1394856
                                         | "{{ event.base.repo.branch }}" |
                                         |                                |
  event.repository.name                  | GITHUB_HEAD_REPO_NAME          | somerepo
                                         | "{{ event.head.repo.name }}"   |
  event.after                            | GITHUB_HEAD_SHA                | e8f57659c7400e225d2f70f8d17ed11b7f914abb
                                         | "{{ event.head.sha }}"         |
  -                                      | GITHUB_HEAD_BRANCH             | bug1394856
                                         | "{{ event.head.repo.branch }}" |
  -                                      | GITHUB_HEAD_USER_EMAIL         | mary.scott@buccleuch.co.uk
                                         | "{{ event.head.user.email }}"  |
```

## Release Metadata

```
  v1 reference                           | v0 equivalent                  | Example Value(s)
  ---------------------------------------+--------------------------------+-----------------------------------------
  -                                      | GITHUB_EVENT                   | release
                                         | "{{ event.type }}"
  event.action                           | -                              | published
  event.release.target_commitish         | GITHUB_BRANCH                  | master
                                         | "{{ event.base.repo.branch }}" |
                                         |                                |
  event.sender.login                     | GITHUB_HEAD_USER               | maryscott
                                         | "{{ event.head.user.login }}"  |
  event.repository.name                  | GITHUB_HEAD_REPO_NAME          | somerepo
                                         | "{{ event.head.repo.name }}"   |
  event.repository.clone_url             | GITHUB_HEAD_REPO_URL           | https://github.com/maryscott/somerepo
                                         | "{{ event.head.repo.url }}"    |
                                         |                                |
  event.release.tag_name                 | "{{ event.version }}"          | v1.0.3 (tag name)
  event.release.name                     | "{{ event.name }}"             | Now more Awesome (release description)
  event.release.url                      | "{{ event.release.url }}"      | https://api.github.com/repos/taskcluster/generic-worker/releases/5108386
  event.release.prerelease               | "{{ event.prerelease }}"       | false
  event.release.draft                    | "{{ event.draft }}"            | false
  event.release.tarball_url              | "{{ event.tar }}"              | https://api.github.com/repos/taskcluster/generic-worker/tarball/v7.2.6
  event.release.zipball_url              | "{{ event.zip }}"              | https://api.github.com/repos/taskcluster/generic-worker/zipball/v7.2.6
```

## Tag Metadata

```
  v1 reference                           | v0 equivalent                  | Example Value(s)
  ---------------------------------------+--------------------------------+-----------------------------------------
  -                                      | GITHUB_EVENT                   | tag
                                         | "{{ event.type }}"             |
                                         |                                |
  event.sender.login                     | GITHUB_BASE_USER               | maryscott
                                         | "{{ event.base.user.login }}"  |
  event.repository.name                  | GITHUB_BASE_REPO_NAME          | somerepo
                                         | "{{ event.base.repo.name }}"   |
                                         | GITHUB_HEAD_REPO_NAME          |
                                         | "{{ event.head.repo.name }}"   |
  event.repository.clone_url             | GITHUB_BASE_REPO_URL           | https://github.com/maryscott/somerepo
                                         | "{{ event.base.repo.url }}"    |
                                         | GITHUB_HEAD_REPO_URL           |
                                         | "{{ event.head.repo.url }}"    |
  event.before                           | GITHUB_BASE_SHA                | 0000000000000000000000000000000000000000
                                         | "{{ event.base.sha }}"         |
  event.ref                              | GITHUB_BASE_REF                | refs/tags/v1.0.2
                                         | "{{ event.base.ref }}"         |
                                         | GITHUB_HEAD_REF                |
                                         | "{{ event.head.ref }}"         |
                                         |                                |
  event.sender.login                     | GITHUB_HEAD_USER               | maryscott
                                         | "{{ event.head.user.login }}"  |
  event.after                            | GITHUB_HEAD_SHA                | e8f57659c7400e225d2f70f8d17ed11b7f914abb
                                         | "{{ event.head.sha }}"         |
  -                                      | GITHUB_HEAD_TAG                | v1.0.2
                                         | "{{ event.head.tag }}"         |
  -                                      | GITHUB_HEAD_USER_EMAIL         | mary.scott@buccleuch.co.uk
                                         | "{{ event.head.user.email }}"  |
```

