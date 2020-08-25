package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v37/workers/generic-worker/gwconfig"
)

var (
	// not a const, because in testing we swap this out
	AzureMetadataBaseURL = "http://169.254.169.254"
)

type (
	AzureConfigProvider struct {
	}

	AzureWorkerLocation struct {
		Cloud  string `json:"cloud"`
		Region string `json:"region"`
	}

	AzureMetaData struct {
		Compute struct {
			CustomData string `json:"customData"`
			Location   string `json:"location"`
			VMID       string `json:"vmId"`
			VMSize     string `json:"vmSize"`
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

	AttestedDocument struct {
		Encoding  string `json:"encoding"`
		Signature string `json:"signature"`
	}
)

func queryAzureMetaData(client *http.Client, path string, apiVersion string) ([]byte, error) {
	req, err := http.NewRequest("GET", AzureMetadataBaseURL+path+"?api-version="+apiVersion, nil)

	if err != nil {
		return nil, err
	}

	req.Header.Add("Metadata", "true")

	resp, _, err := httpbackoff.ClientDo(client, req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return ioutil.ReadAll(resp.Body)
}

func (g *AzureConfigProvider) UpdateConfig(c *gwconfig.Config) error {
	log.Print("Querying Azure Metadata to get default worker type config settings...")

	client := &http.Client{}

	instanceMetaData, err := queryAzureMetaData(client, "/metadata/instance", "2019-04-30")
	if err != nil {
		return fmt.Errorf("Could not query taskcluster configuration: %v", err)
	}
	var azureMetaData AzureMetaData
	err = json.Unmarshal(instanceMetaData, &azureMetaData)
	if err != nil {
		return fmt.Errorf("Could not unmarshal instance metadata %q into AzureMetaData struct - is it valid JSON? %v", string(instanceMetaData), err)
	}

	taskclusterConfig, err := base64.StdEncoding.DecodeString(azureMetaData.Compute.CustomData)
	if err != nil {
		return fmt.Errorf("Custom data %q is not valid base64: %v", azureMetaData.Compute.CustomData, err)
	}

	userData := new(WorkerManagerUserData)
	err = json.Unmarshal(taskclusterConfig, userData)
	if err != nil {
		return fmt.Errorf("Could not parse base64 decoded custom data %q as JSON: %v", taskclusterConfig, err)
	}

	c.WorkerTypeMetadata["azure"] = map[string]interface{}{
		"location": azureMetaData.Compute.Location,
		"vmId":     azureMetaData.Compute.VMID,
		"vmSize":   azureMetaData.Compute.VMSize,
	}
	c.WorkerID = azureMetaData.Compute.VMID
	if len(azureMetaData.Network.Interface) == 1 {
		iface := azureMetaData.Network.Interface[0]
		if len(iface.IPV4.IPAddress) == 1 {
			addr := iface.IPV4.IPAddress[0]
			c.PublicIP = net.ParseIP(addr.PublicIPAddress)
			c.PrivateIP = net.ParseIP(addr.PrivateIPAddress)
		}
	}
	c.InstanceID = azureMetaData.Compute.VMID
	c.InstanceType = azureMetaData.Compute.VMSize
	c.AvailabilityZone = azureMetaData.Compute.Location
	c.Region = azureMetaData.Compute.Location

	attestedDoc, err := queryAzureMetaData(client, "/metadata/attested/document", "2019-04-30")
	if err != nil {
		return fmt.Errorf("Could not query taskcluster configuration: %v", err)
	}
	var doc AttestedDocument
	err = json.Unmarshal(attestedDoc, &doc)
	if err != nil {
		return fmt.Errorf("Could not unmarshal attested document %q into AttestedDocument struct - is it valid JSON? %v", string(attestedDoc), err)
	}
	if doc.Encoding != "pkcs7" {
		return fmt.Errorf(`Attested document has unsupported encoding (%q) - generic-worker only supports "pkcs7"`, doc.Encoding)
	}

	// TODO: when Azure Provider is completed in Worker Manager, we'll be able
	// to do the following, but that isn't available yet:
	//
	// providerType := tcworkermanager.AzureProviderType{
	//     Document: doc.Signature,
	// }

	providerType := map[string]string{
		"document": doc.Signature,
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
		workerLocation := &AzureWorkerLocation{
			Cloud:  "azure",
			Region: c.Region,
		}

		workerLocationJSON, err := json.Marshal(workerLocation)
		if err != nil {
			return fmt.Errorf("Error encoding worker location %#v as JSON: %v", workerLocation, err)
		}
		c.WorkerLocation = string(workerLocationJSON)
	}
	return nil
}

func (g *AzureConfigProvider) NewestDeploymentID() (string, error) {
	return WMDeploymentID()
}
