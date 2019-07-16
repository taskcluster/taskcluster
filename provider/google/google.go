package google

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v14"
	"github.com/taskcluster/taskcluster/clients/client-go/v14/tcworkermanager"
)

type GoogleProvider struct {
	runnercfg                  *runner.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	metadataService            MetadataService
	proto                      *protocol.Protocol

	credsExpire      tcclient.Time
	credsExpireTimer *time.Timer
}

func (p *GoogleProvider) ConfigureRun(run *runner.Run) error {
	instanceID, err := p.metadataService.queryMetadata("/instance/id")
	if err != nil {
		return fmt.Errorf("Could not query metadata: %v", err)
	}

	run.WorkerID = instanceID

	userData, err := p.metadataService.queryUserData()
	if err != nil {
		return fmt.Errorf("Could not query user data: %v", err)
	}

	run.RootURL = userData.RootURL
	run.WorkerPoolID = userData.WorkerPoolID
	run.WorkerGroup = userData.WorkerGroup

	// the worker identity
	proofPath := fmt.Sprintf("/instance/service-accounts/default/identity?audience=%s&format=full", userData.RootURL)
	proofToken, err := p.metadataService.queryMetadata(proofPath)
	if err != nil {
		return err
	}

	workerIdentityProofMap := map[string]interface{}{"token": interface{}(proofToken)}
	workerIdentityProof, err := json.Marshal(workerIdentityProofMap)
	if err != nil {
		return err
	}

	// We need a worker manager client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	wm, err := p.workerManagerClientFactory(run.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create worker manager client: %v", err)
	}

	reg, err := wm.RegisterWorker(&tcworkermanager.RegisterWorkerRequest{
		WorkerPoolID:        userData.WorkerPoolID,
		ProviderID:          userData.ProviderID,
		WorkerGroup:         userData.WorkerGroup,
		WorkerID:            instanceID,
		WorkerIdentityProof: json.RawMessage(workerIdentityProof),
	})
	if err != nil {
		return fmt.Errorf("Could not register worker: %v", err)
	}

	run.Credentials.ClientID = reg.Credentials.ClientID
	run.Credentials.AccessToken = reg.Credentials.AccessToken
	run.Credentials.Certificate = reg.Credentials.Certificate

	p.credsExpire = reg.Expires

	providerMetadata := map[string]string{
		"instance-id": instanceID,
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
	zone := providerMetadata["zone"]
	zone = zone[strings.LastIndexByte(zone, byte('/'))+1:]
	providerMetadata["zone"] = zone
	providerMetadata["region"] = zone[:len(zone)-1]

	run.ProviderMetadata = providerMetadata

	return nil
}

func (p *GoogleProvider) SetProtocol(proto *protocol.Protocol) {
	p.proto = proto
}

func (p *GoogleProvider) WorkerStarted() error {
	// gracefully terminate the worker when the credentials expire
	untilExpire := time.Until(time.Time(p.credsExpire))
	p.credsExpireTimer = time.AfterFunc(untilExpire-30*time.Second, func() {
		if p.proto != nil && p.proto.Capable("graceful-termination") {
			log.Println("Taskcluster Credentials are expiring in 30s; stopping worker")
			p.proto.Send(protocol.Message{
				Type: "graceful-termination",
				Properties: map[string]interface{}{
					// credentials are expiring, so no time to shut down..
					"finish-tasks": false,
				},
			})
		}
	})
	return nil
}

func (p *GoogleProvider) WorkerFinished() error {
	if p.credsExpireTimer != nil {
		p.credsExpireTimer.Stop()
		p.credsExpireTimer = nil
	}
	return nil
}

func clientFactory(rootURL string, credentials *tcclient.Credentials) (tc.WorkerManager, error) {
	prov := tcworkermanager.New(credentials, rootURL)
	return prov, nil
}

func New(runnercfg *runner.RunnerConfig) (provider.Provider, error) {
	return new(runnercfg, nil, nil)
}

func Usage() string {
	return `
The providerType "google" is intended for workers provisioned with worker-manager
providers using providerType "google".  It requires

	provider:
		providerType: google
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(runnercfg *runner.RunnerConfig, workerManagerClientFactory tc.WorkerManagerClientFactory, metadataService MetadataService) (*GoogleProvider, error) {
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
