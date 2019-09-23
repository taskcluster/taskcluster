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

type GCPUserData struct {
	WorkerPoolID string                       `json:"workerPoolId"`
	ProviderID   string                       `json:"providerId"`
	WorkerGroup  string                       `json:"workerGroup"`
	RootURL      string                       `json:"rootURL"`
	WorkerConfig WorkerTypeDefinitionUserData `json:"workerConfig"`
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

func updateConfigWithGCPSettings(c *gwconfig.Config) error {
	log.Print("Querying GCP Metadata to get default worker type config settings...")
	// these are just default values, will be overwritten if set in worker type config
	c.ShutdownMachineOnInternalError = true
	c.ShutdownMachineOnIdle = true

	client := &http.Client{}

	workerID, err := queryGCPMetaData(client, "/instance/id")
	if err != nil {
		return fmt.Errorf("Could not query instance ID: %v", err)
	}
	c.WorkerID = string(workerID)

	taskclusterConfig, err := queryGCPMetaData(client, "/instance/attributes/taskcluster")
	if err != nil {
		return fmt.Errorf("Could not query taskcluster configuration: %v", err)
	}

	var userData GCPUserData
	err = json.Unmarshal(taskclusterConfig, &userData)
	if err != nil {
		return err
	}

	wp := strings.SplitN(userData.WorkerPoolID, "/", -1)
	if len(wp) != 2 {
		return fmt.Errorf("Was expecting WorkerPoolID to have syntax <provisionerId>/<workerType> but was %q", userData.WorkerPoolID)
	}

	c.ProvisionerID = wp[0]
	c.WorkerType = wp[1]
	c.WorkerGroup = userData.WorkerGroup
	c.RootURL = userData.RootURL

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm := c.WorkerManager()
	wm.Authenticate = false
	wm.Credentials = nil

	identity, err := queryGCPMetaData(client, "/instance/service-accounts/default/identity?audience="+userData.RootURL+"&format=full")
	if err != nil {
		return fmt.Errorf("Could not query google indentity token: %v", err)
	}
	providerType := tcworkermanager.GoogleProviderType{
		Token: string(identity),
	}

	workerIdentityProof, err := json.Marshal(providerType)
	if err != nil {
		return fmt.Errorf("Could not marshal google provider type %#v: %v", providerType, err)
	}

	reg, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        userData.WorkerPoolID,
		ProviderID:          userData.ProviderID,
		WorkerGroup:         userData.WorkerGroup,
		WorkerID:            c.WorkerID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	})

	if err != nil {
		return fmt.Errorf("Could not register worker: %v", err)
	}

	c.AccessToken = reg.Credentials.AccessToken
	c.Certificate = reg.Credentials.Certificate
	c.ClientID = reg.Credentials.ClientID

	// TODO: process reg.Expires

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

	// Parse the config before applying it, to ensure that no disallowed fields
	// are included.
	_, err = userData.WorkerConfig.PublicHostSetup()
	if err != nil {
		return fmt.Errorf("Error retrieving/interpreting host setup from GCP metadata: %v", err)
	}

	err = c.MergeInJSON(userData.WorkerConfig.GenericWorker, func(a map[string]interface{}) map[string]interface{} {
		if config, exists := a["config"]; exists {
			return config.(map[string]interface{})
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("Error applying /workerConfig/genericWorker/config of workerpool from metadata to config: %v", err)
	}

	if c.IdleTimeoutSecs == 0 {
		c.IdleTimeoutSecs = 3600
	}

	return nil
}
