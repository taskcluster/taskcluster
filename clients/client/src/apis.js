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
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Clients",
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
          "scopes": "auth:list-clients",
          "stability": "stable",
          "title": "List Clients",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "category": "Clients",
          "description": "Get information about a single client.",
          "method": "get",
          "name": "client",
          "output": "v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>",
          "scopes": "auth:get-client:<clientId>",
          "stability": "stable",
          "title": "Get Client",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "category": "Clients",
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
          "category": "Clients",
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
          "category": "Clients",
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
          "category": "Clients",
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
          "category": "Clients",
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
          "category": "Clients",
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
          "category": "Roles",
          "description": "Get a list of all roles. Each role object also includes the list of\nscopes it expands to.  This always returns all roles in a single HTTP\nrequest.\n\nTo get paginated results, use `listRoles2`.",
          "method": "get",
          "name": "listRoles",
          "output": "v1/list-roles-response.json#",
          "query": [
          ],
          "route": "/roles/",
          "scopes": "auth:list-roles",
          "stability": "stable",
          "title": "List Roles (no pagination)",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Roles",
          "description": "Get a list of all roles. Each role object also includes the list of\nscopes it expands to.  This is similar to `listRoles` but differs in the\nformat of the response.\n\nIf no limit is given, all roles are returned. Since this\nlist may become long, callers can use the `limit` and `continuationToken`\nquery arguments to page through the responses.",
          "method": "get",
          "name": "listRoles2",
          "output": "v1/list-roles2-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/roles2/",
          "scopes": "auth:list-roles",
          "stability": "stable",
          "title": "List Roles",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Roles",
          "description": "Get a list of all role IDs.\n\nIf no limit is given, the roleIds of all roles are returned. Since this\nlist may become long, callers can use the `limit` and `continuationToken`\nquery arguments to page through the responses.",
          "method": "get",
          "name": "listRoleIds",
          "output": "v1/list-role-ids-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/roleids/",
          "scopes": "auth:list-roles",
          "stability": "stable",
          "title": "List Role IDs",
          "type": "function"
        },
        {
          "args": [
            "roleId"
          ],
          "category": "Roles",
          "description": "Get information about a single role, including the set of scopes that the\nrole expands to.",
          "method": "get",
          "name": "role",
          "output": "v1/get-role-response.json#",
          "query": [
          ],
          "route": "/roles/<roleId>",
          "scopes": "auth:get-role:<roleId>",
          "stability": "stable",
          "title": "Get Role",
          "type": "function"
        },
        {
          "args": [
            "roleId"
          ],
          "category": "Roles",
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
          "category": "Roles",
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
          "category": "Roles",
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
          "category": "Scopes and Auth",
          "description": "Return an expanded copy of the given scopeset, with scopes implied by any\nroles included.",
          "input": "v1/scopeset.json#",
          "method": "post",
          "name": "expandScopes",
          "output": "v1/scopeset.json#",
          "query": [
          ],
          "route": "/scopes/expand",
          "scopes": "auth:expand-scopes",
          "stability": "stable",
          "title": "Expand Scopes",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Scopes and Auth",
          "description": "Return the expanded scopes available in the request, taking into account all sources\nof scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,\nand roles).",
          "method": "get",
          "name": "currentScopes",
          "output": "v1/scopeset.json#",
          "query": [
          ],
          "route": "/scopes/current",
          "scopes": "auth:current-scopes",
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
          "category": "AWS Credentials",
          "description": "Get temporary AWS credentials for `read-write` or `read-only` access to\na given `bucket` and `prefix` within that bucket.\nThe `level` parameter can be `read-write` or `read-only` and determines\nwhich type of credentials are returned. Please note that the `level`\nparameter is required in the scope guarding access.  The bucket name must\nnot contain `.`, as recommended by Amazon.\n\nThis method can only allow access to a whitelisted set of buckets, as configured\nin the Taskcluster deployment\n\nThe credentials are set to expire after an hour, but this behavior is\nsubject to change. Hence, you should always read the `expires` property\nfrom the response, if you intend to maintain active credentials in your\napplication.\n\nPlease note that your `prefix` may not start with slash `/`. Such a prefix\nis allowed on S3, but we forbid it here to discourage bad behavior.\n\nAlso note that if your `prefix` doesn't end in a slash `/`, the STS\ncredentials may allow access to unexpected keys, as S3 does not treat\nslashes specially.  For example, a prefix of `my-folder` will allow\naccess to `my-folder/file.txt` as expected, but also to `my-folder.txt`,\nwhich may not be intended.\n\nFinally, note that the `PutObjectAcl` call is not allowed.  Passing a canned\nACL other than `private` to `PutObject` is treated as a `PutObjectAcl` call, and\nwill result in an access-denied error from AWS.  This limitation is due to a\nsecurity flaw in Amazon S3 which might otherwise allow indefinite access to\nuploaded objects.\n\n**EC2 metadata compatibility**, if the querystring parameter\n`?format=iam-role-compat` is given, the response will be compatible\nwith the JSON exposed by the EC2 metadata service. This aims to ease\ncompatibility for libraries and tools built to auto-refresh credentials.\nFor details on the format returned by EC2 metadata service see:\n[EC2 User Guide](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#instance-metadata-security-credentials).",
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
          "category": "Azure Credentials",
          "description": "Retrieve a list of all Azure accounts managed by Taskcluster Auth.",
          "method": "get",
          "name": "azureAccounts",
          "output": "v1/azure-account-list-response.json#",
          "query": [
          ],
          "route": "/azure/accounts",
          "scopes": "auth:azure-table:list-accounts",
          "stability": "deprecated",
          "title": "List Accounts Managed by Auth",
          "type": "function"
        },
        {
          "args": [
            "account"
          ],
          "category": "Azure Credentials",
          "description": "Retrieve a list of all tables in an account.",
          "method": "get",
          "name": "azureTables",
          "output": "v1/azure-table-list-response.json#",
          "query": [
            "continuationToken"
          ],
          "route": "/azure/<account>/tables",
          "scopes": "auth:azure-table:list-tables:<account>",
          "stability": "deprecated",
          "title": "List Tables in an Account Managed by Auth",
          "type": "function"
        },
        {
          "args": [
            "account",
            "table",
            "level"
          ],
          "category": "Azure Credentials",
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
          "stability": "deprecated",
          "title": "Get Shared-Access-Signature for Azure Table",
          "type": "function"
        },
        {
          "args": [
            "account"
          ],
          "category": "Azure Credentials",
          "description": "Retrieve a list of all containers in an account.",
          "method": "get",
          "name": "azureContainers",
          "output": "v1/azure-container-list-response.json#",
          "query": [
            "continuationToken"
          ],
          "route": "/azure/<account>/containers",
          "scopes": "auth:azure-container:list-containers:<account>",
          "stability": "deprecated",
          "title": "List containers in an Account Managed by Auth",
          "type": "function"
        },
        {
          "args": [
            "account",
            "container",
            "level"
          ],
          "category": "Azure Credentials",
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
          "stability": "deprecated",
          "title": "Get Shared-Access-Signature for Azure Container",
          "type": "function"
        },
        {
          "args": [
            "project"
          ],
          "category": "Sentry Credentials",
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
            "wstAudience",
            "wstClient"
          ],
          "category": "Websocktunnel Credentials",
          "description": "Get a temporary token suitable for use connecting to a\n[websocktunnel](https://github.com/taskcluster/taskcluster/tree/main/tools/websocktunnel) server.\n\nThe resulting token will only be accepted by servers with a matching audience\nvalue.  Reaching such a server is the callers responsibility.  In general,\na server URL or set of URLs should be provided to the caller as configuration\nalong with the audience value.\n\nThe token is valid for a limited time (on the scale of hours). Callers should\nrefresh it before expiration.",
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
            "projectId",
            "serviceAccount"
          ],
          "category": "GCP Credentials",
          "description": "Get temporary GCP credentials for the given serviceAccount in the given project.\n\nOnly preconfigured projects and serviceAccounts are allowed, as defined in the\ndeployment of the Taskcluster services.\n\nThe credentials are set to expire after an hour, but this behavior is\nsubject to change. Hence, you should always read the `expires` property\nfrom the response, if you intend to maintain active credentials in your\napplication.",
          "method": "get",
          "name": "gcpCredentials",
          "output": "v1/gcp-credentials-response.json#",
          "query": [
          ],
          "route": "/gcp/credentials/<projectId>/<serviceAccount>",
          "scopes": "auth:gcp:access-token:<projectId>/<serviceAccount>",
          "stability": "stable",
          "title": "Get Temporary GCP Credentials",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Scopes and Auth",
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
          "category": "Scopes and Auth",
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
          "category": "Scopes and Auth",
          "description": "Utility method similar to `testAuthenticate`, but with the GET method,\nso it can be used with signed URLs (bewits).\n\nRather than using real credentials, this endpoint accepts requests with\nclientId `tester` and accessToken `no-secret`. That client's scopes are\n`['test:*', 'auth:create-client:test:*']`.  The call fails if the\n`test:authenticate-get` scope is not available.\n\nThe request is validated, with any certificate, authorizedScopes, etc.\napplied, and the resulting scopes are checked, just like any API call.\nOn success, the response contains the clientId and scopes as seen by\nthe API method.\n\nThis method may later be extended to allow specification of client and\nrequired scopes via query arguments.",
          "method": "get",
          "name": "testAuthenticateGet",
          "output": "v1/test-authenticate-response.json#",
          "query": [
          ],
          "route": "/test-authenticate-get/",
          "stability": "stable",
          "title": "Test Authentication (GET)",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "auth",
      "title": "Auth Service"
    },
    "referenceKind": "api"
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
    },
    "referenceKind": "exchanges"
  },
  "Github": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The github service is responsible for creating tasks in response\nto GitHub events, and posting results to the GitHub UI.\n\nThis document describes the API end-point for consuming GitHub\nweb hooks, as well as some useful consumer APIs.\n\nWhen Github forbids an action, this service returns an HTTP 403\nwith code ForbiddenByGithub.",
      "entries": [
        {
          "args": [
          ],
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Github Service",
          "description": "Capture a GitHub event and publish it via pulse, if it's a push,\nrelease, check run or pull request.",
          "method": "post",
          "name": "githubWebHookConsumer",
          "query": [
          ],
          "route": "/github",
          "stability": "stable",
          "title": "Consume GitHub WebHook",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Github Service",
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
          "scopes": "github:list-builds",
          "stability": "stable",
          "title": "List of Builds",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo",
            "branch"
          ],
          "category": "Github Service",
          "description": "Checks the status of the latest build of a given branch\nand returns corresponding badge svg.",
          "method": "get",
          "name": "badge",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/<branch>/badge.svg",
          "scopes": "github:get-badge:<owner>:<repo>:<branch>",
          "stability": "experimental",
          "title": "Latest Build Status Badge",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo"
          ],
          "category": "Github Service",
          "description": "Returns any repository metadata that is\nuseful within Taskcluster related services.",
          "method": "get",
          "name": "repository",
          "output": "v1/repository.json#",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>",
          "scopes": "github:get-repository:<owner>:<repo>",
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
          "category": "Github Service",
          "description": "For a given branch of a repository, this will always point\nto a status page for the most recent task triggered by that\nbranch.\n\nNote: This is a redirect rather than a direct link.",
          "method": "get",
          "name": "latest",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/<branch>/latest",
          "scopes": "github:latest-status:<owner>:<repo>:<branch>",
          "stability": "stable",
          "title": "Latest Status for Branch",
          "type": "function"
        },
        {
          "args": [
            "owner",
            "repo",
            "sha"
          ],
          "category": "Github Service",
          "description": "For a given changeset (SHA) of a repository, this will attach a \"commit status\"\non github. These statuses are links displayed next to each revision.\nThe status is either OK (green check) or FAILURE (red cross),\nmade of a custom title and link.",
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
          "category": "Github Service",
          "description": "For a given Issue or Pull Request of a repository, this will write a new message.",
          "input": "v1/create-comment.json#",
          "method": "post",
          "name": "createComment",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/issues/<number>/comments",
          "scopes": "github:create-comment:<owner>/<repo>",
          "stability": "stable",
          "title": "Post a comment on a given GitHub Issue or Pull Request",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "github",
      "title": "GitHub Service"
    },
    "referenceKind": "api"
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
          "description": "When a GitHub check_run event with action=\"rerequested\" is posted \nit will be broadcast on this exchange with the designated \n`organization` and `repository`\nin the routing-key along with event specific metadata in the payload.",
          "exchange": "rerun",
          "name": "rerun",
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
          "schema": "v1/github-rerun-message.json#",
          "title": "GitHub re-run task Event",
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
    },
    "referenceKind": "exchanges"
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
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Hooks",
          "description": "This endpoint will return a list of all hook groups with at least one hook.",
          "method": "get",
          "name": "listHookGroups",
          "output": "v1/list-hook-groups-response.json#",
          "query": [
          ],
          "route": "/hooks",
          "scopes": "hooks:list-hooks:",
          "stability": "stable",
          "title": "List hook groups",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId"
          ],
          "category": "Hooks",
          "description": "This endpoint will return a list of all the hook definitions within a\ngiven hook group.",
          "method": "get",
          "name": "listHooks",
          "output": "v1/list-hooks-response.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>",
          "scopes": "hooks:list-hooks:<hookGroupId>",
          "stability": "stable",
          "title": "List hooks in a given group",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "category": "Hooks",
          "description": "This endpoint will return the hook definition for the given `hookGroupId`\nand hookId.",
          "method": "get",
          "name": "hook",
          "output": "v1/hook-definition.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "scopes": "hooks:get:<hookGroupId>:<hookId>",
          "stability": "stable",
          "title": "Get hook definition",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "category": "Hook Status",
          "description": "This endpoint will return the current status of the hook.  This represents a\nsnapshot in time and may vary from one call to the next.\n\nThis method is deprecated in favor of listLastFires.",
          "method": "get",
          "name": "getHookStatus",
          "output": "v1/hook-status.json#",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/status",
          "scopes": "hooks:status:<hookGroupId>/<hookId>",
          "stability": "deprecated",
          "title": "Get hook status",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "category": "Hooks",
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
          "category": "Hooks",
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
          "category": "Hooks",
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
          "category": "Hooks",
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
          "category": "Hooks",
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
          "category": "Hooks",
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
          "category": "Hooks",
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
          "category": "Hook Status",
          "description": "This endpoint will return information about the the last few times this hook has been\nfired, including whether the hook was fired successfully or not\n\nBy default this endpoint will return up to 1000 most recent fires in one request.",
          "method": "get",
          "name": "listLastFires",
          "output": "v1/list-lastFires-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/last-fires",
          "scopes": "hooks:list-last-fires:<hookGroupId>/<hookId>",
          "stability": "stable",
          "title": "Get information about recent hook fires",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "hooks",
      "title": "Hooks Service"
    },
    "referenceKind": "api"
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
    },
    "referenceKind": "exchanges"
  },
  "Index": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The index service is responsible for indexing tasks. The service ensures that\ntasks can be located by user-defined names.\n\nAs described in the service documentation, tasks are typically indexed via Pulse\nmessages, so the most common use of API methods is to read from the index.\n\nSlashes (`/`) aren't allowed in index paths.",
      "entries": [
        {
          "args": [
          ],
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
            "indexPath"
          ],
          "category": "Index Service",
          "description": "Find a task by index path, returning the highest-rank task with that path. If no\ntask exists for the given path, this API end-point will respond with a 404 status.",
          "method": "get",
          "name": "findTask",
          "output": "v1/indexed-task-response.json#",
          "query": [
          ],
          "route": "/task/<indexPath>",
          "scopes": "index:find-task:<indexPath>",
          "stability": "stable",
          "title": "Find Indexed Task",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "category": "Index Service",
          "description": "List the namespaces immediately under a given namespace.\n\nThis endpoint\nlists up to 1000 namespaces. If more namespaces are present, a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.",
          "method": "get",
          "name": "listNamespaces",
          "output": "v1/list-namespaces-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/namespaces/<namespace>",
          "scopes": "index:list-namespaces:<namespace>",
          "stability": "stable",
          "title": "List Namespaces",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "category": "Index Service",
          "description": "List the tasks immediately under a given namespace.\n\nThis endpoint\nlists up to 1000 tasks. If more tasks are present, a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, the payload should be an empty JSON\nobject.\n\n**Remark**, this end-point is designed for humans browsing for tasks, not\nservices, as that makes little sense.",
          "method": "get",
          "name": "listTasks",
          "output": "v1/list-tasks-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/tasks/<namespace>",
          "scopes": "index:list-tasks:<namespace>",
          "stability": "stable",
          "title": "List Tasks",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "category": "Index Service",
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
            "namespace"
          ],
          "category": "Index Service",
          "description": "Remove a task from the index.  This is intended for administrative use,\nwhere an index entry is no longer appropriate.  The parent namespace is\nnot automatically deleted.  Index entries with lower rank that were\npreviously inserted will not re-appear, as they were never stored.",
          "method": "delete",
          "name": "deleteTask",
          "query": [
          ],
          "route": "/task/<namespace>",
          "scopes": "index:delete-task:<namespace>",
          "stability": "stable",
          "title": "Remove Task from Index",
          "type": "function"
        },
        {
          "args": [
            "indexPath",
            "name"
          ],
          "category": "Index Service",
          "description": "Find a task by index path and redirect to the artifact on the most recent\nrun with the given `name`.\n\nNote that multiple calls to this endpoint may return artifacts from differen tasks\nif a new task is inserted into the index between calls. Avoid using this method as\na stable link to multiple, connected files if the index path does not contain a\nunique identifier.  For example, the following two links may return unrelated files:\n* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/installer.exe`\n* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/debug-symbols.zip`\n\nThis problem be remedied by including the revision in the index path or by bundling both\ninstaller and debug symbols into a single artifact.\n\nIf no task exists for the given index path, this API end-point responds with 404.",
          "method": "get",
          "name": "findArtifactFromTask",
          "query": [
          ],
          "route": "/task/<indexPath>/artifacts/<name>",
          "scopes": "queue:get-artifact:<name>",
          "stability": "stable",
          "title": "Get Artifact From Indexed Task",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "index",
      "title": "Index Service"
    },
    "referenceKind": "api"
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
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Notifications",
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
          "category": "Notifications",
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
          "category": "Notifications",
          "description": "Post a message to a room in Matrix. Optionally includes formatted message.\n\nThe `roomId` in the scopes is a fully formed `roomId` with leading `!` such\nas `!foo:bar.com`.\n\nNote that the matrix client used by taskcluster must be invited to a room before\nit can post there!",
          "input": "v1/matrix-request.json#",
          "method": "post",
          "name": "matrix",
          "query": [
          ],
          "route": "/matrix",
          "scopes": "notify:matrix-room:<roomId>",
          "stability": "experimental",
          "title": "Post Matrix Message",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Notifications",
          "description": "Post a message to a Slack channel.\n\nThe `channelId` in the scopes is a Slack channel ID, starting with a capital C.\n\nThe Slack app can post into public channels by default but will need to be added\nto private channels before it can post messages there.",
          "input": "v1/slack-request.json#",
          "method": "post",
          "name": "slack",
          "query": [
          ],
          "route": "/slack",
          "scopes": "notify:slack-channel:<channelId>",
          "stability": "experimental",
          "title": "Post Slack Message",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Denylist",
          "description": "Add the given address to the notification denylist. Addresses in the denylist will be ignored\nby the notification service.",
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
          "category": "Denylist",
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
          "category": "Denylist",
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
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "notify",
      "title": "Notification Service"
    },
    "referenceKind": "api"
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
        }
      ],
      "exchangePrefix": "exchange/taskcluster-notify/v1/",
      "serviceName": "notify",
      "title": "Notify AMQP Exchanges"
    },
    "referenceKind": "exchanges"
  },
  "Object": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The object service provides HTTP-accessible storage for large blobs of data.\n\nObjects can be uploaded and downloaded, with the object data flowing directly\nfrom the storage \"backend\" to the caller, and not directly via this service.\nOnce uploaded, objects are immutable until their expiration time.",
      "entries": [
        {
          "args": [
          ],
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "category": "Upload",
          "description": "Create a new object by initiating upload of its data.\n\nThis endpoint implements negotiation of upload methods.  It can be called\nmultiple times if necessary, either to propose new upload methods or to\nrenew credentials for an already-agreed upload.\n\nThe `name` parameter can contain any printable ASCII character (0x20 - 0x7e).\nThe `uploadId` must be supplied by the caller, and any attempts to upload\nan object with the same name but a different `uploadId` will fail.\nThus the first call to this method establishes the `uploadId` for the\nobject, and as long as that value is kept secret, no other caller can\nupload an object of that name, regardless of scopes.  Object expiration\ncannot be changed after the initial call, either.  It is possible to call\nthis method with no proposed upload methods, which has the effect of \"locking\nin\" the `expiration`, `projectId`, and `uploadId` properties and any\nsupplied hashes.\n\nUnfinished uploads expire after 1 day.",
          "input": "v1/create-upload-request.json#",
          "method": "put",
          "name": "createUpload",
          "output": "v1/create-upload-response.json#",
          "query": [
          ],
          "route": "/upload/<name>",
          "scopes": "object:upload:<projectId>:<name>",
          "stability": "stable",
          "title": "Begin upload of a new object",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "category": "Upload",
          "description": "This endpoint marks an upload as complete.  This indicates that all data has been\ntransmitted to the backend.  After this call, no further calls to `uploadObject` are\nallowed, and downloads of the object may begin.  This method is idempotent, but will\nfail if given an incorrect uploadId for an unfinished upload.\n\nIt is possible to finish an upload with no hashes specified via either\n`startUpload` or `finishUpload`.  However, many clients will refuse to\ndownload an object with no hashes.  The utility methods included with the\nclient libraries always include hashes as of version 44.0.0.\n\nNote that, once `finishUpload` is complete, the object is considered immutable.",
          "input": "v1/finish-upload-request.json#",
          "method": "post",
          "name": "finishUpload",
          "query": [
          ],
          "route": "/finish-upload/<name>",
          "scopes": "object:upload:<projectId>:<name>",
          "stability": "stable",
          "title": "Mark an upload as complete.",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "category": "Download",
          "description": "Start the process of downloading an object's data.  Call this endpoint with a list of acceptable\ndownload methods, and the server will select a method and return the corresponding payload.\n\nReturns a 406 error if none of the given download methods are available.\n\nSee [Download Methods](https://docs.taskcluster.net/docs/reference/platform/object/download-methods) for more detail.",
          "input": "v1/download-object-request.json#",
          "method": "put",
          "name": "startDownload",
          "output": "v1/download-object-response.json#",
          "query": [
          ],
          "route": "/start-download/<name>",
          "scopes": "object:download:<name>",
          "stability": "stable",
          "title": "Download object data",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "category": "Objects",
          "description": "Get the metadata for the named object.  This metadata is not sufficient to\nget the object's content; for that use `startDownload`.",
          "method": "get",
          "name": "object",
          "output": "v1/get-object-response.json#",
          "query": [
          ],
          "route": "/metadata/<name>",
          "scopes": "object:download:<name>",
          "stability": "stable",
          "title": "Get an object's metadata",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "category": "Download",
          "description": "Get the data in an object directly.  This method does not return a JSON body, but\nredirects to a location that will serve the object content directly.\n\nURLs for this endpoint, perhaps with attached authentication (`?bewit=..`),\nare typically used for downloads of objects by simple HTTP clients such as\nweb browsers, curl, or wget.\n\nThis method is limited by the common capabilities of HTTP, so it may not be\nthe most efficient, resilient, or featureful way to retrieve an artifact.\nSituations where such functionality is required should ues the\n`startDownload` API endpoint.\n\nSee [Simple Downloads](https://docs.taskcluster.net/docs/reference/platform/object/simple-downloads) for more detail.",
          "method": "get",
          "name": "download",
          "query": [
          ],
          "route": "/download/<name>",
          "scopes": "object:download:<name>",
          "stability": "stable",
          "title": "Get an object's data",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "object",
      "title": "Object Service"
    },
    "referenceKind": "api"
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
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Purge-Cache Service",
          "description": "Publish a request to purge caches named `cacheName` with\non `workerPoolId` workers.\n\nIf such a request already exists, its `before` timestamp is updated to\nthe current time.",
          "input": "v1/purge-cache-request.json#",
          "method": "post",
          "name": "purgeCache",
          "query": [
          ],
          "route": "/purge-cache/<workerPoolId>",
          "scopes": "purge-cache:<workerPoolId>:<cacheName>",
          "stability": "stable",
          "title": "Purge Worker Cache",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Purge-Cache Service",
          "description": "View all active purge requests.\n\nThis is useful mostly for administors to view\nthe set of open purge requests. It should not\nbe used by workers. They should use the purgeRequests\nendpoint that is specific to their workerType and\nprovisionerId.",
          "method": "get",
          "name": "allPurgeRequests",
          "output": "v1/all-purge-cache-request-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/purge-cache/list",
          "scopes": "purge-cache:all-purge-requests",
          "stability": "stable",
          "title": "All Open Purge Requests",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Purge-Cache Service",
          "description": "List the caches for this `workerPoolId` that should to be\npurged if they are from before the time given in the response.\n\nThis is intended to be used by workers to determine which caches to purge.",
          "method": "get",
          "name": "purgeRequests",
          "output": "v1/purge-cache-request-list.json#",
          "query": [
            "since"
          ],
          "route": "/purge-cache/<workerPoolId>",
          "scopes": "purge-cache:purge-requests::<workerPoolId>",
          "stability": "stable",
          "title": "Open Purge Requests for a worker pool",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "purge-cache",
      "title": "Purge Cache Service"
    },
    "referenceKind": "api"
  },
  "Queue": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The queue service is responsible for accepting tasks and tracking their state\nas they are executed by workers, in order to ensure they are eventually\nresolved.\n\n## Artifact Storage Types\n\n* **Object artifacts** contain arbitrary data, stored via the object service.\n* **Redirect artifacts**, will redirect the caller to URL when fetched\nwith a a 303 (See Other) response.  Clients will not apply any kind of\nauthentication to that URL.\n* **Link artifacts**, will be treated as if the caller requested the linked\nartifact on the same task.  Links may be chained, but cycles are forbidden.\nThe caller must have scopes for the linked artifact, or a 403 response will\nbe returned.\n* **Error artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts are only meant to indicate that you the\nworker or the task failed to generate a specific artifact, that you\nwould otherwise have uploaded. For example docker-worker will upload an\nerror artifact, if the file it was supposed to upload doesn't exists or\nturns out to be a directory. Clients requesting an error artifact will\nget a `424` (Failed Dependency) response. This is mainly designed to\nensure that dependent tasks can distinguish between artifacts that were\nsuppose to be generated and artifacts for which the name is misspelled.\n* **S3 artifacts** are used for static files which will be\nstored on S3. When creating an S3 artifact the queue will return a\npre-signed URL to which you can do a `PUT` request to upload your\nartifact. Note that `PUT` request **must** specify the `content-length`\nheader and **must** give the `content-type` header the same value as in\nthe request to `createArtifact`. S3 artifacts will be deprecated soon,\nand users should prefer object artifacts instead.\n\n## Artifact immutability\n\nGenerally speaking you cannot overwrite an artifact when created.\nBut if you repeat the request with the same properties the request will\nsucceed as the operation is idempotent.\nThis is useful if you need to refresh a signed URL while uploading.\nDo not abuse this to overwrite artifacts created by another entity!\nSuch as worker-host overwriting artifact created by worker-code.\n\nThe queue defines the following *immutability special cases*:\n\n* A `reference` artifact can replace an existing `reference` artifact.\n* A `link` artifact can replace an existing `reference` artifact.\n* Any artifact's `expires` can be extended (made later, but not earlier).",
      "entries": [
        {
          "args": [
          ],
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "category": "Tasks",
          "description": "This end-point will return the task-definition. Notice that the task\ndefinition may have been modified by queue, if an optional property is\nnot specified the queue may provide a default value.",
          "method": "get",
          "name": "task",
          "output": "v1/task.json#",
          "query": [
          ],
          "route": "/task/<taskId>",
          "scopes": "queue:get-task:<taskId>",
          "stability": "stable",
          "title": "Get Task Definition",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "category": "Tasks",
          "description": "Get task status structure from `taskId`",
          "method": "get",
          "name": "status",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/status",
          "scopes": "queue:status:<taskId>",
          "stability": "stable",
          "title": "Get task status",
          "type": "function"
        },
        {
          "args": [
            "taskGroupId"
          ],
          "category": "Tasks",
          "description": "List tasks sharing the same `taskGroupId`.\n\nAs a task-group may contain an unbounded number of tasks, this end-point\nmay return a `continuationToken`. To continue listing tasks you must call\nthe `listTaskGroup` again with the `continuationToken` as the\nquery-string option `continuationToken`.\n\nBy default this end-point will try to return up to 1000 members in one\nrequest. But it **may return less**, even if more tasks are available.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `listTaskGroup` with the last `continuationToken` until you\nget a result without a `continuationToken`.\n\nIf you are not interested in listing all the members at once, you may\nuse the query-string option `limit` to return fewer.",
          "method": "get",
          "name": "listTaskGroup",
          "output": "v1/list-task-group-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task-group/<taskGroupId>/list",
          "scopes": "queue:list-task-group:<taskGroupId>",
          "stability": "stable",
          "title": "List Task Group",
          "type": "function"
        },
        {
          "args": [
            "taskGroupId"
          ],
          "category": "Tasks",
          "description": "Get task group information by `taskGroupId`.\n\nThis will return meta-information associated with the task group.\nIt contains information about task group expiry date or if it is sealed.",
          "method": "get",
          "name": "getTaskGroup",
          "output": "v1/task-group-response.json#",
          "query": [
          ],
          "route": "/task-group/<taskGroupId>",
          "scopes": "queue:list-task-group:<taskGroupId>",
          "stability": "stable",
          "title": "Get Task Group",
          "type": "function"
        },
        {
          "args": [
            "taskGroupId"
          ],
          "category": "Tasks",
          "description": "Seal task group to prevent creation of new tasks.\n\nTask group can be sealed once and is irreversible. Calling it multiple times\nwill return same result and will not update it again.",
          "method": "post",
          "name": "sealTaskGroup",
          "output": "v1/task-group-response.json#",
          "query": [
          ],
          "route": "/task-group/<taskGroupId>/seal",
          "scopes": {
            "AnyOf": [
              "queue:seal-task-group:<taskGroupId>",
              {
                "AllOf": [
                  {
                    "each": "queue:seal-task-group-in-project:<projectId>",
                    "for": "projectId",
                    "in": "projectIds"
                  }
                ]
              }
            ]
          },
          "stability": "experimental",
          "title": "Seal Task Group",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "category": "Tasks",
          "description": "List tasks that depend on the given `taskId`.\n\nAs many tasks from different task-groups may dependent on a single tasks,\nthis end-point may return a `continuationToken`. To continue listing\ntasks you must call `listDependentTasks` again with the\n`continuationToken` as the query-string option `continuationToken`.\n\nBy default this end-point will try to return up to 1000 tasks in one\nrequest. But it **may return less**, even if more tasks are available.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `listDependentTasks` with the last `continuationToken` until\nyou get a result without a `continuationToken`.\n\nIf you are not interested in listing all the tasks at once, you may\nuse the query-string option `limit` to return fewer.",
          "method": "get",
          "name": "listDependentTasks",
          "output": "v1/list-dependent-tasks-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task/<taskId>/dependents",
          "scopes": "queue:list-dependent-tasks:<taskId>",
          "stability": "stable",
          "title": "List Dependent Tasks",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "category": "Tasks",
          "description": "Create a new task, this is an **idempotent** operation, so repeat it if\nyou get an internal server error or network connection is dropped.\n\n**Task `deadline`**: the deadline property can be no more than 5 days\ninto the future. This is to limit the amount of pending tasks not being\ntaken care of. Ideally, you should use a much shorter deadline.\n\n**Task expiration**: the `expires` property must be greater than the\ntask `deadline`. If not provided it will default to `deadline` + one\nyear. Notice that artifacts created by a task must expire before the\ntask's expiration.\n\n**Task specific routing-keys**: using the `task.routes` property you may\ndefine task specific routing-keys. If a task has a task specific\nrouting-key: `<route>`, then when the AMQP message about the task is\npublished, the message will be CC'ed with the routing-key:\n`route.<route>`. This is useful if you want another component to listen\nfor completed tasks you have posted.  The caller must have scope\n`queue:route:<route>` for each route.\n\n**Dependencies**: any tasks referenced in `task.dependencies` must have\nalready been created at the time of this call.\n\n**Scopes**: Note that the scopes required to complete this API call depend\non the content of the `scopes`, `routes`, `schedulerId`, `priority`,\n`provisionerId`, and `workerType` properties of the task definition.\n\nIf the task group was sealed, this end-point will return `409` reporting\n`RequestConflict` to indicate that it is no longer possible to add new tasks\nfor this `taskGroupId`.",
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
              "queue:create-task:project:<projectId>",
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
          "stability": "stable",
          "title": "Create New Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "category": "Tasks",
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
              "queue:schedule-task-in-project:<projectId>",
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
          "category": "Tasks",
          "description": "This method _reruns_ a previously resolved task, even if it was\n_completed_. This is useful if your task completes unsuccessfully, and\nyou just want to run it from scratch again. This will also reset the\nnumber of `retries` allowed. It will schedule a task that is _unscheduled_\nregardless of the state of its dependencies.\n\nRemember that `retries` in the task status counts the number of runs that\nthe queue have started because the worker stopped responding, for example\nbecause a spot node died.\n\n**Remark** this operation is idempotent: if it is invoked for a task that\nis `pending` or `running`, it will just return the current task status.",
          "method": "post",
          "name": "rerunTask",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/rerun",
          "scopes": {
            "AnyOf": [
              "queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>",
              "queue:rerun-task-in-project:<projectId>",
              {
                "AllOf": [
                  "queue:rerun-task",
                  "assume:scheduler-id:<schedulerId>/<taskGroupId>"
                ]
              }
            ]
          },
          "stability": "stable",
          "title": "Rerun a Resolved Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "category": "Tasks",
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
              "queue:cancel-task-in-project:<projectId>",
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
            "taskQueueId"
          ],
          "category": "Worker Interface",
          "description": "Claim pending task(s) for the given task queue.\n\nIf any work is available (even if fewer than the requested number of\ntasks, this will return immediately. Otherwise, it will block for tens of\nseconds waiting for work.  If no work appears, it will return an emtpy\nlist of tasks.  Callers should sleep a short while (to avoid denial of\nservice in an error condition) and call the endpoint again.  This is a\nsimple implementation of \"long polling\".",
          "input": "v1/claim-work-request.json#",
          "method": "post",
          "name": "claimWork",
          "output": "v1/claim-work-response.json#",
          "query": [
          ],
          "route": "/claim-work/<taskQueueId>",
          "scopes": {
            "AllOf": [
              "queue:claim-work:<taskQueueId>",
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
          "category": "Worker Interface",
          "description": "claim a task - never documented",
          "input": "v1/task-claim-request.json#",
          "method": "post",
          "name": "claimTask",
          "output": "v1/task-claim-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/claim",
          "scopes": {
            "AllOf": [
              "queue:claim-task:<provisionerId>/<workerType>",
              "queue:worker-id:<workerGroup>/<workerId>"
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
          "category": "Worker Interface",
          "description": "Refresh the claim for a specific `runId` for given `taskId`. This updates\nthe `takenUntil` property and returns a new set of temporary credentials\nfor performing requests on behalf of the task. These credentials should\nbe used in-place of the credentials returned by `claimWork`.\n\nThe `reclaimTask` requests serves to:\n * Postpone `takenUntil` preventing the queue from resolving\n   `claim-expired`,\n * Refresh temporary credentials used for processing the task, and\n * Abort execution if the task/run have been resolved.\n\nIf the `takenUntil` timestamp is exceeded the queue will resolve the run\nas _exception_ with reason `claim-expired`, and proceeded to retry to the\ntask. This ensures that tasks are retried, even if workers disappear\nwithout warning.\n\nIf the task is resolved, this end-point will return `409` reporting\n`RequestConflict`. This typically happens if the task have been canceled\nor the `task.deadline` have been exceeded. If reclaiming fails, workers\nshould abort the task and forget about the given `runId`. There is no\nneed to resolve the run or upload artifacts.",
          "method": "post",
          "name": "reclaimTask",
          "output": "v1/task-reclaim-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/reclaim",
          "scopes": "queue:reclaim-task:<taskId>/<runId>",
          "stability": "stable",
          "title": "Reclaim task",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "category": "Worker Interface",
          "description": "Report a task completed, resolving the run as `completed`.",
          "method": "post",
          "name": "reportCompleted",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/completed",
          "scopes": "queue:resolve-task:<taskId>/<runId>",
          "stability": "stable",
          "title": "Report Run Completed",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "category": "Worker Interface",
          "description": "Report a run failed, resolving the run as `failed`. Use this to resolve\na run that failed because the task specific code behaved unexpectedly.\nFor example the task exited non-zero, or didn't produce expected output.\n\nDo not use this if the task couldn't be run because if malformed\npayload, or other unexpected condition. In these cases we have a task\nexception, which should be reported with `reportException`.",
          "method": "post",
          "name": "reportFailed",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/failed",
          "scopes": "queue:resolve-task:<taskId>/<runId>",
          "stability": "stable",
          "title": "Report Run Failed",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "category": "Worker Interface",
          "description": "Resolve a run as _exception_. Generally, you will want to report tasks as\nfailed instead of exception. You should `reportException` if,\n\n  * The `task.payload` is invalid,\n  * Non-existent resources are referenced,\n  * Declared actions cannot be executed due to unavailable resources,\n  * The worker had to shutdown prematurely,\n  * The worker experienced an unknown error, or,\n  * The task explicitly requested a retry.\n\nDo not use this to signal that some user-specified code crashed for any\nreason specific to this code. If user-specific code hits a resource that\nis temporarily unavailable worker should report task _failed_.",
          "input": "v1/task-exception-request.json#",
          "method": "post",
          "name": "reportException",
          "output": "v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/exception",
          "scopes": "queue:resolve-task:<taskId>/<runId>",
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
          "category": "Artifacts",
          "description": "This API end-point creates an artifact for a specific run of a task. This\nshould **only** be used by a worker currently operating on this task, or\nfrom a process running within the task (ie. on the worker).\n\nAll artifacts must specify when they expire. The queue will\nautomatically take care of deleting artifacts past their\nexpiration point. This feature makes it feasible to upload large\nintermediate artifacts from data processing applications, as the\nartifacts can be set to expire a few days later.",
          "input": "v1/post-artifact-request.json#",
          "method": "post",
          "name": "createArtifact",
          "output": "v1/post-artifact-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": "queue:create-artifact:<taskId>/<runId>",
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
          "category": "Artifacts",
          "description": "This endpoint marks an artifact as present for the given task, and\nshould be called when the artifact data is fully uploaded.\n\nThe storage types `reference`, `link`, and `error` do not need to\nbe finished, as they are finished immediately by `createArtifact`.\nThe storage type `s3` does not support this functionality and cannot\nbe finished.  In all such cases, calling this method is an input error\n(400).",
          "input": "v1/finish-artifact-request.json#",
          "method": "put",
          "name": "finishArtifact",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": "queue:create-artifact:<taskId>/<runId>",
          "stability": "stable",
          "title": "Finish Artifact",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "category": "Artifacts",
          "description": "Get artifact by `<name>` from a specific run.\n\n**Artifact Access**, in order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nTo allow access to fetch artifacts with a client like `curl` or a web\nbrowser, without using Taskcluster credentials, include a scope in the\n`anonymous` role.  The convention is to include\n`queue:get-artifact:public/*`.\n\n**Response**: the HTTP response to this method is a 303 redirect to the\nURL from which the artifact can be downloaded.  The body of that response\ncontains the data described in the output schema, contianing the same URL.\nCallers are encouraged to use whichever method of gathering the URL is\nmost convenient.  Standard HTTP clients will follow the redirect, while\nAPI client libraries will return the JSON body.\n\nIn order to download an artifact the following must be done:\n\n1. Obtain queue url.  Building a signed url with a taskcluster client is\nrecommended\n1. Make a GET request which does not follow redirects\n1. In all cases, if specified, the\nx-taskcluster-location-{content,transfer}-{sha256,length} values must be\nvalidated to be equal to the Content-Length and Sha256 checksum of the\nfinal artifact downloaded. as well as any intermediate redirects\n1. If this response is a 500-series error, retry using an exponential\nbackoff.  No more than 5 retries should be attempted\n1. If this response is a 400-series error, treat it appropriately for\nyour context.  This might be an error in responding to this request or\nan Error storage type body.  This request should not be retried.\n1. If this response is a 200-series response, the response body is the artifact.\nIf the x-taskcluster-location-{content,transfer}-{sha256,length} and\nx-taskcluster-location-content-encoding are specified, they should match\nthis response body\n1. If the response type is a 300-series redirect, the artifact will be at the\nlocation specified by the `Location` header.  There are multiple artifact storage\ntypes which use a 300-series redirect.\n1. For all redirects followed, the user must verify that the content-sha256, content-length,\ntransfer-sha256, transfer-length and content-encoding match every further request.  The final\nartifact must also be validated against the values specified in the original queue response\n1. Caching of requests with an x-taskcluster-artifact-storage-type value of `reference`\nmust not occur\n\n**Headers**\nThe following important headers are set on the response to this method:\n\n* location: the url of the artifact if a redirect is to be performed\n* x-taskcluster-artifact-storage-type: the storage type.  Example: s3",
          "method": "get",
          "name": "getArtifact",
          "output": "v1/get-artifact-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": {
            "AllOf": [
              {
                "each": "queue:get-artifact:<name>",
                "for": "name",
                "in": "names"
              }
            ]
          },
          "stability": "stable",
          "title": "Get Artifact Data from Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "name"
          ],
          "category": "Artifacts",
          "description": "Get artifact by `<name>` from the last run of a task.\n\n**Artifact Access**, in order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nTo allow access to fetch artifacts with a client like `curl` or a web\nbrowser, without using Taskcluster credentials, include a scope in the\n`anonymous` role.  The convention is to include\n`queue:get-artifact:public/*`.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with a normal HTTP client.\n\n**Remark**, this end-point is slightly slower than\n`queue.getArtifact`, so consider that if you already know the `runId` of\nthe latest run. Otherwise, just us the most convenient API end-point.",
          "method": "get",
          "name": "getLatestArtifact",
          "output": "v1/get-artifact-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/artifacts/<name>",
          "scopes": {
            "AllOf": [
              {
                "each": "queue:get-artifact:<name>",
                "for": "name",
                "in": "names"
              }
            ]
          },
          "stability": "stable",
          "title": "Get Artifact Data from Latest Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "category": "Artifacts",
          "description": "Returns a list of artifacts and associated meta-data for a given run.\n\nAs a task may have many artifacts paging may be necessary. If this\nend-point returns a `continuationToken`, you should call the end-point\nagain with the `continuationToken` as the query-string option:\n`continuationToken`.\n\nBy default this end-point will list up-to 1000 artifacts in a single page\nyou may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listArtifacts",
          "output": "v1/list-artifacts-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts",
          "scopes": "queue:list-artifacts:<taskId>:<runId>",
          "stability": "stable",
          "title": "Get Artifacts from Run",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "category": "Artifacts",
          "description": "Returns a list of artifacts and associated meta-data for the latest run\nfrom the given task.\n\nAs a task may have many artifacts paging may be necessary. If this\nend-point returns a `continuationToken`, you should call the end-point\nagain with the `continuationToken` as the query-string option:\n`continuationToken`.\n\nBy default this end-point will list up-to 1000 artifacts in a single page\nyou may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listLatestArtifacts",
          "output": "v1/list-artifacts-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task/<taskId>/artifacts",
          "scopes": "queue:list-artifacts:<taskId>",
          "stability": "stable",
          "title": "Get Artifacts from Latest Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "category": "Artifacts",
          "description": "Returns associated metadata for a given artifact, in the given task run.\nThe metadata is the same as that returned from `listArtifacts`, and does\nnot grant access to the artifact data.\n\nNote that this method does *not* automatically follow link artifacts.",
          "method": "get",
          "name": "artifactInfo",
          "output": "v1/artifact-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifact-info/<name>",
          "scopes": "queue:list-artifacts:<taskId>:<runId>",
          "stability": "stable",
          "title": "Get Artifact Information From Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "name"
          ],
          "category": "Artifacts",
          "description": "Returns associated metadata for a given artifact, in the latest run of the\ntask.  The metadata is the same as that returned from `listArtifacts`,\nand does not grant access to the artifact data.\n\nNote that this method does *not* automatically follow link artifacts.",
          "method": "get",
          "name": "latestArtifactInfo",
          "output": "v1/artifact-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/artifact-info/<name>",
          "scopes": "queue:list-artifacts:<taskId>",
          "stability": "stable",
          "title": "Get Artifact Information From Latest Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId",
            "name"
          ],
          "category": "Artifacts",
          "description": "Returns information about the content of the artifact, in the given task run.\n\nDepending on the storage type, the endpoint returns the content of the artifact\nor enough information to access that content.\n\nThis method follows link artifacts, so it will not return content\nfor a link artifact.",
          "method": "get",
          "name": "artifact",
          "output": "v1/artifact-content-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifact-content/<name>",
          "scopes": {
            "AllOf": [
              {
                "each": "queue:get-artifact:<name>",
                "for": "name",
                "in": "names"
              }
            ]
          },
          "stability": "stable",
          "title": "Get Artifact Content From Run",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "name"
          ],
          "category": "Artifacts",
          "description": "Returns information about the content of the artifact, in the latest task run.\n\nDepending on the storage type, the endpoint returns the content of the artifact\nor enough information to access that content.\n\nThis method follows link artifacts, so it will not return content\nfor a link artifact.",
          "method": "get",
          "name": "latestArtifact",
          "output": "v1/artifact-content-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/artifact-content/<name>",
          "scopes": {
            "AllOf": [
              {
                "each": "queue:get-artifact:<name>",
                "for": "name",
                "in": "names"
              }
            ]
          },
          "stability": "stable",
          "title": "Get Artifact Content From Latest Run",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Worker Metadata",
          "description": "Get all active provisioners.\n\nThe term \"provisioner\" is taken broadly to mean anything with a provisionerId.\nThis does not necessarily mean there is an associated service performing any\nprovisioning activity.\n\nThe response is paged. If this end-point returns a `continuationToken`, you\nshould call the end-point again with the `continuationToken` as a query-string\noption. By default this end-point will list up to 1000 provisioners in a single\npage. You may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listProvisioners",
          "output": "v1/list-provisioners-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/provisioners",
          "scopes": "queue:list-provisioners",
          "stability": "deprecated",
          "title": "Get a list of all active provisioners",
          "type": "function"
        },
        {
          "args": [
            "provisionerId"
          ],
          "category": "Worker Metadata",
          "description": "Get an active provisioner.\n\nThe term \"provisioner\" is taken broadly to mean anything with a provisionerId.\nThis does not necessarily mean there is an associated service performing any\nprovisioning activity.",
          "method": "get",
          "name": "getProvisioner",
          "output": "v1/provisioner-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>",
          "scopes": "queue:get-provisioner:<provisionerId>",
          "stability": "deprecated",
          "title": "Get an active provisioner",
          "type": "function"
        },
        {
          "args": [
            "provisionerId"
          ],
          "category": "Worker Metadata",
          "description": "Declare a provisioner, supplying some details about it.\n\n`declareProvisioner` allows updating one or more properties of a provisioner as long as the required scopes are\npossessed. For example, a request to update the `my-provisioner`\nprovisioner with a body `{description: 'This provisioner is great'}` would require you to have the scope\n`queue:declare-provisioner:my-provisioner#description`.\n\nThe term \"provisioner\" is taken broadly to mean anything with a provisionerId.\nThis does not necessarily mean there is an associated service performing any\nprovisioning activity.",
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
          "stability": "deprecated",
          "title": "Update a provisioner",
          "type": "function"
        },
        {
          "args": [
            "taskQueueId"
          ],
          "category": "Worker Metadata",
          "description": "Get an approximate number of pending tasks for the given `taskQueueId`.\n\nThe underlying Azure Storage Queues only promises to give us an estimate.\nFurthermore, we cache the result in memory for 20 seconds. So consumers\nshould be no means expect this to be an accurate number.\nIt is, however, a solid estimate of the number of pending tasks.",
          "method": "get",
          "name": "pendingTasks",
          "output": "v1/pending-tasks-response.json#",
          "query": [
          ],
          "route": "/pending/<taskQueueId>",
          "scopes": "queue:pending-count:<taskQueueId>",
          "stability": "stable",
          "title": "Get Number of Pending Tasks",
          "type": "function"
        },
        {
          "args": [
            "provisionerId"
          ],
          "category": "Worker Metadata",
          "description": "Get all active worker-types for the given provisioner.\n\nThe response is paged. If this end-point returns a `continuationToken`, you\nshould call the end-point again with the `continuationToken` as a query-string\noption. By default this end-point will list up to 1000 worker-types in a single\npage. You may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listWorkerTypes",
          "output": "v1/list-workertypes-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/provisioners/<provisionerId>/worker-types",
          "scopes": "queue:list-worker-types:<provisionerId>",
          "stability": "deprecated",
          "title": "Get a list of all active worker-types",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "category": "Worker Metadata",
          "description": "Get a worker-type from a provisioner.",
          "method": "get",
          "name": "getWorkerType",
          "output": "v1/workertype-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>",
          "scopes": "queue:get-worker-type:<provisionerId>/<workerType>",
          "stability": "deprecated",
          "title": "Get a worker-type",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "category": "Worker Metadata",
          "description": "Declare a workerType, supplying some details about it.\n\n`declareWorkerType` allows updating one or more properties of a worker-type as long as the required scopes are\npossessed. For example, a request to update the `highmem` worker-type within the `my-provisioner`\nprovisioner with a body `{description: 'This worker type is great'}` would require you to have the scope\n`queue:declare-worker-type:my-provisioner/highmem#description`.",
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
          "stability": "deprecated",
          "title": "Update a worker-type",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Worker Metadata",
          "description": "Get all active task queues.\n\nThe response is paged. If this end-point returns a `continuationToken`, you\nshould call the end-point again with the `continuationToken` as a query-string\noption. By default this end-point will list up to 1000 task queues in a single\npage. You may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listTaskQueues",
          "output": "v1/list-taskqueues-response.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/task-queues",
          "scopes": "queue:list-task-queues",
          "stability": "stable",
          "title": "Get a list of all active task queues",
          "type": "function"
        },
        {
          "args": [
            "taskQueueId"
          ],
          "category": "Worker Metadata",
          "description": "Get a task queue.",
          "method": "get",
          "name": "getTaskQueue",
          "output": "v1/taskqueue-response.json#",
          "query": [
          ],
          "route": "/task-queues/<taskQueueId>",
          "scopes": "queue:get-task-queue:<taskQueueId>",
          "stability": "stable",
          "title": "Get a task queue",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "category": "Worker Metadata",
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
          "scopes": "queue:list-workers:<provisionerId>/<workerType>",
          "stability": "deprecated",
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
          "category": "Worker Metadata",
          "description": "Get a worker from a worker-type.",
          "method": "get",
          "name": "getWorker",
          "output": "v1/worker-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>/workers/<workerGroup>/<workerId>",
          "scopes": "queue:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>",
          "stability": "deprecated",
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
          "category": "Worker Metadata",
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
          "category": "Worker Metadata",
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
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "queue",
      "title": "Queue Service"
    },
    "referenceKind": "api"
  },
  "QueueEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "The queue service is responsible for accepting tasks and track their state\nas they are executed by workers. In order ensure they are eventually\nresolved.\n\nThis document describes AMQP exchanges offered by the queue, which allows\nthird-party listeners to monitor tasks as they progress to resolution.\nThese exchanges targets the following audience:\n * Schedulers, who takes action after tasks are completed,\n * Workers, who wants to listen for new or canceled tasks (optional),\n * Tools, that wants to update their view as task progress.\n\nYou'll notice that all the exchanges in the document shares the same\nrouting key pattern. This makes it very easy to bind to all messages\nabout a certain kind tasks.\n\n**Task specific routes**, a task can define a task specific route using\nthe `task.routes` property. See task creation documentation for details\non permissions required to provide task specific routes. If a task has\nthe entry `'notify.by-email'` in as task specific route defined in\n`task.routes` all messages about this task will be CC'ed with the\nrouting-key `'route.notify.by-email'`.\n\nThese routes will always be prefixed `route.`, so that cannot interfere\nwith the _primary_ routing key as documented here. Notice that the\n_primary_ routing key is always prefixed `primary.`. This is ensured\nin the routing key reference, so API clients will do this automatically.\n\nPlease, note that the way RabbitMQ works, the message will only arrive\nin your queue once, even though you may have bound to the exchange with\nmultiple routing key patterns that matches more of the CC'ed routing\nrouting keys.\n\n**Delivery guarantees**, most operations on the queue are idempotent,\nwhich means that if repeated with the same arguments then the requests\nwill ensure completion of the operation and return the same response.\nThis is useful if the server crashes or the TCP connection breaks, but\nwhen re-executing an idempotent operation, the queue will also resend\nany related AMQP messages. Hence, messages may be repeated.\n\nThis shouldn't be much of a problem, as the best you can achieve using\nconfirm messages with AMQP is at-least-once delivery semantics. Hence,\nthis only prevents you from obtaining at-most-once delivery semantics.\n\n**Remark**, some message generated by timeouts maybe dropped if the\nserver crashes at wrong time. Ideally, we'll address this in the\nfuture. For now we suggest you ignore this corner case, and notify us\nif this corner case is of concern to you.",
      "entries": [
        {
          "description": "When a task is created or just defined a message is posted to this\nexchange.\n\nThis message exchange is mainly useful when tasks are created with dependencies\non incomplete tasks, as this does not make the task\n`pending`. Thus, no `taskPending` message is published.",
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
          "description": "Whenever the `createArtifact` end-point is called, the queue will create\na record of the artifact and post a message on this exchange. All of this\nhappens before the queue returns a signed URL for the caller to upload\nthe actual artifact with (pending on `storageType`).\n\nThis means that the actual artifact is rarely available when this message\nis posted. But it is not unreasonable to assume that the artifact will\nwill become available at some point later. Most signatures will expire in\n30 minutes or so, forcing the uploader to call `createArtifact` with\nthe same payload again in-order to continue uploading the artifact.\n\nHowever, in most cases (especially for small artifacts) it's very\nreasonable assume the artifact will be available within a few minutes.\nThis property means that this exchange is mostly useful for tools\nmonitoring task evaluation. One could also use it count number of\nartifacts per task, or _index_ artifacts though in most cases it'll be\nsmarter to index artifacts after the task in question have completed\nsuccessfully.\n\n*NOTE*: this message is currently only sent for reference and error\nartifacts.  This will be remedied in a future version of Taskcluster.",
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
        },
        {
          "description": "A message is published on task-group-sealed whenever task group is sealed.\nThis task group will no longer allow creation of new tasks.",
          "exchange": "task-group-sealed",
          "name": "taskGroupSealed",
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
          "schema": "v1/task-group-sealed.json#",
          "title": "Task Group Sealed Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-queue/v1/",
      "serviceName": "queue",
      "title": "Queue AMQP Exchanges"
    },
    "referenceKind": "exchanges"
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
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
            "name"
          ],
          "category": "Secrets Service",
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
          "category": "Secrets Service",
          "description": "Delete the secret associated with some key. It will succeed whether or not the secret exists",
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
          "category": "Secrets Service",
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
          "category": "Secrets Service",
          "description": "List the names of all secrets.\n\nBy default this end-point will try to return up to 1000 secret names in one\nrequest. But it **may return less**, even if more tasks are available.\nIt may also return a `continuationToken` even though there are no more\nresults. However, you can only be sure to have seen all results if you\nkeep calling `listTaskGroup` with the last `continuationToken` until you\nget a result without a `continuationToken`.\n\nIf you are not interested in listing all the members at once, you may\nuse the query-string option `limit` to return fewer.",
          "method": "get",
          "name": "list",
          "output": "v1/secret-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/secrets",
          "scopes": "secrets:list-secrets",
          "stability": "stable",
          "title": "List Secrets",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "secrets",
      "title": "Secrets Service"
    },
    "referenceKind": "api"
  },
  "WorkerManager": {
    "reference": {
      "$schema": "/schemas/common/api-reference-v0.json#",
      "apiVersion": "v1",
      "description": "This service manages workers, including provisioning for dynamic worker pools.\n\nMethods interacting with a provider may return a 503 response if that provider has\nnot been able to start up, such as if the service to which it interfaces has an\noutage.  Such requests can be retried as for any other 5xx response.",
      "entries": [
        {
          "args": [
          ],
          "category": "Monitoring",
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
          "category": "Monitoring",
          "description": "Respond without doing anything.\nThis endpoint is used to check that the service is up.",
          "method": "get",
          "name": "lbheartbeat",
          "query": [
          ],
          "route": "/__lbheartbeat__",
          "stability": "stable",
          "title": "Load Balancer Heartbeat",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with the JSON version object.\nhttps://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md",
          "method": "get",
          "name": "version",
          "query": [
          ],
          "route": "/__version__",
          "stability": "stable",
          "title": "Taskcluster Version",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Providers",
          "description": "Retrieve a list of providers that are available for worker pools.",
          "method": "get",
          "name": "listProviders",
          "output": "v1/provider-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/providers",
          "scopes": "worker-manager:list-providers",
          "stability": "stable",
          "title": "List Providers",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Worker Pools",
          "description": "Create a new worker pool. If the worker pool already exists, this will throw an error.",
          "input": "v1/create-worker-pool-request.json#",
          "method": "put",
          "name": "createWorkerPool",
          "output": "v1/worker-pool-full.json#",
          "query": [
          ],
          "route": "/worker-pool/<workerPoolId>",
          "scopes": {
            "AllOf": [
              "worker-manager:manage-worker-pool:<workerPoolId>",
              "worker-manager:provider:<providerId>"
            ]
          },
          "stability": "stable",
          "title": "Create Worker Pool",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Worker Pools",
          "description": "Given an existing worker pool definition, this will modify it and return\nthe new definition.\n\nTo delete a worker pool, set its `providerId` to `\"null-provider\"`.\nAfter any existing workers have exited, a cleanup job will remove the\nworker pool.  During that time, the worker pool can be updated again, such\nas to set its `providerId` to a real provider.",
          "input": "v1/update-worker-pool-request.json#",
          "method": "post",
          "name": "updateWorkerPool",
          "output": "v1/worker-pool-full.json#",
          "query": [
          ],
          "route": "/worker-pool/<workerPoolId>",
          "scopes": {
            "AllOf": [
              "worker-manager:manage-worker-pool:<workerPoolId>",
              "worker-manager:provider:<providerId>"
            ]
          },
          "stability": "experimental",
          "title": "Update Worker Pool",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Worker Pools",
          "description": "Mark a worker pool for deletion.  This is the same as updating the pool to\nset its providerId to `\"null-provider\"`, but does not require scope\n`worker-manager:provider:null-provider`.",
          "method": "delete",
          "name": "deleteWorkerPool",
          "output": "v1/worker-pool-full.json#",
          "query": [
          ],
          "route": "/worker-pool/<workerPoolId>",
          "scopes": "worker-manager:manage-worker-pool:<workerPoolId>",
          "stability": "stable",
          "title": "Delete Worker Pool",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Worker Pools",
          "description": "Fetch an existing worker pool defition.",
          "method": "get",
          "name": "workerPool",
          "output": "v1/worker-pool-full.json#",
          "query": [
          ],
          "route": "/worker-pool/<workerPoolId>",
          "scopes": "worker-manager:get-worker-pool:<workerPoolId>",
          "stability": "stable",
          "title": "Get Worker Pool",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Worker Pools",
          "description": "Get the list of all the existing worker pools.",
          "method": "get",
          "name": "listWorkerPools",
          "output": "v1/worker-pool-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/worker-pools",
          "scopes": "worker-manager:list-worker-pools",
          "stability": "stable",
          "title": "List All Worker Pools",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Worker Interface",
          "description": "Report an error that occurred on a worker.  This error will be included\nwith the other errors in `listWorkerPoolErrors(workerPoolId)`.\n\nWorkers can use this endpoint to report startup or configuration errors\nthat might be associated with the worker pool configuration and thus of\ninterest to a worker-pool administrator.\n\nNOTE: errors are publicly visible.  Ensure that none of the content\ncontains secrets or other sensitive information.",
          "input": "v1/report-worker-error-request.json#",
          "method": "post",
          "name": "reportWorkerError",
          "output": "v1/worker-pool-error.json#",
          "query": [
          ],
          "route": "/worker-pool-errors/<workerPoolId>",
          "scopes": {
            "AllOf": [
              "assume:worker-pool:<workerPoolId>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ]
          },
          "stability": "stable",
          "title": "Report an error from a worker",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Worker Pools",
          "description": "Get the list of worker pool errors.",
          "method": "get",
          "name": "listWorkerPoolErrors",
          "output": "v1/worker-pool-error-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/worker-pool-errors/<workerPoolId>",
          "scopes": "worker-manager:list-worker-pool-errors:<workerPoolId>",
          "stability": "stable",
          "title": "List Worker Pool Errors",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId",
            "workerGroup"
          ],
          "category": "Workers",
          "description": "Get the list of all the existing workers in a given group in a given worker pool.",
          "method": "get",
          "name": "listWorkersForWorkerGroup",
          "output": "v1/worker-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/workers/<workerPoolId>:/<workerGroup>",
          "scopes": "worker-manager:list-workers:<workerPoolId>/<workerGroup>",
          "stability": "stable",
          "title": "Workers in a specific Worker Group in a Worker Pool",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId",
            "workerGroup",
            "workerId"
          ],
          "category": "Workers",
          "description": "Get a single worker.",
          "method": "get",
          "name": "worker",
          "output": "v1/worker-full.json#",
          "query": [
          ],
          "route": "/workers/<workerPoolId>:/<workerGroup>/<workerId>",
          "scopes": "worker-manager:get-worker:<workerPoolId>/<workerGroup>/<workerId>",
          "stability": "stable",
          "title": "Get a Worker",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId",
            "workerGroup",
            "workerId"
          ],
          "category": "Workers",
          "description": "Create a new worker.  This is only useful for worker pools where the provider\ndoes not create workers automatically, such as those with a `static` provider\ntype.  Providers that do not support creating workers will return a 400 error.\nSee the documentation for the individual providers, and in particular the\n[static provider](https://docs.taskcluster.net/docs/reference/core/worker-manager/)\nfor more information.",
          "input": "v1/create-worker-request.json#",
          "method": "put",
          "name": "createWorker",
          "output": "v1/worker-full.json#",
          "query": [
          ],
          "route": "/workers/<workerPoolId>:/<workerGroup>/<workerId>",
          "scopes": "worker-manager:create-worker:<workerPoolId>/<workerGroup>/<workerId>",
          "stability": "stable",
          "title": "Create a Worker",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId",
            "workerGroup",
            "workerId"
          ],
          "category": "Workers",
          "description": "Update an existing worker in-place.  Like `createWorker`, this is only useful for\nworker pools where the provider does not create workers automatically.\nThis method allows updating all fields in the schema unless otherwise indicated\nin the provider documentation.\nSee the documentation for the individual providers, and in particular the\n[static provider](https://docs.taskcluster.net/docs/reference/core/worker-manager/)\nfor more information.",
          "input": "v1/create-worker-request.json#",
          "method": "post",
          "name": "updateWorker",
          "output": "v1/worker-full.json#",
          "query": [
          ],
          "route": "/workers/<workerPoolId>:/<workerGroup>/<workerId>",
          "scopes": "worker-manager:update-worker:<workerPoolId>/<workerGroup>/<workerId>",
          "stability": "stable",
          "title": "Update an existing Worker",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId",
            "workerGroup",
            "workerId"
          ],
          "category": "Workers",
          "description": "Remove an existing worker.  The precise behavior of this method depends\non the provider implementing the given worker.  Some providers\ndo not support removing workers at all, and will return a 400 error.\nOthers may begin removing the worker, but it may remain available via\nthe API (perhaps even in state RUNNING) afterward.",
          "method": "delete",
          "name": "removeWorker",
          "query": [
          ],
          "route": "/workers/<workerPoolId>/<workerGroup>/<workerId>",
          "scopes": "worker-manager:remove-worker:<workerPoolId>/<workerGroup>/<workerId>",
          "stability": "stable",
          "title": "Remove a Worker",
          "type": "function"
        },
        {
          "args": [
            "workerPoolId"
          ],
          "category": "Workers",
          "description": "Get the list of all the existing workers in a given worker pool.",
          "method": "get",
          "name": "listWorkersForWorkerPool",
          "output": "v1/worker-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/workers/<workerPoolId>",
          "scopes": "worker-manager:list-workers:<workerPoolId>",
          "stability": "stable",
          "title": "Workers in a Worker Pool",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Worker Interface",
          "description": "Register a running worker.  Workers call this method on worker start-up.\n\nThis call both marks the worker as running and returns the credentials\nthe worker will require to perform its work.  The worker must provide\nsome proof of its identity, and that proof varies by provider type.",
          "input": "v1/register-worker-request.json#",
          "method": "post",
          "name": "registerWorker",
          "output": "v1/register-worker-response.json#",
          "query": [
          ],
          "route": "/worker/register",
          "stability": "stable",
          "title": "Register a running worker",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Workers",
          "description": "Reregister a running worker.\n\nThis will generate and return new Taskcluster credentials for the worker\non that instance to use. The credentials will not live longer the\n`registrationTimeout` for that worker. The endpoint will update `terminateAfter`\nfor the worker so that worker-manager does not terminate the instance.",
          "input": "v1/reregister-worker-request.json#",
          "method": "post",
          "name": "reregisterWorker",
          "output": "v1/reregister-worker-response.json#",
          "query": [
          ],
          "route": "/worker/reregister",
          "scopes": "worker-manager:reregister-worker:<workerPoolId>/<workerGroup>/<workerId>",
          "stability": "experimental",
          "title": "Reregister a Worker",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "category": "Worker Metadata",
          "description": "Get a list of all active workers of a workerType.\n\n`listWorkers` allows a response to be filtered by quarantined and non quarantined workers,\nas well as the current state of the worker.\nTo filter the query, you should call the end-point with one of [`quarantined`, `workerState`]\nas a query-string option with a true or false value.\n\nThe response is paged. If this end-point returns a `continuationToken`, you\nshould call the end-point again with the `continuationToken` as a query-string\noption. By default this end-point will list up to 1000 workers in a single\npage. You may limit this with the query-string parameter `limit`.",
          "method": "get",
          "name": "listWorkers",
          "output": "v1/list-workers-response.json#",
          "query": [
            "continuationToken",
            "limit",
            "quarantined",
            "workerState"
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>/workers",
          "scopes": "worker-manager:list-workers:<provisionerId>/<workerType>",
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
          "category": "Worker Metadata",
          "description": "Get a worker from a worker-type.",
          "method": "get",
          "name": "getWorker",
          "output": "v1/worker-response.json#",
          "query": [
          ],
          "route": "/provisioners/<provisionerId>/worker-types/<workerType>/workers/<workerGroup>/<workerId>",
          "scopes": "worker-manager:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>",
          "stability": "experimental",
          "title": "Get a worker-type",
          "type": "function"
        },
        {
          "args": [
          ],
          "category": "Monitoring",
          "description": "Respond with a service heartbeat.\n\nThis endpoint is used to check on backing services this service\ndepends on.",
          "method": "get",
          "name": "heartbeat",
          "query": [
          ],
          "route": "/__heartbeat__",
          "stability": "stable",
          "title": "Heartbeat",
          "type": "function"
        }
      ],
      "serviceName": "worker-manager",
      "title": "Worker Manager Service"
    },
    "referenceKind": "api"
  },
  "WorkerManagerEvents": {
    "reference": {
      "$schema": "/schemas/common/exchanges-reference-v0.json#",
      "apiVersion": "v1",
      "description": "These exchanges provide notifications when a worker pool is created or updated.This is so that the provisioner running in a differentprocess at the other end can synchronize to the changes. But you are ofcourse welcome to use these for other purposes, monitoring changes for example.",
      "entries": [
        {
          "description": "Whenever the api receives a request to create aworker pool, a message is posted to this exchange anda provider can act upon it.",
          "exchange": "worker-pool-created",
          "name": "workerPoolCreated",
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
          "schema": "v1/pulse-worker-pool-message.json#",
          "title": "Worker Pool Created Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever the api receives a request to update aworker pool, a message is posted to this exchange anda provider can act upon it.",
          "exchange": "worker-pool-updated",
          "name": "workerPoolUpdated",
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
          "schema": "v1/pulse-worker-pool-message.json#",
          "title": "Worker Pool Updated Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-worker-manager/v1/",
      "serviceName": "worker-manager",
      "title": "Worker Manager Exchanges"
    },
    "referenceKind": "exchanges"
  }
};
