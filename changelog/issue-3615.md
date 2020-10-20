audience: general
level: major
reference: issue 3615
---
RFC 165 has been implemented, allowing for greater administrator control over
"public" endpoints. Previously these were guarded by no scopes and could be
accessed by anyone with no way to limit this. In this release all
unauthenticated API calls are now granted the scope `assume:anonymous`.
Additionally, most previously unprotected endpoints are now guarded by at
least one scope, to enable the following:

* To maintain current behavior, grant the `anomymous` role the following scopes:

  - `auth:current-scopes`
  - `auth:expand-scopes`
  - `auth:get-client:*`
  - `auth:get-role:*`
  - `auth:list-clients`
  - `auth:list-roles`
  - `github:consume-webhook`
  - `github:get-badge:*`
  - `github:get-repository:*`
  - `github:latest-status:*`
  - `github:list-builds`
  - `hooks:get:*`
  - `hooks:list-hook-groups`
  - `hooks:list-hooks:*`
  - `hooks:list-last-fires:*`
  - `hooks:status:*`
  - `hooks:trigger-hook:*`
  - `index:find-task:*`
  - `purge-cache:all-purge-requests`
  - `purge-cache:purge-requests:*`
  - `queue:get-artifact:public/*`
  - `queue:get-provisioner:*`
  - `queue:get-task:*`
  - `queue:get-worker-type:*`
  - `queue:get-worker:*`
  - `queue:list-artifacts:*`
  - `queue:list-dependent-tasks:*`
  - `queue:list-provisioners`
  - `queue:list-task-group:*`
  - `queue:list-worker-types:*`
  - `queue:list-workers:*`
  - `queue:pending-count:*`
  - `queue:status:*`
  - `secrets:list-secrets`
  - `worker-manager:get-worker-pool:*`
  - `worker-manager:get-worker:*`
  - `worker-manager:list-providers`
  - `worker-manager:list-worker-pool-errors:*`
  - `worker-manager:list-worker-pools`
  - `worker-manager:list-workers:*`

* To entirely lock down the cluster from anonymous access, do not grant any
  scopes to role `anonymous`
* Pick and choose specific "public" endpoints to make available to anonymous
  requests


Performance testing (refer to
https://github.com/taskcluster/taskcluster/issues/3698 for more details):
* CPU has seen an increase of 0%-15%
* Memory has seen no increase
