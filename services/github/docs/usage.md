---
title: Using Taskcluster for Github Projects
order: 40
---

Taskcluster is easy to set up for simple CI cases and very expressive
and powerful for more complex cases. It should fit just about any
use case you can think of for CI on a Github project. It is used for
projects as simple to test as calling `npm test` all the way up to
the very complex set of tasks to perform in order to test and build
the Firefox browser.

The syntax offers an enormous amount of flexibility. [The quickstart tool](https://tools.taskcluster.net/quickstart/) should get you going quickly.

The eventual goal of this project is to support all platforms and allow users to define workflows for testing, shipping, and landing patches from within their configurations. Currently, we offer mostly Linux support and have Windows available.

## Who Can Trigger Jobs?

TaskCluster-Github will always build pushes and releases.

For pull requests, two policies are available:

* `public` -- tasks are created for all pull requests.
* `collaborators` (the default) -- tasks are created if the user who made the pull request is a collaborator on the repository.
  Github [defines collaborators](https://developer.github.com/v3/repos/collaborators/#list-collaborators) as "outside collaborators, organization members with access through team memberships, organization members with access through default organization permissions, and organization owners."

This policy is determined by consulting the `allowPullRequests` property in `.taskcluster.yml` in the latest commit to the repository's *default branch* (not on the pull request head!).

For example:
```
version: 0
allowPullRequests: public
...
```

---

## GitHub Events

You can modify a task definition so that it will only run for specific GitHub events, those events being:

  * `pull_request.assigned`
  * `pull_request.unassigned`
  * `pull_request.labeled`
  * `pull_request.unlabeled`
  * `pull_request.opened`
  * `pull_request.edited`
  * `pull_request.closed`
  * `pull_request.reopened`
  * `pull_request.synchronize` (a new commit is pushed to the branch in the PR)
  * `push`                     (a push is made directly to the repo)
  * `release`                  (a new tag or release published in any branch of the repo)


In almost all cases, you'll only want `[push, pull_request.opened, pull_request.synchronize]`.

---

### Branch Filtering

You can also modify a task definition so that it will only run for events on certain branches. For example, the task defined below will only run for pushes to the master branch:

```
---
version: 0
tasks:
  - payload:
     maxRunTime: 3600
     image: "node:<version>"
     command:
       - "test"
    extra:
      github:
        events:        # A list of all github events which trigger this task
          - push
        branches:
          - master
```
Branch filtering doesn't work for releases.

---

## Deadlines and the fromNow function

A function `{{ $fromNow }}` is included in the syntax so that users may specify
consistent timeouts and deadlines. The function will accept parameters like:
`'1 day'`, `'3 hours'`, `'1 hour'`, etc.

```
---
version: 0
tasks:
  - payload:
      maxRunTime: 3600
      image: "node:<version>"
      command:
        - "test"
    deadline: "{{ '2 hours' | $fromNow }}" # the task will timeout if it doesn't complete within 2 hours
```

---

## Token Substitution and Environment Variables

The following tables list curly brace tokens (`{{ tokenName }}`) that can be
included in your `.taskcluster.yml` file which will be substituted at task
generation time.

In addition to these token substitutions, by setting `extra.github.env` to
`true` in `.taskcluster.yml`, your generated tasks will also include additional
environment variables with `GITHUB_` prefix. If these environment variables are
not required (i.e. you only require token substitutions) then you do not need
to set `extra.github.env`. These environment variables are also listed in the
tables below, where they occur. Currently not all token substituions are
available as environment variables (notably, the release metadata).

### Pull Request Metadata

```
  Environment Variable   | Token Placeholder              | Example Value(s)
  -----------------------+--------------------------------+-----------------------------------------
  GITHUB_EVENT           | "{{ event.type }}"             | pull_request.assigned
                         |                                | pull_request.unassigned
                         |                                | pull_request.labeled
                         |                                | pull_request.unlabeled
                         |                                | pull_request.opened
                         |                                | pull_request.edited
                         |                                | pull_request.closed
                         |                                | pull_request.reopened
                         |                                |
  GITHUB_PULL_REQUEST    | "{{ event.pullNumber }}"       | 18
  GITHUB_BRANCH          | "{{ event.head.repo.branch }}" | master
                         |                                |
  GITHUB_BASE_USER       | "{{ event.base.user.login }}"  | johndoe
  GITHUB_BASE_REPO_NAME  | "{{ event.base.repo.name }}"   | somerepo
  GITHUB_BASE_REPO_URL   | "{{ event.base.repo.url }}"    | https://github.com/johndoe/somerepo
  GITHUB_BASE_SHA        | "{{ event.base.sha }}"         | ee6a2fc800cdab6a98bf24b5af1cd34bf36d41ec
  GITHUB_BASE_BRANCH     | "{{ event.base.repo.branch }}" | master
  GITHUB_BASE_REF        | "{{ event.base.ref }}"         | refs/heads/master
                         |                                |
  GITHUB_HEAD_USER       | "{{ event.head.user.login }}"  | maryscott
  GITHUB_HEAD_REPO_NAME  | "{{ event.head.repo.name }}"   | somerepo
  GITHUB_HEAD_REPO_URL   | "{{ event.head.repo.url }}"    | https://github.com/maryscott/somerepo
  GITHUB_HEAD_SHA        | "{{ event.head.sha }}"         | e8f57659c7400e225d2f70f8d17ed11b7f914abb
  GITHUB_HEAD_BRANCH     | "{{ event.head.repo.branch }}" | bug1394856
  GITHUB_HEAD_REF        | "{{ event.head.ref }}"         | refs/heads/bug1394856
  GITHUB_HEAD_USER_EMAIL | "{{ event.head.user.email }}"  | mary.scott@buccleuch.co.uk
```

### Push Metadata

```
  Environment Variable   | Token Placeholder              | Example Value
  -----------------------+--------------------------------+-----------------------------------------
  GITHUB_EVENT           | "{{ event.type }}"             | push
  GITHUB_BRANCH          | "{{ event.base.repo.branch }}" | bug1394856
                         |                                |
  GITHUB_BASE_USER       | "{{ event.base.user.login }}"  | maryscott
  GITHUB_BASE_REPO_NAME  | "{{ event.base.repo.name }}"   | somerepo
  GITHUB_BASE_REPO_URL   | "{{ event.base.repo.url }}"    | https://github.com/maryscott/somerepo
  GITHUB_BASE_SHA        | "{{ event.base.sha }}"         | ee6a2fc800cdab6a98bf24b5af1cd34bf36d41ec
  GITHUB_BASE_BRANCH     | "{{ event.base.repo.branch }}" | bug1394856
  GITHUB_BASE_REF        | "{{ event.base.ref }}"         | refs/heads/bug1394856
                         |                                |
  GITHUB_HEAD_USER       | "{{ event.head.user.login }}"  | maryscott
  GITHUB_HEAD_REPO_NAME  | "{{ event.head.repo.name }}"   | somerepo
  GITHUB_HEAD_REPO_URL   | "{{ event.head.repo.url }}"    | https://github.com/maryscott/somerepo
  GITHUB_HEAD_SHA        | "{{ event.head.sha }}"         | e8f57659c7400e225d2f70f8d17ed11b7f914abb
  GITHUB_HEAD_BRANCH     | "{{ event.head.repo.branch }}" | bug1394856
  GITHUB_HEAD_REF        | "{{ event.head.ref }}"         | refs/heads/bug1394856
  GITHUB_HEAD_USER_EMAIL | "{{ event.head.user.email }}"  | mary.scott@buccleuch.co.uk
```

### Release Metadata

```
  Environment Variable   | Token Placeholder              | Example Value
  -----------------------+--------------------------------+-------------------------------------------------------------------------
  GITHUB_EVENT           | "{{ event.type }}"             | release
  GITHUB_BRANCH          | "{{ event.base.repo.branch }}" | master
                         |                                |
  GITHUB_HEAD_USER       | "{{ event.head.user.login }}"  | maryscott
  GITHUB_HEAD_REPO_NAME  | "{{ event.head.repo.name }}"   | somerepo
  GITHUB_HEAD_REPO_URL   | "{{ event.head.repo.url }}"    | https://github.com/maryscott/somerepo
                         |                                |
                         | "{{ event.version }}"          | refs/v1.0.3 (tag name)
                         | "{{ event.name }}"             | null
                         | "{{ event.release.url }}"      | https://api.github.com/repos/taskcluster/generic-worker/releases/5108386
                         | "{{ event.prerelease }}"       | false
                         | "{{ event.draft }}"            | false
                         | "{{ event.tar }}"              | https://api.github.com/repos/taskcluster/generic-worker/tarball/v7.2.6
                         | "{{ event.zip }}"              | https://api.github.com/repos/taskcluster/generic-worker/zipball/v7.2.6
```
