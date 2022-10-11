package aws

import (
	"encoding/json"
	"io"

	"github.com/taskcluster/httpbackoff/v3"
)

var EC2MetadataBaseURL = "http://169.254.169.254/latest"

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

type realMetadataService struct{}

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

func (mds *realMetadataService) queryMetadata(path string) (string, error) {
	// http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html#instancedata-data-retrieval
	// call http://169.254.169.254/latest/meta-data/instance-id with httpbackoff
	resp, _, err := httpbackoff.Get(EC2MetadataBaseURL + path)
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
