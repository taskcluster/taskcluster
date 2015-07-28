// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/auth/v1/api.json

// Authentication related API end-points for taskcluster.
//
// See: http://docs.taskcluster.net/auth/api-docs
//
// How to use this package
//
// First create an authentication object:
//
//  Auth := auth.New("myClientId", "myAccessToken")
//
// and then call one or more of auth's methods, e.g.:
//
//  data, callSummary := Auth.Scopes(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
package auth

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
	D "github.com/tj/go-debug"
	"io"
	"io/ioutil"
	"net/http"
	"reflect"
	"time"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("auth")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary) {
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
		httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", auth.BaseURL+route, auth.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if auth.Authenticate {
			credentials := &hawk.Credentials{
				ID:   auth.ClientId,
				Key:  auth.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if auth.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + auth.Certificate + "}"))
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
//  Auth := auth.New("123", "456")                       // set clientId and accessToken
//  Auth.Authenticate = false                            // disable authentication (true by default)
//  Auth.BaseURL = "http://localhost:1234/api/Auth/v1"   // alternative API endpoint (production by default)
//  data, callSummary := Auth.Scopes(.....)              // for example, call the Scopes(.....) API endpoint (described further down)...
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

// Returns the scopes the client is authorized to access and the date-time
// when the clients authorization is set to expire.
//
// This API end-point allows you inspect clients without getting access to
// credentials, as provided by the `getCredentials` request below.
//
// See http://docs.taskcluster.net/auth/api-docs/#scopes
func (a *Auth) Scopes(clientId string) (*GetClientScopesResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/client/"+clientId+"/scopes", new(GetClientScopesResponse))
	return responseObject.(*GetClientScopesResponse), callSummary
}

// Returns the client's `accessToken` as needed for verifying signatures.
// This API end-point also returns the list of scopes the client is
// authorized for and the date-time where the client authorization expires
//
// Remark, **if you don't need** the `accessToken` but only want to see what
// scopes a client is authorized for, you should use the `getScopes`
// function described above.
//
// See http://docs.taskcluster.net/auth/api-docs/#getCredentials
func (a *Auth) GetCredentials(clientId string) (*GetClientCredentialsResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/client/"+clientId+"/credentials", new(GetClientCredentialsResponse))
	return responseObject.(*GetClientCredentialsResponse), callSummary
}

// Returns all information about a given client. This end-point is mostly for
// building tools to administrate clients. Do not use if you only want to
// authenticate a request; see `getCredentials` for this purpose.
//
// See http://docs.taskcluster.net/auth/api-docs/#client
func (a *Auth) Client(clientId string) (*GetClientResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/client/"+clientId+"", new(GetClientResponse))
	return responseObject.(*GetClientResponse), callSummary
}

// Create a client with given `clientId`, `name`, `expires`, `scopes` and
// `description`. The `accessToken` will always be generated server-side,
// and will be returned from this request.
//
// **Required scopes**: in addition the scopes listed above, the
// `scopes` property must be satisfied by the caller's scopes.
//
// See http://docs.taskcluster.net/auth/api-docs/#createClient
func (a *Auth) CreateClient(clientId string, payload *GetClientCredentialsResponse1) (*GetClientResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "PUT", "/client/"+clientId+"", new(GetClientResponse))
	return responseObject.(*GetClientResponse), callSummary
}

// Modify client `name`, `expires`, `scopes` and
// `description`.
//
// **Required scopes**: in addition the scopes listed
// above, the `scopes` property must be satisfied by the caller's
// scopes.  The client's existing scopes are not considered.
//
// See http://docs.taskcluster.net/auth/api-docs/#modifyClient
func (a *Auth) ModifyClient(clientId string, payload *GetClientCredentialsResponse1) (*GetClientResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/client/"+clientId+"/modify", new(GetClientResponse))
	return responseObject.(*GetClientResponse), callSummary
}

// Delete a client with given `clientId`.
//
// See http://docs.taskcluster.net/auth/api-docs/#removeClient
func (a *Auth) RemoveClient(clientId string) *CallSummary {
	_, callSummary := a.apiCall(nil, "DELETE", "/client/"+clientId+"", nil)
	return callSummary
}

// Reset credentials for a client. This will generate a new `accessToken`.
// As always, the `accessToken` will be generated server-side and returned.
//
// See http://docs.taskcluster.net/auth/api-docs/#resetCredentials
func (a *Auth) ResetCredentials(clientId string) (*GetClientResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "POST", "/client/"+clientId+"/reset-credentials", new(GetClientResponse))
	return responseObject.(*GetClientResponse), callSummary
}

// Return a list of all clients, not including their access tokens.
//
// See http://docs.taskcluster.net/auth/api-docs/#listClients
func (a *Auth) ListClients() (*ListClientsResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/list-clients", new(ListClientsResponse))
	return responseObject.(*ListClientsResponse), callSummary
}

// Get a shared access signature (SAS) string for use with a specific Azure
// Table Storage table.  Note, this will create the table, if it doesn't
// already exist.
//
// See http://docs.taskcluster.net/auth/api-docs/#azureTableSAS
func (a *Auth) AzureTableSAS(account string, table string) (*AzureSharedAccessSignatureResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/azure/"+account+"/table/"+table+"/read-write", new(AzureSharedAccessSignatureResponse))
	return responseObject.(*AzureSharedAccessSignatureResponse), callSummary
}

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
// See http://docs.taskcluster.net/auth/api-docs/#awsS3Credentials
func (a *Auth) AwsS3Credentials(level string, bucket string, prefix string) (*AWSS3CredentialsResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/aws/s3/"+level+"/"+bucket+"/"+prefix+"", new(AWSS3CredentialsResponse))
	return responseObject.(*AWSS3CredentialsResponse), callSummary
}

// Export all clients except the root client, as a JSON list.
// This list can be imported later using `importClients`.
//
// See http://docs.taskcluster.net/auth/api-docs/#exportClients
func (a *Auth) ExportClients() (*ExportedClients, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/export-clients", new(ExportedClients))
	return responseObject.(*ExportedClients), callSummary
}

// Import client from JSON list, overwriting any clients that already
// exists. Returns a list of all clients imported.
//
// See http://docs.taskcluster.net/auth/api-docs/#importClients
func (a *Auth) ImportClients(payload *ExportedClients) (*ExportedClients, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/import-clients", new(ExportedClients))
	return responseObject.(*ExportedClients), callSummary
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/auth/api-docs/#ping
func (a *Auth) Ping() *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/ping", nil)
	return callSummary
}

type (
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
		Expires time.Time `json:"expires"`
	}

	// Response to a request for an Shared-Access-Signature to access and Azure
	// Table Storage table.
	//
	// See http://schemas.taskcluster.net/auth/v1/azure-table-access-response.json#
	AzureSharedAccessSignatureResponse struct {
		// Date and time of when the Shared-Access-Signature expires.
		Expiry time.Time `json:"expiry"`
		// Shared-Access-Signature string. This is the querystring parameters to
		// be appened after `?` or `&` depending on whether or not a querystring is
		// already present in the URL.
		Sas string `json:"sas"`
	}

	// Credentials, scopes and expiration date for a client
	//
	// See http://schemas.taskcluster.net/auth/v1/client-credentials-response.json#
	GetClientCredentialsResponse struct {
		// AccessToken used for authenticating requests
		AccessToken string `json:"accessToken"`
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Date and time where the clients credentials are set to expire
		Expires time.Time `json:"expires"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Scopes and expiration date for a client
	//
	// See http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#
	GetClientScopesResponse struct {
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Date and time where the clients credentials are set to expire
		Expires time.Time `json:"expires"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Credentials, scopes and expiration date for a client
	//
	// See http://schemas.taskcluster.net/auth/v1/create-client-request.json#
	GetClientCredentialsResponse1 struct {
		// Description of what these credentials are used for in markdown.
		// Please write a few details here, including who is the owner, point of
		// contact. Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires time.Time `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// List of clients and all their details as JSON for import/export.
	//
	// See http://schemas.taskcluster.net/auth/v1/exported-clients.json#
	ExportedClients []struct {
		// AccessToken used for authenticating requests
		AccessToken string `json:"accessToken"`
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires time.Time `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Get all detaisl about a client, useful for tools modifying a client
	//
	// See http://schemas.taskcluster.net/auth/v1/get-client-response.json#
	GetClientResponse struct {
		// AccessToken used for authenticating requests
		AccessToken string `json:"accessToken"`
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires time.Time `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}

	// Get a list of all clients, including basic information, but not credentials.
	//
	// See http://schemas.taskcluster.net/auth/v1/list-clients-response.json#
	ListClientsResponse []struct {
		// ClientId of the client scopes is requested about
		ClientId string `json:"clientId"`
		// Description of what these credentials are used for in markdown.
		// Should include who is the owner, point of contact.
		// Why it is scoped as is, think of this as documentation.
		Description string `json:"description"`
		// Date and time where the clients credentials are set to expire
		Expires time.Time `json:"expires"`
		// Human readable name of this set of credentials, typical
		// component/server-name or IRC nickname of the user.
		Name string `json:"name"`
		// List of scopes the client is authorized to access
		Scopes []string `json:"scopes"`
	}
)
