package google

import (
	"errors"
	"fmt"
	"log"
	"strings"

	tcclient "github.com/taskcluster/taskcluster/v95/clients/client-go"
	"github.com/taskcluster/taskcluster/v95/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v95/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v95/tools/worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v95/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v95/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v95/tools/workerproto"
)

const TERMINATION_PATH = "/instance/preempted"

type GoogleProvider struct {
	runnercfg                  *cfg.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	metadataService            MetadataService
	proto                      *workerproto.Protocol
	workerIdentityProof        map[string]any
	terminationMsgSent         bool
}

func (p *GoogleProvider) ConfigureRun(state *run.State) error {
	state.Lock()
	defer state.Unlock()

	workerID, err := p.metadataService.queryMetadata("/instance/id")
	if err != nil {
		return fmt.Errorf("could not query metadata: %v", err)
	}

	userData, err := p.metadataService.queryUserData()
	if err != nil {
		return fmt.Errorf("could not query user data: %v", err)
	}

	state.RootURL = userData.RootURL
	state.ProviderID = userData.ProviderID
	state.WorkerPoolID = userData.WorkerPoolID
	state.WorkerGroup = userData.WorkerGroup
	state.WorkerID = workerID

	providerMetadata := map[string]any{
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
			return fmt.Errorf("error querying GCE metadata %v: %v", f.path, err)
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

	p.workerIdentityProof = map[string]any{
		"token": any(proofToken),
	}

	return nil
}

func (p *GoogleProvider) GetWorkerIdentityProof() (map[string]any, error) {
	return p.workerIdentityProof, nil
}

func (p *GoogleProvider) UseCachedRun(run *run.State) error {
	return nil
}

func (p *GoogleProvider) SetProtocol(proto *workerproto.Protocol) {
	p.proto = proto
}

func (p *GoogleProvider) checkTerminationTime() bool {
	value, err := p.metadataService.queryMetadata(TERMINATION_PATH + "?wait_for_change=true")
	// if the file exists and contains TRUE, it's time to go away
	if err == nil && value == "TRUE" {
		log.Println("GCP Metadata Service says termination is imminent")
		if p.proto != nil && p.proto.Capable("graceful-termination") && !p.terminationMsgSent {
			log.Println("Sending graceful-termination request with finish-tasks=false")
			p.proto.Send(workerproto.Message{
				Type: "graceful-termination",
				Properties: map[string]any{
					// preemption generally doesn't leave time to finish tasks
					"finish-tasks": false,
				},
			})
			p.terminationMsgSent = true
		}
		return true
	}
	return false
}

func (p *GoogleProvider) WorkerStarted(state *run.State) error {
	p.proto.AddCapability("graceful-termination")

	go func() {
		for {
			log.Println("polling for termination-time")
			p.checkTerminationTime()
		}
	}()

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
	if value, err := metadataService.queryMetadata(TERMINATION_PATH); err == nil && value == "TRUE" {
		return nil, errors.New("instance is about to shutdown")
	}
	return &GoogleProvider{
		runnercfg:                  runnercfg,
		workerManagerClientFactory: workerManagerClientFactory,
		metadataService:            metadataService,
		proto:                      nil,
	}, nil
}
