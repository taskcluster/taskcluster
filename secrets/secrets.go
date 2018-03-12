// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/secrets/v1/api.json

// The secrets service provides a simple key/value store for small bits of secret
// data.  Access is limited by scopes, so values can be considered secret from
// those who do not have the relevant scopes.
//
// Secrets also have an expiration date, and once a secret has expired it can no
// longer be read.  This is useful for short-term secrets such as a temporary
// service credential or a one-time signing key.
//
// See: https://docs.taskcluster.net/reference/core/secrets/api-docs
//
// How to use this package
//
// First create a Secrets object:
//
//  mySecrets := secrets.New(&tcclient.Credentials{ClientID: "myClientID", AccessToken: "myAccessToken"})
//
// and then call one or more of mySecrets's methods, e.g.:
//
//  err := mySecrets.Set(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/secrets/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 12 Mar 2018 at 15:22:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package secrets

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "https://secrets.taskcluster.net/v1"
)

type Secrets tcclient.Client

// New returns a Secrets client, configured to run against production. Pass in
// nil to load credentials from TASKCLUSTER_* environment variables. The
// returned client is mutable, so returned settings can be altered.
//
//  mySecrets, err := secrets.New(nil)                           // credentials loaded from TASKCLUSTER_* env vars
//  if err != nil {
//      // handle malformed credentials...
//  }
//  mySecrets.BaseURL = "http://localhost:1234/api/Secrets/v1"   // alternative API endpoint (production by default)
//  err := mySecrets.Set(.....)                                  // for example, call the Set(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
//
// If authentication is not required, use NewNoAuth() instead.
func New(credentials *tcclient.Credentials) (*Secrets, error) {
	if credentials == nil {
		credentials = tcclient.CredentialsFromEnvVars()
	}
	err := credentials.Validate()
	mySecrets := Secrets(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: true,
	})
	return &mySecrets, err
}

// NewNoAuth returns a Secrets client with authentication disabled. This is
// useful when calling taskcluster APIs that do not require authorization.
func NewNoAuth() *Secrets {
	mySecrets := Secrets(tcclient.Client{
		BaseURL:      DefaultBaseURL,
		Authenticate: false,
	})
	return &mySecrets
}

// Set the secret associated with some key.  If the secret already exists, it is
// updated instead.
//
// Required scopes:
//   secrets:set:<name>
//
// See https://docs.taskcluster.net/reference/core/secrets/api-docs#set
func (mySecrets *Secrets) Set(name string, payload *Secret) error {
	cd := tcclient.Client(*mySecrets)
	_, _, err := (&cd).APICall(payload, "PUT", "/secret/"+url.QueryEscape(name), nil, nil)
	return err
}

// Delete the secret associated with some key.
//
// Required scopes:
//   secrets:set:<name>
//
// See https://docs.taskcluster.net/reference/core/secrets/api-docs#remove
func (mySecrets *Secrets) Remove(name string) error {
	cd := tcclient.Client(*mySecrets)
	_, _, err := (&cd).APICall(nil, "DELETE", "/secret/"+url.QueryEscape(name), nil, nil)
	return err
}

// Read the secret associated with some key.  If the secret has recently
// expired, the response code 410 is returned.  If the caller lacks the
// scope necessary to get the secret, the call will fail with a 403 code
// regardless of whether the secret exists.
//
// Required scopes:
//   secrets:get:<name>
//
// See https://docs.taskcluster.net/reference/core/secrets/api-docs#get
func (mySecrets *Secrets) Get(name string) (*Secret, error) {
	cd := tcclient.Client(*mySecrets)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/secret/"+url.QueryEscape(name), new(Secret), nil)
	return responseObject.(*Secret), err
}

// Returns a signed URL for Get, valid for the specified duration.
//
// Required scopes:
//   secrets:get:<name>
//
// See Get for more details.
func (mySecrets *Secrets) Get_SignedURL(name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*mySecrets)
	return (&cd).SignedURL("/secret/"+url.QueryEscape(name), nil, duration)
}

// List the names of all secrets.
//
// By default this end-point will try to return up to 1000 secret names in one
// request. But it **may return less**, even if more tasks are available.
// It may also return a `continuationToken` even though there are no more
// results. However, you can only be sure to have seen all results if you
// keep calling `listTaskGroup` with the last `continuationToken` until you
// get a result without a `continuationToken`.
//
// If you are not interested in listing all the members at once, you may
// use the query-string option `limit` to return fewer.
//
// See https://docs.taskcluster.net/reference/core/secrets/api-docs#list
func (mySecrets *Secrets) List(continuationToken, limit string) (*SecretsList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*mySecrets)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/secrets", new(SecretsList), v)
	return responseObject.(*SecretsList), err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/secrets/api-docs#ping
func (mySecrets *Secrets) Ping() error {
	cd := tcclient.Client(*mySecrets)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
