// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the Auth service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/auth/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// Authentication related API end-points for Taskcluster and related
// services. These API end-points are of interest if you wish to:
//   - Authorize a request signed with Taskcluster credentials,
//   - Manage clients and roles,
//   - Inspect or audit clients and roles,
//   - Gain access to various services guarded by this API.
//
// See:
//
// # How to use this package
//
// First create an Auth object:
//
//	auth := tcauth.New(nil)
//
// and then call one or more of auth's methods, e.g.:
//
//	err := auth.Ping(.....)
//
// handling any errors...
//
//	if err != nil {
//		// handle error...
//	}
//
// # Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// <rootUrl>/references/auth/v1/api.json together with the input and output schemas it references,
package tcauth

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v94/clients/client-go"
)

type Auth tcclient.Client

// New returns an Auth client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	auth := tcauth.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := auth.Ping(.....)                       // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
func New(credentials *tcclient.Credentials, rootURL string) *Auth {
	return &Auth{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "auth",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns an *Auth configured from environment variables.
//
// The root URL is taken from TASKCLUSTER_PROXY_URL if set to a non-empty
// string, otherwise from TASKCLUSTER_ROOT_URL if set, otherwise the empty
// string.
//
// The credentials are taken from environment variables:
//
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *Auth {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &Auth{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "auth",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (auth *Auth) Ping() error {
	cd := tcclient.Client(*auth)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (auth *Auth) Lbheartbeat() error {
	cd := tcclient.Client(*auth)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (auth *Auth) Version() error {
	cd := tcclient.Client(*auth)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// Get a list of all clients.  With `prefix`, only clients for which
// it is a prefix of the clientId are returned.
//
// By default this end-point will try to return up to 1000 clients in one
// request. But it **may return less, even none**.
// It may also return a `continuationToken` even though there are no more
// results. However, you can only be sure to have seen all results if you
// keep calling `listClients` with the last `continuationToken` until you
// get a result without a `continuationToken`.
//
// Required scopes:
//
//	auth:list-clients
//
// See #listClients
func (auth *Auth) ListClients(continuationToken, limit, prefix string) (*ListClientResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if prefix != "" {
		v.Add("prefix", prefix)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/clients/", new(ListClientResponse), v)
	return responseObject.(*ListClientResponse), err
}

// Returns a signed URL for ListClients, valid for the specified duration.
//
// Required scopes:
//
//	auth:list-clients
//
// See ListClients for more details.
func (auth *Auth) ListClients_SignedURL(continuationToken, limit, prefix string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if prefix != "" {
		v.Add("prefix", prefix)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/clients/", v, duration)
}

// Get information about a single client.
//
// Required scopes:
//
//	auth:get-client:<clientId>
//
// See #client
func (auth *Auth) Client(clientId string) (*GetClientResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/clients/"+url.PathEscape(clientId), new(GetClientResponse), nil)
	return responseObject.(*GetClientResponse), err
}

// Returns a signed URL for Client, valid for the specified duration.
//
// Required scopes:
//
//	auth:get-client:<clientId>
//
// See Client for more details.
func (auth *Auth) Client_SignedURL(clientId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/clients/"+url.PathEscape(clientId), nil, duration)
}

// Create a new client and get the `accessToken` for this client.
// You should store the `accessToken` from this API call as there is no
// other way to retrieve it.
//
// If you lose the `accessToken` you can call `resetAccessToken` to reset
// it, and a new `accessToken` will be returned. You cannot retrieve the
// current `accessToken`.
//
// If a client with the same `clientId` already exists this operation will
// fail. Use `updateClient` if you wish to update an existing client.
//
// The caller's scopes must satisfy `scopes`.
//
// Required scopes:
//
//	All of:
//	* auth:create-client:<clientId>
//	* For scope in scopes each <scope>
//
// See #createClient
func (auth *Auth) CreateClient(clientId string, payload *CreateClientRequest) (*CreateClientResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/clients/"+url.PathEscape(clientId), new(CreateClientResponse), nil)
	return responseObject.(*CreateClientResponse), err
}

// Get entity history based on entity type and entity name
//
// Required scopes:
//
//	auth:audit-history:<entityType>
//
// See #getEntityHistory
func (auth *Auth) GetEntityHistory(entityType, entityId, continuationToken, limit string) (*GetEntityHistoryResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/audit/"+url.PathEscape(entityType)+"/"+url.PathEscape(entityId), new(GetEntityHistoryResponse), v)
	return responseObject.(*GetEntityHistoryResponse), err
}

// Returns a signed URL for GetEntityHistory, valid for the specified duration.
//
// Required scopes:
//
//	auth:audit-history:<entityType>
//
// See GetEntityHistory for more details.
func (auth *Auth) GetEntityHistory_SignedURL(entityType, entityId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/audit/"+url.PathEscape(entityType)+"/"+url.PathEscape(entityId), v, duration)
}

// Get audit history of a client based on clientId.
//
// Required scopes:
//
//	auth:client-audit-history:<clientId>
//
// See #listAuditHistory
func (auth *Auth) ListAuditHistory(clientId, continuationToken, limit string) (*GetEntityHistoryResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/clients/"+url.PathEscape(clientId)+"/audit", new(GetEntityHistoryResponse), v)
	return responseObject.(*GetEntityHistoryResponse), err
}

// Returns a signed URL for ListAuditHistory, valid for the specified duration.
//
// Required scopes:
//
//	auth:client-audit-history:<clientId>
//
// See ListAuditHistory for more details.
func (auth *Auth) ListAuditHistory_SignedURL(clientId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/clients/"+url.PathEscape(clientId)+"/audit", v, duration)
}

// Reset a clients `accessToken`, this will revoke the existing
// `accessToken`, generate a new `accessToken` and return it from this
// call.
//
// There is no way to retrieve an existing `accessToken`, so if you lose it
// you must reset the accessToken to acquire it again.
//
// Required scopes:
//
//	auth:reset-access-token:<clientId>
//
// See #resetAccessToken
func (auth *Auth) ResetAccessToken(clientId string) (*CreateClientResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/clients/"+url.PathEscape(clientId)+"/reset", new(CreateClientResponse), nil)
	return responseObject.(*CreateClientResponse), err
}

// Update an exisiting client. The `clientId` and `accessToken` cannot be
// updated, but `scopes` can be modified.  The caller's scopes must
// satisfy all scopes being added to the client in the update operation.
// If no scopes are given in the request, the client's scopes remain
// unchanged
//
// Required scopes:
//
//	All of:
//	* auth:update-client:<clientId>
//	* For scope in scopesAdded each <scope>
//
// See #updateClient
func (auth *Auth) UpdateClient(clientId string, payload *CreateClientRequest) (*GetClientResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/clients/"+url.PathEscape(clientId), new(GetClientResponse), nil)
	return responseObject.(*GetClientResponse), err
}

// Enable a client that was disabled with `disableClient`.  If the client
// is already enabled, this does nothing.
//
// This is typically used by identity providers to re-enable clients that
// had been disabled when the corresponding identity's scopes changed.
//
// Required scopes:
//
//	auth:enable-client:<clientId>
//
// See #enableClient
func (auth *Auth) EnableClient(clientId string) (*GetClientResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/clients/"+url.PathEscape(clientId)+"/enable", new(GetClientResponse), nil)
	return responseObject.(*GetClientResponse), err
}

// Disable a client.  If the client is already disabled, this does nothing.
//
// This is typically used by identity providers to disable clients when the
// corresponding identity's scopes no longer satisfy the client's scopes.
//
// Required scopes:
//
//	auth:disable-client:<clientId>
//
// See #disableClient
func (auth *Auth) DisableClient(clientId string) (*GetClientResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "POST", "/clients/"+url.PathEscape(clientId)+"/disable", new(GetClientResponse), nil)
	return responseObject.(*GetClientResponse), err
}

// Delete a client, please note that any roles related to this client must
// be deleted independently.
//
// Required scopes:
//
//	auth:delete-client:<clientId>
//
// See #deleteClient
func (auth *Auth) DeleteClient(clientId string) error {
	cd := tcclient.Client(*auth)
	_, _, err := (&cd).APICall(nil, "DELETE", "/clients/"+url.PathEscape(clientId), nil, nil)
	return err
}

// Get a list of all roles. Each role object also includes the list of
// scopes it expands to.  This always returns all roles in a single HTTP
// request.
//
// To get paginated results, use `listRoles2`.
//
// Required scopes:
//
//	auth:list-roles
//
// See #listRoles
func (auth *Auth) ListRoles() (*GetAllRolesNoPagination, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/roles/", new(GetAllRolesNoPagination), nil)
	return responseObject.(*GetAllRolesNoPagination), err
}

// Returns a signed URL for ListRoles, valid for the specified duration.
//
// Required scopes:
//
//	auth:list-roles
//
// See ListRoles for more details.
func (auth *Auth) ListRoles_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/roles/", nil, duration)
}

// Get a list of all roles. Each role object also includes the list of
// scopes it expands to.  This is similar to `listRoles` but differs in the
// format of the response.
//
// If no limit is given, all roles are returned. Since this
// list may become long, callers can use the `limit` and `continuationToken`
// query arguments to page through the responses.
//
// Required scopes:
//
//	auth:list-roles
//
// See #listRoles2
func (auth *Auth) ListRoles2(continuationToken, limit string) (*GetAllRolesResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/roles2/", new(GetAllRolesResponse), v)
	return responseObject.(*GetAllRolesResponse), err
}

// Returns a signed URL for ListRoles2, valid for the specified duration.
//
// Required scopes:
//
//	auth:list-roles
//
// See ListRoles2 for more details.
func (auth *Auth) ListRoles2_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/roles2/", v, duration)
}

// Get a list of all role IDs.
//
// If no limit is given, the roleIds of all roles are returned. Since this
// list may become long, callers can use the `limit` and `continuationToken`
// query arguments to page through the responses.
//
// Required scopes:
//
//	auth:list-roles
//
// See #listRoleIds
func (auth *Auth) ListRoleIds(continuationToken, limit string) (*GetRoleIdsResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/roleids/", new(GetRoleIdsResponse), v)
	return responseObject.(*GetRoleIdsResponse), err
}

// Returns a signed URL for ListRoleIds, valid for the specified duration.
//
// Required scopes:
//
//	auth:list-roles
//
// See ListRoleIds for more details.
func (auth *Auth) ListRoleIds_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/roleids/", v, duration)
}

// Get information about a single role, including the set of scopes that the
// role expands to.
//
// Required scopes:
//
//	auth:get-role:<roleId>
//
// See #role
func (auth *Auth) Role(roleId string) (*GetRoleResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/roles/"+url.PathEscape(roleId), new(GetRoleResponse), nil)
	return responseObject.(*GetRoleResponse), err
}

// Returns a signed URL for Role, valid for the specified duration.
//
// Required scopes:
//
//	auth:get-role:<roleId>
//
// See Role for more details.
func (auth *Auth) Role_SignedURL(roleId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/roles/"+url.PathEscape(roleId), nil, duration)
}

// Create a new role.
//
// The caller's scopes must satisfy the new role's scopes.
//
// If there already exists a role with the same `roleId` this operation
// will fail. Use `updateRole` to modify an existing role.
//
// Creation of a role that will generate an infinite expansion will result
// in an error response.
//
// Required scopes:
//
//	All of:
//	* auth:create-role:<roleId>
//	* For scope in scopes each <scope>
//
// See #createRole
func (auth *Auth) CreateRole(roleId string, payload *CreateRoleRequest) (*GetRoleResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/roles/"+url.PathEscape(roleId), new(GetRoleResponse), nil)
	return responseObject.(*GetRoleResponse), err
}

// Update an existing role.
//
// The caller's scopes must satisfy all of the new scopes being added, but
// need not satisfy all of the role's existing scopes.
//
// An update of a role that will generate an infinite expansion will result
// in an error response.
//
// Required scopes:
//
//	All of:
//	* auth:update-role:<roleId>
//	* For scope in scopesAdded each <scope>
//
// See #updateRole
func (auth *Auth) UpdateRole(roleId string, payload *CreateRoleRequest) (*GetRoleResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/roles/"+url.PathEscape(roleId), new(GetRoleResponse), nil)
	return responseObject.(*GetRoleResponse), err
}

// Delete a role. This operation will succeed regardless of whether or not
// the role exists.
//
// Required scopes:
//
//	auth:delete-role:<roleId>
//
// See #deleteRole
func (auth *Auth) DeleteRole(roleId string) error {
	cd := tcclient.Client(*auth)
	_, _, err := (&cd).APICall(nil, "DELETE", "/roles/"+url.PathEscape(roleId), nil, nil)
	return err
}

// Return an expanded copy of the given scopeset, with scopes implied by any
// roles included.
//
// Required scopes:
//
//	auth:expand-scopes
//
// See #expandScopes
func (auth *Auth) ExpandScopes(payload *SetOfScopes) (*SetOfScopes, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/scopes/expand", new(SetOfScopes), nil)
	return responseObject.(*SetOfScopes), err
}

// Return the expanded scopes available in the request, taking into account all sources
// of scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,
// and roles).
//
// Required scopes:
//
//	auth:current-scopes
//
// See #currentScopes
func (auth *Auth) CurrentScopes() (*SetOfScopes, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/scopes/current", new(SetOfScopes), nil)
	return responseObject.(*SetOfScopes), err
}

// Returns a signed URL for CurrentScopes, valid for the specified duration.
//
// Required scopes:
//
//	auth:current-scopes
//
// See CurrentScopes for more details.
func (auth *Auth) CurrentScopes_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/scopes/current", nil, duration)
}

// Get temporary AWS credentials for `read-write` or `read-only` access to
// a given `bucket` and `prefix` within that bucket.
// The `level` parameter can be `read-write` or `read-only` and determines
// which type of credentials are returned. Please note that the `level`
// parameter is required in the scope guarding access.  The bucket name must
// not contain `.`, as recommended by Amazon.
//
// This method can only allow access to a whitelisted set of buckets, as configured
// in the Taskcluster deployment
//
// The credentials are set to expire after an hour, but this behavior is
// subject to change. Hence, you should always read the `expires` property
// from the response, if you intend to maintain active credentials in your
// application.
//
// Please note that your `prefix` may not start with slash `/`. Such a prefix
// is allowed on S3, but we forbid it here to discourage bad behavior.
//
// Also note that if your `prefix` doesn't end in a slash `/`, the STS
// credentials may allow access to unexpected keys, as S3 does not treat
// slashes specially.  For example, a prefix of `my-folder` will allow
// access to `my-folder/file.txt` as expected, but also to `my-folder.txt`,
// which may not be intended.
//
// Finally, note that the `PutObjectAcl` call is not allowed.  Passing a canned
// ACL other than `private` to `PutObject` is treated as a `PutObjectAcl` call, and
// will result in an access-denied error from AWS.  This limitation is due to a
// security flaw in Amazon S3 which might otherwise allow indefinite access to
// uploaded objects.
//
// **EC2 metadata compatibility**, if the querystring parameter
// `?format=iam-role-compat` is given, the response will be compatible
// with the JSON exposed by the EC2 metadata service. This aims to ease
// compatibility for libraries and tools built to auto-refresh credentials.
// For details on the format returned by EC2 metadata service see:
// [EC2 User Guide](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#instance-metadata-security-credentials).
//
// Required scopes:
//
//	If levelIsReadOnly:
//	  Any of:
//	  - auth:aws-s3:read-only:<bucket>/<prefix>
//	  - auth:aws-s3:read-write:<bucket>/<prefix>
//
// See #awsS3Credentials
func (auth *Auth) AwsS3Credentials(level, bucket, prefix, format string) (*AWSS3CredentialsResponse, error) {
	v := url.Values{}
	if format != "" {
		v.Add("format", format)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/aws/s3/"+url.PathEscape(level)+"/"+url.PathEscape(bucket)+"/"+url.PathEscape(prefix), new(AWSS3CredentialsResponse), v)
	return responseObject.(*AWSS3CredentialsResponse), err
}

// Returns a signed URL for AwsS3Credentials, valid for the specified duration.
//
// Required scopes:
//
//	If levelIsReadOnly:
//	  Any of:
//	  - auth:aws-s3:read-only:<bucket>/<prefix>
//	  - auth:aws-s3:read-write:<bucket>/<prefix>
//
// See AwsS3Credentials for more details.
func (auth *Auth) AwsS3Credentials_SignedURL(level, bucket, prefix, format string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if format != "" {
		v.Add("format", format)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/aws/s3/"+url.PathEscape(level)+"/"+url.PathEscape(bucket)+"/"+url.PathEscape(prefix), v, duration)
}

// Stability: *** DEPRECATED ***
//
// Retrieve a list of all Azure accounts managed by Taskcluster Auth.
//
// Required scopes:
//
//	auth:azure-table:list-accounts
//
// See #azureAccounts
func (auth *Auth) AzureAccounts() (*AzureListAccountResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/azure/accounts", new(AzureListAccountResponse), nil)
	return responseObject.(*AzureListAccountResponse), err
}

// Returns a signed URL for AzureAccounts, valid for the specified duration.
//
// Required scopes:
//
//	auth:azure-table:list-accounts
//
// See AzureAccounts for more details.
func (auth *Auth) AzureAccounts_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/azure/accounts", nil, duration)
}

// Stability: *** DEPRECATED ***
//
// Retrieve a list of all tables in an account.
//
// Required scopes:
//
//	auth:azure-table:list-tables:<account>
//
// See #azureTables
func (auth *Auth) AzureTables(account, continuationToken string) (*AzureListTableResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/azure/"+url.PathEscape(account)+"/tables", new(AzureListTableResponse), v)
	return responseObject.(*AzureListTableResponse), err
}

// Returns a signed URL for AzureTables, valid for the specified duration.
//
// Required scopes:
//
//	auth:azure-table:list-tables:<account>
//
// See AzureTables for more details.
func (auth *Auth) AzureTables_SignedURL(account, continuationToken string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/azure/"+url.PathEscape(account)+"/tables", v, duration)
}

// Stability: *** DEPRECATED ***
//
// Get a shared access signature (SAS) string for use with a specific Azure
// Table Storage table.
//
// The `level` parameter can be `read-write` or `read-only` and determines
// which type of credentials are returned.  If level is read-write, it will create the
// table if it doesn't already exist.
//
// Required scopes:
//
//	If levelIsReadOnly:
//	  Any of:
//	  - auth:azure-table:read-only:<account>/<table>
//	  - auth:azure-table:read-write:<account>/<table>
//
// See #azureTableSAS
func (auth *Auth) AzureTableSAS(account, table, level string) (*AzureTableSharedAccessSignature, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/azure/"+url.PathEscape(account)+"/table/"+url.PathEscape(table)+"/"+url.PathEscape(level), new(AzureTableSharedAccessSignature), nil)
	return responseObject.(*AzureTableSharedAccessSignature), err
}

// Returns a signed URL for AzureTableSAS, valid for the specified duration.
//
// Required scopes:
//
//	If levelIsReadOnly:
//	  Any of:
//	  - auth:azure-table:read-only:<account>/<table>
//	  - auth:azure-table:read-write:<account>/<table>
//
// See AzureTableSAS for more details.
func (auth *Auth) AzureTableSAS_SignedURL(account, table, level string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/azure/"+url.PathEscape(account)+"/table/"+url.PathEscape(table)+"/"+url.PathEscape(level), nil, duration)
}

// Stability: *** DEPRECATED ***
//
// Retrieve a list of all containers in an account.
//
// Required scopes:
//
//	auth:azure-container:list-containers:<account>
//
// See #azureContainers
func (auth *Auth) AzureContainers(account, continuationToken string) (*AzureListContainersResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/azure/"+url.PathEscape(account)+"/containers", new(AzureListContainersResponse), v)
	return responseObject.(*AzureListContainersResponse), err
}

// Returns a signed URL for AzureContainers, valid for the specified duration.
//
// Required scopes:
//
//	auth:azure-container:list-containers:<account>
//
// See AzureContainers for more details.
func (auth *Auth) AzureContainers_SignedURL(account, continuationToken string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/azure/"+url.PathEscape(account)+"/containers", v, duration)
}

// Stability: *** DEPRECATED ***
//
// Get a shared access signature (SAS) string for use with a specific Azure
// Blob Storage container.
//
// The `level` parameter can be `read-write` or `read-only` and determines
// which type of credentials are returned.  If level is read-write, it will create the
// container if it doesn't already exist.
//
// Required scopes:
//
//	If levelIsReadOnly:
//	  Any of:
//	  - auth:azure-container:read-only:<account>/<container>
//	  - auth:azure-container:read-write:<account>/<container>
//
// See #azureContainerSAS
func (auth *Auth) AzureContainerSAS(account, container, level string) (*AzureBlobSharedAccessSignature, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/azure/"+url.PathEscape(account)+"/containers/"+url.PathEscape(container)+"/"+url.PathEscape(level), new(AzureBlobSharedAccessSignature), nil)
	return responseObject.(*AzureBlobSharedAccessSignature), err
}

// Returns a signed URL for AzureContainerSAS, valid for the specified duration.
//
// Required scopes:
//
//	If levelIsReadOnly:
//	  Any of:
//	  - auth:azure-container:read-only:<account>/<container>
//	  - auth:azure-container:read-write:<account>/<container>
//
// See AzureContainerSAS for more details.
func (auth *Auth) AzureContainerSAS_SignedURL(account, container, level string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/azure/"+url.PathEscape(account)+"/containers/"+url.PathEscape(container)+"/"+url.PathEscape(level), nil, duration)
}

// Get temporary DSN (access credentials) for a sentry project.
// The credentials returned can be used with any Sentry client for up to
// 24 hours, after which the credentials will be automatically disabled.
//
// If the project doesn't exist it will be created, and assigned to the
// initial team configured for this component. Contact a Sentry admin
// to have the project transferred to a team you have access to if needed
//
// Required scopes:
//
//	auth:sentry:<project>
//
// See #sentryDSN
func (auth *Auth) SentryDSN(project string) (*SentryDSNResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/sentry/"+url.PathEscape(project)+"/dsn", new(SentryDSNResponse), nil)
	return responseObject.(*SentryDSNResponse), err
}

// Returns a signed URL for SentryDSN, valid for the specified duration.
//
// Required scopes:
//
//	auth:sentry:<project>
//
// See SentryDSN for more details.
func (auth *Auth) SentryDSN_SignedURL(project string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/sentry/"+url.PathEscape(project)+"/dsn", nil, duration)
}

// Get a temporary token suitable for use connecting to a
// [websocktunnel](https://github.com/taskcluster/taskcluster/tree/main/tools/websocktunnel) server.
//
// The resulting token will only be accepted by servers with a matching audience
// value.  Reaching such a server is the callers responsibility.  In general,
// a server URL or set of URLs should be provided to the caller as configuration
// along with the audience value.
//
// The token is valid for a limited time (on the scale of hours). Callers should
// refresh it before expiration.
//
// Required scopes:
//
//	auth:websocktunnel-token:<wstAudience>/<wstClient>
//
// See #websocktunnelToken
func (auth *Auth) WebsocktunnelToken(wstAudience, wstClient string) (*WebsocktunnelTokenResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/websocktunnel/"+url.PathEscape(wstAudience)+"/"+url.PathEscape(wstClient), new(WebsocktunnelTokenResponse), nil)
	return responseObject.(*WebsocktunnelTokenResponse), err
}

// Returns a signed URL for WebsocktunnelToken, valid for the specified duration.
//
// Required scopes:
//
//	auth:websocktunnel-token:<wstAudience>/<wstClient>
//
// See WebsocktunnelToken for more details.
func (auth *Auth) WebsocktunnelToken_SignedURL(wstAudience, wstClient string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/websocktunnel/"+url.PathEscape(wstAudience)+"/"+url.PathEscape(wstClient), nil, duration)
}

// Get temporary GCP credentials for the given serviceAccount in the given project.
//
// Only preconfigured projects and serviceAccounts are allowed, as defined in the
// deployment of the Taskcluster services.
//
// The credentials are set to expire after an hour, but this behavior is
// subject to change. Hence, you should always read the `expires` property
// from the response, if you intend to maintain active credentials in your
// application.
//
// Required scopes:
//
//	auth:gcp:access-token:<projectId>/<serviceAccount>
//
// See #gcpCredentials
func (auth *Auth) GcpCredentials(projectId, serviceAccount string) (*GCPCredentialsResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/gcp/credentials/"+url.PathEscape(projectId)+"/"+url.PathEscape(serviceAccount), new(GCPCredentialsResponse), nil)
	return responseObject.(*GCPCredentialsResponse), err
}

// Returns a signed URL for GcpCredentials, valid for the specified duration.
//
// Required scopes:
//
//	auth:gcp:access-token:<projectId>/<serviceAccount>
//
// See GcpCredentials for more details.
func (auth *Auth) GcpCredentials_SignedURL(projectId, serviceAccount string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/gcp/credentials/"+url.PathEscape(projectId)+"/"+url.PathEscape(serviceAccount), nil, duration)
}

// Validate the request signature given on input and return list of scopes
// that the authenticating client has.
//
// This method is used by other services that wish rely on Taskcluster
// credentials for authentication. This way we can use Hawk without having
// the secret credentials leave this service.
//
// See #authenticateHawk
func (auth *Auth) AuthenticateHawk(payload *HawkSignatureAuthenticationRequest) (*HawkSignatureAuthenticationResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/authenticate-hawk", new(HawkSignatureAuthenticationResponse), nil)
	return responseObject.(*HawkSignatureAuthenticationResponse), err
}

// Utility method to test client implementations of Taskcluster
// authentication.
//
// Rather than using real credentials, this endpoint accepts requests with
// clientId `tester` and accessToken `no-secret`. That client's scopes are
// based on `clientScopes` in the request body.
//
// The request is validated, with any certificate, authorizedScopes, etc.
// applied, and the resulting scopes are checked against `requiredScopes`
// from the request body. On success, the response contains the clientId
// and scopes as seen by the API method.
//
// See #testAuthenticate
func (auth *Auth) TestAuthenticate(payload *TestAuthenticateRequest) (*TestAuthenticateResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/test-authenticate", new(TestAuthenticateResponse), nil)
	return responseObject.(*TestAuthenticateResponse), err
}

// Utility method similar to `testAuthenticate`, but with the GET method,
// so it can be used with signed URLs (bewits).
//
// Rather than using real credentials, this endpoint accepts requests with
// clientId `tester` and accessToken `no-secret`. That client's scopes are
// `['test:*', 'auth:create-client:test:*']`.  The call fails if the
// `test:authenticate-get` scope is not available.
//
// The request is validated, with any certificate, authorizedScopes, etc.
// applied, and the resulting scopes are checked, just like any API call.
// On success, the response contains the clientId and scopes as seen by
// the API method.
//
// This method may later be extended to allow specification of client and
// required scopes via query arguments.
//
// See #testAuthenticateGet
func (auth *Auth) TestAuthenticateGet() (*TestAuthenticateResponse, error) {
	cd := tcclient.Client(*auth)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/test-authenticate-get/", new(TestAuthenticateResponse), nil)
	return responseObject.(*TestAuthenticateResponse), err
}

// Returns a signed URL for TestAuthenticateGet, valid for the specified duration.
//
// See TestAuthenticateGet for more details.
func (auth *Auth) TestAuthenticateGet_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*auth)
	return (&cd).SignedURL("/test-authenticate-get/", nil, duration)
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (auth *Auth) Heartbeat() error {
	cd := tcclient.Client(*auth)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
