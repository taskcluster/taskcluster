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
// See: http://docs.taskcluster.net/aws-provisioner/api-docs
//
// How to use this package
//
// First create an AwsProvisioner object:
//
//  awsProvisioner := awsprovisioner.New(tcclient.Credentials{ClientId: "myClientId", AccessToken: "myAccessToken"})
//
// and then call one or more of awsProvisioner's methods, e.g.:
//
//  data, callSummary, err := awsProvisioner.CreateWorkerType(.....)
// handling any errors...
//  if err != nil {
//  	// handle error...
//  }
//
// TaskCluster Schema
//
// The source code of this go package was auto-generated from the API definition at
// http://references.taskcluster.net/aws-provisioner/v1/api.json together with the input and output schemas it references, downloaded on
// Wed, 6 Jan 2016 at 20:33:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package awsprovisioner

import (
	"encoding/json"
	"errors"
	"net/url"

	"github.com/taskcluster/taskcluster-client-go/tcclient"
	D "github.com/tj/go-debug"
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("awsprovisioner")
)

type AwsProvisioner tcclient.ConnectionData

// Returns a pointer to AwsProvisioner, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
// For example:
//  creds := tcclient.Credentials{
//  	ClientId:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
//  	AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
//  	Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
//  }
//  awsProvisioner := awsprovisioner.New(creds)                              // set credentials
//  awsProvisioner.Authenticate = false                                      // disable authentication (creds above are now ignored)
//  awsProvisioner.BaseURL = "http://localhost:1234/api/AwsProvisioner/v1"   // alternative API endpoint (production by default)
//  data, callSummary, err := awsProvisioner.CreateWorkerType(.....)         // for example, call the CreateWorkerType(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials tcclient.Credentials) *AwsProvisioner {
	awsProvisioner := AwsProvisioner(tcclient.ConnectionData{
		Credentials:  credentials,
		BaseURL:      "https://aws-provisioner.taskcluster.net/v1",
		Authenticate: true,
	})
	return &awsProvisioner
}

// Stability: *** EXPERIMENTAL ***
//
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
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#createWorkerType
func (awsProvisioner *AwsProvisioner) CreateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*GetWorkerTypeRequest, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	responseObject, callSummary, err := (&cd).APICall(payload, "PUT", "/worker-type/"+url.QueryEscape(workerType), new(GetWorkerTypeRequest), nil)
	return responseObject.(*GetWorkerTypeRequest), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
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
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#updateWorkerType
func (awsProvisioner *AwsProvisioner) UpdateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*GetWorkerTypeRequest, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	responseObject, callSummary, err := (&cd).APICall(payload, "POST", "/worker-type/"+url.QueryEscape(workerType)+"/update", new(GetWorkerTypeRequest), nil)
	return responseObject.(*GetWorkerTypeRequest), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
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
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#workerType
func (awsProvisioner *AwsProvisioner) WorkerType(workerType string) (*GetWorkerTypeRequest, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/worker-type/"+url.QueryEscape(workerType), new(GetWorkerTypeRequest), nil)
	return responseObject.(*GetWorkerTypeRequest), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
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
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#removeWorkerType
func (awsProvisioner *AwsProvisioner) RemoveWorkerType(workerType string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(nil, "DELETE", "/worker-type/"+url.QueryEscape(workerType), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Return a list of string worker type names.  These are the names
// of all managed worker types known to the provisioner.  This does
// not include worker types which are left overs from a deleted worker
// type definition but are still running in AWS.
//
// Required scopes:
//   * aws-provisioner:list-worker-types
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#listWorkerTypes
func (awsProvisioner *AwsProvisioner) ListWorkerTypes() (*ListWorkerTypes, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/list-worker-types", new(ListWorkerTypes), nil)
	return responseObject.(*ListWorkerTypes), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
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
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#createSecret
func (awsProvisioner *AwsProvisioner) CreateSecret(token string, payload *GetSecretRequest) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(payload, "PUT", "/secret/"+url.QueryEscape(token), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Retrieve a secret from storage.  The result contains any passwords or
// other restricted information verbatim as well as a temporary credential
// based on the scopes specified when the secret was created.
//
// It is important that this secret is deleted by the consumer (`removeSecret`),
// or else the secrets will be visible to any process which can access the
// user data associated with the instance.
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#getSecret
func (awsProvisioner *AwsProvisioner) GetSecret(token string) (*GetSecretResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/secret/"+url.QueryEscape(token), new(GetSecretResponse), nil)
	return responseObject.(*GetSecretResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// An instance will report in by giving its instance id as well
// as its security token.  The token is given and checked to ensure
// that it matches a real token that exists to ensure that random
// machines do not check in.  We could generate a different token
// but that seems like overkill
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#instanceStarted
func (awsProvisioner *AwsProvisioner) InstanceStarted(instanceId string, token string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/instance-started/"+url.QueryEscape(instanceId)+"/"+url.QueryEscape(token), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Remove a secret.  After this call, a call to `getSecret` with the given
// token will return no information.
//
// It is very important that the consumer of a
// secret delete the secret from storage before handing over control
// to untrusted processes to prevent credential and/or secret leakage.
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#removeSecret
func (awsProvisioner *AwsProvisioner) RemoveSecret(token string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(nil, "DELETE", "/secret/"+url.QueryEscape(token), nil, nil)
	return callSummary, err
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
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#getLaunchSpecs
func (awsProvisioner *AwsProvisioner) GetLaunchSpecs(workerType string) (*GetAllLaunchSpecsResponse, *tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	responseObject, callSummary, err := (&cd).APICall(nil, "GET", "/worker-type/"+url.QueryEscape(workerType)+"/launch-specifications", new(GetAllLaunchSpecsResponse), nil)
	return responseObject.(*GetAllLaunchSpecsResponse), callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// This method is a left over and will be removed as soon as the
// tools.tc.net UI is updated to use the per-worker state
//
// **DEPRECATED.**
//
// Required scopes:
//   * aws-provisioner:aws-state
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#awsState
func (awsProvisioner *AwsProvisioner) AwsState() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/aws-state", nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Return the state of a given workertype as stored by the provisioner.
// This state is stored as three lists: 1 for all instances, 1 for requests
// which show in the ec2 api and 1 list for those only tracked internally
// in the provisioner.
//
// Required scopes:
//   * aws-provisioner:view-worker-type:<workerType>
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#state
func (awsProvisioner *AwsProvisioner) State(workerType string) (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/state/"+url.QueryEscape(workerType), nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#ping
func (awsProvisioner *AwsProvisioner) Ping() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return callSummary, err
}

// Stability: *** EXPERIMENTAL ***
//
// Get an API reference!
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#apiReference
func (awsProvisioner *AwsProvisioner) ApiReference() (*tcclient.CallSummary, error) {
	cd := tcclient.ConnectionData(*awsProvisioner)
	_, callSummary, err := (&cd).APICall(nil, "GET", "/api-reference", nil, nil)
	return callSummary, err
}

type (

	// A Secret
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#
	GetSecretRequest struct {

		// The date at which the secret is no longer guarunteed to exist
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#/properties/expiration
		Expiration tcclient.Time `json:"expiration"`

		// List of strings which are scopes for temporary credentials to give
		// to the worker through the secret system.  Scopes must be composed of
		// printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#/properties/scopes
		Scopes []string `json:"scopes"`

		// Free form object which contains the secrets stored
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#/properties/secrets
		Secrets json.RawMessage `json:"secrets"`

		// A Slug ID which is the uniquely addressable token to access this
		// set of secrets
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#/properties/token
		Token string `json:"token"`

		// A string describing what the secret will be used for
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-secret-request.json#/properties/workerType
		WorkerType string `json:"workerType"`
	}

	// A worker launchSpecification and required metadata
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#
	CreateWorkerTypeRequest struct {

		// True if this worker type is allowed on demand instances.  Currently
		// ignored
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/canUseOndemand
		CanUseOndemand bool `json:"canUseOndemand"`

		// True if this worker type is allowed spot instances.  Currently ignored
		// as all instances are Spot
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/canUseSpot
		CanUseSpot bool `json:"canUseSpot"`

		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes
		InstanceTypes []struct {

			// This number represents the number of tasks that this instance type
			// is capable of running concurrently.  This is used by the provisioner
			// to know how many pending tasks to offset a pending instance of this
			// type by
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes/items/properties/capacity
			Capacity float64 `json:"capacity"`

			// InstanceType name for Amazon.
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes/items/properties/instanceType
			InstanceType string `json:"instanceType"`

			// LaunchSpecification entries unique to this InstanceType
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes/items/properties/launchSpec
			LaunchSpec json.RawMessage `json:"launchSpec"`

			// Scopes which should be included for this InstanceType.  Scopes must
			// be composed of printable ASCII characters and spaces.
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes/items/properties/scopes
			Scopes []string `json:"scopes"`

			// Static Secrets unique to this InstanceType
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes/items/properties/secrets
			Secrets json.RawMessage `json:"secrets"`

			// UserData entries unique to this InstanceType
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes/items/properties/userData
			UserData json.RawMessage `json:"userData"`

			// This number is a relative measure of performance between two instance
			// types.  It is multiplied by the spot price from Amazon to figure out
			// which instance type is the cheapest one
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/instanceTypes/items/properties/utility
			Utility float64 `json:"utility"`
		} `json:"instanceTypes"`

		// Launch Specification entries which are used in all regions and all instance types
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/launchSpec
		LaunchSpec json.RawMessage `json:"launchSpec"`

		// Maximum number of capacity units to be provisioned.
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/maxCapacity
		MaxCapacity float64 `json:"maxCapacity"`

		// Maximum price we'll pay.  Like minPrice, this takes into account the
		// utility factor when figuring out what the actual SpotPrice submitted
		// to Amazon will be
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/maxPrice
		MaxPrice float64 `json:"maxPrice"`

		// Minimum number of capacity units to be provisioned.  A capacity unit
		// is an abstract unit of capacity, where one capacity unit is roughly
		// one task which should be taken off the queue
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/minCapacity
		MinCapacity float64 `json:"minCapacity"`

		// Minimum price to pay for an instance.  A Price is considered to be the
		// Amazon Spot Price multiplied by the utility factor of the InstantType
		// as specified in the instanceTypes list.  For example, if the minPrice
		// is set to $0.5 and the utility factor is 2, the actual minimum bid
		// used will be $0.25
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/minPrice
		MinPrice float64 `json:"minPrice"`

		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/regions
		Regions []struct {

			// LaunchSpecification entries unique to this Region
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/regions/items/properties/launchSpec
			LaunchSpec struct {

				// Per-region AMI ImageId
				//
				// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/regions/items/properties/launchSpec/properties/ImageId
				ImageId string `json:"ImageId"`
			} `json:"launchSpec"`

			// The Amazon AWS Region being configured.  Example: us-west-1
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/regions/items/properties/region
			Region string `json:"region"`

			// Scopes which should be included for this Region.  Scopes must be
			// composed of printable ASCII characters and spaces.
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/regions/items/properties/scopes
			Scopes []string `json:"scopes"`

			// Static Secrets unique to this Region
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/regions/items/properties/secrets
			Secrets json.RawMessage `json:"secrets"`

			// UserData entries unique to this Region
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/regions/items/properties/userData
			UserData json.RawMessage `json:"userData"`
		} `json:"regions"`

		// A scaling ratio of `0.2` means that the provisioner will attempt to keep
		// the number of pending tasks around 20% of the provisioned capacity.
		// This results in pending tasks waiting 20% of the average task execution
		// time before starting to run.
		// A higher scaling ratio often results in better utilization and longer
		// waiting times. For workerTypes running long tasks a short scaling ratio
		// may be prefered, but for workerTypes running quick tasks a higher scaling
		// ratio may increase utilization without major delays.
		// If using a scaling ratio of 0, the provisioner will attempt to keep the
		// capacity of pending spot requests equal to the number of pending tasks.
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/scalingRatio
		ScalingRatio float64 `json:"scalingRatio"`

		// Scopes to issue credentials to for all regions Scopes must be composed of
		// printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/scopes
		Scopes []string `json:"scopes"`

		// Static secrets entries which are used in all regions and all instance types
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/secrets
		Secrets json.RawMessage `json:"secrets"`

		// UserData entries which are used in all regions and all instance types
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#/properties/userData
		UserData json.RawMessage `json:"userData"`
	}

	// All of the launch specifications for a worker type
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/get-launch-specs-response.json#
	GetAllLaunchSpecsResponse json.RawMessage

	// Secrets from the provisioner
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#
	GetSecretResponse struct {

		// Generated Temporary credentials from the Provisioner
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#/properties/credentials
		Credentials struct {

			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#/properties/credentials/properties/accessToken
			AccessToken string `json:"accessToken"`

			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#/properties/credentials/properties/certificate
			Certificate string `json:"certificate"`

			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#/properties/credentials/properties/clientId
			ClientId string `json:"clientId"`
		} `json:"credentials"`

		// Free-form object which contains secrets from the worker type definition
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-secret-response.json#/properties/data
		Data json.RawMessage `json:"data"`
	}

	// A worker launchSpecification and required metadata
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#
	GetWorkerTypeRequest struct {

		// True if this worker type is allowed on demand instances.  Currently
		// ignored
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/canUseOndemand
		CanUseOndemand bool `json:"canUseOndemand"`

		// True if this worker type is allowed spot instances.  Currently ignored
		// as all instances are Spot
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/canUseSpot
		CanUseSpot bool `json:"canUseSpot"`

		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes
		InstanceTypes []struct {

			// This number represents the number of tasks that this instance type
			// is capable of running concurrently.  This is used by the provisioner
			// to know how many pending tasks to offset a pending instance of this
			// type by
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes/items/properties/capacity
			Capacity float64 `json:"capacity"`

			// InstanceType name for Amazon.
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes/items/properties/instanceType
			InstanceType string `json:"instanceType"`

			// LaunchSpecification entries unique to this InstanceType
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes/items/properties/launchSpec
			LaunchSpec json.RawMessage `json:"launchSpec"`

			// Scopes which should be included for this InstanceType.  Scopes must
			// be composed of printable ASCII characters and spaces.
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes/items/properties/scopes
			Scopes []string `json:"scopes"`

			// Static Secrets unique to this InstanceType
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes/items/properties/secrets
			Secrets json.RawMessage `json:"secrets"`

			// UserData entries unique to this InstanceType
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes/items/properties/userData
			UserData json.RawMessage `json:"userData"`

			// This number is a relative measure of performance between two instance
			// types.  It is multiplied by the spot price from Amazon to figure out
			// which instance type is the cheapest one
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/instanceTypes/items/properties/utility
			Utility float64 `json:"utility"`
		} `json:"instanceTypes"`

		// ISO Date string (e.g. new Date().toISOString()) which represents the time
		// when this worker type definition was last altered (inclusive of creation)
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/lastModified
		LastModified tcclient.Time `json:"lastModified"`

		// Launch Specification entries which are used in all regions and all instance types
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/launchSpec
		LaunchSpec json.RawMessage `json:"launchSpec"`

		// Maximum number of capacity units to be provisioned.
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/maxCapacity
		MaxCapacity float64 `json:"maxCapacity"`

		// Maximum price we'll pay.  Like minPrice, this takes into account the
		// utility factor when figuring out what the actual SpotPrice submitted
		// to Amazon will be
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/maxPrice
		MaxPrice float64 `json:"maxPrice"`

		// Minimum number of capacity units to be provisioned.  A capacity unit
		// is an abstract unit of capacity, where one capacity unit is roughly
		// one task which should be taken off the queue
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/minCapacity
		MinCapacity float64 `json:"minCapacity"`

		// Minimum price to pay for an instance.  A Price is considered to be the
		// Amazon Spot Price multiplied by the utility factor of the InstantType
		// as specified in the instanceTypes list.  For example, if the minPrice
		// is set to $0.5 and the utility factor is 2, the actual minimum bid
		// used will be $0.25
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/minPrice
		MinPrice float64 `json:"minPrice"`

		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/regions
		Regions []struct {

			// LaunchSpecification entries unique to this Region
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/regions/items/properties/launchSpec
			LaunchSpec struct {

				// Per-region AMI ImageId
				//
				// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/regions/items/properties/launchSpec/properties/ImageId
				ImageId string `json:"ImageId"`
			} `json:"launchSpec"`

			// The Amazon AWS Region being configured.  Example: us-west-1
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/regions/items/properties/region
			Region string `json:"region"`

			// Scopes which should be included for this Region.  Scopes must be
			// composed of printable ASCII characters and spaces.
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/regions/items/properties/scopes
			Scopes []string `json:"scopes"`

			// Static Secrets unique to this Region
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/regions/items/properties/secrets
			Secrets json.RawMessage `json:"secrets"`

			// UserData entries unique to this Region
			//
			// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/regions/items/properties/userData
			UserData json.RawMessage `json:"userData"`
		} `json:"regions"`

		// A scaling ratio of `0.2` means that the provisioner will attempt to keep
		// the number of pending tasks around 20% of the provisioned capacity.
		// This results in pending tasks waiting 20% of the average task execution
		// time before starting to run.
		// A higher scaling ratio often results in better utilization and longer
		// waiting times. For workerTypes running long tasks a short scaling ratio
		// may be prefered, but for workerTypes running quick tasks a higher scaling
		// ratio may increase utilization without major delays.
		// If using a scaling ratio of 0, the provisioner will attempt to keep the
		// capacity of pending spot requests equal to the number of pending tasks.
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/scalingRatio
		ScalingRatio float64 `json:"scalingRatio"`

		// Scopes to issue credentials to for all regions.  Scopes must be composed
		// of printable ASCII characters and spaces.
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/scopes
		Scopes []string `json:"scopes"`

		// Static secrets entries which are used in all regions and all instance types
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/secrets
		Secrets json.RawMessage `json:"secrets"`

		// UserData entries which are used in all regions and all instance types
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/userData
		UserData json.RawMessage `json:"userData"`

		// The ID of the workerType
		//
		// Syntax:     ^[A-Za-z0-9+/=_-]{1,22}$
		//
		// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#/properties/workerType
		WorkerType string `json:"workerType"`
	}

	// See http://schemas.taskcluster.net/aws-provisioner/v1/list-worker-types-response.json#
	ListWorkerTypes []string
)

// MarshalJSON calls json.RawMessage method of the same name. Required since
// GetAllLaunchSpecsResponse is of type json.RawMessage...
func (this *GetAllLaunchSpecsResponse) MarshalJSON() ([]byte, error) {
	x := json.RawMessage(*this)
	return (&x).MarshalJSON()
}

// UnmarshalJSON is a copy of the json.RawMessage implementation.
func (this *GetAllLaunchSpecsResponse) UnmarshalJSON(data []byte) error {
	if this == nil {
		return errors.New("GetAllLaunchSpecsResponse: UnmarshalJSON on nil pointer")
	}
	*this = append((*this)[0:0], data...)
	return nil
}
