// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://references.taskcluster.net/aws-provisioner/v1/api.json

// The AWS Provisioner is responsible for provisioning instances on EC2 for use in
// Taskcluster.  The provisioner maintains a set of worker configurations which
// can be managed with an API that is typically available at
// aws-provisioner.taskcluster.net/v1.  This API can also perform basic instance
// management tasks in addition to maintaining the internal state of worker type
// configuration information.
//
// The Provisioner runs at a configurable interval.  Each iteration of the
// provisioner fetches a current copy the state that the AWS EC2 api reports.  In
// each iteration, we ask the Queue how many tasks are pending for that worker
// type.  Based on the number of tasks pending and the scaling ratio, we may
// submit requests for new instances.  We use pricing information, capacity and
// utility factor information to decide which instance type in which region would
// be the optimal configuration.
//
// Each EC2 instance type will declare a capacity and utility factor.  Capacity is
// the number of tasks that a given machine is capable of running concurrently.
// Utility factor is a relative measure of performance between two instance types.
// We multiply the utility factor by the spot price to compare instance types and
// regions when making the bidding choices.
//
// When a new EC2 instance is instantiated, its user data contains a token in
// `securityToken` that can be used with the `getSecret` method to retrieve
// the worker's credentials and any needed passwords or other restricted
// information.  The worker is responsible for deleting the secret after
// retrieving it, to prevent dissemination of the secret to other proceses
// which can read the instance user data.
//
// See: https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs
//
// How to use this package
//
// First create an AwsProvisioner object:
//
//  awsProvisioner := tcawsprovisioner.New(nil)
//
// and then call one or more of awsProvisioner's methods, e.g.:
//
//  data, err := awsProvisioner.ListWorkerTypeSummaries(.....)
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
// https://references.taskcluster.net/aws-provisioner/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 7 May 2018 at 13:22:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcawsprovisioner

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "https://aws-provisioner.taskcluster.net/v1"
)

type AwsProvisioner tcclient.Client

// New returns an AwsProvisioner client, configured to run against production. Pass in
// nil to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  awsProvisioner := tcawsprovisioner.New(nil)                              // client without authentication
//  awsProvisioner.BaseURL = "http://localhost:1234/api/AwsProvisioner/v1"   // alternative API endpoint (production by default)
//  data, err := awsProvisioner.ListWorkerTypeSummaries(.....)               // for example, call the ListWorkerTypeSummaries(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *AwsProvisioner {
	return &AwsProvisioner{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns an AwsProvisioner client with credentials taken from the environment variables:
//
//  TASKCLUSTER_CLIENT_ID
//  TASKCLUSTER_ACCESS_TOKEN
//  TASKCLUSTER_CERTIFICATE
//
// If environment variables TASKCLUSTER_CLIENT_ID is empty string or undefined
// authentication will be disabled.
func NewFromEnv() *AwsProvisioner {
	c := tcclient.CredentialsFromEnvVars()
	return &AwsProvisioner{
		Credentials:  c,
		BaseURL:      DefaultBaseURL,
		Authenticate: c.ClientID != "",
	}
}

// Return a list of worker types, including some summary information about
// current capacity for each.  While this list includes all defined worker types,
// there may be running EC2 instances for deleted worker types that are not
// included here.  The list is unordered.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#listWorkerTypeSummaries
func (awsProvisioner *AwsProvisioner) ListWorkerTypeSummaries() (*ListWorkerTypeSummariesResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/list-worker-type-summaries", new(ListWorkerTypeSummariesResponse), nil)
	return responseObject.(*ListWorkerTypeSummariesResponse), err
}

// Create a worker type.  A worker type contains all the configuration
// needed for the provisioner to manage the instances.  Each worker type
// knows which regions and which instance types are allowed for that
// worker type.  Remember that Capacity is the number of concurrent tasks
// that can be run on a given EC2 resource and that Utility is the relative
// performance rate between different instance types.  There is no way to
// configure different regions to have different sets of instance types
// so ensure that all instance types are available in all regions.
// This function is idempotent.
//
// Once a worker type is in the provisioner, a back ground process will
// begin creating instances for it based on its capacity bounds and its
// pending task count from the Queue.  It is the worker's responsibility
// to shut itself down.  The provisioner has a limit (currently 96hours)
// for all instances to prevent zombie instances from running indefinitely.
//
// The provisioner will ensure that all instances created are tagged with
// aws resource tags containing the provisioner id and the worker type.
//
// If provided, the secrets in the global, region and instance type sections
// are available using the secrets api.  If specified, the scopes provided
// will be used to generate a set of temporary credentials available with
// the other secrets.
//
// Required scopes:
//   aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#createWorkerType
func (awsProvisioner *AwsProvisioner) CreateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*WorkerTypeResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/worker-type/"+url.QueryEscape(workerType), new(WorkerTypeResponse), nil)
	return responseObject.(*WorkerTypeResponse), err
}

// Provide a new copy of a worker type to replace the existing one.
// This will overwrite the existing worker type definition if there
// is already a worker type of that name.  This method will return a
// 200 response along with a copy of the worker type definition created
// Note that if you are using the result of a GET on the worker-type
// end point that you will need to delete the lastModified and workerType
// keys from the object returned, since those fields are not allowed
// the request body for this method
//
// Otherwise, all input requirements and actions are the same as the
// create method.
//
// Required scopes:
//   aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#updateWorkerType
func (awsProvisioner *AwsProvisioner) UpdateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*WorkerTypeResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker-type/"+url.QueryEscape(workerType)+"/update", new(WorkerTypeResponse), nil)
	return responseObject.(*WorkerTypeResponse), err
}

// This method is provided to allow workers to see when they were
// last modified.  The value provided through UserData can be
// compared against this value to see if changes have been made
// If the worker type definition has not been changed, the date
// should be identical as it is the same stored value.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#workerTypeLastModified
func (awsProvisioner *AwsProvisioner) WorkerTypeLastModified(workerType string) (*WorkerTypeLastModified, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-type-last-modified/"+url.QueryEscape(workerType), new(WorkerTypeLastModified), nil)
	return responseObject.(*WorkerTypeLastModified), err
}

// Retrieve a copy of the requested worker type definition.
// This copy contains a lastModified field as well as the worker
// type name.  As such, it will require manipulation to be able to
// use the results of this method to submit date to the update
// method.
//
// Required scopes:
//   Any of:
//   - aws-provisioner:view-worker-type:<workerType>
//   - aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#workerType
func (awsProvisioner *AwsProvisioner) WorkerType(workerType string) (*WorkerTypeResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-type/"+url.QueryEscape(workerType), new(WorkerTypeResponse), nil)
	return responseObject.(*WorkerTypeResponse), err
}

// Returns a signed URL for WorkerType, valid for the specified duration.
//
// Required scopes:
//   Any of:
//   - aws-provisioner:view-worker-type:<workerType>
//   - aws-provisioner:manage-worker-type:<workerType>
//
// See WorkerType for more details.
func (awsProvisioner *AwsProvisioner) WorkerType_SignedURL(workerType string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*awsProvisioner)
	return (&cd).SignedURL("/worker-type/"+url.QueryEscape(workerType), nil, duration)
}

// Delete a worker type definition.  This method will only delete
// the worker type definition from the storage table.  The actual
// deletion will be handled by a background worker.  As soon as this
// method is called for a worker type, the background worker will
// immediately submit requests to cancel all spot requests for this
// worker type as well as killing all instances regardless of their
// state.  If you want to gracefully remove a worker type, you must
// either ensure that no tasks are created with that worker type name
// or you could theoretically set maxCapacity to 0, though, this is
// not a supported or tested action
//
// Required scopes:
//   aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#removeWorkerType
func (awsProvisioner *AwsProvisioner) RemoveWorkerType(workerType string) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "DELETE", "/worker-type/"+url.QueryEscape(workerType), nil, nil)
	return err
}

// Return a list of string worker type names.  These are the names
// of all managed worker types known to the provisioner.  This does
// not include worker types which are left overs from a deleted worker
// type definition but are still running in AWS.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#listWorkerTypes
func (awsProvisioner *AwsProvisioner) ListWorkerTypes() (*ListWorkerTypes, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/list-worker-types", new(ListWorkerTypes), nil)
	return responseObject.(*ListWorkerTypes), err
}

// Insert a secret into the secret storage.  The supplied secrets will
// be provided verbatime via `getSecret`, while the supplied scopes will
// be converted into credentials by `getSecret`.
//
// This method is not ordinarily used in production; instead, the provisioner
// creates a new secret directly for each spot bid.
//
// Required scopes:
//   aws-provisioner:create-secret:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#createSecret
func (awsProvisioner *AwsProvisioner) CreateSecret(token string, payload *SecretRequest) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(payload, "PUT", "/secret/"+url.QueryEscape(token), nil, nil)
	return err
}

// Retrieve a secret from storage.  The result contains any passwords or
// other restricted information verbatim as well as a temporary credential
// based on the scopes specified when the secret was created.
//
// It is important that this secret is deleted by the consumer (`removeSecret`),
// or else the secrets will be visible to any process which can access the
// user data associated with the instance.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#getSecret
func (awsProvisioner *AwsProvisioner) GetSecret(token string) (*SecretResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/secret/"+url.QueryEscape(token), new(SecretResponse), nil)
	return responseObject.(*SecretResponse), err
}

// An instance will report in by giving its instance id as well
// as its security token.  The token is given and checked to ensure
// that it matches a real token that exists to ensure that random
// machines do not check in.  We could generate a different token
// but that seems like overkill
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#instanceStarted
func (awsProvisioner *AwsProvisioner) InstanceStarted(instanceId, token string) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "GET", "/instance-started/"+url.QueryEscape(instanceId)+"/"+url.QueryEscape(token), nil, nil)
	return err
}

// Remove a secret.  After this call, a call to `getSecret` with the given
// token will return no information.
//
// It is very important that the consumer of a
// secret delete the secret from storage before handing over control
// to untrusted processes to prevent credential and/or secret leakage.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#removeSecret
func (awsProvisioner *AwsProvisioner) RemoveSecret(token string) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "DELETE", "/secret/"+url.QueryEscape(token), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// This method returns a preview of all possible launch specifications
// that this worker type definition could submit to EC2.  It is used to
// test worker types, nothing more
//
// **This API end-point is experimental and may be subject to change without warning.**
//
// Required scopes:
//   Any of:
//   - aws-provisioner:view-worker-type:<workerType>
//   - aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#getLaunchSpecs
func (awsProvisioner *AwsProvisioner) GetLaunchSpecs(workerType string) (*LaunchSpecsResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-type/"+url.QueryEscape(workerType)+"/launch-specifications", new(LaunchSpecsResponse), nil)
	return responseObject.(*LaunchSpecsResponse), err
}

// Returns a signed URL for GetLaunchSpecs, valid for the specified duration.
//
// Required scopes:
//   Any of:
//   - aws-provisioner:view-worker-type:<workerType>
//   - aws-provisioner:manage-worker-type:<workerType>
//
// See GetLaunchSpecs for more details.
func (awsProvisioner *AwsProvisioner) GetLaunchSpecs_SignedURL(workerType string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*awsProvisioner)
	return (&cd).SignedURL("/worker-type/"+url.QueryEscape(workerType)+"/launch-specifications", nil, duration)
}

// Return the state of a given workertype as stored by the provisioner.
// This state is stored as three lists: 1 for running instances, 1 for
// pending requests.  The `summary` property contains an updated summary
// similar to that returned from `listWorkerTypeSummaries`.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#state
func (awsProvisioner *AwsProvisioner) State(workerType string) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "GET", "/state/"+url.QueryEscape(workerType), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// This endpoint is used to show when the last time the provisioner
// has checked in.  A check in is done through the deadman's snitch
// api.  It is done at the conclusion of a provisioning iteration
// and used to tell if the background provisioning process is still
// running.
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#backendStatus
func (awsProvisioner *AwsProvisioner) BackendStatus() (*BackendStatusResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/backend-status", new(BackendStatusResponse), nil)
	return responseObject.(*BackendStatusResponse), err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#ping
func (awsProvisioner *AwsProvisioner) Ping() error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
