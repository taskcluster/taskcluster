---
filename: design/apis/hawk/clients.md
title: Clients
order: 23
---

Taskcluster authentication begins with "clients". Each client has a name
(`clientId`) and a secret access token. These can be used together to make API
requests to Taskcluster services. Each client has a set of scopes associated
with it, controlling what that client can do.

See [the taskcluster-auth
docs](/docs/reference/platform/taskcluster-auth/docs/clients) for more detailed
information.

The set of defined clients is visible in the [Clients
tool](http://tools.taskcluster.net/auth/clients/). This interface helpfully
shows both the scopes configured for the client, and the "expanded scopes" that
result after all roles are expanded. Note that, in keeping with the open
nature of Taskcluster, anyone can see the full list of clients.

**NOTE** Taskcluster does not identify users. All API calls are made with
Taskcluster credentials, which include a `clientId`, but that identifier does
not necessarily relate to a specific person or "user account" of any sort.
