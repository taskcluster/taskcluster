audience: users
level: patch
reference: issue 6789
---
Generic Worker no longer modifies task scopes passed to Taskcluster Proxy.
Previously there was a bug where Taskcluster Proxy would be passed the
d2g-modified scopes by Generic Worker rather than the original task scopes from
the task definition of the `queue.claimWork` response body. If the task was not
also explicitly assigned the required generic-worker scopes, this would result
in HTTP 401 errors from Taskcluster Proxy calls.

This has now been fixed, so that it is sufficient for tasks with a Docker
Worker payload to contain only Docker Worker scopes, not have the associated
generic-worker scopes, yet still work under Generic Worker and use the
Taskcluster Proxy feature without causing HTTP 401 errors.
