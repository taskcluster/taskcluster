package aws

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/taskcluster/httpbackoff/v3"
)

var (
	EC2MetadataBaseURL = "http://169.254.169.254/latest"
	TokenURL           = "http://169.254.169.254/latest/api/token"
	TokenTTL           = 21600
)

type UserData struct {
	WorkerPoolId string `json:"workerPoolId"`
	ProviderId   string `json:"providerId"`
	RootURL      string `json:"rootUrl"`
	WorkerGroup  string `json:"workerGroup"`

	// NOTE: this is ignored, in preference to the configuration
	// returned from registerWorker
	ProviderWorkerConfig *json.RawMessage `json:"workerConfig"`
}

type InstanceIdentityDocument struct {
	InstanceId       string `json:"instanceId"`
	ImageId          string `json:"imageId"`
	InstanceType     string `json:"instanceType"`
	Region           string `json:"region"`
	AvailabilityZone string `json:"availabilityZone"`
	PrivateIp        string `json:"privateIp"`
}

type MetadataService interface {
	// Query the UserData and return the parsed contents
	queryUserData() (*UserData, error)

	// return both parsed and unparsed instance identity document
	queryInstanceIdentityDocument() (string, *InstanceIdentityDocument, error)

	// Query an arbitrary metadata value; path is the portion following `latest`
	queryMetadata(path string) (string, error)
}

type realMetadataService struct {
	mu     sync.Mutex
	Token  string
	Expiry time.Time
}

func (mds *realMetadataService) queryUserData() (*UserData, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-user-data-retrieval
	content, err := mds.queryMetadata("/user-data")
	if err != nil {
		return nil, err
	}
	userData := &UserData{}
	err = json.Unmarshal([]byte(content), userData)
	return userData, err
}

func (mds *realMetadataService) ensureIMDSv2Token(tokenURL string, tokenTTL int) error {
	mds.mu.Lock()
	defer mds.mu.Unlock()
	if mds.Token != "" && mds.Expiry.After(time.Now().Add(15*time.Minute)) {
		return nil
	}
	client := &http.Client{
		Timeout: 2 * time.Second,
	}
	req, err := http.NewRequest("PUT", tokenURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", strconv.Itoa(tokenTTL))

	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	token, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	mds.Token = string(token)
	mds.Expiry = time.Now().Add(time.Second * time.Duration(TokenTTL))
	return nil
}

func (mds *realMetadataService) queryMetadata(path string) (string, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-retrieval
	// call http://169.254.169.254/latest/meta-data/instance-id with httpbackoff
	err := mds.ensureIMDSv2Token(TokenURL, TokenTTL)
	if err != nil {
		return "", err
	}
	client := &http.Client{
		Timeout: 2 * time.Second,
	}
	req, err := http.NewRequest("GET", EC2MetadataBaseURL+path, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-aws-ec2-metadata-token", mds.Token)
	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	content, err := io.ReadAll(resp.Body)
	return string(content), err
}

func (mds *realMetadataService) queryInstanceIdentityDocument() (string, *InstanceIdentityDocument, error) {
	// https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-identity-documents.html
	identityDocumentString, err := mds.queryMetadata("/dynamic/instance-identity/document")
	if err != nil {
		return "", nil, err
	}

	identityDocumentJSON := &InstanceIdentityDocument{}
	err = json.Unmarshal([]byte(identityDocumentString), identityDocumentJSON)

	return identityDocumentString, identityDocumentJSON, err
}
