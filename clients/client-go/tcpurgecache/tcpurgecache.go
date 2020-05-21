// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// /references/purge-cache/v1/api.json
// The purge-cache service is responsible for tracking cache-purge requests.
//
// User create purge requests for specific caches on specific workers, and
// these requests are timestamped.  Workers consult the service before
// starting a new task, and purge any caches older than the timestamp.
//
// See:
//
// How to use this package
//
// First create a PurgeCache object:
//
//  purgeCache := tcpurgecache.New(nil)
//
// and then call one or more of purgeCache's methods, e.g.:
//
//  err := purgeCache.Ping(.....)
//
// handling any errors...
//
//  if err != nil {
//  	// handle error...
//  }
//
// Taskcluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// <rootUrl>/references/purge-cache/v1/api.json together with the input and output schemas it references,
package tcpurgecache

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
)

type PurgeCache tcclient.Client

// New returns a PurgeCache client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  purgeCache := tcpurgecache.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := purgeCache.Ping(.....)                 // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *PurgeCache {
	return &PurgeCache{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "purge-cache",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *PurgeCache configured from environment variables.
//
// The root URL is taken from TASKCLUSTER_PROXY_URL if set to a non-empty
// string, otherwise from TASKCLUSTER_ROOT_URL if set, otherwise the empty
// string.
//
// The credentials are taken from environment variables:
//
//  TASKCLUSTER_CLIENT_ID
//  TASKCLUSTER_ACCESS_TOKEN
//  TASKCLUSTER_CERTIFICATE
//
// If TASKCLUSTER_CLIENT_ID is empty/unset, authentication will be
// disabled.
func NewFromEnv() *PurgeCache {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &PurgeCache{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "purge-cache",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (purgeCache *PurgeCache) Ping() error {
	cd := tcclient.Client(*purgeCache)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Publish a request to purge caches named `cacheName` with
// on `provisionerId`/`workerType` workers.
//
// If such a request already exists, its `before` timestamp is updated to
// the current time.
//
// Required scopes:
//   purge-cache:<provisionerId>/<workerType>:<cacheName>
//
// See #purgeCache
func (purgeCache *PurgeCache) PurgeCache(provisionerId, workerType string, payload *PurgeCacheRequest) error {
	cd := tcclient.Client(*purgeCache)
	_, _, err := (&cd).APICall(payload, "POST", "/purge-cache/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), nil, nil)
	return err
}

// View all active purge requests.
//
// This is useful mostly for administors to view
// the set of open purge requests. It should not
// be used by workers. They should use the purgeRequests
// endpoint that is specific to their workerType and
// provisionerId.
//
// See #allPurgeRequests
func (purgeCache *PurgeCache) AllPurgeRequests(continuationToken, limit string) (*OpenAllPurgeRequestsList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*purgeCache)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/purge-cache/list", new(OpenAllPurgeRequestsList), v)
	return responseObject.(*OpenAllPurgeRequestsList), err
}

// List the caches for this `provisionerId`/`workerType` that should to be
// purged if they are from before the time given in the response.
//
// This is intended to be used by workers to determine which caches to purge.
//
// See #purgeRequests
func (purgeCache *PurgeCache) PurgeRequests(provisionerId, workerType, since string) (*OpenPurgeRequestList, error) {
	v := url.Values{}
	if since != "" {
		v.Add("since", since)
	}
	cd := tcclient.Client(*purgeCache)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/purge-cache/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), new(OpenPurgeRequestList), v)
	return responseObject.(*OpenPurgeRequestList), err
}
