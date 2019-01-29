// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://taskcluster-staging.net/references/purge-cache/v1/api.json

// The purge-cache service is responsible for publishing a pulse
// message for workers, so they can purge cache upon request.
//
// This document describes the API end-point for publishing the pulse
// message. This is mainly intended to be used by tools.
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
// https://taskcluster-staging.net/references/purge-cache/v1/api.json together with the input and output schemas it references, downloaded on
// Tue, 29 Jan 2019 at 08:22:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcpurgecache

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
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
		BaseURL:      tcclient.BaseURL(rootURL, "purge-cache", "v1"),
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
	return &PurgeCache{
		Credentials:  c,
		BaseURL:      tcclient.BaseURL(tcclient.RootURLFromEnvVars(), "purge-cache", "v1"),
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

// Publish a purge-cache message to purge caches named `cacheName` with
// `provisionerId` and `workerType` in the routing-key. Workers should
// be listening for this message and purge caches when they see it.
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

// List of caches that need to be purged if they are from before
// a certain time. This is safe to be used in automation from
// workers.
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
