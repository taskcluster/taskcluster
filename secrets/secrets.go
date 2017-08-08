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
// Tue, 8 Aug 2017 at 16:23:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package secrets

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type Secrets tcclient.Client

// Returns a pointer to Secrets, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := &tcclient.Credentials{
//  	ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  mySecrets := secrets.New(creds)                              // set credentials
//  mySecrets.Authenticate = false                               // disable authentication (creds above are now ignored)
//  mySecrets.BaseURL = "http://localhost:1234/api/Secrets/v1"   // alternative API endpoint (production by default)
//  err := mySecrets.Set(.....)                                  // for example, call the Set(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *Secrets {
	mySecrets := Secrets(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      "https://secrets.taskcluster.net/v1",
		Authenticate: true,
	})
	return &mySecrets
}

// Set the secret associated with some key.  If the secret already exists, it is
// updated instead.
//
// Required scopes:
//   * secrets:set:<name>
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
//   * secrets:set:<name>
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
//   * secrets:get:<name>
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
//   * secrets:get:<name>
//
// See Get for more details.
func (mySecrets *Secrets) Get_SignedURL(name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*mySecrets)
	return (&cd).SignedURL("/secret/"+url.QueryEscape(name), nil, duration)
}

// List the names of all secrets that you would have access to read. In
// other words, secret name `<X>` will only be returned if a) a secret
// with name `<X>` exists, and b) you posses the scope `secrets:get:<X>`.
//
// See https://docs.taskcluster.net/reference/core/secrets/api-docs#list
func (mySecrets *Secrets) List() (*SecretsList, error) {
	cd := tcclient.Client(*mySecrets)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/secrets", new(SecretsList), nil)
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
