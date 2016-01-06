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
// See: http://docs.taskcluster.net/services/purge-cache
//
// How to use this package
//
// First create a PurgeCache object:
//
//  purgeCache := purgecache.New("myClientId", "myAccessToken")
//
// and then call one or more of purgeCache's methods, e.g.:
//
//  callSummary, err := purgeCache.PurgeCache(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/purge-cache/v1/api.json together with the input and output schemas it references, downloaded on
// Wed, 6 Jan 2016 at 10:39:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package purgecache

import (
	"net/url"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
	D "github.com/tj/go-debug"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("purgecache")
)

type PurgeCache tcclient.ConnectionData

// Returns a pointer to PurgeCache, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  purgeCache := purgecache.New("123", "456")                       // set clientId and accessToken
//  purgeCache.Authenticate = false                                  // disable authentication (true by default)
//  purgeCache.BaseURL = "http://localhost:1234/api/PurgeCache/v1"   // alternative API endpoint (production by default)
//  callSummary, err := purgeCache.PurgeCache(.....)                 // for example, call the PurgeCache(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *PurgeCache {
	purgeCache := PurgeCache(tcclient.ConnectionData{
		ClientId:     clientId,
		AccessToken:  accessToken,
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
// See http://docs.taskcluster.net/services/purge-cache/#purgeCache
func (purgeCache *PurgeCache) PurgeCache(provisionerId string, workerType string, payload *PurgeCacheRequest) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*purgeCache)
	_, callSummary, err := (&cd).APICall(payload, "POST", "/purge-cache/"+url.QueryEscape(provisionerId)+"/"+url.QueryEscape(workerType), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/services/purge-cache/#ping
func (purgeCache *PurgeCache) Ping() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*purgeCache)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}

type (

	// Request that a message be published to purge a specific cache.
	//
	// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request.json#
	PurgeCacheRequest struct {

		// Name of cache to purge. Notice that if a `workerType` have multiple kinds
		// of caches (with independent names), it should purge all caches identified
		// by `cacheName` regardless of cache type.
		//
		// See http://schemas.taskcluster.net/purge-cache/v1/purge-cache-request.json#/properties/cacheName
		CacheName string `json:"cacheName"`
	}
)
