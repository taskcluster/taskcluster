// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/aws-provisioner/v1/api.json

// The AWS Provisioner is responsible for provisioning instances on EC2 for use in
// TaskCluster.  The provisioner maintains a set of worker configurations which
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
//  awsProvisioner := awsprovisioner.New(&tcclient.Credentials{ClientID: "myClientID", AccessToken: "myAccessToken"})
//
// and then call one or more of awsProvisioner's methods, e.g.:
//
//  data, err := awsProvisioner.ListWorkerTypeSummaries(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/aws-provisioner/v1/api.json together with the input and output schemas it references, downloaded on
// Fri, 7 Apr 2017 at 13:24:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package awsprovisioner

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

type AwsProvisioner tcclient.Client

// Returns a pointer to AwsProvisioner, configured to run against production.  If you
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
//  awsProvisioner := awsprovisioner.New(creds)                              // set credentials
//  awsProvisioner.Authenticate = false                                      // disable authentication (creds above are now ignored)
//  awsProvisioner.BaseURL = "http://localhost:1234/api/AwsProvisioner/v1"   // alternative API endpoint (production by default)
//  data, err := awsProvisioner.ListWorkerTypeSummaries(.....)               // for example, call the ListWorkerTypeSummaries(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *AwsProvisioner {
	awsProvisioner := AwsProvisioner(tcclient.Client{
		Credentials:  credentials,
		BaseURL:      "https://aws-provisioner.taskcluster.net/v1",
		Authenticate: true,
	})
	return &awsProvisioner
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
//   * aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#createWorkerType
func (awsProvisioner *AwsProvisioner) CreateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*GetWorkerTypeResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(payload, "PUT", "/worker-type/"+url.QueryEscape(workerType), new(GetWorkerTypeResponse), nil)
	return responseObject.(*GetWorkerTypeResponse), err
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
//   * aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#updateWorkerType
func (awsProvisioner *AwsProvisioner) UpdateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*GetWorkerTypeResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/worker-type/"+url.QueryEscape(workerType)+"/update", new(GetWorkerTypeResponse), nil)
	return responseObject.(*GetWorkerTypeResponse), err
}

// This method is provided to allow workers to see when they were
// last modified.  The value provided through UserData can be
// compared against this value to see if changes have been made
// If the worker type definition has not been changed, the date
// should be identical as it is the same stored value.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#workerTypeLastModified
func (awsProvisioner *AwsProvisioner) WorkerTypeLastModified(workerType string) (*GetWorkerTypeResponse1, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-type-last-modified/"+url.QueryEscape(workerType), new(GetWorkerTypeResponse1), nil)
	return responseObject.(*GetWorkerTypeResponse1), err
}

// Retreive a copy of the requested worker type definition.
// This copy contains a lastModified field as well as the worker
// type name.  As such, it will require manipulation to be able to
// use the results of this method to submit date to the update
// method.
//
// Required scopes:
//   * aws-provisioner:view-worker-type:<workerType>, or
//   * aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#workerType
func (awsProvisioner *AwsProvisioner) WorkerType(workerType string) (*GetWorkerTypeResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-type/"+url.QueryEscape(workerType), new(GetWorkerTypeResponse), nil)
	return responseObject.(*GetWorkerTypeResponse), err
}

// Returns a signed URL for WorkerType, valid for the specified duration.
//
// Required scopes:
//   * aws-provisioner:view-worker-type:<workerType>, or
//   * aws-provisioner:manage-worker-type:<workerType>
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
//   * aws-provisioner:manage-worker-type:<workerType>
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
func (awsProvisioner *AwsProvisioner) ListWorkerTypes() (*ListWorkerTypes1, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/list-worker-types", new(ListWorkerTypes1), nil)
	return responseObject.(*ListWorkerTypes1), err
}

// Create an AMI Set. An AMI Set is a collection of AMIs with a single name.
//
// Required scopes:
//   * aws-provisioner:manage-ami-set:<amiSetId>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#createAmiSet
func (awsProvisioner *AwsProvisioner) CreateAmiSet(id string, payload *CreateAMISetRequest) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(payload, "PUT", "/ami-set/"+url.QueryEscape(id), nil, nil)
	return err
}

// Retreive a copy of the requested AMI set.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#amiSet
func (awsProvisioner *AwsProvisioner) AmiSet(id string) (*GetAMISetResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/ami-set/"+url.QueryEscape(id), new(GetAMISetResponse), nil)
	return responseObject.(*GetAMISetResponse), err
}

// Provide a new copy of an AMI Set to replace the existing one.
// This will overwrite the existing AMI Set if there
// is already an AMI Set of that name. This method will return a
// 200 response along with a copy of the AMI Set created.
// Note that if you are using the result of a GET on the ami-set
// end point that you will need to delete the lastModified and amiSet
// keys from the object returned, since those fields are not allowed
// the request body for this method.
//
// Otherwise, all input requirements and actions are the same as the
// create method.
//
// Required scopes:
//   * aws-provisioner:manage-ami-set:<amiSetId>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#updateAmiSet
func (awsProvisioner *AwsProvisioner) UpdateAmiSet(id string, payload *CreateAMISetRequest) (*GetAMISetResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/ami-set/"+url.QueryEscape(id)+"/update", new(GetAMISetResponse), nil)
	return responseObject.(*GetAMISetResponse), err
}

// Return a list of AMI sets names.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#listAmiSets
func (awsProvisioner *AwsProvisioner) ListAmiSets() (*ListAMISets, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/list-ami-sets", new(ListAMISets), nil)
	return responseObject.(*ListAMISets), err
}

// Delete an AMI Set.
//
// Required scopes:
//   * aws-provisioner:manage-ami-set:<amiSetId>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#removeAmiSet
func (awsProvisioner *AwsProvisioner) RemoveAmiSet(id string) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "DELETE", "/ami-set/"+url.QueryEscape(id), nil, nil)
	return err
}

// Insert a secret into the secret storage.  The supplied secrets will
// be provided verbatime via `getSecret`, while the supplied scopes will
// be converted into credentials by `getSecret`.
//
// This method is not ordinarily used in production; instead, the provisioner
// creates a new secret directly for each spot bid.
//
// Required scopes:
//   * aws-provisioner:create-secret
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#createSecret
func (awsProvisioner *AwsProvisioner) CreateSecret(token string, payload *GetSecretRequest) error {
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
func (awsProvisioner *AwsProvisioner) GetSecret(token string) (*GetSecretResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/secret/"+url.QueryEscape(token), new(GetSecretResponse), nil)
	return responseObject.(*GetSecretResponse), err
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
//   * aws-provisioner:view-worker-type:<workerType>, or
//   * aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#getLaunchSpecs
func (awsProvisioner *AwsProvisioner) GetLaunchSpecs(workerType string) (*GetAllLaunchSpecsResponse, error) {
	cd := tcclient.Client(*awsProvisioner)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-type/"+url.QueryEscape(workerType)+"/launch-specifications", new(GetAllLaunchSpecsResponse), nil)
	return responseObject.(*GetAllLaunchSpecsResponse), err
}

// Returns a signed URL for GetLaunchSpecs, valid for the specified duration.
//
// Required scopes:
//   * aws-provisioner:view-worker-type:<workerType>, or
//   * aws-provisioner:manage-worker-type:<workerType>
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
// Required scopes:
//   * aws-provisioner:view-worker-type:<workerType>, or
//   * aws-provisioner:manage-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#state
func (awsProvisioner *AwsProvisioner) State(workerType string) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "GET", "/state/"+url.QueryEscape(workerType), nil, nil)
	return err
}

// Returns a signed URL for State, valid for the specified duration.
//
// Required scopes:
//   * aws-provisioner:view-worker-type:<workerType>, or
//   * aws-provisioner:manage-worker-type:<workerType>
//
// See State for more details.
func (awsProvisioner *AwsProvisioner) State_SignedURL(workerType string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*awsProvisioner)
	return (&cd).SignedURL("/state/"+url.QueryEscape(workerType), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#ping
func (awsProvisioner *AwsProvisioner) Ping() error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
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

// Stability: *** EXPERIMENTAL ***
//
// WARNING: YOU ALMOST CERTAINLY DO NOT WANT TO USE THIS
// Shut down every single EC2 instance associated with this workerType.
// This means every single last one.  You probably don't want to use
// this method, which is why it has an obnoxious name.  Don't even try
// to claim you didn't know what this method does!
//
// **This API end-point is experimental and may be subject to change without warning.**
//
// Required scopes:
//   * aws-provisioner:terminate-all-worker-type:<workerType>
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#terminateAllInstancesOfWorkerType
func (awsProvisioner *AwsProvisioner) TerminateAllInstancesOfWorkerType(workerType string) error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "POST", "/worker-type/"+url.QueryEscape(workerType)+"/terminate-all-instances", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// WARNING: YOU ALMOST CERTAINLY DO NOT WANT TO USE THIS
// Shut down every single EC2 instance managed by this provisioner.
// This means every single last one.  You probably don't want to use
// this method, which is why it has an obnoxious name.  Don't even try
// to claim you didn't know what this method does!
//
// **This API end-point is experimental and may be subject to change without warning.**
//
// Required scopes:
//   * aws-provisioner:terminate-all-worker-type:*
//
// See https://docs.taskcluster.net/reference/core/aws-provisioner/api-docs#shutdownEverySingleEc2InstanceManagedByThisProvisioner
func (awsProvisioner *AwsProvisioner) ShutdownEverySingleEc2InstanceManagedByThisProvisioner() error {
	cd := tcclient.Client(*awsProvisioner)
	_, _, err := (&cd).APICall(nil, "POST", "/shutdown/every/single/ec2/instance/managed/by/this/provisioner", nil, nil)
	return err
}
