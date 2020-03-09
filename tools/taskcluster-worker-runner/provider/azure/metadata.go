// This package reads from the Azure metadata service; see
// https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service#custom-data
package azure

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"

	"github.com/taskcluster/httpbackoff/v3"
)

var MetadataBaseURL = "http://169.254.169.254"

// Data from the `/instance` endpoint.  Note that this is a partial set --
// feel free to add additional fields here as necessary.
type InstanceData struct {
	Compute struct {
		Location string `json:"location"`
		VMID     string `json:"vmId"`
		Name     string `json:"name"`
		VMSize   string `json:"vmSize"`
	} `json:"compute"`
	Network struct {
		Interface []struct {
			IPV4 struct {
				IPAddress []struct {
					PrivateIPAddress string `json:"privateIpAddress"`
					PublicIPAddress  string `json:"publicIpAddress"`
				} `json:"ipAddress"`
			} `json:"ipv4"`
		} `json:"interface"`
	} `json:"network"`
}

// Data from the /scheduledevents endpoint
type ScheduledEvents struct {
	Events []struct {
		EventId      string
		EventType    string
		ResourceType string
		Resources    []string
		EventStatus  string
		NotBefore    string
	}
}

// Data from the /attested/document endpoint.
type AttestedDocument struct {
	Encoding  string `json:"encoding"`
	Signature string `json:"signature"`
}

type MetadataService interface {
	// Query the /instance endpoint
	queryInstanceData() (*InstanceData, error)
	// Get the content of the Attested document
	queryAttestedDocument() (string, error)
	// Get the content of the scheduled events
	queryScheduledEvents() (*ScheduledEvents, error)
	// Load customData from the disk where windows azure agent stuck it
	// This is explained by https://azure.microsoft.com/en-us/blog/custom-data-and-cloud-init-on-windows-azure/
	// Technically they claim to also provide customData in the metadata service like the other clouds do
	// but in our experience (and also as seen in https://github.com/MicrosoftDocs/azure-docs/issues/30370) this
	// does not seem to work.
	loadCustomData() ([]byte, error)
}

type realMetadataService struct{}

func (mds *realMetadataService) fetch(path string, apiVersion string) (string, error) {
	client := http.Client{}
	u, _ := url.Parse(MetadataBaseURL)
	u = &url.URL{
		Scheme:   u.Scheme,
		Host:     u.Host,
		Path:     path,
		RawQuery: "api-version=" + apiVersion,
	}
	req, err := http.NewRequest("GET", u.String(), nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Metadata", "true")

	resp, _, err := httpbackoff.ClientDo(&client, req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	content, err := ioutil.ReadAll(resp.Body)
	return string(content), err
}

func (mds *realMetadataService) queryInstanceData() (*InstanceData, error) {
	content, err := mds.fetch("/metadata/instance", "2019-04-30")
	if err != nil {
		return nil, err
	}
	id := &InstanceData{}
	err = json.Unmarshal([]byte(content), id)
	return id, err
}

func (mds *realMetadataService) queryAttestedDocument() (string, error) {
	content, err := mds.fetch("/metadata/attested/document", "2019-04-30")
	if err != nil {
		return "", err
	}
	j := &AttestedDocument{}
	err = json.Unmarshal([]byte(content), j)
	if err != nil {
		return "", err
	}
	if j.Encoding != "pkcs7" {
		return "", fmt.Errorf("Expected attested document with format pkcs7, got %s", j.Encoding)
	}
	return j.Signature, nil
}

func (mds *realMetadataService) queryScheduledEvents() (*ScheduledEvents, error) {
	// note that this interface is only available in this earlier API version
	content, err := mds.fetch("/metadata/scheduledevents", "2017-11-01")
	if err != nil {
		return nil, err
	}
	evts := &ScheduledEvents{}
	err = json.Unmarshal([]byte(content), evts)
	return evts, err
}
