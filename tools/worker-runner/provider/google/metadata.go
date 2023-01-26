package google

// See https://cloud.google.com/compute/docs/storing-retrieving-metadata

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/taskcluster/httpbackoff/v3"
)

var metadataBaseURL = "http://metadata.google.internal/computeMetadata/v1"

// user-data sent to us from the worker-manager service
type UserData struct {
	WorkerPoolID string `json:"workerPoolId"`
	ProviderID   string `json:"providerId"`
	WorkerGroup  string `json:"workerGroup"`
	RootURL      string `json:"rootUrl"`

	// NOTE: this is ignored, in preference to the configuration
	// returned from registerWorker
	ProviderWorkerConfig *json.RawMessage `json:"workerConfig"`
}

type MetadataService interface {
	// Query the UserData and return the parsed contents
	queryUserData() (*UserData, error)

	// Query an aribtrary metadata value; path is the portion following `latest`
	queryMetadata(path string) (string, error)
}

type realMetadataService struct{}

func (mds *realMetadataService) queryUserData() (*UserData, error) {
	// user-data is given to us by worker-manager in the 'taskcluster' attribute
	content, err := mds.queryMetadata("/instance/attributes/taskcluster")
	if err != nil {
		return nil, err
	}
	userData := &UserData{}
	err = json.Unmarshal([]byte(content), userData)
	return userData, err
}

func (mds *realMetadataService) queryMetadata(path string) (string, error) {
	client := http.Client{}
	req, err := http.NewRequest("GET", metadataBaseURL+path, nil)
	if err != nil {
		return "", err
	}

	// google's metadata service requires this header
	req.Header.Set("Metadata-Flavor", "Google")

	resp, _, err := httpbackoff.ClientDo(&client, req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	content, err := io.ReadAll(resp.Body)
	return string(content), err
}
