// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run `go generate` in the
// clients/client-go/codegenerator/model subdirectory of the
// taskcluster git repository.

// This package was generated from the reference schema of
// the WorkerManager service, which is also published here:
//
//   * ${TASKCLUSTER_ROOT_URL}/references/worker-manager/v1/api.json
//
// where ${TASKCLUSTER_ROOT_URL} points to the root URL of
// your taskcluster deployment.

// This service manages workers, including provisioning for dynamic worker pools.
//
// Methods interacting with a provider may return a 503 response if that provider has
// not been able to start up, such as if the service to which it interfaces has an
// outage.  Such requests can be retried as for any other 5xx response.
//
// See:
//
// # How to use this package
//
// First create a WorkerManager object:
//
//	workerManager := tcworkermanager.New(nil)
//
// and then call one or more of workerManager's methods, e.g.:
//
//	err := workerManager.Ping(.....)
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
// <rootUrl>/references/worker-manager/v1/api.json together with the input and output schemas it references,
package tcworkermanager

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v95/clients/client-go"
)

type WorkerManager tcclient.Client

// New returns a WorkerManager client, configured to run against production. Pass in
// nil credentials to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//	workerManager := tcworkermanager.New(
//	    nil,                                      // client without authentication
//	    "http://localhost:1234/my/taskcluster",   // taskcluster hosted at this root URL on local machine
//	)
//	err := workerManager.Ping(.....)              // for example, call the Ping(.....) API endpoint (described further down)...
//	if err != nil {
//		// handle errors...
//	}
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
//	TASKCLUSTER_CLIENT_ID
//	TASKCLUSTER_ACCESS_TOKEN
//	TASKCLUSTER_CERTIFICATE
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

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See #lbheartbeat
func (workerManager *WorkerManager) Lbheartbeat() error {
	cd := tcclient.Client(*workerManager)
	_, _, err := (&cd).APICall(nil, "GET", "/__lbheartbeat__", nil, nil)
	return err
}

// Respond with the JSON version object.
// https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md
//
// See #version
func (workerManager *WorkerManager) Version() error {
	cd := tcclient.Client(*workerManager)
	_, _, err := (&cd).APICall(nil, "GET", "/__version__", nil, nil)
	return err
}

// Retrieve a list of providers that are available for worker pools.
//
// Required scopes:
//
//	worker-manager:list-providers
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
//
//	worker-manager:list-providers
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
//
//	All of:
//	* worker-manager:manage-worker-pool:<workerPoolId>
//	* worker-manager:provider:<providerId>
//
// See #createWorkerPool
func (workerManager *WorkerManager) CreateWorkerPool(workerPoolId string, payload *WorkerPoolDefinition) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/worker-pool/"+url.PathEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
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
//
//	All of:
//	* worker-manager:manage-worker-pool:<workerPoolId>
//	* worker-manager:provider:<providerId>
//
// See #updateWorkerPool
func (workerManager *WorkerManager) UpdateWorkerPool(workerPoolId string, payload *WorkerPoolDefinition1) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker-pool/"+url.PathEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Mark a worker pool for deletion.  This is the same as updating the pool to
// set its providerId to `"null-provider"`, but does not require scope
// `worker-manager:provider:null-provider`.
// This will also mark all launch configurations as archived.
//
// Required scopes:
//
//	worker-manager:manage-worker-pool:<workerPoolId>
//
// See #deleteWorkerPool
func (workerManager *WorkerManager) DeleteWorkerPool(workerPoolId string) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "DELETE", "/worker-pool/"+url.PathEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get the list of launch configurations for a given worker pool.
// Include archived launch configurations by setting includeArchived=true.
// By default, only active launch configurations are returned.
//
// Required scopes:
//
//	worker-manager:get-worker-pool:<workerPoolId>
//
// See #listWorkerPoolLaunchConfigs
func (workerManager *WorkerManager) ListWorkerPoolLaunchConfigs(workerPoolId, continuationToken, includeArchived, limit string) (*WorkerPoolLaunchConfigList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if includeArchived != "" {
		v.Add("includeArchived", includeArchived)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool/"+url.PathEscape(workerPoolId)+"/launch-configs", new(WorkerPoolLaunchConfigList), v)
	return responseObject.(*WorkerPoolLaunchConfigList), err
}

// Returns a signed URL for ListWorkerPoolLaunchConfigs, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:get-worker-pool:<workerPoolId>
//
// See ListWorkerPoolLaunchConfigs for more details.
func (workerManager *WorkerManager) ListWorkerPoolLaunchConfigs_SignedURL(workerPoolId, continuationToken, includeArchived, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if includeArchived != "" {
		v.Add("includeArchived", includeArchived)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pool/"+url.PathEscape(workerPoolId)+"/launch-configs", v, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Fetch statistics for an existing worker pool, broken down by launch configuration.
// This includes counts and capacities of requested, running, stopping, and stopped workers.
//
// Required scopes:
//
//	worker-manager:get-worker-pool:<workerPoolId>
//
// See #workerPoolStats
func (workerManager *WorkerManager) WorkerPoolStats(workerPoolId string) (*WorkerPoolStatistics, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool/"+url.PathEscape(workerPoolId)+"/stats", new(WorkerPoolStatistics), nil)
	return responseObject.(*WorkerPoolStatistics), err
}

// Returns a signed URL for WorkerPoolStats, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:get-worker-pool:<workerPoolId>
//
// See WorkerPoolStats for more details.
func (workerManager *WorkerManager) WorkerPoolStats_SignedURL(workerPoolId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pool/"+url.PathEscape(workerPoolId)+"/stats", nil, duration)
}

// Fetch an existing worker pool defition.
//
// Required scopes:
//
//	worker-manager:get-worker-pool:<workerPoolId>
//
// See #workerPool
func (workerManager *WorkerManager) WorkerPool(workerPoolId string) (*WorkerPoolFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool/"+url.PathEscape(workerPoolId), new(WorkerPoolFullDefinition), nil)
	return responseObject.(*WorkerPoolFullDefinition), err
}

// Returns a signed URL for WorkerPool, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:get-worker-pool:<workerPoolId>
//
// See WorkerPool for more details.
func (workerManager *WorkerManager) WorkerPool_SignedURL(workerPoolId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pool/"+url.PathEscape(workerPoolId), nil, duration)
}

// Get the list of all the existing worker pools.
//
// Required scopes:
//
//	worker-manager:list-worker-pools
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
//
//	worker-manager:list-worker-pools
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

// Stability: *** EXPERIMENTAL ***
//
// # Get the stats for all worker pools - number of requested, running, stopping and stopped capacity
//
// Required scopes:
//
//	worker-manager:list-worker-pools
//
// See #listWorkerPoolsStats
func (workerManager *WorkerManager) ListWorkerPoolsStats(continuationToken, limit string) (*WorkerPoolListStats, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pools/stats", new(WorkerPoolListStats), v)
	return responseObject.(*WorkerPoolListStats), err
}

// Returns a signed URL for ListWorkerPoolsStats, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:list-worker-pools
//
// See ListWorkerPoolsStats for more details.
func (workerManager *WorkerManager) ListWorkerPoolsStats_SignedURL(continuationToken, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pools/stats", v, duration)
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
//
//	All of:
//	* assume:worker-pool:<workerPoolId>
//	* assume:worker-id:<workerGroup>/<workerId>
//
// See #reportWorkerError
func (workerManager *WorkerManager) ReportWorkerError(workerPoolId string, payload *WorkerErrorReport) (*WorkerPoolError, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker-pool-errors/"+url.PathEscape(workerPoolId), new(WorkerPoolError), nil)
	return responseObject.(*WorkerPoolError), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get the list of worker pool errors count.
// Contains total count of errors for the past 7 days and 24 hours
// Also includes total counts grouped by titles of error and error code.
//
// # If `workerPoolId` is not specified, it will return the count of all errors
//
// Required scopes:
//
//	worker-manager:list-worker-pool-errors:<workerPoolId>
//
// See #workerPoolErrorStats
func (workerManager *WorkerManager) WorkerPoolErrorStats(workerPoolId string) (*WorkerPoolErrorStats, error) {
	v := url.Values{}
	if workerPoolId != "" {
		v.Add("workerPoolId", workerPoolId)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool-errors/stats", new(WorkerPoolErrorStats), v)
	return responseObject.(*WorkerPoolErrorStats), err
}

// Returns a signed URL for WorkerPoolErrorStats, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:list-worker-pool-errors:<workerPoolId>
//
// See WorkerPoolErrorStats for more details.
func (workerManager *WorkerManager) WorkerPoolErrorStats_SignedURL(workerPoolId string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if workerPoolId != "" {
		v.Add("workerPoolId", workerPoolId)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pool-errors/stats", v, duration)
}

// Get the list of worker pool errors.
//
// Required scopes:
//
//	worker-manager:list-worker-pool-errors:<workerPoolId>
//
// See #listWorkerPoolErrors
func (workerManager *WorkerManager) ListWorkerPoolErrors(workerPoolId, continuationToken, errorId, launchConfigId, limit string) (*WorkerPoolErrorList, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if errorId != "" {
		v.Add("errorId", errorId)
	}
	if launchConfigId != "" {
		v.Add("launchConfigId", launchConfigId)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-pool-errors/"+url.PathEscape(workerPoolId), new(WorkerPoolErrorList), v)
	return responseObject.(*WorkerPoolErrorList), err
}

// Returns a signed URL for ListWorkerPoolErrors, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:list-worker-pool-errors:<workerPoolId>
//
// See ListWorkerPoolErrors for more details.
func (workerManager *WorkerManager) ListWorkerPoolErrors_SignedURL(workerPoolId, continuationToken, errorId, launchConfigId, limit string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if errorId != "" {
		v.Add("errorId", errorId)
	}
	if launchConfigId != "" {
		v.Add("launchConfigId", launchConfigId)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/worker-pool-errors/"+url.PathEscape(workerPoolId), v, duration)
}

// Get the list of all the existing workers in a given group in a given worker pool.
//
// Required scopes:
//
//	worker-manager:list-workers:<workerPoolId>/<workerGroup>
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
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.PathEscape(workerPoolId)+"/"+url.PathEscape(workerGroup), new(WorkerListInAGivenWorkerPool), v)
	return responseObject.(*WorkerListInAGivenWorkerPool), err
}

// Returns a signed URL for ListWorkersForWorkerGroup, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:list-workers:<workerPoolId>/<workerGroup>
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
	return (&cd).SignedURL("/workers/"+url.PathEscape(workerPoolId)+"/"+url.PathEscape(workerGroup), v, duration)
}

// Get a single worker.
//
// Required scopes:
//
//	worker-manager:get-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #worker
func (workerManager *WorkerManager) Worker(workerPoolId, workerGroup, workerId string) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.PathEscape(workerPoolId)+"/"+url.PathEscape(workerGroup)+"/"+url.PathEscape(workerId), new(WorkerFullDefinition), nil)
	return responseObject.(*WorkerFullDefinition), err
}

// Returns a signed URL for Worker, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:get-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See Worker for more details.
func (workerManager *WorkerManager) Worker_SignedURL(workerPoolId, workerGroup, workerId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/workers/"+url.PathEscape(workerPoolId)+"/"+url.PathEscape(workerGroup)+"/"+url.PathEscape(workerId), nil, duration)
}

// Create a new worker.  This is only useful for worker pools where the provider
// does not create workers automatically, such as those with a `static` provider
// type.  Providers that do not support creating workers will return a 400 error.
// See the documentation for the individual providers, and in particular the
// [static provider](https://docs.taskcluster.net/docs/reference/core/worker-manager/)
// for more information.
//
// Required scopes:
//
//	worker-manager:create-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #createWorker
func (workerManager *WorkerManager) CreateWorker(workerPoolId, workerGroup, workerId string, payload *WorkerCreationUpdateRequest) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/workers/"+url.PathEscape(workerPoolId)+"/"+url.PathEscape(workerGroup)+"/"+url.PathEscape(workerId), new(WorkerFullDefinition), nil)
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
//
//	worker-manager:update-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #updateWorker
func (workerManager *WorkerManager) UpdateWorker(workerPoolId, workerGroup, workerId string, payload *WorkerCreationUpdateRequest) (*WorkerFullDefinition, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/workers/"+url.PathEscape(workerPoolId)+"/"+url.PathEscape(workerGroup)+"/"+url.PathEscape(workerId), new(WorkerFullDefinition), nil)
	return responseObject.(*WorkerFullDefinition), err
}

// Remove an existing worker.  The precise behavior of this method depends
// on the provider implementing the given worker.  Some providers
// do not support removing workers at all, and will return a 400 error.
// Others may begin removing the worker, but it may remain available via
// the API (perhaps even in state RUNNING) afterward.
//
// Required scopes:
//
//	worker-manager:remove-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #removeWorker
func (workerManager *WorkerManager) RemoveWorker(workerPoolId, workerGroup, workerId string) error {
	cd := tcclient.Client(*workerManager)
	_, _, err := (&cd).APICall(nil, "DELETE", "/workers/"+url.PathEscape(workerPoolId)+"/"+url.PathEscape(workerGroup)+"/"+url.PathEscape(workerId), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Decides if worker should terminate or keep working.
//
// Required scopes:
//
//	worker-manager:should-worker-terminate:<workerPoolId>/<workerGroup>/<workerId>
//
// See #shouldWorkerTerminate
func (workerManager *WorkerManager) ShouldWorkerTerminate(workerPoolId, workerGroup, workerId string) (*ShouldWorkerTerminateResponse, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.QueryEscape(workerPoolId)+"/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId)+"/should-terminate", new(ShouldWorkerTerminateResponse), nil)
	return responseObject.(*ShouldWorkerTerminateResponse), err
}

// Returns a signed URL for ShouldWorkerTerminate, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:should-worker-terminate:<workerPoolId>/<workerGroup>/<workerId>
//
// See ShouldWorkerTerminate for more details.
func (workerManager *WorkerManager) ShouldWorkerTerminate_SignedURL(workerPoolId, workerGroup, workerId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/workers/"+url.QueryEscape(workerPoolId)+"/"+url.QueryEscape(workerGroup)+"/"+url.QueryEscape(workerId)+"/should-terminate", nil, duration)
}

// Get the list of all the existing workers in a given worker pool.
//
// Required scopes:
//
//	worker-manager:list-workers:<workerPoolId>
//
// See #listWorkersForWorkerPool
func (workerManager *WorkerManager) ListWorkersForWorkerPool(workerPoolId, continuationToken, launchConfigId, limit, state string) (*WorkerListInAGivenWorkerPool, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if launchConfigId != "" {
		v.Add("launchConfigId", launchConfigId)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if state != "" {
		v.Add("state", state)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/workers/"+url.PathEscape(workerPoolId), new(WorkerListInAGivenWorkerPool), v)
	return responseObject.(*WorkerListInAGivenWorkerPool), err
}

// Returns a signed URL for ListWorkersForWorkerPool, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:list-workers:<workerPoolId>
//
// See ListWorkersForWorkerPool for more details.
func (workerManager *WorkerManager) ListWorkersForWorkerPool_SignedURL(workerPoolId, continuationToken, launchConfigId, limit, state string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if launchConfigId != "" {
		v.Add("launchConfigId", launchConfigId)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if state != "" {
		v.Add("state", state)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/workers/"+url.PathEscape(workerPoolId), v, duration)
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
//
//	worker-manager:reregister-worker:<workerPoolId>/<workerGroup>/<workerId>
//
// See #reregisterWorker
func (workerManager *WorkerManager) ReregisterWorker(payload *ReregisterWorkerRequest) (*ReregisterWorkerResponse, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker/reregister", new(ReregisterWorkerResponse), nil)
	return responseObject.(*ReregisterWorkerResponse), err
}

// Stability: *** EXPERIMENTAL ***
//
// Get a list of all active workers of a workerType.
//
// `listWorkers` allows a response to be filtered by quarantined and non quarantined workers,
// as well as the current state of the worker.
// To filter the query, you should call the end-point with one of [`quarantined`, `workerState`]
// as a query-string option with a true or false value.
//
// The response is paged. If this end-point returns a `continuationToken`, you
// should call the end-point again with the `continuationToken` as a query-string
// option. By default this end-point will list up to 1000 workers in a single
// page. You may limit this with the query-string parameter `limit`.
//
// Required scopes:
//
//	worker-manager:list-workers:<provisionerId>/<workerType>
//
// See #listWorkers
func (workerManager *WorkerManager) ListWorkers(provisionerId, workerType, continuationToken, launchConfigId, limit, quarantined, workerState string) (*ListWorkersResponse, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if launchConfigId != "" {
		v.Add("launchConfigId", launchConfigId)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if quarantined != "" {
		v.Add("quarantined", quarantined)
	}
	if workerState != "" {
		v.Add("workerState", workerState)
	}
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.PathEscape(provisionerId)+"/worker-types/"+url.PathEscape(workerType)+"/workers", new(ListWorkersResponse), v)
	return responseObject.(*ListWorkersResponse), err
}

// Returns a signed URL for ListWorkers, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:list-workers:<provisionerId>/<workerType>
//
// See ListWorkers for more details.
func (workerManager *WorkerManager) ListWorkers_SignedURL(provisionerId, workerType, continuationToken, launchConfigId, limit, quarantined, workerState string, duration time.Duration) (*url.URL, error) {
	v := url.Values{}
	if continuationToken != "" {
		v.Add("continuationToken", continuationToken)
	}
	if launchConfigId != "" {
		v.Add("launchConfigId", launchConfigId)
	}
	if limit != "" {
		v.Add("limit", limit)
	}
	if quarantined != "" {
		v.Add("quarantined", quarantined)
	}
	if workerState != "" {
		v.Add("workerState", workerState)
	}
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/provisioners/"+url.PathEscape(provisionerId)+"/worker-types/"+url.PathEscape(workerType)+"/workers", v, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Get a worker from a worker-type.
//
// Required scopes:
//
//	worker-manager:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>
//
// See #getWorker
func (workerManager *WorkerManager) GetWorker(provisionerId, workerType, workerGroup, workerId string) (*WorkerResponse, error) {
	cd := tcclient.Client(*workerManager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/provisioners/"+url.PathEscape(provisionerId)+"/worker-types/"+url.PathEscape(workerType)+"/workers/"+url.PathEscape(workerGroup)+"/"+url.PathEscape(workerId), new(WorkerResponse), nil)
	return responseObject.(*WorkerResponse), err
}

// Returns a signed URL for GetWorker, valid for the specified duration.
//
// Required scopes:
//
//	worker-manager:get-worker:<provisionerId>/<workerType>/<workerGroup>/<workerId>
//
// See GetWorker for more details.
func (workerManager *WorkerManager) GetWorker_SignedURL(provisionerId, workerType, workerGroup, workerId string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*workerManager)
	return (&cd).SignedURL("/provisioners/"+url.PathEscape(provisionerId)+"/worker-types/"+url.PathEscape(workerType)+"/workers/"+url.PathEscape(workerGroup)+"/"+url.PathEscape(workerId), nil, duration)
}

// Respond with a service heartbeat.
//
// This endpoint is used to check on backing services this service
// depends on.
//
// See #heartbeat
func (workerManager *WorkerManager) Heartbeat() error {
	cd := tcclient.Client(*workerManager)
	_, _, err := (&cd).APICall(nil, "GET", "/__heartbeat__", nil, nil)
	return err
}
