package awsprovisioner

import (
	"fmt"
	"log"
	"strings"
	"time"

	tcclient "github.com/taskcluster/taskcluster/clients/client-go/v14"
	"github.com/taskcluster/taskcluster/clients/client-go/v14/tcawsprovisioner"
	"github.com/taskcluster/taskcluster-worker-runner/protocol"
	"github.com/taskcluster/taskcluster-worker-runner/provider/provider"
	"github.com/taskcluster/taskcluster-worker-runner/runner"
	"github.com/taskcluster/taskcluster-worker-runner/tc"
)

type AwsProvisionerProvider struct {
	runnercfg                   *runner.RunnerConfig
	awsProvisionerClientFactory tc.AwsProvisionerClientFactory
	metadataService             MetadataService
	proto                       *protocol.Protocol
	terminationTicker           *time.Ticker
}

func (p *AwsProvisionerProvider) ConfigureRun(run *runner.Run) error {
	// create an unauthenticated aws provisioner client to get the "secret"
	_, err := p.awsProvisionerClientFactory("foo", nil)
	if err != nil {
		return err
	}

	userData, err := p.metadataService.queryUserData()
	if err != nil {
		// if we can't read user data, this is a serious problem
		return fmt.Errorf("Could not query user data: %v", err)
	}
	run.RootURL = userData.TaskclusterRootURL

	// We need an AWS Provisioner client for fetching taskcluster credentials.
	// Ensure auth is disabled in client, since we don't have credentials yet.
	awsprov, err := p.awsProvisionerClientFactory(run.RootURL, nil)
	if err != nil {
		return fmt.Errorf("Could not create AWS provisioner client: %v", err)
	}

	secToken, getErr := awsprov.GetSecret(userData.SecurityToken)
	// remove secrets even if we couldn't retrieve them!
	removeErr := awsprov.RemoveSecret(userData.SecurityToken)
	if getErr != nil {
		// serious error
		return fmt.Errorf("Could not fetch credentials from AWS Provisioner: %v", getErr)
	}
	if removeErr != nil {
		// security risk if we can't delete secret, so return err
		return fmt.Errorf("Could not delete credentials for worker in AWS Provisioner: %v", removeErr)
	}

	run.Credentials.ClientID = secToken.Credentials.ClientID
	run.Credentials.AccessToken = secToken.Credentials.AccessToken
	run.Credentials.Certificate = secToken.Credentials.Certificate

	// aws-provisioner still speaks of provisionerID/workerType
	run.WorkerPoolID = fmt.Sprintf("%s/%s", userData.ProvisionerID, userData.WorkerType)

	run.WorkerGroup = userData.Region

	run.WorkerConfig = run.WorkerConfig.Merge(userData.Data.Config)

	// aws-provisioner includes capacity in the userdata, but we would like to reflect
	// that as worker config instead.  For compatibility, we just do this when it is
	// not 1
	if userData.Capacity != 1 {
		run.WorkerConfig, err = run.WorkerConfig.Set("capacity", userData.Capacity)
		if err != nil {
			return fmt.Errorf("Could not set workerConfig capacity: %v", err)
		}
	}

	awsMetadata := map[string]string{}
	for _, path := range []string{
		"/meta-data/ami-id",
		"/meta-data/instance-id",
		"/meta-data/instance-type",
		"/meta-data/public-ipv4",
		"/meta-data/placement/availability-zone",
		"/meta-data/public-hostname",
		"/meta-data/local-ipv4",
	} {
		key := path[strings.LastIndex(path, "/")+1:]
		value, err := p.metadataService.queryMetadata(path)
		if err != nil {
			// not being able to read metadata is serious error
			return fmt.Errorf("Error querying AWS metadata %v: %v", path, err)
		}
		awsMetadata[key] = value
	}

	// region is available as availability-zone minus the final letter
	az := awsMetadata["availability-zone"]
	awsMetadata["region"] = az[:len(az)-1]

	run.WorkerID = awsMetadata["instance-id"]
	run.ProviderMetadata = awsMetadata

	// As a special case, set the shutdown behavior configuration specifically
	// for docker-worker on AWS.  In future this should be set in the worker
	// pool config.
	if p.runnercfg.WorkerImplementation.Implementation == "docker-worker" {
		run.WorkerConfig, err = run.WorkerConfig.Set("shutdown.enabled", true)
		if err != nil {
			return fmt.Errorf("Could not set shutdown.enabled: %v", err)
		}
		run.WorkerConfig, err = run.WorkerConfig.Set("shutdown.afterIdleSeconds", 15*60)
		if err != nil {
			return fmt.Errorf("Could not set shutdown.afterIdleSeconds: %v", err)
		}
	}

	return nil
}

func (p *AwsProvisionerProvider) SetProtocol(proto *protocol.Protocol) {
	p.proto = proto
}

func (p *AwsProvisionerProvider) checkTerminationTime() {
	_, err := p.metadataService.queryMetadata("/meta-data/spot/termination-time")
	// if the file exists (so, no error), it's time to go away
	if err == nil {
		log.Println("EC2 Metadata Service says termination is imminent")
		if p.proto.Capable("graceful-termination") {
			p.proto.Send(protocol.Message{
				Type: "graceful-termination",
				Properties: map[string]interface{}{
					// spot termination generally doesn't leave time to finish tasks
					"finish-tasks": false,
				},
			})
		}
	}
}

func (p *AwsProvisionerProvider) WorkerStarted() error {
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

func (p *AwsProvisionerProvider) WorkerFinished() error {
	p.terminationTicker.Stop()
	return nil
}

func clientFactory(rootURL string, credentials *tcclient.Credentials) (tc.AwsProvisioner, error) {
	prov := tcawsprovisioner.New(credentials)
	prov.BaseURL = tcclient.BaseURL(rootURL, "aws-provisioner", "v1")
	return prov, nil
}

func New(runnercfg *runner.RunnerConfig) (provider.Provider, error) {
	return new(runnercfg, nil, nil)
}

func Usage() string {
	return `
The providerType "aws-provisioner" is intended for workers provisioned with
the legacy aws-provisioner application.  It requires 

	provider:
	    providerType: aws-provisioner
`
}

// New takes its dependencies as optional arguments, allowing injection of fake dependencies for testing.
func new(runnercfg *runner.RunnerConfig, awsProvisionerClientFactory tc.AwsProvisionerClientFactory, metadataService MetadataService) (*AwsProvisionerProvider, error) {
	if awsProvisionerClientFactory == nil {
		awsProvisionerClientFactory = clientFactory
	}
	if metadataService == nil {
		metadataService = &realMetadataService{}
	}
	return &AwsProvisionerProvider{
		runnercfg:                   runnercfg,
		awsProvisionerClientFactory: awsProvisionerClientFactory,
		metadataService:             metadataService,
		proto:                       nil,
		terminationTicker:           nil,
	}, nil
}
