package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v37/workers/generic-worker/gwconfig"
)

var (
	// not a const, because in testing we swap this out
	EC2MetadataBaseURL = "http://169.254.169.254/latest"
)

type InstanceIdentityDocument struct {
	InstanceID       string `json:"instanceId"`
	ImageID          string `json:"imageId"`
	InstanceType     string `json:"instanceType"`
	Region           string `json:"region"`
	AvailabilityZone string `json:"availabilityZone"`
	PrivateIP        string `json:"privateIp"`
}

func queryAWSMetaData(url string) ([]byte, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-retrieval
	// call http://169.254.169.254/latest/meta-data/instance-id with httpbackoff
	resp, _, err := httpbackoff.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return ioutil.ReadAll(resp.Body)
}

type AWSWorkerLocation struct {
	Cloud            string `json:"cloud"`
	Region           string `json:"region"`
	AvailabilityZone string `json:"availabilityZone"`
}

func AWSUpdateConfig(c *gwconfig.Config) (awsMetadata map[string][]byte, err error) {

	awsMetadata = map[string][]byte{}
	for _, url := range []string{
		EC2MetadataBaseURL + "/meta-data/public-ipv4",
		EC2MetadataBaseURL + "/meta-data/public-hostname",
		EC2MetadataBaseURL + "/dynamic/instance-identity/signature",
		EC2MetadataBaseURL + "/dynamic/instance-identity/document",
		EC2MetadataBaseURL + "/user-data",
	} {
		key := url[strings.LastIndex(url, "/")+1:]
		var value []byte
		value, err = queryAWSMetaData(url)
		if err != nil {
			// not being able to read metadata is serious error
			err = fmt.Errorf("Error querying AWS metadata url %v: %v", url, err)
			return
		}
		awsMetadata[key] = value
	}

	iid := new(InstanceIdentityDocument)
	err = json.Unmarshal(awsMetadata["document"], iid)
	if err != nil {
		err = fmt.Errorf("Could not interpret id document as json: %v: %v", string(awsMetadata["document"]), err)
		return
	}

	c.WorkerTypeMetadata["aws"] = map[string]string{
		"instance-id":       iid.InstanceID,
		"image":             iid.ImageID,
		"instance-type":     iid.InstanceType,
		"region":            iid.Region,
		"availability-zone": iid.AvailabilityZone,
		"local-ipv4":        iid.PrivateIP,
		"public-hostname":   string(awsMetadata["public-hostname"]),
		"public-ipv4":       string(awsMetadata["public-ipv4"]),
	}

	c.Region = iid.Region
	c.WorkerID = iid.InstanceID
	c.PublicIP = net.ParseIP(string(awsMetadata["public-ipv4"]))
	c.PrivateIP = net.ParseIP(iid.PrivateIP)
	c.InstanceID = iid.InstanceID
	c.InstanceType = iid.InstanceType
	c.AvailabilityZone = iid.AvailabilityZone

	// Don't override WorkerLocation if configuration specifies an explicit
	// value.
	//
	// See:
	//   * https://github.com/taskcluster/taskcluster-rfcs/blob/master/rfcs/0148-taskcluster-worker-location.md
	//   * https://github.com/taskcluster/taskcluster/tree/main/tools/worker-runner#aws
	if c.WorkerLocation == "" {
		workerLocation := &AWSWorkerLocation{
			Cloud:            "aws",
			Region:           c.Region,
			AvailabilityZone: c.AvailabilityZone,
		}
		var workerLocationJSON []byte
		workerLocationJSON, err = json.Marshal(workerLocation)
		if err != nil {
			err = fmt.Errorf("Error encoding worker location %#v as JSON: %v", workerLocation, err)
			return
		}
		c.WorkerLocation = string(workerLocationJSON)
	}
	return
}

// InferAWSConfigProvider determines whether the instance was spawned by the
// AWS Provider, and returns the appropriate Provider.
func InferAWSConfigProvider() (gwconfig.Provider, error) {
	userdataBytes, err := queryAWSMetaData(EC2MetadataBaseURL + "/user-data")
	if err != nil {
		// if we can't read user data, this is a serious problem
		return nil, fmt.Errorf("Could not read user data: %v", err)
	}
	// If running under AWS Provider, we should have a `rootUrl` property set in userdata ...
	awsProviderUserData := new(WorkerManagerUserData)
	err = json.Unmarshal(userdataBytes, awsProviderUserData)
	if err != nil {
		// if we can't parse user data, this is a serious problem
		return nil, fmt.Errorf("Could not unmarshal userdata %q into WorkerManagerUserData struct: %v", string(userdataBytes), err)
	}
	if awsProviderUserData.RootURL != "" {
		return &AWSProvider{
			UserData: awsProviderUserData,
		}, nil
	}
	return nil, fmt.Errorf("Userdata is not recognised as valid AWS Provider userdata: %q", string(userdataBytes))
}

func handleAWSWorkerShutdown(abort func()) func() {
	// Bug 1180187: poll this url every 5 seconds:
	// http://169.254.169.254/latest/meta-data/spot/termination-time
	ticker := time.NewTicker(time.Second * 5)
	go func() {
		for range ticker.C {
			resp, err := http.Get(EC2MetadataBaseURL + "/meta-data/spot/termination-time")
			// intermittent errors calling this endpoint should be ignored, but can be logged
			if err != nil {
				log.Printf("WARNING: error when calling AWS EC2 spot termination endpoint: %v", err)
				continue
			}
			resp.Body.Close()
			if resp.StatusCode == 200 {
				abort()
				break
			}
			if resp.StatusCode != 404 {
				log.Printf("WARNING: Non 200/404 status code from spot termination endpoint: %v", resp.StatusCode)
			}
		}
	}()
	return ticker.Stop
}
