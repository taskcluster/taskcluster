
---
title: Clients
order: 20
---

Taskcluster authentication begins with "clients". Each client has a name
(`clientId`) and a secret access token. These can be used together to make API
requests to Taskcluster services.

Clients can be configured to expire on a specific date. An expired client is
no longer recognized by Taskcluster services. Clients can also be disabled;
this is used to prevent use of clients for which an associated user no longer
has permission. Most users do not have permission to enable a client.

Every client also has a set of [scopes](scopes). The client's scopes
control the client's access to Taskcluster resources. The scopes are
*expanded* by substituting roles, as defined in the [roles](roles) section.
