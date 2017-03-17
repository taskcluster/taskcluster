---
title: Documenting Non-Services
---

For projects that aren't in JS, or can't publish on deploy (such as libraries), you can push documentation manually using `upload-project-docs`:

```sh
npm install -g taskcluster-lib-docs

export TASKCLUSTER_CLIENT_ID=..
export TASKCLUSTER_ACCESS_TOKEN=..
export DOCS_PROJECT=my-project
export DOCS_TIER=integration
export DOCS_FOLDER=/path/to/myproject/docs
export DOCS_README=/path/to/myproject/README.md
upload-project-docs
```

This will upload the docs directory and README, but does not include any references or schemas.
The credentials must have the same scopes as described above.
If upload-project-docs is run in a task with access to taskcluster-proxy, the credentials can be omitted.

This is even easier from a task run within TaskCluster.
There is a docker image named `taskcluster/upload-project-docs:latest` which can do all of this with a command like

```
git clone {{event.head.repo.url}} repo &&
cd repo &&
git config advice.detachedHead false &&
git checkout {{event.head.sha}} &&
export DEBUG=* DOCS_PROJECT=taskcluster-lib-docs DOCS_TIER=libraries DOCS_FOLDER=docs DOCS_README=README.md &&
upload-project-docs
```

See this project's `.taskcluster.yml` for an example.
