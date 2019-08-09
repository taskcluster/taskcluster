package awsprovisioner

import (
	"encoding/json"
	"io/ioutil"

	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
)

var EC2MetadataBaseURL = "http://169.254.169.254/latest"

// taken from https://github.com/taskcluster/aws-provisioner/blob/5a2bc7c57b20df00f9c4357e0daeb7967e6f5ee8/lib/worker-type.js#L607-L624
type UserData struct {
	Data               *cfg.WorkerConfig `json:"data"`
	WorkerType         string            `json:"workerType"`
	ProvisionerID      string            `json:"provisionerId"`
	Region             string            `json:"region"`
	TaskclusterRootURL string            `json:"taskclusterRootUrl"`
	SecurityToken      string            `json:"securityToken"`
	Capacity           int               `json:"capacity"`
}

type MetadataService interface {
	// Query the UserData and return the parsed contents
	queryUserData() (*UserData, error)

	// Query an aribtrary metadata value; path is the portion following `latest`
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
	content, err := ioutil.ReadAll(resp.Body)
	return string(content), err
}
