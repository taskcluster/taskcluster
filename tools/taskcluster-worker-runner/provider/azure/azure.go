package azure

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v27/clients/client-go"
	"github.com/taskcluster/taskcluster/v27/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster/v27/tools/taskcluster-worker-runner/tc"
)

type AzureProvider struct {
	runnercfg                  *cfg.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	metadataService            MetadataService
	proto                      *protocol.Protocol
	terminationTicker          *time.Ticker
}

type CustomData struct {
	WorkerPoolId         string           `json:"workerPoolId"`
	ProviderId           string           `json:"providerId"`
	RootURL              string           `json:"rootUrl"`
	WorkerGroup          string           `json:"workerGroup"`
	ProviderWorkerConfig *json.RawMessage `json:"workerConfig"`
}

// These values are expected to be set in tags on the VM
// by the provider
type TaggedData struct {
	WorkerPoolId string
	ProviderId   string
	RootURL      string
	WorkerGroup  string
}

func (p *AzureProvider) ConfigureRun(state *run.State) error {
	instanceData, err := p.metadataService.queryInstanceData()
	if err != nil {
		return fmt.Errorf("Could not query instance data: %v", err)
	}

	document, err := p.metadataService.queryAttestedDocument()
	if err != nil {
		return fmt.Errorf("Could not query attested document: %v", err)
	}

	// bug 1621037: revert to using customData once it is fixed
	taggedData := loadTaggedData(instanceData.Compute.TagsList)

	state.RootURL = taggedData.RootURL
	state.WorkerLocation = map[string]string{
		"cloud":  "azure",
		"region": instanceData.Compute.Location,
	}

	wm, err := p.workerManagerClientFactory(state.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create worker manager client: %v", err)
	}

	workerIdentityProofMap := map[string]interface{}{
		"document": interface{}(document),
	}

	workerConfig, err := provider.RegisterWorker(
		state,
		wm,
		taggedData.WorkerPoolId,
		taggedData.ProviderId,
		taggedData.WorkerGroup,
		instanceData.Compute.Name,
		workerIdentityProofMap)
	if err != nil {
		return err
	}

	providerMetadata := map[string]interface{}{
		"vm-id":         instanceData.Compute.VMID,
		"instance-type": instanceData.Compute.VMSize,
		"region":        instanceData.Compute.Location,
	}

	if len(instanceData.Network.Interface) == 1 {
		iface := instanceData.Network.Interface[0]
		if len(iface.IPV4.IPAddress) == 1 {
			addr := iface.IPV4.IPAddress[0]
			providerMetadata["local-ipv4"] = addr.PrivateIPAddress
			providerMetadata["public-ipv4"] = addr.PublicIPAddress
		}
	}

	state.ProviderMetadata = providerMetadata

	pwc, err := cfg.ParseProviderWorkerConfig(p.runnercfg, workerConfig)
	if err != nil {
		return err
	}

	state.WorkerConfig = state.WorkerConfig.Merge(pwc.Config)
	state.Files = append(state.Files, pwc.Files...)

	return nil
}

func (p *AzureProvider) UseCachedRun(run *run.State) error {
	return nil
}

func (p *AzureProvider) SetProtocol(proto *protocol.Protocol) {
	p.proto = proto
}

func (p *AzureProvider) checkTerminationTime() bool {
	evts, err := p.metadataService.queryScheduledEvents()
	if err != nil {
		log.Printf("While fetching scheduled-events metadata: %v", err)
		return false
	}

	// if there are any events, let's consider that a signal we should go away
	if evts != nil && len(evts.Events) != 0 {
		log.Println("Azure Metadata Service says a maintenance event is imminent")
		if p.proto != nil && p.proto.Capable("graceful-termination") {
			p.proto.Send(protocol.Message{
				Type: "graceful-termination",
				Properties: map[string]interface{}{
					// termination generally doesn't leave time to finish
					// tasks. We prefer to have the worker exit cleanly
					// immediately, resolving tasks as
					// exception/worker-shutdown, than to allow Azure to
					// terminate the worker mid-tasks, which leaves the task
					// still "running" on the queue until the claim expires, at
					// which time it is completed as exception/claim-expired.
					// Either one results in a retry, but the first option is
					// faster and gives the user more context as to what
					// happened.
					"finish-tasks": false,
				},
			})
		}

		return true
	}

	return false
}

func (p *AzureProvider) WorkerStarted(state *run.State) error {
	p.proto.Register("shutdown", func(msg protocol.Message) {
		err := provider.RemoveWorker(state, p.workerManagerClientFactory)
		if err != nil {
			log.Printf("Shutdown error: %v\n", err)
		}
	})
	p.proto.Capabilities.Add("shutdown")
	p.proto.Capabilities.Add("graceful-termination")

	// start polling for graceful shutdown
	p.terminationTicker = time.NewTicker(30 * time.Second)
	go func() {
		for {
			<-p.terminationTicker.C
			log.Println("polling for termination-time")
			// NOTE: the first call to this method may take up to 120s:
			// https://docs.microsoft.com/en-us/azure/virtual-machines/linux/scheduled-events#enabling-and-disabling-scheduled-events
			// that may lead to a "backlog" of checks, but that won't do any real harm.
			p.checkTerminationTime()
		}
	}()

	return nil
}

func (p *AzureProvider) WorkerFinished(state *run.State) error {
	p.terminationTicker.Stop()
	return nil
}

func clientFactory(rootURL string, credentials *tcclient.Credentials) (tc.WorkerManager, error) {
	prov := tcworkermanager.New(credentials, rootURL)
	return prov, nil
}

func New(runnercfg *cfg.RunnerConfig) (provider.Provider, error) {
	return new(runnercfg, nil, nil)
}

func Usage() string {
	return `
The providerType "azure" is intended for workers provisioned with worker-manager
providers using providerType "azure".  It requires

` + "```yaml" + `
provider:
    providerType: azure
` + "```" + `

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: azure
* region
`
}

func loadTaggedData(tags []Tag) *TaggedData {
	c := &TaggedData{}
	for _, tag := range tags {
		if tag.Name == "worker-pool-id" {
			c.WorkerPoolId = tag.Value
		}
		if tag.Name == "provider-id" {
			c.ProviderId = tag.Value
		}
		if tag.Name == "worker-group" {
			c.WorkerGroup = tag.Value
		}
		if tag.Name == "root-url" {
			c.RootURL = tag.Value
		}
	}
	return c
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(
	runnercfg *cfg.RunnerConfig,
	workerManagerClientFactory tc.WorkerManagerClientFactory,
	metadataService MetadataService) (*AzureProvider, error) {

	if workerManagerClientFactory == nil {
		workerManagerClientFactory = clientFactory
	}

	if metadataService == nil {
		metadataService = &realMetadataService{}
	}

	// While it's tempting to check for termination here, as is done for the AWS provider, it
	// will cause worker startup to be delayed by several minutes because the scheduled-events
	// metadata API endpoint takes that long to "start up" on its first call.
	return &AzureProvider{
		runnercfg:                  runnercfg,
		workerManagerClientFactory: workerManagerClientFactory,
		metadataService:            metadataService,
		proto:                      nil,
	}, nil
}
