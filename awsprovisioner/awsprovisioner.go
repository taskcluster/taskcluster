// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt
//
// This package was generated from the schema defined at
// http://references.taskcluster.net/aws-provisioner/v1/api.json

// The AWS Provisioner is responsible for provisioning instances on EC2 for use in
// TaskCluster.  The provisioner maintains a set of worker configurations which
// can be managed with an API that is typically available at
// aws-provisioner.taskcluster.net.  This API can also perform basic instance
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
// See: http://docs.taskcluster.net/aws-provisioner/api-docs
//
// How to use this package
//
// First create an authentication object:
//
//  Awsprovisioner := awsprovisioner.New("myClientId", "myAccessToken")
//
// and then call one or more of auth's methods, e.g.:
//
//  data, callSummary := Awsprovisioner.CreateWorkerType(.....)
// handling any errors...
//  if callSummary.Error != nil {
//  	// handle error...
//  }
package awsprovisioner

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	hawk "github.com/tent/hawk-go"
	"io"
	"io/ioutil"
	"net/http"
	"reflect"
	"strconv"
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary) {
	callSummary := new(CallSummary)
	callSummary.HttpRequestObject = payload
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		callSummary.Error = err
		return result, callSummary
	}
	callSummary.HttpRequestBody = string(jsonPayload)

	var ioReader io.Reader = nil
	if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
		ioReader = bytes.NewReader(jsonPayload)
	}
	httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
	if err != nil {
		callSummary.Error = err
		return result, callSummary
	}
	// only authenticate if client library user wishes to
	if auth.Authenticate {
		// not sure if we need to regenerate this with each call, will leave in here for now...
		credentials := &hawk.Credentials{
			ID:   auth.ClientId,
			Key:  auth.AccessToken,
			Hash: sha256.New,
		}
		reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
		httpRequest.Header.Set("Authorization", reqAuth)
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	callSummary.HttpRequest = httpRequest
	httpClient := &http.Client{}
	// fmt.Println("Request\n=======")
	// fullRequest, err := httputil.DumpRequestOut(httpRequest, true)
	// fmt.Println(string(fullRequest))
	response, err := httpClient.Do(httpRequest)
	// fmt.Println("Response\n========")
	// fullResponse, err := httputil.DumpResponse(response, true)
	// fmt.Println(string(fullResponse))
	if err != nil {
		callSummary.Error = err
		return result, callSummary
	}
	defer response.Body.Close()
	callSummary.HttpResponse = response
	// now read response into memory, so that we can return the body
	body, err := ioutil.ReadAll(response.Body)
	if err != nil {
		callSummary.Error = err
		return result, callSummary
	}
	// response.Body = ioutil.NopCloser(strings.NewReader(string(body)))
	callSummary.HttpResponseBody = string(body)

	// now check if http response code isn't in good range [200,300)...
	if respCode := response.StatusCode; respCode/100 != 2 {
		callSummary.Error = BadHttpResponseCode{
			HttpResponseCode: respCode,
			Message: "HTTP response code " + strconv.Itoa(respCode) + " to http " +
				method + " request to " + auth.BaseURL + route + ":\n" +
				string(body) + "\n",
		}
		return result, callSummary
	}
	// if result is nil, it means there is no response body json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		err := json.Unmarshal(body, &result)
		if err != nil {
			callSummary.Error = err
			return result, callSummary
		}
	}
	// fmt.Printf("ClientId: %v\nAccessToken: %v\nPayload: %v\nURL: %v\nMethod: %v\nResult: %v\n", auth.ClientId, auth.AccessToken, string(jsonPayload), auth.BaseURL+route, method, result)
	return result, callSummary
}

// The entry point into all the functionality in this package is to create an Auth object.
// It contains your authentication credentials, which are required for all HTTP operations.
type Auth struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use "https://taskcluster-aws-provisioner2.herokuapp.com/v1" for production.
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling auth.New(clientId string, accessToken string) is an
	// alternative way to create an Auth object with Authenticate set to true.
	Authenticate bool
}

// CallSummary provides information about the underlying http request and
// response issued for a given API call, together with details of any Error
// which occured. After making an API call, be sure to check the returned
// CallSummary.Error - if it is nil, no error occurred.
type CallSummary struct {
	HttpRequest *http.Request
	// Keep a copy of request body in addition to the *http.Request, since
	// accessing the Body via the *http.Request object, you get a io.ReadCloser
	// - and after the request has been made, the body will have been read, and
	// the data lost... This way, it is still available after the api call
	// returns.
	HttpRequestBody string
	// The Go Type which is marshaled into json and used as the http request
	// body.
	HttpRequestObject interface{}
	HttpResponse      *http.Response
	// Keep a copy of response body in addition to the *http.Response, since
	// accessing the Body via the *http.Response object, you get a
	// io.ReadCloser - and after the response has been read once (to unmarshal
	// json into native go types) the data is lost... This way, it is still
	// available after the api call returns.
	HttpResponseBody string
	Error            error
}

type BadHttpResponseCode struct {
	HttpResponseCode int
	Message          string
}

func (err BadHttpResponseCode) Error() string {
	return err.Message
}

// Returns a pointer to Auth, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
// For example:
//  Awsprovisioner := awsprovisioner.New("123", "456")                       // set clientId and accessToken
//  Awsprovisioner.Authenticate = false                                      // disable authentication (true by default)
//  Awsprovisioner.BaseURL = "http://localhost:1234/api/AwsProvisioner/v1"   // alternative API endpoint (production by default)
//  data, callSummary := Awsprovisioner.CreateWorkerType(.....)              // for example, call the CreateWorkerType(.....) API endpoint (described further down)...
//  if callSummary.Error != nil {
//  	// handle errors...
//  }
func New(clientId string, accessToken string) *Auth {
	return &Auth{
		ClientId:     clientId,
		AccessToken:  accessToken,
		BaseURL:      "https://taskcluster-aws-provisioner2.herokuapp.com/v1",
		Authenticate: true}
}

// Create a worker type and ensure that all EC2 regions have the required
// KeyPair
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#createWorkerType
func (a *Auth) CreateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*GetWorkerTypeRequest, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "PUT", "/worker-type/"+workerType+"", new(GetWorkerTypeRequest))
	return responseObject.(*GetWorkerTypeRequest), callSummary
}

// Update a workerType and ensure that all regions have the require
// KeyPair
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#updateWorkerType
func (a *Auth) UpdateWorkerType(workerType string, payload *CreateWorkerTypeRequest) (*GetWorkerTypeRequest, *CallSummary) {
	responseObject, callSummary := a.apiCall(payload, "POST", "/worker-type/"+workerType+"/update", new(GetWorkerTypeRequest))
	return responseObject.(*GetWorkerTypeRequest), callSummary
}

// Retreive a WorkerType definition
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#workerType
func (a *Auth) WorkerType(workerType string) (*GetWorkerTypeRequest, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/worker-type/"+workerType+"", new(GetWorkerTypeRequest))
	return responseObject.(*GetWorkerTypeRequest), callSummary
}

// Delete a WorkerType definition, submits requests to kill all
// instances and delete the KeyPair from all configured EC2 regions
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#removeWorkerType
func (a *Auth) RemoveWorkerType(workerType string) *CallSummary {
	_, callSummary := a.apiCall(nil, "DELETE", "/worker-type/"+workerType+"", nil)
	return callSummary
}

// List all known WorkerType names
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#listWorkerTypes
func (a *Auth) ListWorkerTypes() (*ListWorkerTypes, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/list-worker-types", new(ListWorkerTypes))
	return responseObject.(*ListWorkerTypes), callSummary
}

// Return the EC2 LaunchSpecifications for all combinations of regions
// and instance types or a list of reasons why the launch specifications
// are not valid
//
// **This API end-point is experimental and may be subject to change without warning.**
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#getLaunchSpecs
func (a *Auth) GetLaunchSpecs(workerType string) (*GetAllLaunchSpecsResponse, *CallSummary) {
	responseObject, callSummary := a.apiCall(nil, "GET", "/worker-type/"+workerType+"/launch-specifications", new(GetAllLaunchSpecsResponse))
	return responseObject.(*GetAllLaunchSpecsResponse), callSummary
}

// WARNING: YOU ALMOST CERTAINLY DO NOT WANT TO USE THIS
// Shut down every single EC2 instance associated with this workerType.
// This means every single last one.  You probably don't want to use
// this method, which is why it has an obnoxious name.  Don't even try
// to claim you didn't know what this method does!
//
// **This API end-point is experimental and may be subject to change without warning.**
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#terminateAllInstancesOfWorkerType
func (a *Auth) TerminateAllInstancesOfWorkerType(workerType string) *CallSummary {
	_, callSummary := a.apiCall(nil, "POST", "/worker-type/"+workerType+"/terminate-all-instances", nil)
	return callSummary
}

// WARNING: YOU ALMOST CERTAINLY DO NOT WANT TO USE THIS
// Shut down every single EC2 instance managed by this provisioner.
// This means every single last one.  You probably don't want to use
// this method, which is why it has an obnoxious name.  Don't even try
// to claim you didn't know what this method does!
//
// **This API end-point is experimental and may be subject to change without warning.**
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#shutdownEverySingleEc2InstanceManagedByThisProvisioner
func (a *Auth) ShutdownEverySingleEc2InstanceManagedByThisProvisioner() *CallSummary {
	_, callSummary := a.apiCall(nil, "POST", "/shutdown/every/single/ec2/instance/managed/by/this/provisioner", nil)
	return callSummary
}

// Documented later...
//
// **Warning** this api end-point is **not stable**
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#awsState
func (a *Auth) AwsState() *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/aws-state/", nil)
	return callSummary
}

// Documented later...
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#ping
func (a *Auth) Ping() *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/ping", nil)
	return callSummary
}

// Get an API reference!
//
// **Warning** this api end-point is **not stable**.
//
// See http://docs.taskcluster.net/aws-provisioner/api-docs/#apiReference
func (a *Auth) ApiReference() *CallSummary {
	_, callSummary := a.apiCall(nil, "GET", "/api-reference", nil)
	return callSummary
}

type (
	// A worker launchSpecification and required metadata
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/create-worker-type-request.json#
	CreateWorkerTypeRequest struct {
		// True if this worker type is allowed on demand instances.  Currently
		// ignored
		CanUseOndemand bool `json:"canUseOndemand"`
		// True if this worker type is allowed spot instances.  Currently ignored
		// as all instances are Spot
		CanUseSpot    bool `json:"canUseSpot"`
		InstanceTypes []struct {
			// This number represents the number of tasks that this instance type
			// is capable of running concurrently.  This is used by the provisioner
			// to know how many pending tasks to offset a pending instance of this
			// type by
			Capacity int `json:"capacity"`
			// InstanceType name for Amazon.
			InstanceType string `json:"instanceType"`
			// This object contains LaunchSpecification keys which will overwrite
			// the keys from the General launch spec
			Overwrites map[string]json.RawMessage `json:"overwrites"`
			// This number is a relative measure of performance between two instance
			// types.  It is multiplied by the spot price from Amazon to figure out
			// which instance type is the cheapest one
			Utility int `json:"utility"`
		} `json:"instanceTypes"`
		// AWS LaunchSpecification values shared by all regions and all instance-types.
		// This launch spec should not contain either an InstanceType or ImageId.  The
		// former should always be a key in the types object and the latter should be
		// an overwrite in the regions object
		LaunchSpecification map[string]json.RawMessage `json:"launchSpecification"`
		// Maximum number of capacity units to be provisioned.
		MaxCapacity int `json:"maxCapacity"`
		// Maximum price we'll pay.  Like minPrice, this takes into account the
		// utility factor when figuring out what the actual SpotPrice submitted
		// to Amazon will be
		MaxPrice int `json:"maxPrice"`
		// Minimum number of capacity units to be provisioned.  A capacity unit
		// is an abstract unit of capacity, where one capacity unit is roughly
		// one task which should be taken off the queue
		MinCapacity int `json:"minCapacity"`
		// Minimum price to pay for an instance.  A Price is considered to be the
		// Amazon Spot Price multiplied by the utility factor of the InstantType
		// as specified in the instanceTypes list.  For example, if the minPrice
		// is set to $0.5 and the utility factor is 2, the actual minimum bid
		// used will be $0.25
		MinPrice int `json:"minPrice"`
		Regions  []struct {
			// This object contains LaunchSpecification keys which will overwrite keys
			// from the general LaunchSpecificiation
			Overwrites struct {
				// Per-region AMI ImageId
				ImageId string `json:"ImageId"`
			} `json:"overwrites"`
			// The Amazon AWS Region being configured.  Example: us-west-1
			Region string `json:"region"`
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
		ScalingRatio int `json:"scalingRatio"`
	}

	// All of the launch specifications for a worker type
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/get-launch-specs-response.json#
	GetAllLaunchSpecsResponse map[string]json.RawMessage

	// A worker launchSpecification and required metadata
	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/get-worker-type-response.json#
	GetWorkerTypeRequest struct {
		// True if this worker type is allowed on demand instances.  Currently
		// ignored
		CanUseOndemand bool `json:"canUseOndemand"`
		// True if this worker type is allowed spot instances.  Currently ignored
		// as all instances are Spot
		CanUseSpot    bool `json:"canUseSpot"`
		InstanceTypes []struct {
			// This number represents the number of tasks that this instance type
			// is capable of running concurrently.  This is used by the provisioner
			// to know how many pending tasks to offset a pending instance of this
			// type by
			Capacity int `json:"capacity"`
			// InstanceType name for Amazon.
			InstanceType string `json:"instanceType"`
			// This object contains LaunchSpecification keys which will overwrite
			// the keys from the General launch spec
			Overwrites map[string]json.RawMessage `json:"overwrites"`
			// This number is a relative measure of performance between two instance
			// types.  It is multiplied by the spot price from Amazon to figure out
			// which instance type is the cheapest one
			Utility int `json:"utility"`
		} `json:"instanceTypes"`
		// AWS LaunchSpecification values shared by all regions and all instance-types.
		// This launch spec should not contain either an InstanceType or ImageId.  The
		// former should always be a key in the types object and the latter should be
		// an overwrite in the regions object
		LaunchSpecification map[string]json.RawMessage `json:"launchSpecification"`
		// Maximum number of capacity units to be provisioned.
		MaxCapacity int `json:"maxCapacity"`
		// Maximum price we'll pay.  Like minPrice, this takes into account the
		// utility factor when figuring out what the actual SpotPrice submitted
		// to Amazon will be
		MaxPrice int `json:"maxPrice"`
		// Minimum number of capacity units to be provisioned.  A capacity unit
		// is an abstract unit of capacity, where one capacity unit is roughly
		// one task which should be taken off the queue
		MinCapacity int `json:"minCapacity"`
		// Minimum price to pay for an instance.  A Price is considered to be the
		// Amazon Spot Price multiplied by the utility factor of the InstantType
		// as specified in the instanceTypes list.  For example, if the minPrice
		// is set to $0.5 and the utility factor is 2, the actual minimum bid
		// used will be $0.25
		MinPrice int `json:"minPrice"`
		Regions  []struct {
			// This object contains LaunchSpecification keys which will overwrite keys
			// from the general LaunchSpecificiation
			Overwrites struct {
				// Per-region AMI ImageId
				ImageId string `json:"ImageId"`
			} `json:"overwrites"`
			// The Amazon AWS Region being configured.  Example: us-west-1
			Region string `json:"region"`
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
		ScalingRatio int `json:"scalingRatio"`
		// The ID of the workerType
		WorkerType string `json:"workerType"`
	}

	//
	// See http://schemas.taskcluster.net/aws-provisioner/v1/list-worker-types-response.json#
	ListWorkerTypes []string
)
