// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/auth/v1/api.json

// Authentication related API end-points for TaskCluster and related
// services. These API end-points are of interest if you wish to:
//   * Authenticate request signed with TaskCluster credentials,
//   * Manage clients and roles,
//   * Inspect or audit clients and roles,
//   * Gain access to various services guarded by this API.
//
// ### Clients
// The authentication service manages _clients_, at a high-level each client
// consists of a `clientId`, an `accessToken`, expiration and description.
// The `clientId` and `accessToken` can be used for authentication when
// calling TaskCluster APIs.
//
// Each client is assigned a single scope on the form:
// `assume:client-id:<clientId>`, this scope doesn't really do much on its
// own. But when you dive into the roles section you'll see that you can
// create a role: `client-id:<clientId>` that assigns scopes to the client.
// This way it's easy to audit all scope assignments, by only listing roles.
//
// ### Roles
// A _role_ consists of a `roleId`, a set of scopes and a description.
// Each role constitutes a simple _expansion rule_ that says if you have
// the scope: `assume:<roleId>` you get the set of scopes the role has.
// Think of the `assume:<roleId>` as a scope that allows a client to assume
// a role.
//
// As in scopes the `*` kleene star also have special meaning if it is
// located at the end of a `roleId`. If you have a role with the following
// `roleId`: `my-prefix*`, then any client which has a scope staring with
// `assume:my-prefix` will be allowed to assume the role.
//
// As previously mentioned each client gets the scope:
// `assume:client-id:<clientId>`, it trivially follows that you can create a
// role with the `roleId`: `client-id:<clientId>` to assign additional
// scopes to a client. You can also create a role `client-id:user-*`
// if you wish to assign a set of scopes to all clients whose `clientId`
// starts with `user-`.
//
// ### Guarded Services
// The authentication service also has API end-points for delegating access
// to some guarded service such as AWS S3, or Azure Table Storage.
// Generally, we add API end-points to this server when we wish to use
// TaskCluster credentials to grant access to a third-party service used
// by many TaskCluster components.
//
// See: http://docs.taskcluster.net/auth/api-docs
//
// How to use this package
//
// First create an Auth object:
//
//  myAuth := auth.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of myAuth's methods, e.g.:
//
//  data, callSummary, err := myAuth.ListClients(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/auth/v1/api.json together with the input and output schemas it references, downloaded on
// Fri, 22 Jan 2016 at 14:27:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package auth

import (
	"encoding/json"
	"errors"
	"net/url"
	"time"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

type Auth tcclient.ConnectionData

// Returns a pointer to Auth, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := &tcclient.Credentials{
//  	ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  myAuth := auth.New(creds)                              // set credentials
//  myAuth.Authenticate = false                            // disable authentication (creds above are now ignored)
//  myAuth.BaseURL = "http://localhost:1234/api/Auth/v1"   // alternative API endpoint (production by default)
//  data, callSummary, err := myAuth.ListClients(.....)    // for example, call the ListClients(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Auth {
	myAuth := Auth(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://auth.taskcluster.net/v1",
		Authenticate: true,
	})
	return &myAuth
}

// Get a list of all clients.
//
// See http://docs.taskcluster.net/auth/api-docs/#listClients
func (myAuth *Auth) ListClients() (*ListClientResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/clients/", new(ListClientResponse), nil)
	return responseObject.(*ListClientResponse), callSummary, err
}

// Get information about a single client.
//
// See http://docs.taskcluster.net/auth/api-docs/#client
func (myAuth *Auth) Client(clientId string) (*GetClientResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/clients/"+url.QueryEscape(clientId), new(GetClientResponse), nil)
	return responseObject.(*GetClientResponse), callSummary, err
}

// Create a new client and get the `accessToken` for this client.
// You should store the `accessToken` from this API call as there is no
// other way to retrieve it.
//
// If you loose the `accessToken` you can call `resetAccessToken` to reset
// it, and a new `accessToken` will be returned, but you cannot retrieve the
// current `accessToken`.
//
// If a client with the same `clientId` already exists this operation will
// fail. Use `updateClient` if you wish to update an existing client.
//
// Required scopes:
//   * auth:create-client:<clientId>
//
// See http://docs.taskcluster.net/auth/api-docs/#createClient
func (myAuth *Auth) CreateClient(clientId string, payload *CreateClientRequest) (*CreateClientResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(payload, "PUT", "/clients/"+url.QueryEscape(clientId), new(CreateClientResponse), nil)
	return responseObject.(*CreateClientResponse), callSummary, err
}

// Reset a clients `accessToken`, this will revoke the existing
// `accessToken`, generate a new `accessToken` and return it from this
// call.
//
// There is no way to retrieve an existing `accessToken`, so if you loose it
// you must reset the accessToken to acquire it again.
//
// Required scopes:
//   * auth:reset-access-token:<clientId>
//
// See http://docs.taskcluster.net/auth/api-docs/#resetAccessToken
func (myAuth *Auth) ResetAccessToken(clientId string) (*CreateClientResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(nil, "POST", "/clients/"+url.QueryEscape(clientId)+"/reset", new(CreateClientResponse), nil)
	return responseObject.(*CreateClientResponse), callSummary, err
}

// Update an exisiting client. This is really only useful for changing the
// description and expiration, as you won't be allowed to the `clientId`
// or `accessToken`.
//
// Required scopes:
//   * auth:update-client:<clientId>
//
// See http://docs.taskcluster.net/auth/api-docs/#updateClient
func (myAuth *Auth) UpdateClient(clientId string, payload *CreateClientRequest) (*GetClientResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/clients/"+url.QueryEscape(clientId), new(GetClientResponse), nil)
	return responseObject.(*GetClientResponse), callSummary, err
}

// Delete a client, please note that any roles related to this client must
// be deleted independently.
//
// Required scopes:
//   * auth:delete-client:<clientId>
//
// See http://docs.taskcluster.net/auth/api-docs/#deleteClient
func (myAuth *Auth) DeleteClient(clientId string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	_, callSummary, err := (&cd).APICall(nil, "DELETE", "/clients/"+url.QueryEscape(clientId), nil, nil)
	return callSummary, err
}

// Get a list of all roles, each role object also includes the list of
// scopes it expands to.
//
// See http://docs.taskcluster.net/auth/api-docs/#listRoles
func (myAuth *Auth) ListRoles() (*ListRolesResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/roles/", new(ListRolesResponse), nil)
	return responseObject.(*ListRolesResponse), callSummary, err
}

// Get information about a single role, including the set of scopes that the
// role expands to.
//
// See http://docs.taskcluster.net/auth/api-docs/#role
func (myAuth *Auth) Role(roleId string) (*GetRoleResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/roles/"+url.QueryEscape(roleId), new(GetRoleResponse), nil)
	return responseObject.(*GetRoleResponse), callSummary, err
}

// Create a new role.
//
// The caller's scopes must satisfy the new role's scopes.
//
// If there already exists a role with the same `roleId` this operation
// will fail. Use `updateRole` to modify an existing role.
//
// Required scopes:
//   * auth:create-role:<roleId>
//
// See http://docs.taskcluster.net/auth/api-docs/#createRole
func (myAuth *Auth) CreateRole(roleId string, payload *CreateRoleRequest) (*GetRoleResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(payload, "PUT", "/roles/"+url.QueryEscape(roleId), new(GetRoleResponse), nil)
	return responseObject.(*GetRoleResponse), callSummary, err
}

// Update an existing role.
//
// The caller's scopes must satisfy all of the new scopes being added, but
// need not satisfy all of the client's existing scopes.
//
// Required scopes:
//   * auth:update-role:<roleId>
//
// See http://docs.taskcluster.net/auth/api-docs/#updateRole
func (myAuth *Auth) UpdateRole(roleId string, payload *CreateRoleRequest) (*GetRoleResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/roles/"+url.QueryEscape(roleId), new(GetRoleResponse), nil)
	return responseObject.(*GetRoleResponse), callSummary, err
}

// Delete a role. This operation will succeed regardless of whether or not
// the role exists.
//
// Required scopes:
//   * auth:delete-role:<roleId>
//
// See http://docs.taskcluster.net/auth/api-docs/#deleteRole
func (myAuth *Auth) DeleteRole(roleId string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	_, callSummary, err := (&cd).APICall(nil, "DELETE", "/roles/"+url.QueryEscape(roleId), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Get temporary AWS credentials for `read-write` or `read-only` access to
// a given `bucket` and `prefix` within that bucket.
// The `level` parameter can be `read-write` or `read-only` and determines
// which type of credentials are returned. Please note that the `level`
// parameter is required in the scope guarding access.
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
// Required scopes:
//   * auth:aws-s3:<level>:<bucket>/<prefix>
//
// See http://docs.taskcluster.net/auth/api-docs/#awsS3Credentials
func (myAuth *Auth) AwsS3Credentials(level, bucket, prefix string) (*AWSS3CredentialsResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/aws/s3/"+url.QueryEscape(level)+"/"+url.QueryEscape(bucket)+"/"+url.QueryEscape(prefix), new(AWSS3CredentialsResponse), nil)
	return responseObject.(*AWSS3CredentialsResponse), callSummary, err
}

// Returns a signed URL for AwsS3Credentials, valid for the specified duration.
//
// Required scopes:
//   * auth:aws-s3:<level>:<bucket>/<prefix>
//
// See AwsS3Credentials for more details.
func (myAuth *Auth) AwsS3Credentials_SignedURL(level, bucket, prefix string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.ConnectionData(*myAuth)
	return (&cd).SignedURL("/aws/s3/"+url.QueryEscape(level)+"/"+url.QueryEscape(bucket)+"/"+url.QueryEscape(prefix), nil, duration)
}

// Get a shared access signature (SAS) string for use with a specific Azure
// Table Storage table.  Note, this will create the table, if it doesn't
// already exist.
//
// Required scopes:
//   * auth:azure-table-access:<account>/<table>
//
// See http://docs.taskcluster.net/auth/api-docs/#azureTableSAS
func (myAuth *Auth) AzureTableSAS(account, table string) (*AzureSharedAccessSignatureResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/azure/"+url.QueryEscape(account)+"/table/"+url.QueryEscape(table)+"/read-write", new(AzureSharedAccessSignatureResponse), nil)
	return responseObject.(*AzureSharedAccessSignatureResponse), callSummary, err
}

// Returns a signed URL for AzureTableSAS, valid for the specified duration.
//
// Required scopes:
//   * auth:azure-table-access:<account>/<table>
//
// See AzureTableSAS for more details.
func (myAuth *Auth) AzureTableSAS_SignedURL(account, table string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.ConnectionData(*myAuth)
	return (&cd).SignedURL("/azure/"+url.QueryEscape(account)+"/table/"+url.QueryEscape(table)+"/read-write", nil, duration)
}

// Validate the request signature given on input and return list of scopes
// that the authenticating client has.
//
// This method is used by other services that wish rely on TaskCluster
// credentials for authentication. This way we can use Hawk without having
// the secret credentials leave this service.
//
// See http://docs.taskcluster.net/auth/api-docs/#authenticateHawk
func (myAuth *Auth) AuthenticateHawk(payload *HawkSignatureAuthenticationRequest) (*HawkSignatureAuthenticationResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/authenticate-hawk", new(HawkSignatureAuthenticationResponse), nil)
	return responseObject.(*HawkSignatureAuthenticationResponse), callSummary, err
}

// Stability: *** DEPRECATED ***
//
// Import client from JSON list, overwriting any clients that already
// exists. Returns a list of all clients imported.
//
// Required scopes:
//   * auth:import-clients, and
//   * auth:create-client, and
//   * auth:credentials
//
// See http://docs.taskcluster.net/auth/api-docs/#importClients
func (myAuth *Auth) ImportClients(payload *ExportedClients) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	_, callSummary, err := (&cd).APICall(payload, "POST", "/import-clients", nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/auth/api-docs/#ping
func (myAuth *Auth) Ping() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*myAuth)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}

type (

	// Request to authenticate a hawk request.
	//
	// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#
	HawkSignatureAuthenticationRequest struct {

		// Authorization header, **must** only be specified if request being
		// authenticated has a `Authorization` header.
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#/properties/authorization
		Authorization string `json:"authorization"`

		// Host for which the request came in, this is typically the `Host` header
		// excluding the port if any.
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#/properties/host
		Host string `json:"host"`

		// HTTP method of the request being authenticated.
		//
		// Possible values:
		//   * "get"
		//   * "post"
		//   * "put"
		//   * "head"
		//   * "delete"
		//   * "options"
		//   * "trace"
		//   * "copy"
		//   * "lock"
		//   * "mkcol"
		//   * "move"
		//   * "purge"
		//   * "propfind"
		//   * "proppatch"
		//   * "unlock"
		//   * "report"
		//   * "mkactivity"
		//   * "checkout"
		//   * "merge"
		//   * "m-search"
		//   * "notify"
		//   * "subscribe"
		//   * "unsubscribe"
		//   * "patch"
		//   * "search"
		//   * "connect"
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#/properties/method
		Method string `json:"method"`

		// Port on which the request came in, this is typically `80` or `443`.
		// If you are running behind a reverse proxy look for the `x-forwarded-port`
		// header.
		//
		// Mininum:    0
		// Maximum:    65535
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#/properties/port
		Port int `json:"port"`

		// Resource the request operates on including querystring. This is the
		// string that follows the HTTP method.
		// **Note,** order of querystring elements is important.
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#/properties/resource
		Resource string `json:"resource"`
	}

	// Response from a request to authenticate a hawk request.
	//
	// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#
	HawkSignatureAuthenticationResponse json.RawMessage

	// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[0]
	AuthenticationSuccessfulResponse struct {

		// Payload as extracted from `Authentication` header. This property is
		// only present if a hash is available. You are not required to validate
		// this hash, but if you do, please check `scheme` to ensure that it's
		// on a scheme you support.
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[0]/properties/hash
		Hash string `json:"hash"`

		// Authentication scheme the client used. Generally, you don't need to
		// read this property unless `hash` is provided and you want to validate
		// the payload hash. Additional values may be added in the future.
		//
		// Possible values:
		//   * "hawk"
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[0]/properties/scheme
		Scheme string `json:"scheme"`

		// List of scopes the client is authorized to access.  Scopes must be
		// composed of printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[0]/properties/scopes
		Scopes []string `json:"scopes"`

		// The kind of response, `auth-failed` or `auth-success`.
		//
		// Possible values:
		//   * "auth-success"
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[0]/properties/status
		Status string `json:"status"`
	}

	// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[1]
	AuthenticationFailedResponse struct {

		// Message saying why the authentication failed.
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[1]/properties/message
		Message string `json:"message"`

		// The kind of response, `auth-failed` or `auth-success`.
		//
		// Possible values:
		//   * "auth-failed"
		//
		// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#/anyOf[1]/properties/status
		Status string `json:"status"`
	}

	// Response for a request to get access to an S3 bucket.
	//
	// See http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#
	AWSS3CredentialsResponse struct {

		// Temporary STS credentials for use when operating on S3
		//
		// See http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#/properties/credentials
		Credentials struct {

			// Access key identifier that identifies the temporary security
			// credentials.
			//
			// See http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#/properties/credentials/properties/accessKeyId
			AccessKeyId string `json:"accessKeyId"`

			// Secret access key used to sign requests
			//
			// See http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#/properties/credentials/properties/secretAccessKey
			SecretAccessKey string `json:"secretAccessKey"`

			// A token that must passed with request to use the temporary
			// security credentials.
			//
			// See http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#/properties/credentials/properties/sessionToken
			SessionToken string `json:"sessionToken"`
		} `json:"credentials"`

		// Date and time of when the temporary credentials expires.
		//
		// See http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#/properties/expires
		Expires tcclient.Time `json:"expires"`
	}

	// Response to a request for an Shared-Access-Signature to access and Azure
	// Table Storage table.
	//
	// See http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#
	AzureSharedAccessSignatureResponse struct {

		// Date and time of when the Shared-Access-Signature expires.
		//
		// See http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#/properties/expiry
		Expiry tcclient.Time `json:"expiry"`

		// Shared-Access-Signature string. This is the querystring parameters to
		// be appened after `?` or `&` depending on whether or not a querystring is
		// already present in the URL.
		//
		// See http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#/properties/sas
		Sas string `json:"sas"`
	}

	// Properties to create a client.
	//
	// See http://schemas.taskcluster.net/auth/v1/create-client-request.json#
	CreateClientRequest struct {

		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		//
		// Max length: 10240
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-request.json#/properties/description
		Description string `json:"description"`

		// Date and time where the clients access is set to expire
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-request.json#/properties/expires
		Expires tcclient.Time `json:"expires"`
	}

	// All details about a client including the `accessToken`
	//
	// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#
	CreateClientResponse struct {

		// AccessToken used for authenticating requests, you should store this
		// you won't be able to retrive it again!
		//
		// Syntax:     ^[a-zA-Z0-9_-]{22,66}$
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/accessToken
		AccessToken string `json:"accessToken"`

		// ClientId of the client
		//
		// Syntax:     ^[A-Za-z0-9@/:._-]+$
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/clientId
		ClientId string `json:"clientId"`

		// Date and time when this client was created
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/created
		Created tcclient.Time `json:"created"`

		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		//
		// Max length: 10240
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/description
		Description string `json:"description"`

		// List of scopes granted to this client by matching roles.  Scopes must be
		// composed of printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/expandedScopes
		ExpandedScopes []string `json:"expandedScopes"`

		// Date and time where the clients access is set to expire
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/expires
		Expires tcclient.Time `json:"expires"`

		// Date of last time this client was used. Will only be updated every 6 hours
		// or so this may be off by up-to 6 hours. But it still gives a solid hint
		// as to whether or not this client is in use.
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/lastDateUsed
		LastDateUsed tcclient.Time `json:"lastDateUsed"`

		// Date and time of last modification
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/lastModified
		LastModified tcclient.Time `json:"lastModified"`

		// Date and time of when the `accessToken` was reset last time.
		//
		// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#/properties/lastRotated
		LastRotated tcclient.Time `json:"lastRotated"`
	}

	// Data to create or update a role.
	//
	// See http://schemas.taskcluster.net/auth/v1/create-role-request.json#
	CreateRoleRequest struct {

		// Description of what this role is used for in markdown.
		// Should include who is the owner, point of contact.
		//
		// Max length: 10240
		//
		// See http://schemas.taskcluster.net/auth/v1/create-role-request.json#/properties/description
		Description string `json:"description"`

		// List of scopes the role grants access to.  Scopes must be composed of
		// printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/auth/v1/create-role-request.json#/properties/scopes
		Scopes []string `json:"scopes"`
	}

	// List of clients and all their details as JSON for import/export.
	//
	// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#
	ExportedClients []struct {

		// AccessToken used for authenticating requests
		//
		// Syntax:     ^[a-zA-Z0-9_-]{22,66}$
		//
		// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#/items/properties/accessToken
		AccessToken string `json:"accessToken"`

		// ClientId of the client scopes is requested about
		//
		// Syntax:     ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		//
		// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#/items/properties/clientId
		ClientId string `json:"clientId"`

		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		//
		// Max length: 4096
		//
		// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#/items/properties/description
		Description string `json:"description"`

		// Date and time where the clients credentials are set to expire
		//
		// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#/items/properties/expires
		Expires tcclient.Time `json:"expires"`

		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		//
		// Max length: 255
		//
		// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#/items/properties/name
		Name string `json:"name"`

		// List of scopes the client is authorized to access.  Scopes must be
		// composed of printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#/items/properties/scopes
		Scopes []string `json:"scopes"`
	}

	// Get all details about a client, useful for tools modifying a client
	//
	// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#
	GetClientResponse struct {

		// ClientId of the client scopes is requested about
		//
		// Syntax:     ^[A-Za-z0-9@/:._-]+$
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/clientId
		ClientId string `json:"clientId"`

		// Date and time when this client was created
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/created
		Created tcclient.Time `json:"created"`

		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		//
		// Max length: 10240
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/description
		Description string `json:"description"`

		// List of scopes granted to this client by matching roles.  Scopes must be
		// composed of printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/expandedScopes
		ExpandedScopes []string `json:"expandedScopes"`

		// Date and time where the clients access is set to expire
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/expires
		Expires tcclient.Time `json:"expires"`

		// Date of last time this client was used. Will only be updated every 6 hours
		// or so this may be off by up-to 6 hours. But it still gives a solid hint
		// as to whether or not this client is in use.
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/lastDateUsed
		LastDateUsed tcclient.Time `json:"lastDateUsed"`

		// Date and time of last modification
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/lastModified
		LastModified tcclient.Time `json:"lastModified"`

		// Date and time of when the `accessToken` was reset last time.
		//
		// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#/properties/lastRotated
		LastRotated tcclient.Time `json:"lastRotated"`
	}

	// Get all details about a role
	//
	// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#
	GetRoleResponse struct {

		// Date and time when this role was created
		//
		// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#/properties/created
		Created tcclient.Time `json:"created"`

		// Description of what this role is used for in markdown.
		// Should include who is the owner, point of contact.
		//
		// Max length: 10240
		//
		// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#/properties/description
		Description string `json:"description"`

		// List of scopes granted anyone who assumes this role, including anything
		// granted by roles that can be assumed when you have this role.
		// Hence, this includes any scopes in-directly granted as well.
		//
		// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#/properties/expandedScopes
		ExpandedScopes []string `json:"expandedScopes"`

		// Date and time of last modification
		//
		// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#/properties/lastModified
		LastModified tcclient.Time `json:"lastModified"`

		// roleId of the role requested
		//
		// Syntax:     ^[\x20-\x7e]+$
		//
		// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#/properties/roleId
		RoleId string `json:"roleId"`

		// List of scopes the role grants access to.  Scopes must be composed of
		// printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#/properties/scopes
		Scopes []string `json:"scopes"`
	}

	// List of clients
	//
	// See http://schemas.taskcluster.net/auth/v1/list-clients-response.json#
	ListClientResponse []GetClientResponse

	// List of roles
	//
	// See http://schemas.taskcluster.net/auth/v1/list-roles-response.json#
	ListRolesResponse []GetRoleResponse
)

// MarshalJSON calls json.RawMessage method of the same name. Required since
// HawkSignatureAuthenticationResponse is of type json.RawMessage...
func (this *HawkSignatureAuthenticationResponse) MarshalJSON() ([]byte, error) {
	x := json.RawMessage(*this)
	return (&x).MarshalJSON()
}

// UnmarshalJSON is a copy of the json.RawMessage implementation.
func (this *HawkSignatureAuthenticationResponse) UnmarshalJSON(data []byte) error {
	if this == nil {
		return errors.New("HawkSignatureAuthenticationResponse: UnmarshalJSON on nil pointer")
	}
	*this = append((*this)[0:0], data...)
	return nil
}
