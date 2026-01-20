// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the PurgeCache service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/purge-cache/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// The purge-cache service is responsible for tracking cache-purge requests.
//
// User create purge requests for specific caches on specific workers, and
// these requests are timestamped.  Workers consult the service before
// starting a new task, and purge any caches older than the timestamp.
//
// See:
//
// # How to use this package
//
// First create a PurgeCache object:
//
//	purgeCache := tcpurgecache.New(nil)
//
// and then call one or more of purgeCache's methods, e.g.:
//
//	err := purgeCache.Ping(.....)
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
// <rootUrl>/references/purge-cache/v1/api.json together with the input and output schemas it references,
package tcpurgecache

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
)

type PurgeCache tcclient.Client

// New returns a PurgeCache client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	purgeCache := tcpurgecache.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := purgeCache.Ping(.....)                 // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
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
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
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

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (purgeCache *PurgeCache) Lbheartbeat() error {
	cd := tcclient.Client(*purgeCache)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (purgeCache *PurgeCache) Version() error {
	cd := tcclient.Client(*purgeCache)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// Publish a request to purge caches named `cacheName` with
// on `workerPoolId` workers.
//
// If such a request already exists, its `before` timestamp is updated to
// the current time.
//
// Required scopes:
//
//	purge-cache:<workerPoolId>:<cacheName>
//
// See #purgeCache
func (purgeCache *PurgeCache) PurgeCache(workerPoolId string, payload *PurgeCacheRequest) error {
	cd := tcclient.Client(*purgeCache)
	_, _, err := (&cd).APICall(payload, "POST", "/purge-cache/"+url.PathEscape(workerPoolId), nil, nil)
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
// Required scopes:
//
//	purge-cache:all-purge-requests
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

// Returns a signed URL for AllPurgeRequests, valid for the specified duration.
//
// Required scopes:
//
//	purge-cache:all-purge-requests
//
// See AllPurgeRequests for more details.
func (purgeCache *PurgeCache) AllPurgeRequests_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*purgeCache)
	return (&cd).SignedURL("/purge-cache/list", v, duration)
}

// List the caches for this `workerPoolId` that should to be
// purged if they are from before the time given in the response.
//
// This is intended to be used by workers to determine which caches to purge.
//
// Required scopes:
//
//	purge-cache:purge-requests::<workerPoolId>
//
// See #purgeRequests
func (purgeCache *PurgeCache) PurgeRequests(workerPoolId, since string) (*OpenPurgeRequestList, error) {
	v := url.Values{}
	if since != "" {
		v.Add("since", since)
	}
	cd := tcclient.Client(*purgeCache)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/purge-cache/"+url.PathEscape(workerPoolId), new(OpenPurgeRequestList), v)
	return responseObject.(*OpenPurgeRequestList), err
}

// Returns a signed URL for PurgeRequests, valid for the specified duration.
//
// Required scopes:
//
//	purge-cache:purge-requests::<workerPoolId>
//
// See PurgeRequests for more details.
func (purgeCache *PurgeCache) PurgeRequests_SignedURL(workerPoolId, since string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if since != "" {
		v.Add("since", since)
	}
	cd := tcclient.Client(*purgeCache)
	return (&cd).SignedURL("/purge-cache/"+url.PathEscape(workerPoolId), v, duration)
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (purgeCache *PurgeCache) Heartbeat() error {
	cd := tcclient.Client(*purgeCache)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
