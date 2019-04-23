/* eslint-disable */
module.exports = {
  "Auth": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "Authentication related API end-points for Taskcluster and related\nservices. These API end-points are of interest if you wish to:\n  * Authorize a request signed with Taskcluster credentials,\n  * Manage clients and roles,\n  * Inspect or audit clients and roles,\n  * Gain access to various services guarded by this API.\n",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Get a list of all clients.  With `prefix`, only clients for which\nit is a prefix of the clientId are returned.\n\nBy default this end-point will try to return up to 1000 clients in one\nrequest. But it **may return less, even none**.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `listClients` with the last `continuationToken` until you\nget a result without a `continuationToken`.",
          "method": "get",
          "name": "listClients",
          "output": "v1/list-clients-response.json#",
          "query": [
            "prefix",
            "continuationToken",
            "limit"
          ],
          "route": "/clients/",
          "stability": "stable",
          "title": "List Clients",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Get information about a single client.",
          "method": "get",
          "name": "client",
          "output": "v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>",
          "stability": "stable",
          "title": "Get Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Create a new client and get the `accessToken` for this client.\nYou should store the `accessToken` from this API call as there is no\nother way to retrieve it.\n\nIf you loose the `accessToken` you can call `resetAccessToken` to reset\nit, and a new `accessToken` will be returned, but you cannot retrieve the\ncurrent `accessToken`.\n\nIf a client with the same `clientId` already exists this operation will\nfail. Use `updateClient` if you wish to update an existing client.\n\nThe caller's scopes must satisfy `scopes`.",
          "input": "v1/create-client-request.json#",
          "method": "put",
          "name": "createClient",
          "output": "v1/create-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>",
          "scopes": {
            "AllOf": [
              "auth:create-client:<clientId>",
              {
                "each": "<scope>",
                "for": "scope",
                "in": "scopes"
              }
            ]
          },
          "stability": "stable",
          "title": "Create Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Reset a clients `accessToken`, this will revoke the existing\n`accessToken`, generate a new `accessToken` and return it from this\ncall.\n\nThere is no way to retrieve an existing `accessToken`, so if you loose it\nyou must reset the accessToken to acquire it again.",
          "method": "post",
          "name": "resetAccessToken",
          "output": "v1/create-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>/reset",
          "scopes": "auth:reset-access-token:<clientId>",
          "stability": "stable",
          "title": "Reset `accessToken`",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Update an exisiting client. The `clientId` and `accessToken` cannot be\nupdated, but `scopes` can be modified.  The caller's scopes must\nsatisfy all scopes being added to the client in the update operation.\nIf no scopes are given in the request, the client's scopes remain\nunchanged",
          "input": "v1/create-client-request.json#",
          "method": "post",
          "name": "updateClient",
          "output": "v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>",
          "scopes": {
            "AllOf": [
              "auth:update-client:<clientId>",
              {
                "each": "<scope>",
                "for": "scope",
                "in": "scopesAdded"
              }
            ]
          },
          "stability": "stable",
          "title": "Update Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Enable a client that was disabled with `disableClient`.  If the client\nis already enabled, this does nothing.\n\nThis is typically used by identity providers to re-enable clients that\nhad been disabled when the corresponding identity's scopes changed.",
          "method": "post",
          "name": "enableClient",
          "output": "v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>/enable",
          "scopes": "auth:enable-client:<clientId>",
          "stability": "stable",
          "title": "Enable Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Disable a client.  If the client is already disabled, this does nothing.\n\nThis is typically used by identity providers to disable clients when the\ncorresponding identity's scopes no longer satisfy the client's scopes.",
          "method": "post",
          "name": "disableClient",
          "output": "v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>/disable",
          "scopes": "auth:disable-client:<clientId>",
          "stability": "stable",
          "title": "Disable Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Delete a client, please note that any roles related to this client must\nbe deleted independently.",
          "method": "delete",
          "name": "deleteClient",
          "query": [
          ],
          "route": "/clients/<clientId>",
          "scopes": "auth:delete-client:<clientId>",
          "stability": "stable",
          "title": "Delete Client",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Get a list of all roles, each role object also includes the list of\nscopes it expands to.",
          "method": "get",
          "name": "listRoles",
          "output": "v1/list-roles-response.json#",
          "query": [
          ],
          "route": "/roles/",
          "stability": "stable",
          "title": "List Roles",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "If no limit is given, the roleIds of all roles are returned. Since this\nlist may become long, callers can use the `limit` and `continuationToken`\nquery arguments to page through the responses.",
          "method": "get",
          "name": "listRoleIds",
          "output": "v1/list-role-ids-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/roleids/",
          "stability": "stable",
          "title": "List Role IDs",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "If no limit is given, all roles are returned. Since this\nlist may become long, callers can use the `limit` and `continuationToken`\nquery arguments to page through the responses.",
          "method": "get",
          "name": "listRoles2",
          "output": "v1/list-roles2-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/roles2/",
          "stability": "stable",
          "title": "List Roles",
          "type": "function"
        },
        {
          "args": [
            "roleId"
          ],
          "description": "Get information about a single role, including the set of scopes that the\nrole expands to.",
          "method": "get",
          "name": "role",
          "output": "v1/get-role-response.json#",
          "query": [
          ],
          "route": "/roles/<roleId>",
          "stability": "stable",
          "title": "Get Role",
          "type": "function"
        },
        {
          "args": [
            "roleId"
          ],
          "description": "Create a new role.\n\nThe caller's scopes must satisfy the new role's scopes.\n\nIf there already exists a role with the same `roleId` this operation\nwill fail. Use `updateRole` to modify an existing role.\n\nCreation of a role that will generate an infinite expansion will result\nin an error response.",
          "input": "v1/create-role-request.json#",
          "method": "put",
          "name": "createRole",
          "output": "v1/get-role-response.json#",
          "query": [
          ],
          "route": "/roles/<roleId>",
          "scopes": {
            "AllOf": [
              "auth:create-role:<roleId>",
              {
                "each": "<scope>",
                "for": "scope",
                "in": "scopes"
              }
            ]
          },
          "stability": "stable",
          "title": "Create Role",
          "type": "function"
        },
        {
          "args": [
            "roleId"
          ],
          "description": "Update an existing role.\n\nThe caller's scopes must satisfy all of the new scopes being added, but\nneed not satisfy all of the role's existing scopes.\n\nAn update of a role that will generate an infinite expansion will result\nin an error response.",
          "input": "v1/create-role-request.json#",
          "method": "post",
          "name": "updateRole",
          "output": "v1/get-role-response.json#",
          "query": [
          ],
          "route": "/roles/<roleId>",
          "scopes": {
            "AllOf": [
              "auth:update-role:<roleId>",
              {
                "each": "<scope>",
                "for": "scope",
                "in": "scopesAdded"
              }
            ]
          },
          "stability": "stable",
          "title": "Update Role",
          "type": "function"
        },
        {
          "args": [
            "roleId"
          ],
          "description": "Delete a role. This operation will succeed regardless of whether or not\nthe role exists.",
          "method": "delete",
          "name": "deleteRole",
          "query": [
          ],
          "route": "/roles/<roleId>",
          "scopes": "auth:delete-role:<roleId>",
          "stability": "stable",
          "title": "Delete Role",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return an expanded copy of the given scopeset, with scopes implied by any\nroles included.\n\nThis call uses the GET method with an HTTP body.  It remains only for\nbackward compatibility.",
          "input": "v1/scopeset.json#",
          "method": "get",
          "name": "expandScopesGet",
          "output": "v1/scopeset.json#",
          "query": [
          ],
          "route": "/scopes/expand",
          "stability": "deprecated",
          "title": "Expand Scopes",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return an expanded copy of the given scopeset, with scopes implied by any\nroles included.",
          "input": "v1/scopeset.json#",
          "method": "post",
          "name": "expandScopes",
          "output": "v1/scopeset.json#",
          "query": [
          ],
          "route": "/scopes/expand",
          "stability": "stable",
          "title": "Expand Scopes",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return the expanded scopes available in the request, taking into account all sources\nof scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,\nand roles).",
          "method": "get",
          "name": "currentScopes",
          "output": "v1/scopeset.json#",
          "query": [
          ],
          "route": "/scopes/current",
          "stability": "stable",
          "title": "Get Current Scopes",
          "type": "function"
        },
        {
          "args": [
            "level",
            "bucket",
            "prefix"
          ],
          "description": "Get temporary AWS credentials for `read-write` or `read-only` access to\na given `bucket` and `prefix` within that bucket.\nThe `level` parameter can be `read-write` or `read-only` and determines\nwhich type of credentials are returned. Please note that the `level`\nparameter is required in the scope guarding access.  The bucket name must\nnot contain `.`, as recommended by Amazon.\n\nThis method can only allow access to a whitelisted set of buckets.  To add\na bucket to that whitelist, contact the Taskcluster team, who will add it to\nthe appropriate IAM policy.  If the bucket is in a different AWS account, you\nwill also need to add a bucket policy allowing access from the Taskcluster\naccount.  That policy should look like this:\n\n```js\n{\n  \"Version\": \"2012-10-17\",\n  \"Statement\": [\n    {\n      \"Sid\": \"allow-taskcluster-auth-to-delegate-access\",\n      \"Effect\": \"Allow\",\n      \"Principal\": {\n        \"AWS\": \"arn:aws:iam::692406183521:root\"\n      },\n      \"Action\": [\n        \"s3:ListBucket\",\n        \"s3:GetObject\",\n        \"s3:PutObject\",\n        \"s3:DeleteObject\",\n        \"s3:GetBucketLocation\"\n      ],\n      \"Resource\": [\n        \"arn:aws:s3:::<bucket>\",\n        \"arn:aws:s3:::<bucket>/*\"\n      ]\n    }\n  ]\n}\n```\n\nThe credentials are set to expire after an hour, but this behavior is\nsubject to change. Hence, you should always read the `expires` property\nfrom the response, if you intend to maintain active credentials in your\napplication.\n\nPlease note that your `prefix` may not start with slash `/`. Such a prefix\nis allowed on S3, but we forbid it here to discourage bad behavior.\n\nAlso note that if your `prefix` doesn't end in a slash `/`, the STS\ncredentials may allow access to unexpected keys, as S3 does not treat\nslashes specially.  For example, a prefix of `my-folder` will allow\naccess to `my-folder/file.txt` as expected, but also to `my-folder.txt`,\nwhich may not be intended.\n\nFinally, note that the `PutObjectAcl` call is not allowed.  Passing a canned\nACL other than `private` to `PutObject` is treated as a `PutObjectAcl` call, and\nwill result in an access-denied error from AWS.  This limitation is due to a\nsecurity flaw in Amazon S3 which might otherwise allow indefinite access to\nuploaded objects.\n\n**EC2 metadata compatibility**, if the querystring parameter\n`?format=iam-role-compat` is given, the response will be compatible\nwith the JSON exposed by the EC2 metadata service. This aims to ease\ncompatibility for libraries and tools built to auto-refresh credentials.\nFor details on the format returned by EC2 metadata service see:\n[EC2 User Guide](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#instance-metadata-security-credentials).",
          "method": "get",
          "name": "awsS3Credentials",
          "output": "v1/aws-s3-credentials-response.json#",
          "query": [
            "format"
          ],
          "route": "/aws/s3/<level>/<bucket>/<prefix>",
          "scopes": {
            "else": "auth:aws-s3:read-write:<bucket>/<prefix>",
            "if": "levelIsReadOnly",
            "then": {
              "AnyOf": [
                "auth:aws-s3:read-only:<bucket>/<prefix>",
                "auth:aws-s3:read-write:<bucket>/<prefix>"
              ]
            }
          },
          "stability": "stable",
          "title": "Get Temporary Read/Write Credentials S3",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Retrieve a list of all Azure accounts managed by Taskcluster Auth.",
          "method": "get",
          "name": "azureAccounts",
          "output": "v1/azure-account-list-response.json#",
          "query": [
          ],
          "route": "/azure/accounts",
          "scopes": "auth:azure-table:list-accounts",
          "stability": "stable",
          "title": "List Accounts Managed by Auth",
          "type": "function"
        },
        {
          "args": [
            "account"
          ],
          "description": "Retrieve a list of all tables in an account.",
          "method": "get",
          "name": "azureTables",
          "output": "v1/azure-table-list-response.json#",
          "query": [
            "continuationToken"
          ],
          "route": "/azure/<account>/tables",
          "scopes": "auth:azure-table:list-tables:<account>",
          "stability": "stable",
          "title": "List Tables in an Account Managed by Auth",
          "type": "function"
        },
        {
          "args": [
            "account",
            "table",
            "level"
          ],
          "description": "Get a shared access signature (SAS) string for use with a specific Azure\nTable Storage table.\n\nThe `level` parameter can be `read-write` or `read-only` and determines\nwhich type of credentials are returned.  If level is read-write, it will create the\ntable if it doesn't already exist.",
          "method": "get",
          "name": "azureTableSAS",
          "output": "v1/azure-table-access-response.json#",
          "query": [
          ],
          "route": "/azure/<account>/table/<table>/<level>",
          "scopes": {
            "else": "auth:azure-table:read-write:<account>/<table>",
            "if": "levelIsReadOnly",
            "then": {
              "AnyOf": [
                "auth:azure-table:read-only:<account>/<table>",
                "auth:azure-table:read-write:<account>/<table>"
              ]
            }
          },
          "stability": "stable",
          "title": "Get Shared-Access-Signature for Azure Table",
          "type": "function"
        },
        {
          "args": [
            "account"
          ],
          "description": "Retrieve a list of all containers in an account.",
          "method": "get",
          "name": "azureContainers",
          "output": "v1/azure-container-list-response.json#",
          "query": [
            "continuationToken"
          ],
          "route": "/azure/<account>/containers",
          "scopes": "auth:azure-container:list-containers:<account>",
          "stability": "stable",
          "title": "List containers in an Account Managed by Auth",
          "type": "function"
        },
        {
          "args": [
            "account",
            "container",
            "level"
          ],
          "description": "Get a shared access signature (SAS) string for use with a specific Azure\nBlob Storage container.\n\nThe `level` parameter can be `read-write` or `read-only` and determines\nwhich type of credentials are returned.  If level is read-write, it will create the\ncontainer if it doesn't already exist.",
          "method": "get",
          "name": "azureContainerSAS",
          "output": "v1/azure-container-response.json#",
          "query": [
          ],
          "route": "/azure/<account>/containers/<container>/<level>",
          "scopes": {
            "else": "auth:azure-container:read-write:<account>/<container>",
            "if": "levelIsReadOnly",
            "then": {
              "AnyOf": [
                "auth:azure-container:read-only:<account>/<container>",
                "auth:azure-container:read-write:<account>/<container>"
              ]
            }
          },
          "stability": "stable",
          "title": "Get Shared-Access-Signature for Azure Container",
          "type": "function"
        },
        {
          "args": [
            "project"
          ],
          "description": "Get temporary DSN (access credentials) for a sentry project.\nThe credentials returned can be used with any Sentry client for up to\n24 hours, after which the credentials will be automatically disabled.\n\nIf the project doesn't exist it will be created, and assigned to the\ninitial team configured for this component. Contact a Sentry admin\nto have the project transferred to a team you have access to if needed",
          "method": "get",
          "name": "sentryDSN",
          "output": "v1/sentry-dsn-response.json#",
          "query": [
          ],
          "route": "/sentry/<project>/dsn",
          "scopes": "auth:sentry:<project>",
          "stability": "stable",
          "title": "Get DSN for Sentry Project",
          "type": "function"
        },
        {
          "args": [
            "project"
          ],
          "description": "Get temporary `token` and `baseUrl` for sending metrics to statsum.\n\nThe token is valid for 24 hours, clients should refresh after expiration.",
          "method": "get",
          "name": "statsumToken",
          "output": "v1/statsum-token-response.json#",
          "query": [
          ],
          "route": "/statsum/<project>/token",
          "scopes": "auth:statsum:<project>",
          "stability": "stable",
          "title": "Get Token for Statsum Project",
          "type": "function"
        },
        {
          "args": [
            "wstAudience",
            "wstClient"
          ],
          "description": "Get a temporary token suitable for use connecting to a\n[websocktunnel](https://github.com/taskcluster/websocktunnel) server.\n\nThe resulting token will only be accepted by servers with a matching audience\nvalue.  Reaching such a server is the callers responsibility.  In general,\na server URL or set of URLs should be provided to the caller as configuration\nalong with the audience value.\n\nThe token is valid for a limited time (on the scale of hours). Callers should\nrefresh it before expiration.",
          "method": "get",
          "name": "websocktunnelToken",
          "output": "v1/websocktunnel-token-response.json#",
          "query": [
          ],
          "route": "/websocktunnel/<wstAudience>/<wstClient>",
          "scopes": "auth:websocktunnel-token:<wstAudience>/<wstClient>",
          "stability": "stable",
          "title": "Get a client token for the Websocktunnel service",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Validate the request signature given on input and return list of scopes\nthat the authenticating client has.\n\nThis method is used by other services that wish rely on Taskcluster\ncredentials for authentication. This way we can use Hawk without having\nthe secret credentials leave this service.",
          "input": "v1/authenticate-hawk-request.json#",
          "method": "post",
          "name": "authenticateHawk",
          "output": "v1/authenticate-hawk-response.json#",
          "query": [
          ],
          "route": "/authenticate-hawk",
          "stability": "stable",
          "title": "Authenticate Hawk Request",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Utility method to test client implementations of Taskcluster\nauthentication.\n\nRather than using real credentials, this endpoint accepts requests with\nclientId `tester` and accessToken `no-secret`. That client's scopes are\nbased on `clientScopes` in the request body.\n\nThe request is validated, with any certificate, authorizedScopes, etc.\napplied, and the resulting scopes are checked against `requiredScopes`\nfrom the request body. On success, the response contains the clientId\nand scopes as seen by the API method.",
          "input": "v1/test-authenticate-request.json#",
          "method": "post",
          "name": "testAuthenticate",
          "output": "v1/test-authenticate-response.json#",
          "query": [
          ],
          "route": "/test-authenticate",
          "stability": "stable",
          "title": "Test Authentication",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Utility method similar to `testAuthenticate`, but with the GET method,\nso it can be used with signed URLs (bewits).\n\nRather than using real credentials, this endpoint accepts requests with\nclientId `tester` and accessToken `no-secret`. That client's scopes are\n`['test:*', 'auth:create-client:test:*']`.  The call fails if the \n`test:authenticate-get` scope is not available.\n\nThe request is validated, with any certificate, authorizedScopes, etc.\napplied, and the resulting scopes are checked, just like any API call.\nOn success, the response contains the clientId and scopes as seen by\nthe API method.\n\nThis method may later be extended to allow specification of client and\nrequired scopes via query arguments.",
          "method": "get",
          "name": "testAuthenticateGet",
          "output": "v1/test-authenticate-response.json#",
          "query": [
          ],
          "route": "/test-authenticate-get/",
          "stability": "stable",
          "title": "Test Authentication (GET)",
          "type": "function"
        }
      ],
      "serviceName": "auth",
      "title": "Authentication API"
    }
  },
  "AuthEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The auth service is responsible for storing credentials, managing\nassignment of scopes, and validation of request signatures from other\nservices.\n\nThese exchanges provides notifications when credentials or roles are\nupdated. This is mostly so that multiple instances of the auth service\ncan purge their caches and synchronize state. But you are of course\nwelcome to use these for other purposes, monitoring changes for example.",
      "entries": [
        {
          "description": "Message that a new client has been created.",
          "exchange": "client-created",
          "name": "clientCreated",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/client-message.json#",
          "title": "Client Created Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Message that a new client has been updated.",
          "exchange": "client-updated",
          "name": "clientUpdated",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/client-message.json#",
          "title": "Client Updated Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Message that a new client has been deleted.",
          "exchange": "client-deleted",
          "name": "clientDeleted",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/client-message.json#",
          "title": "Client Deleted Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Message that a new role has been created.",
          "exchange": "role-created",
          "name": "roleCreated",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/role-message.json#",
          "title": "Role Created Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Message that a new role has been updated.",
          "exchange": "role-updated",
          "name": "roleUpdated",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/role-message.json#",
          "title": "Role Updated Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Message that a new role has been deleted.",
          "exchange": "role-deleted",
          "name": "roleDeleted",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/role-message.json#",
          "title": "Role Deleted Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-auth/v1/",
      "serviceName": "auth",
      "title": "Auth Pulse Exchanges"
    }
  },
  "AwsProvisioner": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The AWS Provisioner is responsible for provisioning instances on EC2 for use in\nTaskcluster.  The provisioner maintains a set of worker configurations which\ncan be managed with an API that is typically available at\naws-provisioner.taskcluster.net/v1.  This API can also perform basic instance\nmanagement tasks in addition to maintaining the internal state of worker type\nconfiguration information.\n\nThe Provisioner runs at a configurable interval.  Each iteration of the\nprovisioner fetches a current copy the state that the AWS EC2 api reports.  In\neach iteration, we ask the Queue how many tasks are pending for that worker\ntype.  Based on the number of tasks pending and the scaling ratio, we may\nsubmit requests for new instances.  We use pricing information, capacity and\nutility factor information to decide which instance type in which region would\nbe the optimal configuration.\n\nEach EC2 instance type will declare a capacity and utility factor.  Capacity is\nthe number of tasks that a given machine is capable of running concurrently.\nUtility factor is a relative measure of performance between two instance types.\nWe multiply the utility factor by the spot price to compare instance types and\nregions when making the bidding choices.\n\nWhen a new EC2 instance is instantiated, its user data contains a token in\n`securityToken` that can be used with the `getSecret` method to retrieve\nthe worker's credentials and any needed passwords or other restricted\ninformation.  The worker is responsible for deleting the secret after\nretrieving it, to prevent dissemination of the secret to other proceses\nwhich can read the instance user data.\n",
      "entries": [
        {
          "args": [
          ],
          "description": "Return a list of worker types, including some summary information about\ncurrent capacity for each.  While this list includes all defined worker types,\nthere may be running EC2 instances for deleted worker types that are not\nincluded here.  The list is unordered.",
          "method": "get",
          "name": "listWorkerTypeSummaries",
          "output": "v1/list-worker-types-summaries-response.json#",
          "query": [
          ],
          "route": "/list-worker-type-summaries",
          "stability": "stable",
          "title": "List worker types with details",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Create a worker type.  A worker type contains all the configuration\nneeded for the provisioner to manage the instances.  Each worker type\nknows which regions and which instance types are allowed for that\nworker type.  Remember that Capacity is the number of concurrent tasks\nthat can be run on a given EC2 resource and that Utility is the relative\nperformance rate between different instance types.  There is no way to\nconfigure different regions to have different sets of instance types\nso ensure that all instance types are available in all regions.\nThis function is idempotent.\n\nOnce a worker type is in the provisioner, a back ground process will\nbegin creating instances for it based on its capacity bounds and its\npending task count from the Queue.  It is the worker's responsibility\nto shut itself down.  The provisioner has a limit (currently 96hours)\nfor all instances to prevent zombie instances from running indefinitely.\n\nThe provisioner will ensure that all instances created are tagged with\naws resource tags containing the provisioner id and the worker type.\n\nIf provided, the secrets in the global, region and instance type sections\nare available using the secrets api.  If specified, the scopes provided\nwill be used to generate a set of temporary credentials available with\nthe other secrets.",
          "input": "v1/create-worker-type-request.json#",
          "method": "put",
          "name": "createWorkerType",
          "output": "v1/get-worker-type-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>",
          "scopes": "aws-provisioner:manage-worker-type:<workerType>",
          "stability": "stable",
          "title": "Create new Worker Type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Provide a new copy of a worker type to replace the existing one.\nThis will overwrite the existing worker type definition if there\nis already a worker type of that name.  This method will return a\n200 response along with a copy of the worker type definition created\nNote that if you are using the result of a GET on the worker-type\nend point that you will need to delete the lastModified and workerType\nkeys from the object returned, since those fields are not allowed\nthe request body for this method\n\nOtherwise, all input requirements and actions are the same as the\ncreate method.",
          "input": "v1/create-worker-type-request.json#",
          "method": "post",
          "name": "updateWorkerType",
          "output": "v1/get-worker-type-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>/update",
          "scopes": "aws-provisioner:manage-worker-type:<workerType>",
          "stability": "stable",
          "title": "Update Worker Type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "This method is provided to allow workers to see when they were\nlast modified.  The value provided through UserData can be\ncompared against this value to see if changes have been made\nIf the worker type definition has not been changed, the date\nshould be identical as it is the same stored value.",
          "method": "get",
          "name": "workerTypeLastModified",
          "output": "v1/get-worker-type-last-modified.json#",
          "query": [
          ],
          "route": "/worker-type-last-modified/<workerType>",
          "stability": "stable",
          "title": "Get Worker Type Last Modified Time",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Retrieve a copy of the requested worker type definition.\nThis copy contains a lastModified field as well as the worker\ntype name.  As such, it will require manipulation to be able to\nuse the results of this method to submit date to the update\nmethod.",
          "method": "get",
          "name": "workerType",
          "output": "v1/get-worker-type-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>",
          "scopes": {
            "AnyOf": [
              "aws-provisioner:view-worker-type:<workerType>",
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          },
          "stability": "stable",
          "title": "Get Worker Type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Delete a worker type definition.  This method will only delete\nthe worker type definition from the storage table.  The actual\ndeletion will be handled by a background worker.  As soon as this\nmethod is called for a worker type, the background worker will\nimmediately submit requests to cancel all spot requests for this\nworker type as well as killing all instances regardless of their\nstate.  If you want to gracefully remove a worker type, you must\neither ensure that no tasks are created with that worker type name\nor you could theoretically set maxCapacity to 0, though, this is\nnot a supported or tested action",
          "method": "delete",
          "name": "removeWorkerType",
          "query": [
          ],
          "route": "/worker-type/<workerType>",
          "scopes": "aws-provisioner:manage-worker-type:<workerType>",
          "stability": "stable",
          "title": "Delete Worker Type",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return a list of string worker type names.  These are the names\nof all managed worker types known to the provisioner.  This does\nnot include worker types which are left overs from a deleted worker\ntype definition but are still running in AWS.",
          "method": "get",
          "name": "listWorkerTypes",
          "output": "v1/list-worker-types-response.json#",
          "query": [
          ],
          "route": "/list-worker-types",
          "stability": "stable",
          "title": "List Worker Types",
          "type": "function"
        },
        {
          "args": [
            "token"
          ],
          "description": "Insert a secret into the secret storage.  The supplied secrets will\nbe provided verbatime via `getSecret`, while the supplied scopes will\nbe converted into credentials by `getSecret`.\n\nThis method is not ordinarily used in production; instead, the provisioner\ncreates a new secret directly for each spot bid.",
          "input": "v1/create-secret-request.json#",
          "method": "put",
          "name": "createSecret",
          "query": [
          ],
          "route": "/secret/<token>",
          "scopes": "aws-provisioner:create-secret:<workerType>",
          "stability": "stable",
          "title": "Create new Secret",
          "type": "function"
        },
        {
          "args": [
            "token"
          ],
          "description": "Retrieve a secret from storage.  The result contains any passwords or\nother restricted information verbatim as well as a temporary credential\nbased on the scopes specified when the secret was created.\n\nIt is important that this secret is deleted by the consumer (`removeSecret`),\nor else the secrets will be visible to any process which can access the\nuser data associated with the instance.",
          "method": "get",
          "name": "getSecret",
          "output": "v1/get-secret-response.json#",
          "query": [
          ],
          "route": "/secret/<token>",
          "stability": "stable",
          "title": "Get a Secret",
          "type": "function"
        },
        {
          "args": [
            "instanceId",
            "token"
          ],
          "description": "An instance will report in by giving its instance id as well\nas its security token.  The token is given and checked to ensure\nthat it matches a real token that exists to ensure that random\nmachines do not check in.  We could generate a different token\nbut that seems like overkill",
          "method": "get",
          "name": "instanceStarted",
          "query": [
          ],
          "route": "/instance-started/<instanceId>/<token>",
          "stability": "stable",
          "title": "Report an instance starting",
          "type": "function"
        },
        {
          "args": [
            "token"
          ],
          "description": "Remove a secret.  After this call, a call to `getSecret` with the given\ntoken will return no information.\n\nIt is very important that the consumer of a \nsecret delete the secret from storage before handing over control\nto untrusted processes to prevent credential and/or secret leakage.",
          "method": "delete",
          "name": "removeSecret",
          "query": [
          ],
          "route": "/secret/<token>",
          "stability": "stable",
          "title": "Remove a Secret",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "This method returns a preview of all possible launch specifications\nthat this worker type definition could submit to EC2.  It is used to\ntest worker types, nothing more\n\n**This API end-point is experimental and may be subject to change without warning.**",
          "method": "get",
          "name": "getLaunchSpecs",
          "output": "v1/get-launch-specs-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>/launch-specifications",
          "scopes": {
            "AnyOf": [
              "aws-provisioner:view-worker-type:<workerType>",
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          },
          "stability": "experimental",
          "title": "Get All Launch Specifications for WorkerType",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Return the state of a given workertype as stored by the provisioner. \nThis state is stored as three lists: 1 for running instances, 1 for\npending requests.  The `summary` property contains an updated summary\nsimilar to that returned from `listWorkerTypeSummaries`.",
          "method": "get",
          "name": "state",
          "query": [
          ],
          "route": "/state/<workerType>",
          "stability": "stable",
          "title": "Get AWS State for a worker type",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This endpoint is used to show when the last time the provisioner\nhas checked in.  A check in is done through the deadman's snitch\napi.  It is done at the conclusion of a provisioning iteration\nand used to tell if the background provisioning process is still\nrunning.\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "backendStatus",
          "output": "v1/backend-status-response.json#",
          "query": [
          ],
          "route": "/backend-status",
          "stability": "experimental",
          "title": "Backend Status",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        }
      ],
      "serviceName": "aws-provisioner",
      "title": "AWS Provisioner API Documentation"
    }
  },
  "EC2Manager": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "A taskcluster service which manages EC2 instances.  This service does not understand any taskcluster concepts intrinsicaly other than using the name `workerType` to refer to a group of associated instances.  Unless you are working on building a provisioner for AWS, you almost certainly do not want to use this service",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This method is only for debugging the ec2-manager",
          "method": "get",
          "name": "listWorkerTypes",
          "output": "v1/list-worker-types.json#",
          "query": [
          ],
          "route": "/worker-types",
          "stability": "experimental",
          "title": "See the list of worker types which are known to be managed",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Request an instance of a worker type",
          "input": "v1/run-instance-request.json#",
          "method": "put",
          "name": "runInstance",
          "query": [
          ],
          "route": "/worker-types/<workerType>/instance",
          "scopes": "ec2-manager:manage-resources:<workerType>",
          "stability": "experimental",
          "title": "Run an instance",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Terminate all instances for this worker type",
          "method": "delete",
          "name": "terminateWorkerType",
          "query": [
          ],
          "route": "/worker-types/<workerType>/resources",
          "scopes": "ec2-manager:manage-resources:<workerType>",
          "stability": "experimental",
          "title": "Terminate all resources from a worker type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Return an object which has a generic state description. This only contains counts of instances",
          "method": "get",
          "name": "workerTypeStats",
          "output": "v1/worker-type-resources.json#",
          "query": [
          ],
          "route": "/worker-types/<workerType>/stats",
          "stability": "experimental",
          "title": "Look up the resource stats for a workerType",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Return a view of the health of a given worker type",
          "method": "get",
          "name": "workerTypeHealth",
          "output": "v1/health.json#",
          "query": [
          ],
          "route": "/worker-types/<workerType>/health",
          "stability": "experimental",
          "title": "Look up the resource health for a workerType",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Return a list of the most recent errors encountered by a worker type",
          "method": "get",
          "name": "workerTypeErrors",
          "output": "v1/errors.json#",
          "query": [
          ],
          "route": "/worker-types/<workerType>/errors",
          "stability": "experimental",
          "title": "Look up the most recent errors of a workerType",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Return state information for a given worker type",
          "method": "get",
          "name": "workerTypeState",
          "output": "v1/worker-type-state.json#",
          "query": [
          ],
          "route": "/worker-types/<workerType>/state",
          "stability": "experimental",
          "title": "Look up the resource state for a workerType",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Idempotently ensure that a keypair of a given name exists",
          "input": "v1/create-key-pair.json#",
          "method": "get",
          "name": "ensureKeyPair",
          "query": [
          ],
          "route": "/key-pairs/<name>",
          "scopes": "ec2-manager:manage-key-pairs:<name>",
          "stability": "experimental",
          "title": "Ensure a KeyPair for a given worker type exists",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Ensure that a keypair of a given name does not exist.",
          "method": "delete",
          "name": "removeKeyPair",
          "query": [
          ],
          "route": "/key-pairs/<name>",
          "scopes": "ec2-manager:manage-key-pairs:<name>",
          "stability": "experimental",
          "title": "Ensure a KeyPair for a given worker type does not exist",
          "type": "function"
        },
        {
          "args": [
            "region",
            "instanceId"
          ],
          "description": "Terminate an instance in a specified region",
          "method": "delete",
          "name": "terminateInstance",
          "query": [
          ],
          "route": "/region/<region>/instance/<instanceId>",
          "scopes": {
            "AnyOf": [
              "ec2-manager:manage-instances:<region>:<instanceId>",
              {
                "if": "hasWorkerType",
                "then": "ec2-manager:manage-resources:<workerType>"
              }
            ]
          },
          "stability": "experimental",
          "title": "Terminate an instance",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return a list of possible prices for EC2",
          "method": "get",
          "name": "getPrices",
          "output": "v1/prices.json#",
          "query": [
          ],
          "route": "/prices",
          "stability": "experimental",
          "title": "Request prices for EC2",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return a list of possible prices for EC2",
          "input": "v1/prices-request.json#",
          "method": "post",
          "name": "getSpecificPrices",
          "output": "v1/prices.json#",
          "query": [
          ],
          "route": "/prices",
          "stability": "experimental",
          "title": "Request prices for EC2",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Give some basic stats on the health of our EC2 account",
          "method": "get",
          "name": "getHealth",
          "output": "v1/health.json#",
          "query": [
          ],
          "route": "/health",
          "stability": "experimental",
          "title": "Get EC2 account health metrics",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return a list of recent errors encountered",
          "method": "get",
          "name": "getRecentErrors",
          "output": "v1/errors.json#",
          "query": [
          ],
          "route": "/errors",
          "stability": "experimental",
          "title": "Look up the most recent errors in the provisioner across all worker types",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This method is only for debugging the ec2-manager",
          "method": "get",
          "name": "regions",
          "query": [
          ],
          "route": "/internal/regions",
          "scopes": "ec2-manager:internals",
          "stability": "experimental",
          "title": "See the list of regions managed by this ec2-manager",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "List AMIs and their usage by returning a list of objects in the form:\n{\nregion: string\n  volumetype: string\n  lastused: timestamp\n}",
          "method": "get",
          "name": "amiUsage",
          "query": [
          ],
          "route": "/internal/ami-usage",
          "scopes": "ec2-manager:internals",
          "stability": "experimental",
          "title": "See the list of AMIs and their usage",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Lists current EBS volume usage by returning a list of objects\nthat are uniquely defined by {region, volumetype, state} in the form:\n{\nregion: string,\n  volumetype: string,\n  state: string,\n  totalcount: integer,\n  totalgb: integer,\n  touched: timestamp (last time that information was updated),\n}",
          "method": "get",
          "name": "ebsUsage",
          "query": [
          ],
          "route": "/internal/ebs-usage",
          "scopes": "ec2-manager:internals",
          "stability": "experimental",
          "title": "See the current EBS volume usage list",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This method is only for debugging the ec2-manager",
          "method": "get",
          "name": "dbpoolStats",
          "query": [
          ],
          "route": "/internal/db-pool-stats",
          "scopes": "ec2-manager:internals",
          "stability": "experimental",
          "title": "Statistics on the Database client pool",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This method is only for debugging the ec2-manager",
          "method": "get",
          "name": "allState",
          "query": [
          ],
          "route": "/internal/all-state",
          "scopes": "ec2-manager:internals",
          "stability": "experimental",
          "title": "List out the entire internal state",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This method is only for debugging the ec2-manager",
          "method": "get",
          "name": "sqsStats",
          "query": [
          ],
          "route": "/internal/sqs-stats",
          "scopes": "ec2-manager:internals",
          "stability": "experimental",
          "title": "Statistics on the sqs queues",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This method is only for debugging the ec2-manager",
          "method": "get",
          "name": "purgeQueues",
          "query": [
          ],
          "route": "/internal/purge-queues",
          "scopes": "ec2-manager:internals",
          "stability": "experimental",
          "title": "Purge the SQS queues",
          "type": "function"
        }
      ],
      "serviceName": "ec2-manager",
      "title": "EC2 Instance Manager"
    }
  },
  "Github": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The github service is responsible for creating tasks in reposnse\nto GitHub events, and posting results to the GitHub UI.\n\nThis document describes the API end-point for consuming GitHub\nweb hooks, as well as some useful consumer APIs.\n\nWhen Github forbids an action, this service returns an HTTP 403\nwith code ForbiddenByGithub.",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Capture a GitHub event and publish it via pulse, if it's a push,\nrelease or pull request.",
          "method": "post",
          "name": "githubWebHookConsumer",
          "query": [
          ],
          "route": "/github",
          "stability": "experimental",
          "title": "Consume GitHub WebHook",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "A paginated list of builds that have been run in\nTaskcluster. Can be filtered on various git-specific\nfields.",
          "method": "get",
          "name": "builds",
          "output": "v1/build-list.json#",
          "query": [
            "continuationToken",
            "limit",
            "organization",
            "repository",
            "sha"
          ],
          "route": "/builds",
          "stability": "experimental",
          "title": "List of Builds",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo",
            "branch"
          ],
          "description": "Checks the status of the latest build of a given branch\nand returns corresponding badge svg.",
          "method": "get",
          "name": "badge",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/<branch>/badge.svg",
          "stability": "experimental",
          "title": "Latest Build Status Badge",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo"
          ],
          "description": "Returns any repository metadata that is\nuseful within Taskcluster related services.",
          "method": "get",
          "name": "repository",
          "output": "v1/repository.json#",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>",
          "stability": "experimental",
          "title": "Get Repository Info",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo",
            "branch"
          ],
          "description": "For a given branch of a repository, this will always point\nto a status page for the most recent task triggered by that\nbranch.\n\nNote: This is a redirect rather than a direct link.",
          "method": "get",
          "name": "latest",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/<branch>/latest",
          "stability": "experimental",
          "title": "Latest Status for Branch",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo",
            "sha"
          ],
          "description": "For a given changeset (SHA) of a repository, this will attach a \"commit status\"\non github. These statuses are links displayed next to each revision.\nThe status is either OK (green check) or FAILURE (red cross), \nmade of a custom title and link.",
          "input": "v1/create-status.json#",
          "method": "post",
          "name": "createStatus",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/statuses/<sha>",
          "scopes": "github:create-status:<owner>/<repo>",
          "stability": "experimental",
          "title": "Post a status against a given changeset",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo",
            "number"
          ],
          "description": "For a given Issue or Pull Request of a repository, this will write a new message.",
          "input": "v1/create-comment.json#",
          "method": "post",
          "name": "createComment",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/issues/<number>/comments",
          "scopes": "github:create-comment:<owner>/<repo>",
          "stability": "experimental",
          "title": "Post a comment on a given GitHub Issue or Pull Request",
          "type": "function"
        }
      ],
      "serviceName": "github",
      "title": "Taskcluster GitHub API Documentation"
    }
  },
  "GithubEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The github service publishes a pulse\nmessage for supported github events, translating Github webhook\nevents into pulse messages.\n\nThis document describes the exchange offered by the taskcluster\ngithub service",
      "entries": [
        {
          "description": "When a GitHub pull request event is posted it will be broadcast on this\nexchange with the designated `organization` and `repository`\nin the routing-key along with event specific metadata in the payload.",
          "exchange": "pull-request",
          "name": "pullRequest",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `\"primary\"` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "organization",
              "required": true,
              "summary": "The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            },
            {
              "multipleWords": false,
              "name": "repository",
              "required": true,
              "summary": "The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            },
            {
              "multipleWords": false,
              "name": "action",
              "required": true,
              "summary": "The GitHub `action` which triggered an event. See for possible values see the payload actions property."
            }
          ],
          "schema": "v1/github-pull-request-message.json#",
          "title": "GitHub Pull Request Event",
          "type": "topic-exchange"
        },
        {
          "description": "When a GitHub push event is posted it will be broadcast on this\nexchange with the designated `organization` and `repository`\nin the routing-key along with event specific metadata in the payload.",
          "exchange": "push",
          "name": "push",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `\"primary\"` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "organization",
              "required": true,
              "summary": "The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            },
            {
              "multipleWords": false,
              "name": "repository",
              "required": true,
              "summary": "The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            }
          ],
          "schema": "v1/github-push-message.json#",
          "title": "GitHub push Event",
          "type": "topic-exchange"
        },
        {
          "description": "When a GitHub release event is posted it will be broadcast on this\nexchange with the designated `organization` and `repository`\nin the routing-key along with event specific metadata in the payload.",
          "exchange": "release",
          "name": "release",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `\"primary\"` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "organization",
              "required": true,
              "summary": "The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            },
            {
              "multipleWords": false,
              "name": "repository",
              "required": true,
              "summary": "The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            }
          ],
          "schema": "v1/github-release-message.json#",
          "title": "GitHub release Event",
          "type": "topic-exchange"
        },
        {
          "description": "supposed to signal that taskCreate API has been called for every task in the task group\nfor this particular repo and this particular organization\ncurrently used for creating initial status indicators in GitHub UI using Statuses API.\nThis particular exchange can also be bound to RabbitMQ queues by custom routes - for that,\nPass in the array of routes as a second argument to the publish method. Currently, we do\nuse the statuses routes to bind the handler that creates the initial status.",
          "exchange": "task-group-creation-requested",
          "name": "taskGroupCreationRequested",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `\"primary\"` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "organization",
              "required": true,
              "summary": "The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            },
            {
              "multipleWords": false,
              "name": "repository",
              "required": true,
              "summary": "The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped."
            }
          ],
          "schema": "v1/task-group-creation-requested.json#",
          "title": "tc-gh requested the Queue service to create all the tasks in a group",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-github/v1/",
      "serviceName": "github",
      "title": "Taskcluster-Github Exchanges"
    }
  },
  "Hooks": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The hooks service provides a mechanism for creating tasks in response to events.\n",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This endpoint will return a list of all hook groups with at least one hook.",
          "method": "get",
          "name": "listHookGroups",
          "output": "v1/list-hook-groups-response.json#",
          "query": [
          ],
          "route": "/hooks",
          "stability": "stable",
          "title": "List hook groups",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId"
          ],
          "description": "This endpoint will return a list of all the hook definitions within a\ngiven hook group.",
          "method": "get",
          "name": "listHooks",
          "output": "v1/list-hooks-response.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>",
          "stability": "stable",
          "title": "List hooks in a given group",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will return the hook definition for the given `hookGroupId`\nand hookId.",
          "method": "get",
          "name": "hook",
          "output": "v1/hook-definition.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "stability": "stable",
          "title": "Get hook definition",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will return the current status of the hook.  This represents a\nsnapshot in time and may vary from one call to the next.\n\nThis method is deprecated in favor of listLastFires.",
          "method": "get",
          "name": "getHookStatus",
          "output": "v1/hook-status.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/status",
          "stability": "deprecated",
          "title": "Get hook status",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will create a new hook.\n\nThe caller's credentials must include the role that will be used to\ncreate the task.  That role must satisfy task.scopes as well as the\nnecessary scopes to add the task to the queue.",
          "input": "v1/create-hook-request.json#",
          "method": "put",
          "name": "createHook",
          "output": "v1/hook-definition.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "scopes": {
            "AllOf": [
              "hooks:modify-hook:<hookGroupId>/<hookId>",
              "assume:hook-id:<hookGroupId>/<hookId>"
            ]
          },
          "stability": "stable",
          "title": "Create a hook",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will update an existing hook.  All fields except\n`hookGroupId` and `hookId` can be modified.",
          "input": "v1/create-hook-request.json#",
          "method": "post",
          "name": "updateHook",
          "output": "v1/hook-definition.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "scopes": {
            "AllOf": [
              "hooks:modify-hook:<hookGroupId>/<hookId>",
              "assume:hook-id:<hookGroupId>/<hookId>"
            ]
          },
          "stability": "stable",
          "title": "Update a hook",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will remove a hook definition.",
          "method": "delete",
          "name": "removeHook",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "scopes": "hooks:modify-hook:<hookGroupId>/<hookId>",
          "stability": "stable",
          "title": "Delete a hook",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will trigger the creation of a task from a hook definition.\n\nThe HTTP payload must match the hooks `triggerSchema`.  If it does, it is\nprovided as the `payload` property of the JSON-e context used to render the\ntask template.",
          "input": "v1/trigger-hook.json#",
          "method": "post",
          "name": "triggerHook",
          "output": "v1/trigger-hook-response.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/trigger",
          "scopes": "hooks:trigger-hook:<hookGroupId>/<hookId>",
          "stability": "stable",
          "title": "Trigger a hook",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "Retrieve a unique secret token for triggering the specified hook. This\ntoken can be deactivated with `resetTriggerToken`.",
          "method": "get",
          "name": "getTriggerToken",
          "output": "v1/trigger-token-response.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/token",
          "scopes": "hooks:get-trigger-token:<hookGroupId>/<hookId>",
          "stability": "stable",
          "title": "Get a trigger token",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "Reset the token for triggering a given hook. This invalidates token that\nmay have been issued via getTriggerToken with a new token.",
          "method": "post",
          "name": "resetTriggerToken",
          "output": "v1/trigger-token-response.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/token",
          "scopes": "hooks:reset-trigger-token:<hookGroupId>/<hookId>",
          "stability": "stable",
          "title": "Reset a trigger token",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId",
            "token"
          ],
          "description": "This endpoint triggers a defined hook with a valid token.\n\nThe HTTP payload must match the hooks `triggerSchema`.  If it does, it is\nprovided as the `payload` property of the JSON-e context used to render the\ntask template.",
          "input": "v1/trigger-hook.json#",
          "method": "post",
          "name": "triggerHookWithToken",
          "output": "v1/trigger-hook-response.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/trigger/<token>",
          "stability": "stable",
          "title": "Trigger a hook with a token",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will return information about the the last few times this hook has been\nfired, including whether the hook was fired successfully or not",
          "method": "get",
          "name": "listLastFires",
          "output": "v1/list-lastFires-response.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/last-fires",
          "stability": "experimental",
          "title": "Get information about recent hook fires",
          "type": "function"
        }
      ],
      "serviceName": "hooks",
      "title": "Hooks API Documentation"
    }
  },
  "HooksEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The hooks service is responsible for creating tasks at specific times orin .  response to webhooks and API calls.Using this exchange allows us tomake hooks which repsond to particular pulse messagesThese exchanges provide notifications when a hook is created, updatedor deleted. This is so that the listener running in a different hooks process at the other end can direct another listener specified by`hookGroupId` and `hookId` to synchronize its bindings. But you are ofcourse welcome to use these for other purposes, monitoring changes for example.",
      "entries": [
        {
          "description": "Whenever the api receives a request to create apulse based hook, a message is posted to this exchange andthe receiver creates a listener with the bindings, to create a task",
          "exchange": "hook-created",
          "name": "hookCreated",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/pulse-hook-changed-message.json#",
          "title": "Hook Created Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever the api receives a request to update apulse based hook, a message is posted to this exchange andthe receiver updates the listener associated with that hook.",
          "exchange": "hook-updated",
          "name": "hookUpdated",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/pulse-hook-changed-message.json#",
          "title": "Hook Updated Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever the api receives a request to delete apulse based hook, a message is posted to this exchange andthe receiver deletes the listener associated with that hook.",
          "exchange": "hook-deleted",
          "name": "hookDeleted",
          "routingKey": [
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/pulse-hook-changed-message.json#",
          "title": "Hook Deleted Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-hooks/v1/",
      "serviceName": "hooks",
      "title": "Exchanges to manage hooks"
    }
  },
  "Index": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The index service is responsible for indexing tasks. The service ensures that\ntasks can be located by user-defined names.\n\nAs described in the service documentation, tasks are typically indexed via Pulse\nmessages, so the most common use of API methods is to read from the index.",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
            "indexPath"
          ],
          "description": "Find a task by index path, returning the highest-rank task with that path. If no\ntask exists for the given path, this API end-point will respond with a 404 status.",
          "method": "get",
          "name": "findTask",
          "output": "v1/indexed-task-response.json#",
          "query": [
          ],
          "route": "/task/<indexPath>",
          "stability": "stable",
          "title": "Find Indexed Task",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "List the namespaces immediately under a given namespace.\n\nThis endpoint\nlists up to 1000 namespaces. If more namespaces are present, a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.",
          "method": "get",
          "name": "listNamespaces",
          "output": "v1/list-namespaces-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/namespaces/<namespace>",
          "stability": "stable",
          "title": "List Namespaces",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "List the tasks immediately under a given namespace.\n\nThis endpoint\nlists up to 1000 tasks. If more tasks are present, a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.\n\n**Remark**, this end-point is designed for humans browsing for tasks, not\nservices, as that makes little sense.",
          "method": "get",
          "name": "listTasks",
          "output": "v1/list-tasks-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/tasks/<namespace>",
          "stability": "stable",
          "title": "List Tasks",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "Insert a task into the index.  If the new rank is less than the existing rank\nat the given index path, the task is not indexed but the response is still 200 OK.\n\nPlease see the introduction above for information\nabout indexing successfully completed tasks automatically using custom routes.",
          "input": "v1/insert-task-request.json#",
          "method": "put",
          "name": "insertTask",
          "output": "v1/indexed-task-response.json#",
          "query": [
          ],
          "route": "/task/<namespace>",
          "scopes": "index:insert-task:<namespace>",
          "stability": "stable",
          "title": "Insert Task into Index",
          "type": "function"
        },
        {
          "args": [
            "indexPath",
            "name"
          ],
          "description": "Find a task by index path and redirect to the artifact on the most recent\nrun with the given `name`.\n\nNote that multiple calls to this endpoint may return artifacts from differen tasks\nif a new task is inserted into the index between calls. Avoid using this method as\na stable link to multiple, connected files if the index path does not contain a\nunique identifier.  For example, the following two links may return unrelated files:\n* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/installer.exe`\n* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/debug-symbols.zip`\n\nThis problem be remedied by including the revision in the index path or by bundling both\ninstaller and debug symbols into a single artifact.\n\nIf no task exists for the given index path, this API end-point responds with 404.",
          "method": "get",
          "name": "findArtifactFromTask",
          "query": [
          ],
          "route": "/task/<indexPath>/artifacts/<name>",
          "scopes": {
            "if": "private",
            "then": "queue:get-artifact:<name>"
          },
          "stability": "stable",
          "title": "Get Artifact From Indexed Task",
          "type": "function"
        }
      ],
      "serviceName": "index",
      "title": "Task Index API Documentation"
    }
  },
  "Login": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The Login service serves as the interface between external authentication\nsystems and Taskcluster credentials.",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
            "provider"
          ],
          "description": "Given an OIDC `access_token` from a trusted OpenID provider, return a\nset of Taskcluster credentials for use on behalf of the identified\nuser.\n\nThis method is typically not called with a Taskcluster client library\nand does not accept Hawk credentials. The `access_token` should be\ngiven in an `Authorization` header:\n```\nAuthorization: Bearer abc.xyz\n```\n\nThe `access_token` is first verified against the named\n:provider, then passed to the provider's APIBuilder to retrieve a user\nprofile. That profile is then used to generate Taskcluster credentials\nappropriate to the user. Note that the resulting credentials may or may\nnot include a `certificate` property. Callers should be prepared for either\nalternative.\n\nThe given credentials will expire in a relatively short time. Callers should\nmonitor this expiration and refresh the credentials if necessary, by calling\nthis endpoint again, if they have expired.",
          "method": "get",
          "name": "oidcCredentials",
          "output": "v1/oidc-credentials-response.json#",
          "query": [
          ],
          "route": "/oidc-credentials/<provider>",
          "stability": "experimental",
          "title": "Get Taskcluster credentials given a suitable `access_token`",
          "type": "function"
        }
      ],
      "serviceName": "login",
      "title": "Login API"
    }
  },
  "Notify": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The notification service listens for tasks with associated notifications\nand handles requests to send emails and post pulse messages.",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Send an email to `address`. The content is markdown and will be rendered\nto HTML, but both the HTML and raw markdown text will be sent in the\nemail. If a link is included, it will be rendered to a nice button in the\nHTML version of the email",
          "input": "v1/email-request.json#",
          "method": "post",
          "name": "email",
          "query": [
          ],
          "route": "/email",
          "scopes": "notify:email:<address>",
          "stability": "experimental",
          "title": "Send an Email",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Publish a message on pulse with the given `routingKey`.",
          "input": "v1/pulse-request.json#",
          "method": "post",
          "name": "pulse",
          "query": [
          ],
          "route": "/pulse",
          "scopes": "notify:pulse:<routingKey>",
          "stability": "experimental",
          "title": "Publish a Pulse Message",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Post a message on IRC to a specific channel or user, or a specific user\non a specific channel.\n\nSuccess of this API method does not imply the message was successfully\nposted. This API method merely inserts the IRC message into a queue\nthat will be processed by a background process.\nThis allows us to re-send the message in face of connection issues.\n\nHowever, if the user isn't online the message will be dropped without\nerror. We maybe improve this behavior in the future. For now just keep\nin mind that IRC is a best-effort service.",
          "input": "v1/irc-request.json#",
          "method": "post",
          "name": "irc",
          "query": [
          ],
          "route": "/irc",
          "scopes": {
            "else": "notify:irc-user:<user>",
            "if": "channelRequest",
            "then": "notify:irc-channel:<channel>"
          },
          "stability": "experimental",
          "title": "Post IRC Message",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Add the given address to the notification denylist. The address\ncan be of either of the three supported address type namely pulse, email\nor IRC(user or channel). Addresses in the denylist will be ignored\nby the notification service.",
          "input": "v1/notification-address.json#",
          "method": "post",
          "name": "addDenylistAddress",
          "query": [
          ],
          "route": "/denylist/add",
          "scopes": "notify:manage-denylist",
          "stability": "experimental",
          "title": "Denylist Given Address",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Delete the specified address from the notification denylist.",
          "input": "v1/notification-address.json#",
          "method": "delete",
          "name": "deleteDenylistAddress",
          "query": [
          ],
          "route": "/denylist/delete",
          "scopes": "notify:manage-denylist",
          "stability": "experimental",
          "title": "Delete Denylisted Address",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Lists all the denylisted addresses.\n\nBy default this end-point will try to return up to 1000 addresses in one\nrequest. But it **may return less**, even if more tasks are available.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `list` with the last `continuationToken` until you\nget a result without a `continuationToken`.\n\nIf you are not interested in listing all the members at once, you may\nuse the query-string option `limit` to return fewer.",
          "method": "get",
          "name": "listDenylist",
          "output": "v1/notification-address-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/denylist/list",
          "scopes": "notify:manage-denylist",
          "stability": "experimental",
          "title": "List Denylisted Notifications",
          "type": "function"
        }
      ],
      "serviceName": "notify",
      "title": "Notification Service"
    }
  },
  "NotifyEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "This pretty much only contains the simple free-form\nmessage that can be published from this service from a request\nby anybody with the proper scopes.",
      "entries": [
        {
          "description": "An arbitrary message that a taskcluster user\ncan trigger if they like.\n\nThe standard one that is published by us watching\nfor the completion of tasks is just the task status\ndata that we pull from the queue `status()` endpoint\nwhen we notice a task is complete.",
          "exchange": "notification",
          "name": "notify",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/notification-message.json#",
          "title": "Notification Messages",
          "type": "topic-exchange"
        },
        {
          "description": "A message which is to be sent to an irc channel or\nuser is published to this exchange",
          "exchange": "irc-request",
          "name": "ircRequest",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/irc-request.json#",
          "title": "Request for irc notification",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-notify/v1/",
      "serviceName": "notify",
      "title": "Notify AMQP Exchanges"
    }
  },
  "PurgeCache": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The purge-cache service is responsible for tracking cache-purge requests.\n\nUser create purge requests for specific caches on specific workers, and\nthese requests are timestamped.  Workers consult the service before\nstarting a new task, and purge any caches older than the timestamp.",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Publish a request to purge caches named `cacheName` with\non `provisionerId`/`workerType` workers.\n\nIf such a request already exists, its `before` timestamp is updated to\nthe current time.",
          "input": "v1/purge-cache-request.json#",
          "method": "post",
          "name": "purgeCache",
          "query": [
          ],
          "route": "/purge-cache/<provisionerId>/<workerType>",
          "scopes": "purge-cache:<provisionerId>/<workerType>:<cacheName>",
          "stability": "stable",
          "title": "Purge Worker Cache",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "View all active purge requests.\n\nThis is useful mostly for administors to view\nthe set of open purge requests. It should not\nbe used by workers. They should use the purgeRequests\nendpoint that is specific to their workerType and\nprovisionerId.",
          "method": "get",
          "name": "allPurgeRequests",
          "output": "v1/all-purge-cache-request-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/purge-cache/list",
          "stability": "stable",
          "title": "All Open Purge Requests",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "List the caches for this `provisionerId`/`workerType` that should to be\npurged if they are from before the time given in the response.\n\nThis is intended to be used by workers to determine which caches to purge.",
          "method": "get",
          "name": "purgeRequests",
          "output": "v1/purge-cache-request-list.json#",
          "query": [
            "since"
          ],
          "route": "/purge-cache/<provisionerId>/<workerType>",
          "stability": "stable",
          "title": "Open Purge Requests for a provisionerId/workerType pair",
          "type": "function"
        }
      ],
      "serviceName": "purge-cache",
      "title": "Purge Cache API"
    }
  },
  "Queue": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The queue service is responsible for accepting tasks and track their state\nas they are executed by workers. In order ensure they are eventually\nresolved.\n\nThis document describes the API end-points offered by the queue. These \nend-points targets the following audience:\n * Schedulers, who create tasks to be executed,\n * Workers, who execute tasks, and\n * Tools, that wants to inspect the state of a task.",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "This end-point will return the task-definition. Notice that the task\ndefinition may have been modified by queue, if an optional property is\nnot specified the queue may provide a default value.",
          "method": "get",
          "name": "task",
          "output": "v1/task.json#",
          "query": [
          ],
          "route": "/task/<taskId>",
          "stability": "stable",
          "title": "Get Task Definition",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "Get task status structure from `taskId`",
          "method": "get",
          "name": "status",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/status",
          "stability": "stable",
          "title": "Get task status",
          "type": "function"
        },
        {
          "args": [
            "taskGroupId"
          ],
          "description": "List tasks sharing the same `taskGroupId`.\n\nAs a task-group may contain an unbounded number of tasks, this end-point\nmay return a `continuationToken`. To continue listing tasks you must call\nthe `listTaskGroup` again with the `continuationToken` as the\nquery-string option `continuationToken`.\n\nBy default this end-point will try to return up to 1000 members in one\nrequest. But it **may return less**, even if more tasks are available.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `listTaskGroup` with the last `continuationToken` until you\nget a result without a `continuationToken`.\n\nIf you are not interested in listing all the members at once, you may\nuse the query-string option `limit` to return fewer.",
          "method": "get",
          "name": "listTaskGroup",
          "output": "v1/list-task-group-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task-group/<taskGroupId>/list",
          "stability": "stable",
          "title": "List Task Group",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "List tasks that depend on the given `taskId`.\n\nAs many tasks from different task-groups may dependent on a single tasks,\nthis end-point may return a `continuationToken`. To continue listing\ntasks you must call `listDependentTasks` again with the\n`continuationToken` as the query-string option `continuationToken`.\n\nBy default this end-point will try to return up to 1000 tasks in one\nrequest. But it **may return less**, even if more tasks are available.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `listDependentTasks` with the last `continuationToken` until\nyou get a result without a `continuationToken`.\n\nIf you are not interested in listing all the tasks at once, you may\nuse the query-string option `limit` to return fewer.",
          "method": "get",
          "name": "listDependentTasks",
          "output": "v1/list-dependent-tasks-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task/<taskId>/dependents",
          "stability": "stable",
          "title": "List Dependent Tasks",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "Create a new task, this is an **idempotent** operation, so repeat it if\nyou get an internal server error or network connection is dropped.\n\n**Task `deadline`**: the deadline property can be no more than 5 days\ninto the future. This is to limit the amount of pending tasks not being\ntaken care of. Ideally, you should use a much shorter deadline.\n\n**Task expiration**: the `expires` property must be greater than the\ntask `deadline`. If not provided it will default to `deadline` + one\nyear. Notice, that artifacts created by task must expire before the task.\n\n**Task specific routing-keys**: using the `task.routes` property you may\ndefine task specific routing-keys. If a task has a task specific \nrouting-key: `<route>`, then when the AMQP message about the task is\npublished, the message will be CC'ed with the routing-key: \n`route.<route>`. This is useful if you want another component to listen\nfor completed tasks you have posted.  The caller must have scope\n`queue:route:<route>` for each route.\n\n**Dependencies**: any tasks referenced in `task.dependencies` must have\nalready been created at the time of this call.\n\n**Scopes**: Note that the scopes required to complete this API call depend\non the content of the `scopes`, `routes`, `schedulerId`, `priority`,\n`provisionerId`, and `workerType` properties of the task definition.\n\n**Legacy Scopes**: The `queue:create-task:..` scope without a priority and\nthe `queue:define-task:..` and `queue:task-group-id:..` scopes are considered\nlegacy and should not be used. Note that the new, non-legacy scopes require\na `queue:scheduler-id:..` scope as well as scopes for the proper priority.",
          "input": "v1/create-task-request.json#",
          "method": "put",
          "name": "createTask",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>",
          "scopes": {
            "AllOf": [
              {
                "each": "<scope>",
                "for": "scope",
                "in": "scopes"
              },
              {
                "each": "queue:route:<route>",
                "for": "route",
                "in": "routes"
              },
              {
                "AnyOf": [
                  {
                    "AllOf": [
                      "queue:scheduler-id:<schedulerId>",
                      {
                        "AnyOf": [
                          {
                            "each": "queue:create-task:<priority>:<provisionerId>/<workerType>",
                            "for": "priority",
                            "in": "priorities"
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "if": "legacyScopes",
                    "then": {
                      "AnyOf": [
                        "queue:create-task:<provisionerId>/<workerType>",
                        {
                          "AllOf": [
                            "queue:define-task:<provisionerId>/<workerType>",
                            "queue:task-group-id:<schedulerId>/<taskGroupId>",
                            "queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>"
                          ]
                        }
                      ]
                    }
                  }
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Create New Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "**Deprecated**, this is the same as `createTask` with a **self-dependency**.\nThis is only present for legacy.",
          "input": "v1/create-task-request.json#",
          "method": "post",
          "name": "defineTask",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/define",
          "scopes": {
            "AllOf": [
              {
                "each": "<scope>",
                "for": "scope",
                "in": "scopes"
              },
              {
                "each": "queue:route:<route>",
                "for": "route",
                "in": "routes"
              },
              {
                "AnyOf": [
                  {
                    "AllOf": [
                      "queue:scheduler-id:<schedulerId>",
                      {
                        "AnyOf": [
                          {
                            "each": "queue:create-task:<priority>:<provisionerId>/<workerType>",
                            "for": "priority",
                            "in": "priorities"
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "if": "legacyScopes",
                    "then": {
                      "AnyOf": [
                        "queue:define-task:<provisionerId>/<workerType>",
                        "queue:create-task:<provisionerId>/<workerType>",
                        {
                          "AllOf": [
                            "queue:define-task:<provisionerId>/<workerType>",
                            "queue:task-group-id:<schedulerId>/<taskGroupId>"
                          ]
                        }
                      ]
                    }
                  }
                ]
              }
            ]
          },
          "stability": "deprecated",
          "title": "Define Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "scheduleTask will schedule a task to be executed, even if it has\nunresolved dependencies. A task would otherwise only be scheduled if\nits dependencies were resolved.\n\nThis is useful if you have defined a task that depends on itself or on\nsome other task that has not been resolved, but you wish the task to be\nscheduled immediately.\n\nThis will announce the task as pending and workers will be allowed to\nclaim it and resolve the task.\n\n**Note** this operation is **idempotent** and will not fail or complain\nif called with a `taskId` that is already scheduled, or even resolved.\nTo reschedule a task previously resolved, use `rerunTask`.",
          "method": "post",
          "name": "scheduleTask",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/schedule",
          "scopes": {
            "AnyOf": [
              "queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>",
              {
                "AllOf": [
                  "queue:schedule-task",
                  "assume:scheduler-id:<schedulerId>/<taskGroupId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Schedule Defined Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "This method _reruns_ a previously resolved task, even if it was\n_completed_. This is useful if your task completes unsuccessfully, and\nyou just want to run it from scratch again. This will also reset the\nnumber of `retries` allowed.\n\nThis method is deprecated in favour of creating a new task with the same\ntask definition (but with a new taskId).\n\nRemember that `retries` in the task status counts the number of runs that\nthe queue have started because the worker stopped responding, for example\nbecause a spot node died.\n\n**Remark** this operation is idempotent, if you try to rerun a task that\nis not either `failed` or `completed`, this operation will just return\nthe current task status.",
          "method": "post",
          "name": "rerunTask",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/rerun",
          "scopes": {
            "AnyOf": [
              "queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>",
              {
                "AllOf": [
                  "queue:rerun-task",
                  "assume:scheduler-id:<schedulerId>/<taskGroupId>"
                ]
              }
            ]
          },
          "stability": "deprecated",
          "title": "Rerun a Resolved Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "This method will cancel a task that is either `unscheduled`, `pending` or\n`running`. It will resolve the current run as `exception` with\n`reasonResolved` set to `canceled`. If the task isn't scheduled yet, ie.\nit doesn't have any runs, an initial run will be added and resolved as\ndescribed above. Hence, after canceling a task, it cannot be scheduled\nwith `queue.scheduleTask`, but a new run can be created with\n`queue.rerun`. These semantics is equivalent to calling\n`queue.scheduleTask` immediately followed by `queue.cancelTask`.\n\n**Remark** this operation is idempotent, if you try to cancel a task that\nisn't `unscheduled`, `pending` or `running`, this operation will just\nreturn the current task status.",
          "method": "post",
          "name": "cancelTask",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/cancel",
          "scopes": {
            "AnyOf": [
              "queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>",
              {
                "AllOf": [
                  "queue:cancel-task",
                  "assume:scheduler-id:<schedulerId>/<taskGroupId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Cancel Task",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Claim pending task(s) for the given `provisionerId`/`workerType` queue.\n\nIf any work is available (even if fewer than the requested number of\ntasks, this will return immediately. Otherwise, it will block for tens of\nseconds waiting for work.  If no work appears, it will return an emtpy\nlist of tasks.  Callers should sleep a short while (to avoid denial of\nservice in an error condition) and call the endpoint again.  This is a\nsimple implementation of \"long polling\".",
          "input": "v1/claim-work-request.json#",
          "method": "post",
          "name": "claimWork",
          "output": "v1/claim-work-response.json#",
          "query": [
          ],
          "route": "/claim-work/<provisionerId>/<workerType>",
          "scopes": {
            "AllOf": [
              "queue:claim-work:<provisionerId>/<workerType>",
              "queue:worker-id:<workerGroup>/<workerId>"
            ]
          },
          "stability": "stable",
          "title": "Claim Work",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "claim a task - never documented",
          "input": "v1/task-claim-request.json#",
          "method": "post",
          "name": "claimTask",
          "output": "v1/task-claim-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/claim",
          "scopes": {
            "AnyOf": [
              {
                "AllOf": [
                  "queue:claim-task:<provisionerId>/<workerType>",
                  "queue:worker-id:<workerGroup>/<workerId>"
                ]
              },
              {
                "AllOf": [
                  "queue:claim-task",
                  "assume:worker-type:<provisionerId>/<workerType>",
                  "assume:worker-id:<workerGroup>/<workerId>"
                ]
              }
            ]
          },
          "stability": "deprecated",
          "title": "Claim Task",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Refresh the claim for a specific `runId` for given `taskId`. This updates\nthe `takenUntil` property and returns a new set of temporary credentials\nfor performing requests on behalf of the task. These credentials should\nbe used in-place of the credentials returned by `claimWork`.\n\nThe `reclaimTask` requests serves to:\n * Postpone `takenUntil` preventing the queue from resolving\n   `claim-expired`,\n * Refresh temporary credentials used for processing the task, and\n * Abort execution if the task/run have been resolved.\n\nIf the `takenUntil` timestamp is exceeded the queue will resolve the run\nas _exception_ with reason `claim-expired`, and proceeded to retry to the\ntask. This ensures that tasks are retried, even if workers disappear\nwithout warning.\n\nIf the task is resolved, this end-point will return `409` reporting\n`RequestConflict`. This typically happens if the task have been canceled\nor the `task.deadline` have been exceeded. If reclaiming fails, workers\nshould abort the task and forget about the given `runId`. There is no\nneed to resolve the run or upload artifacts.",
          "method": "post",
          "name": "reclaimTask",
          "output": "v1/task-reclaim-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/reclaim",
          "scopes": {
            "AnyOf": [
              "queue:reclaim-task:<taskId>/<runId>",
              {
                "AllOf": [
                  "queue:claim-task",
                  "assume:worker-id:<workerGroup>/<workerId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Reclaim task",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Report a task completed, resolving the run as `completed`.",
          "method": "post",
          "name": "reportCompleted",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/completed",
          "scopes": {
            "AnyOf": [
              "queue:resolve-task:<taskId>/<runId>",
              {
                "AllOf": [
                  "queue:resolve-task",
                  "assume:worker-id:<workerGroup>/<workerId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Report Run Completed",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Report a run failed, resolving the run as `failed`. Use this to resolve\na run that failed because the task specific code behaved unexpectedly.\nFor example the task exited non-zero, or didn't produce expected output.\n\nDo not use this if the task couldn't be run because if malformed\npayload, or other unexpected condition. In these cases we have a task\nexception, which should be reported with `reportException`.",
          "method": "post",
          "name": "reportFailed",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/failed",
          "scopes": {
            "AnyOf": [
              "queue:resolve-task:<taskId>/<runId>",
              {
                "AllOf": [
                  "queue:resolve-task",
                  "assume:worker-id:<workerGroup>/<workerId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Report Run Failed",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Resolve a run as _exception_. Generally, you will want to report tasks as\nfailed instead of exception. You should `reportException` if,\n\n  * The `task.payload` is invalid,\n  * Non-existent resources are referenced,\n  * Declared actions cannot be executed due to unavailable resources,\n  * The worker had to shutdown prematurely,\n  * The worker experienced an unknown error, or,\n  * The task explicitly requested a retry.\n\nDo not use this to signal that some user-specified code crashed for any\nreason specific to this code. If user-specific code hits a resource that\nis temporarily unavailable worker should report task _failed_.",
          "input": "v1/task-exception-request.json#",
          "method": "post",
          "name": "reportException",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/exception",
          "scopes": {
            "AnyOf": [
              "queue:resolve-task:<taskId>/<runId>",
              {
                "AllOf": [
                  "queue:resolve-task",
                  "assume:worker-id:<workerGroup>/<workerId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Report Task Exception",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "description": "This API end-point creates an artifact for a specific run of a task. This\nshould **only** be used by a worker currently operating on this task, or\nfrom a process running within the task (ie. on the worker).\n\nAll artifacts must specify when they `expires`, the queue will\nautomatically take care of deleting artifacts past their\nexpiration point. This features makes it feasible to upload large\nintermediate artifacts from data processing applications, as the\nartifacts can be set to expire a few days later.\n\nWe currently support 3 different `storageType`s, each storage type have\nslightly different features and in some cases difference semantics.\nWe also have 2 deprecated `storageType`s which are only maintained for\nbackwards compatiability and should not be used in new implementations\n\n**Blob artifacts**, are useful for storing large files.  Currently, these\nare all stored in S3 but there are facilities for adding support for other\nbackends in futre.  A call for this type of artifact must provide information\nabout the file which will be uploaded.  This includes sha256 sums and sizes.\nThis method will return a list of general form HTTP requests which are signed\nby AWS S3 credentials managed by the Queue.  Once these requests are completed\nthe list of `ETag` values returned by the requests must be passed to the\nqueue `completeArtifact` method\n\n**S3 artifacts**, DEPRECATED is useful for static files which will be\nstored on S3. When creating an S3 artifact the queue will return a\npre-signed URL to which you can do a `PUT` request to upload your\nartifact. Note that `PUT` request **must** specify the `content-length`\nheader and **must** give the `content-type` header the same value as in\nthe request to `createArtifact`.\n\n**Azure artifacts**, DEPRECATED are stored in _Azure Blob Storage_ service\nwhich given the consistency guarantees and API interface offered by Azure\nis more suitable for artifacts that will be modified during the execution\nof the task. For example docker-worker has a feature that persists the\ntask log to Azure Blob Storage every few seconds creating a somewhat\nlive log. A request to create an Azure artifact will return a URL\nfeaturing a [Shared-Access-Signature](http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),\nrefer to MSDN for further information on how to use these.\n**Warning: azure artifact is currently an experimental feature subject\nto changes and data-drops.**\n\n**Reference artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts really only have a `url` property and\nwhen the artifact is requested the client will be redirect the URL\nprovided with a `303` (See Other) redirect. Please note that we cannot\ndelete artifacts you upload to other service, we can only delete the\nreference to the artifact, when it expires.\n\n**Error artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts are only meant to indicate that you the\nworker or the task failed to generate a specific artifact, that you\nwould otherwise have uploaded. For example docker-worker will upload an\nerror artifact, if the file it was supposed to upload doesn't exists or\nturns out to be a directory. Clients requesting an error artifact will\nget a `424` (Failed Dependency) response. This is mainly designed to\nensure that dependent tasks can distinguish between artifacts that were\nsuppose to be generated and artifacts for which the name is misspelled.\n\n**Artifact immutability**, generally speaking you cannot overwrite an\nartifact when created. But if you repeat the request with the same\nproperties the request will succeed as the operation is idempotent.\nThis is useful if you need to refresh a signed URL while uploading.\nDo not abuse this to overwrite artifacts created by another entity!\nSuch as worker-host overwriting artifact created by worker-code.\n\nAs a special case the `url` property on _reference artifacts_ can be\nupdated. You should only use this to update the `url` property for\nreference artifacts your process has created.",
          "input": "v1/post-artifact-request.json#",
          "method": "post",
          "name": "createArtifact",
          "output": "v1/post-artifact-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": {
            "AnyOf": [
              "queue:create-artifact:<taskId>/<runId>",
              {
                "AllOf": [
                  "queue:create-artifact:<name>",
                  "assume:worker-id:<workerGroup>/<workerId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Create Artifact",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "description": "This endpoint finalises an upload done through the blob `storageType`.\nThe queue will ensure that the task/run is still allowing artifacts\nto be uploaded.  For single-part S3 blob artifacts, this endpoint\nwill simply ensure the artifact is present in S3.  For multipart S3\nartifacts, the endpoint will perform the commit step of the multipart\nupload flow.  As the final step for both multi and single part artifacts,\nthe `present` entity field will be set to `true` to reflect that the\nartifact is now present and a message published to pulse.  NOTE: This\nendpoint *must* be called for all artifacts of storageType 'blob'",
          "input": "v1/put-artifact-request.json#",
          "method": "put",
          "name": "completeArtifact",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": {
            "AnyOf": [
              "queue:create-artifact:<taskId>/<runId>",
              {
                "AllOf": [
                  "queue:create-artifact:<name>",
                  "assume:worker-id:<workerGroup>/<workerId>"
                ]
              }
            ]
          },
          "stability": "experimental",
          "title": "Complete Artifact",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "description": "Get artifact by `<name>` from a specific run.\n\n**Public Artifacts**, in-order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nBut if the artifact `name` starts with `public/`, authentication and\nauthorization is not necessary to fetch the artifact.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with an HTTP client that can handle responses correctly.\n\n**Downloading artifacts**\nThere are some special considerations for those http clients which download\nartifacts.  This api endpoint is designed to be compatible with an HTTP 1.1\ncompliant client, but has extra features to ensure the download is valid.\nIt is strongly recommend that consumers use either taskcluster-lib-artifact (JS),\ntaskcluster-lib-artifact-go (Go) or the CLI written in Go to interact with\nartifacts.\n\nIn order to download an artifact the following must be done:\n\n1. Obtain queue url.  Building a signed url with a taskcluster client is\nrecommended\n1. Make a GET request which does not follow redirects\n1. In all cases, if specified, the\nx-taskcluster-location-{content,transfer}-{sha256,length} values must be\nvalidated to be equal to the Content-Length and Sha256 checksum of the\nfinal artifact downloaded. as well as any intermediate redirects\n1. If this response is a 500-series error, retry using an exponential\nbackoff.  No more than 5 retries should be attempted\n1. If this response is a 400-series error, treat it appropriately for\nyour context.  This might be an error in responding to this request or\nan Error storage type body.  This request should not be retried.\n1. If this response is a 200-series response, the response body is the artifact.\nIf the x-taskcluster-location-{content,transfer}-{sha256,length} and\nx-taskcluster-location-content-encoding are specified, they should match\nthis response body\n1. If the response type is a 300-series redirect, the artifact will be at the\nlocation specified by the `Location` header.  There are multiple artifact storage\ntypes which use a 300-series redirect.\n1. For all redirects followed, the user must verify that the content-sha256, content-length,\ntransfer-sha256, transfer-length and content-encoding match every further request.  The final\nartifact must also be validated against the values specified in the original queue response\n1. Caching of requests with an x-taskcluster-artifact-storage-type value of `reference`\nmust not occur\n1. A request which has x-taskcluster-artifact-storage-type value of `blob` and does not\nhave x-taskcluster-location-content-sha256 or x-taskcluster-location-content-length\nmust be treated as an error\n\n**Headers**\nThe following important headers are set on the response to this method:\n\n* location: the url of the artifact if a redirect is to be performed\n* x-taskcluster-artifact-storage-type: the storage type.  Example: blob, s3, error\n\nThe following important headers are set on responses to this method for Blob artifacts\n\n* x-taskcluster-location-content-sha256: the SHA256 of the artifact\n*after* any content-encoding is undone.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})\n* x-taskcluster-location-content-length: the number of bytes *after* any content-encoding\nis undone\n* x-taskcluster-location-transfer-sha256: the SHA256 of the artifact\n*before* any content-encoding is undone.  This is the SHA256 of what is sent over\nthe wire.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})\n* x-taskcluster-location-transfer-length: the number of bytes *after* any content-encoding\nis undone\n* x-taskcluster-location-content-encoding: the content-encoding used.  It will either\nbe `gzip` or `identity` right now.  This is hardcoded to a value set when the artifact\nwas created and no content-negotiation occurs\n* x-taskcluster-location-content-type: the content-type of the artifact\n\n**Caching**, artifacts may be cached in data centers closer to the\nworkers in-order to reduce bandwidth costs. This can lead to longer\nresponse times. Caching can be skipped by setting the header\n`x-taskcluster-skip-cache: true`, this should only be used for resources\nwhere request volume is known to be low, and caching not useful.\n(This feature may be disabled in the future, use is sparingly!)",
          "method": "get",
          "name": "getArtifact",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": {
            "if": "private",
            "then": {
              "AllOf": [
                "queue:get-artifact:<name>"
              ]
            }
          },
          "stability": "stable",
          "title": "Get Artifact from Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "name"
          ],
          "description": "Get artifact by `<name>` from the last run of a task.\n\n**Public Artifacts**, in-order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nBut if the artifact `name` starts with `public/`, authentication and\nauthorization is not necessary to fetch the artifact.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with a normal HTTP client.\n\n**Remark**, this end-point is slightly slower than\n`queue.getArtifact`, so consider that if you already know the `runId` of\nthe latest run. Otherwise, just us the most convenient API end-point.",
          "method": "get",
          "name": "getLatestArtifact",
          "query": [
          ],
          "route": "/task/<taskId>/artifacts/<name>",
          "scopes": {
            "if": "private",
            "then": {
              "AllOf": [
                "queue:get-artifact:<name>"
              ]
            }
          },
          "stability": "stable",
          "title": "Get Artifact from Latest Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "Returns a list of artifacts and associated meta-data for a given run.\n\nAs a task may have many artifacts paging may be necessary. If this\nend-point returns a `continuationToken`, you should call the end-point\nagain with the `continuationToken` as the query-string option:\n`continuationToken`.\n\nBy default this end-point will list up-to 1000 artifacts in a single page\nyou may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listArtifacts",
          "output": "v1/list-artifacts-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts",
          "stability": "experimental",
          "title": "Get Artifacts from Run",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "Returns a list of artifacts and associated meta-data for the latest run\nfrom the given task.\n\nAs a task may have many artifacts paging may be necessary. If this\nend-point returns a `continuationToken`, you should call the end-point\nagain with the `continuationToken` as the query-string option:\n`continuationToken`.\n\nBy default this end-point will list up-to 1000 artifacts in a single page\nyou may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listLatestArtifacts",
          "output": "v1/list-artifacts-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task/<taskId>/artifacts",
          "stability": "experimental",
          "title": "Get Artifacts from Latest Run",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Get all active provisioners.\n\nThe term \"provisioner\" is taken broadly to mean anything with a provisionerId.\nThis does not necessarily mean there is an associated service performing any\nprovisioning activity.\n\nThe response is paged. If this end-point returns a `continuationToken`, you\nshould call the end-point again with the `continuationToken` as a query-string\noption. By default this end-point will list up to 1000 provisioners in a single\npage. You may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listProvisioners",
          "output": "v1/list-provisioners-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/provisioners",
          "stability": "experimental",
          "title": "Get a list of all active provisioners",
          "type": "function"
        },
        {
          "args": [
            "provisionerId"
          ],
          "description": "Get an active provisioner.\n\nThe term \"provisioner\" is taken broadly to mean anything with a provisionerId.\nThis does not necessarily mean there is an associated service performing any\nprovisioning activity.",
          "method": "get",
          "name": "getProvisioner",
          "output": "v1/provisioner-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>",
          "stability": "experimental",
          "title": "Get an active provisioner",
          "type": "function"
        },
        {
          "args": [
            "provisionerId"
          ],
          "description": "Declare a provisioner, supplying some details about it.\n\n`declareProvisioner` allows updating one or more properties of a provisioner as long as the required scopes are\npossessed. For example, a request to update the `aws-provisioner-v1`\nprovisioner with a body `{description: 'This provisioner is great'}` would require you to have the scope\n`queue:declare-provisioner:aws-provisioner-v1#description`.\n\nThe term \"provisioner\" is taken broadly to mean anything with a provisionerId.\nThis does not necessarily mean there is an associated service performing any\nprovisioning activity.",
          "input": "v1/update-provisioner-request.json#",
          "method": "put",
          "name": "declareProvisioner",
          "output": "v1/provisioner-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>",
          "scopes": {
            "AllOf": [
              {
                "each": "queue:declare-provisioner:<provisionerId>#<property>",
                "for": "property",
                "in": "properties"
              }
            ]
          },
          "stability": "experimental",
          "title": "Update a provisioner",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Get an approximate number of pending tasks for the given `provisionerId`\nand `workerType`.\n\nThe underlying Azure Storage Queues only promises to give us an estimate.\nFurthermore, we cache the result in memory for 20 seconds. So consumers\nshould be no means expect this to be an accurate number.\nIt is, however, a solid estimate of the number of pending tasks.",
          "method": "get",
          "name": "pendingTasks",
          "output": "v1/pending-tasks-response.json#",
          "query": [
          ],
          "route": "/pending/<provisionerId>/<workerType>",
          "stability": "stable",
          "title": "Get Number of Pending Tasks",
          "type": "function"
        },
        {
          "args": [
            "provisionerId"
          ],
          "description": "Get all active worker-types for the given provisioner.\n\nThe response is paged. If this end-point returns a `continuationToken`, you\nshould call the end-point again with the `continuationToken` as a query-string\noption. By default this end-point will list up to 1000 worker-types in a single\npage. You may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listWorkerTypes",
          "output": "v1/list-workertypes-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/provisioners/<provisionerId>/worker-types",
          "stability": "experimental",
          "title": "Get a list of all active worker-types",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Get a worker-type from a provisioner.",
          "method": "get",
          "name": "getWorkerType",
          "output": "v1/workertype-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>",
          "stability": "experimental",
          "title": "Get a worker-type",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Declare a workerType, supplying some details about it.\n\n`declareWorkerType` allows updating one or more properties of a worker-type as long as the required scopes are\npossessed. For example, a request to update the `gecko-b-1-w2008` worker-type within the `aws-provisioner-v1`\nprovisioner with a body `{description: 'This worker type is great'}` would require you to have the scope\n`queue:declare-worker-type:aws-provisioner-v1/gecko-b-1-w2008#description`.",
          "input": "v1/update-workertype-request.json#",
          "method": "put",
          "name": "declareWorkerType",
          "output": "v1/workertype-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>",
          "scopes": {
            "AllOf": [
              {
                "each": "queue:declare-worker-type:<provisionerId>/<workerType>#<property>",
                "for": "property",
                "in": "properties"
              }
            ]
          },
          "stability": "experimental",
          "title": "Update a worker-type",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Get a list of all active workers of a workerType.\n\n`listWorkers` allows a response to be filtered by quarantined and non quarantined workers.\nTo filter the query, you should call the end-point with `quarantined` as a query-string option with a\ntrue or false value.\n\nThe response is paged. If this end-point returns a `continuationToken`, you\nshould call the end-point again with the `continuationToken` as a query-string\noption. By default this end-point will list up to 1000 workers in a single\npage. You may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listWorkers",
          "output": "v1/list-workers-response.json#",
          "query": [
            "continuationToken",
            "limit",
            "quarantined"
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>/workers",
          "stability": "experimental",
          "title": "Get a list of all active workers of a workerType",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType",
            "workerGroup",
            "workerId"
          ],
          "description": "Get a worker from a worker-type.",
          "method": "get",
          "name": "getWorker",
          "output": "v1/worker-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>/workers/<workerGroup>/<workerId>",
          "stability": "experimental",
          "title": "Get a worker-type",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType",
            "workerGroup",
            "workerId"
          ],
          "description": "Quarantine a worker",
          "input": "v1/quarantine-worker-request.json#",
          "method": "put",
          "name": "quarantineWorker",
          "output": "v1/worker-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>/workers/<workerGroup>/<workerId>",
          "scopes": {
            "AllOf": [
              "queue:quarantine-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>"
            ]
          },
          "stability": "experimental",
          "title": "Quarantine a worker",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType",
            "workerGroup",
            "workerId"
          ],
          "description": "Declare a worker, supplying some details about it.\n\n`declareWorker` allows updating one or more properties of a worker as long as the required scopes are\npossessed.",
          "input": "v1/update-worker-request.json#",
          "method": "put",
          "name": "declareWorker",
          "output": "v1/worker-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>/<workerGroup>/<workerId>",
          "scopes": {
            "AllOf": [
              {
                "each": "queue:declare-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>#<property>",
                "for": "property",
                "in": "properties"
              }
            ]
          },
          "stability": "experimental",
          "title": "Declare a worker",
          "type": "function"
        }
      ],
      "serviceName": "queue",
      "title": "Queue API Documentation"
    }
  },
  "QueueEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The queue service is responsible for accepting tasks and track their state\nas they are executed by workers. In order ensure they are eventually\nresolved.\n\nThis document describes AMQP exchanges offered by the queue, which allows\nthird-party listeners to monitor tasks as they progress to resolution.\nThese exchanges targets the following audience:\n * Schedulers, who takes action after tasks are completed,\n * Workers, who wants to listen for new or canceled tasks (optional),\n * Tools, that wants to update their view as task progress.\n\nYou'll notice that all the exchanges in the document shares the same\nrouting key pattern. This makes it very easy to bind to all messages\nabout a certain kind tasks.\n\n**Task specific routes**, a task can define a task specific route using\nthe `task.routes` property. See task creation documentation for details\non permissions required to provide task specific routes. If a task has\nthe entry `'notify.by-email'` in as task specific route defined in\n`task.routes` all messages about this task will be CC'ed with the\nrouting-key `'route.notify.by-email'`.\n\nThese routes will always be prefixed `route.`, so that cannot interfere\nwith the _primary_ routing key as documented here. Notice that the\n_primary_ routing key is always prefixed `primary.`. This is ensured\nin the routing key reference, so API clients will do this automatically.\n\nPlease, note that the way RabbitMQ works, the message will only arrive\nin your queue once, even though you may have bound to the exchange with\nmultiple routing key patterns that matches more of the CC'ed routing\nrouting keys.\n\n**Delivery guarantees**, most operations on the queue are idempotent,\nwhich means that if repeated with the same arguments then the requests\nwill ensure completion of the operation and return the same response.\nThis is useful if the server crashes or the TCP connection breaks, but\nwhen re-executing an idempotent operation, the queue will also resend\nany related AMQP messages. Hence, messages may be repeated.\n\nThis shouldn't be much of a problem, as the best you can achieve using\nconfirm messages with AMQP is at-least-once delivery semantics. Hence,\nthis only prevents you from obtaining at-most-once delivery semantics.\n\n**Remark**, some message generated by timeouts maybe dropped if the\nserver crashes at wrong time. Ideally, we'll address this in the\nfuture. For now we suggest you ignore this corner case, and notify us\nif this corner case is of concern to you.",
      "entries": [
        {
          "description": "When a task is created or just defined a message is posted to this\nexchange.\n\nThis message exchange is mainly useful when tasks are scheduled by a\nscheduler that uses `defineTask` as this does not make the task\n`pending`. Thus, no `taskPending` message is published.\nPlease, note that messages are also published on this exchange if defined\nusing `createTask`.",
          "exchange": "task-defined",
          "name": "taskDefined",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/task-defined-message.json#",
          "title": "Task Defined Messages",
          "type": "topic-exchange"
        },
        {
          "description": "When a task becomes `pending` a message is posted to this exchange.\n\nThis is useful for workers who doesn't want to constantly poll the queue\nfor new tasks. The queue will also be authority for task states and\nclaims. But using this exchange workers should be able to distribute work\nefficiently and they would be able to reduce their polling interval\nsignificantly without affecting general responsiveness.",
          "exchange": "task-pending",
          "name": "taskPending",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/task-pending-message.json#",
          "title": "Task Pending Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever a task is claimed by a worker, a run is started on the worker,\nand a message is posted on this exchange.",
          "exchange": "task-running",
          "name": "taskRunning",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": true,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": true,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/task-running-message.json#",
          "title": "Task Running Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever the `createArtifact` end-point is called, the queue will create\na record of the artifact and post a message on this exchange. All of this\nhappens before the queue returns a signed URL for the caller to upload\nthe actual artifact with (pending on `storageType`).\n\nThis means that the actual artifact is rarely available when this message\nis posted. But it is not unreasonable to assume that the artifact will\nwill become available at some point later. Most signatures will expire in\n30 minutes or so, forcing the uploader to call `createArtifact` with\nthe same payload again in-order to continue uploading the artifact.\n\nHowever, in most cases (especially for small artifacts) it's very\nreasonable assume the artifact will be available within a few minutes.\nThis property means that this exchange is mostly useful for tools\nmonitoring task evaluation. One could also use it count number of\nartifacts per task, or _index_ artifacts though in most cases it'll be\nsmarter to index artifacts after the task in question have completed\nsuccessfully.",
          "exchange": "artifact-created",
          "name": "artifactCreated",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": true,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": true,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/artifact-created-message.json#",
          "title": "Artifact Creation Messages",
          "type": "topic-exchange"
        },
        {
          "description": "When a task is successfully completed by a worker a message is posted\nthis exchange.\nThis message is routed using the `runId`, `workerGroup` and `workerId`\nthat completed the task. But information about additional runs is also\navailable from the task status structure.",
          "exchange": "task-completed",
          "name": "taskCompleted",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": true,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": true,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": true,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/task-completed-message.json#",
          "title": "Task Completed Messages",
          "type": "topic-exchange"
        },
        {
          "description": "When a task ran, but failed to complete successfully a message is posted\nto this exchange. This is same as worker ran task-specific code, but the\ntask specific code exited non-zero.",
          "exchange": "task-failed",
          "name": "taskFailed",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/task-failed-message.json#",
          "title": "Task Failed Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever Taskcluster fails to run a message is posted to this exchange.\nThis happens if the task isn't completed before its `deadlìne`,\nall retries failed (i.e. workers stopped responding), the task was\ncanceled by another entity, or the task carried a malformed payload.\n\nThe specific _reason_ is evident from that task status structure, refer\nto the `reasonResolved` property for the last run.",
          "exchange": "task-exception",
          "name": "taskException",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskId",
              "required": true,
              "summary": "`taskId` for the task this message concerns"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "`runId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "`workerGroup` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "`workerId` of latest run for the task, `_` if no run is exists for the task."
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` this task is targeted at."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` this task must run on."
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` this task was created by."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` this task was created in."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/task-exception-message.json#",
          "title": "Task Exception Messages",
          "type": "topic-exchange"
        },
        {
          "description": "A message is published on task-group-resolved whenever all submitted\ntasks (whether scheduled or unscheduled) for a given task group have\nbeen resolved, regardless of whether they resolved as successful or\nnot. A task group may be resolved multiple times, since new tasks may\nbe submitted against an already resolved task group.",
          "exchange": "task-group-resolved",
          "name": "taskGroupResolved",
          "routingKey": [
            {
              "constant": "primary",
              "multipleWords": false,
              "name": "routingKeyKind",
              "required": true,
              "summary": "Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key."
            },
            {
              "multipleWords": false,
              "name": "taskGroupId",
              "required": true,
              "summary": "`taskGroupId` for the task-group this message concerns"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "`schedulerId` for the task-group this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/task-group-resolved.json#",
          "title": "Task Group Resolved Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-queue/v1/",
      "serviceName": "queue",
      "title": "Queue AMQP Exchanges"
    }
  },
  "Secrets": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The secrets service provides a simple key/value store for small bits of secret\ndata.  Access is limited by scopes, so values can be considered secret from\nthose who do not have the relevant scopes.\n\nSecrets also have an expiration date, and once a secret has expired it can no\nlonger be read.  This is useful for short-term secrets such as a temporary\nservice credential or a one-time signing key.",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Set the secret associated with some key.  If the secret already exists, it is\nupdated instead.",
          "input": "v1/secret.json#",
          "method": "put",
          "name": "set",
          "query": [
          ],
          "route": "/secret/<name>",
          "scopes": "secrets:set:<name>",
          "stability": "stable",
          "title": "Set Secret",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Delete the secret associated with some key.",
          "method": "delete",
          "name": "remove",
          "query": [
          ],
          "route": "/secret/<name>",
          "scopes": "secrets:set:<name>",
          "stability": "stable",
          "title": "Delete Secret",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Read the secret associated with some key.  If the secret has recently\nexpired, the response code 410 is returned.  If the caller lacks the\nscope necessary to get the secret, the call will fail with a 403 code\nregardless of whether the secret exists.",
          "method": "get",
          "name": "get",
          "output": "v1/secret.json#",
          "query": [
          ],
          "route": "/secret/<name>",
          "scopes": "secrets:get:<name>",
          "stability": "stable",
          "title": "Read Secret",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "List the names of all secrets.\n\nBy default this end-point will try to return up to 1000 secret names in one\nrequest. But it **may return less**, even if more tasks are available.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `listTaskGroup` with the last `continuationToken` until you\nget a result without a `continuationToken`.\n\nIf you are not interested in listing all the members at once, you may\nuse the query-string option `limit` to return fewer.",
          "method": "get",
          "name": "list",
          "output": "v1/secret-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/secrets",
          "stability": "stable",
          "title": "List Secrets",
          "type": "function"
        }
      ],
      "serviceName": "secrets",
      "title": "Taskcluster Secrets API Documentation"
    }
  },
  "TreeherderEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The taskcluster-treeherder service is responsible for processing\ntask events published by Taskcluster Queue and producing job messages\nthat are consumable by Treeherder.\n\nThis exchange provides that job messages to be consumed by any queue that\nattached to the exchange.  This could be a production Treeheder instance,\na local development environment, or a custom dashboard.",
      "entries": [
        {
          "description": "When a task run is scheduled or resolved, a message is posted to\nthis exchange in a Treeherder consumable format.",
          "exchange": "jobs",
          "name": "jobs",
          "routingKey": [
            {
              "multipleWords": false,
              "name": "destination",
              "required": true,
              "summary": "destination"
            },
            {
              "multipleWords": false,
              "name": "project",
              "required": true,
              "summary": "project"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "v1/pulse-job.json#",
          "title": "Job Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-treeherder/v1/",
      "serviceName": "treeherder",
      "title": "Taskcluster-treeherder Pulse Exchange"
    }
  },
  "WorkerManager": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "This service manages workers, including provisioning",
      "entries": [
        {
          "args": [
          ],
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "ping",
          "query": [
          ],
          "route": "/ping",
          "stability": "stable",
          "title": "Ping Server",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Create a new workertype. If the workertype already exists, this will throw an error.",
          "input": "v1/create-workertype-request.json#",
          "method": "put",
          "name": "createWorkerType",
          "output": "v1/workertype-full.json#",
          "query": [
          ],
          "route": "/workertype/<name>",
          "scopes": {
            "AllOf": [
              "worker-manager:create-worker-type:<name>",
              "worker-manager:provider:<provider>"
            ]
          },
          "stability": "experimental",
          "title": "Create WorkerType",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Given an existing workertype definition, this will modify it and return the new definition.",
          "input": "v1/create-workertype-request.json#",
          "method": "post",
          "name": "updateWorkerType",
          "output": "v1/workertype-full.json#",
          "query": [
          ],
          "route": "/workertype/<name>",
          "scopes": {
            "AllOf": [
              "worker-manager:update-worker-type:<name>",
              "worker-manager:provider:<provider>"
            ]
          },
          "stability": "experimental",
          "title": "Update WorkerType",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Given an existing workertype defition, this will fetch it.",
          "method": "get",
          "name": "workerType",
          "output": "v1/workertype-full.json#",
          "query": [
          ],
          "route": "/workertype/<name>",
          "stability": "experimental",
          "title": "Get WorkerType",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Delete an existing workertype definition.",
          "method": "delete",
          "name": "deleteWorkerType",
          "query": [
          ],
          "route": "/workertype/<name>",
          "scopes": "worker-manager:delete-worker-type:<name>",
          "stability": "experimental",
          "title": "Delete WorkerType",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Get the list of all the existing workertypes",
          "method": "get",
          "name": "listWorkerTypes",
          "output": "v1/workertype-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/workertypes",
          "stability": "experimental",
          "title": "List All WorkerTypes",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "description": "Get Taskcluster credentials for a worker given an Instance Identity Token",
          "input": "v1/credentials-google-request.json#",
          "method": "post",
          "name": "credentialsGoogle",
          "output": "v1/temp-creds-response.json#",
          "query": [
          ],
          "route": "/credentials/google/<name>",
          "stability": "experimental",
          "title": "Google Credentials",
          "type": "function"
        }
      ],
      "serviceName": "worker-manager",
      "title": "Taskcluster Worker Manager"
    }
  }
};