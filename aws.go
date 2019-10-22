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

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/httpbackoff"
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

func updateConfigWithAmazonSettings(c *gwconfig.Config) error {

	awsMetadata := map[string][]byte{}
	for _, url := range []string{
		EC2MetadataBaseURL + "/meta-data/public-ipv4",
		EC2MetadataBaseURL + "/meta-data/public-hostname",
		EC2MetadataBaseURL + "/dynamic/instance-identity/signature",
		EC2MetadataBaseURL + "/dynamic/instance-identity/document",
		EC2MetadataBaseURL + "/user-data",
	} {
		key := url[strings.LastIndex(url, "/")+1:]
		value, err := queryAWSMetaData(url)
		if err != nil {
			// not being able to read metadata is serious error
			return fmt.Errorf("Error querying AWS metadata url %v: %v", url, err)
		}
		awsMetadata[key] = value
	}

	iid := new(InstanceIdentityDocument)
	err := json.Unmarshal(awsMetadata["document"], iid)
	if err != nil {
		return fmt.Errorf("Could not interpret id document as json: %v: %v", string(awsMetadata["document"]), err)
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

	return providerSpecificUpdates(c, awsMetadata)
}

// providerSpecificUpdates determines whether the instance was spawned by the
// AWS Provisioner or the AWS Provider, and applies config updates accordingly.
func providerSpecificUpdates(c *gwconfig.Config, awsMetadata map[string][]byte) error {

	// Test if running under AWS Provisioner...
	awsProvisionerUserData := new(AWSProvisionerUserData)
	err := json.Unmarshal(awsMetadata["user-data"], awsProvisionerUserData)
	if err != nil {
		// if we can't parse user data, this is a serious problem
		return fmt.Errorf("Could not parse user data %v: %v", string(awsMetadata["user-data"]), err)
	}
	if awsProvisionerUserData.TaskclusterRootURL != "" {
		return updateConfigAWSProvisioner(c, awsMetadata, awsProvisionerUserData)
	}

	// Test if running under AWS Provider...
	awsProviderUserData := new(WorkerManagerUserData)
	err = json.Unmarshal(awsMetadata["user-data"], awsProviderUserData)
	if err != nil {
		// if we can't parse user data, this is a serious problem
		return fmt.Errorf("Could not parse user data %v: %v", string(awsMetadata["user-data"]), err)
	}
	if awsProviderUserData.RootURL != "" {
		return updateConfigAWSProvider(c, awsMetadata, awsProviderUserData)
	}

	return fmt.Errorf("Userdata is neither recognised as valid AWS Provisioner userdata nor as AWS Provider userdata: %v", string(awsMetadata["user-data"]))
}

func handleWorkerShutdown(abort func()) func() {
	// Bug 1180187: poll this url every 5 seconds:
	// http://169.254.169.254/latest/meta-data/spot/termination-time
	ticker := time.NewTicker(time.Second * 5)
	go func() {
		for _ = range ticker.C {
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
