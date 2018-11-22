---
filename: using/secrets.md
title: Handling Secrets
order: 20
---

Taskcluster is a very open platform, so a secret embedded in a task definition
or a task artifact is not very secret.

Ideally, tasks would not need access to any secrets, since most tasks run
source code from a version-control repository -- even un-trusted code in the
case of a Github pull request. It's all too easy to accidentally or maliciously
output a secret to the task logs, and such a disclosure is unlikely to be
noticed quickly.

The [Secrets service](/docs/reference/core/secrets) provides a simple way to store
JSON-formatted secrets in a secure fashion. Access to secrets can be controlled
by [scopes](/docs/manual/design/apis/hawk/scopes).

The most common approach is to use the Tools site to create secrets named
according to the [namespaces document](/docs/manual/design/namespaces), then read
those secrets in tasks via the taskcluster proxy. Access to the secrets is
granted by adding a scope to the repository's role.

For example, generating this documentation site requires access to the
Mozillians API to download information for the [people](/docs/people) page, and that
API key is stored in a secret named `project/taskcluster/tc-docs/mozillians`.
The task definition in `.taskcluster.yml` has a scope to read this secret and
enables the docker-worker taskclusterProxy feature:

```yaml
scopes:
  - "secrets:get:project/taskcluster/tc-docs/mozillians"
payload:
  features:
    taskclusterProxy: true
# ..
```

The role for the master branch of the repository contains the same scope:

```yaml
"role:github.com/taskcluster/taskcluster-docs:branch:master"
  - "secrets:get:project/taskcluster/tc-docs/mozillians"
```

Note that the `..:pull-request` role does *not* have this scope, so pull
requests cannot access the Mozillians API key.

The script that runs in the task calls the secrets API using the Taskcluster
client and extracts the API key from the resulting JSON object:

```js
var getApiKey = () => {
  if (process.env.MOZILLIANS_SECRET) {
    // specify a baseUrl to use the secrets service via taskcluster-proxy
    var secrets = new taskcluster.Secrets({baseUrl: 'http://taskcluster/secrets/v1/'});
    return secrets.get(process.env.MOZILLIANS_SECRET).then(secret => secret.secret['api-key']);
  }
```

There are taskcluster clients available in many languages - use the one most
comfortable for you.

_Note:_ the `garbage/` namespace is provided for experimentation with the API,
but it is what it says on the tin: garbage, and more importantly, readable by
anyone.  Never put important information in a secret under `garbage/`!