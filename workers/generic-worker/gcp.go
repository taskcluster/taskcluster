package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"path"
	"strings"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v37/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v37/workers/generic-worker/gwconfig"
)

var (
	// not a const, because in testing we swap this out
	GCPMetadataBaseURL = "http://metadata.google.internal/computeMetadata/v1"
)

type GCPConfigProvider struct {
}

type GCPWorkerLocation struct {
	Cloud  string `json:"cloud"`
	Region string `json:"region"`
	Zone   string `json:"zone"`
}

func queryGCPMetaData(client *http.Client, path string) ([]byte, error) {
	req, err := http.NewRequest("GET", GCPMetadataBaseURL+path, nil)

	if err != nil {
		return nil, err
	}

	req.Header.Add("Metadata-Flavor", "Google")

	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return ioutil.ReadAll(resp.Body)
}

func (g *GCPConfigProvider) UpdateConfig(c *gwconfig.Config) error {
	log.Print("Querying GCP Metadata to get default worker type config settings...")

	client := &http.Client{}

	taskclusterConfig, err := queryGCPMetaData(client, "/instance/attributes/taskcluster")
	if err != nil {
		return fmt.Errorf("Could not query taskcluster configuration: %v", err)
	}

	userData := new(WorkerManagerUserData)
	err = json.Unmarshal(taskclusterConfig, userData)
	if err != nil {
		return err
	}

	gcpMetadata := map[string]string{}
	for _, path := range []string{
		"/project/project-id",
		"/instance/image",
		"/instance/id",
		"/instance/machine-type",
		"/instance/network-interfaces/0/access-configs/0/external-ip",
		"/instance/zone",
		"/instance/hostname",
		"/instance/network-interfaces/0/ip",
	} {
		key := path[strings.LastIndex(path, "/")+1:]
		value, err := queryGCPMetaData(client, path)
		if err != nil {
			return err
		}
		gcpMetadata[key] = string(value)
	}

	c.WorkerTypeMetadata["gcp"] = gcpMetadata
	c.WorkerID = gcpMetadata["id"]
	c.PublicIP = net.ParseIP(gcpMetadata["external-ip"])
	c.PrivateIP = net.ParseIP(gcpMetadata["ip"])
	c.InstanceID = gcpMetadata["id"]
	c.InstanceType = gcpMetadata["machine-type"]

	// See https://github.com/taskcluster/taskcluster/blob/6b5bbd197eed4be664171a482bf4d8d4f81a21b2/provider/google/google.go#L79-L84
	c.AvailabilityZone = path.Base(gcpMetadata["zone"])
	if len(c.AvailabilityZone) < 2 {
		return fmt.Errorf("GCP availability zone must be at least 2 chars, since region is availability zone minus last two chars. Availability zone %q has only %v chars.", c.AvailabilityZone, len(c.AvailabilityZone))
	}
	c.Region = c.AvailabilityZone[:len(c.AvailabilityZone)-2]

	identity, err := queryGCPMetaData(client, "/instance/service-accounts/default/identity?audience="+userData.RootURL+"&format=full")
	if err != nil {
		return fmt.Errorf("Could not query google indentity token: %v", err)
	}
	providerType := tcworkermanager.GoogleProviderType{
		Token: string(identity),
	}

	err = userData.UpdateConfig(c, providerType)
	if err != nil {
		return err
	}

	// Don't override WorkerLocation if configuration specifies an explicit
	// value.
	//
	// See:
	//   * https://github.com/taskcluster/taskcluster-rfcs/blob/master/rfcs/0148-taskcluster-worker-location.md
	//   * https://github.com/taskcluster/taskcluster/tree/main/tools/worker-runner#google
	if c.WorkerLocation == "" {
		workerLocation := &GCPWorkerLocation{
			Cloud:  "google",
			Region: c.Region,
			Zone:   c.AvailabilityZone,
		}

		workerLocationJSON, err := json.Marshal(workerLocation)
		if err != nil {
			return fmt.Errorf("Error encoding worker location %#v as JSON: %v", workerLocation, err)
		}
		c.WorkerLocation = string(workerLocationJSON)
	}
	return nil
}

func (g *GCPConfigProvider) NewestDeploymentID() (string, error) {
	return WMDeploymentID()
}
