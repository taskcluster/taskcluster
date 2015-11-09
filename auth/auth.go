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
//  myAuth := auth.New("myClientId", "myAccessToken")
//
// and then call one or more of myAuth's methods, e.g.:
//
//  data, callSummary := myAuth.ListClients(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The entire source code of this go package was auto-generated from the API definition
// http://references.taskcluster.net/auth/v1/api.json downloaded on
// Mon, 9 Nov 2015 at 16:16:00 UTC.
package auth

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"reflect"
	"time"

	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
	D "github.com/tj/go-debug"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("auth")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (myAuth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary) {
	callSummary := new(CallSummary)
	callSummary.HttpRequestObject = payload
	var jsonPayload []byte
	jsonPayload, callSummary.Error = json.Marshal(payload)
	if callSummary.Error != nil {
		return result, callSummary
	}
	callSummary.HttpRequestBody = string(jsonPayload)

	httpClient := &http.Client{}

	// function to perform http request - we call this using backoff library to
	// have exponential backoff in case of intermittent failures (e.g. network
	// blips or HTTP 5xx errors)
	httpCall := func() (*http.Response, error, error) {
		var ioReader io.Reader = nil
		if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
			ioReader = bytes.NewReader(jsonPayload)
		}
		httpRequest, err := http.NewRequest(method, myAuth.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", myAuth.BaseURL+route, myAuth.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if myAuth.Authenticate {
			credentials := &hawk.Credentials{
				ID:   myAuth.ClientId,
				Key:  myAuth.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if myAuth.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + myAuth.Certificate + "}"))
			}
			httpRequest.Header.Set("Authorization", reqAuth.RequestHeader())
		}
		debug("Making http request: %v", httpRequest)
		resp, err := httpClient.Do(httpRequest)
		return resp, err, nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	callSummary.HttpResponse, callSummary.Attempts, callSummary.Error = httpbackoff.Retry(httpCall)

	if callSummary.Error != nil {
		return result, callSummary
	}

	// now read response into memory, so that we can return the body
	var body []byte
	body, callSummary.Error = ioutil.ReadAll(callSummary.HttpResponse.Body)

	if callSummary.Error != nil {
		return result, callSummary
	}

	callSummary.HttpResponseBody = string(body)

	// if result is passed in as nil, it means the API defines no response body
	// json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		callSummary.Error = json.Unmarshal([]byte(callSummary.HttpResponseBody), &result)
		if callSummary.Error != nil {
			// technically not needed since returned outside if, but more comprehensible
			return result, callSummary
		}
	}

	// Return result and callSummary
	return result, callSummary
}

// The entry point into all the functionality in this package is to create an
// Auth object.  It contains your authentication credentials, which are
// required for all HTTP operations.
type Auth struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://auth.taskcluster.net/v1" for production.
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with Authenticate set to true.
	Authenticate bool
	// Certificate for temporary credentials
	Certificate string
}

// CallSummary provides information about the underlying http request and
// response issued for a given API call, together with details of any Error
// which occured. After making an API call, be sure to check the returned
// CallSummary.Error - if it is nil, no error occurred.
type CallSummary struct {
	HttpRequest *http.Request
	// Keep a copy of request body in addition to the *http.Request, since
	// accessing the Body via the *http.Request object, you get a io.ReadCloser
	// - and after the request has been made, the body will have been read, and
	// the data lost... This way, it is still available after the api call
	// returns.
	HttpRequestBody string
	// The Go Type which is marshaled into json and used as the http request
	// body.
	HttpRequestObject interface{}
	HttpResponse      *http.Response
	// Keep a copy of response body in addition to the *http.Response, since
	// accessing the Body via the *http.Response object, you get a
	// io.ReadCloser - and after the response has been read once (to unmarshal
	// json into native go types) the data is lost... This way, it is still
	// available after the api call returns.
	HttpResponseBody string
	Error            error
	// Keep a record of how many http requests were attempted
	Attempts int
}

// Returns a pointer to Auth, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  myAuth := auth.New("123", "456")                       // set clientId and accessToken
//  myAuth.Authenticate = false                            // disable authentication (true by default)
//  myAuth.BaseURL = "http://localhost:1234/api/Auth/v1"   // alternative API endpoint (production by default)
//  data, callSummary := myAuth.ListClients(.....)         // for example, call the ListClients(.....) API endpoint (described further down)...
//  if callSummary.Error != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://auth.taskcluster.net/v1",
		Authenticate: true,
	}
}

// Get a list of all clients.
//
// See http://docs.taskcluster.net/auth/api-docs/#listClients
func (myAuth *Auth) ListClients() (*ListClientResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(nil, "GET", "/clients/", new(ListClientResponse))
	return responseObject.(*ListClientResponse), callSummary
}

// Get information about a single client.
//
// See http://docs.taskcluster.net/auth/api-docs/#client
func (myAuth *Auth) Client(clientId string) (*GetClientResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(nil, "GET", "/clients/"+url.QueryEscape(clientId), new(GetClientResponse))
	return responseObject.(*GetClientResponse), callSummary
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
func (myAuth *Auth) CreateClient(clientId string, payload *CreateClientRequest) (*CreateClientResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(payload, "PUT", "/clients/"+url.QueryEscape(clientId), new(CreateClientResponse))
	return responseObject.(*CreateClientResponse), callSummary
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
func (myAuth *Auth) ResetAccessToken(clientId string) (*CreateClientResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(nil, "POST", "/clients/"+url.QueryEscape(clientId)+"/reset", new(CreateClientResponse))
	return responseObject.(*CreateClientResponse), callSummary
}

// Update an exisiting client. This is really only useful for changing the
// description and expiration, as you won't be allowed to the `clientId`
// or `accessToken`.
//
// Required scopes:
//   * auth:update-client:<clientId>
//
// See http://docs.taskcluster.net/auth/api-docs/#updateClient
func (myAuth *Auth) UpdateClient(clientId string, payload *CreateClientRequest) (*GetClientResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(payload, "POST", "/clients/"+url.QueryEscape(clientId), new(GetClientResponse))
	return responseObject.(*GetClientResponse), callSummary
}

// Delete a client, please note that any roles related to this client must
// be deleted independently.
//
// Required scopes:
//   * auth:delete-client:<clientId>
//
// See http://docs.taskcluster.net/auth/api-docs/#deleteClient
func (myAuth *Auth) DeleteClient(clientId string) *CallSummary {
	_, callSummary := myAuth.apiCall(nil, "DELETE", "/clients/"+url.QueryEscape(clientId), nil)
	return callSummary
}

// Get a list of all roles, each role object also includes the list of
// scopes it expands to.
//
// See http://docs.taskcluster.net/auth/api-docs/#listRoles
func (myAuth *Auth) ListRoles() (*ListRolesResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(nil, "GET", "/roles/", new(ListRolesResponse))
	return responseObject.(*ListRolesResponse), callSummary
}

// Get information about a single role, including the set of scopes that the
// role expands to.
//
// See http://docs.taskcluster.net/auth/api-docs/#role
func (myAuth *Auth) Role(roleId string) (*GetRoleResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(nil, "GET", "/roles/"+url.QueryEscape(roleId), new(GetRoleResponse))
	return responseObject.(*GetRoleResponse), callSummary
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
func (myAuth *Auth) CreateRole(roleId string, payload *CreateRoleRequest) (*GetRoleResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(payload, "PUT", "/roles/"+url.QueryEscape(roleId), new(GetRoleResponse))
	return responseObject.(*GetRoleResponse), callSummary
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
func (myAuth *Auth) UpdateRole(roleId string, payload *CreateRoleRequest) (*GetRoleResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(payload, "POST", "/roles/"+url.QueryEscape(roleId), new(GetRoleResponse))
	return responseObject.(*GetRoleResponse), callSummary
}

// Delete a role. This operation will succeed regardless of whether or not
// the role exists.
//
// Required scopes:
//   * auth:delete-role:<roleId>
//
// See http://docs.taskcluster.net/auth/api-docs/#deleteRole
func (myAuth *Auth) DeleteRole(roleId string) *CallSummary {
	_, callSummary := myAuth.apiCall(nil, "DELETE", "/roles/"+url.QueryEscape(roleId), nil)
	return callSummary
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
func (myAuth *Auth) AwsS3Credentials(level string, bucket string, prefix string) (*AWSS3CredentialsResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(nil, "GET", "/aws/s3/"+url.QueryEscape(level)+"/"+url.QueryEscape(bucket)+"/"+url.QueryEscape(prefix), new(AWSS3CredentialsResponse))
	return responseObject.(*AWSS3CredentialsResponse), callSummary
}

// Get a shared access signature (SAS) string for use with a specific Azure
// Table Storage table.  Note, this will create the table, if it doesn't
// already exist.
//
// Required scopes:
//   * auth:azure-table-access:<account>/<table>
//
// See http://docs.taskcluster.net/auth/api-docs/#azureTableSAS
func (myAuth *Auth) AzureTableSAS(account string, table string) (*AzureSharedAccessSignatureResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(nil, "GET", "/azure/"+url.QueryEscape(account)+"/table/"+url.QueryEscape(table)+"/read-write", new(AzureSharedAccessSignatureResponse))
	return responseObject.(*AzureSharedAccessSignatureResponse), callSummary
}

// Validate the request signature given on input and return list of scopes
// that the authenticating client has.
//
// This method is used by other services that wish rely on TaskCluster
// credentials for authentication. This way we can use Hawk without having
// the secret credentials leave this service.
//
// See http://docs.taskcluster.net/auth/api-docs/#authenticateHawk
func (myAuth *Auth) AuthenticateHawk(payload *HawkSignatureAuthenticationRequest) (*HawkSignatureAuthenticationResponse, *CallSummary) {
	responseObject, callSummary := myAuth.apiCall(payload, "POST", "/authenticate-hawk", new(HawkSignatureAuthenticationResponse))
	return responseObject.(*HawkSignatureAuthenticationResponse), callSummary
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
func (myAuth *Auth) ImportClients(payload *ExportedClients) *CallSummary {
	_, callSummary := myAuth.apiCall(payload, "POST", "/import-clients", nil)
	return callSummary
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/auth/api-docs/#ping
func (myAuth *Auth) Ping() *CallSummary {
	_, callSummary := myAuth.apiCall(nil, "GET", "/ping", nil)
	return callSummary
}

type (
	// Request to authenticate a hawk request.
	//
	// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-request.json#
	HawkSignatureAuthenticationRequest struct {
		// Authorization header, **must** only be specified if request being
		// authenticated has a `Authorization` header.
		Authorization string `json:"authorization"`
		// Host for which the request came in, this is typically the `Host` header
		// excluding the port if any.
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
		Method string `json:"method"`
		// Port on which the request came in, this is typically `80` or `443`.
		// If you are running behind a reverse proxy look for the `x-forwarded-port`
		// header.
		Port int `json:"port"`
		// Resource the request operates on including querystring. This is the
		// string that follows the HTTP method.
		// **Note,** order of querystring elements is important.
		Resource string `json:"resource"`
	}

	// Response from a request to authenticate a hawk request.
	//
	// See http://schemas.taskcluster.net/auth/v1/authenticate-hawk-response.json#
	HawkSignatureAuthenticationResponse json.RawMessage

	// Response for a request to get access to an S3 bucket.
	//
	// See http://schemas.taskcluster.net/auth/v1/aws-s3-credentials-response.json#
	AWSS3CredentialsResponse struct {
		// Temporary STS credentials for use when operating on S3
		Credentials struct {
			// Access key identifier that identifies the temporary security
			// credentials.
			AccessKeyId string `json:"accessKeyId"`
			// Secret access key used to sign requests
			SecretAccessKey string `json:"secretAccessKey"`
			// A token that must passed with request to use the temporary
			// security credentials.
			SessionToken string `json:"sessionToken"`
		} `json:"credentials"`
		// Date and time of when the temporary credentials expires.
		Expires Time `json:"expires"`
	}

	// Response to a request for an Shared-Access-Signature to access and Azure
	// Table Storage table.
	//
	// See http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#
	AzureSharedAccessSignatureResponse struct {
		// Date and time of when the Shared-Access-Signature expires.
		Expiry Time `json:"expiry"`
		// Shared-Access-Signature string. This is the querystring parameters to
		// be appened after `?` or `&` depending on whether or not a querystring is
		// already present in the URL.
		Sas string `json:"sas"`
	}

	// Properties to create a client.
	//
	// See http://schemas.taskcluster.net/auth/v1/create-client-request.json#
	CreateClientRequest struct {
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		Description string `json:"description"`
		// Date and time where the clients access is set to expire
		Expires Time `json:"expires"`
	}

	// All details about a client including the `accessToken`
	//
	// See http://schemas.taskcluster.net/auth/v1/create-client-response.json#
	CreateClientResponse struct {
		// AccessToken used for authenticating requests, you should store this
		// you won't be able to retrive it again!
		//
		// Syntax: ^[a-zA-Z0-9_-]{22,66}$
		AccessToken string `json:"accessToken"`
		// ClientId of the client
		//
		// Syntax: ^[A-Za-z0-9@/:._-]+$
		ClientId string `json:"clientId"`
		// Date and time when this client was created
		Created Time `json:"created"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		Description string `json:"description"`
		// List of scopes granted to this client by matching roles.  Scopes must be
		// composed of printable ASCII characters and spaces.
		ExpandedScopes []string `json:"expandedScopes"`
		// Date and time where the clients access is set to expire
		Expires Time `json:"expires"`
		// Date of last time this client was used. Will only be updated every 6 hours
		// or so this may be off by up-to 6 hours. But it still gives a solid hint
		// as to whether or not this client is in use.
		LastDateUsed Time `json:"lastDateUsed"`
		// Date and time of last modification
		LastModified Time `json:"lastModified"`
		// Date and time of when the `accessToken` was reset last time.
		LastRotated Time `json:"lastRotated"`
	}

	// Data to create or update a role.
	//
	// See http://schemas.taskcluster.net/auth/v1/create-role-request.json#
	CreateRoleRequest struct {
		// Description of what this role is used for in markdown.
		// Should include who is the owner, point of contact.
		Description string `json:"description"`
		// List of scopes the role grants access to.  Scopes must be composed of
		// printable ASCII characters and spaces.
		Scopes []string `json:"scopes"`
	}

	// List of clients and all their details as JSON for import/export.
	//
	// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#
	ExportedClients []struct {
		// AccessToken used for authenticating requests
		//
		// Syntax: ^[a-zA-Z0-9_-]{22,66}$
		AccessToken string `json:"accessToken"`
		// ClientId of the client scopes is requested about
		//
		// Syntax: ^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$
		ClientId string `json:"clientId"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires Time `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access.  Scopes must be
		// composed of printable ASCII characters and spaces.
		Scopes []string `json:"scopes"`
	}

	// Get all details about a client, useful for tools modifying a client
	//
	// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#
	GetClientResponse struct {
		// ClientId of the client scopes is requested about
		//
		// Syntax: ^[A-Za-z0-9@/:._-]+$
		ClientId string `json:"clientId"`
		// Date and time when this client was created
		Created Time `json:"created"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		Description string `json:"description"`
		// List of scopes granted to this client by matching roles.  Scopes must be
		// composed of printable ASCII characters and spaces.
		ExpandedScopes []string `json:"expandedScopes"`
		// Date and time where the clients access is set to expire
		Expires Time `json:"expires"`
		// Date of last time this client was used. Will only be updated every 6 hours
		// or so this may be off by up-to 6 hours. But it still gives a solid hint
		// as to whether or not this client is in use.
		LastDateUsed Time `json:"lastDateUsed"`
		// Date and time of last modification
		LastModified Time `json:"lastModified"`
		// Date and time of when the `accessToken` was reset last time.
		LastRotated Time `json:"lastRotated"`
	}

	// Get all details about a role
	//
	// See http://schemas.taskcluster.net/auth/v1/get-role-response.json#
	GetRoleResponse struct {
		// Date and time when this role was created
		Created Time `json:"created"`
		// Description of what this role is used for in markdown.
		// Should include who is the owner, point of contact.
		Description string `json:"description"`
		// List of scopes granted anyone who assumes this role, including anything
		// granted by roles that can be assumed when you have this role.
		// Hence, this includes any scopes in-directly granted as well.
		ExpandedScopes []string `json:"expandedScopes"`
		// Date and time of last modification
		LastModified Time `json:"lastModified"`
		// roleId of the role requested
		//
		// Syntax: ^[\x20-\x7e]+$
		RoleId string `json:"roleId"`
		// List of scopes the role grants access to.  Scopes must be composed of
		// printable ASCII characters and spaces.
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

// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type auth.Time which marshals instead
// to the same format used by the TaskCluster services; UTC based, with millisecond
// precision, using 'Z' timezone, e.g. 2015-10-27T20:36:19.255Z.
type Time time.Time

// MarshalJSON implements the json.Marshaler interface.
// The time is a quoted string in RFC 3339 format, with sub-second precision added if present.
func (t Time) MarshalJSON() ([]byte, error) {
	if y := time.Time(t).Year(); y < 0 || y >= 10000 {
		// RFC 3339 is clear that years are 4 digits exactly.
		// See golang.org/issue/4556#c15 for more discussion.
		return nil, errors.New("queue.Time.MarshalJSON: year outside of range [0,9999]")
	}
	return []byte(`"` + t.String() + `"`), nil
}

// UnmarshalJSON implements the json.Unmarshaler interface.
// The time is expected to be a quoted string in RFC 3339 format.
func (t *Time) UnmarshalJSON(data []byte) (err error) {
	// Fractional seconds are handled implicitly by Parse.
	x := new(time.Time)
	*x, err = time.Parse(`"`+time.RFC3339+`"`, string(data))
	*t = Time(*x)
	return
}

// Returns the Time in canonical RFC3339 representation, e.g.
// 2015-10-27T20:36:19.255Z
func (t Time) String() string {
	return time.Time(t).UTC().Format("2006-01-02T15:04:05.000Z")
}
