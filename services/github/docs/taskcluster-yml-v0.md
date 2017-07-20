---
title: .taskcluster.yml
order: 20
---

Your main interface to Taskcluster-Github is via `.taskcluster.yml` in the root
of your project. This is a YAML file that speciifies the tasks to run on
pushes, pull requests, or releases.

The format of the file is:

```yaml
version: 0
tasks:
  - (task definition)
  - ...
```

For a practical example, see the `.taskcluster.yml` [for Taskcluster-Github itself](https://github.com/taskcluster/taskcluster-github/blob/master/.taskcluster.yml).

The file has a simple templating pass applied.  Each task's `extra.github` property also defines some github-specific behaviors.

# Configuration in `extra.github`

## Environment Variables

If you wish to include the environment variables detailed below, set `task.extra.github.env`:

```yaml
version: 0
tasks:
 - ...
   extra:
     github:
       env: true
```

## GitHub Events

You can modify a task definition so that it will only run for specific GitHub
events, by setting `task.extra.github.events` to a list of event names:

```yaml
version: 0
tasks:
 - ...
   extra:
     github:
       events: [push, pull_request.opened, pull_request.synchronize]
```


The available events are:

  * `pull_request.assigned`
  * `pull_request.unassigned`
  * `pull_request.labeled`
  * `pull_request.unlabeled`
  * `pull_request.opened`
  * `pull_request.edited`
  * `pull_request.closed`
  * `pull_request.reopened`
  * `pull_request.synchronize` (a new commit is pushed to the branch in the PR. NOTE: There is no 'd' at the end of 'synchronize')
  * `push`                     (a push is made directly to the repo)
  * `release`                  (a new tag or release published in any branch of the repo)


In almost all cases, you'll only want `[push, pull_request.opened, pull_request.synchronize]`.

### Branch Filtering

You can also modify a task definition so that it will only run for events on certain branches. For example, the task defined below will only run for pushes to the master branch:

```yaml
version: 0
tasks:
  - ...
    extra:
      github:
        events:
          - push
        branches:
          - master
```

Branch filtering doesn't work for releases.

## Who Can Trigger Jobs?

Taskcluster-Github will always build pushes and releases.  For pull requests, two policies are available:

* `public` -- tasks are created for all pull requests.
* `collaborators` (the default) -- tasks are created if the user who made the pull request is a collaborator on the repository.
  Github [defines collaborators](https://developer.github.com/v3/repos/collaborators/#list-collaborators) as "outside collaborators, organization members with access through team memberships, organization members with access through default organization permissions, and organization owners."

This policy is determined by consulting the top-level `allowPullRequests` property in `.taskcluster.yml` in the latest commit to the repository's *default branch* (not on the pull request head!).

For example:
```
version: 0
allowPullRequests: public
...
```

# Token Substitution and Environment Variables

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

There is also a ``{{ timestamp }}`` token which coresponse to UNIX epoch in
miliseconds.

## Pull Request Metadata

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

## Push Metadata

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

## Release Metadata

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
                         | "{{ event.version }}"          | v1.0.3 (tag name)
                         | "{{ event.name }}"             | Now with more Awesome (release description)
                         | "{{ event.release.url }}"      | https://api.github.com/repos/taskcluster/generic-worker/releases/5108386
                         | "{{ event.prerelease }}"       | false
                         | "{{ event.draft }}"            | false
                         | "{{ event.tar }}"              | https://api.github.com/repos/taskcluster/generic-worker/tarball/v7.2.6
                         | "{{ event.zip }}"              | https://api.github.com/repos/taskcluster/generic-worker/zipball/v7.2.6
```

