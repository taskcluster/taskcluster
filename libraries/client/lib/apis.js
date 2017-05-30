module.exports = {
  "Auth": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://auth.taskcluster.net/v1",
      "description": "Authentication related API end-points for TaskCluster and related\nservices. These API end-points are of interest if you wish to:\n  * Authorize a request signed with TaskCluster credentials,\n  * Manage clients and roles,\n  * Inspect or audit clients and roles,\n  * Gain access to various services guarded by this API.\n\nNote that in this service \"authentication\" refers to validating the\ncorrectness of the supplied credentials (that the caller posesses the\nappropriate access token). This service does not provide any kind of user\nauthentication (identifying a particular person).\n\n### Clients\nThe authentication service manages _clients_, at a high-level each client\nconsists of a `clientId`, an `accessToken`, scopes, and some metadata.\nThe `clientId` and `accessToken` can be used for authentication when\ncalling TaskCluster APIs.\n\nThe client's scopes control the client's access to TaskCluster resources.\nThe scopes are *expanded* by substituting roles, as defined below.\n\n### Roles\nA _role_ consists of a `roleId`, a set of scopes and a description.\nEach role constitutes a simple _expansion rule_ that says if you have\nthe scope: `assume:<roleId>` you get the set of scopes the role has.\nThink of the `assume:<roleId>` as a scope that allows a client to assume\na role.\n\nAs in scopes the `*` kleene star also have special meaning if it is\nlocated at the end of a `roleId`. If you have a role with the following\n`roleId`: `my-prefix*`, then any client which has a scope staring with\n`assume:my-prefix` will be allowed to assume the role.\n\n### Guarded Services\nThe authentication service also has API end-points for delegating access\nto some guarded service such as AWS S3, or Azure Table Storage.\nGenerally, we add API end-points to this server when we wish to use\nTaskCluster credentials to grant access to a third-party service used\nby many TaskCluster components.",
      "entries": [
        {
          "args": [
          ],
          "description": "Get a list of all clients.  With `prefix`, only clients for which\nit is a prefix of the clientId are returned.",
          "method": "get",
          "name": "listClients",
          "output": "http://schemas.taskcluster.net/auth/v1/list-clients-response.json#",
          "query": [
            "prefix"
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
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
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
          "input": "http://schemas.taskcluster.net/auth/v1/create-client-request.json#",
          "method": "put",
          "name": "createClient",
          "output": "http://schemas.taskcluster.net/auth/v1/create-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>",
          "scopes": [
            [
              "auth:create-client:<clientId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/create-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>/reset",
          "scopes": [
            [
              "auth:reset-access-token:<clientId>"
            ]
          ],
          "stability": "stable",
          "title": "Reset `accessToken`",
          "type": "function"
        },
        {
          "args": [
            "clientId"
          ],
          "description": "Update an exisiting client. The `clientId` and `accessToken` cannot be\nupdated, but `scopes` can be modified.  The caller's scopes must\nsatisfy all scopes being added to the client in the update operation.\nIf no scopes are given in the request, the client's scopes remain\nunchanged",
          "input": "http://schemas.taskcluster.net/auth/v1/create-client-request.json#",
          "method": "post",
          "name": "updateClient",
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>",
          "scopes": [
            [
              "auth:update-client:<clientId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>/enable",
          "scopes": [
            [
              "auth:enable-client:<clientId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/get-client-response.json#",
          "query": [
          ],
          "route": "/clients/<clientId>/disable",
          "scopes": [
            [
              "auth:disable-client:<clientId>"
            ]
          ],
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
          "scopes": [
            [
              "auth:delete-client:<clientId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/list-roles-response.json#",
          "query": [
          ],
          "route": "/roles/",
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
          "output": "http://schemas.taskcluster.net/auth/v1/get-role-response.json#",
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
          "description": "Create a new role.\n\nThe caller's scopes must satisfy the new role's scopes.\n\nIf there already exists a role with the same `roleId` this operation\nwill fail. Use `updateRole` to modify an existing role.",
          "input": "http://schemas.taskcluster.net/auth/v1/create-role-request.json#",
          "method": "put",
          "name": "createRole",
          "output": "http://schemas.taskcluster.net/auth/v1/get-role-response.json#",
          "query": [
          ],
          "route": "/roles/<roleId>",
          "scopes": [
            [
              "auth:create-role:<roleId>"
            ]
          ],
          "stability": "stable",
          "title": "Create Role",
          "type": "function"
        },
        {
          "args": [
            "roleId"
          ],
          "description": "Update an existing role.\n\nThe caller's scopes must satisfy all of the new scopes being added, but\nneed not satisfy all of the client's existing scopes.",
          "input": "http://schemas.taskcluster.net/auth/v1/create-role-request.json#",
          "method": "post",
          "name": "updateRole",
          "output": "http://schemas.taskcluster.net/auth/v1/get-role-response.json#",
          "query": [
          ],
          "route": "/roles/<roleId>",
          "scopes": [
            [
              "auth:update-role:<roleId>"
            ]
          ],
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
          "scopes": [
            [
              "auth:delete-role:<roleId>"
            ]
          ],
          "stability": "stable",
          "title": "Delete Role",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Return an expanded copy of the given scopeset, with scopes implied by any\nroles included.",
          "input": "http://schemas.taskcluster.net/auth/v1/scopeset.json#",
          "method": "get",
          "name": "expandScopes",
          "output": "http://schemas.taskcluster.net/auth/v1/scopeset.json#",
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
          "output": "http://schemas.taskcluster.net/auth/v1/scopeset.json#",
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
          "description": "Get temporary AWS credentials for `read-write` or `read-only` access to\na given `bucket` and `prefix` within that bucket.\nThe `level` parameter can be `read-write` or `read-only` and determines\nwhich type of credentials are returned. Please note that the `level`\nparameter is required in the scope guarding access.  The bucket name must\nnot contain `.`, as recommended by Amazon.\n\nThis method can only allow access to a whitelisted set of buckets.  To add\na bucket to that whitelist, contact the TaskCluster team, who will add it to\nthe appropriate IAM policy.  If the bucket is in a different AWS account, you\nwill also need to add a bucket policy allowing access from the TaskCluster\naccount.  That policy should look like this:\n\n```js\n{\n  \"Version\": \"2012-10-17\",\n  \"Statement\": [\n    {\n      \"Sid\": \"allow-taskcluster-auth-to-delegate-access\",\n      \"Effect\": \"Allow\",\n      \"Principal\": {\n        \"AWS\": \"arn:aws:iam::692406183521:root\"\n      },\n      \"Action\": [\n        \"s3:ListBucket\",\n        \"s3:GetObject\",\n        \"s3:PutObject\",\n        \"s3:DeleteObject\",\n        \"s3:GetBucketLocation\"\n      ],\n      \"Resource\": [\n        \"arn:aws:s3:::<bucket>\",\n        \"arn:aws:s3:::<bucket>/*\"\n      ]\n    }\n  ]\n}\n```\n\nThe credentials are set to expire after an hour, but this behavior is\nsubject to change. Hence, you should always read the `expires` property\nfrom the response, if you intend to maintain active credentials in your\napplication.\n\nPlease note that your `prefix` may not start with slash `/`. Such a prefix\nis allowed on S3, but we forbid it here to discourage bad behavior.\n\nAlso note that if your `prefix` doesn't end in a slash `/`, the STS\ncredentials may allow access to unexpected keys, as S3 does not treat\nslashes specially.  For example, a prefix of `my-folder` will allow\naccess to `my-folder/file.txt` as expected, but also to `my-folder.txt`,\nwhich may not be intended.\n\nFinally, note that the `PutObjectAcl` call is not allowed.  Passing a canned\nACL other than `private` to `PutObject` is treated as a `PutObjectAcl` call, and\nwill result in an access-denied error from AWS.  This limitation is due to a\nsecurity flaw in Amazon S3 which might otherwise allow indefinite access to\nuploaded objects.\n\n**EC2 metadata compatibility**, if the querystring parameter\n`?format=iam-role-compat` is given, the response will be compatible\nwith the JSON exposed by the EC2 metadata service. This aims to ease\ncompatibility for libraries and tools built to auto-refresh credentials.\nFor details on the format returned by EC2 metadata service see:\n[EC2 User Guide](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#instance-metadata-security-credentials).",
          "method": "get",
          "name": "awsS3Credentials",
          "output": "http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#",
          "query": [
            "format"
          ],
          "route": "/aws/s3/<level>/<bucket>/<prefix>",
          "scopes": [
            [
              "auth:aws-s3:<level>:<bucket>/<prefix>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/azure-account-list-response.json#",
          "query": [
          ],
          "route": "/azure/accounts",
          "scopes": [
            [
              "auth:azure-table:list-accounts"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/azure-table-list-response.json#",
          "query": [
            "continuationToken"
          ],
          "route": "/azure/<account>/tables",
          "scopes": [
            [
              "auth:azure-table:list-tables:<account>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#",
          "query": [
          ],
          "route": "/azure/<account>/table/<table>/<level>",
          "scopes": [
            [
              "auth:azure-table:<level>:<account>/<table>"
            ]
          ],
          "stability": "stable",
          "title": "Get Shared-Access-Signature for Azure Table",
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
          "name": "azureBlobSAS",
          "output": "http://schemas.taskcluster.net/auth/v1/azure-blob-response.json#",
          "query": [
          ],
          "route": "/azure/<account>/containers/<container>/<level>",
          "scopes": [
            [
              "auth:azure-blob:<level>:<account>/<container>"
            ]
          ],
          "stability": "stable",
          "title": "Get Shared-Access-Signature for Azure Blob",
          "type": "function"
        },
        {
          "args": [
            "project"
          ],
          "description": "Get temporary DSN (access credentials) for a sentry project.\nThe credentials returned can be used with any Sentry client for up to\n24 hours, after which the credentials will be automatically disabled.\n\nIf the project doesn't exist it will be created, and assigned to the\ninitial team configured for this component. Contact a Sentry admin\nto have the project transferred to a team you have access to if needed",
          "method": "get",
          "name": "sentryDSN",
          "output": "http://schemas.taskcluster.net/auth/v1/sentry-dsn-response.json#",
          "query": [
          ],
          "route": "/sentry/<project>/dsn",
          "scopes": [
            [
              "auth:sentry:<project>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/auth/v1/statsum-token-response.json#",
          "query": [
          ],
          "route": "/statsum/<project>/token",
          "scopes": [
            [
              "auth:statsum:<project>"
            ]
          ],
          "stability": "stable",
          "title": "Get Token for Statsum Project",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Validate the request signature given on input and return list of scopes\nthat the authenticating client has.\n\nThis method is used by other services that wish rely on TaskCluster\ncredentials for authentication. This way we can use Hawk without having\nthe secret credentials leave this service.",
          "input": "http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#",
          "method": "post",
          "name": "authenticateHawk",
          "output": "http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#",
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
          "description": "Utility method to test client implementations of TaskCluster\nauthentication.\n\nRather than using real credentials, this endpoint accepts requests with\nclientId `tester` and accessToken `no-secret`. That client's scopes are\nbased on `clientScopes` in the request body.\n\nThe request is validated, with any certificate, authorizedScopes, etc.\napplied, and the resulting scopes are checked against `requiredScopes`\nfrom the request body. On success, the response contains the clientId\nand scopes as seen by the API method.",
          "input": "http://schemas.taskcluster.net/auth/v1/test-authenticate-request.json#",
          "method": "post",
          "name": "testAuthenticate",
          "output": "http://schemas.taskcluster.net/auth/v1/test-authenticate-response.json#",
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
          "output": "http://schemas.taskcluster.net/auth/v1/test-authenticate-response.json#",
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
      "title": "Authentication API",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/auth/v1/api.json"
  },
  "AuthEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The auth service, typically available at `auth.taskcluster.net`\nis responsible for storing credentials, managing assignment of scopes,\nand validation of request signatures from other services.\n\nThese exchanges provides notifications when credentials or roles are\nupdated. This is mostly so that multiple instances of the auth service\ncan purge their caches and synchronize state. But you are of course\nwelcome to use these for other purposes, monitoring changes for example.",
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
          "schema": "http://schemas.taskcluster.net/auth/v1/client-message.json#",
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
          "schema": "http://schemas.taskcluster.net/auth/v1/client-message.json#",
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
          "schema": "http://schemas.taskcluster.net/auth/v1/client-message.json#",
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
          "schema": "http://schemas.taskcluster.net/auth/v1/role-message.json#",
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
          "schema": "http://schemas.taskcluster.net/auth/v1/role-message.json#",
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
          "schema": "http://schemas.taskcluster.net/auth/v1/role-message.json#",
          "title": "Role Deleted Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-auth/v1/",
      "title": "Auth Pulse Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/auth/v1/exchanges.json"
  },
  "AwsProvisioner": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://aws-provisioner.taskcluster.net/v1",
      "description": "The AWS Provisioner is responsible for provisioning instances on EC2 for use in\nTaskCluster.  The provisioner maintains a set of worker configurations which\ncan be managed with an API that is typically available at\naws-provisioner.taskcluster.net/v1.  This API can also perform basic instance\nmanagement tasks in addition to maintaining the internal state of worker type\nconfiguration information.\n\nThe Provisioner runs at a configurable interval.  Each iteration of the\nprovisioner fetches a current copy the state that the AWS EC2 api reports.  In\neach iteration, we ask the Queue how many tasks are pending for that worker\ntype.  Based on the number of tasks pending and the scaling ratio, we may\nsubmit requests for new instances.  We use pricing information, capacity and\nutility factor information to decide which instance type in which region would\nbe the optimal configuration.\n\nEach EC2 instance type will declare a capacity and utility factor.  Capacity is\nthe number of tasks that a given machine is capable of running concurrently.\nUtility factor is a relative measure of performance between two instance types.\nWe multiply the utility factor by the spot price to compare instance types and\nregions when making the bidding choices.\n\nWhen a new EC2 instance is instantiated, its user data contains a token in\n`securityToken` that can be used with the `getSecret` method to retrieve\nthe worker's credentials and any needed passwords or other restricted\ninformation.  The worker is responsible for deleting the secret after\nretrieving it, to prevent dissemination of the secret to other proceses\nwhich can read the instance user data.\n",
      "entries": [
        {
          "args": [
          ],
          "description": "Return a list of worker types, including some summary information about\ncurrent capacity for each.  While this list includes all defined worker types,\nthere may be running EC2 instances for deleted worker types that are not\nincluded here.  The list is unordered.",
          "method": "get",
          "name": "listWorkerTypeSummaries",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/list-worker-types-summaries-response.json#",
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
          "input": "http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#",
          "method": "put",
          "name": "createWorkerType",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>",
          "scopes": [
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
          "stability": "stable",
          "title": "Create new Worker Type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Provide a new copy of a worker type to replace the existing one.\nThis will overwrite the existing worker type definition if there\nis already a worker type of that name.  This method will return a\n200 response along with a copy of the worker type definition created\nNote that if you are using the result of a GET on the worker-type\nend point that you will need to delete the lastModified and workerType\nkeys from the object returned, since those fields are not allowed\nthe request body for this method\n\nOtherwise, all input requirements and actions are the same as the\ncreate method.",
          "input": "http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#",
          "method": "post",
          "name": "updateWorkerType",
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>/update",
          "scopes": [
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-last-modified.json#",
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
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>",
          "scopes": [
            [
              "aws-provisioner:view-worker-type:<workerType>"
            ],
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
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
          "scopes": [
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/list-worker-types-response.json#",
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
          "input": "http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#",
          "method": "put",
          "name": "createSecret",
          "query": [
          ],
          "route": "/secret/<token>",
          "scopes": [
            [
              "aws-provisioner:create-secret"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#",
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
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/get-launch-specs-response.json#",
          "query": [
          ],
          "route": "/worker-type/<workerType>/launch-specifications",
          "scopes": [
            [
              "aws-provisioner:view-worker-type:<workerType>"
            ],
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
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
          "scopes": [
            [
              "aws-provisioner:view-worker-type:<workerType>"
            ],
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
          "stability": "stable",
          "title": "Get AWS State for a worker type",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "Return the state of a given workertype as stored by the provisioner. \nThis state is stored as three lists: 1 for running instances, 1 for\npending requests.  The `summary` property contains an updated summary\nsimilar to that returned from `listWorkerTypeSummaries`.",
          "method": "get",
          "name": "newState",
          "query": [
          ],
          "route": "/new-state/<workerType>",
          "scopes": [
            [
              "aws-provisioner:view-worker-type:<workerType>"
            ],
            [
              "aws-provisioner:manage-worker-type:<workerType>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/aws-provisioner/v1/backend-status-response.json#",
          "query": [
          ],
          "route": "/backend-status",
          "stability": "experimental",
          "title": "Backend Status",
          "type": "function"
        },
        {
          "args": [
            "workerType"
          ],
          "description": "WARNING: YOU ALMOST CERTAINLY DO NOT WANT TO USE THIS \nShut down every single EC2 instance associated with this workerType. \nThis means every single last one.  You probably don't want to use \nthis method, which is why it has an obnoxious name.  Don't even try \nto claim you didn't know what this method does!\n\n**This API end-point is experimental and may be subject to change without warning.**",
          "method": "post",
          "name": "terminateAllInstancesOfWorkerType",
          "query": [
          ],
          "route": "/worker-type/<workerType>/terminate-all-instances",
          "scopes": [
            [
              "aws-provisioner:terminate-all-worker-type:<workerType>"
            ]
          ],
          "stability": "experimental",
          "title": "Shutdown Every Ec2 Instance of this Worker Type",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "WARNING: YOU ALMOST CERTAINLY DO NOT WANT TO USE THIS \nShut down every single EC2 instance managed by this provisioner. \nThis means every single last one.  You probably don't want to use \nthis method, which is why it has an obnoxious name.  Don't even try \nto claim you didn't know what this method does!\n\n**This API end-point is experimental and may be subject to change without warning.**",
          "method": "post",
          "name": "shutdownEverySingleEc2InstanceManagedByThisProvisioner",
          "query": [
          ],
          "route": "/shutdown/every/single/ec2/instance/managed/by/this/provisioner",
          "scopes": [
            [
              "aws-provisioner:terminate-all-worker-type:*"
            ]
          ],
          "stability": "experimental",
          "title": "Shutdown Every Single Ec2 Instance Managed By This Provisioner",
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
      "title": "AWS Provisioner API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/aws-provisioner/v1/api.json"
  },
  "AwsProvisionerEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "Exchanges from the provisioner... more docs later",
      "entries": [
        {
          "description": "When a new `workerType` is created a message will be published to this\nexchange.",
          "exchange": "worker-type-created",
          "name": "workerTypeCreated",
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
              "name": "workerType",
              "required": true,
              "summary": "WorkerType that this message concerns."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/aws-provisioner/v1/worker-type-message.json#",
          "title": "WorkerType Created Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a `workerType` is updated a message will be published to this\nexchange.",
          "exchange": "worker-type-updated",
          "name": "workerTypeUpdated",
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
              "name": "workerType",
              "required": true,
              "summary": "WorkerType that this message concerns."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/aws-provisioner/v1/worker-type-message.json#",
          "title": "WorkerType Updated Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a `workerType` is removed a message will be published to this\nexchange.",
          "exchange": "worker-type-removed",
          "name": "workerTypeRemoved",
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
              "name": "workerType",
              "required": true,
              "summary": "WorkerType that this message concerns."
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/aws-provisioner/v1/worker-type-message.json#",
          "title": "WorkerType Removed Message",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-aws-provisioner/v1/",
      "title": "AWS Provisioner Pulse Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/aws-provisioner/v1/exchanges.json"
  },
  "Github": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://github.taskcluster.net/v1",
      "description": "The github service, typically available at\n`github.taskcluster.net`, is responsible for publishing pulse\nmessages in response to GitHub events.\n\nThis document describes the API end-point for consuming GitHub\nweb hooks",
      "entries": [
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
          "output": "http://schemas.taskcluster.net/github/v1/build-list.json#",
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
          "output": "http://schemas.taskcluster.net/github/v1/repository.json",
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
          "input": "http://schemas.taskcluster.net/github/v1/create-status.json",
          "method": "post",
          "name": "createStatus",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/statuses/<sha>",
          "scopes": [
            [
              "github:create-status:<owner>/<repo>"
            ]
          ],
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
          "input": "http://schemas.taskcluster.net/github/v1/create-comment.json",
          "method": "post",
          "name": "createComment",
          "query": [
          ],
          "route": "/repository/<owner>/<repo>/issues/<number>/comments",
          "scopes": [
            [
              "github:create-comment:<owner>/<repo>"
            ]
          ],
          "stability": "experimental",
          "title": "Post a comment on a given GitHub Issue or Pull Request",
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
      "title": "TaskCluster GitHub API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/github/v1/api.json"
  },
  "GithubEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The github service, typically available at\n`github.taskcluster.net`, is responsible for publishing a pulse\nmessage for supported github events.\n\nThis document describes the exchange offered by the taskcluster\ngithub service",
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
          "schema": "http://schemas.taskcluster.net/github/v1/github-pull-request-message.json#",
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
          "schema": "http://schemas.taskcluster.net/github/v1/github-push-message.json#",
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
          "schema": "http://schemas.taskcluster.net/github/v1/github-release-message.json#",
          "title": "GitHub release Event",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-github/v1/",
      "title": "TaskCluster-Github Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/github/v1/exchanges.json"
  },
  "Hooks": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://hooks.taskcluster.net/v1",
      "description": "Hooks are a mechanism for creating tasks in response to events.\n\nHooks are identified with a `hookGroupId` and a `hookId`.\n\nWhen an event occurs, the resulting task is automatically created.  The\ntask is created using the scope `assume:hook-id:<hookGroupId>/<hookId>`,\nwhich must have scopes to make the createTask call, including satisfying all\nscopes in `task.scopes`.  The new task has a `taskGroupId` equal to its\n`taskId`, as is the convention for decision tasks.\n\nHooks can have a \"schedule\" indicating specific times that new tasks should\nbe created.  Each schedule is in a simple cron format, per \nhttps://www.npmjs.com/package/cron-parser.  For example:\n * `['0 0 1 * * *']` -- daily at 1:00 UTC\n * `['0 0 9,21 * * 1-5', '0 0 12 * * 0,6']` -- weekdays at 9:00 and 21:00 UTC, weekends at noon",
      "entries": [
        {
          "args": [
          ],
          "description": "This endpoint will return a list of all hook groups with at least one hook.",
          "method": "get",
          "name": "listHookGroups",
          "output": "http://schemas.taskcluster.net/hooks/v1/list-hook-groups-response.json",
          "query": [
          ],
          "route": "/hooks",
          "stability": "experimental",
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
          "output": "http://schemas.taskcluster.net/hooks/v1/list-hooks-response.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>",
          "stability": "experimental",
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
          "output": "http://schemas.taskcluster.net/hooks/v1/hook-definition.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "stability": "experimental",
          "title": "Get hook definition",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will return the current status of the hook.  This represents a\nsnapshot in time and may vary from one call to the next.",
          "method": "get",
          "name": "getHookStatus",
          "output": "http://schemas.taskcluster.net/hooks/v1/hook-status.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/status",
          "stability": "experimental",
          "title": "Get hook status",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will return the schedule and next scheduled creation time\nfor the given hook.",
          "method": "get",
          "name": "getHookSchedule",
          "output": "http://schemas.taskcluster.net/hooks/v1/hook-schedule.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/schedule",
          "stability": "deprecated",
          "title": "Get hook schedule",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will create a new hook.\n\nThe caller's credentials must include the role that will be used to\ncreate the task.  That role must satisfy task.scopes as well as the\nnecessary scopes to add the task to the queue.\n",
          "input": "http://schemas.taskcluster.net/hooks/v1/create-hook-request.json",
          "method": "put",
          "name": "createHook",
          "output": "http://schemas.taskcluster.net/hooks/v1/hook-definition.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "scopes": [
            [
              "hooks:modify-hook:<hookGroupId>/<hookId>",
              "assume:hook-id:<hookGroupId>/<hookId>"
            ]
          ],
          "stability": "experimental",
          "title": "Create a hook",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will update an existing hook.  All fields except\n`hookGroupId` and `hookId` can be modified.",
          "input": "http://schemas.taskcluster.net/hooks/v1/create-hook-request.json",
          "method": "post",
          "name": "updateHook",
          "output": "http://schemas.taskcluster.net/hooks/v1/hook-definition.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>",
          "scopes": [
            [
              "hooks:modify-hook:<hookGroupId>/<hookId>",
              "assume:hook-id:<hookGroupId>/<hookId>"
            ]
          ],
          "stability": "experimental",
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
          "scopes": [
            [
              "hooks:modify-hook:<hookGroupId>/<hookId>"
            ]
          ],
          "stability": "experimental",
          "title": "Delete a hook",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId"
          ],
          "description": "This endpoint will trigger the creation of a task from a hook definition.",
          "input": "http://schemas.taskcluster.net/hooks/v1/trigger-payload.json",
          "method": "post",
          "name": "triggerHook",
          "output": "http://schemas.taskcluster.net/hooks/v1/task-status.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/trigger",
          "scopes": [
            [
              "hooks:trigger-hook:<hookGroupId>/<hookId>"
            ]
          ],
          "stability": "experimental",
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
          "output": "http://schemas.taskcluster.net/hooks/v1/trigger-token-response.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/token",
          "scopes": [
            [
              "hooks:get-trigger-token:<hookGroupId>/<hookId>"
            ]
          ],
          "stability": "experimental",
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
          "output": "http://schemas.taskcluster.net/hooks/v1/trigger-token-response.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/token",
          "scopes": [
            [
              "hooks:reset-trigger-token:<hookGroupId>/<hookId>"
            ]
          ],
          "stability": "experimental",
          "title": "Reset a trigger token",
          "type": "function"
        },
        {
          "args": [
            "hookGroupId",
            "hookId",
            "token"
          ],
          "description": "This endpoint triggers a defined hook with a valid token.",
          "input": "http://schemas.taskcluster.net/hooks/v1/trigger-payload.json",
          "method": "post",
          "name": "triggerHookWithToken",
          "output": "http://schemas.taskcluster.net/hooks/v1/task-status.json",
          "query": [
          ],
          "route": "/hooks/<hookGroupId>/<hookId>/trigger/<token>",
          "stability": "experimental",
          "title": "Trigger a hook with a token",
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
      "title": "Hooks API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/hooks/v1/api.json"
  },
  "Index": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://index.taskcluster.net/v1",
      "description": "The task index, typically available at `index.taskcluster.net`, is\nresponsible for indexing tasks. The service ensures that tasks can be\nlocated by recency and/or arbitrary strings. Common use-cases include:\n\n * Locate tasks by git or mercurial `<revision>`, or\n * Locate latest task from given `<branch>`, such as a release.\n\n**Index hierarchy**, tasks are indexed in a dot (`.`) separated hierarchy\ncalled a namespace. For example a task could be indexed with the index path\n`some-app.<revision>.linux-64.release-build`. In this case the following\nnamespaces is created.\n\n 1. `some-app`,\n 1. `some-app.<revision>`, and,\n 2. `some-app.<revision>.linux-64`\n\nInside the namespace `some-app.<revision>` you can find the namespace\n`some-app.<revision>.linux-64` inside which you can find the indexed task\n`some-app.<revision>.linux-64.release-build`. This is an example of indexing\nbuilds for a given platform and revision.\n\n**Task Rank**, when a task is indexed, it is assigned a `rank` (defaults\nto `0`). If another task is already indexed in the same namespace with\nlower or equal `rank`, the index for that task will be overwritten. For example\nconsider index path `mozilla-central.linux-64.release-build`. In\nthis case one might choose to use a UNIX timestamp or mercurial revision\nnumber as `rank`. This way the latest completed linux 64 bit release\nbuild is always available at `mozilla-central.linux-64.release-build`.\n\nNote that this does mean index paths are not immutable: the same path may\npoint to a different task now than it did a moment ago.\n\n**Indexed Data**, when a task is retrieved from the index the result includes\na `taskId` and an additional user-defined JSON blob that was indexed with\nthe task.\n\n**Entry Expiration**, all indexed entries must have an expiration date.\nTypically this defaults to one year, if not specified. If you are\nindexing tasks to make it easy to find artifacts, consider using the\nartifact's expiration date.\n\n**Valid Characters**, all keys in a namespace `<key1>.<key2>` must be\nin the form `/[a-zA-Z0-9_!~*'()%-]+/`. Observe that this is URL-safe and\nthat if you strictly want to put another character you can URL encode it.\n\n**Indexing Routes**, tasks can be indexed using the API below, but the\nmost common way to index tasks is adding a custom route to `task.routes` of the\nform `index.<namespace>`. In order to add this route to a task you'll\nneed the scope `queue:route:index.<namespace>`. When a task has\nthis route, it will be indexed when the task is **completed successfully**.\nThe task will be indexed with `rank`, `data` and `expires` as specified\nin `task.extra.index`. See the example below:\n\n```js\n{\n  payload:  { /* ... */ },\n  routes: [\n    // index.<namespace> prefixed routes, tasks CC'ed such a route will\n    // be indexed under the given <namespace>\n    \"index.mozilla-central.linux-64.release-build\",\n    \"index.<revision>.linux-64.release-build\"\n  ],\n  extra: {\n    // Optional details for indexing service\n    index: {\n      // Ordering, this taskId will overwrite any thing that has\n      // rank <= 4000 (defaults to zero)\n      rank:       4000,\n\n      // Specify when the entries expire (Defaults to 1 year)\n      expires:          new Date().toJSON(),\n\n      // A little informal data to store along with taskId\n      // (less 16 kb when encoded as JSON)\n      data: {\n        hgRevision:   \"...\",\n        commitMessae: \"...\",\n        whatever...\n      }\n    },\n    // Extra properties for other services...\n  }\n  // Other task properties...\n}\n```\n\n**Remark**, when indexing tasks using custom routes, it's also possible\nto listen for messages about these tasks. For\nexample one could bind to `route.index.some-app.*.release-build`,\nand pick up all messages about release builds. Hence, it is a\ngood idea to document task index hierarchies, as these make up extension\npoints in their own.",
      "entries": [
        {
          "args": [
            "indexPath"
          ],
          "description": "Find a task by index path, returning the highest-rank task with that path. If no\ntask exists for the given path, this API end-point will respond with a 404 status.",
          "method": "get",
          "name": "findTask",
          "output": "http://schemas.taskcluster.net/index/v1/indexed-task-response.json#",
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
          "input": "http://schemas.taskcluster.net/index/v1/list-namespaces-request.json#",
          "method": "post",
          "name": "listNamespaces",
          "output": "http://schemas.taskcluster.net/index/v1/list-namespaces-response.json#",
          "query": [
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
          "input": "http://schemas.taskcluster.net/index/v1/list-tasks-request.json#",
          "method": "post",
          "name": "listTasks",
          "output": "http://schemas.taskcluster.net/index/v1/list-tasks-response.json#",
          "query": [
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
          "input": "http://schemas.taskcluster.net/index/v1/insert-task-request.json#",
          "method": "put",
          "name": "insertTask",
          "output": "http://schemas.taskcluster.net/index/v1/indexed-task-response.json#",
          "query": [
          ],
          "route": "/task/<namespace>",
          "scopes": [
            [
              "index:insert-task:<namespace>"
            ]
          ],
          "stability": "stable",
          "title": "Insert Task into Index",
          "type": "function"
        },
        {
          "args": [
            "indexPath",
            "name"
          ],
          "description": "Find a task by index path and redirect to the artifact on the most recent\nrun with the given `name`.\n\nNote that multiple calls to this endpoint may return artifacts from differen tasks\nif a new task is inserted into the index between calls. Avoid using this method as\na stable link to multiple, connected files if the index path does not contain a\nunique identifier.  For example, the following two links may return unrelated files:\n* https://index.taskcluster.net/task/some-app.win64.latest.installer/artifacts/public/installer.exe`\n* https://index.taskcluster.net/task/some-app.win64.latest.installer/artifacts/public/debug-symbols.zip`\n\nThis problem be remedied by including the revision in the index path or by bundling both\ninstaller and debug symbols into a single artifact.\n\nIf no task exists for the given index path, this API end-point responds with 404.",
          "method": "get",
          "name": "findArtifactFromTask",
          "query": [
          ],
          "route": "/task/<indexPath>/artifacts/<name>",
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ],
          "stability": "stable",
          "title": "Get Artifact From Indexed Task",
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
      "title": "Task Index API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/index/v1/api.json"
  },
  "Login": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://login.taskcluster.net/v1",
      "description": "The Login service serves as the interface between external authentication\nsystems and TaskCluster credentials.  It acts as the server side of\nhttps://tools.taskcluster.net.  If you are working on federating logins\nwith TaskCluster, this is probably *not* the service you are looking for.\nInstead, use the federated login support in the tools site.",
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
        }
      ],
      "title": "Login API",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/login/v1/api.json"
  },
  "Notify": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://notify.taskcluster.net/v1",
      "description": "The notification service, typically available at `notify.taskcluster.net`\nlistens for tasks with associated notifications and handles requests to\nsend emails and post pulse messages.",
      "entries": [
        {
          "args": [
          ],
          "description": "Send an email to `address`. The content is markdown and will be rendered\nto HTML, but both the HTML and raw markdown text will be sent in the\nemail. If a link is included, it will be rendered to a nice button in the\nHTML version of the email",
          "input": "http://schemas.taskcluster.net/notify/v1/email-request.json",
          "method": "post",
          "name": "email",
          "query": [
          ],
          "route": "/email",
          "scopes": [
            [
              "notify:email:<address>"
            ]
          ],
          "stability": "experimental",
          "title": "Send an Email",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Publish a message on pulse with the given `routingKey`.",
          "input": "http://schemas.taskcluster.net/notify/v1/pulse-request.json",
          "method": "post",
          "name": "pulse",
          "query": [
          ],
          "route": "/pulse",
          "scopes": [
            [
              "notify:pulse:<routingKey>"
            ]
          ],
          "stability": "experimental",
          "title": "Publish a Pulse Message",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Post a message on IRC to a specific channel or user, or a specific user\non a specific channel.\n\nSuccess of this API method does not imply the message was successfully\nposted. This API method merely inserts the IRC message into a queue\nthat will be processed by a background process.\nThis allows us to re-send the message in face of connection issues.\n\nHowever, if the user isn't online the message will be dropped without\nerror. We maybe improve this behavior in the future. For now just keep\nin mind that IRC is a best-effort service.",
          "input": "http://schemas.taskcluster.net/notify/v1/irc-request.json",
          "method": "post",
          "name": "irc",
          "query": [
          ],
          "route": "/irc",
          "scopes": [
            [
              "notify:irc-channel:<channel>",
              "notify:irc-user:<user>"
            ]
          ],
          "stability": "experimental",
          "title": "Post IRC Message",
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
      "title": "Notification Service",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/notify/v1/api.json"
  },
  "Pulse": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://pulse.taskcluster.net/v1",
      "description": "The taskcluster-pulse service, typically available at `pulse.taskcluster.net`\nmanages pulse credentials for taskcluster users.\n\nA service to manage Pulse credentials for anything using\nTaskcluster credentials. This allows for self-service pulse\naccess and greater control within the Taskcluster project.",
      "entries": [
        {
          "args": [
          ],
          "description": "Get an overview of the Rabbit cluster.",
          "method": "get",
          "name": "overview",
          "output": "http://schemas.taskcluster.net/pulse/v1/rabbit-overview.json",
          "query": [
          ],
          "route": "/overview",
          "stability": "experimental",
          "title": "Rabbit Overview",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "List the namespaces managed by this service.\n\nThis will list up to 1000 namespaces. If more namespaces are present a\n`continuationToken` will be returned, which can be given in the next\nrequest. For the initial request, do not provide continuation.",
          "method": "get",
          "name": "listNamespaces",
          "output": "http://schemas.taskcluster.net/pulse/v1/list-namespaces-response.json",
          "query": [
            "limit",
            "continuation"
          ],
          "route": "/namespaces",
          "stability": "experimental",
          "title": "List Namespaces",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "Get public information about a single namespace. This is the same information\nas returned by `listNamespaces`.",
          "method": "get",
          "name": "namespace",
          "output": "http://schemas.taskcluster.net/pulse/v1/namespace.json",
          "query": [
          ],
          "route": "/namespace/<namespace>",
          "stability": "experimental",
          "title": "Get a namespace",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "Claim a namespace, returning a username and password with access to that\nnamespace good for a short time.  Clients should call this endpoint again\nat the re-claim time given in the response, as the password will be rotated\nsoon after that time.  The namespace will expire, and any associated queues\nand exchanges will be deleted, at the given expiration time.\n\nThe `expires` and `contact` properties can be updated at any time in a reclaim\noperation.",
          "input": "http://schemas.taskcluster.net/pulse/v1/namespace-request.json",
          "method": "post",
          "name": "claimNamespace",
          "output": "http://schemas.taskcluster.net/pulse/v1/namespace-response.json",
          "query": [
          ],
          "route": "/namespace/<namespace>",
          "scopes": [
            [
              "pulse:namespace:<namespace>"
            ]
          ],
          "stability": "experimental",
          "title": "Claim a namespace",
          "type": "function"
        },
        {
          "args": [
            "namespace"
          ],
          "description": "Immediately delete the given namespace.  This will delete all exchanges and queues which the\nnamespace had configure access to, as if it had just expired.",
          "method": "delete",
          "name": "deleteNamespace",
          "query": [
          ],
          "route": "/namespace/<namespace>",
          "scopes": [
            [
              "pulse:namespace:<namespace>"
            ]
          ],
          "stability": "experimental",
          "title": "Delete a namespace",
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
      "title": "Pulse Management Service",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/pulse/v1/api.json"
  },
  "PurgeCache": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://purge-cache.taskcluster.net/v1",
      "description": "The purge-cache service, typically available at\n`purge-cache.taskcluster.net`, is responsible for publishing a pulse\nmessage for workers, so they can purge cache upon request.\n\nThis document describes the API end-point for publishing the pulse\nmessage. This is mainly intended to be used by tools.",
      "entries": [
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Publish a purge-cache message to purge caches named `cacheName` with\n`provisionerId` and `workerType` in the routing-key. Workers should\nbe listening for this message and purge caches when they see it.",
          "input": "http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request.json#",
          "method": "post",
          "name": "purgeCache",
          "query": [
          ],
          "route": "/purge-cache/<provisionerId>/<workerType>",
          "scopes": [
            [
              "purge-cache:<provisionerId>/<workerType>:<cacheName>"
            ]
          ],
          "stability": "experimental",
          "title": "Purge Worker Cache",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "This is useful mostly for administors to view\nthe set of open purge requests. It should not\nbe used by workers. They should use the purgeRequests\nendpoint that is specific to their workerType and\nprovisionerId.",
          "method": "get",
          "name": "allPurgeRequests",
          "output": "http://schemas.taskcluster.net/purge-cache/v1/all-purge-cache-request-list.json#",
          "query": [
            "continuationToken",
            "limit"
          ],
          "route": "/purge-cache/list",
          "stability": "experimental",
          "title": "All Open Purge Requests",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "List of caches that need to be purged if they are from before\na certain time. This is safe to be used in automation from\nworkers.",
          "method": "get",
          "name": "purgeRequests",
          "output": "http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request-list.json#",
          "query": [
            "since"
          ],
          "route": "/purge-cache/<provisionerId>/<workerType>",
          "stability": "experimental",
          "title": "Open Purge Requests for a provisionerId/workerType pair",
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
      "title": "Purge Cache API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/purge-cache/v1/api.json"
  },
  "PurgeCacheEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The purge-cache service, typically available at\n`purge-cache.taskcluster.net`, is responsible for publishing a pulse\nmessage for workers, so they can purge cache upon request.\n\nThis document describes the exchange offered for workers by the\ncache-purge service.",
      "entries": [
        {
          "description": "When a cache purge is requested  a message will be posted on this\nexchange with designated `provisionerId` and `workerType` in the\nrouting-key and the name of the `cacheFolder` as payload",
          "exchange": "purge-cache",
          "name": "purgeCache",
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
              "name": "provisionerId",
              "required": true,
              "summary": "`provisionerId` under which to purge cache."
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": true,
              "summary": "`workerType` for which to purge cache."
            }
          ],
          "schema": "http://schemas.taskcluster.net/purge-cache/v1/purge-cache-message.json#",
          "title": "Purge Cache Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-purge-cache/v1/",
      "title": "Purge-Cache Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/purge-cache/v1/exchanges.json"
  },
  "Queue": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://queue.taskcluster.net/v1",
      "description": "The queue, typically available at `queue.taskcluster.net`, is responsible\nfor accepting tasks and track their state as they are executed by\nworkers. In order ensure they are eventually resolved.\n\nThis document describes the API end-points offered by the queue. These \nend-points targets the following audience:\n * Schedulers, who create tasks to be executed,\n * Workers, who execute tasks, and\n * Tools, that wants to inspect the state of a task.",
      "entries": [
        {
          "args": [
            "taskId"
          ],
          "description": "This end-point will return the task-definition. Notice that the task\ndefinition may have been modified by queue, if an optional property is\nnot specified the queue may provide a default value.",
          "method": "get",
          "name": "task",
          "output": "http://schemas.taskcluster.net/queue/v1/task.json#",
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
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
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
          "output": "http://schemas.taskcluster.net/queue/v1/list-task-group-response.json#",
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
          "output": "http://schemas.taskcluster.net/queue/v1/list-dependent-tasks-response.json#",
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
          "description": "Create a new task, this is an **idempotent** operation, so repeat it if\nyou get an internal server error or network connection is dropped.\n\n**Task `deadline´**, the deadline property can be no more than 5 days\ninto the future. This is to limit the amount of pending tasks not being\ntaken care of. Ideally, you should use a much shorter deadline.\n\n**Task expiration**, the `expires` property must be greater than the\ntask `deadline`. If not provided it will default to `deadline` + one\nyear. Notice, that artifacts created by task must expire before the task.\n\n**Task specific routing-keys**, using the `task.routes` property you may\ndefine task specific routing-keys. If a task has a task specific \nrouting-key: `<route>`, then when the AMQP message about the task is\npublished, the message will be CC'ed with the routing-key: \n`route.<route>`. This is useful if you want another component to listen\nfor completed tasks you have posted.  The caller must have scope\n`queue:route:<route>` for each route.\n\n**Dependencies**, any tasks referenced in `task.dependencies` must have\nalready been created at the time of this call.\n\n**Important** Any scopes the task requires are also required for creating\nthe task. Please see the Request Payload (Task Definition) for details.",
          "input": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#",
          "method": "put",
          "name": "createTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>",
          "scopes": [
            [
              "queue:create-task:<priority>:<provisionerId>/<workerType>",
              "queue:scheduler-id:<schedulerId>"
            ]
          ],
          "stability": "stable",
          "title": "Create New Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "**Deprecated**, this is the same as `createTask` with a **self-dependency**.\nThis is only present for legacy.",
          "input": "http://schemas.taskcluster.net/queue/v1/create-task-request.json#",
          "method": "post",
          "name": "defineTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/define",
          "scopes": [
            [
              "queue:create-task:<priority>:<provisionerId>/<workerType>",
              "queue:scheduler-id:<schedulerId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/schedule",
          "scopes": [
            [
              "queue:schedule-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ],
            [
              "queue:schedule-task:<schedulerId>/<taskGroupId>/<taskId>"
            ]
          ],
          "stability": "stable",
          "title": "Schedule Defined Task",
          "type": "function"
        },
        {
          "args": [
            "taskId"
          ],
          "description": "This method _reruns_ a previously resolved task, even if it was\n_completed_. This is useful if your task completes unsuccessfully, and\nyou just want to run it from scratch again. This will also reset the\nnumber of `retries` allowed.\n\nRemember that `retries` in the task status counts the number of runs that\nthe queue have started because the worker stopped responding, for example\nbecause a spot node died.\n\n**Remark** this operation is idempotent, if you try to rerun a task that\nis not either `failed` or `completed`, this operation will just return\nthe current task status.",
          "method": "post",
          "name": "rerunTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/rerun",
          "scopes": [
            [
              "queue:rerun-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ],
            [
              "queue:rerun-task:<schedulerId>/<taskGroupId>/<taskId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/cancel",
          "scopes": [
            [
              "queue:cancel-task",
              "assume:scheduler-id:<schedulerId>/<taskGroupId>"
            ],
            [
              "queue:cancel-task:<schedulerId>/<taskGroupId>/<taskId>"
            ]
          ],
          "stability": "stable",
          "title": "Cancel Task",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Get a signed URLs to get and delete messages from azure queue.\nOnce messages are polled from here, you can claim the referenced task\nwith `claimTask`, and afterwards you should always delete the message.",
          "method": "get",
          "name": "pollTaskUrls",
          "output": "http://schemas.taskcluster.net/queue/v1/poll-task-urls-response.json#",
          "query": [
          ],
          "route": "/poll-task-url/<provisionerId>/<workerType>",
          "scopes": [
            [
              "queue:poll-task-urls",
              "assume:worker-type:<provisionerId>/<workerType>"
            ],
            [
              "queue:poll-task-urls:<provisionerId>/<workerType>"
            ]
          ],
          "stability": "stable",
          "title": "Get Urls to Poll Pending Tasks",
          "type": "function"
        },
        {
          "args": [
            "provisionerId",
            "workerType"
          ],
          "description": "Claim any task, more to be added later... long polling up to 20s.",
          "input": "http://schemas.taskcluster.net/queue/v1/claim-work-request.json#",
          "method": "post",
          "name": "claimWork",
          "output": "http://schemas.taskcluster.net/queue/v1/claim-work-response.json#",
          "query": [
          ],
          "route": "/claim-work/<provisionerId>/<workerType>",
          "scopes": [
            [
              "queue:claim-work:<provisionerId>/<workerType>",
              "queue:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "stable",
          "title": "Claim Work",
          "type": "function"
        },
        {
          "args": [
            "taskId",
            "runId"
          ],
          "description": "claim a task, more to be added later...",
          "input": "http://schemas.taskcluster.net/queue/v1/task-claim-request.json#",
          "method": "post",
          "name": "claimTask",
          "output": "http://schemas.taskcluster.net/queue/v1/task-claim-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/claim",
          "scopes": [
            [
              "queue:claim-task",
              "assume:worker-type:<provisionerId>/<workerType>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ],
            [
              "queue:claim-task:<provisionerId>/<workerType>",
              "queue:worker-id:<workerGroup>/<workerId>"
            ]
          ],
          "stability": "stable",
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
          "output": "http://schemas.taskcluster.net/queue/v1/task-reclaim-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/reclaim",
          "scopes": [
            [
              "queue:claim-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ],
            [
              "queue:reclaim-task:<taskId>/<runId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/completed",
          "scopes": [
            [
              "queue:resolve-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ],
            [
              "queue:resolve-task:<taskId>/<runId>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/failed",
          "scopes": [
            [
              "queue:resolve-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ],
            [
              "queue:resolve-task:<taskId>/<runId>"
            ]
          ],
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
          "input": "http://schemas.taskcluster.net/queue/v1/task-exception-request.json#",
          "method": "post",
          "name": "reportException",
          "output": "http://schemas.taskcluster.net/queue/v1/task-status-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/exception",
          "scopes": [
            [
              "queue:resolve-task",
              "assume:worker-id:<workerGroup>/<workerId>"
            ],
            [
              "queue:resolve-task:<taskId>/<runId>"
            ]
          ],
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
          "description": "This API end-point creates an artifact for a specific run of a task. This\nshould **only** be used by a worker currently operating on this task, or\nfrom a process running within the task (ie. on the worker).\n\nAll artifacts must specify when they `expires`, the queue will\nautomatically take care of deleting artifacts past their\nexpiration point. This features makes it feasible to upload large\nintermediate artifacts from data processing applications, as the\nartifacts can be set to expire a few days later.\n\nWe currently support 4 different `storageType`s, each storage type have\nslightly different features and in some cases difference semantics.\n\n**S3 artifacts**, is useful for static files which will be stored on S3.\nWhen creating an S3 artifact the queue will return a pre-signed URL\nto which you can do a `PUT` request to upload your artifact. Note\nthat `PUT` request **must** specify the `content-length` header and\n**must** give the `content-type` header the same value as in the request\nto `createArtifact`.\n\n**Azure artifacts**, are stored in _Azure Blob Storage_ service, which\ngiven the consistency guarantees and API interface offered by Azure is\nmore suitable for artifacts that will be modified during the execution\nof the task. For example docker-worker has a feature that persists the\ntask log to Azure Blob Storage every few seconds creating a somewhat\nlive log. A request to create an Azure artifact will return a URL\nfeaturing a [Shared-Access-Signature](http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),\nrefer to MSDN for further information on how to use these.\n**Warning: azure artifact is currently an experimental feature subject\nto changes and data-drops.**\n\n**Reference artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts really only have a `url` property and\nwhen the artifact is requested the client will be redirect the URL\nprovided with a `303` (See Other) redirect. Please note that we cannot\ndelete artifacts you upload to other service, we can only delete the\nreference to the artifact, when it expires.\n\n**Error artifacts**, only consists of meta-data which the queue will\nstore for you. These artifacts are only meant to indicate that you the\nworker or the task failed to generate a specific artifact, that you\nwould otherwise have uploaded. For example docker-worker will upload an\nerror artifact, if the file it was supposed to upload doesn't exists or\nturns out to be a directory. Clients requesting an error artifact will\nget a `403` (Forbidden) response. This is mainly designed to ensure that\ndependent tasks can distinguish between artifacts that were suppose to\nbe generated and artifacts for which the name is misspelled.\n\n**Artifact immutability**, generally speaking you cannot overwrite an\nartifact when created. But if you repeat the request with the same\nproperties the request will succeed as the operation is idempotent.\nThis is useful if you need to refresh a signed URL while uploading.\nDo not abuse this to overwrite artifacts created by another entity!\nSuch as worker-host overwriting artifact created by worker-code.\n\nAs a special case the `url` property on _reference artifacts_ can be\nupdated. You should only use this to update the `url` property for\nreference artifacts your process has created.",
          "input": "http://schemas.taskcluster.net/queue/v1/post-artifact-request.json#",
          "method": "post",
          "name": "createArtifact",
          "output": "http://schemas.taskcluster.net/queue/v1/post-artifact-response.json#",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": [
            [
              "queue:create-artifact:<name>",
              "assume:worker-id:<workerGroup>/<workerId>"
            ],
            [
              "queue:create-artifact:<taskId>/<runId>"
            ]
          ],
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
          "description": "Get artifact by `<name>` from a specific run.\n\n**Public Artifacts**, in-order to get an artifact you need the scope\n`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.\nBut if the artifact `name` starts with `public/`, authentication and\nauthorization is not necessary to fetch the artifact.\n\n**API Clients**, this method will redirect you to the artifact, if it is\nstored externally. Either way, the response may not be JSON. So API\nclient users might want to generate a signed URL for this end-point and\nuse that URL with a normal HTTP client.\n\n**Caching**, artifacts may be cached in data centers closer to the\nworkers in-order to reduce bandwidth costs. This can lead to longer\nresponse times. Caching can be skipped by setting the header\n`x-taskcluster-skip-cache: true`, this should only be used for resources\nwhere request volume is known to be low, and caching not useful.\n(This feature may be disabled in the future, use is sparingly!)",
          "method": "get",
          "name": "getArtifact",
          "query": [
          ],
          "route": "/task/<taskId>/runs/<runId>/artifacts/<name>",
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ],
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
          "scopes": [
            [
              "queue:get-artifact:<name>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json#",
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
          "output": "http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json#",
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
            "provisionerId",
            "workerType"
          ],
          "description": "Get an approximate number of pending tasks for the given `provisionerId`\nand `workerType`.\n\nThe underlying Azure Storage Queues only promises to give us an estimate.\nFurthermore, we cache the result in memory for 20 seconds. So consumers\nshould be no means expect this to be an accurate number.\nIt is, however, a solid estimate of the number of pending tasks.",
          "method": "get",
          "name": "pendingTasks",
          "output": "http://schemas.taskcluster.net/queue/v1/pending-tasks-response.json#",
          "query": [
          ],
          "route": "/pending/<provisionerId>/<workerType>",
          "stability": "stable",
          "title": "Get Number of Pending Tasks",
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
      "title": "Queue API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/queue/v1/api.json"
  },
  "QueueEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The queue, typically available at `queue.taskcluster.net`, is responsible\nfor accepting tasks and track their state as they are executed by\nworkers. In order ensure they are eventually resolved.\n\nThis document describes AMQP exchanges offered by the queue, which allows\nthird-party listeners to monitor tasks as they progress to resolution.\nThese exchanges targets the following audience:\n * Schedulers, who takes action after tasks are completed,\n * Workers, who wants to listen for new or canceled tasks (optional),\n * Tools, that wants to update their view as task progress.\n\nYou'll notice that all the exchanges in the document shares the same\nrouting key pattern. This makes it very easy to bind to all messages\nabout a certain kind tasks.\n\n**Task specific routes**, a task can define a task specific route using\nthe `task.routes` property. See task creation documentation for details\non permissions required to provide task specific routes. If a task has\nthe entry `'notify.by-email'` in as task specific route defined in\n`task.routes` all messages about this task will be CC'ed with the\nrouting-key `'route.notify.by-email'`.\n\nThese routes will always be prefixed `route.`, so that cannot interfere\nwith the _primary_ routing key as documented here. Notice that the\n_primary_ routing key is always prefixed `primary.`. This is ensured\nin the routing key reference, so API clients will do this automatically.\n\nPlease, note that the way RabbitMQ works, the message will only arrive\nin your queue once, even though you may have bound to the exchange with\nmultiple routing key patterns that matches more of the CC'ed routing\nrouting keys.\n\n**Delivery guarantees**, most operations on the queue are idempotent,\nwhich means that if repeated with the same arguments then the requests\nwill ensure completion of the operation and return the same response.\nThis is useful if the server crashes or the TCP connection breaks, but\nwhen re-executing an idempotent operation, the queue will also resend\nany related AMQP messages. Hence, messages may be repeated.\n\nThis shouldn't be much of a problem, as the best you can achieve using\nconfirm messages with AMQP is at-least-once delivery semantics. Hence,\nthis only prevents you from obtaining at-most-once delivery semantics.\n\n**Remark**, some message generated by timeouts maybe dropped if the\nserver crashes at wrong time. Ideally, we'll address this in the\nfuture. For now we suggest you ignore this corner case, and notify us\nif this corner case is of concern to you.",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/task-defined-message.json#",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/task-pending-message.json#",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/task-running-message.json#",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/artifact-created-message.json#",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/task-completed-message.json#",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/task-failed-message.json#",
          "title": "Task Failed Messages",
          "type": "topic-exchange"
        },
        {
          "description": "Whenever TaskCluster fails to run a message is posted to this exchange.\nThis happens if the task isn't completed before its `deadlìne`,\nall retries failed (i.e. workers stopped responding), the task was\ncanceled by another entity, or the task carried a malformed payload.\n\nThe specific _reason_ is evident from that task status structure, refer\nto the `reasonResolved` property for the last run.",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/task-exception-message.json#",
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
          "schema": "http://schemas.taskcluster.net/queue/v1/task-group-resolved.json#",
          "title": "Task Group Resolved Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-queue/v1/",
      "title": "Queue AMQP Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/queue/v1/exchanges.json"
  },
  "Scheduler": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://scheduler.taskcluster.net/v1",
      "description": "The task-graph scheduler, typically available at\n`scheduler.taskcluster.net`, is responsible for accepting task-graphs and\nscheduling tasks for evaluation by the queue as their dependencies are\nsatisfied.\n\nThis document describes API end-points offered by the task-graph\nscheduler. These end-points targets the following audience:\n * Post-commit hooks, that wants to submit task-graphs for testing,\n * End-users, who wants to execute a set of dependent tasks, and\n * Tools, that wants to inspect the state of a task-graph.",
      "entries": [
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Create a new task-graph, the `status` of the resulting JSON is a\ntask-graph status structure, you can find the `taskGraphId` in this\nstructure.\n\n**Referencing required tasks**, it is possible to reference other tasks\nin the task-graph that must be completed successfully before a task is\nscheduled. You just specify the `taskId` in the list of `required` tasks.\nSee the example below, where the second task requires the first task.\n```js\n{\n  ...\n  tasks: [\n    {\n      taskId:     \"XgvL0qtSR92cIWpcwdGKCA\",\n      requires:   [],\n      ...\n    },\n    {\n      taskId:     \"73GsfK62QNKAk2Hg1EEZTQ\",\n      requires:   [\"XgvL0qtSR92cIWpcwdGKCA\"],\n      task: {\n        payload: {\n          env: {\n            DEPENDS_ON:  \"XgvL0qtSR92cIWpcwdGKCA\"\n          }\n          ...\n        }\n        ...\n      },\n      ...\n    }\n  ]\n}\n```\n\n**The `schedulerId` property**, defaults to the `schedulerId` of this\nscheduler in production that is `\"task-graph-scheduler\"`. This\nproperty must be either undefined or set to `\"task-graph-scheduler\"`,\notherwise the task-graph will be rejected.\n\n**The `taskGroupId` property**, defaults to the `taskGraphId` of the\ntask-graph submitted, and if provided much be the `taskGraphId` of\nthe task-graph. Otherwise the task-graph will be rejected.\n\n**Task-graph scopes**, a task-graph is assigned a set of scopes, just\nlike tasks. Tasks within a task-graph cannot have scopes beyond those\nthe task-graph has. The task-graph scheduler will execute all requests\non behalf of a task-graph using the set of scopes assigned to the\ntask-graph. Thus, if you are submitting tasks to `my-worker-type` under\n`my-provisioner` it's important that your task-graph has the scope\nrequired to define tasks for this `provisionerId` and `workerType`.\n(`queue:define-task:..` or `queue:create-task:..`; see the queue for\ndetails on scopes required). Note, the task-graph does not require\npermissions to schedule the tasks (`queue:schedule-task:..`), as this is\ndone with scopes provided by the task-graph scheduler.\n\n**Task-graph specific routing-keys**, using the `taskGraph.routes`\nproperty you may define task-graph specific routing-keys. If a task-graph\nhas a task-graph specific routing-key: `<route>`, then the poster will\nbe required to posses the scope `scheduler:route:<route>`. And when the\nan AMQP message about the task-graph is published the message will be\nCC'ed with the routing-key: `route.<route>`. This is useful if you want\nanother component to listen for completed tasks you have posted.",
          "input": "http://schemas.taskcluster.net/scheduler/v1/task-graph.json#",
          "method": "put",
          "name": "createTaskGraph",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#",
          "route": "/task-graph/<taskGraphId>",
          "scopes": [
            [
              "scheduler:create-task-graph"
            ]
          ],
          "stability": "experimental",
          "title": "Create new task-graph",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Add a set of tasks to an existing task-graph. The request format is very\nsimilar to the request format for creating task-graphs. But `routes`\nkey, `scopes`, `metadata` and `tags` cannot be modified.\n\n**Referencing required tasks**, just as when task-graphs are created,\neach task has a list of required tasks. It is possible to reference\nall `taskId`s within the task-graph.\n\n**Safety,** it is only _safe_ to call this API end-point while the\ntask-graph being modified is still running. If the task-graph is\n_finished_ or _blocked_, this method will leave the task-graph in this\nstate. Hence, it is only truly _safe_ to call this API end-point from\nwithin a task in the task-graph being modified.",
          "input": "http://schemas.taskcluster.net/scheduler/v1/extend-task-graph-request.json#",
          "method": "post",
          "name": "extendTaskGraph",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json#",
          "route": "/task-graph/<taskGraphId>/extend",
          "scopes": [
            [
              "scheduler:extend-task-graph:<taskGraphId>"
            ]
          ],
          "stability": "experimental",
          "title": "Extend existing task-graph",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Get task-graph status, this will return the _task-graph status\nstructure_. which can be used to check if a task-graph is `running`,\n`blocked` or `finished`.\n\n**Note**, that `finished` implies successfully completion.",
          "method": "get",
          "name": "status",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-status-response.json",
          "route": "/task-graph/<taskGraphId>/status",
          "stability": "experimental",
          "title": "Task Graph Status",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Get task-graph information, this includes the _task-graph status\nstructure_, along with `metadata` and `tags`, but not information\nabout all tasks.\n\nIf you want more detailed information use the `inspectTaskGraph`\nend-point instead.",
          "method": "get",
          "name": "info",
          "output": "http://schemas.taskcluster.net/scheduler/v1/task-graph-info-response.json",
          "route": "/task-graph/<taskGraphId>/info",
          "stability": "experimental",
          "title": "Task Graph Information",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId"
          ],
          "description": "Inspect a task-graph, this returns all the information the task-graph\nscheduler knows about the task-graph and the state of its tasks.\n\n**Warning**, some of these fields are borderline internal to the\ntask-graph scheduler and we may choose to change or make them internal\nlater. Also note that note all of the information is formalized yet.\nThe JSON schema will be updated to reflect formalized values, we think\nit's safe to consider the values stable.\n\nTake these considerations into account when using the API end-point,\nas we do not promise it will remain fully backward compatible in\nthe future.",
          "method": "get",
          "name": "inspect",
          "output": "http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-response.json",
          "route": "/task-graph/<taskGraphId>/inspect",
          "stability": "experimental",
          "title": "Inspect Task Graph",
          "type": "function"
        },
        {
          "args": [
            "taskGraphId",
            "taskId"
          ],
          "description": "Inspect a task from a task-graph, this returns all the information the\ntask-graph scheduler knows about the specific task.\n\n**Warning**, some of these fields are borderline internal to the\ntask-graph scheduler and we may choose to change or make them internal\nlater. Also note that note all of the information is formalized yet.\nThe JSON schema will be updated to reflect formalized values, we think\nit's safe to consider the values stable.\n\nTake these considerations into account when using the API end-point,\nas we do not promise it will remain fully backward compatible in\nthe future.",
          "method": "get",
          "name": "inspectTask",
          "output": "http://schemas.taskcluster.net/scheduler/v1/inspect-task-graph-task-response.json",
          "route": "/task-graph/<taskGraphId>/inspect/<taskId>",
          "stability": "experimental",
          "title": "Inspect Task from a Task-Graph",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "Documented later...\n\n**Warning** this api end-point is **not stable**.",
          "method": "get",
          "name": "ping",
          "route": "/ping",
          "stability": "experimental",
          "title": "Ping Server",
          "type": "function"
        }
      ],
      "title": "Task-Graph Scheduler API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/scheduler/v1/api.json"
  },
  "SchedulerEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The scheduler, typically available at `scheduler.taskcluster.net` is\nresponsible for accepting task-graphs and schedule tasks on the queue as\ntheir dependencies are completed successfully.\n\nThis document describes the AMQP exchanges offered by the scheduler,\nwhich allows third-party listeners to monitor task-graph submission and\nresolution. These exchanges targets the following audience:\n * Reporters, who displays the state of task-graphs or emails people on\n   failures, and\n * End-users, who wants notification of completed task-graphs\n\n**Remark**, the task-graph scheduler will require that the `schedulerId`\nfor tasks is set to the `schedulerId` for the task-graph scheduler. In\nproduction the `schedulerId` is typically `\"task-graph-scheduler\"`.\nFurthermore, the task-graph scheduler will also require that\n`taskGroupId` is equal to the `taskGraphId`.\n\nCombined these requirements ensures that `schedulerId` and `taskGroupId`\nhave the same position in the routing keys for the queue exchanges.\nSee queue documentation for details on queue exchanges. Hence, making\nit easy to listen for all tasks in a given task-graph.\n\nNote that routing key entries 2 through 7 used for exchanges on the\ntask-graph scheduler is hardcoded to `_`. This is done to preserve\npositional equivalence with exchanges offered by the queue.",
      "entries": [
        {
          "description": "When a task-graph is submitted it immediately starts running and a\nmessage is posted on this exchange to indicate that a task-graph have\nbeen submitted.",
          "exchange": "task-graph-running",
          "name": "taskGraphRunning",
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
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-running-message.json#",
          "title": "Task-Graph Running Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a task-graph is extended, that is additional tasks is added to the\ntask-graph, a message is posted on this exchange. This is useful if you\nare monitoring a task-graph and what to track states of the individual\ntasks in the task-graph.",
          "exchange": "task-graph-extended",
          "name": "taskGraphExtended",
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
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-extended-message.json#",
          "title": "Task-Graph Extended Message",
          "type": "topic-exchange"
        },
        {
          "description": "When a task is completed unsuccessfully and all reruns have been\nattempted, the task-graph will not complete successfully and it's\ndeclared to be _blocked_, by some task that consistently completes\nunsuccessfully.\n\nWhen a task-graph becomes blocked a messages is posted to this exchange.\nThe message features the `taskId` of the task that caused the task-graph\nto become blocked.",
          "exchange": "task-graph-blocked",
          "name": "taskGraphBlocked",
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
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-blocked-message.json#",
          "title": "Task-Graph Blocked Message",
          "type": "topic-exchange"
        },
        {
          "description": "When all tasks of a task-graph have completed successfully, the\ntask-graph is declared to be finished, and a message is posted to this\nexchange.",
          "exchange": "task-graph-finished",
          "name": "taskGraphFinished",
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
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "runId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerGroup",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "provisionerId",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "workerType",
              "required": false,
              "summary": "Always takes the value `_`"
            },
            {
              "multipleWords": false,
              "name": "schedulerId",
              "required": true,
              "summary": "Identifier for the task-graphs scheduler managing the task-graph this message concerns. Usually `task-graph-scheduler` in production."
            },
            {
              "multipleWords": false,
              "name": "taskGraphId",
              "required": true,
              "summary": "Identifier for the task-graph this message concerns"
            },
            {
              "multipleWords": true,
              "name": "reserved",
              "required": false,
              "summary": "Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified."
            }
          ],
          "schema": "http://schemas.taskcluster.net/scheduler/v1/task-graph-finished-message.json#",
          "title": "Task-Graph Finished Message",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-scheduler/v1/",
      "title": "Scheduler AMQP Exchanges",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/scheduler/v1/exchanges.json"
  },
  "Secrets": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/api-reference.json#",
      "baseUrl": "https://secrets.taskcluster.net/v1",
      "description": "The secrets service provides a simple key/value store for small bits of secret\ndata.  Access is limited by scopes, so values can be considered secret from\nthose who do not have the relevant scopes.\n\nSecrets also have an expiration date, and once a secret has expired it can no\nlonger be read.  This is useful for short-term secrets such as a temporary\nservice credential or a one-time signing key.",
      "entries": [
        {
          "args": [
            "name"
          ],
          "description": "Set the secret associated with some key.  If the secret already exists, it is\nupdated instead.",
          "input": "http://schemas.taskcluster.net/secrets/v1/secret.json#",
          "method": "put",
          "name": "set",
          "query": [
          ],
          "route": "/secret/<name>",
          "scopes": [
            [
              "secrets:set:<name>"
            ]
          ],
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
          "scopes": [
            [
              "secrets:set:<name>"
            ]
          ],
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
          "output": "http://schemas.taskcluster.net/secrets/v1/secret.json#",
          "query": [
          ],
          "route": "/secret/<name>",
          "scopes": [
            [
              "secrets:get:<name>"
            ]
          ],
          "stability": "stable",
          "title": "Read Secret",
          "type": "function"
        },
        {
          "args": [
          ],
          "description": "List the names of all secrets that you would have access to read. In\nother words, secret name `<X>` will only be returned if a) a secret\nwith name `<X>` exists, and b) you posses the scope `secrets:get:<X>`.",
          "method": "get",
          "name": "list",
          "output": "http://schemas.taskcluster.net/secrets/v1/secret-list.json#",
          "query": [
          ],
          "route": "/secrets",
          "stability": "stable",
          "title": "List Secrets",
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
      "title": "TaskCluster Secrets API Documentation",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/secrets/v1/api.json"
  },
  "TreeherderEvents": {
    "reference": {
      "$schema": "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#",
      "description": "The taskcluster-treeherder service is responsible for processing\ntask events published by TaskCluster Queue and producing job messages\nthat are consumable by Treeherder.\n\nThis exchange provides that job messages to be consumed by any queue that\nattached to the exchange.  This could be a production Treeheder instance,\na local development environment, or a custom dashboard.",
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
          "schema": "http://schemas.taskcluster.net/taskcluster-treeherder/v1/pulse-job.json#",
          "title": "Job Messages",
          "type": "topic-exchange"
        }
      ],
      "exchangePrefix": "exchange/taskcluster-treeherder/v1/",
      "title": "Taskcluster-treeherder Pulse Exchange",
      "version": 0
    },
    "referenceUrl": "http://references.taskcluster.net/taskcluster-treeherder/v1/exchanges.json"
  }
};