package aws

import (
	"errors"
	"fmt"
	"log"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v50/clients/client-go"
	"github.com/taskcluster/taskcluster/v50/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/cfg"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/run"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/tc"
	"github.com/taskcluster/taskcluster/v50/tools/workerproto"
)

const TERMINATION_PATH = "/meta-data/spot/termination-time"

type AWSProvider struct {
	runnercfg                  *cfg.RunnerConfig
	workerManagerClientFactory tc.WorkerManagerClientFactory
	metadataService            MetadataService
	proto                      *workerproto.Protocol
	workerIdentityProof        map[string]interface{}
	terminationTicker          *time.Ticker
}

func (p *AWSProvider) ConfigureRun(state *run.State) error {
	state.Lock()
	defer state.Unlock()

	userData, err := p.metadataService.queryUserData()
	if err != nil {
		return fmt.Errorf("Could not query user data: %v", err)
	}

	iid_string, iid_json, err := p.metadataService.queryInstanceIdentityDocument()
	if err != nil {
		return fmt.Errorf("Could not query instance identity document: %v", err)
	}

	instanceIdentityDocumentSignature, err := p.metadataService.queryMetadata("/dynamic/instance-identity/signature")
	if err != nil {
		return fmt.Errorf("Could not query signature for the instance identity document: %v", err)
	}

	state.RootURL = userData.RootURL
	state.ProviderID = userData.ProviderId
	state.WorkerPoolID = userData.WorkerPoolId
	state.WorkerGroup = userData.WorkerGroup
	state.WorkerID = iid_json.InstanceId

	state.WorkerLocation = map[string]string{
		"cloud":            "aws",
		"availabilityZone": iid_json.AvailabilityZone,
		"region":           iid_json.Region,
	}

	publicHostname, err := p.metadataService.queryMetadata("/meta-data/public-hostname")
	if err != nil {
		return err
	}

	publicIp, err := p.metadataService.queryMetadata("/meta-data/public-ipv4")
	if err != nil {
		return err
	}

	providerMetadata := map[string]interface{}{
		"instance-id":       iid_json.InstanceId,
		"image":             iid_json.ImageId,
		"instance-type":     iid_json.InstanceType,
		"region":            iid_json.Region,
		"availability-zone": iid_json.AvailabilityZone,
		"local-ipv4":        iid_json.PrivateIp,
		"public-hostname":   publicHostname,
		"public-ipv4":       publicIp,
	}

	state.ProviderMetadata = providerMetadata

	p.workerIdentityProof = map[string]interface{}{
		"document":  interface{}(iid_string),
		"signature": interface{}(instanceIdentityDocumentSignature),
	}

	return nil
}

func (p *AWSProvider) GetWorkerIdentityProof() (map[string]interface{}, error) {
	return p.workerIdentityProof, nil
}

func (p *AWSProvider) UseCachedRun(run *run.State) error {
	return nil
}

func (p *AWSProvider) SetProtocol(proto *workerproto.Protocol) {
	p.proto = proto
}

func (p *AWSProvider) checkTerminationTime() bool {
	_, err := p.metadataService.queryMetadata(TERMINATION_PATH)
	// if the file exists (so, no error), it's time to go away
	if err == nil {
		log.Println("EC2 Metadata Service says termination is imminent")
		if p.proto != nil && p.proto.Capable("graceful-termination") {
			p.proto.Send(workerproto.Message{
				Type: "graceful-termination",
				Properties: map[string]interface{}{
					// spot termination generally doesn't leave time to finish tasks
					"finish-tasks": false,
				},
			})
		}
		return true
	}
	return false
}

func (p *AWSProvider) WorkerStarted(state *run.State) error {
	// start polling for graceful shutdown
	p.terminationTicker = time.NewTicker(30 * time.Second)
	p.proto.AddCapability("graceful-termination")

	go func() {
		for {
			<-p.terminationTicker.C
			log.Println("polling for termination-time")
			p.checkTerminationTime()
		}
	}()

	return nil
}

func (p *AWSProvider) WorkerFinished(state *run.State) error {
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
The providerType "aws" is intended for workers provisioned with worker-manager
providers using providerType "aws".  It requires

` + "```yaml" + `
provider:
    providerType: aws
` + "```" + `

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: aws
* region
* availabilityZone
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(
	runnercfg *cfg.RunnerConfig,
	workerManagerClientFactory tc.WorkerManagerClientFactory,
	metadataService MetadataService) (*AWSProvider, error) {

	if workerManagerClientFactory == nil {
		workerManagerClientFactory = clientFactory
	}

	if metadataService == nil {
		metadataService = &realMetadataService{}
	}

	if _, err := metadataService.queryMetadata(TERMINATION_PATH); err == nil {
		return nil, errors.New("Instance is about to shutdown")
	}

	return &AWSProvider{
		runnercfg:                  runnercfg,
		workerManagerClientFactory: workerManagerClientFactory,
		metadataService:            metadataService,
		proto:                      nil,
	}, nil
}
