// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/purge-cache/v1/api.json

// The purge-cache service, typically available at
// `purge-cache.taskcluster.net`, is responsible for publishing a pulse
// message for workers, so they can purge cache upon request.
//
// This document describes the API end-point for publishing the pulse
// message. This is mainly intended to be used by tools.
//
// See: https://docs.taskcluster.net/reference/core/purge-cache/api-docs
//
// How to use this package
//
// First create a PurgeCache object:
//
//  purgeCache := purgecache.New(&tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of purgeCache's methods, e.g.:
//
//  err := purgeCache.PurgeCache(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/purge-cache/v1/api.json together with the input and output schemas it references, downloaded on
// Tue, 18 Oct 2016 at 19:24:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package purgecache

import (
	"net/url"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type PurgeCache tcclient.ConnectionData

// Returns a pointer to PurgeCache, configured to run against production.  If you
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
//  purgeCache := purgecache.New(creds)                              // set credentials
//  purgeCache.Authenticate = false                                  // disable authentication (creds above are now ignored)
//  purgeCache.BaseURL = "http://localhost:1234/api/PurgeCache/v1"   // alternative API endpoint (production by default)
//  err := purgeCache.PurgeCache(.....)                              // for example, call the PurgeCache(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *PurgeCache {
	purgeCache := PurgeCache(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://purge-cache.taskcluster.net/v1",
		Authenticate: true,
	})
	return &purgeCache
}

// Stability: *** EXPERIMENTAL ***
//
// Publish a purge-cache message to purge caches named `cacheName` with
// `provisionerId` and `workerType` in the routing-key. Workers should
// be listening for this message and purge caches when they see it.
//
// Required scopes:
//   * purge-cache:<provisionerId>/<workerType>:<cacheName>
//
// See https://docs.taskcluster.net/reference/core/purge-cache/api-docs#purgeCache
func (purgeCache *PurgeCache) PurgeCache(provisionerId, workerType string, payload *PurgeCacheRequest) error {
	cd := tcclient.ConnectionData(*purgeCache)
	_, _, err := (&cd).APICall(payload, "POST", "/purge-cache/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// This is useful mostly for administors to view
// the set of open purge requests. It should not
// be used by workers. They should use the purgeRequests
// endpoint that is specific to their workerType and
// provisionerId.
//
// See https://docs.taskcluster.net/reference/core/purge-cache/api-docs#allPurgeRequests
func (purgeCache *PurgeCache) AllPurgeRequests(continuationToken, limit string) (*OpenAllPurgeRequestsList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.ConnectionData(*purgeCache)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/purge-cache/list", new(OpenAllPurgeRequestsList), v)
	return responseObject.(*OpenAllPurgeRequestsList), err
}

// Stability: *** EXPERIMENTAL ***
//
// List of caches that need to be purged if they are from before
// a certain time. This is safe to be used in automation from
// workers.
//
// See https://docs.taskcluster.net/reference/core/purge-cache/api-docs#purgeRequests
func (purgeCache *PurgeCache) PurgeRequests(provisionerId, workerType, since string) (*OpenPurgeRequestList, error) {
	v := url.Values{}
	if since != "" {
		v.Add("since", since)
	}
	cd := tcclient.ConnectionData(*purgeCache)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/purge-cache/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), new(OpenPurgeRequestList), v)
	return responseObject.(*OpenPurgeRequestList), err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/purge-cache/api-docs#ping
func (purgeCache *PurgeCache) Ping() error {
	cd := tcclient.ConnectionData(*purgeCache)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
