package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/taskcluster/v99/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v99/workers/generic-worker/graceful"
	"github.com/taskcluster/taskcluster/v99/workers/generic-worker/gwconfig"
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
			Location string `json:"location"`
			Name     string `json:"name"`
			VMID     string `json:"vmId"`
			VMSize   string `json:"vmSize"`
			TagsList []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"tagsList"`
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

	AzureScheduledEvents struct {
		Events []struct {
			EventID           string   `json:"EventId"`
			EventType         string   `json:"EventType"`
			ResourceType      string   `json:"ResourceType"`
			Resources         []string `json:"Resources"`
			EventStatus       string   `json:"EventStatus"`
			NotBefore         string   `json:"NotBefore"`
			Description       string   `json:"Description"`
			EventSource       string   `json:"EventSource"`
			DurationInSeconds int      `json:"DurationInSeconds"`
		} `json:"Events"`
	}
)

func queryAzureMetaData(path string, apiVersion string) ([]byte, error) {
	client := http.Client{}
	u, _ := url.Parse(AzureMetadataBaseURL)
	u = &url.URL{
		Scheme:   u.Scheme,
		Host:     u.Host,
		Path:     path,
		RawQuery: "api-version=" + apiVersion,
	}
	req, err := http.NewRequest("GET", u.String(), nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Metadata", "true")

	resp, _, err := httpbackoff.ClientDo(&client, req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func (g *AzureConfigProvider) UpdateConfig(c *gwconfig.Config) error {
	log.Print("Querying Azure Metadata to get default worker type config settings...")

	instanceMetaData, err := queryAzureMetaData("/metadata/instance", "2025-04-07")
	if err != nil {
		return fmt.Errorf("could not query taskcluster configuration: %v", err)
	}
	var azureMetaData AzureMetaData
	err = json.Unmarshal(instanceMetaData, &azureMetaData)
	if err != nil {
		return fmt.Errorf("could not unmarshal instance metadata %q into AzureMetaData struct - is it valid JSON? %v", string(instanceMetaData), err)
	}

	tags := map[string]string{}
	for _, i := range azureMetaData.Compute.TagsList {
		tags[i.Name] = i.Value
	}

	userData := &WorkerManagerUserData{
		WorkerPoolID: tags["worker-pool-id"],
		ProviderID:   tags["provider-id"],
		WorkerGroup:  tags["worker-group"],
		RootURL:      tags["root-url"],
	}

	c.WorkerTypeMetadata["azure"] = map[string]any{
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

	attestedDoc, err := queryAzureMetaData("/metadata/attested/document", "2025-04-07")
	if err != nil {
		return fmt.Errorf("could not query taskcluster configuration: %v", err)
	}
	var doc AttestedDocument
	err = json.Unmarshal(attestedDoc, &doc)
	if err != nil {
		return fmt.Errorf("could not unmarshal attested document %q into AttestedDocument struct - is it valid JSON? %v", string(attestedDoc), err)
	}
	if doc.Encoding != "pkcs7" {
		return fmt.Errorf(`attested document has unsupported encoding (%q) - generic-worker only supports "pkcs7"`, doc.Encoding)
	}

	providerType := tcworkermanager.AzureProviderType{
		Document: doc.Signature,
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

// startAzureTerminationPolling polls Azure scheduled events and triggers
// graceful termination when a non-Freeze maintenance event is detected.
// Microsoft recommends polling once per second:
// https://learn.microsoft.com/en-us/azure/virtual-machines/windows/scheduled-events#polling-frequency
func startAzureTerminationPolling() func() {
	ticker := time.NewTicker(1 * time.Second)
	go func() {
		for range ticker.C {
			// NOTE: the first call to this endpoint may take up to 120s:
			// https://docs.microsoft.com/en-us/azure/virtual-machines/linux/scheduled-events#enabling-and-disabling-scheduled-events
			// That may lead to a "backlog" of checks, but that won't do any real harm.
			data, err := queryAzureMetaData("/metadata/scheduledevents", "2020-07-01")
			if err != nil {
				log.Printf("WARNING: while fetching scheduled-events metadata: %v", err)
				continue
			}
			var evts AzureScheduledEvents
			err = json.Unmarshal(data, &evts)
			if err != nil {
				log.Printf("WARNING: could not parse scheduled events: %v", err)
				continue
			}
			for _, evt := range evts.Events {
				// Freeze events are non-destructive memory pauses; skip them.
				// https://learn.microsoft.com/en-us/azure/virtual-machines/windows/scheduled-events#event-properties
				if evt.EventType == "Freeze" {
					continue
				}
				log.Printf("Azure Metadata Service says a %s maintenance event is imminent", evt.EventType)
				graceful.Terminate(false)
				return
			}
		}
	}()
	return ticker.Stop
}

func (g *AzureConfigProvider) NewestDeploymentID() (string, error) {
	return WMDeploymentID()
}
