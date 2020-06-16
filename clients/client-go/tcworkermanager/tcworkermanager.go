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

	tcclient "github.com/taskcluster/taskcluster/v30/clients/client-go"
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
// See #workerPool
func (workerManager *WorkerManager) WorkerPool(workerPoolId string) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool/"+url.QueryEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Get the list of all the existing worker pools.
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

// Get the list of all the existing workers in a given group in a given worker pool.
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

// Get a single worker.
//
// See #worker
func (workerManager *WorkerManager) Worker(workerPoolId, workerGroup, workerId string) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerFullDefinition), nil)
	return responseObject.(*WorkerFullDefinition), err
}

// Create a new worker.  The precise behavior of this method depends
// on the provider implementing the given worker pool.  Some providers
// do not support creating workers at all, and will return a 400 error.
//
// Required scopes:
//   worker-manager:create-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #createWorker
func (workerManager *WorkerManager) CreateWorker(workerPoolId, workerGroup, workerId string, payload *WorkerCreationRequest) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/workers/"+url.QueryEscape(workerPoolId)+":/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId), new(WorkerFullDefinition), nil)
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
