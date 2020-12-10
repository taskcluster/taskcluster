// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// /references/worker-manager/v1/api.json
// This service manages workers, including provisioning for dynamic worker pools.
//
// See:
//
// How to use this package
//
// First create a WorkerManager object:
//
//  workerManager := tcworkermanager.New(nil)
//
// and then call one or more of workerManager's methods, e.g.:
//
//  err := workerManager.Ping(.....)
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
// <rootUrl>/references/worker-manager/v1/api.json together with the input and output schemas it references,
package tcworkermanager

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v39/clients/client-go"
)

type WorkerManager tcclient.Client

// New returns a WorkerManager client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  workerManager := tcworkermanager.New(
//      nil,                                      // client without authentication
//      "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//  )
//  err := workerManager.Ping(.....)              // for example, call the Ping(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials, rootURL string) *WorkerManager {
	return &WorkerManager{
		Credentials:  credentials,
		RootURL:      rootURL,
		ServiceName:  "worker-manager",
		APIVersion:   "v1",
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns a *WorkerManager configured from environment variables.
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
func NewFromEnv() *WorkerManager {
	c := tcclient.CredentialsFromEnvVars()
	rootURL := tcclient.RootURLFromEnvVars()
	return &WorkerManager{
		Credentials:  c,
		RootURL:      rootURL,
		ServiceName:  "worker-manager",
		APIVersion:   "v1",
		Authenticate: c.ClientID != "",
	}
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #ping
func (workerManager *WorkerManager) Ping() error {
	cd := tcclient.Client(*workerManager)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}

// Retrieve a list of providers that are available for worker pools.
//
// Required scopes:
//   worker-manager:list-providers
//
// See #listProviders
func (workerManager *WorkerManager) ListProviders(continuationToken, limit string) (*ProviderList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/providers", new(ProviderList), v)
	return responseObject.(*ProviderList), err
}

// Returns a signed URL for ListProviders, valid for the specified duration.
//
// Required scopes:
//   worker-manager:list-providers
//
// See ListProviders for more details.
func (workerManager *WorkerManager) ListProviders_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/providers", v, duration)
}

// Create a new worker pool. If the worker pool already exists, this will throw an error.
//
// Required scopes:
//   All of:
//   * worker-manager:manage-worker-pool:<workerPoolId>
//   * worker-manager:provider:<providerId>
//
// See #createWorkerPool
func (workerManager *WorkerManager) CreateWorkerPool(workerPoolId string, payload *WorkerPoolDefinition) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/worker-pool/"+url.QueryEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Stability: *** EXPERIMENTAL ***
//
// Given an existing worker pool definition, this will modify it and return
// the new definition.
//
// To delete a worker pool, set its `providerId` to `"null-provider"`.
// After any existing workers have exited, a cleanup job will remove the
// worker pool.  During that time, the worker pool can be updated again, such
// as to set its `providerId` to a real provider.
//
// Required scopes:
//   All of:
//   * worker-manager:manage-worker-pool:<workerPoolId>
//   * worker-manager:provider:<providerId>
//
// See #updateWorkerPool
func (workerManager *WorkerManager) UpdateWorkerPool(workerPoolId string, payload *WorkerPoolDefinition1) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker-pool/"+url.QueryEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Mark a worker pool for deletion.  This is the same as updating the pool to
// set its providerId to `"null-provider"`, but does not require scope
// `worker-manager:provider:null-provider`.
//
// Required scopes:
//   worker-manager:manage-worker-pool:<workerPoolId>
//
// See #deleteWorkerPool
func (workerManager *WorkerManager) DeleteWorkerPool(workerPoolId string) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "DELETE", "/worker-pool/"+url.QueryEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Fetch an existing worker pool defition.
//
// Required scopes:
//   worker-manager:get-worker-pool:<workerPoolId>
//
// See #workerPool
func (workerManager *WorkerManager) WorkerPool(workerPoolId string) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool/"+url.QueryEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Returns a signed URL for WorkerPool, valid for the specified duration.
//
// Required scopes:
//   worker-manager:get-worker-pool:<workerPoolId>
//
// See WorkerPool for more details.
func (workerManager *WorkerManager) WorkerPool_SignedURL(workerPoolId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pool/"+url.QueryEscape(workerPoolId), nil, duration)
}

// Get the list of all the existing worker pools.
//
// Required scopes:
//   worker-manager:list-worker-pools
//
// See #listWorkerPools
func (workerManager *WorkerManager) ListWorkerPools(continuationToken, limit string) (*WorkerPoolList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pools", new(WorkerPoolList), v)
	return responseObject.(*WorkerPoolList), err
}

// Returns a signed URL for ListWorkerPools, valid for the specified duration.
//
// Required scopes:
//   worker-manager:list-worker-pools
//
// See ListWorkerPools for more details.
func (workerManager *WorkerManager) ListWorkerPools_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pools", v, duration)
}

// Report an error that occurred on a worker.  This error will be included
// with the other errors in `listWorkerPoolErrors(workerPoolId)`.
//
// Workers can use this endpoint to report startup or configuration errors
// that might be associated with the worker pool configuration and thus of
// interest to a worker-pool administrator.
//
// NOTE: errors are publicly visible.  Ensure that none of the content
// contains secrets or other sensitive information.
//
// Required scopes:
//   All of:
//   * assume:worker-pool:<workerPoolId>
//   * assume:worker-id:<workerGroup>/<workerId>
//
// See #reportWorkerError
func (workerManager *WorkerManager) ReportWorkerError(workerPoolId string, payload *WorkerErrorReport) (*WorkerPoolError, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker-pool-errors/"+url.QueryEscape(workerPoolId), new(WorkerPoolError), nil)
	return responseObject.(*WorkerPoolError), err
}

// Get the list of worker pool errors.
//
// Required scopes:
//   worker-manager:list-worker-pool-errors:<workerPoolId>
//
// See #listWorkerPoolErrors
func (workerManager *WorkerManager) ListWorkerPoolErrors(workerPoolId, continuationToken, limit string) (*WorkerPoolErrorList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool-errors/"+url.QueryEscape(workerPoolId), new(WorkerPoolErrorList), v)
	return responseObject.(*WorkerPoolErrorList), err
}

// Returns a signed URL for ListWorkerPoolErrors, valid for the specified duration.
//
// Required scopes:
//   worker-manager:list-worker-pool-errors:<workerPoolId>
//
// See ListWorkerPoolErrors for more details.
func (workerManager *WorkerManager) ListWorkerPoolErrors_SignedURL(workerPoolId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pool-errors/"+url.QueryEscape(workerPoolId), v, duration)
}

// Get the list of all the existing workers in a given group in a given worker pool.
//
// Required scopes:
//   worker-manager:list-workers:<workerPoolId>/<workerGroup>
//
// See #listWorkersForWorkerGroup
func (workerManager *WorkerManager) ListWorkersForWorkerGroup(workerPoolId, workerGroup, continuationToken, limit string) (*WorkerListInAGivenWorkerPool, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup), new(WorkerListInAGivenWorkerPool), v)
	return responseObject.(*WorkerListInAGivenWorkerPool), err
}

// Returns a signed URL for ListWorkersForWorkerGroup, valid for the specified duration.
//
// Required scopes:
//   worker-manager:list-workers:<workerPoolId>/<workerGroup>
//
// See ListWorkersForWorkerGroup for more details.
func (workerManager *WorkerManager) ListWorkersForWorkerGroup_SignedURL(workerPoolId, workerGroup, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup), v, duration)
}

// Get a single worker.
//
// Required scopes:
//   worker-manager:get-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #worker
func (workerManager *WorkerManager) Worker(workerPoolId, workerGroup, workerId string) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerFullDefinition), nil)
	return responseObject.(*WorkerFullDefinition), err
}

// Returns a signed URL for Worker, valid for the specified duration.
//
// Required scopes:
//   worker-manager:get-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See Worker for more details.
func (workerManager *WorkerManager) Worker_SignedURL(workerPoolId, workerGroup, workerId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), nil, duration)
}

// Create a new worker.  This is only useful for worker pools where the provider
// does not create workers automatically, such as those with a `static` provider
// type.  Providers that do not support creating workers will return a 400 error.
// See the documentation for the individual providers, and in particular the
// [static provider](https://docs.taskcluster.net/docs/reference/core/worker-manager/)
// for more information.
//
// Required scopes:
//   worker-manager:create-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #createWorker
func (workerManager *WorkerManager) CreateWorker(workerPoolId, workerGroup, workerId string, payload *WorkerCreationUpdateRequest) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerFullDefinition), nil)
	return responseObject.(*WorkerFullDefinition), err
}

// Update an existing worker in-place.  Like `createWorker`, this is only useful for
// worker pools where the provider does not create workers automatically.
// This method allows updating all fields in the schema unless otherwise indicated
// in the provider documentation.
// See the documentation for the individual providers, and in particular the
// [static provider](https://docs.taskcluster.net/docs/reference/core/worker-manager/)
// for more information.
//
// Required scopes:
//   worker-manager:update-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #updateWorker
func (workerManager *WorkerManager) UpdateWorker(workerPoolId, workerGroup, workerId string, payload *WorkerCreationUpdateRequest) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerFullDefinition), nil)
	return responseObject.(*WorkerFullDefinition), err
}

// Remove an existing worker.  The precise behavior of this method depends
// on the provider implementing the given worker.  Some providers
// do not support removing workers at all, and will return a 400 error.
// Others may begin removing the worker, but it may remain available via
// the API (perhaps even in state RUNNING) afterward.
//
// Required scopes:
//   worker-manager:remove-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #removeWorker
func (workerManager *WorkerManager) RemoveWorker(workerPoolId, workerGroup, workerId string) error {
	cd := tcclient.Client(*workerManager)
	_, _, err := (&cd).APICall(nil, "DELETE", "/workers/"+url.QueryEscape(workerPoolId)+"/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), nil, nil)
	return err
}

// Get the list of all the existing workers in a given worker pool.
//
// Required scopes:
//   worker-manager:list-workers:<workerPoolId>
//
// See #listWorkersForWorkerPool
func (workerManager *WorkerManager) ListWorkersForWorkerPool(workerPoolId, continuationToken, limit string) (*WorkerListInAGivenWorkerPool, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.QueryEscape(workerPoolId), new(WorkerListInAGivenWorkerPool), v)
	return responseObject.(*WorkerListInAGivenWorkerPool), err
}

// Returns a signed URL for ListWorkersForWorkerPool, valid for the specified duration.
//
// Required scopes:
//   worker-manager:list-workers:<workerPoolId>
//
// See ListWorkersForWorkerPool for more details.
func (workerManager *WorkerManager) ListWorkersForWorkerPool_SignedURL(workerPoolId, continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/workers/"+url.QueryEscape(workerPoolId), v, duration)
}

// Register a running worker.  Workers call this method on worker start-up.
//
// This call both marks the worker as running and returns the credentials
// the worker will require to perform its work.  The worker must provide
// some proof of its identity, and that proof varies by provider type.
//
// See #registerWorker
func (workerManager *WorkerManager) RegisterWorker(payload *RegisterWorkerRequest) (*RegisterWorkerResponse, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker/register", new(RegisterWorkerResponse), nil)
	return responseObject.(*RegisterWorkerResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Reregister a running worker.
//
// This will generate and return new Taskcluster credentials for the worker
// on that instance to use. The credentials will not live longer the
// `registrationTimeout` for that worker. The endpoint will update `terminateAfter`
// for the worker so that worker-manager does not terminate the instance.
//
// Required scopes:
//   worker-manager:reregister-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #reregisterWorker
func (workerManager *WorkerManager) ReregisterWorker(payload *ReregisterWorkerRequest) (*ReregisterWorkerResponse, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker/reregister", new(ReregisterWorkerResponse), nil)
	return responseObject.(*ReregisterWorkerResponse), err
}
