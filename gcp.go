package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"strings"

	"github.com/taskcluster/generic-worker/gwconfig"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/taskcluster-client-go/tcworkermanager"
)

var (
	// not a const, because in testing we swap this out
	GCPMetadataBaseURL = "http://metadata.google.internal/computeMetadata/v1"
)

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

func updateConfigWithGCPSettings(c *gwconfig.Config) error {
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

	gcpMetadata := map[string]interface{}{}
	for _, path := range []string{
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
	c.WorkerID = gcpMetadata["id"].(string)
	c.PublicIP = net.ParseIP(gcpMetadata["external-ip"].(string))
	c.PrivateIP = net.ParseIP(gcpMetadata["ip"].(string))
	c.InstanceID = gcpMetadata["id"].(string)
	c.InstanceType = gcpMetadata["machine-type"].(string)
	c.AvailabilityZone = gcpMetadata["zone"].(string)

	identity, err := queryGCPMetaData(client, "/instance/service-accounts/default/identity?audience="+userData.RootURL+"&format=full")
	if err != nil {
		return fmt.Errorf("Could not query google indentity token: %v", err)
	}
	providerType := tcworkermanager.GoogleProviderType{
		Token: string(identity),
	}

	return userData.updateConfig(c, providerType)
}
