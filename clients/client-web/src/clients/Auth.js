// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.

import Client from '../Client';

export default class Auth extends Client {
  constructor(options = {}) {
    super({
      serviceName: 'auth',
      serviceVersion: 'v1',
      exchangePrefix: '',
      ...options,
    });
    this.ping.entry = {"args":[],"category":"Ping Server","method":"get","name":"ping","query":[],"route":"/ping","stability":"stable","type":"function"}; // eslint-disable-line
    this.listClients.entry = {"args":[],"category":"Auth Service","method":"get","name":"listClients","output":true,"query":["prefix","continuationToken","limit"],"route":"/clients/","stability":"stable","type":"function"}; // eslint-disable-line
    this.client.entry = {"args":["clientId"],"category":"Auth Service","method":"get","name":"client","output":true,"query":[],"route":"/clients/<clientId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.createClient.entry = {"args":["clientId"],"category":"Auth Service","input":true,"method":"put","name":"createClient","output":true,"query":[],"route":"/clients/<clientId>","scopes":{"AllOf":["auth:create-client:<clientId>",{"each":"<scope>","for":"scope","in":"scopes"}]},"stability":"stable","type":"function"}; // eslint-disable-line
    this.resetAccessToken.entry = {"args":["clientId"],"category":"Auth Service","method":"post","name":"resetAccessToken","output":true,"query":[],"route":"/clients/<clientId>/reset","scopes":"auth:reset-access-token:<clientId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.updateClient.entry = {"args":["clientId"],"category":"Auth Service","input":true,"method":"post","name":"updateClient","output":true,"query":[],"route":"/clients/<clientId>","scopes":{"AllOf":["auth:update-client:<clientId>",{"each":"<scope>","for":"scope","in":"scopesAdded"}]},"stability":"stable","type":"function"}; // eslint-disable-line
    this.enableClient.entry = {"args":["clientId"],"category":"Auth Service","method":"post","name":"enableClient","output":true,"query":[],"route":"/clients/<clientId>/enable","scopes":"auth:enable-client:<clientId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.disableClient.entry = {"args":["clientId"],"category":"Auth Service","method":"post","name":"disableClient","output":true,"query":[],"route":"/clients/<clientId>/disable","scopes":"auth:disable-client:<clientId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.deleteClient.entry = {"args":["clientId"],"category":"Auth Service","method":"delete","name":"deleteClient","query":[],"route":"/clients/<clientId>","scopes":"auth:delete-client:<clientId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.listRoles.entry = {"args":[],"category":"Auth Service","method":"get","name":"listRoles","output":true,"query":[],"route":"/roles/","stability":"stable","type":"function"}; // eslint-disable-line
    this.listRoles2.entry = {"args":[],"category":"Auth Service","method":"get","name":"listRoles2","output":true,"query":["continuationToken","limit"],"route":"/roles2/","stability":"stable","type":"function"}; // eslint-disable-line
    this.listRoleIds.entry = {"args":[],"category":"Auth Service","method":"get","name":"listRoleIds","output":true,"query":["continuationToken","limit"],"route":"/roleids/","stability":"stable","type":"function"}; // eslint-disable-line
    this.role.entry = {"args":["roleId"],"category":"Auth Service","method":"get","name":"role","output":true,"query":[],"route":"/roles/<roleId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.createRole.entry = {"args":["roleId"],"category":"Auth Service","input":true,"method":"put","name":"createRole","output":true,"query":[],"route":"/roles/<roleId>","scopes":{"AllOf":["auth:create-role:<roleId>",{"each":"<scope>","for":"scope","in":"scopes"}]},"stability":"stable","type":"function"}; // eslint-disable-line
    this.updateRole.entry = {"args":["roleId"],"category":"Auth Service","input":true,"method":"post","name":"updateRole","output":true,"query":[],"route":"/roles/<roleId>","scopes":{"AllOf":["auth:update-role:<roleId>",{"each":"<scope>","for":"scope","in":"scopesAdded"}]},"stability":"stable","type":"function"}; // eslint-disable-line
    this.deleteRole.entry = {"args":["roleId"],"category":"Auth Service","method":"delete","name":"deleteRole","query":[],"route":"/roles/<roleId>","scopes":"auth:delete-role:<roleId>","stability":"stable","type":"function"}; // eslint-disable-line
    this.expandScopes.entry = {"args":[],"category":"Auth Service","input":true,"method":"post","name":"expandScopes","output":true,"query":[],"route":"/scopes/expand","stability":"stable","type":"function"}; // eslint-disable-line
    this.currentScopes.entry = {"args":[],"category":"Auth Service","method":"get","name":"currentScopes","output":true,"query":[],"route":"/scopes/current","stability":"stable","type":"function"}; // eslint-disable-line
    this.awsS3Credentials.entry = {"args":["level","bucket","prefix"],"category":"Auth Service","method":"get","name":"awsS3Credentials","output":true,"query":["format"],"route":"/aws/s3/<level>/<bucket>/<prefix>","scopes":{"else":"auth:aws-s3:read-write:<bucket>/<prefix>","if":"levelIsReadOnly","then":{"AnyOf":["auth:aws-s3:read-only:<bucket>/<prefix>","auth:aws-s3:read-write:<bucket>/<prefix>"]}},"stability":"stable","type":"function"}; // eslint-disable-line
    this.azureAccounts.entry = {"args":[],"category":"Auth Service","method":"get","name":"azureAccounts","output":true,"query":[],"route":"/azure/accounts","scopes":"auth:azure-table:list-accounts","stability":"stable","type":"function"}; // eslint-disable-line
    this.azureTables.entry = {"args":["account"],"category":"Auth Service","method":"get","name":"azureTables","output":true,"query":["continuationToken"],"route":"/azure/<account>/tables","scopes":"auth:azure-table:list-tables:<account>","stability":"stable","type":"function"}; // eslint-disable-line
    this.azureTableSAS.entry = {"args":["account","table","level"],"category":"Auth Service","method":"get","name":"azureTableSAS","output":true,"query":[],"route":"/azure/<account>/table/<table>/<level>","scopes":{"else":"auth:azure-table:read-write:<account>/<table>","if":"levelIsReadOnly","then":{"AnyOf":["auth:azure-table:read-only:<account>/<table>","auth:azure-table:read-write:<account>/<table>"]}},"stability":"stable","type":"function"}; // eslint-disable-line
    this.azureContainers.entry = {"args":["account"],"category":"Auth Service","method":"get","name":"azureContainers","output":true,"query":["continuationToken"],"route":"/azure/<account>/containers","scopes":"auth:azure-container:list-containers:<account>","stability":"stable","type":"function"}; // eslint-disable-line
    this.azureContainerSAS.entry = {"args":["account","container","level"],"category":"Auth Service","method":"get","name":"azureContainerSAS","output":true,"query":[],"route":"/azure/<account>/containers/<container>/<level>","scopes":{"else":"auth:azure-container:read-write:<account>/<container>","if":"levelIsReadOnly","then":{"AnyOf":["auth:azure-container:read-only:<account>/<container>","auth:azure-container:read-write:<account>/<container>"]}},"stability":"stable","type":"function"}; // eslint-disable-line
    this.sentryDSN.entry = {"args":["project"],"category":"Auth Service","method":"get","name":"sentryDSN","output":true,"query":[],"route":"/sentry/<project>/dsn","scopes":"auth:sentry:<project>","stability":"deprecated","type":"function"}; // eslint-disable-line
    this.websocktunnelToken.entry = {"args":["wstAudience","wstClient"],"category":"Auth Service","method":"get","name":"websocktunnelToken","output":true,"query":[],"route":"/websocktunnel/<wstAudience>/<wstClient>","scopes":"auth:websocktunnel-token:<wstAudience>/<wstClient>","stability":"stable","type":"function"}; // eslint-disable-line
    this.gcpCredentials.entry = {"args":["projectId","serviceAccount"],"category":"Auth Service","method":"get","name":"gcpCredentials","output":true,"query":[],"route":"/gcp/credentials/<projectId>/<serviceAccount>","scopes":"auth:gcp:access-token:<projectId>/<serviceAccount>","stability":"stable","type":"function"}; // eslint-disable-line
    this.authenticateHawk.entry = {"args":[],"category":"Auth Service","input":true,"method":"post","name":"authenticateHawk","output":true,"query":[],"route":"/authenticate-hawk","stability":"stable","type":"function"}; // eslint-disable-line
    this.testAuthenticate.entry = {"args":[],"category":"Auth Service","input":true,"method":"post","name":"testAuthenticate","output":true,"query":[],"route":"/test-authenticate","stability":"stable","type":"function"}; // eslint-disable-line
    this.testAuthenticateGet.entry = {"args":[],"category":"Auth Service","method":"get","name":"testAuthenticateGet","output":true,"query":[],"route":"/test-authenticate-get/","stability":"stable","type":"function"}; // eslint-disable-line
  }
  /* eslint-disable max-len */
  // Respond without doing anything.
  // This endpoint is used to check that the service is up.
  /* eslint-enable max-len */
  ping(...args) {
    this.validate(this.ping.entry, args);

    return this.request(this.ping.entry, args);
  }
  /* eslint-disable max-len */
  // Get a list of all clients.  With `prefix`, only clients for which
  // it is a prefix of the clientId are returned.
  // By default this end-point will try to return up to 1000 clients in one
  // request. But it **may return less, even none**.
  // It may also return a `continuationToken` even though there are no more
  // results. However, you can only be sure to have seen all results if you
  // keep calling `listClients` with the last `continuationToken` until you
  // get a result without a `continuationToken`.
  /* eslint-enable max-len */
  listClients(...args) {
    this.validate(this.listClients.entry, args);

    return this.request(this.listClients.entry, args);
  }
  /* eslint-disable max-len */
  // Get information about a single client.
  /* eslint-enable max-len */
  client(...args) {
    this.validate(this.client.entry, args);

    return this.request(this.client.entry, args);
  }
  /* eslint-disable max-len */
  // Create a new client and get the `accessToken` for this client.
  // You should store the `accessToken` from this API call as there is no
  // other way to retrieve it.
  // If you loose the `accessToken` you can call `resetAccessToken` to reset
  // it, and a new `accessToken` will be returned, but you cannot retrieve the
  // current `accessToken`.
  // If a client with the same `clientId` already exists this operation will
  // fail. Use `updateClient` if you wish to update an existing client.
  // The caller's scopes must satisfy `scopes`.
  /* eslint-enable max-len */
  createClient(...args) {
    this.validate(this.createClient.entry, args);

    return this.request(this.createClient.entry, args);
  }
  /* eslint-disable max-len */
  // Reset a clients `accessToken`, this will revoke the existing
  // `accessToken`, generate a new `accessToken` and return it from this
  // call.
  // There is no way to retrieve an existing `accessToken`, so if you loose it
  // you must reset the accessToken to acquire it again.
  /* eslint-enable max-len */
  resetAccessToken(...args) {
    this.validate(this.resetAccessToken.entry, args);

    return this.request(this.resetAccessToken.entry, args);
  }
  /* eslint-disable max-len */
  // Update an exisiting client. The `clientId` and `accessToken` cannot be
  // updated, but `scopes` can be modified.  The caller's scopes must
  // satisfy all scopes being added to the client in the update operation.
  // If no scopes are given in the request, the client's scopes remain
  // unchanged
  /* eslint-enable max-len */
  updateClient(...args) {
    this.validate(this.updateClient.entry, args);

    return this.request(this.updateClient.entry, args);
  }
  /* eslint-disable max-len */
  // Enable a client that was disabled with `disableClient`.  If the client
  // is already enabled, this does nothing.
  // This is typically used by identity providers to re-enable clients that
  // had been disabled when the corresponding identity's scopes changed.
  /* eslint-enable max-len */
  enableClient(...args) {
    this.validate(this.enableClient.entry, args);

    return this.request(this.enableClient.entry, args);
  }
  /* eslint-disable max-len */
  // Disable a client.  If the client is already disabled, this does nothing.
  // This is typically used by identity providers to disable clients when the
  // corresponding identity's scopes no longer satisfy the client's scopes.
  /* eslint-enable max-len */
  disableClient(...args) {
    this.validate(this.disableClient.entry, args);

    return this.request(this.disableClient.entry, args);
  }
  /* eslint-disable max-len */
  // Delete a client, please note that any roles related to this client must
  // be deleted independently.
  /* eslint-enable max-len */
  deleteClient(...args) {
    this.validate(this.deleteClient.entry, args);

    return this.request(this.deleteClient.entry, args);
  }
  /* eslint-disable max-len */
  // Get a list of all roles. Each role object also includes the list of
  // scopes it expands to.  This always returns all roles in a single HTTP
  // request.
  // To get paginated results, use `listRoles2`.
  /* eslint-enable max-len */
  listRoles(...args) {
    this.validate(this.listRoles.entry, args);

    return this.request(this.listRoles.entry, args);
  }
  /* eslint-disable max-len */
  // Get a list of all roles. Each role object also includes the list of
  // scopes it expands to.  This is similar to `listRoles` but differs in the
  // format of the response.
  // If no limit is given, all roles are returned. Since this
  // list may become long, callers can use the `limit` and `continuationToken`
  // query arguments to page through the responses.
  /* eslint-enable max-len */
  listRoles2(...args) {
    this.validate(this.listRoles2.entry, args);

    return this.request(this.listRoles2.entry, args);
  }
  /* eslint-disable max-len */
  // Get a list of all role IDs.
  // If no limit is given, the roleIds of all roles are returned. Since this
  // list may become long, callers can use the `limit` and `continuationToken`
  // query arguments to page through the responses.
  /* eslint-enable max-len */
  listRoleIds(...args) {
    this.validate(this.listRoleIds.entry, args);

    return this.request(this.listRoleIds.entry, args);
  }
  /* eslint-disable max-len */
  // Get information about a single role, including the set of scopes that the
  // role expands to.
  /* eslint-enable max-len */
  role(...args) {
    this.validate(this.role.entry, args);

    return this.request(this.role.entry, args);
  }
  /* eslint-disable max-len */
  // Create a new role.
  // The caller's scopes must satisfy the new role's scopes.
  // If there already exists a role with the same `roleId` this operation
  // will fail. Use `updateRole` to modify an existing role.
  // Creation of a role that will generate an infinite expansion will result
  // in an error response.
  /* eslint-enable max-len */
  createRole(...args) {
    this.validate(this.createRole.entry, args);

    return this.request(this.createRole.entry, args);
  }
  /* eslint-disable max-len */
  // Update an existing role.
  // The caller's scopes must satisfy all of the new scopes being added, but
  // need not satisfy all of the role's existing scopes.
  // An update of a role that will generate an infinite expansion will result
  // in an error response.
  /* eslint-enable max-len */
  updateRole(...args) {
    this.validate(this.updateRole.entry, args);

    return this.request(this.updateRole.entry, args);
  }
  /* eslint-disable max-len */
  // Delete a role. This operation will succeed regardless of whether or not
  // the role exists.
  /* eslint-enable max-len */
  deleteRole(...args) {
    this.validate(this.deleteRole.entry, args);

    return this.request(this.deleteRole.entry, args);
  }
  /* eslint-disable max-len */
  // Return an expanded copy of the given scopeset, with scopes implied by any
  // roles included.
  /* eslint-enable max-len */
  expandScopes(...args) {
    this.validate(this.expandScopes.entry, args);

    return this.request(this.expandScopes.entry, args);
  }
  /* eslint-disable max-len */
  // Return the expanded scopes available in the request, taking into account all sources
  // of scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,
  // and roles).
  /* eslint-enable max-len */
  currentScopes(...args) {
    this.validate(this.currentScopes.entry, args);

    return this.request(this.currentScopes.entry, args);
  }
  /* eslint-disable max-len */
  // Get temporary AWS credentials for `read-write` or `read-only` access to
  // a given `bucket` and `prefix` within that bucket.
  // The `level` parameter can be `read-write` or `read-only` and determines
  // which type of credentials are returned. Please note that the `level`
  // parameter is required in the scope guarding access.  The bucket name must
  // not contain `.`, as recommended by Amazon.
  // This method can only allow access to a whitelisted set of buckets.  To add
  // a bucket to that whitelist, contact the Taskcluster team, who will add it to
  // the appropriate IAM policy.  If the bucket is in a different AWS account, you
  // will also need to add a bucket policy allowing access from the Taskcluster
  // account.  That policy should look like this:
  // ```js
  // {
  //   "Version": "2012-10-17",
  //   "Statement": [
  //     {
  //       "Sid": "allow-taskcluster-auth-to-delegate-access",
  //       "Effect": "Allow",
  //       "Principal": {
  //         "AWS": "arn:aws:iam::692406183521:root"
  //       },
  //       "Action": [
  //         "s3:ListBucket",
  //         "s3:GetObject",
  //         "s3:PutObject",
  //         "s3:DeleteObject",
  //         "s3:GetBucketLocation"
  //       ],
  //       "Resource": [
  //         "arn:aws:s3:::<bucket>",
  //         "arn:aws:s3:::<bucket>/*"
  //       ]
  //     }
  //   ]
  // }
  // ```
  // The credentials are set to expire after an hour, but this behavior is
  // subject to change. Hence, you should always read the `expires` property
  // from the response, if you intend to maintain active credentials in your
  // application.
  // Please note that your `prefix` may not start with slash `/`. Such a prefix
  // is allowed on S3, but we forbid it here to discourage bad behavior.
  // Also note that if your `prefix` doesn't end in a slash `/`, the STS
  // credentials may allow access to unexpected keys, as S3 does not treat
  // slashes specially.  For example, a prefix of `my-folder` will allow
  // access to `my-folder/file.txt` as expected, but also to `my-folder.txt`,
  // which may not be intended.
  // Finally, note that the `PutObjectAcl` call is not allowed.  Passing a canned
  // ACL other than `private` to `PutObject` is treated as a `PutObjectAcl` call, and
  // will result in an access-denied error from AWS.  This limitation is due to a
  // security flaw in Amazon S3 which might otherwise allow indefinite access to
  // uploaded objects.
  // **EC2 metadata compatibility**, if the querystring parameter
  // `?format=iam-role-compat` is given, the response will be compatible
  // with the JSON exposed by the EC2 metadata service. This aims to ease
  // compatibility for libraries and tools built to auto-refresh credentials.
  // For details on the format returned by EC2 metadata service see:
  // [EC2 User Guide](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#instance-metadata-security-credentials).
  /* eslint-enable max-len */
  awsS3Credentials(...args) {
    this.validate(this.awsS3Credentials.entry, args);

    return this.request(this.awsS3Credentials.entry, args);
  }
  /* eslint-disable max-len */
  // Retrieve a list of all Azure accounts managed by Taskcluster Auth.
  /* eslint-enable max-len */
  azureAccounts(...args) {
    this.validate(this.azureAccounts.entry, args);

    return this.request(this.azureAccounts.entry, args);
  }
  /* eslint-disable max-len */
  // Retrieve a list of all tables in an account.
  /* eslint-enable max-len */
  azureTables(...args) {
    this.validate(this.azureTables.entry, args);

    return this.request(this.azureTables.entry, args);
  }
  /* eslint-disable max-len */
  // Get a shared access signature (SAS) string for use with a specific Azure
  // Table Storage table.
  // The `level` parameter can be `read-write` or `read-only` and determines
  // which type of credentials are returned.  If level is read-write, it will create the
  // table if it doesn't already exist.
  /* eslint-enable max-len */
  azureTableSAS(...args) {
    this.validate(this.azureTableSAS.entry, args);

    return this.request(this.azureTableSAS.entry, args);
  }
  /* eslint-disable max-len */
  // Retrieve a list of all containers in an account.
  /* eslint-enable max-len */
  azureContainers(...args) {
    this.validate(this.azureContainers.entry, args);

    return this.request(this.azureContainers.entry, args);
  }
  /* eslint-disable max-len */
  // Get a shared access signature (SAS) string for use with a specific Azure
  // Blob Storage container.
  // The `level` parameter can be `read-write` or `read-only` and determines
  // which type of credentials are returned.  If level is read-write, it will create the
  // container if it doesn't already exist.
  /* eslint-enable max-len */
  azureContainerSAS(...args) {
    this.validate(this.azureContainerSAS.entry, args);

    return this.request(this.azureContainerSAS.entry, args);
  }
  /* eslint-disable max-len */
  // Get temporary DSN (access credentials) for a sentry project.
  // The credentials returned can be used with any Sentry client for up to
  // 24 hours, after which the credentials will be automatically disabled.
  // If the project doesn't exist it will be created, and assigned to the
  // initial team configured for this component. Contact a Sentry admin
  // to have the project transferred to a team you have access to if needed
  /* eslint-enable max-len */
  sentryDSN(...args) {
    this.validate(this.sentryDSN.entry, args);

    return this.request(this.sentryDSN.entry, args);
  }
  /* eslint-disable max-len */
  // Get a temporary token suitable for use connecting to a
  // [websocktunnel](https://github.com/taskcluster/websocktunnel) server.
  // The resulting token will only be accepted by servers with a matching audience
  // value.  Reaching such a server is the callers responsibility.  In general,
  // a server URL or set of URLs should be provided to the caller as configuration
  // along with the audience value.
  // The token is valid for a limited time (on the scale of hours). Callers should
  // refresh it before expiration.
  /* eslint-enable max-len */
  websocktunnelToken(...args) {
    this.validate(this.websocktunnelToken.entry, args);

    return this.request(this.websocktunnelToken.entry, args);
  }
  /* eslint-disable max-len */
  // Get temporary GCP credentials for the given serviceAccount in the given project.
  // Only preconfigured projects are allowed.  Any serviceAccount in that project may
  // be used.
  // The call adds the necessary policy if the serviceAccount doesn't have it.
  // The credentials are set to expire after an hour, but this behavior is
  // subject to change. Hence, you should always read the `expires` property
  // from the response, if you intend to maintain active credentials in your
  // application.
  /* eslint-enable max-len */
  gcpCredentials(...args) {
    this.validate(this.gcpCredentials.entry, args);

    return this.request(this.gcpCredentials.entry, args);
  }
  /* eslint-disable max-len */
  // Validate the request signature given on input and return list of scopes
  // that the authenticating client has.
  // This method is used by other services that wish rely on Taskcluster
  // credentials for authentication. This way we can use Hawk without having
  // the secret credentials leave this service.
  /* eslint-enable max-len */
  authenticateHawk(...args) {
    this.validate(this.authenticateHawk.entry, args);

    return this.request(this.authenticateHawk.entry, args);
  }
  /* eslint-disable max-len */
  // Utility method to test client implementations of Taskcluster
  // authentication.
  // Rather than using real credentials, this endpoint accepts requests with
  // clientId `tester` and accessToken `no-secret`. That client's scopes are
  // based on `clientScopes` in the request body.
  // The request is validated, with any certificate, authorizedScopes, etc.
  // applied, and the resulting scopes are checked against `requiredScopes`
  // from the request body. On success, the response contains the clientId
  // and scopes as seen by the API method.
  /* eslint-enable max-len */
  testAuthenticate(...args) {
    this.validate(this.testAuthenticate.entry, args);

    return this.request(this.testAuthenticate.entry, args);
  }
  /* eslint-disable max-len */
  // Utility method similar to `testAuthenticate`, but with the GET method,
  // so it can be used with signed URLs (bewits).
  // Rather than using real credentials, this endpoint accepts requests with
  // clientId `tester` and accessToken `no-secret`. That client's scopes are
  // `['test:*', 'auth:create-client:test:*']`.  The call fails if the
  // `test:authenticate-get` scope is not available.
  // The request is validated, with any certificate, authorizedScopes, etc.
  // applied, and the resulting scopes are checked, just like any API call.
  // On success, the response contains the clientId and scopes as seen by
  // the API method.
  // This method may later be extended to allow specification of client and
  // required scopes via query arguments.
  /* eslint-enable max-len */
  testAuthenticateGet(...args) {
    this.validate(this.testAuthenticateGet.entry, args);

    return this.request(this.testAuthenticateGet.entry, args);
  }
}
