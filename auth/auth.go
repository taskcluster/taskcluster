// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt
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
//  data, httpResponse := Auth.Scopes(.....)
package auth

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	hawk "github.com/tent/hawk-go"
	"io"
	"net/http"
	"reflect"
	"time"
)

func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *http.Response) {
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}

	var ioReader io.Reader = nil
	if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
		ioReader = bytes.NewReader(jsonPayload)
	}
	httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
	if err != nil {
		panic(err)
	}
	// only authenticate if client library user wishes to
	if auth.Authenticate {
		// not sure if we need to regenerate this with each call, will leave in here for now...
		credentials := &hawk.Credentials{
			ID:   auth.ClientId,
			Key:  auth.AccessToken,
			Hash: sha256.New,
		}
		reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
		httpRequest.Header.Set("Authorization", reqAuth)
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpClient := &http.Client{}
	// fmt.Println("Request\n=======")
	// fullRequest, err := httputil.DumpRequestOut(httpRequest, true)
	// fmt.Println(string(fullRequest))
	response, err := httpClient.Do(httpRequest)
	// fmt.Println("Response\n========")
	// fullResponse, err := httputil.DumpResponse(response, true)
	// fmt.Println(string(fullResponse))
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	// if result is nil, it means there is no response body json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		json := json.NewDecoder(response.Body)
		err = json.Decode(&result)
		if err != nil {
			panic(err)
		}
	}
	// fmt.Printf("ClientId: %v\nAccessToken: %v\nPayload: %v\nURL: %v\nMethod: %v\nResult: %v\n", auth.ClientId, auth.AccessToken, string(jsonPayload), auth.BaseURL+route, method, result)
	return result, response
}

// The entry point into all the functionality in this package is to create an Auth object.
// It contains your authentication credentials, which are required for all HTTP operations.
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
//  data, httpResponse := Auth.Scopes(.....)             // for example, call the Scopes(.....) API endpoint (described further down)...
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://auth.taskcluster.net/v1",
		Authenticate: true}
}

// Returns the scopes the client is authorized to access and the date-time
// where the clients authorization is set to expire.
//
// This API end-point allows you inspect clients without getting access to
// credentials, as provide by the `getCredentials` request below.
//
// See http://docs.taskcluster.net/auth/api-docs/#scopes
func (a *Auth) Scopes(clientId string) (*GetClientScopesResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/client/"+clientId+"/scopes", new(GetClientScopesResponse))
	return responseObject.(*GetClientScopesResponse), httpResponse
}

// Returns the clients `accessToken` as needed for verifying signatures.
// This API end-point also returns the list of scopes the client is
// authorized for and the date-time where the client authorization expires
//
// Remark, **if you don't need** the `accessToken` but only want to see what
// scopes a client is authorized for, you should use the `getScopes`
// function described above.
//
// See http://docs.taskcluster.net/auth/api-docs/#getCredentials
func (a *Auth) GetCredentials(clientId string) (*GetClientCredentialsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/client/"+clientId+"/credentials", new(GetClientCredentialsResponse))
	return responseObject.(*GetClientCredentialsResponse), httpResponse
}

// Returns all information about a given client. This end-point is mostly
// building tools to administrate clients. Do not use if you only want to
// authenticate a request, see `getCredentials` for this purpose.
//
// See http://docs.taskcluster.net/auth/api-docs/#client
func (a *Auth) Client(clientId string) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/client/"+clientId+"", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Create client with given `clientId`, `name`, `expires`, `scopes` and
// `description`. The `accessToken` will always be generated server-side,
// and will be returned from this request.
//
// **Required scopes**, in addition the scopes listed
// above, the caller must also posses the all the scopes that is given to
// the client that is created.
//
// See http://docs.taskcluster.net/auth/api-docs/#createClient
func (a *Auth) CreateClient(clientId string, payload *GetClientCredentialsResponse1) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "PUT", "/client/"+clientId+"", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Modify client `name`, `expires`, `scopes` and
// `description`.
//
// **Required scopes**, in addition the scopes listed
// above, the caller must also posses the all the scopes that is given to
// the client that is updated.
//
// See http://docs.taskcluster.net/auth/api-docs/#modifyClient
func (a *Auth) ModifyClient(clientId string, payload *GetClientCredentialsResponse1) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(payload, "POST", "/client/"+clientId+"/modify", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Delete a client with given `clientId`.
//
// See http://docs.taskcluster.net/auth/api-docs/#removeClient
func (a *Auth) RemoveClient(clientId string) *http.Response {
	_, httpResponse := a.apiCall(nil, "DELETE", "/client/"+clientId+"", nil)
	return httpResponse
}

// Reset credentials for a client. This will generate a new `accessToken`.
// as always the `accessToken` will be generated server-side and returned.
//
// See http://docs.taskcluster.net/auth/api-docs/#resetCredentials
func (a *Auth) ResetCredentials(clientId string) (*GetClientResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "POST", "/client/"+clientId+"/reset-credentials", new(GetClientResponse))
	return responseObject.(*GetClientResponse), httpResponse
}

// Return list with all clients
//
// See http://docs.taskcluster.net/auth/api-docs/#listClients
func (a *Auth) ListClients() (*ListClientsResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/list-clients", new(ListClientsResponse))
	return responseObject.(*ListClientsResponse), httpResponse
}

// Get an SAS string for use with a specific Azure Table Storage table.
// Note, this will create the table, if it doesn't already exists.
//
// See http://docs.taskcluster.net/auth/api-docs/#azureTableSAS
func (a *Auth) AzureTableSAS(account string, table string) (*AzureSharedAccessSignatureResponse, *http.Response) {
	responseObject, httpResponse := a.apiCall(nil, "GET", "/azure/"+account+"/table/"+table+"/read-write", new(AzureSharedAccessSignatureResponse))
	return responseObject.(*AzureSharedAccessSignatureResponse), httpResponse
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/auth/api-docs/#ping
func (a *Auth) Ping() *http.Response {
	_, httpResponse := a.apiCall(nil, "GET", "/ping", nil)
	return httpResponse
}

type (
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
