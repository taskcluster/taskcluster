// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that `${GOPATH}/bin` is in your `PATH`:
//
// go install && go generate
//
// This package was generated from the schema defined at
// https://references.taskcluster.net/ec2-manager/v1/api.json

// A taskcluster service which manages EC2 instances.  This service does not understand any taskcluster concepts intrinsicaly other than using the name `workerType` to refer to a group of associated instances.  Unless you are working on building a provisioner for AWS, you almost certainly do not want to use this service
//
// See: https://docs.taskcluster.net/reference/core/ec2-manager/api-docs
//
// How to use this package
//
// First create an EC2Manager object:
//
//  eC2Manager := tcec2manager.New(nil)
//
// and then call one or more of eC2Manager's methods, e.g.:
//
//  data, err := eC2Manager.ListWorkerTypes(.....)
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
// https://references.taskcluster.net/ec2-manager/v1/api.json together with the input and output schemas it references, downloaded on
// Mon, 7 May 2018 at 13:22:00 UTC. The code was generated
// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.
package tcec2manager

import (
	"net/url"
	"time"

	tcclient "github.com/taskcluster/taskcluster-client-go"
)

const (
	DefaultBaseURL = "localhost:5555/v1"
)

type EC2Manager tcclient.Client

// New returns an EC2Manager client, configured to run against production. Pass in
// nil to create a client without authentication. The
// returned client is mutable, so returned settings can be altered.
//
//  eC2Manager := tcec2manager.New(nil)                              // client without authentication
//  eC2Manager.BaseURL = "http://localhost:1234/api/EC2Manager/v1"   // alternative API endpoint (production by default)
//  data, err := eC2Manager.ListWorkerTypes(.....)                   // for example, call the ListWorkerTypes(.....) API endpoint (described further down)...
//  if err != nil {
//  	// handle errors...
//  }
func New(credentials *tcclient.Credentials) *EC2Manager {
	return &EC2Manager{
		Credentials:  credentials,
		BaseURL:      DefaultBaseURL,
		Authenticate: credentials != nil,
	}
}

// NewFromEnv returns an EC2Manager client with credentials taken from the environment variables:
//
//  TASKCLUSTER_CLIENT_ID
//  TASKCLUSTER_ACCESS_TOKEN
//  TASKCLUSTER_CERTIFICATE
//
// If environment variables TASKCLUSTER_CLIENT_ID is empty string or undefined
// authentication will be disabled.
func NewFromEnv() *EC2Manager {
	c := tcclient.CredentialsFromEnvVars()
	return &EC2Manager{
		Credentials:  c,
		BaseURL:      DefaultBaseURL,
		Authenticate: c.ClientID != "",
	}
}

// Stability: *** EXPERIMENTAL ***
//
// This method is only for debugging the ec2-manager
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#listWorkerTypes
func (eC2Manager *EC2Manager) ListWorkerTypes() (*ListOfWorkerTypes, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-types", new(ListOfWorkerTypes), nil)
	return responseObject.(*ListOfWorkerTypes), err
}

// Stability: *** EXPERIMENTAL ***
//
// Request an instance of a worker type
//
// Required scopes:
//   ec2-manager:manage-resources:<workerType>
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#runInstance
func (eC2Manager *EC2Manager) RunInstance(workerType string, payload *MakeASpotRequest) error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(payload, "PUT", "/worker-types/"+url.QueryEscape(workerType)+"/instance", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Terminate all instances for this worker type
//
// Required scopes:
//   ec2-manager:manage-resources:<workerType>
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#terminateWorkerType
func (eC2Manager *EC2Manager) TerminateWorkerType(workerType string) error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "DELETE", "/worker-types/"+url.QueryEscape(workerType)+"/resources", nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Return an object which has a generic state description. This only contains counts of instances
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#workerTypeStats
func (eC2Manager *EC2Manager) WorkerTypeStats(workerType string) (*OverviewOfComputationalResources, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-types/"+url.QueryEscape(workerType)+"/stats", new(OverviewOfComputationalResources), nil)
	return responseObject.(*OverviewOfComputationalResources), err
}

// Stability: *** EXPERIMENTAL ***
//
// Return a view of the health of a given worker type
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#workerTypeHealth
func (eC2Manager *EC2Manager) WorkerTypeHealth(workerType string) (*HealthOfTheEC2Account, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-types/"+url.QueryEscape(workerType)+"/health", new(HealthOfTheEC2Account), nil)
	return responseObject.(*HealthOfTheEC2Account), err
}

// Stability: *** EXPERIMENTAL ***
//
// Return a list of the most recent errors encountered by a worker type
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#workerTypeErrors
func (eC2Manager *EC2Manager) WorkerTypeErrors(workerType string) (*Errors, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-types/"+url.QueryEscape(workerType)+"/errors", new(Errors), nil)
	return responseObject.(*Errors), err
}

// Stability: *** EXPERIMENTAL ***
//
// Return state information for a given worker type
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#workerTypeState
func (eC2Manager *EC2Manager) WorkerTypeState(workerType string) (*OverviewOfComputationalResources1, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/worker-types/"+url.QueryEscape(workerType)+"/state", new(OverviewOfComputationalResources1), nil)
	return responseObject.(*OverviewOfComputationalResources1), err
}

// Stability: *** EXPERIMENTAL ***
//
// Idempotently ensure that a keypair of a given name exists
//
// Required scopes:
//   ec2-manager:manage-key-pairs:<name>
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#ensureKeyPair
func (eC2Manager *EC2Manager) EnsureKeyPair(name string, payload *SSHPublicKey) error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(payload, "GET", "/key-pairs/"+url.QueryEscape(name), nil, nil)
	return err
}

// Returns a signed URL for EnsureKeyPair, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:manage-key-pairs:<name>
//
// See EnsureKeyPair for more details.
func (eC2Manager *EC2Manager) EnsureKeyPair_SignedURL(name string, duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/key-pairs/"+url.QueryEscape(name), nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Ensure that a keypair of a given name does not exist.
//
// Required scopes:
//   ec2-manager:manage-key-pairs:<name>
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#removeKeyPair
func (eC2Manager *EC2Manager) RemoveKeyPair(name string) error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "DELETE", "/key-pairs/"+url.QueryEscape(name), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Terminate an instance in a specified region
//
// Required scopes:
//   Any of:
//   - ec2-manager:manage-instances:<region>:<instanceId>
//   - ec2-manager:manage-resources:<workerType>
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#terminateInstance
func (eC2Manager *EC2Manager) TerminateInstance(region, instanceId string) error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "DELETE", "/region/"+url.QueryEscape(region)+"/instance/"+url.QueryEscape(instanceId), nil, nil)
	return err
}

// Stability: *** EXPERIMENTAL ***
//
// Return a list of possible prices for EC2
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#getPrices
func (eC2Manager *EC2Manager) GetPrices() (*ListOfPrices, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/prices", new(ListOfPrices), nil)
	return responseObject.(*ListOfPrices), err
}

// Stability: *** EXPERIMENTAL ***
//
// Return a list of possible prices for EC2
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#getSpecificPrices
func (eC2Manager *EC2Manager) GetSpecificPrices(payload *ListOfRestrictionsForPrices) (*ListOfPrices, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(payload, "POST", "/prices", new(ListOfPrices), nil)
	return responseObject.(*ListOfPrices), err
}

// Stability: *** EXPERIMENTAL ***
//
// Give some basic stats on the health of our EC2 account
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#getHealth
func (eC2Manager *EC2Manager) GetHealth() (*HealthOfTheEC2Account, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/health", new(HealthOfTheEC2Account), nil)
	return responseObject.(*HealthOfTheEC2Account), err
}

// Stability: *** EXPERIMENTAL ***
//
// Return a list of recent errors encountered
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#getRecentErrors
func (eC2Manager *EC2Manager) GetRecentErrors() (*Errors, error) {
	cd := tcclient.Client(*eC2Manager)
	responseObject, _, err := (&cd).APICall(nil, "GET", "/errors", new(Errors), nil)
	return responseObject.(*Errors), err
}

// Stability: *** EXPERIMENTAL ***
//
// This method is only for debugging the ec2-manager
//
// Required scopes:
//   ec2-manager:internals
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#regions
func (eC2Manager *EC2Manager) Regions() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/regions", nil, nil)
	return err
}

// Returns a signed URL for Regions, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:internals
//
// See Regions for more details.
func (eC2Manager *EC2Manager) Regions_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/internal/regions", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// List AMIs and their usage by returning a list of objects in the form:
// {
// region: string
//   volumetype: string
//   lastused: timestamp
// }
//
// Required scopes:
//   ec2-manager:internals
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#amiUsage
func (eC2Manager *EC2Manager) AmiUsage() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/ami-usage", nil, nil)
	return err
}

// Returns a signed URL for AmiUsage, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:internals
//
// See AmiUsage for more details.
func (eC2Manager *EC2Manager) AmiUsage_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/internal/ami-usage", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Lists current EBS volume usage by returning a list of objects
// that are uniquely defined by {region, volumetype, state} in the form:
// {
// region: string,
//   volumetype: string,
//   state: string,
//   totalcount: integer,
//   totalgb: integer,
//   touched: timestamp (last time that information was updated),
// }
//
// Required scopes:
//   ec2-manager:internals
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#ebsUsage
func (eC2Manager *EC2Manager) EbsUsage() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/ebs-usage", nil, nil)
	return err
}

// Returns a signed URL for EbsUsage, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:internals
//
// See EbsUsage for more details.
func (eC2Manager *EC2Manager) EbsUsage_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/internal/ebs-usage", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// This method is only for debugging the ec2-manager
//
// Required scopes:
//   ec2-manager:internals
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#dbpoolStats
func (eC2Manager *EC2Manager) DbpoolStats() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/db-pool-stats", nil, nil)
	return err
}

// Returns a signed URL for DbpoolStats, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:internals
//
// See DbpoolStats for more details.
func (eC2Manager *EC2Manager) DbpoolStats_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/internal/db-pool-stats", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// This method is only for debugging the ec2-manager
//
// Required scopes:
//   ec2-manager:internals
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#allState
func (eC2Manager *EC2Manager) AllState() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/all-state", nil, nil)
	return err
}

// Returns a signed URL for AllState, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:internals
//
// See AllState for more details.
func (eC2Manager *EC2Manager) AllState_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/internal/all-state", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// This method is only for debugging the ec2-manager
//
// Required scopes:
//   ec2-manager:internals
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#sqsStats
func (eC2Manager *EC2Manager) SqsStats() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/sqs-stats", nil, nil)
	return err
}

// Returns a signed URL for SqsStats, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:internals
//
// See SqsStats for more details.
func (eC2Manager *EC2Manager) SqsStats_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/internal/sqs-stats", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// This method is only for debugging the ec2-manager
//
// Required scopes:
//   ec2-manager:internals
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#purgeQueues
func (eC2Manager *EC2Manager) PurgeQueues() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/purge-queues", nil, nil)
	return err
}

// Returns a signed URL for PurgeQueues, valid for the specified duration.
//
// Required scopes:
//   ec2-manager:internals
//
// See PurgeQueues for more details.
func (eC2Manager *EC2Manager) PurgeQueues_SignedURL(duration time.Duration) (*url.URL, error) {
	cd := tcclient.Client(*eC2Manager)
	return (&cd).SignedURL("/internal/purge-queues", nil, duration)
}

// Stability: *** EXPERIMENTAL ***
//
// Generate an API reference for this service
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#apiReference
func (eC2Manager *EC2Manager) APIReference() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/internal/api-reference", nil, nil)
	return err
}

// Respond without doing anything.
// This endpoint is used to check that the service is up.
//
// See https://docs.taskcluster.net/reference/core/ec2-manager/api-docs#ping
func (eC2Manager *EC2Manager) Ping() error {
	cd := tcclient.Client(*eC2Manager)
	_, _, err := (&cd).APICall(nil, "GET", "/ping", nil, nil)
	return err
}
