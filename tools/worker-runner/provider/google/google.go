package google

import (
	"fmt"
	"strings"

	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

type GoogleProvider struct {
	runnercfg                  *cfg.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	metadataService            MetadataService
	proto                      *workerproto.Protocol
	workerIdentityProof        map[string]interface{}
}

func (p *GoogleProvider) ConfigureRun(state *run.State) error {
	state.Lock()
	defer state.Unlock()

	workerID, err := p.metadataService.queryMetadata("/instance/id")
	if err != nil {
		return fmt.Errorf("Could not query metadata: %v", err)
	}

	userData, err := p.metadataService.queryUserData()
	if err != nil {
		return fmt.Errorf("Could not query user data: %v", err)
	}

	state.RootURL = userData.RootURL
	state.ProviderID = userData.ProviderID
	state.WorkerPoolID = userData.WorkerPoolID
	state.WorkerGroup = userData.WorkerGroup
	state.WorkerID = workerID

	providerMetadata := map[string]interface{}{
		"instance-id": workerID,
	}
	for _, f := range []struct {
		name string
		path string
	}{
		{"project-id", "/project/project-id"},
		{"image", "/instance/image"},
		{"instance-type", "/instance/machine-type"},
		{"zone", "/instance/zone"},
		{"public-hostname", "/instance/hostname"},
		{"public-ipv4", "/instance/network-interfaces/0/access-configs/0/external-ip"},
		{"local-ipv4", "/instance/network-interfaces/0/ip"},
	} {
		value, err := p.metadataService.queryMetadata(f.path)
		if err != nil {
			return fmt.Errorf("Error querying GCE metadata %v: %v", f.path, err)
		}
		providerMetadata[f.name] = value
	}

	// post process the `zone` value into just the zone name, and the region name
	// region is available as availability-zone minus the final letter
	zone := providerMetadata["zone"].(string)
	zone = zone[strings.LastIndexByte(zone, byte('/'))+1:]
	providerMetadata["zone"] = zone
	providerMetadata["region"] = zone[:len(zone)-2]

	state.WorkerLocation = map[string]string{
		"cloud":  "google",
		"region": providerMetadata["region"].(string),
		"zone":   providerMetadata["zone"].(string),
	}

	state.ProviderMetadata = providerMetadata

	// the worker identity
	proofPath := fmt.Sprintf("/instance/service-accounts/default/identity?audience=%s&format=full", userData.RootURL)
	proofToken, err := p.metadataService.queryMetadata(proofPath)
	if err != nil {
		return err
	}

	p.workerIdentityProof = map[string]interface{}{
		"token": interface{}(proofToken),
	}

	return nil
}

func (p *GoogleProvider) GetWorkerIdentityProof() (map[string]interface{}, error) {
	return p.workerIdentityProof, nil
}

func (p *GoogleProvider) UseCachedRun(run *run.State) error {
	return nil
}

func (p *GoogleProvider) SetProtocol(proto *workerproto.Protocol) {
	p.proto = proto
}

func (p *GoogleProvider) WorkerStarted(state *run.State) error {
	p.proto.AddCapability("graceful-termination")

	return nil
}

func (p *GoogleProvider) WorkerFinished(state *run.State) error {
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
The providerType "google" is intended for workers provisioned with worker-manager
providers using providerType "google".  It requires

` + "```yaml" + `
provider:
    providerType: google
` + "```" + `

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: google
* region
* zone
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(runnercfg *cfg.RunnerConfig, workerManagerClientFactory tc.WorkerManagerClientFactory, metadataService MetadataService) (*GoogleProvider, error) {
	if workerManagerClientFactory == nil {
		workerManagerClientFactory = clientFactory
	}
	if metadataService == nil {
		metadataService = &realMetadataService{}
	}
	return &GoogleProvider{
		runnercfg:                  runnercfg,
		workerManagerClientFactory: workerManagerClientFactory,
		metadataService:            metadataService,
		proto:                      nil,
	}, nil
}
