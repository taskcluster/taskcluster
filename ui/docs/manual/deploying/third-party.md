---
title: Third Party
---

For a third party to get Taskcluster credentials, it first needs to have a client registered
in the deployment configuration of the web-server service. This is governed by the `REGISTERED_CLIENTS` configuration.
This is an array of clients where each client has the following properties:

| Property | Required | Description |
--- | --- | --- |
| `clientId` | ✓ | The Oauth2 client ID (this is not a Taskcluster clientId). |
| `responseType` | ✓ | The value MUST be one of `code` for requesting an authorization code or `token` for requesting an access token (implicit grant). |
| `scope` | ✓ | An array of Taskcluser scopes the client is authorized to receive. This can end with `*`. |
| `redirectUri` | ✓ | An array of URIs to which the server is allowed to redirect the user.  |
| `whitelisted` | | A boolean where if `true`, the redirect flow won't require user interaction. Note that user interaction will always be requested when `responseType=token`. |
| `maxExpires` | ✓ | The maximum expiration time for issued Taskcluster credentials in a format that `taskcluster-client`'s [`fromNow`](../../../clients/client#relative-date-time-utilities) method understands. |
