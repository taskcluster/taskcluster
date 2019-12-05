package azure

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/run"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v24"
	"github.com/taskcluster/taskcluster/clients/client-go/v24/tcworkermanager"
)

type AzureProvider struct {
	runnercfg                  *cfg.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	metadataService            MetadataService
	proto                      *protocol.Protocol
	terminationTicker          *time.Ticker
}

type CustomData struct {
	WorkerPoolId string            `json:"workerPoolId"`
	ProviderId   string            `json:"providerId"`
	RootURL      string            `json:"rootUrl"`
	WorkerGroup  string            `json:"workerGroup"`
	WorkerConfig *cfg.WorkerConfig `json:"workerConfig"`
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

	customBytes, err := base64.StdEncoding.DecodeString(instanceData.Compute.CustomData)
	if err != nil {
		return fmt.Errorf("Could not read instance customData: %v", err)
	}

	customData := &CustomData{}
	err = json.Unmarshal([]byte(customBytes), customData)
	if err != nil {
		return fmt.Errorf("Could not parse customData as JSON: %v", err)
	}

	state.RootURL = customData.RootURL
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

	err = provider.RegisterWorker(
		state,
		wm,
		customData.WorkerPoolId,
		customData.ProviderId,
		customData.WorkerGroup,
		instanceData.Compute.VMID,
		workerIdentityProofMap)
	if err != nil {
		return err
	}

	providerMetadata := map[string]string{
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

	state.WorkerConfig = state.WorkerConfig.Merge(customData.WorkerConfig)

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
					// termination generally doesn't leave time to finish tasks
					"finish-tasks": false,
				},
			})
		}

		return true
	}

	return false
}

func (p *AzureProvider) WorkerStarted() error {
	// start polling for graceful shutdown
	p.terminationTicker = time.NewTicker(30 * time.Second)
	go func() {
		for {
			<-p.terminationTicker.C
			log.Println("polling for termination-time")
			p.checkTerminationTime()
		}
	}()

	return nil
}

func (p *AzureProvider) WorkerFinished() error {
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

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/reference/core/worker-manager/)
defined by this provider has the following fields:

* cloud: azure
* region
`
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

	p := &AzureProvider{
		runnercfg:                  runnercfg,
		workerManagerClientFactory: workerManagerClientFactory,
		metadataService:            metadataService,
		proto:                      nil,
	}

	if p.checkTerminationTime() {
		return nil, errors.New("Instance is about to shutdown")
	}

	return p, nil
}
