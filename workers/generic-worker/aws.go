package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v99/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v99/workers/generic-worker/graceful"
	"github.com/taskcluster/taskcluster/v99/workers/generic-worker/gwconfig"
)

var (
	// not a const, because in testing we swap this out
	EC2MetadataBaseURL = "http://169.254.169.254/latest"
	EC2TokenURL        = "http://169.254.169.254/latest/api/token"
	EC2TokenTTL        = 21600

	imdsTokenMu     sync.Mutex
	imdsToken       string
	imdsTokenExpiry time.Time
)

type AWSConfigProvider struct {
}

type AWSWorkerLocation struct {
	Cloud            string `json:"cloud"`
	Region           string `json:"region"`
	AvailabilityZone string `json:"availabilityZone"`
}

// ensureIMDSv2Token obtains or reuses an IMDSv2 session token.
func ensureIMDSv2Token() error {
	imdsTokenMu.Lock()
	defer imdsTokenMu.Unlock()
	if imdsToken != "" && imdsTokenExpiry.After(time.Now().Add(15*time.Minute)) {
		return nil
	}
	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest("PUT", EC2TokenURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", strconv.Itoa(EC2TokenTTL))
	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	token, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	imdsToken = string(token)
	imdsTokenExpiry = time.Now().Add(time.Second * time.Duration(EC2TokenTTL))
	return nil
}

func queryAWSMetaData(url string) ([]byte, error) {
	// Use IMDSv2: get a token, then query with it
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-retrieval
	err := ensureIMDSv2Token()
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-aws-ec2-metadata-token", imdsToken)
	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (a *AWSConfigProvider) UpdateConfig(c *gwconfig.Config) (err error) {

	awsMetadata := map[string][]byte{}
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
			return fmt.Errorf("Error querying AWS metadata url %v: %v", url, err)
		}
		awsMetadata[key] = value
	}

	awsProviderUserData := new(WorkerManagerUserData)
	err = json.Unmarshal(awsMetadata["user-data"], awsProviderUserData)
	if err != nil {
		// if we can't parse user data, this is a serious problem
		return fmt.Errorf("could not unmarshal userdata %q into WorkerManagerUserData struct: %v", string(awsMetadata["user-data"]), err)
	}
	if awsProviderUserData.RootURL == "" {
		return fmt.Errorf("userdata is not recognised as valid AWS Provider userdata: %q", string(awsMetadata["user-data"]))
	}

	iid := new(InstanceIdentityDocument)
	err = json.Unmarshal(awsMetadata["document"], iid)
	if err != nil {
		return fmt.Errorf("could not interpret id document as json: %v: %v", string(awsMetadata["document"]), err)
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
	if c.WorkerLocation == "" {
		workerLocation := &AWSWorkerLocation{
			Cloud:            "aws",
			Region:           c.Region,
			AvailabilityZone: c.AvailabilityZone,
		}
		var workerLocationJSON []byte
		workerLocationJSON, err = json.Marshal(workerLocation)
		if err != nil {
			return fmt.Errorf("Error encoding worker location %#v as JSON: %v", workerLocation, err)
		}
		c.WorkerLocation = string(workerLocationJSON)
	}
	providerType := &tcworkermanager.AwsProviderType{
		Document:  string(awsMetadata["document"]),
		Signature: string(awsMetadata["signature"]),
	}

	return awsProviderUserData.UpdateConfig(c, providerType)
}

type InstanceIdentityDocument struct {
	InstanceID       string `json:"instanceId"`
	ImageID          string `json:"imageId"`
	InstanceType     string `json:"instanceType"`
	Region           string `json:"region"`
	AvailabilityZone string `json:"availabilityZone"`
	PrivateIP        string `json:"privateIp"`
}

// startAWSTerminationPolling polls EC2 metadata for spot termination notices
// and triggers graceful termination when one is detected.
func startAWSTerminationPolling() func() {
	ticker := time.NewTicker(5 * time.Second)
	go func() {
		for range ticker.C {
			resp, err := http.Get(EC2MetadataBaseURL + "/meta-data/spot/termination-time")
			if err != nil {
				log.Printf("WARNING: error when calling AWS EC2 spot termination endpoint: %v", err)
				continue
			}
			resp.Body.Close()
			if resp.StatusCode == 200 {
				log.Println("EC2 Metadata Service says termination is imminent")
				graceful.Terminate(false)
				return
			}
			if resp.StatusCode != 404 {
				log.Printf("WARNING: Non 200/404 status code from spot termination endpoint: %v", resp.StatusCode)
			}
		}
	}()
	return ticker.Stop
}

func (a *AWSConfigProvider) NewestDeploymentID() (string, error) {
	return WMDeploymentID()
}
